#!/usr/bin/env bash
set -euo pipefail

DIST="dist"

echo "==> Cleaning previous build..."
rm -rf "$DIST"
mkdir -p "$DIST/server" "$DIST/client/dist" "$DIST/public/avatars" "$DIST/data"

echo "==> Building client..."
pnpm run build

echo "==> Copying client build..."
cp -r client/dist/ "$DIST/client/dist/"

echo "==> Copying server source..."
cp server/*.js server/package.json "$DIST/server/"
mkdir -p "$DIST/server/routes"
cp server/routes/*.js "$DIST/server/routes/"

echo "==> Skipping server dependency install (run 'npm install --omit=dev' on target server)"

echo "==> Copying avatars..."
cp -r public/avatars/ "$DIST/public/avatars/" 2>/dev/null || true

echo "==> Copying database..."
cp data/mastermind.db data/mastermind.db-shm data/mastermind.db-wal "$DIST/data/" 2>/dev/null || echo "    (no database found — run seed on the target)"

echo "==> Copying .env..."
if [ -f .env ]; then
  cp .env "$DIST/.env"
else
  echo "    (no .env found — create one on the target)"
fi

echo ""
echo "Done! Upload the contents of '$DIST/' to your server."
echo "Start with: node server/index.js"
