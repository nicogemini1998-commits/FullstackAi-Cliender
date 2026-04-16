#!/bin/bash
# FullStackAI — Instala el servidor como servicio de fondo en macOS
# Se ejecuta UNA sola vez. Después el servidor arranca automáticamente con el ordenador.

set -e

LABEL="com.cliender.fullstackai"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(which node)"

if [ -z "$NODE_BIN" ]; then
  # Buscar en rutas comunes de nvm
  for p in "$HOME/.nvm/versions/node/"*/bin/node; do
    [ -f "$p" ] && NODE_BIN="$p" && break
  done
fi

if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js no encontrado. Instala Node.js primero."
  exit 1
fi

echo "📦 Instalando servicio FullStackAI..."
echo "   Node:    $NODE_BIN"
echo "   Proyecto: $PROJECT_DIR"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$PROJECT_DIR/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/fullstackai.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/fullstackai-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>$HOME</string>
        <key>PATH</key>
        <string>$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
EOF

# Descargar si ya estaba cargado
launchctl unload "$PLIST" 2>/dev/null || true
# Cargar y arrancar ahora
launchctl load "$PLIST"

sleep 2

# Verificar que está corriendo
if curl -s "http://localhost:3001/socket.io/?EIO=4&transport=polling" | grep -q '"sid"'; then
  echo ""
  echo "✅ FullStackAI server activo en localhost:3001"
  echo "   Arrancará automáticamente con tu Mac desde ahora."
  echo "   Ya puedes cerrar esta ventana."
else
  echo ""
  echo "⚠️  El servicio se instaló pero tarda unos segundos en arrancar."
  echo "   Espera 5 segundos y abre el nodo Terminal."
fi
