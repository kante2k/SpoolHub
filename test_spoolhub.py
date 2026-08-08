import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import call, patch

import spoolhub


class SpoolmanTrackingTests(unittest.TestCase):
    @patch("spoolhub.set_moonraker_active_spool")
    @patch("spoolhub.moonraker_active_spool", return_value=12)
    def test_replaces_active_spool_in_moonraker(self, active_spool, set_active_spool):
        printer = {"moonraker_url": "http://printer:7125"}

        updated = spoolhub.sync_active_spool_after_assignment(printer, 12, 34)

        self.assertTrue(updated)
        active_spool.assert_called_once_with(printer)
        set_active_spool.assert_called_once_with(printer, 34)

    @patch("spoolhub.set_moonraker_active_spool")
    @patch("spoolhub.moonraker_active_spool", return_value=99)
    def test_does_not_replace_an_inactive_toolheads_spool(self, active_spool, set_active_spool):
        printer = {"moonraker_url": "http://printer:7125"}

        updated = spoolhub.sync_active_spool_after_assignment(printer, 12, 34)

        self.assertFalse(updated)
        active_spool.assert_called_once_with(printer)
        set_active_spool.assert_not_called()


class SpoolmanLocationTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES ('spoolman_url', 'http://spoolman:7912')"
        )

    def tearDown(self):
        self.conn.close()

    @patch("spoolhub.http_json")
    def test_clears_matching_old_location_and_sets_new_location(self, http_json):
        http_json.side_effect = [
            {"id": 12, "location": "Printer / T0"},
            None,
            None,
        ]

        spoolhub.sync_spool_locations(self.conn, 12, 34, "Printer / T0")

        self.assertEqual(
            http_json.call_args_list,
            [
                call("http://spoolman:7912/api/v1/spool/12"),
                call("http://spoolman:7912/api/v1/spool/12", "PATCH", {"location": None}),
                call("http://spoolman:7912/api/v1/spool/34", "PATCH", {"location": "Printer / T0"}),
            ],
        )

    @patch("spoolhub.http_json")
    def test_preserves_a_manually_changed_old_location(self, http_json):
        http_json.side_effect = [
            {"id": 12, "location": "Drybox"},
            None,
        ]

        spoolhub.sync_spool_locations(self.conn, 12, 34, "Printer / T0")

        self.assertEqual(
            http_json.call_args_list,
            [
                call("http://spoolman:7912/api/v1/spool/12"),
                call("http://spoolman:7912/api/v1/spool/34", "PATCH", {"location": "Printer / T0"}),
            ],
        )


class ManagedOfflinePrinterTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = spoolhub.DB_PATH
        spoolhub.DB_PATH = Path(self.temp_dir.name) / "spoolhub.sqlite3"
        spoolhub.init_db()
        with closing(spoolhub.connect()) as conn, conn:
            conn.execute("DELETE FROM printers")
            spoolhub.add_printer(
                conn,
                {
                    "id": "bambu-x1c",
                    "name": "Bambu Lab X1C",
                    "connectionMode": "managed",
                    "iconType": "enclosed",
                    "moonrakerUrl": "",
                    "mainsailUrl": "",
                    "toolheads": [
                        {"id": "ams-1-slot-1", "name": "AMS 1 / Slot 1", "klipperObject": ""}
                    ],
                },
            )

    def tearDown(self):
        spoolhub.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def handler(self, body):
        handler = object.__new__(spoolhub.Handler)
        handler.read_json = lambda: body
        handler.response = None
        handler.send_json = lambda status, payload: setattr(handler, "response", (status, payload))
        handler.send_error_json = lambda status, message, details="": setattr(
            handler, "response", (status, {"error": message, "details": details})
        )
        return handler

    def test_config_preserves_managed_mode_and_empty_urls(self):
        with closing(spoolhub.connect()) as conn, conn:
            config = spoolhub.get_config(conn)
            printer = config["printers"][0]

        self.assertEqual(printer["connectionMode"], "managed")
        self.assertEqual(printer["moonrakerUrl"], "")
        self.assertEqual(printer["mainsailUrl"], "")
        self.assertEqual(printer["iconType"], "enclosed")
        self.assertEqual(config["spoolIconStyle"], "contour")

    @patch("spoolhub.sync_active_spool_after_assignment")
    @patch("spoolhub.push_local_spool_state")
    @patch("spoolhub.printer_connection_state")
    def test_assignment_is_saved_without_printer_communication(self, connection_state, push_state, sync_tracking):
        handler = self.handler({"spoolId": 42})

        with closing(spoolhub.connect()) as conn, conn:
            spoolhub.Handler.assign(handler, conn, "bambu-x1c", "ams-1-slot-1")
            assignment = conn.execute(
                "SELECT spool_id, sync_pending, last_sync_error FROM assignments WHERE printer_id = ? AND toolhead_id = ?",
                ("bambu-x1c", "ams-1-slot-1"),
            ).fetchone()

        self.assertEqual(tuple(assignment), (42, 0, ""))
        self.assertFalse(handler.response[1]["pendingSync"])
        connection_state.assert_not_called()
        push_state.assert_not_called()
        sync_tracking.assert_not_called()

    @patch("spoolhub.push_local_spool_state")
    @patch("spoolhub.printer_connection_state")
    def test_profile_update_is_not_sent_or_deferred(self, connection_state, push_state):
        with closing(spoolhub.connect()) as conn, conn:
            conn.execute(
                "INSERT INTO assignments (printer_id, toolhead_id, spool_id, assigned_at) VALUES (?, ?, ?, ?)",
                ("bambu-x1c", "ams-1-slot-1", 42, spoolhub.now_iso()),
            )
        handler = self.handler({"nozzleTemperature": 220})

        with closing(spoolhub.connect()) as conn, conn:
            spoolhub.Handler.save_profile(handler, conn, 42)
            assignment = conn.execute(
                "SELECT sync_pending FROM assignments WHERE printer_id = ? AND toolhead_id = ?",
                ("bambu-x1c", "ams-1-slot-1"),
            ).fetchone()

        self.assertEqual(assignment["sync_pending"], 0)
        self.assertEqual(handler.response[1]["pushed"], [])
        self.assertEqual(handler.response[1]["deferred"], [])
        connection_state.assert_not_called()
        push_state.assert_not_called()

if __name__ == "__main__":
    unittest.main()
