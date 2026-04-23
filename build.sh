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

# Keep the DEPLOY.md guide (written once, not from source)
if [ ! -f "$DIST/client/DEPLOY.md" ]; then
  echo "  ⚠  client/DEPLOY.md not found — please restore it from git."
fi

# ── Root files ────────────────────────────────────────────────────────────────
echo "  → Copying root files..."
cp "$SCRIPT_DIR/docker-compose.yml" "$DIST/"
cp "$SCRIPT_DIR/.env.example"       "$DIST/"

# Keep the top-level README.md (written once, not from source)
if [ ! -f "$DIST/README.md" ]; then
  echo "  ⚠  dist/README.md not found — please restore it from git."
fi

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
