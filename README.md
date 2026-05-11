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
