#!/usr/bin/env bash
set -euo pipefail

MAINSAIL_ROOT="${MAINSAIL_ROOT:-}"
WIDGET_FILE="spoolhub-mainsail-widget.js"
MARKER_START="<!-- SpoolHub mainsail menu patch start -->"
MARKER_END="<!-- SpoolHub mainsail menu patch end -->"
LEGACY_MARKER_START="<!-- SpoolHub dashboard widget start -->"
LEGACY_MARKER_END="<!-- SpoolHub dashboard widget end -->"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte mit sudo starten: sudo bash mainsail_patch_uninstall.sh"
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

if [[ -z "$MAINSAIL_ROOT" ]]; then
  MAINSAIL_ROOT="$(detect_mainsail_root || true)"
fi

if [[ -z "$MAINSAIL_ROOT" ]]; then
  echo "Mainsail Webroot nicht gefunden. Setze MAINSAIL_ROOT=/pfad/zu/mainsail."
  exit 1
fi

index_file="$MAINSAIL_ROOT/index.html"
if [[ ! -f "$index_file" ]]; then
  echo "index.html nicht gefunden: $index_file"
  exit 1
fi

backup_file="$index_file.spoolhub-uninstall.bak.$(date +%Y%m%d%H%M%S)"
cp "$index_file" "$backup_file"

python3 - "$index_file" "$MARKER_START" "$MARKER_END" "$LEGACY_MARKER_START" "$LEGACY_MARKER_END" <<'PY'
from pathlib import Path
import re
import sys

index = Path(sys.argv[1])
markers = [(sys.argv[2], sys.argv[3]), (sys.argv[4], sys.argv[5])]

content = index.read_text(encoding="utf-8")
for marker_start, marker_end in markers:
    while marker_start in content and marker_end in content:
        before = content.split(marker_start, 1)[0]
        after = content.split(marker_end, 1)[1]
        content = before + after
content = re.sub(
    r'\s*<script\b[^>]*\bsrc=["\'][^"\']*spoolhub-mainsail-widget\.js[^"\']*["\'][^>]*>\s*</script>\s*',
    "\n",
    content,
    flags=re.IGNORECASE,
)
index.write_text(content, encoding="utf-8")
PY

rm -f "$MAINSAIL_ROOT/$WIDGET_FILE"

echo "SpoolHub Menue-Reiter wurde aus Mainsail entfernt."
echo "Mainsail index: $index_file"
echo "Backup: $backup_file"
