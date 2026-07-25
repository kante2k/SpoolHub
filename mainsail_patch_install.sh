#!/usr/bin/env bash
set -euo pipefail

MAINSAIL_ROOT="${MAINSAIL_ROOT:-}"
SPOOLHUB_URL="${SPOOLHUB_URL:-}"
SPOOLHUB_HOST="${SPOOLHUB_HOST:-}"
SPOOLHUB_PORT="${SPOOLHUB_PORT:-8087}"
SPOOLHUB_PRINTER_ID="${SPOOLHUB_PRINTER_ID:-}"
SPOOLHUB_PANEL_URL=""
WIDGET_FILE="spoolhub-mainsail-widget.js"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKER_START="<!-- SpoolHub mainsail menu patch start -->"
MARKER_END="<!-- SpoolHub mainsail menu patch end -->"
LEGACY_MARKER_START="<!-- SpoolHub dashboard widget start -->"
LEGACY_MARKER_END="<!-- SpoolHub dashboard widget end -->"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte mit sudo starten: sudo bash mainsail_patch_install.sh"
  exit 1
fi

detect_mainsail_root() {
  local candidates=(
    "/home/pi/mainsail"
    "/home/mks/mainsail"
    "/usr/share/mainsail"
    "/var/www/mainsail"
    "/opt/mainsail"
  )
  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate/index.html" ]]; then
      printf "%s" "$candidate"
      return
    fi
  done
}

prompt_if_empty() {
  local var_name="$1"
  local prompt="$2"
  local default="$3"
  local current="${!var_name:-}"
  if [[ -z "$current" ]]; then
    read -r -p "$prompt [$default]: " current
    current="${current:-$default}"
    printf -v "$var_name" "%s" "$current"
  fi
}

append_query_param() {
  local url="$1"
  local key="$2"
  local value="$3"
  if [[ -z "$value" ]]; then
    printf "%s" "$url"
  elif [[ "$url" == *"?"* ]]; then
    printf "%s&%s=%s" "$url" "$key" "$value"
  else
    printf "%s?%s=%s" "$url" "$key" "$value"
  fi
}

detected_root="$(detect_mainsail_root || true)"
if [[ -z "$MAINSAIL_ROOT" && -n "$detected_root" ]]; then
  MAINSAIL_ROOT="$detected_root"
fi
if [[ -n "$SPOOLHUB_URL" ]]; then
  SPOOLHUB_PANEL_URL="${SPOOLHUB_URL%/}/mainsail.html"
else
  prompt_if_empty SPOOLHUB_HOST "SpoolHub Server IP oder Hostname" "192.168.1.87"
  if [[ "$SPOOLHUB_HOST" == http://* || "$SPOOLHUB_HOST" == https://* ]]; then
    SPOOLHUB_PANEL_URL="${SPOOLHUB_HOST%/}/mainsail.html"
  else
    SPOOLHUB_PANEL_URL="http://${SPOOLHUB_HOST}:${SPOOLHUB_PORT}/mainsail.html"
  fi
fi
if [[ -n "$SPOOLHUB_PRINTER_ID" && "$SPOOLHUB_PANEL_URL" != *"printer="* ]]; then
  SPOOLHUB_PANEL_URL="$(append_query_param "$SPOOLHUB_PANEL_URL" "printer" "$SPOOLHUB_PRINTER_ID")"
fi
prompt_if_empty MAINSAIL_ROOT "Mainsail Webroot mit index.html" "/home/pi/mainsail"

index_file="$MAINSAIL_ROOT/index.html"
if [[ ! -f "$index_file" ]]; then
  echo "index.html nicht gefunden: $index_file"
  exit 1
fi

install -m 0644 "$SCRIPT_DIR/deploy/$WIDGET_FILE" "$MAINSAIL_ROOT/$WIDGET_FILE"

backup_file="$index_file.spoolhub.bak.$(date +%Y%m%d%H%M%S)"
cp "$index_file" "$backup_file"

cache_buster="$(date +%s)"
python3 - "$index_file" "$SPOOLHUB_PANEL_URL" "$MARKER_START" "$MARKER_END" "$WIDGET_FILE" "$cache_buster" "$LEGACY_MARKER_START" "$LEGACY_MARKER_END" <<'PY'
from pathlib import Path
import re
import sys

index = Path(sys.argv[1])
panel_url = sys.argv[2]
marker_start = sys.argv[3]
marker_end = sys.argv[4]
widget_file = sys.argv[5]
cache_buster = sys.argv[6]
legacy_marker_start = sys.argv[7]
legacy_marker_end = sys.argv[8]

content = index.read_text(encoding="utf-8")
for start, end in ((marker_start, marker_end), (legacy_marker_start, legacy_marker_end)):
    while start in content and end in content:
        before = content.split(start, 1)[0]
        after = content.split(end, 1)[1]
        content = before + after

# Remove orphaned script tags from older or interrupted installations.
content = re.sub(
    r'\s*<script\b[^>]*\bsrc=["\'][^"\']*spoolhub-mainsail-widget\.js[^"\']*["\'][^>]*>\s*</script>\s*',
    "\n",
    content,
    flags=re.IGNORECASE,
)

snippet = (
    f"\n{marker_start}\n"
    f'<script defer src="/{widget_file}?v={cache_buster}" data-spoolhub-src="{panel_url}"></script>\n'
    f"{marker_end}\n"
)

if "</body>" in content:
    content = content.replace("</body>", snippet + "</body>", 1)
else:
    content += snippet

index.write_text(content, encoding="utf-8")
PY

echo "SpoolHub Menue-Reiter wurde in Mainsail installiert."
echo "Mainsail index: $index_file"
echo "Backup: $backup_file"
echo "Patch-Datei: $MAINSAIL_ROOT/$WIDGET_FILE"
echo "Panel URL: $SPOOLHUB_PANEL_URL"
echo "Browser-Cache-Buster: $cache_buster"
echo
echo "Falls Mainsail schon offen ist: Seite hart neu laden, z. B. mit Strg+F5."
echo "Zum Entfernen: sudo MAINSAIL_ROOT=$MAINSAIL_ROOT bash mainsail_patch_uninstall.sh"
