require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sizeOf = require('image-size');

const { getFileIcon, EXT_ICON } = require('./frontend/utils.js');

const app = express();
// Read from .env
const PORT = process.env.PORT;
const envStoragePath = process.env.STORAGE_PATH;
const STORAGE_ROOT = path.resolve(__dirname, envStoragePath);
const JELLYFIN_URL = process.env.JELLYFIN_URL
const JELLYFIN_API_KEY = process.env.API_KEY
const AUDIT_LOG_FILE = path.join(__dirname, 'jellybeans-audit.log');

// --- Poster Resolution Variables ---
const POSTER_WIDTH = 1000;
const POSTER_HEIGHT = 1500;

// Needed to read the login form data
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.json({ limit: '20mb' }));
app.use(express.static('frontend', { index: false }));

// Setup Sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false
}));

// 2. MIDDLEWARES (Login & Anti-Hopping)
// Middleware: Require Login
const reqLogin = (req, res, next) => {
  if (req.session.loggedIn) {
    return next();
  }
  res.redirect('/login.html');
};

// Middleware: Prevent URL Hopping
const preventUrlHopping = (req, res, next) => {
  // Always allow the root explorer view
  if (req.path === '/' || req.path === '') {
    return next();
  }

  // If accessing a deeper folder, check if they clicked a link from our GUI to get here
  const referer = req.headers.referer;
  if (!referer || !referer.includes(req.get('host'))) {
    console.log("Blocked URL Hop attempt to:", req.path);
    return res.redirect('/explorer/');
  }

  next();
};

function authenticateUser(username, password) {
  try {
    const usersFilePath = path.join(__dirname, '.users');
    if (!fs.existsSync(usersFilePath)) {
      console.warn('⚠️ .users file not found! Please create it in the root directory.');
      return false;
    }

    const data = fs.readFileSync(usersFilePath, 'utf8');
    const lines = data.split('\n');

    for (let line of lines) {
      line = line.trim();
      // Skip empty lines or comments
      if (!line || line.startsWith('#')) continue;

      // Split by whitespace. If passwords can contain spaces, we split at the first space.
      const firstSpaceIndex = line.indexOf(' ');
      if (firstSpaceIndex === -1) continue;

      const u = line.substring(0, firstSpaceIndex).trim();
      const p = line.substring(firstSpaceIndex + 1).trim();

      if (u === username && p === password) {
        return true;
      }
    }
  } catch (err) {
    console.error('Error reading .users file:', err);
  }

  return false;
}

function logActivity(req, action, details) {
  const timestamp = new Date().toISOString();
  const user = req?.session?.username || 'system';
  const ip = req?.ip || 'unknown';
  const logEntry = JSON.stringify({ timestamp, user, action, details }) + '\n';

  fs.appendFile(AUDIT_LOG_FILE, logEntry, (err) => {
    if (err) console.error("[Audit Log Error]", err);
  });
}

// --- Word Wrap Utility ---
function wordWrap(text, maxCharsPerLine) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= maxCharsPerLine) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// 3. STORAGE CONFIGURATION
if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetPath = req.body.targetPath || '';
    const uploadDir = path.join(STORAGE_ROOT, targetPath);

    if (!uploadDir.startsWith(STORAGE_ROOT)) {
      return cb(new Error('Invalid path'), '');
    }

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const cleanOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const originalExt = path.extname(cleanOriginalName);

    let finalName;
    if (req.body.customName && req.body.customName.trim() !== '') {
      finalName = req.body.customName;
      if (originalExt && !finalName.toLowerCase().endsWith(originalExt.toLowerCase())) {
        finalName += originalExt;
      }
    } else {
      finalName = cleanOriginalName;
    }
    cb(null, finalName);
  }
});

const upload = multer({ storage });

// 4. ROUTES
// --- Auth Routes ---
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (authenticateUser(username, password)) {
    req.session.loggedIn = true;
    req.session.username = username;
    logActivity(req, 'login', { name: username });
    res.redirect('/explorer/');
  } else {
    res.send('<div style="text-align:center; margin-top:2rem; font-family:sans-serif;">Invalid credentials. <a href="/login.html">Try again</a></div>');
  }
});

app.get('/logout', (req, res) => {
  logActivity(req, 'logout', { name: req.session.username });
  req.session.destroy();
  res.redirect('/login.html');
});

app.get('/api/login-posters', async (req, res) => {
  try {
    // Fetch up to 50 movies/series that specifically have primary images
    const response = await fetch(`${JELLYFIN_URL}/Items?api_key=${JELLYFIN_API_KEY}&Recursive=true&IncludeItemTypes=Movie,Series&ImageTypes=Primary&Limit=50`);

    if (!response.ok) throw new Error('Jellyfin fetch failed');
    const data = await response.json();

    if (!data || !data.Items) return res.json([]);

    // Map the results to direct image URLs
    const posters = data.Items
      .filter(item => item.ImageTags && item.ImageTags.Primary)
      .map(item => `${JELLYFIN_URL}/Items/${item.Id}/Images/Primary?fillWidth=300&quality=80`);

    res.json(posters);
  } catch (err) {
    console.error('[Login Posters Error]', err.message);
    res.json([]); // Fail silently so the login page still works if Jellyfin is down
  }
});


// --- API Routes for File Management ---
app.post('/api/delete', reqLogin, (req, res) => {
  const targetPath = req.body.path || '';
  const fullPath = path.join(STORAGE_ROOT, targetPath);

  if (!fullPath.startsWith(STORAGE_ROOT) || !fs.existsSync(fullPath)) return res.status(403).send('Forbidden');

  try {
    fs.unlinkSync(fullPath);
    logActivity(req, 'delete', { path: targetPath });
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send('Error deleting file');
  }
});

app.post('/api/rename', reqLogin, (req, res) => {
  const targetPath = req.body.path || '';
  const newName = req.body.newName || '';
  if (!newName) return res.status(400).send('Name required');

  const fullPath = path.join(STORAGE_ROOT, targetPath);
  const newFullPath = path.join(path.dirname(fullPath), newName);

  if (!fullPath.startsWith(STORAGE_ROOT) || !newFullPath.startsWith(STORAGE_ROOT) || !fs.existsSync(fullPath)) {
    return res.status(403).send('Forbidden');
  }

  try {
    fs.renameSync(fullPath, newFullPath);
    logActivity(req, 'rename', { old: targetPath, new: newName });
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send('Error renaming file');
  }
});

app.post('/api/mkdir', reqLogin, (req, res) => {
  const targetPath = req.body.path || '';
  const newName = req.body.name || '';
  if (!newName) return res.status(400).send('Name required');

  const fullPath = path.join(STORAGE_ROOT, targetPath, newName);

  if (!fullPath.startsWith(STORAGE_ROOT)) {
    return res.status(403).send('Forbidden');
  }

  try {
    if (!fs.existsSync(fullPath))
      fs.mkdirSync(fullPath);
    logActivity(req, 'mkdir', { path: path.join(targetPath, newName) });
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send('Error creating folder');
  }
});

app.post('/api/list-dirs', reqLogin, async (req, res) => {
  const targetPath = req.body.path || '';
  const fullDir = path.join(STORAGE_ROOT, targetPath);

  if (!fullDir.startsWith(STORAGE_ROOT)) return res.status(403).send('Forbidden');

  try {
    let items = await fs.promises.readdir(fullDir, { withFileTypes: true });
    let dirs = items.filter(i => i.isDirectory()).map(i => i.name).sort((a, b) => a.localeCompare(b));
    res.json({ currentPath: targetPath, dirs });
  } catch (err) {
    res.status(500).send('Error reading directories');
  }
});

app.post('/api/move', reqLogin, (req, res) => {
  const oldPath = req.body.path || '';
  const newPath = req.body.newPath || '';
  if (!oldPath || !newPath) return res.status(400).send('Paths required');

  const fullOldPath = path.join(STORAGE_ROOT, oldPath);
  const fullNewPath = path.join(STORAGE_ROOT, newPath);

  if (!fullOldPath.startsWith(STORAGE_ROOT) || !fullNewPath.startsWith(STORAGE_ROOT) || !fs.existsSync(fullOldPath)) {
    return res.status(403).send('Forbidden');
  }

  if (fs.existsSync(fullNewPath)) {
    return res.status(409).send('Conflict');
  }

  try {
    fs.renameSync(fullOldPath, fullNewPath);
    logActivity(req, 'move', { old: oldPath, new: newPath });
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send('Error moving file');
  }
});

app.post('/api/copy', reqLogin, (req, res) => {
  const oldPath = req.body.path || '';
  const newPath = req.body.newPath || '';
  if (!oldPath || !newPath) return res.status(400).send('Paths required');

  const fullOldPath = path.join(STORAGE_ROOT, oldPath);
  const fullNewPath = path.join(STORAGE_ROOT, newPath);

  // Security checks
  if (!fullOldPath.startsWith(STORAGE_ROOT) || !fullNewPath.startsWith(STORAGE_ROOT) || !fs.existsSync(fullOldPath)) {
    return res.status(403).send('Forbidden');
  }

  // File conflict check
  if (fs.existsSync(fullNewPath)) {
    return res.status(409).send('Conflict');
  }

  try {
    fs.copyFileSync(fullOldPath, fullNewPath); // Real copy, not a symlink
    logActivity(req, 'copy', { old: oldPath, new: newPath });
    res.sendStatus(200);
  } catch (err) {
    console.error("Copy Error: ", err);
    res.status(500).send('Error copying file');
  }
});

app.get('/api/search', reqLogin, async (req, res) => {
  const query = (req.query.q || '').toLowerCase();
  if (!query) return res.json([]);

  try {
    const results = [];

    async function scanDir(currentDir) {
      const items = await fs.promises.readdir(currentDir, { withFileTypes: true });

      for (const item of items) {
        const fileName = item.name.toLowerCase();

        // Skip hidden/system files
        if (fileName.endsWith('-poster.jpg') || fileName.endsWith('.nfo') || fileName.endsWith('.bif')) continue;

        const itemPath = path.join(currentDir, item.name);
        const relPath = path.relative(STORAGE_ROOT, itemPath).replace(/\\/g, '/');

        if (fileName.includes(query)) {
          let fileSize = 0, fileMtime = 0;
          try {
            const stat = fs.statSync(itemPath);
            fileSize = stat.size;
            fileMtime = stat.mtimeMs;
          } catch (e) { }

          results.push({
            name: item.name,
            path: relPath,
            isDir: item.isDirectory(),
            size: fileSize,
            mtime: fileMtime
          });
        }

        if (item.isDirectory()) {
          await scanDir(itemPath);
        }
      }
    }

    await scanDir(STORAGE_ROOT);

    results.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json(results);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// --- Activity Log Routes ---
app.get('/api/audit', reqLogin, async (req, res) => {
  try {
    if (!fs.existsSync(AUDIT_LOG_FILE)) return res.json([]);

    const content = await fs.promises.readFile(AUDIT_LOG_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line);

    // Parse JSON and reverse so the newest events are at the top
    const logs = lines.map(line => {
      try { return JSON.parse(line); } catch (e) { return null; }
    }).filter(l => l).reverse();

    res.json(logs);
  } catch (err) {
    console.error("Failed to read logs:", err);
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

app.get('/activity', reqLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'activity.html'));
});

app.get(['/api/info/', '/api/info/*requestedPath'], reqLogin, async (req, res) => {
  let requestedPath = req.params.requestedPath || '';
  if (Array.isArray(requestedPath)) requestedPath = requestedPath.join('/');

  const fullPath = path.join(STORAGE_ROOT, requestedPath);
  if (!fullPath.startsWith(STORAGE_ROOT) || !fs.existsSync(fullPath)) return res.status(404).send('Not found');

  try {
    const stats = fs.statSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase().slice(1);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    let info = {
      name: path.basename(fullPath),
      size: `${sizeMB} MB`,
      date: stats.mtime.toLocaleString()
    };

    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
      try {
        const dimensions = sizeOf(fullPath);
        info.dimensions = `${dimensions.width} x ${dimensions.height}`;
      } catch (e) { }
    }

    if (['txt', 'md', 'csv', 'srt'].includes(ext) && stats.size < 5 * 1024 * 1024) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        info.words = content.trim().split(/\s+/).length;
      } catch (e) { }
    }

    res.json(info);
  } catch (err) {
    res.status(500).send('Error getting info');
  }
});

// --- Home Redirect ---
app.get('/', reqLogin, (req, res) => {
  res.redirect('/explorer/');
});

app.post('/upload', reqLogin, upload.array('myFile'), (req, res) => {
  const targetPath = req.body.targetPath || '';
  const uploadedFiles = req.files.map(f => f.filename);
  if (uploadedFiles.length > 0) {
    logActivity(req, 'upload', { path: targetPath, files: uploadedFiles });
  }
  res.redirect(`/explorer/${targetPath}`);
});

// --- File Download Handler ---
app.get(['/download/', '/download/*requestedPath'], reqLogin, (req, res) => {
  let requestedPath = req.params.requestedPath || '';
  if (Array.isArray(requestedPath)) {
    requestedPath = requestedPath.join('/');
  }

  const fullPath = path.join(STORAGE_ROOT, requestedPath);

  if (!fullPath.startsWith(STORAGE_ROOT) || !fs.existsSync(fullPath)) {
    return res.status(404).send('File not found.');
  }

  if (fs.lstatSync(fullPath).isDirectory()) {
    return res.status(400).send('Cannot download a folder.');
  }

  res.download(fullPath);
});

app.post('/api/jellyfin-titles', reqLogin, async (req, res) => {
  const paths = req.body.paths || [];
  if (!paths.length) return res.json({});

  const result = {};

  try {
    // 1. Try to fetch from Jellyfin first
    if (JELLYFIN_URL && JELLYFIN_API_KEY) {
      const response = await fetch(`${JELLYFIN_URL}/Items?api_key=${JELLYFIN_API_KEY}&Recursive=true&Fields=Path&Limit=10000`);

      if (response.ok) {
        const data = await response.json();
        if (data && data.Items) {
          const pathToItem = {};
          for (const item of data.Items) {
            if (item.Path) {
              pathToItem[item.Path] = {
                title: item.Name,
                posterUrl: `${JELLYFIN_URL}/Items/${item.Id}/Images/Primary?fillWidth=200&quality=80`
              };
            }
          }
          for (const relPath of paths) {
            const fullPath = path.join(STORAGE_ROOT, relPath);
            if (pathToItem[fullPath]) {
              result[relPath] = pathToItem[fullPath];
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Jellyfin API] Not reachable, checking local disk instead.");
  }

  // 2. Fallback: Check local disk for `-poster.jpg` files
  for (const relPath of paths) {
    const fullVideoPath = path.join(STORAGE_ROOT, relPath);
    if (!fullVideoPath.startsWith(STORAGE_ROOT)) continue;

    const posterPath = fullVideoPath.replace(/\.[^/.]+$/, "") + "-poster.jpg";

    if (fs.existsSync(posterPath)) {
      if (!result[relPath]) result[relPath] = {};

      // Point the frontend to our new local image server route
      result[relPath].posterUrl = `/api/local-poster/${encodeURIComponent(relPath)}`;

      // Give it a clean title if Jellyfin didn't provide one
      if (!result[relPath].title) {
        const fileName = path.basename(relPath);
        const lastDot = fileName.lastIndexOf('.');
        result[relPath].title = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
      }
    }
  }

  res.json(result);
});

// --- Serve Local Posters ---
app.get(['/api/local-poster/', '/api/local-poster/*requestedPath'], reqLogin, (req, res) => {
  let requestedPath = req.params.requestedPath || '';
  if (Array.isArray(requestedPath)) {
    requestedPath = requestedPath.join('/');
  }

  const fullVideoPath = path.join(STORAGE_ROOT, requestedPath);

  if (!fullVideoPath.startsWith(STORAGE_ROOT)) {
    return res.status(403).send('Forbidden');
  }

  const posterPath = fullVideoPath.replace(/\.[^/.]+$/, "") + "-poster.jpg";

  if (fs.existsSync(posterPath)) {
    res.sendFile(posterPath);
  } else {
    res.status(404).send('Poster not found');
  }
});

// --- Thumbnail Generator ---
app.post('/api/generate-thumbnail', reqLogin, async (req, res) => {
  const rawTitle = req.body.title || '';
  if (!rawTitle) return res.status(400).json({ error: 'Title required' });

  // SVG-safe title
  const title = rawTitle.replace(/[<>&"']/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c])
  );

  // Adaptive font size + chars per line calibrated for a narrower, taller canvas
  const len = rawTitle.length;
  const [fontSize, maxChars] =
    len <= 15 ? [100, 12] :
      len <= 25 ? [85, 16] :
        len <= 40 ? [70, 20] :
          len <= 60 ? [55, 26] :
            [45, 34];

  const lines = wordWrap(title, maxChars);
  const lineHeight = fontSize * 1.35;
  const totalTextH = lines.length * lineHeight;

  // Center vertically (Horizontal) and top 1/3 (Vertical) based on the new variable
  const textStartY = (POSTER_HEIGHT / 3) - (totalTextH / 2) + fontSize * 0.85;
  const centerX = POSTER_WIDTH / 2;

  try {
    let bg = '';
    const bgPath = path.join(__dirname, 'frontend', 'logo.png');

    try {
      const bgBuffer = require('fs').readFileSync(bgPath);
      const base64Bg = `data:image/png;base64,${bgBuffer.toString('base64')}`;

      // preserveAspectRatio="none" forces the image to stretch and fill the exact dimensions
      bg = `
<image href="${base64Bg}" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" preserveAspectRatio="none" />
<rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="rgba(0,0,0,0.4)"/>`;
    } catch (err) {
      console.warn('[Thumbnail] Static background missing, using fallback gradient.');
      bg = `<defs>
  <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#0f1419"/>
    <stop offset="100%" stop-color="#1a3a5c"/>
  </linearGradient>
</defs>
<rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="url(#bg)"/>`;
    }

    // Text overlay backdrop
    const padX = 60, padY = 40;
    const overlayW = POSTER_WIDTH - padX * 2;
    const overlayH = totalTextH + padY * 2;
    const overlayY = textStartY - fontSize * 0.85 - padY;

    const textEls = lines.map((line, i) => {
      const y = textStartY + i * lineHeight;
      return `  <text x="${centerX}" y="${y.toFixed(1)}" text-anchor="middle"
    font-family="system-ui,-apple-system,'Segoe UI',sans-serif"
    font-size="${fontSize}" font-weight="700" fill="white"
    style="filter:drop-shadow(0 3px 10px rgba(0,0,0,0.9))">${line}</text>`;
    }).join('\n');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${POSTER_WIDTH} ${POSTER_HEIGHT}" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}">
${bg}
<rect x="${padX}" y="${overlayY.toFixed(1)}" width="${overlayW}" height="${overlayH.toFixed(1)}"
  rx="16" fill="rgba(0,0,0,0.52)"/>
${textEls}
</svg>`;

    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);

  } catch (err) {
    console.error('[Thumbnail]', err.message);
    res.status(500).json({ error: 'Generation failed' });
  }
});

// --- Set Jellyfin Thumbnail ---
app.post('/api/set-jellyfin-thumbnail', reqLogin, async (req, res) => {
  const { path: targetPath, imageBase64 } = req.body;
  if (!targetPath || !imageBase64) return res.status(400).send('Missing data');

  try {
    // 1. Construct the absolute path to the video file
    const fullVideoPath = path.join(STORAGE_ROOT, targetPath);

    // Security check to prevent path traversal
    if (!fullVideoPath.startsWith(STORAGE_ROOT)) {
      return res.status(403).send('Forbidden');
    }

    // 2. Create the path for the local image using Jellyfin's hidden metadata convention
    const imageDiskPath = fullVideoPath.replace(/\.[^/.]+$/, "") + "-poster.jpg";

    // 3. Write the image directly to the disk
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    fs.writeFileSync(imageDiskPath, imageBuffer);
    logActivity(req, 'thumbnail', { path: targetPath });

    try {
      if (JELLYFIN_URL && JELLYFIN_API_KEY) {
        const fileName = path.basename(targetPath);
        const lastDot = fileName.lastIndexOf('.');
        let baseName = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;

        let searchName = baseName.replace(/[._()[\]{}-]/g, ' ');
        searchName = searchName.replace(/\b(1080p|720p|4k|bluray|web-dl|x264|h264|aac|rarbg|yify|brrip|bdrip|hevc|extended)\b/gi, ' ');

        let words = searchName.split(/\s+/).filter(w => w.length > 0);
        let numWordsToTake = (words.length > 0 && ['the', 'a', 'an'].includes(words[0].toLowerCase())) ? 3 : 2;
        let shortSearchTerm = words.slice(0, numWordsToTake).join(' ');

        const searchRes = await fetch(`${JELLYFIN_URL}/Items?api_key=${JELLYFIN_API_KEY}&searchTerm=${encodeURIComponent(shortSearchTerm)}&Recursive=true`);
        const searchData = await searchRes.json();

        let itemId = null;
        if (searchData && searchData.Items && searchData.Items.length > 0) {
          const match = searchData.Items.find(item => item.Path && item.Path.includes(fileName));
          itemId = match ? match.Id : searchData.Items[0].Id;
        }

        // 5. Ping Jellyfin to refresh the item so it picks up the new local .jpg
        if (itemId) {
          const refreshUrl = `${JELLYFIN_URL}/Items/${itemId}/Refresh?api_key=${JELLYFIN_API_KEY}&ImageRefreshMode=FullRefresh`;
          const refreshRes = await fetch(refreshUrl, { method: 'POST' });

          if (refreshRes.ok) {
            console.log(`[Thumbnail] Triggered Jellyfin refresh for item: ${itemId}`);
          } else {
            console.warn(`[Thumbnail] Jellyfin refresh ping failed: ${refreshRes.status}`);
          }
        }
      }
    } catch (jfError) {
      // If Jellyfin is off, missing, or unreachable, we catch the error here silently
      console.warn(`[Thumbnail] Jellyfin is not reachable, skipping refresh. (${jfError.message})`);
    }

    // Always send Success because the local image file was saved perfectly!
    res.sendStatus(200);
  } catch (err) {
    console.error('[Thumbnail Error]', err.message);
    res.status(500).send('Upload bypass failed');
  }
});

// --- Refresh Jellyfin Library ---
app.post('/api/refresh-library', reqLogin, async (req, res) => {
  try {
    if (!JELLYFIN_URL || !JELLYFIN_API_KEY) {
      return res.status(400).send('Jellyfin is not configured in .env');
    }

    // Ping Jellyfin to scan all libraries for new files and metadata
    const response = await fetch(`${JELLYFIN_URL}/Library/Refresh?api_key=${JELLYFIN_API_KEY}`, {
      method: 'POST'
    });

    if (response.ok) {
      logActivity(req, 'refresh', { target: 'Jellyfin Library' });
      res.sendStatus(200);
    } else {
      console.error(`[Jellyfin Refresh] Failed with status: ${response.status}`);
      res.status(500).send('Jellyfin API error');
    }
  } catch (err) {
    console.error('[Jellyfin Refresh Error]', err.message);
    res.status(500).send('Failed to contact Jellyfin');
  }
});

// --- Disk Space API ---
app.get('/api/disk-space', reqLogin, async (req, res) => {
  try {
    if (typeof fs.promises.statfs === 'function') {
      const stats = await fs.promises.statfs(STORAGE_ROOT);
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      const used = total - free;
      return res.json({ total, free, used });
    }
    throw new Error('statfs not available');
  } catch (err) {
    console.error('Disk space check failed:', err.message);
    res.status(500).json({ error: 'Could not determine disk space' });
  }
});

// --- Explorer UI Handler ---
app.use('/explorer', reqLogin, preventUrlHopping);
app.get(['/explorer/', '/explorer/*currentPath'], async (req, res) => {
  let currentPath = req.params.currentPath || '';
  if (Array.isArray(currentPath)) {
    currentPath = currentPath.join('/');
  }

  const fullDir = path.join(STORAGE_ROOT, currentPath);

  if (!fullDir.startsWith(STORAGE_ROOT)) {
    return res.status(403).send('Forbidden');
  }

  try {
    let items = await fs.promises.readdir(fullDir, { withFileTypes: true });

    items = items.filter(item => {
      if (item.isDirectory()) return true; // Always show folders

      const fileName = item.name.toLowerCase();
      const isHidden = fileName.endsWith('-poster.jpg') ||
        fileName.endsWith('.nfo') ||
        fileName.endsWith('.bif');

      return !isHidden;
    });

    items.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      if (!a.isDirectory() && !b.isDirectory()) {
        const iconA = getFileIcon(a.name);
        const iconB = getFileIcon(b.name);

        if (iconA !== iconB) {
          return iconA.localeCompare(iconB);
        }
      }
      return a.name.localeCompare(b.name);
    });

    const htmlItems = items.map(item => {
      const isDir = item.isDirectory();
      const icon = isDir ? '📁' : getFileIcon(item.name);
      const itemPath = path.posix.join(currentPath, item.name);

      const safePath = itemPath.replace(/'/g, "\\'").replace(/"/g, "&quot;");
      const safeName = item.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");

      const href = isDir ? `/explorer/${itemPath}` : '#';
      const onClick = isDir ? '' : `onclick="openMenu('${safePath}', '${safeName}')"`;

      // Get file stats for client-side sorting
      let fileSize = 0, fileMtime = 0;
      try {
        const stat = fs.statSync(path.join(fullDir, item.name));
        fileSize = stat.size;
        fileMtime = stat.mtimeMs;
      } catch (e) { }

      return `
        <a href="${href}" ${onClick} class="file-card" data-path="${safePath}" data-isdir="${isDir}" data-size="${fileSize}" data-mtime="${fileMtime}">
          <div class="card-checkbox"></div>
          <div class="icon">${icon}</div>
          <div class="name" dir="auto">${item.name}</div>
        </a>
      `;
    }).join('');

    let topActions = '';

    if (currentPath.length > 0) {
      const parentPath = path.posix.dirname(currentPath);
      const parentLink = parentPath === '.' ? '/explorer/' : `/explorer/${parentPath}`;
      topActions += `<a href="${parentLink}" style="text-decoration: none; padding: 0.45rem 1.2rem; background: var(--grey-3); color: var(--black); border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.4rem;">⬅️ Go Back</a>`;
    } else {
      topActions += `<a href="/logout" style="text-decoration: none; padding: 0.45rem 1.2rem; background: var(--danger-light); color: var(--danger); border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.4rem;">🏃 Logout</a>`;
    }
    topActions += `<button onclick="createFolder()" style="padding: 0.45rem 1.2rem; background: var(--blue-light); color: var(--blue); border: none; border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; font-family: var(--font);">➕ New Folder</button>`;
    topActions += `<a href="/activity" style="text-decoration: none; padding: 0.45rem 1.2rem; background: var(--grey-3); color: var(--black); border-radius: var(--radius-full); font-size: 0.85rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.4rem; font-family: var(--font);">📋 Activity Log</a>`;
    topActions += `<button onclick="refreshLibrary()" class="btn-action-primary" style="margin-left: auto; width: 34px; height: 34px; padding: 0; justify-content: center; font-size: 1.1rem;" title="Refresh Library">🔄</button>`; let htmlTemplate = fs.readFileSync(path.join(__dirname, 'frontend', 'index.html'), 'utf8');

    htmlTemplate = htmlTemplate.replaceAll('{{currentPath}}', currentPath);
    htmlTemplate = htmlTemplate.replace('{{topActions}}', topActions);
    htmlTemplate = htmlTemplate.replace('{{htmlItems}}', htmlItems);

    res.send(htmlTemplate);

  } catch (err) {
    console.error(err);
    res.status(500).send('Could not read directory.');
  }
});

// 5. START SERVER
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});