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
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
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
    let dirs = items.filter(i => i.isDirectory()).map(i => i.name).sort((a,b) => a.localeCompare(b));
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

app.post('/api/jellyfin-title', reqLogin, async (req, res) => {
    const targetPath = req.body.path || '';
    if (!targetPath) return res.json({ title: null });

    try {
        const searchName = path.basename(targetPath); 
        
        const response = await fetch(`${JELLYFIN_URL}/Items?api_key=${JELLYFIN_API_KEY}&searchTerm=${encodeURIComponent(searchName)}&Recursive=true`);
        
        if (!response.ok) throw new Error('Jellyfin API error');
        
        const data = await response.json();
        
        if (data && data.Items && data.Items.length > 0) {
            const match = data.Items.find(item => item.Path && item.Path.includes(targetPath)) || data.Items[0];
            res.json({ title: match.Name });
        } else {
            res.json({ title: null });
        }
    } catch (err) {
        console.error("Error fetching Jellyfin title:", err.message);
        res.json({ title: null });
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