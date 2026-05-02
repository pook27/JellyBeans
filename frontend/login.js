document.addEventListener('DOMContentLoaded', async () => {
    const wall = document.getElementById('poster-wall');
    if (!wall) return;

    try {
        const res = await fetch('/api/login-posters');
        const posters = await res.json();
        
        if (!posters || posters.length === 0) return;

        // Utility to shuffle the array so it looks different every time
        const shuffle = (arr) => arr.sort(() => 0.5 - Math.random());

        // Create 4 rows of posters
        const numRows = 4;
        for (let i = 0; i < numRows; i++) {
            const row = document.createElement('div');
            // Alternate direction for every other row
            row.className = `poster-row ${i % 2 === 0 ? 'scroll-left' : 'scroll-right'}`;
            
            // Get a random mix of 12 posters for this row
            const rowPosters = shuffle([...posters]).slice(0, 12);
            
            // Double them up so the CSS marquee loops seamlessly
            const infinitePosters = [...rowPosters, ...rowPosters];
            
            infinitePosters.forEach(src => {
                const img = document.createElement('img');
                img.src = src;
                img.className = 'poster-img';
                row.appendChild(img);
            });
            
            wall.appendChild(row);
        }
    } catch (err) {
        console.error('Failed to load login background posters', err);
    }
});