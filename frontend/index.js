// --- File Upload Name Preview & Drag and Drop ---
function updateDropZoneStatus(files) {
    const nameInput = document.getElementById('customName');
    const statusEl = document.getElementById('dropZoneStatus');
    const dropZone = document.getElementById('dropZone');
    const submitBtn = document.getElementById('submitBtn'); // Grab the button

    if (!files || files.length === 0) {
        if (nameInput) { nameInput.value = ''; nameInput.style.display = 'none'; }
        if (statusEl) statusEl.textContent = 'No file chosen';
        if (dropZone) dropZone.classList.remove('has-file');
        if (submitBtn) submitBtn.style.display = 'none'; // Hide button if no files
        return;
    }

    if (files.length === 1) {
        if (nameInput) {
            const fileName = files[0].name;
            const lastDot = fileName.lastIndexOf('.');
            const baseName = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;

            nameInput.value = baseName;
            nameInput.style.display = 'block';
        }
        if (statusEl) statusEl.textContent = files[0].name;
    } else {
        if (nameInput) { nameInput.value = ''; nameInput.style.display = 'none'; }
        if (statusEl) statusEl.textContent = `${files.length} files selected`;
    }
    if (dropZone) dropZone.classList.add('has-file');
    if (submitBtn) submitBtn.style.display = 'block'; // Show button when files are ready
}

document.getElementById('fileInput')?.addEventListener('change', function (e) {
    updateDropZoneStatus(e.target.files);
});

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

if (dropZone && fileInput) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
        document.body.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        fileInput.files = e.dataTransfer.files;
        updateDropZoneStatus(fileInput.files);
    });
}

// --- AJAX Upload with Progress Bar ---
const uploadForm = document.getElementById('uploadForm');
if (uploadForm) {
    uploadForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const formData = new FormData(uploadForm);
        const xhr = new XMLHttpRequest();

        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const submitBtn = document.getElementById('submitBtn');

        progressContainer.style.display = 'block';
        submitBtn.disabled = true;
        submitBtn.innerText = 'Uploading...';

        xhr.upload.addEventListener('progress', function (event) {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                progressBar.style.width = percentComplete + '%';
                progressText.innerText = percentComplete + '%';
            }
        });

        xhr.addEventListener('load', function () {
            window.location.reload();
        });

        xhr.addEventListener('error', async function () {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Upload Here';
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';

            await openDialog({
                title: 'Error',
                body: '<p class="dialog-msg">Upload failed due to a network error.</p>',
                confirmLabel: 'OK'
            });
        });

        xhr.open('POST', '/upload', true);
        xhr.send(formData);
    });
}

// --- Modal Logic ---
let currentFile = { path: '', name: '' };

async function openMenu(path, name) {
    currentFile = { path, name };
    document.getElementById('menuTitle').innerText = name;

    const infoDiv = document.getElementById('menuInfoContent');
    infoDiv.innerHTML = '<i>Loading details...</i>';

    document.getElementById('fileMenuOverlay').style.display = 'flex';

    try {
        const res = await fetch('/api/info/' + currentFile.path);
        if (res.ok) {
            const data = await res.json();
            let html = `<b>Name:</b> ${data.name}<br>
                        <b>Size on Disk:</b> ${data.size}<br>
                        <b>Uploaded:</b> ${data.date}<br>`;
            if (data.dimensions) html += `<b>Resolution:</b> ${data.dimensions}<br>`;
            if (data.words) html += `<b>Word Count:</b> ${data.words} words<br>`;

            infoDiv.innerHTML = html;
        } else {
            infoDiv.innerHTML = '<span style="color: var(--danger);">Could not load file information.</span>';
        }
    } catch (err) {
        infoDiv.innerHTML = '<span style="color: var(--danger);">Error loading file information.</span>';
    }
}

function closeMenu() {
    document.getElementById('fileMenuOverlay').style.display = 'none';
}

// --- Custom Dialog (replaces prompt / confirm / alert) ---
let _dialogResolve = null;

function openDialog({ title, body, confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
        _dialogResolve = resolve;
        document.getElementById('dialogTitle').innerText = title;
        document.getElementById('dialogBody').innerHTML = body;
        const btn = document.getElementById('dialogConfirmBtn');
        btn.innerText = confirmLabel;
        btn.className = danger ? 'btn-confirm btn-confirm-danger' : 'btn-confirm';
        btn.onclick = () => {
            const input = document.getElementById('dialogInput');
            closeDialog();
            resolve(input ? input.value.trim() : true);
        };
        document.getElementById('dialogOverlay').style.display = 'flex';
        setTimeout(() => document.getElementById('dialogInput')?.focus(), 50);
    });
}

function closeDialog(e) {
    if (e && e.target !== document.getElementById('dialogOverlay')) return;
    document.getElementById('dialogOverlay').style.display = 'none';
}

function cancelDialog() {
    document.getElementById('dialogOverlay').style.display = 'none';
    if (_dialogResolve) { _dialogResolve(null); _dialogResolve = null; }
}

// Submit dialog on Enter key inside text inputs
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cancelDialog();
    if (e.key === 'Enter' && document.getElementById('dialogOverlay').style.display === 'flex') {
        document.getElementById('dialogConfirmBtn').click();
    }
});

// --- API Calls ---
function downloadFile() {
    closeMenu(); // Close the modal

    if (!currentFile || !currentFile.path) {
        console.error("No file selected for download.");
        return;
    }

    const link = document.createElement('a');
    link.href = `/download/${currentFile.path}`;
    link.download = currentFile.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function createFolder() {
    const name = await openDialog({
        title: 'New Folder',
        body: `<div class="dialog-field">
                 <label class="dialog-label">Folder name</label>
                 <input id="dialogInput" class="dialog-input" type="text" placeholder="e.g. My Folder" autocomplete="off">
               </div>`,
        confirmLabel: 'Create Folder'
    });
    if (!name) return;
    const targetPath = document.querySelector('input[name="targetPath"]').value;
    const res = await fetch('/api/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath, name })
    });
    if (res.ok) window.location.reload();
    else await openDialog({ title: 'Error', body: '<p class="dialog-msg">Could not create folder.</p>', confirmLabel: 'OK', danger: false });
}

async function deleteFile() {
    closeMenu();
    const ok = await openDialog({
        title: 'Delete File',
        body: `<p class="dialog-msg">Are you sure you want to permanently delete <strong>${currentFile.name}</strong>? This cannot be undone.</p>`,
        confirmLabel: 'Delete',
        danger: true
    });
    if (!ok) return;
    const res = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentFile.path })
    });
    if (res.ok) window.location.reload();
    else await openDialog({ title: 'Error', body: '<p class="dialog-msg">Could not delete file.</p>', confirmLabel: 'OK' });
}

async function renameFile() {
    closeMenu();
    const lastDotIndex = currentFile.name.lastIndexOf('.');
    const hasExt = lastDotIndex > 0;
    const baseName = hasExt ? currentFile.name.substring(0, lastDotIndex) : currentFile.name;
    const extension = hasExt ? currentFile.name.substring(lastDotIndex) : '';

    let newName = await openDialog({
        title: 'Rename',
        body: `<div class="dialog-field">
                 <label class="dialog-label">New filename</label>
                 <input id="dialogInput" class="dialog-input" type="text" value="${baseName.replace(/"/g, '&quot;')}" autocomplete="off">
               </div>`,
        confirmLabel: 'Rename'
    });
    if (!newName || newName === baseName || newName === currentFile.name) return;
    if (extension && !newName.toLowerCase().endsWith(extension.toLowerCase())) {
        newName += extension;
    }
    const res = await fetch('/api/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentFile.path, newName })
    });

    if (res.ok) window.location.reload();
    else await openDialog({ title: 'Error', body: '<p class="dialog-msg">Could not rename file.</p>', confirmLabel: 'OK' });
}

// --- View Toggle ---
function toggleView() {
    const grid = document.querySelector('.grid');
    const icon = document.getElementById('viewIcon');
    const isList = grid.classList.toggle('list-view');
    icon.textContent = isList ? '⊞' : '☰';
    localStorage.setItem('viewMode', isList ? 'list' : 'grid');
}

(function () {
    if (localStorage.getItem('viewMode') === 'list') {
        document.querySelector('.grid').classList.add('list-view');
        document.getElementById('viewIcon').textContent = '⊞';
    }
})();

// --- Search Filter ---
let searchTimeout = null;
let originalGridHTML = null;

function filterFiles() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const grid = document.querySelector('.grid');

    // Capture the original directory view so we can restore it when the search is cleared
    if (originalGridHTML === null) {
        originalGridHTML = grid.innerHTML;
    }

    clearTimeout(searchTimeout);

    if (!query) {
        // Restore original view
        grid.innerHTML = originalGridHTML;
        loadJellyfinTitles(); // Re-apply Jellyfin posters to the restored grid
        return;
    }

    // Debounce to avoid spamming the server on every keystroke
    searchTimeout = setTimeout(async () => {
        grid.innerHTML = '<div style="padding: 2rem; grid-column: 1/-1; text-align: center; color: var(--grey-1); font-weight: 600;">🔍 Searching entire library...</div>';

        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            if (!res.ok) throw new Error('Search failed');
            const results = await res.json();

            if (results.length === 0) {
                grid.innerHTML = '<div style="padding: 2rem; grid-column: 1/-1; text-align: center; color: var(--grey-1);">No matches found.</div>';
                return;
            }

            let html = '';
            results.forEach(item => {
                const icon = item.isDir ? '📁' : getFileIcon(item.name);
                const safePath = item.path.replace(/'/g, "\\'").replace(/"/g, "&quot;");
                const safeName = item.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");

                const href = item.isDir ? `/explorer/${item.path}` : '#';
                const onClick = item.isDir ? '' : `onclick="openMenu('${safePath}', '${safeName}')"`;

                // Show the parent directory path underneath the name so users know where the result lives
                const parentDir = item.path.includes('/') ? '/' + item.path.substring(0, item.path.lastIndexOf('/')) : '/';

                html += `
                    <a href="${href}" ${onClick} class="file-card" data-path="${safePath}" data-isdir="${item.isDir}" data-size="${item.size}" data-mtime="${item.mtime}">
                        <div class="card-checkbox"></div>
                        <div class="icon">${icon}</div>
                        <div class="name" dir="auto">
                            ${item.name}
                            <div style="font-size: 0.65rem; color: var(--grey-1); margin-top: 0.2rem; font-weight: normal; word-break: break-all;" dir="ltr">${parentDir}</div>
                        </div>
                    </a>
                `;
            });

            grid.innerHTML = html;
            loadJellyfinTitles(); // Fetch posters/titles for the newly injected search results

        } catch (err) {
            console.error(err);
            grid.innerHTML = '<div style="padding: 2rem; grid-column: 1/-1; text-align: center; color: var(--danger);">Search error occurred.</div>';
        }
    }, 400); // 400ms typing delay before fetching
}

// ==========================================
// SORT ENGINE
// ==========================================
let sortDir = localStorage.getItem('sortDir') || 'desc';

function applySortPreference() {
    const field = document.getElementById('sortField')?.value || 'name';
    localStorage.setItem('sortField', field);
    sortFiles(field, sortDir);
}

function toggleSortDir() {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    localStorage.setItem('sortDir', sortDir);
    const btn = document.getElementById('sortDirBtn');
    if (btn) btn.textContent = sortDir === 'asc' ? '↑' : '↓';
    const field = document.getElementById('sortField')?.value || 'name';
    sortFiles(field, sortDir);
}

function sortFiles(field, dir) {
    const grid = document.querySelector('.grid');
    if (!grid) return;

    const cards = Array.from(grid.querySelectorAll('.file-card:not(.back-card)'));
    const backCard = grid.querySelector('.back-card');

    // Separate folders and files to always keep folders first
    const folders = cards.filter(c => c.dataset.isdir === 'true');
    const files = cards.filter(c => c.dataset.isdir !== 'true');

    const compare = (a, b) => {
        let valA, valB;
        if (field === 'date') {
            valA = parseFloat(a.dataset.mtime || 0);
            valB = parseFloat(b.dataset.mtime || 0);
        } else if (field === 'size') {
            valA = parseFloat(a.dataset.size || 0);
            valB = parseFloat(b.dataset.size || 0);
        } else {
            // Default: alphabetical by visible name text
            valA = (a.querySelector('.name')?.firstChild?.textContent || '').trim().toLowerCase();
            valB = (b.querySelector('.name')?.firstChild?.textContent || '').trim().toLowerCase();
        }
        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    };

    folders.sort(compare);
    files.sort(compare);

    // Re-insert in order: back card first, then sorted folders, then sorted files
    if (backCard) grid.appendChild(backCard);
    folders.forEach(c => grid.appendChild(c));
    files.forEach(c => grid.appendChild(c));
}

// Initialise sort controls from localStorage on page load
(function initSort() {
    const savedField = localStorage.getItem('sortField') || 'name';
    const savedDir = localStorage.getItem('sortDir') || 'desc';
    sortDir = savedDir;

    const selectEl = document.getElementById('sortField');
    const dirBtn = document.getElementById('sortDirBtn');

    if (selectEl) selectEl.value = savedField;
    if (dirBtn) dirBtn.textContent = savedDir === 'asc' ? '↑' : '↓';

    // Apply the saved sort after the grid is ready
    requestAnimationFrame(() => sortFiles(savedField, savedDir));
})();


// --- Move File & Mini-Explorer Logic ---
let moveSelectedFolder = '';

async function loadMiniExplorer(pathStr) {
    const res = await fetch('/api/list-dirs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathStr })
    });
    if (!res.ok) return;

    const data = await res.json();
    moveSelectedFolder = data.currentPath;

    let html = `<div style="background:var(--grey-2); padding:0.5rem 0.75rem; border-radius:var(--radius-sm); margin-bottom:0.5rem; font-size:0.8rem; font-weight:600; color:var(--black); word-break:break-all;">
                  Current Folder: /${moveSelectedFolder}
                </div>`;

    html += `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap:0.5rem; max-height:220px; overflow-y:auto; padding:0.5rem; border:1px solid var(--grey-3); border-radius:var(--radius-sm); background:var(--white);">`;

    if (moveSelectedFolder.length > 0) {
        const parentPath = moveSelectedFolder.includes('/') ? moveSelectedFolder.substring(0, moveSelectedFolder.lastIndexOf('/')) : '';
        html += `<div onclick="loadMiniExplorer('${parentPath.replace(/'/g, "\\'").replace(/"/g, "&quot;")}')" class="file-card" style="padding:0.75rem 0.5rem; cursor:pointer; background:var(--grey-4); border:1px solid var(--grey-3);">                    <div class="icon" style="font-size:1.5rem;">⬅️</div>
                    <div class="name" style="font-size:0.7rem;">Back</div>
                 </div>`;
    }

    data.dirs.forEach(d => {
        const nextPath = moveSelectedFolder ? `${moveSelectedFolder}/${d}` : d;
        html += `<div onclick="loadMiniExplorer('${nextPath.replace(/'/g, "\\'").replace(/"/g, "&quot;")}')" class="file-card" style="padding:0.75rem 0.5rem; cursor:pointer; border:1px solid transparent; background:var(--white);">
                    <div class="icon" style="font-size:1.5rem;">📁</div>
                    <div class="name" style="font-size:0.7rem;">${d}</div>
                 </div>`;
    });

    if (data.dirs.length === 0) {
        html += `<div style="grid-column: 1/-1; padding: 1rem; color: var(--grey-1); text-align: center; font-size:0.8rem;">No subfolders</div>`;
    }

    html += `</div>`;

    const container = document.getElementById('miniExplorerContainer');
    if (container) container.innerHTML = html;
}

async function moveFile() {
    closeMenu();

    const parentDir = currentFile.path.includes('/') ? currentFile.path.substring(0, currentFile.path.lastIndexOf('/')) : '';

    setTimeout(() => loadMiniExplorer(parentDir), 50);

    const dialogRes = await openDialog({
        title: 'Move File',
        body: `<div id="miniExplorerContainer"><p class="dialog-msg">Loading folders...</p></div>`,
        confirmLabel: 'Move Here'
    });

    if (dialogRes === null) return;

    let targetName = currentFile.name;
    let newPath = moveSelectedFolder ? `${moveSelectedFolder}/${targetName}` : targetName;

    if (newPath === currentFile.path) {
        await openDialog({
            title: 'Notice',
            body: '<p class="dialog-msg">File is already in this folder.</p>',
            confirmLabel: 'OK'
        });
        return;
    }

    await doMoveRequest(currentFile.path, newPath, targetName);
}

async function doMoveRequest(oldP, newP, tName, reloadOnSuccess = true) {
    const res = await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: oldP, newPath: newP })
    });

    // 409 means File Already Exists
    if (res.status === 409) {
        const lastDot = tName.lastIndexOf('.');
        const baseName = lastDot > 0 ? tName.substring(0, lastDot) : tName;
        const extension = lastDot > 0 ? tName.substring(lastDot) : '';

        const renameChoice = await openDialog({
            title: 'File Exists',
            body: `<p class="dialog-msg" style="margin-bottom:0.75rem;">A file named <strong>${tName.replace(/"/g, '&quot;')}</strong> already exists in this folder.</p>
                   <div class="dialog-field">
                     <label class="dialog-label">Rename and move as:</label>
                     <input id="dialogInput" class="dialog-input" type="text" value="${baseName.replace(/"/g, '&quot;')}" autocomplete="off">
                   </div>`,
            confirmLabel: 'Rename & Move'
        });

        if (renameChoice && renameChoice !== baseName && renameChoice !== tName) {
            let finalName = renameChoice;
            if (extension && !finalName.toLowerCase().endsWith(extension.toLowerCase())) {
                finalName += extension;
            }
            const dirPath = newP.includes('/') ? newP.substring(0, newP.lastIndexOf('/')) : '';
            const correctNewPath = dirPath ? `${dirPath}/${finalName}` : finalName;

            // Pass the flag down recursively
            await doMoveRequest(oldP, correctNewPath, finalName, reloadOnSuccess);
        }
    } else if (res.ok) {
        if (reloadOnSuccess) window.location.reload();
    } else {
        await openDialog({ title: 'Error', body: '<p class="dialog-msg">Could not move file.</p>', confirmLabel: 'OK' });
    }
}

async function copyFile() {
    closeMenu();

    const parentDir = currentFile.path.includes('/') ? currentFile.path.substring(0, currentFile.path.lastIndexOf('/')) : '';

    setTimeout(() => loadMiniExplorer(parentDir), 50);

    const dialogRes = await openDialog({
        title: 'Copy File',
        body: `<div id="miniExplorerContainer"><p class="dialog-msg">Loading folders...</p></div>`,
        confirmLabel: 'Copy Here'
    });

    if (dialogRes === null) return;

    let targetName = currentFile.name;
    let newPath = moveSelectedFolder ? `${moveSelectedFolder}/${targetName}` : targetName;

    await doCopyRequest(currentFile.path, newPath, targetName);
}

async function doCopyRequest(oldP, newP, tName, reloadOnSuccess = true) {
    const res = await fetch('/api/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: oldP, newPath: newP })
    });

    // 409 means File Already Exists (or they are copying in the exact same directory)
    if (res.status === 409) {
        const lastDot = tName.lastIndexOf('.');
        const baseName = lastDot > 0 ? tName.substring(0, lastDot) : tName;
        const extension = lastDot > 0 ? tName.substring(lastDot) : '';

        const renameChoice = await openDialog({
            title: 'File Exists',
            body: `<p class="dialog-msg" style="margin-bottom:0.75rem;">A file named <strong>${tName.replace(/"/g, '&quot;')}</strong> already exists in this folder.</p>
                   <div class="dialog-field">
                     <label class="dialog-label">Rename and copy as:</label>
                     <input id="dialogInput" class="dialog-input" type="text" value="${baseName.replace(/"/g, '&quot;')}" autocomplete="off">
                   </div>`,
            confirmLabel: 'Rename & Copy'
        });

        // Ensure we don't accidentally get stuck in an infinite loop if they submit the exact same name again
        if (renameChoice && renameChoice !== baseName && renameChoice !== tName) {
            let finalName = renameChoice;
            if (extension && !finalName.toLowerCase().endsWith(extension.toLowerCase())) {
                finalName += extension;
            }
            const dirPath = newP.includes('/') ? newP.substring(0, newP.lastIndexOf('/')) : '';
            const correctNewPath = dirPath ? `${dirPath}/${finalName}` : finalName;

            // Recursively attempt the copy again with the new name
            await doCopyRequest(oldP, correctNewPath, finalName, reloadOnSuccess);
        }
    } else if (res.ok) {
        if (reloadOnSuccess) window.location.reload();
    } else {
        await openDialog({ title: 'Error', body: '<p class="dialog-msg">Could not copy file.</p>', confirmLabel: 'OK' });
    }
}

// --- Refresh Jellyfin Library ---
async function refreshLibrary() {
    const confirmed = await openDialog({
        title: 'Refresh Library',
        body: '<p class="dialog-msg">This will trigger a full scan in Jellyfin to detect new, moved, or deleted files. Continue?</p>',
        confirmLabel: 'Refresh'
    });

    if (!confirmed) return;

    document.body.style.cursor = 'wait';

    try {
        const res = await fetch('/api/refresh-library', { method: 'POST' });

        if (res.ok) {
            await openDialog({
                title: '✅ Success',
                body: '<p class="dialog-msg">Library refresh initiated. Jellyfin is now scanning in the background.</p>',
                confirmLabel: 'OK'
            });
        } else {
            const errorMsg = await res.text();
            await openDialog({
                title: 'Error',
                body: `<p class="dialog-msg">Failed to trigger refresh: ${errorMsg}</p>`,
                confirmLabel: 'OK'
            });
        }
    } catch (err) {
        console.error(err);
        await openDialog({
            title: 'Network Error',
            body: '<p class="dialog-msg">Could not reach the server to refresh the library.</p>',
            confirmLabel: 'OK'
        });
    } finally {
        document.body.style.cursor = 'default';
    }
}

// --- Jellyfin Titles Toggle ---
let showJellyfinTitles = localStorage.getItem('showJellyfinTitles') === 'true';

function updateJellyfinToggleBtn() {
    const btn = document.getElementById('jellyfinToggleBtn');
    if (btn) {
        btn.innerHTML = showJellyfinTitles ? 'Titles: ✅' : 'Titles: ❌';
        btn.style.background = showJellyfinTitles ? 'var(--blue-light)' : 'var(--grey-3)';
        btn.style.color = showJellyfinTitles ? 'var(--blue)' : 'var(--black)';
    }
}

async function toggleJellyfinTitles() {
    showJellyfinTitles = !showJellyfinTitles;
    localStorage.setItem('showJellyfinTitles', showJellyfinTitles);
    updateJellyfinToggleBtn();

    if (showJellyfinTitles) {
        loadJellyfinTitles();
    } else {
        document.querySelectorAll('.jellyfin-title').forEach(el => el.remove());
    }
}

async function loadJellyfinTitles() {
    const fileCards = document.querySelectorAll('.grid .file-card');
    const paths = [];
    const cardMap = new Map();

    // 1. Collect all file paths currently on the screen
    fileCards.forEach(card => {
        if (card.classList.contains('back-card')) return;

        const onclick = card.getAttribute('onclick') || '';
        const match = onclick.match(/openMenu\('((?:[^'\\]|\\.)*)'/);

        if (match && match[1]) {
            const rawPath = match[1].replace(/\\'/g, "'");
            paths.push(rawPath);
            cardMap.set(rawPath, card);
        }
    });

    if (paths.length === 0) return;

    try {
        // 2. ALWAYS fetch the posters and titles from the backend
        const res = await fetch('/api/jellyfin-titles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths })
        });

        if (!res.ok) throw new Error('Failed to fetch Jellyfin data');
        const data = await res.json();

        // 3. Read the toggle state from localStorage directly here
        const showTitles = localStorage.getItem('showJellyfinTitles') === 'true';

        // 4. Apply the UI updates based on the fetched data and current toggle state
        for (const [relPath, info] of Object.entries(data)) {
            const card = cardMap.get(relPath);
            if (!card) continue;

            const iconEl = card.querySelector('.icon');
            const nameEl = card.querySelector('.name');

            if (info.posterUrl && iconEl) {
                iconEl.innerHTML = `<img src="${info.posterUrl}" class="jellyfin-poster" alt="poster">`;
            }

            // ONLY inject the text title if the toggle is ON
            if (showTitles && info.title && nameEl && !nameEl.querySelector('.jellyfin-title')) {
                // Using insertAdjacentHTML prevents overwriting the filename accidentally
                nameEl.insertAdjacentHTML('beforeend', `<span class="jellyfin-title">[${info.title}]</span>`);
            }
        }
    } catch (err) {
        console.error('[Jellyfin Titles Error]', err);
    }
}

// --- Disk Space Indicator ---
async function loadDiskSpace() {
    try {
        const res = await fetch('/api/disk-space');
        if (!res.ok) return;
        const { total, free, used } = await res.json();
        if (!total) return;

        const usedPct = Math.round((used / total) * 100);
        const freeGB = (free / (1024 ** 3)).toFixed(1);
        const totalGB = (total / (1024 ** 3)).toFixed(1);

        // Colour: blue → amber at 75% → red at 90%
        const fillColor = usedPct >= 90 ? 'var(--danger)'
            : usedPct >= 75 ? '#f59e0b'
                : 'var(--blue)';

        const bar = document.getElementById('storageBar');
        if (!bar) return;

        bar.style.display = 'block';
        bar.innerHTML = `
            <div class="storage-label">
                <span>💾 Storage</span>
                <span>${freeGB} GB free of ${totalGB} GB &nbsp;·&nbsp; ${usedPct}% used</span>
            </div>
            <div class="storage-track">
                <div class="storage-fill" style="width:${usedPct}%; background:${fillColor};"></div>
            </div>`;
    } catch (_) { /* silently skip if endpoint unavailable */ }
}

document.addEventListener('DOMContentLoaded', () => {
    loadJellyfinTitles();
    updateJellyfinToggleBtn();
    loadDiskSpace();
});

setTimeout(loadJellyfinTitles, 100);

(function () {
    const stickyHeader = document.querySelector('.sticky-header');
    if (!stickyHeader) return;

    // Sentinel: a zero-height div placed just above the sticky header
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:100%;pointer-events:none;';
    stickyHeader.parentElement.insertBefore(sentinel, stickyHeader);

    const observer = new IntersectionObserver(
        ([entry]) => {
            stickyHeader.classList.toggle('is-stuck', !entry.isIntersecting);
        },
        { threshold: 0, rootMargin: '0px' }
    );

    observer.observe(sentinel);
})();

// --- Get the Jellyfin title for the currently open file ---
function getJellyfinTitleForCurrentFile() {
    const cards = document.querySelectorAll('.grid .file-card');
    for (const card of cards) {
        const match = (card.getAttribute('onclick') || '').match(/openMenu\('((?:[^'\\]|\\.)*)'/);
        if (match?.[1] && match[1].replace(/\\'/g, "'") === currentFile.path) {
            const titleEl = card.querySelector('.jellyfin-title');
            if (titleEl) {
                return titleEl.textContent.replace(/^\[\s*/, '').replace(/\s*\]$/, '').trim();
            }
        }
    }
    // Fallback: filename without extension
    const lastDot = currentFile.name.lastIndexOf('.');
    return lastDot > 0 ? currentFile.name.substring(0, lastDot) : currentFile.name;
}

// ==========================================
// THUMBNAIL HELPERS (shared by single & bulk)
// ==========================================

function svgToJpeg(svgText) {
    return new Promise((resolve, reject) => {
        const blob = new Blob([svgText], { type: 'image/svg+xml' });
        const objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 1000;
            canvas.height = 1500;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(objectUrl);
            resolve(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]);
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('SVG image load failed'));
        };
        img.src = objectUrl;
    });
}

function updateCardIcon(filePath, jpegBase64, title) {
    const allCards = document.querySelectorAll('.grid .file-card');
    for (const card of allCards) {
        const onclickAttr = card.getAttribute('onclick') || card.dataset.oldOnclick || '';
        const cardMatch = onclickAttr.match(/openMenu\('((?:[^'\\]|\\.)*)'/);

        if (cardMatch?.[1] && cardMatch[1].replace(/\\'/g, "'") === filePath) {
            const iconEl = card.querySelector('.icon');
            if (iconEl) {
                const thumbImg = document.createElement('img');
                thumbImg.src = `data:image/jpeg;base64,${jpegBase64}`;
                thumbImg.className = 'jellyfin-poster';
                thumbImg.alt = title;
                iconEl.innerHTML = '';
                iconEl.appendChild(thumbImg);
            }
            break;
        }
    }
}

function getTitleForPath(filePath) {
    const allCards = document.querySelectorAll('.grid .file-card');
    for (const card of allCards) {
        const onclickAttr = card.getAttribute('onclick') || card.dataset.oldOnclick || '';
        const cardMatch = onclickAttr.match(/openMenu\('((?:[^'\\]|\\.)*)'/);

        if (cardMatch?.[1] && cardMatch[1].replace(/\\'/g, "'") === filePath) {
            const titleEl = card.querySelector('.jellyfin-title');
            if (titleEl) return titleEl.textContent.replace(/^\[\s*/, '').replace(/\s*\]$/, '').trim();
            break;
        }
    }
    const fileName = filePath.split('/').pop();
    const lastDot = fileName.lastIndexOf('.');
    return lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
}

// --- Single-File Thumbnail Generator & Uploader ---
async function generateThumbnail() {
    closeMenu();
    const title = getJellyfinTitleForCurrentFile();

    // Show initial loading state
    document.getElementById('dialogTitle').innerText = '🎨 Generating Preview';
    document.getElementById('dialogBody').innerHTML = `
        <div style="text-align:center; padding:1.25rem 0 0.5rem;">
            <div style="font-size:2rem; margin-bottom:0.75rem;">⏳</div>
            <p class="dialog-msg">Building thumbnail for:<br><strong>${title}</strong></p>
        </div>`;

    const confirmBtn = document.getElementById('dialogConfirmBtn');
    confirmBtn.innerText = 'Cancel';
    confirmBtn.className = 'btn-confirm';
    confirmBtn.onclick = () => { document.getElementById('dialogOverlay').style.display = 'none'; };
    document.getElementById('dialogOverlay').style.display = 'flex';

    try {
        // 1. Ask backend to generate the raw SVG
        const res = await fetch('/api/generate-thumbnail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const svgText = await res.text();

        const jpegBase64 = await svgToJpeg(svgText);

        document.getElementById('dialogTitle').innerText = '👀 Preview Thumbnail';
        document.getElementById('dialogBody').innerHTML = `
            <img src="data:image/jpeg;base64,${jpegBase64}" alt="thumbnail preview"
                 style="max-height: 45vh; width: auto; margin: 0 auto 0.75rem auto; border-radius:var(--radius-sm); display:block; box-shadow:var(--shadow);">
            <p class="dialog-msg" style="text-align:center; font-size:0.85rem;">Looks Good? Click To Apply.</p>`;

        confirmBtn.innerText = '⬆️ Apply';

        // 3. WAIT FOR USER TO CLICK APPLY
        confirmBtn.onclick = async () => {
            confirmBtn.innerText = 'Uploading...';
            confirmBtn.style.pointerEvents = 'none';

            try {
                const uploadRes = await fetch('/api/set-jellyfin-thumbnail', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: currentFile.path, imageBase64: jpegBase64 })
                });

                if (!uploadRes.ok) throw new Error('Jellyfin rejected the upload.');

                document.getElementById('dialogTitle').innerText = '✅ Success';
                document.getElementById('dialogBody').innerHTML = `
                    <p class="dialog-msg" style="text-align:center;">Thumbnail successfully updated in Jellyfin!</p>`;

                updateCardIcon(currentFile.path, jpegBase64, title);

                confirmBtn.innerText = 'Done';
                confirmBtn.style.pointerEvents = 'auto';
                confirmBtn.onclick = () => { document.getElementById('dialogOverlay').style.display = 'none'; };

            } catch (uploadErr) {
                console.error('[Upload]', uploadErr);
                document.getElementById('dialogTitle').innerText = 'Upload Error';
                document.getElementById('dialogBody').innerHTML = `<p class="dialog-msg">Failed to send to Jellyfin.</p>`;
                confirmBtn.innerText = 'Close';
                confirmBtn.style.pointerEvents = 'auto';
                confirmBtn.onclick = () => { document.getElementById('dialogOverlay').style.display = 'none'; };
            }
        };

    } catch (err) {
        console.error('[Thumbnail]', err);
        document.getElementById('dialogTitle').innerText = 'Error';
        document.getElementById('dialogBody').innerHTML = `<p class="dialog-msg">Could not generate the thumbnail preview.</p>`;
        confirmBtn.innerText = 'OK';
        confirmBtn.onclick = () => { document.getElementById('dialogOverlay').style.display = 'none'; };
    }
}

// ==========================================
// BULK SELECTION ENGINE
// ==========================================
let isSelectMode = false;
let selectedFiles = new Set();
let draggedPath = null;
let lastSelectedCardIndex = -1; // Track the anchor point for Shift+Click ranges

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.querySelector('.grid');

    if (grid) {
        // Use capture phase (true) to intercept clicks before inline onclick/hrefs fire
        grid.addEventListener('click', (e) => {
            const card = e.target.closest('.file-card:not(.back-card)');
            if (!card) return;

            // 1. If user Shift+Clicks while NOT in select mode -> enter it automatically
            if (!isSelectMode && e.shiftKey) {
                e.preventDefault();
                e.stopPropagation(); // Stops the inline onclick from opening the menu
                toggleSelectMode();
            }

            // 2. Handle selection logic if we are in select mode
            if (isSelectMode) {
                e.preventDefault();
                e.stopPropagation();

                // Fetch current DOM state dynamically so it respects current sorting
                const cards = Array.from(document.querySelectorAll('.grid .file-card:not(.back-card)'));
                const currentIndex = cards.indexOf(card);
                const path = card.dataset.path;

                // Shift + Click -> Range Selection
                if (e.shiftKey && lastSelectedCardIndex !== -1) {
                    const start = Math.min(lastSelectedCardIndex, currentIndex);
                    const end = Math.max(lastSelectedCardIndex, currentIndex);

                    // If the target is already selected, deselect the range. Otherwise, select it.
                    const isSelecting = !selectedFiles.has(path);

                    for (let i = start; i <= end; i++) {
                        const c = cards[i];
                        const p = c.dataset.path;
                        if (isSelecting) {
                            selectedFiles.add(p);
                            c.classList.add('selected');
                        } else {
                            selectedFiles.delete(p);
                            c.classList.remove('selected');
                        }
                    }
                } else {
                    // Standard click -> Toggle single item
                    if (selectedFiles.has(path)) {
                        selectedFiles.delete(path);
                        card.classList.remove('selected');
                    } else {
                        selectedFiles.add(path);
                        card.classList.add('selected');
                    }
                }

                lastSelectedCardIndex = currentIndex;
                updateBulkActionBar();
            }
        }, true); // <-- "true" enables the capture phase
    }
});

// --- UI Toggle Functions ---
function toggleSelectMode() {
    isSelectMode = !isSelectMode;
    document.body.classList.toggle('select-mode', isSelectMode);

    // Temporarily strip normal click behavior from cards so they don't open menus/folders
    const cards = document.querySelectorAll('.grid .file-card:not(.back-card)');
    cards.forEach(card => {
        if (isSelectMode) {
            card.dataset.oldHref = card.getAttribute('href') || '';
            card.dataset.oldOnclick = card.getAttribute('onclick') || '';
            card.removeAttribute('href');
            card.removeAttribute('onclick');
        } else {
            if (card.dataset.oldHref) card.setAttribute('href', card.dataset.oldHref);
            if (card.dataset.oldOnclick) card.setAttribute('onclick', card.dataset.oldOnclick);
            card.classList.remove('selected');
        }
    });

    selectedFiles.clear();
    lastSelectedCardIndex = -1; // Reset anchor index when exiting/entering
    updateBulkActionBar();
}

function updateBulkActionBar() {
    const bar = document.getElementById('bulk-action-bar');
    const countSpan = document.getElementById('bulk-count');
    if (!bar || !countSpan) return;

    countSpan.innerText = `${selectedFiles.size} items selected`;

    if (isSelectMode && selectedFiles.size > 0) {
        bar.classList.add('visible');
    } else {
        bar.classList.remove('visible');
    }
}

// --- Bulk Action Executor ---
function selectAllFiles() {
    const cards = document.querySelectorAll('.grid .file-card:not(.back-card)');

    const isAllSelected = selectedFiles.size === cards.length && cards.length > 0;

    cards.forEach(card => {
        const path = card.dataset.path;
        if (isAllSelected) {
            selectedFiles.delete(path);
            card.classList.remove('selected');
        } else {
            selectedFiles.add(path);
            card.classList.add('selected');
        }
    });
    updateBulkActionBar();
}

async function bulkDelete() {
    const ok = await openDialog({
        title: 'Delete Files',
        body: `<p class="dialog-msg">Are you sure you want to permanently delete <strong>${selectedFiles.size} item${selectedFiles.size !== 1 ? 's' : ''}</strong>? This cannot be undone.</p>`,
        confirmLabel: 'Delete',
        danger: true
    });
    if (!ok) return;

    document.body.style.cursor = 'wait';
    try {
        // Fire all delete requests to the backend at the same time
        const promises = Array.from(selectedFiles).map(path =>
            fetch('/api/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            })
        );

        await Promise.all(promises);
        window.location.reload();
    } catch (err) {
        console.error('Bulk delete failed', err);
        alert('An error occurred while deleting some files.');
        window.location.reload();
    }
}

async function bulkMove() {
    if (selectedFiles.size === 0) return;

    const firstPath = Array.from(selectedFiles)[0];
    const parentDir = firstPath.includes('/') ? firstPath.substring(0, firstPath.lastIndexOf('/')) : '';

    setTimeout(() => loadMiniExplorer(parentDir), 50);
    const dialogRes = await openDialog({
        title: `Move ${selectedFiles.size} Items`,
        body: `<div id="miniExplorerContainer"><p class="dialog-msg">Loading folders...</p></div>`,
        confirmLabel: 'Move Here'
    });

    if (dialogRes === null) return;

    document.body.style.cursor = 'wait';

    try {
        for (const oldP of selectedFiles) {
            const targetName = oldP.split('/').pop();
            const newP = moveSelectedFolder ? `${moveSelectedFolder}/${targetName}` : targetName;

            if (newP === oldP) continue; // Skip if they are moving it to the exact same folder

            await doMoveRequest(oldP, newP, targetName, false);
        }
    } catch (err) {
        console.error('Bulk move failed', err);
    } finally {
        window.location.reload();
    }
}

// --- Bulk Thumbnail Generator ---
const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg']);

async function bulkThumbnail() {
    if (selectedFiles.size === 0) return;

    // Filter to video files only
    const videoPaths = Array.from(selectedFiles).filter(p => {
        const ext = p.split('.').pop().toLowerCase();
        return VIDEO_EXTENSIONS.has(ext);
    });

    if (videoPaths.length === 0) {
        await openDialog({
            title: 'No Videos Selected',
            body: `<p class="dialog-msg">None of the selected files are video files. Select at least one video to generate thumbnails.</p>`,
            confirmLabel: 'OK'
        });
        return;
    }

    // Confirm before starting
    const confirmed = await openDialog({
        title: `🎨 Create ${videoPaths.length} Thumbnail${videoPaths.length !== 1 ? 's' : ''}`,
        body: `<p class="dialog-msg">This will generate and save poster thumbnails for <strong>${videoPaths.length} video${videoPaths.length !== 1 ? 's' : ''}</strong>. This may take a moment.</p>`,
        confirmLabel: 'Start'
    });
    if (!confirmed) return;

    // Show progress dialog (non-cancellable while running)
    document.getElementById('dialogTitle').innerText = `🎨 Creating Thumbnails`;
    document.getElementById('dialogBody').innerHTML = `
        <div style="padding: 0.25rem 0 0.75rem;">
            <p class="dialog-msg" style="margin-bottom:0.75rem;">
                Processing <strong><span id="thumbCurrent">0</span> of ${videoPaths.length}</strong>
            </p>
            <div style="background:var(--grey-3); border-radius:var(--radius-full); width:100%; height:8px; overflow:hidden;">
                <div id="thumbProgressBar" style="background:var(--blue); width:0%; height:100%; transition:width 0.3s ease; border-radius:var(--radius-full);"></div>
            </div>
            <div id="thumbCurrentFile" style="font-size:0.75rem; color:var(--grey-1); margin-top:0.6rem; word-break:break-all; min-height:1.2em;"></div>
        </div>`;

    const confirmBtn = document.getElementById('dialogConfirmBtn');
    confirmBtn.innerText = 'Running…';
    confirmBtn.style.pointerEvents = 'none';
    confirmBtn.className = 'btn-confirm';
    document.getElementById('dialogOverlay').style.display = 'flex';

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < videoPaths.length; i++) {
        const filePath = videoPaths[i];
        const fileName = filePath.split('/').pop();
        const title = getTitleForPath(filePath);

        // Update progress UI
        document.getElementById('thumbCurrent').innerText = i + 1;
        document.getElementById('thumbCurrentFile').innerText = `📄 ${fileName}`;
        document.getElementById('thumbProgressBar').style.width = `${(i / videoPaths.length) * 100}%`;

        try {
            // 1. Generate SVG on the server
            const svgRes = await fetch('/api/generate-thumbnail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title })
            });
            if (!svgRes.ok) throw new Error(`SVG generation failed (${svgRes.status})`);
            const svgText = await svgRes.text();

            // 2. Rasterise SVG → JPEG in the browser
            const jpegBase64 = await svgToJpeg(svgText);

            // 3. Save to disk and trigger Jellyfin refresh
            const uploadRes = await fetch('/api/set-jellyfin-thumbnail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath, imageBase64: jpegBase64 })
            });
            if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);

            // 4. Update the card icon in the DOM immediately
            updateCardIcon(filePath, jpegBase64, title);
            successCount++;

        } catch (err) {
            console.error(`[Bulk Thumbnail] Failed for "${fileName}":`, err);
            failCount++;
        }
    }

    // Final progress bar fill
    document.getElementById('thumbProgressBar').style.width = '100%';

    // Show result
    const failNote = failCount > 0
        ? `, <span style="color:var(--danger); font-weight:600;">${failCount} failed</span>`
        : '';

    document.getElementById('dialogTitle').innerText = '✅ Done';
    document.getElementById('dialogBody').innerHTML = `
        <p class="dialog-msg" style="text-align:center; padding: 0.5rem 0;">
            Successfully created <strong>${successCount}</strong> thumbnail${successCount !== 1 ? 's' : ''}${failNote}.
        </p>`;

    confirmBtn.innerText = 'Close';
    confirmBtn.style.pointerEvents = 'auto';
    confirmBtn.onclick = () => {
        document.getElementById('dialogOverlay').style.display = 'none';
    };
}