#!/usr/bin/env bash
set -euo pipefail

CLIENT_DIR="${CLIENT_DIR:-/opt/spoolhub-client}"
DEFAULT_USER="${SUDO_USER:-${USER:-pi}}"
SERVICE_USER="${SERVICE_USER:-$DEFAULT_USER}"
SERVICE_GROUP="${SERVICE_GROUP:-$(id -gn "$SERVICE_USER" 2>/dev/null || echo "$SERVICE_USER")}"
DEFAULT_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"
CONFIG_DIR="${CONFIG_DIR:-${DEFAULT_HOME:-/home/$SERVICE_USER}/printer_data/config}"
SPOOLHUB_HOST="${SPOOLHUB_HOST:-}"
SPOOLHUB_PORT="${SPOOLHUB_PORT:-8087}"
SPOOLHUB_URL="${SPOOLHUB_URL:-}"
PRINTER_ID="${PRINTER_ID:-}"
TOOLHEAD_COUNT="${TOOLHEAD_COUNT:-}"
OUTPUT_FILE="${OUTPUT_FILE:-spoolhub_client.cfg}"
APPLY_PRESSURE_ADVANCE="${APPLY_PRESSURE_ADVANCE:-}"
APPLY_RETRACT="${APPLY_RETRACT:-}"
APPLY_TEMPERATURES="${APPLY_TEMPERATURES:-}"
APPLY_PART_COOLING_FAN="${APPLY_PART_COOLING_FAN:-}"
SAVE_VARIABLES_FILENAME="${SAVE_VARIABLES_FILENAME:-}"
INSTALL_SPOOLMAN_TRACKING="${INSTALL_SPOOLMAN_TRACKING:-}"
SPOOLMAN_URL="${SPOOLMAN_URL:-}"
SPOOLMAN_SYNC_RATE="${SPOOLMAN_SYNC_RATE:-5}"
MOONRAKER_CONFIG="${MOONRAKER_CONFIG:-}"
MOONRAKER_SERVICE="${MOONRAKER_SERVICE:-moonraker}"
INSTALL_MAINSAIL_MENU="${INSTALL_MAINSAIL_MENU:-}"
MANIFEST="${MANIFEST:-/etc/default/spoolhub-client}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte mit sudo starten: sudo bash client_install.sh"
  echo "Du kannst Variablen mitgeben, z. B.:"
  echo "sudo SPOOLHUB_HOST=192.168.1.87 PRINTER_ID=voron TOOLHEAD_COUNT=2 bash client_install.sh"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 fehlt. Installation mit apt..."
  apt-get update
  apt-get install -y python3
fi

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

prompt_yes_no_if_empty() {
  local var_name="$1"
  local prompt="$2"
  local default="$3"
  local current="${!var_name:-}"
  while [[ -z "$current" ]]; do
    read -r -p "$prompt [$default]: " current
    current="${current:-$default}"
    case "${current,,}" in
      y|yes|true|1|on)
        printf -v "$var_name" "%s" "true"
        return
        ;;
      n|no|false|0|off)
        printf -v "$var_name" "%s" "false"
        return
        ;;
      *)
        echo "Bitte y oder n eingeben."
        current=""
        ;;
    esac
  done
  case "${current,,}" in
    y|yes|true|1|on)
      printf -v "$var_name" "%s" "true"
      ;;
    n|no|false|0|off)
      printf -v "$var_name" "%s" "false"
      ;;
    *)
      echo "Ungueltiger Wert fuer $var_name: $current"
      echo "Erlaubt sind y/n oder true/false."
      exit 1
      ;;
  esac
}

expand_user_path() {
  local value="$1"
  if [[ "$value" == "~/"* ]]; then
    printf "%s/%s" "${DEFAULT_HOME:-/home/$SERVICE_USER}" "${value#~/}"
  else
    printf "%s" "$value"
  fi
}

check_http_url() {
  local url="$1"
  python3 - "$url" <<'PY'
import sys
import urllib.request

url = sys.argv[1]
try:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=6) as response:
        if 200 <= response.status < 300:
            raise SystemExit(0)
        print(f"HTTP {response.status}", file=sys.stderr)
except Exception as exc:
    print(exc, file=sys.stderr)
    raise SystemExit(1)
PY
}

derive_spoolman_url() {
  python3 - "$SPOOLHUB_URL" <<'PY'
import sys
from urllib.parse import urlparse

parsed = urlparse(sys.argv[1])
scheme = parsed.scheme or "http"
host = parsed.hostname or "127.0.0.1"
print(f"{scheme}://{host}:7912")
PY
}

detect_save_variables_filename() {
  python3 - "$CONFIG_DIR" "$OUTPUT_FILE" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1]).expanduser()
output_name = sys.argv[2]
found = []
for path in sorted(root.rglob("*.cfg")):
    if path.name == output_name:
        continue
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        continue
    in_section = False
    for raw_line in lines:
        line = raw_line.split("#", 1)[0].strip()
        if line.startswith("[") and line.endswith("]"):
            in_section = line.lower() == "[save_variables]"
            continue
        if in_section and line.lower().startswith("filename:"):
            value = line.split(":", 1)[1].strip()
            if value and value not in found:
                found.append(value)
            in_section = False
if len(found) > 1:
    raise SystemExit("Mehrere unterschiedliche save_variables-Dateien gefunden: " + ", ".join(found))
if found:
    print(found[0])
PY
}

patch_moonraker_spoolman() {
  local moonraker_config="$1"
  local spoolman_url="$2"
  local sync_rate="$3"
  python3 - "$moonraker_config" "$spoolman_url" "$sync_rate" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
spoolman_url = sys.argv[2].rstrip("/")
sync_rate = sys.argv[3]
start = "# SpoolHub managed Spoolman start"
end = "# SpoolHub managed Spoolman end"
content = path.read_text(encoding="utf-8") if path.exists() else ""

while start in content and end in content:
    before = content.split(start, 1)[0]
    after = content.split(end, 1)[1]
    content = before.rstrip() + "\n" + after.lstrip("\n")

if re.search(r"(?im)^\s*\[spoolman\]\s*$", content):
    print("existing")
else:
    block = (
        f"\n{start}\n"
        "[spoolman]\n"
        f"server: {spoolman_url}\n"
        f"sync_rate: {sync_rate}\n"
        f"{end}\n"
    )
    path.write_text(content.rstrip() + "\n" + block, encoding="utf-8")
    print("installed")
PY
}

if [[ -z "$SPOOLHUB_URL" ]]; then
  prompt_if_empty SPOOLHUB_HOST "SpoolHub Server IP oder Hostname" "192.168.1.87"
  prompt_if_empty SPOOLHUB_PORT "SpoolHub Server Port" "$SPOOLHUB_PORT"
  if [[ "$SPOOLHUB_HOST" == http://* || "$SPOOLHUB_HOST" == https://* ]]; then
    SPOOLHUB_URL="${SPOOLHUB_HOST%/}"
  else
    SPOOLHUB_URL="http://${SPOOLHUB_HOST}:${SPOOLHUB_PORT}"
  fi
fi
prompt_if_empty PRINTER_ID "SpoolHub Drucker-ID aus der Weboberflaeche" "printer-1"
prompt_if_empty CONFIG_DIR "Klipper config Verzeichnis" "$CONFIG_DIR"
prompt_if_empty OUTPUT_FILE "Name der Include-Datei" "$OUTPUT_FILE"
prompt_yes_no_if_empty APPLY_PRESSURE_ADVANCE "Pressure Advance beim Toolhead-Makro anwenden? y/n" "y"
prompt_yes_no_if_empty APPLY_RETRACT "Retract beim Toolhead-Makro anwenden? y/n" "y"
prompt_yes_no_if_empty APPLY_TEMPERATURES "Temperaturen beim Toolhead-Makro anwenden? y/n" "y"
prompt_yes_no_if_empty APPLY_PART_COOLING_FAN "Bauteillueftergeschwindigkeit beim Toolhead-Makro anwenden? y/n" "y"
detected_save_variables="$(detect_save_variables_filename)"
if [[ -n "$detected_save_variables" ]]; then
  if [[ -n "$SAVE_VARIABLES_FILENAME" && "$SAVE_VARIABLES_FILENAME" != "$detected_save_variables" ]]; then
    echo "Konflikt bei save_variables: gefunden '$detected_save_variables', vorgegeben '$SAVE_VARIABLES_FILENAME'."
    echo "SpoolHub verwendet keine zweite save_variables-Datei. Entferne die abweichende Vorgabe."
    exit 1
  fi
  SAVE_VARIABLES_FILENAME="$detected_save_variables"
  include_save_variables="false"
else
  SAVE_VARIABLES_FILENAME="${SAVE_VARIABLES_FILENAME:-~/printer_data/config/saved_vars.cfg}"
  include_save_variables="true"
fi
prompt_yes_no_if_empty INSTALL_SPOOLMAN_TRACKING "Spoolman-Verbrauch pro aktivem Toolhead ueber Moonraker erfassen? y/n" "y"
if [[ "$INSTALL_SPOOLMAN_TRACKING" == "true" ]]; then
  SPOOLMAN_URL="${SPOOLMAN_URL:-$(derive_spoolman_url)}"
  MOONRAKER_CONFIG="${MOONRAKER_CONFIG:-$CONFIG_DIR/moonraker.conf}"
fi
prompt_if_empty TOOLHEAD_COUNT "Notfall-Anzahl zu erzeugender Toolhead-Makros, wenn SpoolHub die Toolhead-Liste nicht liefern kann" "1"
prompt_yes_no_if_empty INSTALL_MAINSAIL_MENU "SpoolHub als echten Menuepunkt in Mainsail installieren? y/n" "y"

install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$CLIENT_DIR"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$CLIENT_DIR/deploy"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$CONFIG_DIR"
install -m 0755 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/spoolhubctl.py" "$CLIENT_DIR/spoolhubctl.py"
if [[ -f "$SCRIPT_DIR/mainsail_patch_install.sh" && -f "$SCRIPT_DIR/mainsail_patch_uninstall.sh" ]]; then
  install -m 0755 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/mainsail_patch_install.sh" "$CLIENT_DIR/mainsail_patch_install.sh"
  install -m 0755 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/mainsail_patch_uninstall.sh" "$CLIENT_DIR/mainsail_patch_uninstall.sh"
fi
if [[ -f "$SCRIPT_DIR/client_uninstall.sh" ]]; then
  install -m 0755 -o root -g root "$SCRIPT_DIR/client_uninstall.sh" "$CLIENT_DIR/client_uninstall.sh"
fi
if [[ -f "$SCRIPT_DIR/deploy/spoolhub-mainsail-widget.js" ]]; then
  install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$SCRIPT_DIR/deploy/spoolhub-mainsail-widget.js" "$CLIENT_DIR/deploy/spoolhub-mainsail-widget.js"
fi

target="$CONFIG_DIR/$OUTPUT_FILE"
save_variables_target="$(expand_user_path "$SAVE_VARIABLES_FILENAME")"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$(dirname "$save_variables_target")"
tmp="$(mktemp)"
vars_tmp="$(mktemp)"
cleanup() {
  rm -f "$tmp"
  rm -f "$vars_tmp"
}
trap cleanup EXIT
generate_args=(
  "$CLIENT_DIR/spoolhubctl.py"
  --server "$SPOOLHUB_URL"
  generate-klipper-config
  --printer "$PRINTER_ID"
  --output "$tmp"
  --include-path "$target"
  --client-dir "$CLIENT_DIR"
  --pressure-advance "$APPLY_PRESSURE_ADVANCE"
  --retract "$APPLY_RETRACT"
  --temperatures "$APPLY_TEMPERATURES"
  --part-cooling-fan "$APPLY_PART_COOLING_FAN"
  --spoolman-tracking "$INSTALL_SPOOLMAN_TRACKING"
  --save-variables-filename "$SAVE_VARIABLES_FILENAME"
)
if [[ "$include_save_variables" == "true" ]]; then
  generate_args+=(--include-save-variables)
fi
generate_args+=(--toolhead-count "$TOOLHEAD_COUNT" --allow-fallback)

/usr/bin/python3 "${generate_args[@]}"
install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$tmp" "$target"

variables_args=(
  "$CLIENT_DIR/spoolhubctl.py"
  --server "$SPOOLHUB_URL"
  generate-save-variables-template
  --printer "$PRINTER_ID"
  --output "$vars_tmp"
)
variables_args+=(--toolhead-count "$TOOLHEAD_COUNT" --allow-fallback)
/usr/bin/python3 "${variables_args[@]}"
if [[ ! -e "$save_variables_target" ]]; then
  install -m 0644 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$vars_tmp" "$save_variables_target"
  save_variables_status="angelegt"
  save_variables_created="true"
else
  save_variables_status="bereits vorhanden, nicht ueberschrieben"
  save_variables_created="false"
fi

spoolman_tracking_status="deaktiviert"
if [[ "$INSTALL_SPOOLMAN_TRACKING" == "true" ]]; then
  echo "Pruefe Spoolman-Erreichbarkeit vom Drucker-Host: ${SPOOLMAN_URL%/}/api/v1/health"
  if ! check_http_url "${SPOOLMAN_URL%/}/api/v1/health"; then
    echo "Spoolman ist vom Drucker-Host nicht erreichbar: $SPOOLMAN_URL"
    echo "Setze bei Bedarf SPOOLMAN_URL explizit und starte client_install.sh erneut."
    exit 1
  fi
  if [[ ! -f "$MOONRAKER_CONFIG" ]]; then
    echo "Moonraker-Konfiguration nicht gefunden: $MOONRAKER_CONFIG"
    exit 1
  fi
  moonraker_backup="$MOONRAKER_CONFIG.spoolhub.bak.$(date +%Y%m%d%H%M%S)"
  cp "$MOONRAKER_CONFIG" "$moonraker_backup"
  spoolman_patch_result="$(patch_moonraker_spoolman "$MOONRAKER_CONFIG" "$SPOOLMAN_URL" "$SPOOLMAN_SYNC_RATE")"
  if ! systemctl restart "$MOONRAKER_SERVICE"; then
    cp "$moonraker_backup" "$MOONRAKER_CONFIG"
    systemctl restart "$MOONRAKER_SERVICE" || true
    echo "Moonraker-Neustart fehlgeschlagen. Konfigurationsbackup wurde wiederhergestellt: $moonraker_backup"
    exit 1
  fi
  spoolman_status_url="http://127.0.0.1:7125/server/spoolman/status"
  spoolman_ready="false"
  for _ in {1..15}; do
    if check_http_url "$spoolman_status_url" >/dev/null 2>&1; then
      spoolman_ready="true"
      break
    fi
    sleep 1
  done
  if [[ "$spoolman_ready" != "true" ]]; then
    echo "Moonraker wurde neu gestartet, aber die Spoolman-Komponente ist nicht erreichbar."
    echo "Pruefe: $MOONRAKER_CONFIG und journalctl -u $MOONRAKER_SERVICE -n 100"
    exit 1
  fi
  spoolman_tracking_status="$spoolman_patch_result; $SPOOLMAN_URL"
fi

menu_status="nicht installiert"
if [[ "$INSTALL_MAINSAIL_MENU" == "true" ]]; then
  if [[ ! -x "$CLIENT_DIR/mainsail_patch_install.sh" ]]; then
    echo "Mainsail-Menue-Installer fehlt: $CLIENT_DIR/mainsail_patch_install.sh"
    exit 1
  fi
  SPOOLHUB_URL="$SPOOLHUB_URL" \
  SPOOLHUB_PRINTER_ID="$PRINTER_ID" \
    bash "$CLIENT_DIR/mainsail_patch_install.sh"
  menu_status="installiert (direkte Verbindung zu $SPOOLHUB_URL)"
fi

cat >"$MANIFEST" <<EOF
CLIENT_DIR='$CLIENT_DIR'
CONFIG_DIR='$CONFIG_DIR'
OUTPUT_FILE='$OUTPUT_FILE'
MOONRAKER_CONFIG='$MOONRAKER_CONFIG'
MOONRAKER_SERVICE='$MOONRAKER_SERVICE'
SAVE_VARIABLES_TARGET='$save_variables_target'
SAVE_VARIABLES_CREATED='$save_variables_created'
EOF
chmod 0600 "$MANIFEST"

cleanup
trap - EXIT

echo "SpoolHub Klipper-Client wurde installiert."
echo "Server: $SPOOLHUB_URL"
echo "Apply Pressure Advance: $APPLY_PRESSURE_ADVANCE"
echo "Apply Retract: $APPLY_RETRACT"
echo "Apply Temperatures: $APPLY_TEMPERATURES"
echo "Apply Part Cooling Fan: $APPLY_PART_COOLING_FAN"
echo "Spoolman-Verbrauchstracking: $spoolman_tracking_status"
echo "Notfall-Makroanzahl bei nicht lesbarer Toolhead-Liste: $TOOLHEAD_COUNT"
echo "Save Variables Datei: $save_variables_target ($save_variables_status)"
echo "Helper: $CLIENT_DIR/spoolhubctl.py"
echo "Include: $target"
echo "Mainsail-Menuepunkt: $menu_status"
echo "Mainsail-Menuepunkt spaeter installieren/aktualisieren: sudo SPOOLHUB_URL=$SPOOLHUB_URL SPOOLHUB_PRINTER_ID=$PRINTER_ID bash $CLIENT_DIR/mainsail_patch_install.sh"
echo
echo "Fuege in printer.cfg hinzu:"
echo "[include $target]"
echo
echo "Lokale Optionen inklusive Verbrauchstracking spaeter aendern: [gcode_macro _SPOOLHUB_OPTIONS] in $target bearbeiten und Klipper neu laden."
if [[ "$include_save_variables" == "true" ]]; then
  echo "[save_variables] wurde in $target erzeugt und verwendet $SAVE_VARIABLES_FILENAME."
else
  echo "Vorhandener [save_variables]-Abschnitt wird wiederverwendet: $SAVE_VARIABLES_FILENAME"
fi
echo "Mainsail-Menue-Patch entfernen: sudo bash $CLIENT_DIR/mainsail_patch_uninstall.sh"
echo "Client vollständig deinstallieren: sudo bash $CLIENT_DIR/client_uninstall.sh"
echo "Bei geaenderter Toolhead-Anzahl zuerst SpoolHub-Weboberflaeche anpassen, dann client_install.sh erneut ausfuehren."
