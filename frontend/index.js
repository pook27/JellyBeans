// --- File Upload Name Preview & Drag and Drop ---
function updateDropZoneStatus(files) {
    const nameInput = document.getElementById('customName');
    const statusEl = document.getElementById('dropZoneStatus');
    const dropZone = document.getElementById('dropZone');

    if (!files || files.length === 0) {
        if (nameInput) { nameInput.value = ''; nameInput.style.display = 'none'; }
        if (statusEl) statusEl.textContent = 'No file chosen';
        if (dropZone) dropZone.classList.remove('has-file');
        return;
    }

    if (files.length === 1) {
        if (nameInput) { nameInput.value = files[0].name; nameInput.style.display = 'block'; }
        if (statusEl) statusEl.textContent = files[0].name;
    } else {
        if (nameInput) { nameInput.value = ''; nameInput.style.display = 'none'; }
        if (statusEl) statusEl.textContent = `${files.length} files selected`;
    }
    if (dropZone) dropZone.classList.add('has-file');
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

        xhr.addEventListener('error', function () {
            alert('Upload failed due to a network error.');
            submitBtn.disabled = false;
            submitBtn.innerText = 'Upload Here';
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
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
        // Auto-focus text input if present
        setTimeout(() => document.getElementById('dialogInput')?.focus(), 50);
    });
}

function closeDialog(e) {
    // Close only if clicking the backdrop itself
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
    const hasExtension = lastDotIndex > 0;

    const baseName = hasExtension ? currentFile.name.substring(0, lastDotIndex) : currentFile.name;
    const extension = hasExtension ? currentFile.name.substring(lastDotIndex) : '';
    let newName = await openDialog({
        title: 'Rename',
        body: `<div class="dialog-field">
                 <label class="dialog-label">New filename</label>
                 <input id="dialogInput" class="dialog-input" type="text" value="${baseName}" autocomplete="off">
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
function filterFiles() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const cards = document.querySelectorAll('.grid .file-card');

    cards.forEach(card => {
        if (card.classList.contains('back-card')) return;

        const name = card.querySelector('.name').innerText.toLowerCase();
        if (name.includes(query)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}

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
        html += `<div onclick="loadMiniExplorer('${parentPath.replace(/'/g, "\\'")}')" class="file-card" style="padding:0.75rem 0.5rem; cursor:pointer; background:var(--grey-4); border:1px solid var(--grey-3);">
                    <div class="icon" style="font-size:1.5rem;">⬅️</div>
                    <div class="name" style="font-size:0.7rem;">Back</div>
                 </div>`;
    }

    data.dirs.forEach(d => {
        const nextPath = moveSelectedFolder ? `${moveSelectedFolder}/${d}` : d;
        html += `<div onclick="loadMiniExplorer('${nextPath.replace(/'/g, "\\'")}')" class="file-card" style="padding:0.75rem 0.5rem; cursor:pointer; border:1px solid transparent; background:var(--white);">
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
        alert("File is already in this folder.");
        return;
    }

    await doMoveRequest(currentFile.path, newPath, targetName);
}

async function doMoveRequest(oldP, newP, tName) {
    const res = await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: oldP, newPath: newP })
    });

    // 409 means File Already Exists
    if (res.status === 409) {
        const renameChoice = await openDialog({
            title: 'File Exists',
            body: `<p class="dialog-msg" style="margin-bottom:0.75rem;">A file named <strong>${tName}</strong> already exists in this destination.</p>
                   <div class="dialog-field">
                     <label class="dialog-label">Rename and move as:</label>
                     <input id="dialogInput" class="dialog-input" type="text" value="${tName}" autocomplete="off">
                   </div>`,
            confirmLabel: 'Rename & Move'
        });

        if (renameChoice && renameChoice !== tName) {
            const dirPath = newP.includes('/') ? newP.substring(0, newP.lastIndexOf('/')) : '';
            const correctNewPath = dirPath ? `${dirPath}/${renameChoice}` : renameChoice;
            await doMoveRequest(oldP, correctNewPath, renameChoice);
        }
    } else if (res.ok) {
        window.location.reload();
    } else {
        await openDialog({ title: 'Error', body: '<p class="dialog-msg">Could not move file.</p>', confirmLabel: 'OK' });
    }
}