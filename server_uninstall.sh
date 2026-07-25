#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/spoolhub}"
SERVICE_NAME="${SERVICE_NAME:-spoolhub.service}"
ENV_FILE="${ENV_FILE:-/etc/default/spoolhub}"
UNIT_FILE="${UNIT_FILE:-/etc/systemd/system/spoolhub.service}"
REMOVE_DATA="${REMOVE_DATA:-}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run with sudo: sudo bash server_uninstall.sh"
  exit 1
fi

case "$APP_DIR" in
  /*/spoolhub) ;;
  *) echo "Unsafe APP_DIR, refusing removal: $APP_DIR"; exit 1 ;;
esac

if [[ -z "$REMOVE_DATA" ]]; then
  read -r -p "Delete the SpoolHub database and all server data permanently? y/N: " REMOVE_DATA
fi
case "${REMOVE_DATA,,}" in
  y|yes|true|1|on) remove_data="true" ;;
  *) remove_data="false" ;;
esac

systemctl disable --now "$SERVICE_NAME" >/dev/null 2>&1 || true
rm -f -- "$UNIT_FILE" "$ENV_FILE"
systemctl daemon-reload
systemctl reset-failed "$SERVICE_NAME" >/dev/null 2>&1 || true

if [[ -d "$APP_DIR" ]]; then
  resolved_app="$(readlink -f "$APP_DIR")"
  if [[ "$resolved_app" != */spoolhub ]]; then
    echo "Resolved APP_DIR is unsafe, not removed: $resolved_app"
    exit 1
  fi
  if [[ "$remove_data" == "true" ]]; then
    rm -rf -- "$resolved_app"
  else
    data_backup="$(dirname "$resolved_app")/spoolhub-data-backup-$(date +%Y%m%d%H%M%S)"
    if [[ -d "$resolved_app/data" ]]; then
      mv -- "$resolved_app/data" "$data_backup"
      echo "Server data preserved at: $data_backup"
    fi
    rm -rf -- "$resolved_app"
  fi
fi

echo "SpoolHub server service, configuration, and application files have been removed."
if [[ "$remove_data" == "true" ]]; then
  echo "The database and all SpoolHub server data were permanently deleted."
else
  echo "The database was preserved. Use REMOVE_DATA=y for a fully destructive uninstall."
fi
