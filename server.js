require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sizeOf = require('image-size');

const app = express();
// Read from .env
const PORT = process.env.PORT;
const envStoragePath = process.env.STORAGE_PATH;
const STORAGE_ROOT = path.resolve(__dirname, envStoragePath);
const JELLYFIN_URL = process.env.JELLYFIN_URL
const JELLYFIN_API_KEY = process.env.API_KEY

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
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    req.session.loggedIn = true;
    res.redirect('/explorer/');
  } else {
    res.send('<div style="text-align:center; margin-top:2rem; font-family:sans-serif;">Invalid credentials. <a href="/login.html">Try again</a></div>');
  }
});
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login.html');
});


// --- API Routes for File Management ---
app.post('/api/delete', reqLogin, (req, res) => {
  const targetPath = req.body.path || '';
  const fullPath = path.join(STORAGE_ROOT, targetPath);

  if (!fullPath.startsWith(STORAGE_ROOT) || !fs.existsSync(fullPath)) return res.status(403).send('Forbidden');

  try {
    fs.unlinkSync(fullPath);
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
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath);
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
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send('Error moving file');
  }
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

  try {
    const response = await fetch(
      `${JELLYFIN_URL}/Items?api_key=${JELLYFIN_API_KEY}&Recursive=true&Fields=Path&Limit=10000`
    );
    if (!response.ok) throw new Error(`Jellyfin status ${response.status}`);

    const data = await response.json();
    if (!data?.Items?.length) return res.json({});

    // Build a lookup: full disk path → { title, posterUrl }
    const pathToItem = {};
    for (const item of data.Items) {
      if (item.Path) {
        pathToItem[item.Path] = {
          title: item.Name,
          posterUrl: `${JELLYFIN_URL}/Items/${item.Id}/Images/Primary?fillWidth=200&quality=80`
        };
      }
    }

    // Match each requested relative path against the full disk path
    const result = {};
    for (const relPath of paths) {
      const fullPath = path.join(STORAGE_ROOT, relPath);
      if (pathToItem[fullPath]) {
        result[relPath] = pathToItem[fullPath];
      }
    }

    res.json(result);

  } catch (err) {
    console.error("[Jellyfin API] Error:", err.message);
    res.json({});
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

  // Adaptive font size + chars per line based on title length
  const len = rawTitle.length;
  const [fontSize, maxChars] =
    len <= 15 ? [80, 15] :
      len <= 25 ? [64, 20] :
        len <= 40 ? [52, 26] :
          len <= 60 ? [42, 33] :
            [34, 42];

  const lines = wordWrap(title, maxChars);
  const lineHeight = fontSize * 1.35;
  const totalTextH = lines.length * lineHeight;
  const textStartY = (720 - totalTextH) / 2 + fontSize * 0.85;

  try {
    let bg = '';
    const bgPath = path.join(__dirname, 'frontend', 'logo.png');

    try {
      // Read static image and convert to base64 so it embeds inside the downloaded file
      const bgBuffer = require('fs').readFileSync(bgPath);
      const base64Bg = `data:image/png;base64,${bgBuffer.toString('base64')}`;

      bg = `
<image href="${base64Bg}" width="1280" height="720" preserveAspectRatio="xMidYMid slice" />
<rect width="1280" height="720" fill="rgba(0,0,0,0.4)"/> <!-- Dark overlay to make text pop -->`;
    } catch (err) {
      // Fallback gradient if the image is missing from the folder
      console.warn('[Thumbnail] Static background missing, using fallback gradient.');
      bg = `<defs>
  <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#0f1419"/>
    <stop offset="100%" stop-color="#1a3a5c"/>
  </linearGradient>
</defs>
<rect width="1280" height="720" fill="url(#bg)"/>`;
    }

    // Text overlay: pill-shaped dark backdrop that hugs the text
    const padX = 80, padY = 28;
    const overlayW = 1280 - padX * 2;
    const overlayH = totalTextH + padY * 2;
    const overlayY = textStartY - fontSize * 0.85 - padY;

    const textEls = lines.map((line, i) => {
      const y = textStartY + i * lineHeight;
      return `  <text x="640" y="${y.toFixed(1)}" text-anchor="middle"
    font-family="system-ui,-apple-system,'Segoe UI',sans-serif"
    font-size="${fontSize}" font-weight="700" fill="white"
    style="filter:drop-shadow(0 3px 10px rgba(0,0,0,0.9))">${line}</text>`;
    }).join('\n');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
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
    console.log('[Thumbnail] ① Request received. targetPath:', targetPath, '| imageBase64 present:', !!imageBase64, '| base64 length:', imageBase64?.length);

    if (!targetPath || !imageBase64) {
        console.error('[Thumbnail] ✗ Missing targetPath or imageBase64 — aborting.');
        return res.status(400).send('Missing data');
    }

    try {
        // STEP 1: Resolve the full disk path and fetch the Jellyfin library
        const fullDiskPath = path.join(STORAGE_ROOT, targetPath);
        console.log('[Thumbnail] ② Looking for file in Jellyfin. fullDiskPath:', fullDiskPath);
        console.log('[Thumbnail]    Jellyfin URL:', JELLYFIN_URL);
        console.log('[Thumbnail]    API key set:', !!JELLYFIN_API_KEY);

        const libraryRes = await fetch(
            `${JELLYFIN_URL}/Items?api_key=${JELLYFIN_API_KEY}&Recursive=true&Fields=Path&Limit=10000`
        );
        console.log('[Thumbnail] ③ Jellyfin library fetch status:', libraryRes.status);
        if (!libraryRes.ok) {
            const body = await libraryRes.text();
            console.error('[Thumbnail] ✗ Library fetch failed. Response body:', body);
            throw new Error(`Jellyfin library fetch failed (Status: ${libraryRes.status})`);
        }

        const libraryData = await libraryRes.json();
        const totalItems = libraryData?.Items?.length ?? 0;
        console.log('[Thumbnail] ④ Library returned', totalItems, 'items.');

        // Log a few sample paths to verify format matches what we're searching for
        if (totalItems > 0) {
            console.log('[Thumbnail]    Sample Jellyfin paths (first 3):');
            libraryData.Items.slice(0, 3).forEach(i => console.log('      -', i.Path));
        }

        const match = (libraryData?.Items || []).find(item => item.Path === fullDiskPath);
        if (!match) {
            console.error('[Thumbnail] ✗ No match found for:', fullDiskPath);
            console.error('[Thumbnail]   Hint: compare the sample paths above to the path being searched.');
            throw new Error(`Could not find "${path.basename(targetPath)}" in Jellyfin library`);
        }
        console.log('[Thumbnail] ⑤ Matched Jellyfin item — Id:', match.Id, '| Name:', match.Name);

        // STEP 2: Upload the JPEG to Jellyfin
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        console.log('[Thumbnail] ⑥ Uploading image. Buffer size:', imageBuffer.length, 'bytes');
        console.log('[Thumbnail]    Upload URL:', `${JELLYFIN_URL}/Items/${match.Id}/Images/Primary`);

        const uploadRes = await fetch(
            `${JELLYFIN_URL}/Items/${match.Id}/Images/Primary?api_key=${JELLYFIN_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'image/jpeg',
                    'X-Emby-Token': JELLYFIN_API_KEY,
                    'Content-Length': imageBuffer.length.toString()
                },
                body: imageBuffer
            }
        );

        console.log('[Thumbnail] ⑦ Jellyfin image upload response status:', uploadRes.status);
        if (!uploadRes.ok) {
            const errBody = await uploadRes.text();
            console.error('[Thumbnail] ✗ Jellyfin rejected the image. Response body:', errBody);
            throw new Error(`Jellyfin rejected the image (Status: ${uploadRes.status})`);
        }

        console.log('[Thumbnail] ✓ Thumbnail successfully uploaded for:', match.Name);
        res.sendStatus(200);
    } catch (err) {
        console.error('[Thumbnail] ✗ Fatal error:', err.message);
        res.status(500).send('Upload failed');
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

    const EXT_ICON = {
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️', ico: '🖼️', bmp: '🖼️', tiff: '🖼️',
      mp4: '🎞️', mkv: '🎞️', mov: '🎞️', avi: '🎞️', webm: '🎞️', flv: '🎞️', wmv: '🎞️', m4v: '🎞️', mpg: '🎞️',
      mp3: '🎵', wav: '🎵', flac: '🎵', aac: '🎵', ogg: '🎵', m4a: '🎵',
      zip: '📎', rar: '📎', tar: '📎', gz: '📎', '7z': '📎', bz2: '📎',
      exe: '⚙️', msi: '⚙️', sh: '⚙️', bat: '⚙️', cmd: '⚙️', bin: '⚙️', appimage: '⚙️', deb: '⚙️', rpm: '⚙️',
      js: '⌨️', ts: '⌨️', py: '⌨️', java: '⌨️', c: '⌨️', cpp: '⌨️', cs: '⌨️', go: '⌨️', rs: '⌨️', rb: '⌨️', php: '⌨️',
      pdf: '📄', doc: '📄', docx: '📄', xls: '📊', xlsx: '📊', csv: '📊', ppt: '📑', pptx: '📑',
      html: '🌐', htm: '🌐', css: '🌐', json: '🌐', xml: '🌐',
    };

    const getIcon = (name) => {
      const ext = name.split('.').pop().toLowerCase();
      return EXT_ICON[ext] || '📄';
    };

    items.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      if (!a.isDirectory() && !b.isDirectory()) {
        const iconA = getIcon(a.name);
        const iconB = getIcon(b.name);

        if (iconA !== iconB) {
          return iconA.localeCompare(iconB);
        }
      }
      return a.name.localeCompare(b.name);
    });

    const htmlItems = items.map(item => {
      const isDir = item.isDirectory();
      const icon = isDir ? '📁' : getIcon(item.name);
      const itemPath = path.posix.join(currentPath, item.name);

      const safePath = itemPath.replace(/'/g, "\\'");
      const safeName = item.name.replace(/'/g, "\\'");

      const href = isDir ? `/explorer/${itemPath}` : '#';
      const onClick = isDir ? '' : `onclick="openMenu('${safePath}', '${safeName}')"`;

      return `
                <a href="${href}" ${onClick} class="file-card">
                  <div class="icon">${icon}</div>
                  <div class="name">${item.name}</div>
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

    let htmlTemplate = fs.readFileSync(path.join(__dirname, 'frontend', 'index.html'), 'utf8');

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