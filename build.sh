#!/usr/bin/env bash
# build.sh — Assembles the dist/ deployment package from source.
# Run this from the Projects/ root whenever you make changes and want to update dist/.
#
# Usage:  bash build.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="$SCRIPT_DIR/dist"
SERVER_SRC="$SCRIPT_DIR/lifehub"
CLIENT_SRC="$SCRIPT_DIR/lifehub-client"

echo "Building LifeHub deployment package..."

# ── Clean existing dist ──────────────────────────────────────────────────────
rm -rf "$DIST/server" "$DIST/client"
mkdir -p "$DIST/server" "$DIST/client"

# ── Server ───────────────────────────────────────────────────────────────────
echo "  → Copying server files..."
cp -r "$SERVER_SRC/src"              "$DIST/server/src"
cp -r "$SERVER_SRC/public"           "$DIST/server/public"
cp -r "$SERVER_SRC/scripts"          "$DIST/server/scripts"
cp    "$SERVER_SRC/server.js"        "$DIST/server/"
cp    "$SERVER_SRC/package.json"     "$DIST/server/"
cp    "$SERVER_SRC/package-lock.json" "$DIST/server/"
cp    "$SERVER_SRC/Dockerfile"       "$DIST/server/"
cp    "$SERVER_SRC/.dockerignore"    "$DIST/server/"
cp    "$SERVER_SRC/.env.example"     "$DIST/server/"
cp    "$SERVER_SRC/INSTALL.md"       "$DIST/server/"
cp    "$SERVER_SRC/USER_GUIDE.md"    "$DIST/server/"

# ── Client ───────────────────────────────────────────────────────────────────
echo "  → Copying client files..."
cp "$CLIENT_SRC/index.html" "$DIST/client/"
cp "$CLIENT_SRC/app.js"     "$DIST/client/"
cp "$CLIENT_SRC/style.css"  "$DIST/client/"
cp "$CLIENT_SRC/utils.js"   "$DIST/client/"
cp "$CLIENT_SRC/config.js"  "$DIST/client/"


# ── Root files ────────────────────────────────────────────────────────────────
echo "  → Generating dist docker-compose.yml (dist-specific paths)..."
cat > "$DIST/docker-compose.yml" << 'EOF'
version: '3.9'

services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    volumes:
      - mongo_data:/data/db
    environment:
      MONGO_INITDB_DATABASE: lifehub

  api:
    build: ./server
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      MONGODB_URI: mongodb://mongo:27017/lifehub
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-7d}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      APP_URL: ${APP_URL:-http://localhost:3000}
      CLIENT_URL: ${CLIENT_URL:-http://localhost:8080}
      GMAIL_USER: ${GMAIL_USER:-}
      GMAIL_APP_PASSWORD: ${GMAIL_APP_PASSWORD:-}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}
      TELEGRAM_WEBHOOK_URL: ${TELEGRAM_WEBHOOK_URL:-}
      TELEGRAM_USE_POLLING: ${TELEGRAM_USE_POLLING:-false}
    depends_on:
      - mongo

  client:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./client:/usr/share/nginx/html:ro

volumes:
  mongo_data:
EOF

echo "  → Copying .env.example..."
cp "$SCRIPT_DIR/.env.example" "$DIST/"

echo "  → Copying README.md..."
cp "$SCRIPT_DIR/dist-readme.md" "$DIST/README.md"

echo ""
echo "Done. Deployment package is in: $DIST"
echo ""
echo "Contents:"
echo "  dist/"
echo "  ├── README.md"
echo "  ├── docker-compose.yml"
echo "  ├── .env.example"
echo "  ├── server/   (API server + INSTALL.md + USER_GUIDE.md)"
echo "  └── client/   (web app + DEPLOY.md)"
