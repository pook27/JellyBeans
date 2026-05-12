# 🗂️ VOD File Manager

A self-hosted, password-protected web file manager with deep **Jellyfin integration** — browse, upload, organize, identify, and thumbnail your media library from any browser.

---

## ✨ Features

### 📁 File Management
- **Upload files** — drag-and-drop or click-to-browse, with real-time progress bar
- **Custom filename on upload** — single-file uploads show an editable name field; the original extension is always preserved automatically
- **Multi-file upload** — select and upload multiple files in one batch
- **Download** — download any file directly from the file context menu
- **Rename** — rename files in-place; the extension is preserved unless you explicitly change it
- **Move** — relocate files using a built-in mini folder explorer inside the modal; handles name conflicts with a rename-and-move prompt
- **Delete** — permanently delete files with a confirmation dialog
- **Create folders** — add new subdirectories from any location
- **Bulk Actions & Smart Selection** — Google Drive-style file selection. Hold `Shift + Click` to select a massive range of files, or click to toggle individual items. A floating action bar allows you to **Batch Move**, **Batch Delete**, or **Batch Generate Thumbnails** for all selected items simultaneously.
- **File info panel** — per-file details including size on disk, upload/modification date, image resolution (for image files), and word count (for `.txt`, `.md`, `.csv`, `.srt` files)

### 🎨 UI & Navigation
- **⊞ Grid / ☰ List view** — switchable layout, persisted across sessions via `localStorage`
- **🔍 Live search** — instantly filters visible files in the current directory by name
- **Smart file sorting** — folders always appear first, then files grouped by type (video, image, audio, etc.), then alphabetically within each group
- **Automatic file-type icons** — emoji icons assigned by extension across images, video, audio, archives, executables, code, documents, and web files; unrecognised files fall back to 📄
- **Advanced File Sorting** — Sort your current directory dynamically by **Name**, **Date**, or **Size**. Toggle between Ascending (↑) and Descending (↓) order with a single click. Folders are always smartly pinned to the top of the grid regardless of the sort metric, and your sorting preferences are persisted across sessions.
- **Hidden file filtering** — `-poster.jpg`, `.nfo`, and `.bif` sidecar files are automatically hidden from the UI so your grid stays clean
- **Sticky header** — the toolbar, upload form, and storage bar remain visible while scrolling; a subtle shadow appears when the header is pinned
- **Responsive design** — works on mobile and desktop

### 🔒 Security
- **Session-based authentication** — login wall with server-side session management; all routes are protected by `reqLogin` middleware
- **URL-hopping protection** — navigating directly to a deep directory URL is blocked unless the request carries a valid `Referer` header from the same host; bypasses are silently redirected to the root explorer
- **Path traversal protection** — every file operation validates the resolved absolute path starts with `STORAGE_ROOT` before touching the disk; invalid paths return 403

### 💾 Disk Space Monitoring
- Real-time storage bar at the top of the screen shows used / free / total space
- Fill colour shifts from blue → amber at 75% used → red at 90% used, so storage pressure is instantly visible before uploads

### 🎞️ Jellyfin Integration
- **Poster thumbnails** — fetches and displays official Jellyfin primary-image posters as 2:3 ratio cards in grid view and compact square thumbnails in list view
- **Title overlays** — toggleable `[ Title ]` badge beneath each filename; state persisted via `localStorage`
- **Batch path matching** — a single request resolves all visible file cards at once using exact filesystem-path comparison (no fuzzy guessing), so `Black_Adam_2022_ת.מ_1080P.mkv` correctly resolves to **"Black Adam"**
- **Cinematic login background** — the login page dynamically fetches up to 50 Jellyfin posters and renders them as four animated, alternating-direction rows behind a frosted-glass login panel; degrades gracefully if Jellyfin is unavailable

### 🖼️ Thumbnail Generator
Accessible from the file context menu as **"Create Thumbnail"**:

1. The server reads the file's Jellyfin title (or falls back to the filename)
2. A styled SVG poster is generated server-side at **1000 × 1500 px** using `frontend/logo.png` as the background image (falls back to a dark gradient if the file is missing)
3. Text layout is fully adaptive — font size and characters-per-line scale automatically based on title length (45–100 px), multi-word titles wrap cleanly, and a semi-transparent backdrop is drawn behind the text
4. The SVG is rasterised to JPEG (quality 90%) on the client via `<canvas>` and previewed in the dialog before applying
5. On confirmation, the JPEG is saved to disk alongside the video as `<filename>-poster.jpg` and Jellyfin is triggered to perform a `FullRefresh` on the matched item — so the new thumbnail appears in Jellyfin immediately without a manual library scan

### ⚡ Bulk Thumbnail Generation
Don't want to generate posters one by one? Enter **Select Mode**, choose as many video files as you want, and click **🖼️ Thumbnails** from the bulk action bar. 
- The server will sequentially process every selected video, generate adaptive SVGs, rasterise them, and push them to Jellyfin.
- A live, un-interruptible progress bar modal displays the exact file currently being processed and reports any individual failures at the end of the batch run.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A running [Jellyfin](https://jellyfin.org/) server (optional, for title overlays, poster art, and thumbnail upload)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/pook27/JellyBeans
cd JellyBeans

# 2. Install dependencies
npm install

# 3. Create your environment file
vim .env
# Then edit .env with your values (see Configuration below)

# 4. Start the server
node server.js
```

The app will be available at `http://localhost:<PORT>`.

---

## ⚙️ Configuration

Create a `.env` file in the project root:

```env
# Server
PORT=3000

# Path to the directory that will be served (relative to project root)
STORAGE_PATH=./storage

# Login credentials
ADMIN_USER=admin
ADMIN_PASS=yourpassword

# Session secret (use a long random string in production)
SESSION_SECRET=change_me_to_something_random

# Jellyfin integration (optional — title overlays, posters, and thumbnail upload)
JELLYFIN_URL=http://your-jellyfin-host:8096
API_KEY=your_jellyfin_api_key
```

### Getting a Jellyfin API Key

1. Open Jellyfin → **Dashboard** → **API Keys**
2. Click **+** to create a new key
3. Paste it into `API_KEY` in your `.env`

> **Important:** Your `STORAGE_PATH` and Jellyfin's library paths must point to the **same physical directory** (or the same Docker volume mount). Title and thumbnail matching works by comparing absolute filesystem paths, so they must align exactly.

### Custom Thumbnail Background

Place a file named `logo.png` inside the `frontend/` directory. This image is used as the background for generated poster thumbnails (stretched to fill 1000 × 1500 px). If the file is absent, the generator falls back to a dark blue gradient.

---

## 📁 Project Structure

```
├── server.js              # Express server — all routes and API logic
├── frontend/
│   ├── index.html         # Main explorer template (uses {{mustache}} placeholders)
│   ├── index.js           # Client-side logic (upload, modals, Jellyfin toggle)
│   ├── login.html         # Login page with cinematic poster-wall background
│   ├── login.js           # Fetches Jellyfin posters and builds animated rows
│   ├── style.css          # Full UI stylesheet
│   └── logo.png           # (Optional) Background image for thumbnail generator
├── user_create.py         # Utility: bulk-create numbered Jellyfin user accounts
├── .env                   # Your local config (never committed)
├── .gitignore
└── package.json
```

---

## 🔌 API Reference

All API routes require an active login session unless otherwise noted.

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/login` | Authenticate with username + password |
| `GET` | `/logout` | Destroy session and redirect to login |
| `GET` | `/explorer/*` | Render directory listing UI |
| `POST` | `/upload` | Upload one or more files to a target path |
| `GET` | `/download/*` | Download a file by path |
| `GET` | `/api/info/*` | Get file metadata (size, date, image dimensions, word count) |
| `POST` | `/api/mkdir` | Create a new folder |
| `POST` | `/api/rename` | Rename a file (extension preserved) |
| `POST` | `/api/move` | Move a file (returns 409 on name conflict) |
| `POST` | `/api/list-dirs` | List subdirectories (used by the move dialog's mini explorer) |
| `GET` | `/api/disk-space` | Get used / free / total disk space via `statfs` |
| `POST` | `/api/jellyfin-titles` | Batch-resolve Jellyfin display titles and poster URLs for a list of file paths |
| `GET` | `/api/login-posters` | Return up to 50 Jellyfin poster image URLs for the login background |
| `POST` | `/api/generate-thumbnail` | Generate a styled SVG poster for a given title |
| `POST` | `/api/set-jellyfin-thumbnail` | Save a JPEG poster to disk and trigger a Jellyfin item refresh |

### `POST /api/jellyfin-titles`

Accepts a list of relative file paths and returns a map of `{ relativePath: { title, posterUrl } }` for any files that have an exact path match in the Jellyfin library.

```json
// Request
{ "paths": ["Movies/Black_Adam_2022.mkv", "Movies/Goldfinger.mkv"] }

// Response
{
  "Movies/Black_Adam_2022.mkv": { "title": "Black Adam", "posterUrl": "http://..." },
  "Movies/Goldfinger.mkv":      { "title": "Goldfinger",  "posterUrl": "http://..." }
}
```

Files with no Jellyfin match are omitted — no poster or title badge is shown for them.

### `POST /api/generate-thumbnail`

Accepts `{ "title": "My Movie" }` and returns a raw `image/svg+xml` response. The SVG is 1000 × 1500 px, uses `logo.png` as the background, and auto-sizes the title text based on length.

### `POST /api/set-jellyfin-thumbnail`

Accepts `{ "path": "Movies/file.mkv", "imageBase64": "<jpeg data>" }`. Saves the image as `Movies/file-poster.jpg` alongside the source file, then searches Jellyfin for the matching item and triggers a `FullRefresh` so the thumbnail updates in Jellyfin without a manual scan.

---

## 🎞️ Jellyfin Title Matching — How It Works

The title overlay feature is designed to be **filename-agnostic**. It doesn't try to parse or clean up your filenames to guess the title — instead it uses the filesystem path as a unique identifier:

1. The frontend collects the relative paths of all file cards currently on screen
2. One batch request is sent to `/api/jellyfin-titles`
3. The server fetches **all items** from Jellyfin (`/Items?Recursive=true&Fields=Path`) in a single call
4. Each item's `Path` field (the absolute disk path Jellyfin scanned) is matched against `STORAGE_ROOT + relPath`
5. Only exact matches are returned — there is no fuzzy fallback

This means a file named `Black_Adam_2022_1080P.mkv` correctly resolves to **"Black Adam"** even though the filename shares no resemblance to the title.

---

## 🛠️ Utilities

### `user_create.py` — Bulk Jellyfin User Creation

Creates numbered Jellyfin user accounts in a given range. Reads `API_KEY` from `.env` and writes a shell script (`user_script.sh`) of `curl` commands, which you then execute against your Jellyfin server.

```bash
pip install python-dotenv
python user_create.py
# Then review user_script.sh and run it:
bash user_script.sh
```

By default the script generates accounts for user IDs 100–499 and 600–699 (the range `500–599` is intentionally skipped). Edit the loop bounds in the script to match your needs.

---

## 🐳 Docker Deployment Guide

This guide explains how to containerize JellyBeans using Docker and Docker Compose.

> **Note:** Ensure your environment variables are set correctly before deploying:
> - Use `STORAGE_PATH` (not `MEDIA_ROOT`) and `API_KEY` (not `JELLYFIN_API_KEY`)
> - `ADMIN_USER` and `ADMIN_PASS` are required to access the explorer
> - Do **not** mount your media volume as read-only (`:ro`) — the app needs write access for deletes, renames, and thumbnails

---

### 1. Dockerfile

Create a file named `Dockerfile` in your root directory:

```dockerfile
# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Runtime Stage ----
FROM node:20-alpine
WORKDIR /app

# Create a non-root user for security
RUN addgroup -g 1001 -S jellybeans && \
    adduser -u 1001 -S jellybeans -G jellybeans

# Copy dependencies and application code
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Ensure the user has permissions for the app directory
RUN chown -R jellybeans:jellybeans /app
USER jellybeans

EXPOSE 3000

# ---- Default Environment Variables ----
ENV PORT=3000
ENV STORAGE_PATH=/media
ENV JELLYFIN_URL=http://jellyfin:8096
ENV API_KEY=
ENV SESSION_SECRET=change-me-to-a-random-string
ENV ADMIN_USER=admin
ENV ADMIN_PASS=password123

# Mount your media library here
VOLUME ["/media"]

CMD ["node", "server.js"]
```

---

### 2. Running with Docker CLI

Build the image:

```bash
docker build -t jellybeans .
```

Run the container (ensure the local path has read/write permissions):

```bash
docker run -d \
  --name jellybeans \
  -p 3000:3000 \
  -v /path/to/your/media:/media \
  -e JELLYFIN_URL=http://your-jellyfin-ip:8096 \
  -e API_KEY=your_jellyfin_api_key \
  -e ADMIN_USER=my_user \
  -e ADMIN_PASS=my_strong_password \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  jellybeans
```

---

### 3. Running with Docker Compose

Create a `docker-compose.yml` file for easier management:

```yaml
version: '3.8'
services:
  jellybeans:
    image: jellybeans
    build: .
    container_name: jellybeans
    ports:
      - "3000:3000"
    volumes:
      - /path/to/your/media:/media
    environment:
      - PORT=3000
      - STORAGE_PATH=/media
      - JELLYFIN_URL=http://jellyfin:8096
      - API_KEY=your_api_key_here
      - ADMIN_USER=admin
      - ADMIN_PASS=password123
      - SESSION_SECRET=a-very-secret-string
    restart: unless-stopped
```

---

### ⚙️ Configuration Notes

| Variable | Description |
|---|---|
| `STORAGE_PATH` | Must match the internal path of your volume mount (default: `/media`) |
| `API_KEY` | Your Jellyfin API key |
| `ADMIN_USER` / `ADMIN_PASS` | Login credentials for the JellyBeans explorer |
| `SESSION_SECRET` | A random string used to sign sessions — change before deploying |

> ⚠️ **Security:** Change `ADMIN_USER` and `ADMIN_PASS` from their defaults before deploying to any public-facing server. The app writes `-poster.jpg` files and metadata directly into your media folders, so ensure your Docker volume is mounted with read/write access.

---

## 🛡️ Security Notes

- All file operation routes are protected by `reqLogin` middleware — unauthenticated requests are redirected to `/login.html`
- All file paths are validated against `STORAGE_ROOT` using `startsWith()` before any disk operation — path traversal (e.g. `../../etc/passwd`) is rejected with a 403
- URL-hopping to deep directories is blocked unless the request has a valid `Referer` header from the same host
- Sessions use a configurable `SESSION_SECRET` — set this to a long random value in production
- The app currently supports a single admin account defined in `.env`; there is no multi-user or role system at the application level

---

## 🤝 Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.

---

## 📜 License

MIT
