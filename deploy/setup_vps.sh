#!/bin/bash
# setup_vps.sh — Ejecutar UNA vez en el VPS para preparar el entorno
# ssh root@185.97.144.72 "bash /var/www/fullstackai/deploy/setup_vps.sh"

set -e
echo "=== Setup VPS LeadUp + Agent Runner ==="

# ── 1. Sistema ────────────────────────────────────────────────────────────────
apt-get update -qq
apt-get install -y -qq python3-pip python3-venv python3-dev \
    redis-server nginx certbot python3-certbot-nginx \
    postgresql postgresql-contrib libpq-dev build-essential

# ── 2. Redis ──────────────────────────────────────────────────────────────────
systemctl enable redis-server
systemctl start redis-server
echo "✅ Redis activo"

# ── 3. PostgreSQL — crear DB leadup ──────────────────────────────────────────
PG_USER="fai_user"
PG_PASS="fai_db_2024_secure"

sudo -u postgres psql -c "CREATE USER $PG_USER WITH PASSWORD '$PG_PASS';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE fullstackai OWNER $PG_USER;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE leadup      OWNER $PG_USER;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE fullstackai TO $PG_USER;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE leadup      TO $PG_USER;" 2>/dev/null || true
echo "✅ PostgreSQL: DBs fullstackai + leadup listas"

# ── 4. Virtualenvs Python ─────────────────────────────────────────────────────
cd /var/www/fullstackai

python3 -m venv agent_runner/.venv
agent_runner/.venv/bin/pip install --quiet -r agent_runner/requirements.txt
echo "✅ agent_runner venv OK"

python3 -m venv LeadUp/backend/.venv
LeadUp/backend/.venv/bin/pip install --quiet -r LeadUp/backend/requirements.txt
echo "✅ LeadUp backend venv OK"

# ── 5. Migraciones + seed LeadUp ─────────────────────────────────────────────
agent_runner/.venv/bin/python -m agent_runner.seed_leadup
echo "✅ Plantilla LeadUp creada en DB"

# ── 6. Systemd services ───────────────────────────────────────────────────────
cp deploy/agent_runner.service  /etc/systemd/system/
cp deploy/leadup_backend.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable agent_runner leadup_backend
systemctl restart agent_runner leadup_backend
echo "✅ Servicios systemd activos"

# ── 7. Build frontend LeadUp ─────────────────────────────────────────────────
cd LeadUp/frontend
npm install --silent
VITE_API_URL=https://leadup.cliender.com/api npm run build
mkdir -p /var/www/leadup-frontend
cp -r dist/* /var/www/leadup-frontend/
echo "✅ Frontend copiado a /var/www/leadup-frontend"

# ── 8. Nginx ──────────────────────────────────────────────────────────────────
cd /var/www/fullstackai
cp deploy/leadup.nginx.conf /etc/nginx/sites-available/leadup.cliender.com
ln -sf /etc/nginx/sites-available/leadup.cliender.com \
       /etc/nginx/sites-enabled/leadup.cliender.com
nginx -t && systemctl reload nginx
echo "✅ Nginx configurado para leadup.cliender.com"

# ── 9. HTTPS Let's Encrypt ────────────────────────────────────────────────────
certbot --nginx -d leadup.cliender.com --non-interactive \
    --agree-tos --email brain@cliender.com --redirect
echo "✅ HTTPS activado"

echo ""
echo "============================================"
echo "  LeadUp listo en https://leadup.cliender.com"
echo "============================================"
