#!/usr/bin/env bash
set -euo pipefail

CLIENT_DIR="${CLIENT_DIR:-/opt/spoolhub-client}"
MANIFEST="${MANIFEST:-/etc/default/spoolhub-client}"
DEFAULT_USER="${SUDO_USER:-${USER:-pi}}"
DEFAULT_HOME="$(getent passwd "$DEFAULT_USER" 2>/dev/null | cut -d: -f6)"
CONFIG_DIR="${CONFIG_DIR:-${DEFAULT_HOME:-/home/$DEFAULT_USER}/printer_data/config}"
OUTPUT_FILE="${OUTPUT_FILE:-spoolhub_client.cfg}"
MOONRAKER_CONFIG="${MOONRAKER_CONFIG:-$CONFIG_DIR/moonraker.conf}"
MOONRAKER_SERVICE="${MOONRAKER_SERVICE:-moonraker}"
KLIPPER_SERVICE="${KLIPPER_SERVICE:-klipper}"
MAINSAIL_ROOT="${MAINSAIL_ROOT:-}"
SAVE_VARIABLES_TARGET="${SAVE_VARIABLES_TARGET:-}"
SAVE_VARIABLES_CREATED="${SAVE_VARIABLES_CREATED:-false}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run with sudo: sudo bash client_uninstall.sh"
  exit 1
fi

if [[ -f "$MANIFEST" ]]; then
  # This file is written by client_install.sh and contains only quoted path values.
  # shellcheck disable=SC1090
  source "$MANIFEST"
fi

TARGET="$CONFIG_DIR/$OUTPUT_FILE"
case "$CLIENT_DIR" in
  /*/spoolhub-client) ;;
  *) echo "Unsafe CLIENT_DIR, refusing removal: $CLIENT_DIR"; exit 1 ;;
esac
case "$CONFIG_DIR" in
  /*/printer_data/config|/*/printer_data/config/*) ;;
  *) echo "Unexpected CONFIG_DIR, refusing configuration cleanup: $CONFIG_DIR"; exit 1 ;;
esac

timestamp="$(date +%Y%m%d%H%M%S)"
changed_moonraker="false"
changed_klipper="false"

backup_and_filter() {
  local path="$1"
  local mode="$2"
  [[ -f "$path" ]] || return 0
  local backup="$path.spoolhub-uninstall.bak.$timestamp"
  cp "$path" "$backup"
  python3 - "$path" "$mode" "$TARGET" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
mode = sys.argv[2]
target = sys.argv[3]
content = path.read_text(encoding="utf-8")
original = content

if mode == "moonraker":
    start = "# SpoolHub managed Spoolman start"
    end = "# SpoolHub managed Spoolman end"
    while start in content and end in content:
        before = content.split(start, 1)[0]
        after = content.split(end, 1)[1]
        content = before.rstrip() + "\n" + after.lstrip("\n")
elif mode == "includes":
    target_name = Path(target).name
    lines = []
    for line in content.splitlines(keepends=True):
        stripped = line.split("#", 1)[0].strip()
        match = re.fullmatch(r"\[include\s+(.+?)\]", stripped, flags=re.IGNORECASE)
        if match and (match.group(1).strip() == target or Path(match.group(1).strip()).name == target_name):
            continue
        lines.append(line)
    content = "".join(lines)
elif mode == "variables":
    content = re.sub(
        r"(?im)^\s*spoolhub_t\d+_(?:spool_id|pressure_advance|retract_length|retract_speed|"
        r"nozzle_temperature|bed_temperature|chamber_temperature|part_cooling_fan_speed)\s*=.*(?:\r?\n|$)",
        "",
        content,
    )

if content != original:
    path.write_text(content.rstrip() + "\n", encoding="utf-8")
    print("changed")
else:
    print("unchanged")
PY
}

# Remove the Mainsail menu integration before deleting its helper.
menu_uninstaller="$CLIENT_DIR/mainsail_patch_uninstall.sh"
if [[ -z "$MAINSAIL_ROOT" ]]; then
  for candidate in /home/pi/mainsail /home/mks/mainsail /usr/share/mainsail /var/www/mainsail /opt/mainsail; do
    if [[ -f "$candidate/index.html" ]]; then
      MAINSAIL_ROOT="$candidate"
      break
    fi
  done
fi
if [[ -x "$menu_uninstaller" ]]; then
  if [[ -n "$MAINSAIL_ROOT" ]]; then
    MAINSAIL_ROOT="$MAINSAIL_ROOT" bash "$menu_uninstaller" || true
  else
    bash "$menu_uninstaller" || true
  fi
fi

if [[ "$(backup_and_filter "$MOONRAKER_CONFIG" moonraker)" == "changed" ]]; then
  changed_moonraker="true"
fi

# Remove manually added SpoolHub include lines from Klipper configuration files.
while IFS= read -r -d '' cfg; do
  [[ "$cfg" == "$TARGET" ]] && continue
  if [[ "$(backup_and_filter "$cfg" includes)" == "changed" ]]; then
    changed_klipper="true"
  fi
done < <(find "$CONFIG_DIR" -type f -name '*.cfg' -print0)

# Remove only SpoolHub variables; never delete a shared save_variables file.
while IFS= read -r -d '' variables_file; do
  if grep -qE '^[[:space:]]*spoolhub_t[0-9]+_' "$variables_file"; then
    backup_and_filter "$variables_file" variables >/dev/null
    changed_klipper="true"
  fi
done < <(find "$CONFIG_DIR" -type f \( -name '*.cfg' -o -name '*.conf' \) -print0)

rm -f -- "$TARGET"

if [[ "$SAVE_VARIABLES_CREATED" == "true" && -n "$SAVE_VARIABLES_TARGET" && -f "$SAVE_VARIABLES_TARGET" ]]; then
  if python3 - "$SAVE_VARIABLES_TARGET" <<'PY'
from pathlib import Path
import sys

content = Path(sys.argv[1]).read_text(encoding="utf-8")
meaningful = [
    line.strip()
    for line in content.splitlines()
    if line.strip() and not line.lstrip().startswith("#")
]
raise SystemExit(0 if meaningful in ([], ["[Variables]"]) else 1)
PY
  then
    rm -f -- "$SAVE_VARIABLES_TARGET"
  fi
fi

if [[ -n "$MAINSAIL_ROOT" && -d "$MAINSAIL_ROOT" ]]; then
  find "$MAINSAIL_ROOT" -maxdepth 1 -type f \
    \( -name 'index.html.spoolhub.bak.*' -o -name 'index.html.spoolhub-uninstall.bak.*' \) -delete
fi
find "$CONFIG_DIR" -type f \
  \( -name '*.spoolhub.bak.*' -o -name '*.spoolhub-uninstall.bak.*' \) -delete

if [[ -d "$CLIENT_DIR" ]]; then
  resolved_client="$(readlink -f "$CLIENT_DIR")"
  if [[ "$resolved_client" == */spoolhub-client ]]; then
    rm -rf -- "$resolved_client"
  else
    echo "Resolved CLIENT_DIR is unsafe, not removed: $resolved_client"
  fi
fi
rm -f -- "$MANIFEST"

if [[ "$changed_moonraker" == "true" ]] && systemctl list-unit-files "$MOONRAKER_SERVICE.service" >/dev/null 2>&1; then
  systemctl restart "$MOONRAKER_SERVICE"
fi
if [[ "$changed_klipper" == "true" ]] && systemctl list-unit-files "$KLIPPER_SERVICE.service" >/dev/null 2>&1; then
  systemctl restart "$KLIPPER_SERVICE"
fi

echo "SpoolHub client has been completely removed."
echo "Other Klipper, Moonraker, Mainsail, and save_variables settings were preserved."
