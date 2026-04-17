require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
// Read from .env
const PORT = process.env.PORT;
const envStoragePath = process.env.STORAGE_PATH;
const STORAGE_ROOT = path.resolve(__dirname, envStoragePath);

// Needed to read the login form data
app.use(express.urlencoded({ extended: true }));

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
    cb(null, file.originalname);
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

// --- Home Redirect ---
app.get('/', reqLogin, (req, res) => {
  res.redirect('/explorer/');
});

app.post('/upload', reqLogin, upload.single('myFile'), (req, res) => {
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
    const items = await fs.promises.readdir(fullDir, { withFileTypes: true });
    
    const htmlItems = items.map(item => {
      const isDir = item.isDirectory();
      const icon = isDir ? '📁' : '📄';
      const itemPath = path.posix.join(currentPath, item.name);
      const link = isDir ? `/explorer/${itemPath}` : `/download/${itemPath}`;
      return `
        <a href="${link}" class="file-card">
          <div class="icon">${icon}</div>
          <div class="name">${item.name}</div>
        </a>
      `;
    }).join('');

    let backButton = '';
    if (currentPath.length > 0) {
      const parentPath = path.posix.dirname(currentPath);
      const parentLink = parentPath === '.' ? '/explorer/' : `/explorer/${parentPath}`;
      backButton = `
        <a href="${parentLink}" class="file-card back-card">
          <div class="icon">⬅️</div>
        </a>
      `;
    } else {
      backButton = `
        <a href="/logout" class="file-card back-card" style="background: #fee2e2; border-color: #fca5a5;">
          <div class="icon">🏃🚪</div>
          <div class="name">Logout</div>
        </a>
      `;
    }

    let htmlTemplate = fs.readFileSync(path.join(__dirname, 'frontend', 'index.html'), 'utf8');
    
    htmlTemplate = htmlTemplate.replaceAll('{{currentPath}}', currentPath);
    htmlTemplate = htmlTemplate.replace('{{backButton}}', backButton);
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