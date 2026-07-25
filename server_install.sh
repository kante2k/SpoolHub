#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/spoolhub}"
SERVICE_USER="${SERVICE_USER:-pi}"
SERVICE_GROUP="${SERVICE_GROUP:-pi}"
SPOOLMAN_URL="${SPOOLMAN_URL:-http://127.0.0.1:7912}"
PORT="${PORT:-8087}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte mit sudo starten: sudo bash server_install.sh"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 fehlt. Installation mit apt..."
  apt-get update
  apt-get install -y python3
fi

install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$APP_DIR"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$APP_DIR/public"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$APP_DIR/data"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$APP_DIR/deploy"

install -m 0755 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/spoolhub.py" "$APP_DIR/spoolhub.py"
install -m 0755 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/spoolhubctl.py" "$APP_DIR/spoolhubctl.py"
install -m 0755 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/client_install.sh" "$APP_DIR/client_install.sh"
install -m 0755 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/mainsail_patch_install.sh" "$APP_DIR/mainsail_patch_install.sh"
install -m 0755 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/mainsail_patch_uninstall.sh" "$APP_DIR/mainsail_patch_uninstall.sh"
install -m 0755 -o root -g root "$SCRIPT_DIR/client_uninstall.sh" "$APP_DIR/client_uninstall.sh"
install -m 0755 -o root -g root "$SCRIPT_DIR/server_uninstall.sh" "$APP_DIR/server_uninstall.sh"
install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/public/index.html" "$APP_DIR/public/index.html"
install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/public/styles.css" "$APP_DIR/public/styles.css"
install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/public/app.js" "$APP_DIR/public/app.js"
install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/public/i18n.js" "$APP_DIR/public/i18n.js"
install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/public/mainsail.html" "$APP_DIR/public/mainsail.html"
install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/public/mainsail.css" "$APP_DIR/public/mainsail.css"
install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/public/mainsail-panel.js" "$APP_DIR/public/mainsail-panel.js"
install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/deploy/mainsail-integration.md" "$APP_DIR/deploy/mainsail-integration.md"
install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/deploy/spoolhub-mainsail-widget.js" "$APP_DIR/deploy/spoolhub-mainsail-widget.js"
install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/deploy/moonraker-update-manager-spoolhub.conf" "$APP_DIR/deploy/moonraker-update-manager-spoolhub.conf"
install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/deploy/klipper-macros.md" "$APP_DIR/deploy/klipper-macros.md"

cat >/etc/default/spoolhub <<EOF
PORT=$PORT
SPOOLMAN_URL=$SPOOLMAN_URL
SPOOLHUB_DB=$APP_DIR/data/spoolhub.sqlite3
EOF

sed \
  -e "s#__SERVICE_USER__#$SERVICE_USER#g" \
  -e "s#__SERVICE_GROUP__#$SERVICE_GROUP#g" \
  -e "s#__APP_DIR__#$APP_DIR#g" \
  "$SCRIPT_DIR/deploy/spoolhub.service" >/etc/systemd/system/spoolhub.service
chmod 0644 /etc/systemd/system/spoolhub.service

systemctl daemon-reload
systemctl enable spoolhub.service
systemctl restart spoolhub.service

echo "SpoolHub Server wurde installiert."
echo "Status: sudo systemctl status spoolhub --no-pager"
echo "URL: http://$(hostname -I | awk '{print $1}'):$PORT"
echo "Mainsail-Panel: http://$(hostname -I | awk '{print $1}'):$PORT/mainsail.html"
echo "Mainsail bindet das Panel ueber den Client-Installer direkt von dieser Server-Adresse ein."
echo "Server deinstallieren: sudo bash $APP_DIR/server_uninstall.sh"
