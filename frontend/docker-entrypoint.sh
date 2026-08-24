#!/bin/sh
# docker-entrypoint.sh
# 1. Substitute $BACKEND_URL into nginx config
# 2. Substitute $API_BASE_URL into index.html window.__env block
# 3. Start nginx

set -e

# ── 1. Generate nginx conf from template ─────────────────────────────────────
envsubst '${BACKEND_URL}' < /etc/nginx/templates/app.conf.template \
  > /etc/nginx/conf.d/app.conf

# ── 2. Inject API_BASE_URL into the runtime env block in index.html ───────────
# Replaces the literal '$API_BASE_URL' placeholder set during build
API_BASE_URL="${API_BASE_URL:-https://anmardi-backend.onrender.com}"
sed -i "s|\\\$API_BASE_URL|${API_BASE_URL}|g" /usr/share/nginx/html/index.html

echo "[Entrypoint] BACKEND_URL  = ${BACKEND_URL}"
echo "[Entrypoint] API_BASE_URL = ${API_BASE_URL}"

# ── 3. Start nginx ────────────────────────────────────────────────────────────
exec nginx -g "daemon off;"
