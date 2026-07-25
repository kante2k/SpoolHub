# SpoolHub quickstart

SpoolHub manages spools and material profiles for Klipper-based multi-material printers, especially tool changers and systems with multiple toolheads or separate material paths.

## 1. Install the server

```bash
sudo bash server_install.sh
```

Open:

```text
http://<SERVER-IP>:8087
```

## 2. Configure SpoolHub

In **Settings**:

1. Check the Spoolman URL.
2. Add each printer with a unique ID and its Moonraker URL.
3. Add its toolheads and correct Klipper object names.
4. Save the settings.

Open a spool profile to configure:

- pressure advance
- retract length and speed
- nozzle, bed, and chamber temperature
- part cooling fan speed from 0 to 100 percent

Empty values are not applied. Decimal values use a dot, for example `0.045`.

## 3. Assign spools

Select the spool directly from the dropdown on the matching toolhead. No separate Select or Assign button is required.

SpoolHub shows the Spoolman color, remaining weight, consumption percentage, and current assignment. A spool can belong to only one toolhead. Assignments are locked while Moonraker reports `printing` or `paused`.

## 4. Install the Klipper client

Run on every Klipper/Mainsail printer:

```bash
sudo bash client_install.sh
```

The installer asks which profile sections this printer should apply, including a separate option for the part cooling fan.

Non-interactive example:

```bash
sudo \
  SPOOLHUB_HOST=192.168.1.87 \
  PRINTER_ID=voron \
  TOOLHEAD_COUNT=2 \
  APPLY_PRESSURE_ADVANCE=y \
  APPLY_RETRACT=n \
  APPLY_TEMPERATURES=y \
  APPLY_PART_COOLING_FAN=y \
  INSTALL_MAINSAIL_MENU=y \
  bash client_install.sh
```

## 5. Connect the Klipper macros

Add the generated include to `printer.cfg`:

```ini
[include /home/pi/printer_data/config/spoolhub_client.cfg]
```

Call the matching macro after tool activation and before prime/purge:

```ini
[gcode_macro T0]
gcode:
  # existing tool-change logic
  _SPOOLHUB_APPLY_T0
```

Use `_SPOOLHUB_APPLY_T1`, `_SPOOLHUB_APPLY_T2`, and so on for additional toolheads. Reload Klipper after editing the configuration.

## 6. Change local apply options

Edit the generated `spoolhub_client.cfg`:

```ini
[gcode_macro _SPOOLHUB_OPTIONS]
variable_apply_spool_usage: 1
variable_apply_pressure_advance: 1
variable_apply_retract: 0
variable_apply_temperatures: 1
variable_apply_part_cooling_fan: 1
```

Reload Klipper after changing a value.

## 7. Mainsail

The client installer can add SpoolHub as a regular Mainsail menu item. Hard-refresh Mainsail after installation.

The menu item loads the panel directly from the central SpoolHub server. No local nginx proxy is required.

## 8. Updates

- Web or server changes: update the central SpoolHub server.
- Client macro changes or new profile sections: rerun `client_install.sh` on affected printers.
- Printer ID, toolhead IDs, or toolhead count changed: rerun the client installer.

Spool assignments require SpoolHub and Moonraker to be reachable. During a print, the generated macros use only locally stored values.

## 9. Uninstall

Remove a Klipper client installation:

```bash
sudo bash /opt/spoolhub-client/client_uninstall.sh
```

Remove the central server:

```bash
sudo bash /opt/spoolhub/server_uninstall.sh
```

The server uninstaller asks for confirmation before deleting the database.
