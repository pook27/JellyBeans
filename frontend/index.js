// --- File Upload Name Preview ---
document.getElementById('fileInput')?.addEventListener('change', function(e) {
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

function openMenu(path, name) {
  currentFile = { path, name };
  document.getElementById('menuTitle').innerText = name;
  document.getElementById('fileMenuOverlay').style.display = 'flex';
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

async function showInfo() {
  closeMenu();
  const res = await fetch('/api/info/' + currentFile.path);
  if (res.ok) {
    const data = await res.json();
    let html = `<b>Name:</b> ${data.name}<br>
                <b>Size on Disk:</b> ${data.size}<br>
                <b>Uploaded:</b> ${data.date}<br>`;
    if (data.dimensions) html += `<b>Resolution:</b> ${data.dimensions}<br>`;
    if (data.words) html += `<b>Word Count:</b> ${data.words} words<br>`;
    
    document.getElementById('infoContent').innerHTML = html;
    document.getElementById('infoOverlay').style.display = 'flex';
  } else {
    alert('Could not fetch file information.');
  }
}

function closeInfo() {
  document.getElementById('infoOverlay').style.display = 'none';
}