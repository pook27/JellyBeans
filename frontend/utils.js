const EXT_ICON = {
    jpg: 'bi-file-earmark-image', jpeg: 'bi-file-earmark-image', png: 'bi-file-earmark-image', gif: 'bi-file-earmark-image', webp: 'bi-file-earmark-image', svg: 'bi-file-earmark-image', ico: 'bi-file-earmark-image', bmp: 'bi-file-earmark-image', tiff: 'bi-file-earmark-image',
    mp4: 'bi-file-earmark-play', mkv: 'bi-file-earmark-play', mov: 'bi-file-earmark-play', avi: 'bi-file-earmark-play', webm: 'bi-file-earmark-play', flv: 'bi-file-earmark-play', wmv: 'bi-file-earmark-play', m4v: 'bi-file-earmark-play', mpg: 'bi-file-earmark-play', mpeg: 'bi-file-earmark-play',
    mp3: 'bi-file-earmark-music', wav: 'bi-file-earmark-music', flac: 'bi-file-earmark-music', aac: 'bi-file-earmark-music', ogg: 'bi-file-earmark-music', m4a: 'bi-file-earmark-music',
    zip: 'bi-file-earmark-zip', rar: 'bi-file-earmark-zip', tar: 'bi-file-earmark-zip', gz: 'bi-file-earmark-zip', '7z': 'bi-file-earmark-zip', bz2: 'bi-file-earmark-zip',
    exe: 'bi-gear', msi: 'bi-gear', sh: 'bi-terminal', bat: 'bi-terminal', cmd: 'bi-terminal', bin: 'bi-file-earmark-binary', appimage: 'bi-gear', deb: 'bi-box-seam', rpm: 'bi-box-seam',
    js: 'bi-filetype-js', ts: 'bi-filetype-tsx', py: 'bi-filetype-py', java: 'bi-filetype-java', c: 'bi-filetype-c', cpp: 'bi-filetype-cpp', cs: 'bi-filetype-cs', go: 'bi-filetype-go', rs: 'bi-filetype-rs', rb: 'bi-filetype-rb', php: 'bi-filetype-php',
    pdf: 'bi-file-earmark-pdf', doc: 'bi-file-earmark-word', docx: 'bi-file-earmark-word', xls: 'bi-file-earmark-spreadsheet', xlsx: 'bi-file-earmark-spreadsheet', csv: 'bi-filetype-csv', ppt: 'bi-file-earmark-ppt', pptx: 'bi-file-earmark-ppt',
    html: 'bi-filetype-html', htm: 'bi-filetype-html', css: 'bi-filetype-css', json: 'bi-filetype-json', xml: 'bi-file-earmark-code'
};
function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    return '<i class="bi ' + (EXT_ICON[ext] || 'bi-file-earmark') + '" aria-hidden="true"></i>';
}
if (typeof module !== 'undefined' && module.exports) module.exports = { EXT_ICON, getFileIcon };
