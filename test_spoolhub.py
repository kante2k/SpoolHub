import sqlite3
import unittest
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


if __name__ == "__main__":
    unittest.main()
