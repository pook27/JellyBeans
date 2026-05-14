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

function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    return EXT_ICON[ext] || '📄';
}

// Universal Export: 
// If running in Node.js (Backend), export it. 
// If running in the Browser (Frontend), this is ignored and the functions just become globally available.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EXT_ICON, getFileIcon };
}