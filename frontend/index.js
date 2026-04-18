// --- File Upload Name Preview ---
document.getElementById('fileInput')?.addEventListener('change', function (e) {
    const nameInput = document.getElementById('customName');
    if (e.target.files.length > 0) {
        nameInput.value = e.target.files[0].name; // Set default text to original name
        nameInput.style.display = 'block';
    } else {
        nameInput.style.display = 'none';
    }
});

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

// --- API Calls ---
async function deleteFile() {
    if (confirm(`Are you sure you want to completely delete "${currentFile.name}"?`)) {
        const res = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentFile.path })
        });
        if (res.ok) window.location.reload();
        else alert('Error deleting file');
    }
}

async function renameFile() {
    const newName = prompt('Enter new filename (include extension):', currentFile.name);
    if (newName && newName !== currentFile.name) {
        const res = await fetch('/api/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentFile.path, newName })
        });
        if (res.ok) window.location.reload();
        else alert('Error renaming file');
    }
}

// --- View Toggle ---
function toggleView() {
    const grid = document.querySelector('.grid');
    const icon = document.getElementById('viewIcon');
    const isList = grid.classList.toggle('list-view');
    icon.textContent = isList ? '⊞' : '☰';
    localStorage.setItem('viewMode', isList ? 'list' : 'grid');
}

// Restore saved preference on load
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
        // Never hide the "Go Back" or "Logout" buttons
        if (card.classList.contains('back-card')) return;

        // Check if the file/folder name includes the search text
        const name = card.querySelector('.name').innerText.toLowerCase();
        if (name.includes(query)) {
            card.style.display = '';     // Show match
        } else {
            card.style.display = 'none'; // Hide non-match
        }
    });
}