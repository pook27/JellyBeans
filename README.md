# 🗂️ VOD — גח"א File Manager

A self-hosted, password-protected web file manager with deep **Jellyfin integration** — browse, upload, organize, and identify your media library from any browser.

---

## ✨ Features

- **📁 Full file management** — upload, rename, move, delete, and create folders through a clean GUI
- **🔍 Live search** — instantly filter files in the current directory
- **🎞️ Jellyfin title overlay** — toggle Jellyfin display names next to filenames with a single click, matched by exact filesystem path (not filename guessing)
- **⊞ Grid / ☰ List view** — switchable layout, persisted across sessions via localStorage
- **📤 Drag-and-drop uploads** — with real-time progress bar and custom filename support
- **🔒 Session-based authentication** — login wall with server-side session management
- **🚫 URL-hopping protection** — deep directory access requires navigating through the GUI
- **📄 File info panel** — size, upload date, image resolution, and word count per file
- **📱 Responsive design** — works on mobile and desktop

---

## 🖼️ Screenshots

| Grid View | List View with Jellyfin Titles |
|---|---|
| Browse files as icon cards | Compact list with `[ Title ]` overlays |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A running [Jellyfin](https://jellyfin.org/) server (optional, for title overlays)

### Installation

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd <repo-folder>

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
# Then edit .env with your values (see configuration below)

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

# Jellyfin integration (optional)
JELLYFIN_URL=http://your-jellyfin-host:8096
API_KEY=your_jellyfin_api_key
```

### Getting a Jellyfin API Key

1. Open Jellyfin → **Dashboard** → **API Keys**
2. Click **+** to create a new key
3. Paste it into `API_KEY` in your `.env`

> **Important:** Your `STORAGE_PATH` and Jellyfin's library paths must point to the **same physical directory** (or the same Docker volume mount). Title matching works by comparing absolute filesystem paths, so they must align exactly.

---

## 📁 Project Structure

```
├── server.js              # Express server — all routes and API logic
├── frontend/
│   ├── index.html         # Main explorer template (uses {{mustache}} placeholders)
│   ├── index.js           # Client-side logic (upload, modals, Jellyfin toggle)
│   ├── login.html         # Login page
│   └── style.css          # Full UI stylesheet
├── .env                   # Your local config (never committed)
├── .gitignore
└── package.json
```

---

## 🔌 API Reference

All API routes require an active login session.

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/login` | Authenticate with username + password |
| `GET` | `/logout` | Destroy session and redirect to login |
| `GET` | `/explorer/*` | Render directory listing UI |
| `POST` | `/upload` | Upload one or more files to a target path |
| `GET` | `/download/*` | Download a file by path |
| `GET` | `/api/info/*` | Get file metadata (size, date, dimensions, word count) |
| `POST` | `/api/mkdir` | Create a new folder |
| `POST` | `/api/rename` | Rename a file |
| `POST` | `/api/move` | Move a file (with 409 conflict detection) |
| `POST` | `/api/delete` | Permanently delete a file |
| `POST` | `/api/list-dirs` | List subdirectories (used by the move dialog) |
| `POST` | `/api/jellyfin-titles` | Batch-resolve Jellyfin display titles for a list of file paths |

### `POST /api/jellyfin-titles`

Accepts a list of relative file paths and returns a map of `{ relativePath: jellyfinTitle }` for any files that have an exact path match in the Jellyfin library.

```json
// Request
{ "paths": ["Movies/Black_Adam_2022.mkv", "Movies/Goldfinger.mkv"] }

// Response
{ "Movies/Black_Adam_2022.mkv": "Black Adam", "Movies/Goldfinger.mkv": "Goldfinger" }
```

Files with no Jellyfin match are simply omitted from the response — no title badge is shown for them.

---

## 🎞️ Jellyfin Title Matching — How It Works

The title overlay feature is designed to be **filename-agnostic**. It doesn't try to parse or clean up your filenames to guess the title — instead it uses the filesystem path as a unique identifier:

1. The frontend collects the relative paths of all file cards currently on screen
2. One batch request is sent to `/api/jellyfin-titles`
3. The server fetches **all items** from Jellyfin (`/Items?Recursive=true&Fields=Path`) in a single call
4. Each item's `Path` field (the absolute disk path Jellyfin scanned) is matched against `STORAGE_ROOT + relPath`
5. Only exact matches are returned — there is no fuzzy fallback

This means a file named `Black_Adam_2022_ת.מ_1080P.mkv` correctly resolves to **"Black Adam"** even though the filename shares no resemblance to the title.

---

## 🐳 Docker Tips

If you're running this app and Jellyfin in separate Docker containers, make sure both containers mount the media directory at the **same path**:

```yaml
# docker-compose.yml (excerpt)
services:
  vod:
    volumes:
      - /mnt/media:/app/storage   # ← must match what Jellyfin sees

  jellyfin:
    volumes:
      - /mnt/media:/media         # ← Jellyfin stores this path in item.Path
```

In this case, set `STORAGE_PATH=./storage` and ensure `JELLYFIN_URL` points to Jellyfin's internal Docker hostname. If the mount paths differ, the path comparison will fail and no titles will be resolved.

---

## 🛡️ Security Notes

- All file operation routes are protected by `reqLogin` middleware — unauthenticated requests are redirected to `/login.html`
- All file paths are validated against `STORAGE_ROOT` using `startsWith()` before any disk operation — path traversal (e.g. `../../etc/passwd`) is rejected with a 403
- URL-hopping to deep directories is blocked unless the request has a valid `Referer` header from the same host
- Sessions use a configurable `SESSION_SECRET` — set this to a long random value in production

---

## 🤝 Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.

---

## 📜 License

ISC
