#!/bin/bash
# deploy.sh — Actualizar VPS con los últimos cambios del repo
# Uso: bash deploy/deploy.sh

set -e
SSH_KEY="$HOME/.ssh/fullstackai_deploy"
VPS="root@185.97.144.72"
REMOTE="/var/www/fullstackai"

echo "🚀 Desplegando en $VPS..."

# ── 1. Sync código (excluye venvs, node_modules, dist, .env) ─────────────────
rsync -avz --progress \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.env' \
    --exclude='agent_runner/.venv' \
    --exclude='LeadUp/backend/.venv' \
    --exclude='LeadUp/frontend/node_modules' \
    --exclude='LeadUp/frontend/dist' \
    -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
    /Users/nicolasag/FullStackAI/ $VPS:$REMOTE/

echo "✅ Código sincronizado"

# ── 2. En el VPS: instalar deps + build + restart ────────────────────────────
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS" << 'REMOTE_SCRIPT'
set -e
cd /var/www/fullstackai

# Actualizar dependencias Python si cambiaron los requirements
agent_runner/.venv/bin/pip install --quiet -r agent_runner/requirements.txt
LeadUp/backend/.venv/bin/pip install --quiet -r LeadUp/backend/requirements.txt

# Reiniciar servicios Python
systemctl restart agent_runner leadup_backend

# Build frontend
cd LeadUp/frontend
npm install --silent
VITE_API_URL=https://leadup.cliender.com/api npm run build
cp -r dist/* /var/www/leadup-frontend/
cd /var/www/fullstackai

# Recargar Nginx
nginx -t && systemctl reload nginx

echo ""
echo "=== Estado de servicios ==="
systemctl is-active agent_runner   && echo "✅ agent_runner: activo"  || echo "❌ agent_runner: caído"
systemctl is-active leadup_backend && echo "✅ leadup_backend: activo" || echo "❌ leadup_backend: caído"
REMOTE_SCRIPT

echo ""
echo "🎉 Deploy completado — https://leadup.cliender.com"
