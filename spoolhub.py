#!/usr/bin/env python3
"""SpoolHub: Spoolman-backed material management for Klipper multi-material printers."""

from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
DATA_DIR = ROOT / "data"
DB_PATH = Path(os.environ.get("SPOOLHUB_DB", DATA_DIR / "spoolhub.sqlite3"))
PORT = int(os.environ.get("PORT", "8087"))
DEFAULT_SPOOLMAN_URL = os.environ.get("SPOOLMAN_URL", "http://127.0.0.1:7912")
KLIPPER_DECIMAL_RE = re.compile(r"^(?:0|[1-9]\d*)(?:\.\d+)?$")
KLIPPER_INTEGER_RE = re.compile(r"^(?:0|[1-9]\d*)$")


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def clean_url(value: str) -> str:
    return str(value or "").strip().rstrip("/")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS printers (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              moonraker_url TEXT NOT NULL,
              mainsail_url TEXT NOT NULL DEFAULT '',
              enabled INTEGER NOT NULL DEFAULT 1,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS toolheads (
              id TEXT PRIMARY KEY,
              printer_id TEXT NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
              name TEXT NOT NULL,
              klipper_object TEXT NOT NULL,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS spool_profiles (
              spool_id INTEGER PRIMARY KEY,
              pressure_advance REAL,
              retract_length REAL,
              retract_speed REAL,
              nozzle_temperature INTEGER,
              bed_temperature INTEGER,
              chamber_temperature INTEGER,
              part_cooling_fan_speed INTEGER,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS assignments (
              printer_id TEXT NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
              toolhead_id TEXT NOT NULL REFERENCES toolheads(id) ON DELETE CASCADE,
              spool_id INTEGER,
              assigned_at TEXT NOT NULL,
              note TEXT NOT NULL DEFAULT '',
              sync_pending INTEGER NOT NULL DEFAULT 0,
              last_sync_error TEXT NOT NULL DEFAULT '',
              PRIMARY KEY (printer_id, toolhead_id)
            );

            CREATE TABLE IF NOT EXISTS assignment_history (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              printer_id TEXT NOT NULL,
              printer_name TEXT NOT NULL,
              toolhead_id TEXT NOT NULL,
              toolhead_name TEXT NOT NULL,
              spool_id INTEGER,
              previous_spool_id INTEGER,
              action TEXT NOT NULL,
              note TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );
            """
        )
        migrate_schema(conn)
        set_default(conn, "spoolman_url", DEFAULT_SPOOLMAN_URL)
        set_default(conn, "sync_spool_location", "false")
        set_default(conn, "language", "en")
        if conn.execute("SELECT COUNT(*) FROM printers").fetchone()[0] == 0:
            seed_printers(conn)


def migrate_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS spool_profiles (
          spool_id INTEGER PRIMARY KEY,
          pressure_advance REAL,
          retract_length REAL,
          retract_speed REAL,
          nozzle_temperature INTEGER,
          bed_temperature INTEGER,
          chamber_temperature INTEGER,
          part_cooling_fan_speed INTEGER,
          updated_at TEXT NOT NULL
        )
        """
    )
    profile_columns = {row["name"] for row in conn.execute("PRAGMA table_info(spool_profiles)").fetchall()}
    if "part_cooling_fan_speed" not in profile_columns:
        conn.execute("ALTER TABLE spool_profiles ADD COLUMN part_cooling_fan_speed INTEGER")
    printer_columns = {row["name"] for row in conn.execute("PRAGMA table_info(printers)").fetchall()}
    if "mainsail_url" not in printer_columns:
        conn.execute("ALTER TABLE printers ADD COLUMN mainsail_url TEXT NOT NULL DEFAULT ''")
    assignment_columns = {row["name"] for row in conn.execute("PRAGMA table_info(assignments)").fetchall()}
    if "sync_pending" not in assignment_columns:
        conn.execute("ALTER TABLE assignments ADD COLUMN sync_pending INTEGER NOT NULL DEFAULT 0")
    if "last_sync_error" not in assignment_columns:
        conn.execute("ALTER TABLE assignments ADD COLUMN last_sync_error TEXT NOT NULL DEFAULT ''")
    conn.executescript(
        """
        CREATE TRIGGER IF NOT EXISTS assignments_spool_exclusive_insert
        BEFORE INSERT ON assignments
        WHEN NEW.spool_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM assignments
          WHERE spool_id = NEW.spool_id
            AND NOT (printer_id = NEW.printer_id AND toolhead_id = NEW.toolhead_id)
        )
        BEGIN
          SELECT RAISE(ABORT, 'spool_already_assigned');
        END;

        CREATE TRIGGER IF NOT EXISTS assignments_spool_exclusive_update
        BEFORE UPDATE OF spool_id ON assignments
        WHEN NEW.spool_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM assignments
          WHERE spool_id = NEW.spool_id
            AND NOT (printer_id = NEW.printer_id AND toolhead_id = NEW.toolhead_id)
        )
        BEGIN
          SELECT RAISE(ABORT, 'spool_already_assigned');
        END;
        """
    )
    migrate_legacy_toolhead_profiles(conn)


def migrate_legacy_toolhead_profiles(conn: sqlite3.Connection) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(toolheads)").fetchall()}
    legacy_columns = {
        "pressure_advance",
        "retract_length",
        "retract_speed",
        "nozzle_temperature",
        "bed_temperature",
        "chamber_temperature",
    }
    if not legacy_columns.issubset(columns):
        return
    rows = conn.execute(
        """
        SELECT
          a.spool_id,
          t.pressure_advance,
          t.retract_length,
          t.retract_speed,
          t.nozzle_temperature,
          t.bed_temperature,
          t.chamber_temperature
        FROM assignments a
        JOIN toolheads t ON t.printer_id = a.printer_id AND t.id = a.toolhead_id
        LEFT JOIN spool_profiles p ON p.spool_id = a.spool_id
        WHERE a.spool_id IS NOT NULL
          AND p.spool_id IS NULL
          AND (
            t.pressure_advance IS NOT NULL OR
            t.retract_length IS NOT NULL OR
            t.retract_speed IS NOT NULL OR
            t.nozzle_temperature IS NOT NULL OR
            t.bed_temperature IS NOT NULL OR
            t.chamber_temperature IS NOT NULL
          )
        """
    ).fetchall()
    for row in rows:
        conn.execute(
            """
            INSERT OR IGNORE INTO spool_profiles
              (spool_id, pressure_advance, retract_length, retract_speed, nozzle_temperature, bed_temperature, chamber_temperature, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["spool_id"],
                row["pressure_advance"],
                row["retract_length"],
                row["retract_speed"],
                row["nozzle_temperature"],
                row["bed_temperature"],
                row["chamber_temperature"],
                now_iso(),
            ),
        )


def set_default(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
        (key, value),
    )


def seed_printers(conn: sqlite3.Connection) -> None:
    add_printer(
        conn,
        {
            "id": "printer-1",
            "name": "Printer 1",
            "moonrakerUrl": "http://printer-1.local:7125",
            "mainsailUrl": "http://printer-1.local",
            "toolheads": [
                {"id": "printer-1-t0", "name": "T0", "klipperObject": "extruder"},
            ],
        },
        0,
    )


def setting(conn: sqlite3.Connection, key: str, fallback: str = "") -> str:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else fallback


def bool_setting(conn: sqlite3.Connection, key: str) -> bool:
    return setting(conn, key, "false").lower() in {"1", "true", "yes", "on"}


def add_printer(conn: sqlite3.Connection, printer: dict, sort_order: int = 0) -> None:
    ts = now_iso()
    printer_id = printer.get("id") or slug(printer.get("name", "printer"))
    conn.execute(
        """
        INSERT INTO printers (id, name, moonraker_url, mainsail_url, enabled, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          moonraker_url = excluded.moonraker_url,
          mainsail_url = excluded.mainsail_url,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
        """,
        (
            printer_id,
            printer["name"],
            clean_url(printer["moonrakerUrl"]),
            clean_url(printer.get("mainsailUrl") or derive_mainsail_url(printer["moonrakerUrl"])),
            sort_order,
            ts,
            ts,
        ),
    )
    active_toolhead_ids = []
    for index, toolhead in enumerate(printer.get("toolheads") or printer.get("extruders") or []):
        toolhead_id = toolhead.get("id") or f"{printer_id}-t{index}"
        active_toolhead_ids.append(toolhead_id)
        conn.execute(
            """
            INSERT INTO toolheads
              (id, printer_id, name, klipper_object, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              klipper_object = excluded.klipper_object,
              sort_order = excluded.sort_order,
              updated_at = excluded.updated_at
            """,
            (
                toolhead_id,
                printer_id,
                toolhead["name"],
                toolhead.get("klipperObject") or toolhead.get("id") or "extruder",
                index,
                ts,
                ts,
            ),
        )
    if active_toolhead_ids:
        placeholders = ",".join("?" for _ in active_toolhead_ids)
        conn.execute(
            f"DELETE FROM toolheads WHERE printer_id = ? AND id NOT IN ({placeholders})",
            (printer_id, *active_toolhead_ids),
        )
    else:
        conn.execute("DELETE FROM toolheads WHERE printer_id = ?", (printer_id,))


def optional_float(value: object, label: str = "Wert") -> float | None:
    if value in ("", None):
        return None
    if isinstance(value, bool):
        raise ValueError(f"{label} muss eine Klipper-kompatible Zahl sein.")
    text = str(value).strip()
    if not KLIPPER_DECIMAL_RE.fullmatch(text):
        raise ValueError(f"{label} muss eine nicht-negative Klipper-Zahl mit Punkt als Dezimaltrenner sein, z. B. 0.045.")
    return float(text)


def optional_int(value: object, label: str = "Wert") -> int | None:
    if value in ("", None):
        return None
    if isinstance(value, bool):
        raise ValueError(f"{label} muss eine Klipper-kompatible Ganzzahl sein.")
    text = str(value).strip()
    if not KLIPPER_INTEGER_RE.fullmatch(text):
        raise ValueError(f"{label} muss eine nicht-negative ganze Zahl sein, z. B. 215.")
    return int(text)

def optional_percent(value: object, label: str = "Wert") -> int | None:
    result = optional_int(value, label)
    if result is not None and result > 100:
        raise ValueError(f"{label} muss zwischen 0 und 100 Prozent liegen.")
    return result


def row_profile(row: dict | sqlite3.Row | None) -> dict:
    if row is None:
        return {
            "pressureAdvance": None,
            "retractLength": None,
            "retractSpeed": None,
            "nozzleTemperature": None,
            "bedTemperature": None,
            "chamberTemperature": None,
            "partCoolingFanSpeed": None,
        }
    return {
        "pressureAdvance": row["pressure_advance"],
        "retractLength": row["retract_length"],
        "retractSpeed": row["retract_speed"],
        "nozzleTemperature": row["nozzle_temperature"],
        "bedTemperature": row["bed_temperature"],
        "chamberTemperature": row["chamber_temperature"],
        "partCoolingFanSpeed": row["part_cooling_fan_speed"],
    }


def get_spool_profile(conn: sqlite3.Connection, spool_id: int | None) -> dict:
    if spool_id is None:
        return row_profile(None)
    row = conn.execute("SELECT * FROM spool_profiles WHERE spool_id = ?", (spool_id,)).fetchone()
    return row_profile(row)


def save_spool_profile(conn: sqlite3.Connection, spool_id: int, profile: dict) -> dict:
    conn.execute(
        """
        INSERT INTO spool_profiles
          (spool_id, pressure_advance, retract_length, retract_speed, nozzle_temperature, bed_temperature, chamber_temperature, part_cooling_fan_speed, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(spool_id) DO UPDATE SET
          pressure_advance = excluded.pressure_advance,
          retract_length = excluded.retract_length,
          retract_speed = excluded.retract_speed,
          nozzle_temperature = excluded.nozzle_temperature,
          bed_temperature = excluded.bed_temperature,
          chamber_temperature = excluded.chamber_temperature,
          part_cooling_fan_speed = excluded.part_cooling_fan_speed,
          updated_at = excluded.updated_at
            """,
        (
            spool_id,
            optional_float(profile.get("pressureAdvance"), "Pressure Advance"),
            optional_float(profile.get("retractLength"), "Retract Length"),
            optional_float(profile.get("retractSpeed"), "Retract Speed"),
            optional_int(profile.get("nozzleTemperature"), "Düsentemperatur"),
            optional_int(profile.get("bedTemperature"), "Betttemperatur"),
            optional_int(profile.get("chamberTemperature"), "Kammertemperatur"),
            optional_percent(profile.get("partCoolingFanSpeed"), "Bauteillüftergeschwindigkeit"),
            now_iso(),
        ),
    )
    return get_spool_profile(conn, spool_id)


def slug(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value.strip())
    return "-".join(part for part in cleaned.split("-") if part) or f"printer-{int(time.time())}"


def derive_mainsail_url(moonraker_url: str) -> str:
    parsed = urllib.parse.urlparse(clean_url(moonraker_url))
    if not parsed.hostname:
        return ""
    host = f"[{parsed.hostname}]" if ":" in parsed.hostname else parsed.hostname
    scheme = parsed.scheme if parsed.scheme in {"http", "https"} else "http"
    return f"{scheme}://{host}"


def get_config(conn: sqlite3.Connection) -> dict:
    printers = []
    for printer in conn.execute("SELECT * FROM printers ORDER BY sort_order, name"):
        toolheads = [
            {
                "id": row["id"],
                "name": row["name"],
                "klipperObject": row["klipper_object"],
            }
            for row in conn.execute(
                "SELECT * FROM toolheads WHERE printer_id = ? ORDER BY sort_order, name",
                (printer["id"],),
            )
        ]
        printers.append(
            {
                "id": printer["id"],
                "name": printer["name"],
                "moonrakerUrl": printer["moonraker_url"],
                "mainsailUrl": printer["mainsail_url"] or derive_mainsail_url(printer["moonraker_url"]),
                "enabled": bool(printer["enabled"]),
                "toolheads": toolheads,
                "extruders": [
                    {
                        "id": item["id"],
                        "name": item["name"],
                        "klipperObject": item["klipperObject"],
                    }
                    for item in toolheads
                ],
            }
        )
    return {
        "spoolmanUrl": setting(conn, "spoolman_url", DEFAULT_SPOOLMAN_URL),
        "syncSpoolLocation": bool_setting(conn, "sync_spool_location"),
        "language": setting(conn, "language", "en"),
        "printers": printers,
    }


def get_assignments(conn: sqlite3.Connection) -> dict:
    assignments: dict[str, dict[str, dict]] = {}
    rows = conn.execute("SELECT * FROM assignments").fetchall()
    for row in rows:
        assignments.setdefault(row["printer_id"], {})[row["toolhead_id"]] = {
            "spoolId": row["spool_id"],
            "assignedAt": row["assigned_at"],
            "note": row["note"],
            "syncPending": bool(row["sync_pending"]),
            "lastSyncError": row["last_sync_error"],
        }
    return assignments


def get_history(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    rows = conn.execute(
        """
        SELECT * FROM assignment_history
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return [dict(row) for row in rows]


def moonraker_base(printer: sqlite3.Row) -> str:
    return clean_url(printer["moonraker_url"])


def moonraker_print_state(printer: sqlite3.Row) -> str:
    body = http_json(f"{moonraker_base(printer)}/printer/objects/query?print_stats")
    if not isinstance(body, dict):
        return "unknown"
    result = body.get("result") or {}
    status = result.get("status") or {}
    print_stats = status.get("print_stats") or {}
    return str(print_stats.get("state") or "unknown").lower()


def moonraker_klipper_state(printer: sqlite3.Row) -> str:
    body = http_json(f"{moonraker_base(printer)}/printer/info")
    if not isinstance(body, dict):
        return "unknown"
    result = body.get("result") or {}
    return str(result.get("state") or "unknown").lower()


def url_is_reachable(url: str) -> bool:
    if not clean_url(url):
        return False
    request = urllib.request.Request(clean_url(url), headers={"Accept": "text/html,application/json"})
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            response.read(1)
        return True
    except urllib.error.HTTPError:
        return True
    except (urllib.error.URLError, OSError, ValueError):
        return False


def printer_connection_state(printer: sqlite3.Row) -> tuple[str, str, str]:
    try:
        klipper_state = moonraker_klipper_state(printer)
        if klipper_state != "ready":
            raise RuntimeError(f"Klipper is not ready ({klipper_state})")
        print_state = moonraker_print_state(printer)
        if print_state != "unknown":
            return "online", print_state, ""
        reason = "Klipper is not ready"
    except Exception as exc:
        print_state = "unknown"
        reason = str(exc)

    mainsail_url = printer["mainsail_url"] or derive_mainsail_url(printer["moonraker_url"])
    if url_is_reachable(mainsail_url):
        return "mainsail_only", print_state, reason
    return "offline", print_state, "Printer not available"


def mainsail_is_reachable(printer: sqlite3.Row) -> bool:
    mainsail_url = printer["mainsail_url"] or derive_mainsail_url(printer["moonraker_url"])
    return url_is_reachable(mainsail_url)


def toolhead_index(conn: sqlite3.Connection, printer_id: str, toolhead_id: str) -> int:
    rows = conn.execute(
        "SELECT id FROM toolheads WHERE printer_id = ? ORDER BY sort_order, name",
        (printer_id,),
    ).fetchall()
    for index, row in enumerate(rows):
        if row["id"] == toolhead_id:
            return index
    raise ValueError("Toolhead wurde nicht gefunden.")


def save_variable_value(value: object) -> str:
    if value is None:
        return "-1"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return json.dumps(str(value))


def build_save_variables_gcode(index: int, spool_id: int | None, profile: dict) -> str:
    values = {
        "spool_id": spool_id,
        "pressure_advance": profile["pressureAdvance"],
        "retract_length": profile["retractLength"],
        "retract_speed": profile["retractSpeed"],
        "nozzle_temperature": profile["nozzleTemperature"],
        "bed_temperature": profile["bedTemperature"],
        "chamber_temperature": profile["chamberTemperature"],
        "part_cooling_fan_speed": profile["partCoolingFanSpeed"],
    }
    return "\n".join(
        f"SAVE_VARIABLE VARIABLE=spoolhub_t{index}_{key} VALUE={save_variable_value(value)}"
        for key, value in values.items()
    )


def push_local_spool_state(
    conn: sqlite3.Connection,
    printer: sqlite3.Row,
    printer_id: str,
    toolhead_id: str,
    spool_id: int | None,
) -> str:
    index = toolhead_index(conn, printer_id, toolhead_id)
    profile = get_spool_profile(conn, spool_id)
    gcode = build_save_variables_gcode(index, spool_id, profile)
    http_json(f"{moonraker_base(printer)}/printer/gcode/script", "POST", {"script": gcode})
    return gcode


def set_assignment_sync_state(
    conn: sqlite3.Connection,
    printer_id: str,
    toolhead_id: str,
    pending: bool,
    error: str = "",
) -> None:
    conn.execute(
        """
        UPDATE assignments
        SET sync_pending = ?, last_sync_error = ?
        WHERE printer_id = ? AND toolhead_id = ?
        """,
        (1 if pending else 0, error, printer_id, toolhead_id),
    )


def sync_pending_assignments() -> None:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT a.printer_id, a.toolhead_id, a.spool_id, p.*
            FROM assignments a
            JOIN printers p ON p.id = a.printer_id
            WHERE a.sync_pending = 1 AND p.enabled = 1
            ORDER BY a.assigned_at
            """
        ).fetchall()

    for row in rows:
        connection_state, print_state, reason = printer_connection_state(row)
        if connection_state != "online" or print_state in {"printing", "paused"}:
            error = reason or f"Printer is {print_state}"
            with connect() as conn:
                set_assignment_sync_state(conn, row["printer_id"], row["toolhead_id"], True, error)
            continue
        try:
            with connect() as conn:
                push_local_spool_state(conn, row, row["printer_id"], row["toolhead_id"], row["spool_id"])
                set_assignment_sync_state(conn, row["printer_id"], row["toolhead_id"], False)
        except Exception as exc:
            with connect() as conn:
                set_assignment_sync_state(conn, row["printer_id"], row["toolhead_id"], True, str(exc))


def pending_sync_worker() -> None:
    while True:
        try:
            sync_pending_assignments()
        except Exception as exc:
            print(f"Pending printer synchronization failed: {exc}")
        time.sleep(10)


def build_profile_gcode(toolhead: sqlite3.Row, profile: dict, options: dict | None = None) -> str:
    options = options or {}
    include_pressure_advance = bool(options.get("pressureAdvance", True))
    include_retract = bool(options.get("retract", True))
    include_temperatures = bool(options.get("temperatures", True))
    include_part_cooling_fan = bool(options.get("partCoolingFan", True))
    lines = []
    extruder = toolhead["klipper_object"]
    if include_pressure_advance and profile["pressureAdvance"] is not None:
        lines.append(f"SET_PRESSURE_ADVANCE EXTRUDER={extruder} ADVANCE={profile['pressureAdvance']}")
    if include_retract and (profile["retractLength"] is not None or profile["retractSpeed"] is not None):
        parts = ["SET_RETRACTION"]
        if profile["retractLength"] is not None:
            parts.append(f"RETRACT_LENGTH={profile['retractLength']}")
        if profile["retractSpeed"] is not None:
            parts.append(f"RETRACT_SPEED={profile['retractSpeed']}")
        lines.append(" ".join(parts))
    if include_temperatures and profile["nozzleTemperature"] is not None:
        lines.append(f"SET_HEATER_TEMPERATURE HEATER={extruder} TARGET={profile['nozzleTemperature']}")
    if include_temperatures and profile["bedTemperature"] is not None:
        lines.append(f"SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET={profile['bedTemperature']}")
    if include_temperatures and profile["chamberTemperature"] is not None:
        lines.append(f"SET_HEATER_TEMPERATURE HEATER=chamber TARGET={profile['chamberTemperature']}")
    if include_part_cooling_fan and profile["partCoolingFanSpeed"] is not None:
        fan_value = round(profile["partCoolingFanSpeed"] * 255 / 100)
        lines.append(f"M106 S{fan_value}")
    return "\n".join(lines)


def http_json(url: str, method: str = "GET", payload: dict | None = None) -> object:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=8) as response:
        body = response.read().decode("utf-8")
        return json.loads(body) if body else None


def normalize_spoolman_list(body: object) -> list:
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        for key in ("items", "result", "data"):
            if isinstance(body.get(key), list):
                return body[key]
    return []


def normalize_spool(spool: dict) -> dict:
    filament = spool.get("filament") or {}
    vendor = filament.get("vendor") or {}
    material = filament.get("material") or spool.get("material") or "Material"
    color = (
        filament.get("color_hex")
        or filament.get("color")
        or spool.get("color_hex")
        or spool.get("color")
        or "#49b6a8"
    )
    return {
        "id": spool.get("id"),
        "name": spool.get("name") or filament.get("name") or f"{material} #{spool.get('id')}",
        "material": material,
        "color": color if str(color).startswith("#") else f"#{color}",
        "vendor": vendor.get("name") or filament.get("vendor_name") or spool.get("vendor_name") or "",
        "filamentName": filament.get("name") or "",
        "remainingWeight": spool.get("remaining_weight", spool.get("remaining_weight_g")),
        "usedWeight": spool.get("used_weight", spool.get("used_weight_g")),
        "spoolWeight": spool.get("spool_weight", spool.get("spool_weight_g")),
        "location": spool.get("location") or "",
        "archived": bool(spool.get("archived")),
        "raw": spool,
    }


def spoolman_spools(conn: sqlite3.Connection) -> list[dict]:
    base = clean_url(setting(conn, "spoolman_url", DEFAULT_SPOOLMAN_URL))
    body = http_json(f"{base}/api/v1/spool?allow_archived=false")
    spools = [normalize_spool(item) for item in normalize_spoolman_list(body)]
    for spool in spools:
        spool["profile"] = get_spool_profile(conn, spool.get("id"))
    return spools


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def log_message(self, format: str, *args) -> None:
        print(f"[spoolhub] {self.address_string()} - {format % args}")

    def send_json(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status: int, message: str, details: str = "") -> None:
        self.send_json(status, {"error": message, "details": details})

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self) -> None:
        if self.path.startswith("/api/"):
            self.handle_api("GET")
        else:
            super().do_GET()

    def do_POST(self) -> None:
        self.handle_api("POST")

    def do_PUT(self) -> None:
        self.handle_api("PUT")

    def do_DELETE(self) -> None:
        self.handle_api("DELETE")

    def handle_api(self, method: str) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        try:
            with connect() as conn:
                if method == "GET" and path == "/api/config":
                    return self.send_json(HTTPStatus.OK, get_config(conn))

                if method == "PUT" and path == "/api/config":
                    body = self.read_json()
                    conn.execute(
                        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                        ("spoolman_url", clean_url(body.get("spoolmanUrl", DEFAULT_SPOOLMAN_URL))),
                    )
                    conn.execute(
                        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                        ("sync_spool_location", "true" if body.get("syncSpoolLocation") else "false"),
                    )
                    conn.execute(
                        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                        ("language", str(body.get("language") or setting(conn, "language", "en")).strip().lower()),
                    )
                    active_printer_ids = []
                    for index, printer in enumerate(body.get("printers", [])):
                        add_printer(conn, printer, index)
                        active_printer_ids.append(printer.get("id") or slug(printer.get("name", "printer")))
                    if active_printer_ids:
                        placeholders = ",".join("?" for _ in active_printer_ids)
                        conn.execute(
                            f"DELETE FROM printers WHERE id NOT IN ({placeholders})",
                            tuple(active_printer_ids),
                        )
                    else:
                        conn.execute("DELETE FROM printers")
                    return self.send_json(HTTPStatus.OK, get_config(conn))

                if method == "GET" and path == "/api/printers":
                    return self.send_json(HTTPStatus.OK, get_config(conn)["printers"])

                if method == "POST" and path == "/api/printers":
                    body = self.read_json()
                    add_printer(conn, body, 999)
                    return self.send_json(HTTPStatus.CREATED, get_config(conn))

                if method == "GET" and path == "/api/assignments":
                    return self.send_json(HTTPStatus.OK, get_assignments(conn))

                if method == "GET" and path == "/api/history":
                    limit = int(query.get("limit", ["50"])[0])
                    return self.send_json(HTTPStatus.OK, get_history(conn, limit))

                if method == "GET" and path == "/api/spoolman/status":
                    base = clean_url(setting(conn, "spoolman_url", DEFAULT_SPOOLMAN_URL))
                    return self.send_json(HTTPStatus.OK, {"ok": True, "info": http_json(f"{base}/api/v1/info")})

                if method == "GET" and path == "/api/spoolman/spools":
                    return self.send_json(HTTPStatus.OK, spoolman_spools(conn))

                parts = path.strip("/").split("/")
                if len(parts) == 3 and parts[:2] == ["api", "spool-profiles"]:
                    spool_id = int(parts[2])
                    if method == "GET":
                        return self.send_json(HTTPStatus.OK, get_spool_profile(conn, spool_id))
                    if method == "PUT":
                        return self.save_profile(conn, spool_id)

                if method == "GET" and path.startswith("/api/moonraker/") and path.endswith("/status"):
                    printer_id = path.split("/")[3]
                    return self.send_json(HTTPStatus.OK, self.moonraker_status(conn, printer_id))

                if method == "POST" and path.startswith("/api/moonraker/") and path.endswith("/apply-profile"):
                    parts = path.strip("/").split("/")
                    if len(parts) == 5:
                        return self.apply_profile(conn, urllib.parse.unquote(parts[2]), urllib.parse.unquote(parts[3]))

                if len(parts) == 4 and parts[:2] == ["api", "assignments"] and method == "PUT":
                    return self.assign(conn, urllib.parse.unquote(parts[2]), urllib.parse.unquote(parts[3]))

                return self.send_error_json(HTTPStatus.NOT_FOUND, "API-Endpunkt wurde nicht gefunden.")
        except urllib.error.URLError as exc:
            self.send_error_json(HTTPStatus.BAD_GATEWAY, "Externer Dienst ist nicht erreichbar.", str(exc))
        except sqlite3.IntegrityError as exc:
            if "spool_already_assigned" in str(exc):
                self.send_error_json(HTTPStatus.CONFLICT, "Die Spule ist bereits einem anderen Toolhead zugewiesen.")
            else:
                self.send_error_json(HTTPStatus.CONFLICT, "Datenbankkonflikt.", str(exc))
        except RuntimeError as exc:
            self.send_error_json(HTTPStatus.CONFLICT, str(exc))
        except Exception as exc:
            self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, "Interner Fehler.", str(exc))

    def save_profile(self, conn: sqlite3.Connection, spool_id: int) -> None:
        body = self.read_json()
        assigned = conn.execute(
            """
            SELECT p.*, a.toolhead_id
            FROM assignments a
            JOIN printers p ON p.id = a.printer_id
            WHERE a.spool_id = ?
            ORDER BY p.sort_order, p.name
            """,
            (spool_id,),
        ).fetchall()
        printer_states = []
        for printer in assigned:
            connection_state, print_state, reason = printer_connection_state(printer)
            if connection_state == "online" and print_state in {"printing", "paused"}:
                return self.send_error_json(
                    HTTPStatus.CONFLICT,
                    f"{printer['name']} druckt gerade oder ist pausiert. Spulen und Spulenprofile können während eines Drucks nicht geändert werden.",
                )
            printer_states.append((printer, connection_state, reason))

        profile = save_spool_profile(conn, spool_id, body)
        pushed = []
        deferred = []
        for printer, connection_state, reason in printer_states:
            if connection_state != "online":
                set_assignment_sync_state(conn, printer["id"], printer["toolhead_id"], True, reason)
                deferred.append({"printerId": printer["id"], "toolheadId": printer["toolhead_id"]})
                continue
            try:
                script = push_local_spool_state(conn, printer, printer["id"], printer["toolhead_id"], spool_id)
                set_assignment_sync_state(conn, printer["id"], printer["toolhead_id"], False)
                pushed.append({"printerId": printer["id"], "toolheadId": printer["toolhead_id"], "script": script})
            except (urllib.error.URLError, OSError) as exc:
                set_assignment_sync_state(conn, printer["id"], printer["toolhead_id"], True, str(exc))
                deferred.append({"printerId": printer["id"], "toolheadId": printer["toolhead_id"]})
        return self.send_json(HTTPStatus.OK, {"profile": profile, "pushed": pushed, "deferred": deferred})

    def assign(self, conn: sqlite3.Connection, printer_id: str, toolhead_id: str) -> None:
        body = self.read_json()
        raw_spool_id = body.get("spoolId")
        spool_id = None if raw_spool_id in ("", None) else int(raw_spool_id)
        note = body.get("note") or ""
        printer = conn.execute("SELECT * FROM printers WHERE id = ?", (printer_id,)).fetchone()
        toolhead = conn.execute(
            "SELECT * FROM toolheads WHERE printer_id = ? AND id = ?",
            (printer_id, toolhead_id),
        ).fetchone()
        if not printer or not toolhead:
            return self.send_error_json(HTTPStatus.NOT_FOUND, "Drucker oder Toolhead wurde nicht gefunden.")

        connection_state, print_state, connection_reason = printer_connection_state(printer)
        if spool_id is not None and connection_state == "offline":
            return self.send_json(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {"error": "Printer not available", "code": "printer_not_available"},
            )
        if connection_state == "online" and print_state in {"printing", "paused"}:
            return self.send_error_json(
                HTTPStatus.CONFLICT,
                f"{printer['name']} druckt gerade oder ist pausiert. Spulen und Spulenprofile können während eines Drucks nicht geändert werden.",
            )
        conn.execute("BEGIN IMMEDIATE")
        if spool_id is not None:
            conflict = conn.execute(
                """
                SELECT
                  a.printer_id,
                  a.toolhead_id,
                  p.name AS printer_name,
                  t.name AS toolhead_name
                FROM assignments a
                JOIN printers p ON p.id = a.printer_id
                JOIN toolheads t ON t.printer_id = a.printer_id AND t.id = a.toolhead_id
                WHERE a.spool_id = ?
                  AND NOT (a.printer_id = ? AND a.toolhead_id = ?)
                LIMIT 1
                """,
                (spool_id, printer_id, toolhead_id),
            ).fetchone()
            if conflict:
                if setting(conn, "language", "en") == "de":
                    message = (
                        f"Diese Spule ist bereits {conflict['printer_name']} / "
                        f"{conflict['toolhead_name']} zugewiesen. Entferne dort zuerst die Zuweisung."
                    )
                else:
                    message = (
                        f"This spool is already assigned to {conflict['printer_name']} / "
                        f"{conflict['toolhead_name']}. Remove that assignment first."
                    )
                return self.send_json(
                    HTTPStatus.CONFLICT,
                    {
                        "error": message,
                        "code": "spool_already_assigned",
                        "assignment": {
                            "printerId": conflict["printer_id"],
                            "printerName": conflict["printer_name"],
                            "toolheadId": conflict["toolhead_id"],
                            "toolheadName": conflict["toolhead_name"],
                        },
                    },
                )
        local_script = ""
        sync_pending = connection_state != "online"
        if not sync_pending:
            try:
                local_script = push_local_spool_state(conn, printer, printer_id, toolhead_id, spool_id)
            except (urllib.error.URLError, OSError) as exc:
                if spool_id is not None and not mainsail_is_reachable(printer):
                    return self.send_json(
                        HTTPStatus.SERVICE_UNAVAILABLE,
                        {"error": "Printer not available", "code": "printer_not_available"},
                    )
                sync_pending = True
                connection_reason = f"Klipper is not ready: {exc}"

        previous = conn.execute(
            "SELECT spool_id FROM assignments WHERE printer_id = ? AND toolhead_id = ?",
            (printer_id, toolhead_id),
        ).fetchone()
        previous_spool_id = previous["spool_id"] if previous else None
        action = "unassign" if spool_id is None else "assign"
        ts = now_iso()

        conn.execute(
            """
            INSERT INTO assignments
              (printer_id, toolhead_id, spool_id, assigned_at, note, sync_pending, last_sync_error)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(printer_id, toolhead_id) DO UPDATE SET
              spool_id = excluded.spool_id,
              assigned_at = excluded.assigned_at,
              note = excluded.note,
              sync_pending = excluded.sync_pending,
              last_sync_error = excluded.last_sync_error
            """,
            (
                printer_id,
                toolhead_id,
                spool_id,
                ts,
                note,
                1 if sync_pending else 0,
                connection_reason if sync_pending else "",
            ),
        )
        conn.execute(
            """
            INSERT INTO assignment_history
              (printer_id, printer_name, toolhead_id, toolhead_name, spool_id, previous_spool_id, action, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                printer_id,
                printer["name"],
                toolhead_id,
                toolhead["name"],
                spool_id,
                previous_spool_id,
                action,
                note,
                ts,
            ),
        )

        warning = ""
        if sync_pending:
            warning = "Assignment saved. Waiting for Klipper."
        if spool_id is not None and bool_setting(conn, "sync_spool_location"):
            try:
                base = clean_url(setting(conn, "spoolman_url", DEFAULT_SPOOLMAN_URL))
                http_json(
                    f"{base}/api/v1/spool/{urllib.parse.quote(str(spool_id))}",
                    "PATCH",
                    {"location": f"{printer['name']} / {toolhead['name']}"},
                )
            except Exception as exc:
                location_warning = f"Spoolman location could not be updated: {exc}"
                warning = f"{warning} {location_warning}".strip()

        payload = {
            "assignments": get_assignments(conn),
            "history": get_history(conn, 20),
            "localScript": local_script,
            "pendingSync": sync_pending,
        }
        if warning:
            payload["warning"] = warning
        self.send_json(HTTPStatus.OK, payload)

    def moonraker_status(self, conn: sqlite3.Connection, printer_id: str) -> object:
        printer = conn.execute("SELECT * FROM printers WHERE id = ?", (printer_id,)).fetchone()
        if not printer:
            raise ValueError("Drucker wurde nicht gefunden.")
        toolheads = conn.execute(
            "SELECT klipper_object FROM toolheads WHERE printer_id = ? ORDER BY sort_order",
            (printer_id,),
        ).fetchall()
        objects = ["print_stats", "toolhead", *[row["klipper_object"] for row in toolheads]]
        query = "&".join(urllib.parse.quote(item) for item in objects)
        return http_json(f"{clean_url(printer['moonraker_url'])}/printer/objects/query?{query}")

    def apply_profile(self, conn: sqlite3.Connection, printer_id: str, toolhead_id: str) -> None:
        body = self.read_json()
        printer = conn.execute("SELECT * FROM printers WHERE id = ?", (printer_id,)).fetchone()
        toolhead = conn.execute(
            "SELECT * FROM toolheads WHERE printer_id = ? AND id = ?",
            (printer_id, toolhead_id),
        ).fetchone()
        if not printer or not toolhead:
            return self.send_error_json(HTTPStatus.NOT_FOUND, "Drucker oder Toolhead wurde nicht gefunden.")

        assignment = conn.execute(
            "SELECT spool_id FROM assignments WHERE printer_id = ? AND toolhead_id = ?",
            (printer_id, toolhead_id),
        ).fetchone()
        if not assignment or assignment["spool_id"] is None:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "Diesem Toolhead ist keine Spule zugewiesen.")

        profile = get_spool_profile(conn, assignment["spool_id"])
        gcode = build_profile_gcode(toolhead, profile, body)
        if not gcode:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "Fuer die zugewiesene Spule sind keine aktivierten Profilwerte gesetzt.")

        base = clean_url(printer["moonraker_url"])
        result = http_json(f"{base}/printer/gcode/script", "POST", {"script": gcode})
        self.send_json(
            HTTPStatus.OK,
            {
                "printerId": printer_id,
                "toolheadId": toolhead_id,
                "spoolId": assignment["spool_id"],
                "script": gcode,
                "result": result,
            },
        )


if __name__ == "__main__":
    init_db()
    threading.Thread(target=pending_sync_worker, name="spoolhub-pending-sync", daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"SpoolHub laeuft auf http://localhost:{PORT}")
    print(f"SQLite: {DB_PATH}")
    server.serve_forever()
