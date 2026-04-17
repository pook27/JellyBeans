// server.js

// ==========================================
// 1. IMPORTS & SETUP
// ==========================================
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Tell Express to use EJS for our HTML views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Tell Express to serve static files (like CSS) from the 'public' folder
app.use(express.static('frontend'));

// ==========================================
// 2. STORAGE CONFIGURATION
// ==========================================
const STORAGE_ROOT = path.join(__dirname, 'storage');

// Create base storage folder if it doesn't exist
if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Multer reads the hidden 'targetPath' input from our form
        const targetPath = req.body.targetPath || '';
        const uploadDir = path.join(STORAGE_ROOT, targetPath);

        // Security check: Prevent directory traversal
        if (!uploadDir.startsWith(STORAGE_ROOT)) {
            return cb(new Error('Invalid path'), '');
        }

        // Ensure the specific sub-directory exists
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

// ==========================================
// 3. ROUTES
// ==========================================

// --- Home Redirect ---
app.get('/', (req, res) => {
    res.redirect('/explorer/');
});

// --- Upload Handler ---
app.post('/upload', upload.single('myFile'), (req, res) => {
    const targetPath = req.body.targetPath || '';
    res.redirect(`/explorer/${targetPath}`);
});

// --- File Download Handler ---
// --- File Download Handler ---
app.get(['/download/', '/download/*requestedPath'], (req, res) => {
    let requestedPath = req.params.requestedPath || '';
    if (Array.isArray(requestedPath)) {
        requestedPath = requestedPath.join('/');
    }

    const fullPath = path.join(STORAGE_ROOT, requestedPath);

    if (!fullPath.startsWith(STORAGE_ROOT) || !fs.existsSync(fullPath)) {
        return res.status(404).send('File not found.');
    }

    // Prevent trying to download a directory
    if (fs.lstatSync(fullPath).isDirectory()) {
        return res.status(400).send('Cannot download a folder.');
    }

    res.download(fullPath);
});

// --- Explorer UI Handler ---
// --- Explorer UI Handler ---
app.get(['/explorer/', '/explorer/*currentPath'], async (req, res) => {
    // Get the path the user is trying to view using the named parameter
    let currentPath = req.params.currentPath || '';
    if (Array.isArray(currentPath)) {
        currentPath = currentPath.join('/');
    }

    // Now path.join will work perfectly!
    const fullDir = path.join(STORAGE_ROOT, currentPath);

    // Security check
    if (!fullDir.startsWith(STORAGE_ROOT)) {
        return res.status(403).send('Forbidden');
    }

    try {
        // Read directory contents
        const items = await fs.promises.readdir(fullDir, { withFileTypes: true });

        // Build the HTML strings for the files/folders
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

        // Build the HTML for the back button
        let backButton = '';
        if (currentPath.length > 0) {
            const parentPath = path.posix.dirname(currentPath);
            const parentLink = parentPath === '.' ? '/explorer/' : `/explorer/${parentPath}`;
            backButton = `
        <a href="${parentLink}" class="file-card back-card">
          <div class="icon">🔙</div>
        </a>
      `;
        }

        // 1. Read the plain HTML file
        let htmlTemplate = fs.readFileSync(path.join(__dirname, 'frontend', 'index.html'), 'utf8');

        // 2. Replace the text placeholders with our generated content
        htmlTemplate = htmlTemplate.replaceAll('{{currentPath}}', currentPath);
        htmlTemplate = htmlTemplate.replace('{{backButton}}', backButton);
        htmlTemplate = htmlTemplate.replace('{{htmlItems}}', htmlItems);

        // 3. Send it to the browser
        res.send(htmlTemplate);

    } catch (err) {
        console.error(err);
        res.status(500).send('Could not read directory.');
    }
});

// ==========================================
// 4. START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
