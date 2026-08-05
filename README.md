# SpoolHub

SpoolHub is a central spool and profile management system for multi-material printers running Klipper and Moonraker. It is designed especially for tool changers and printers with multiple toolheads or separate material paths. SpoolHub connects these printers to a shared Spoolman instance and assigns one spool to each toolhead.

## Features

- support for any number of multi-material printers and toolheads
- direct spool assignment through a dropdown
- exclusive assignments: a spool can be active on only one toolhead
- spool icons using the color stored in Spoolman
- remaining weight and consumption data from Spoolman
- profiles for each spool:
  - pressure advance
  - retract length and retract speed
  - nozzle, bed, and chamber temperatures
  - part cooling fan speed as a percentage
- local storage of assigned profiles on each printer
- consumption tracking through Moonraker and Spoolman
- integration as a Mainsail menu item
- English and German user interfaces

SpoolHub blocks assignment and active-profile changes while Moonraker reports `printing` or `paused`. This prevents local print parameters from changing during an active print.

Printer availability is handled in three levels:

- When Klipper is ready, assignments are saved and synchronized immediately.
- When Mainsail is reachable but Klipper is not ready, assignments are saved centrally without sending a Klipper command. Synchronization is retried automatically.
- Moonraker's Spoolman component remains responsible for consumption tracking. If an assignment replaces the spool currently tracked by Moonraker, SpoolHub moves tracking to the replacement spool. Assignments on inactive toolheads do not change the active tracking spool.
- When location synchronization is enabled, SpoolHub clears the previous spool's matching toolhead location before assigning that location to the replacement spool. A location changed manually in Spoolman is preserved.
- When the printer is fully offline, removing a spool remains possible and is synchronized later. Adding a spool returns `Printer not available`.

## Architecture

- The **SpoolHub server** provides the web interface, API, and SQLite database.
- **Spoolman** provides spool information, colors, weights, and consumption data.
- Generated macros on each **Klipper client** store assigned values locally in `save_variables`.
- During a tool change, `_SPOOLHUB_APPLY_T0`, `_SPOOLHUB_APPLY_T1`, and the other generated macros apply only the profile sections enabled on that printer.

The Klipper macros do not require a connection to the SpoolHub server during a print.

## Download from GitHub

Install Git if it is not already available:

```bash
sudo apt-get update
sudo apt-get install -y git
```

Clone the SpoolHub repository:

```bash
git clone https://github.com/kante2k/SpoolHub.git
cd SpoolHub
```

Run the server installer from this directory on the computer that will host SpoolHub. On each Klipper printer, clone the same repository and run the client installer from the cloned directory.

To download future updates:

```bash
cd SpoolHub
git pull --ff-only
```

After pulling an update, rerun the appropriate installer:

```bash
sudo bash server_install.sh
```

or, on a Klipper printer:

```bash
sudo bash client_install.sh
```

The installers copy the required files to their runtime directories. Existing server data, spool profiles, and assignments are preserved when the server installer is run again.

## Server installation

From the cloned repository, run on the computer that should host SpoolHub:

```bash
sudo bash server_install.sh
```

Check the service:

```bash
sudo systemctl status spoolhub --no-pager
```

Open the web interface:

```text
http://<SERVER-IP>:8087
```

If Spoolman runs on the same computer, its usual address is:

```text
http://127.0.0.1:7912
```

The SQLite database is stored at `data/spoolhub.sqlite3` by default.

## Initial setup

In the SpoolHub web interface:

1. Open **Settings** and check the language and Spoolman URL.
2. Add each printer with a unique ID, its Moonraker URL, and its Mainsail URL. The Mainsail URL defaults to the Moonraker host without port `7125`.
3. Add its toolheads with unique IDs and the correct Klipper object names.
4. Load the spools and use **Profile** to enter material-specific values where needed.
5. Select a spool directly from the dropdown on the appropriate toolhead.

### Offline management

A printer can be used as a purely administrative spool location without installing a client or connecting Moonraker. In **Settings**, add the printer, enable **Manage offline only – do not send data to the printer**, and create one toolhead entry for each physical slot (for example `AMS 1 / Slot 1` through `AMS 1 / Slot 4`). Moonraker and Mainsail URLs are not required in this mode.

Assignments and their history are stored centrally as usual. SpoolHub does not query the printer, send G-code, update Moonraker's active spool, queue synchronization attempts, or push profile changes for an offline-managed printer. 

Spools assigned elsewhere are disabled in the dropdown. To move a spool, first select **No spool** or another spool on its current toolhead.

## Klipper client installation

### Required `save_variables` configuration

The `[save_variables]` section is a required part of the SpoolHub client installation. SpoolHub stores the assigned spool IDs and profile values in this Klipper file so that they remain available after a restart and while the SpoolHub server is unavailable.

Before running `client_install.sh`, check whether your Klipper configuration already contains a `[save_variables]` section. If it does not exist, add the following section manually to `printer.cfg`:

```ini
[save_variables]
filename: ~/printer_data/config/saved_vars.cfg
```

Klipper must contain exactly one `[save_variables]` section. Do not add this example if another configuration file or included file already defines one. The client installer detects an existing section and reuses its configured filename.

After adding the section, restart or reload Klipper and then continue with the client installation.

From a local clone of the repository, run on every printer:

```bash
sudo bash client_install.sh
```

The installer asks for:

- the SpoolHub address and printer ID
- the profile sections this printer should apply
- whether the part cooling fan speed should be applied
- whether Moonraker should track Spoolman consumption
- whether the SpoolHub Mainsail menu item should be installed

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
  INSTALL_SPOOLMAN_TRACKING=y \
  INSTALL_MAINSAIL_MENU=y \
  bash client_install.sh
```

`TOOLHEAD_COUNT` is only a fallback used when the installer cannot retrieve the actual toolhead list from SpoolHub.

## Klipper integration

Add the include file printed by the installer to `printer.cfg`:

```ini
[include /home/pi/printer_data/config/spoolhub_client.cfg]
```

Then add the matching SpoolHub macro to each existing tool-change macro:

```ini
[gcode_macro T0]
gcode:
  # existing tool-change logic
  _SPOOLHUB_APPLY_T0
```

Call the macro after tool activation and before prime/purge. SpoolHub does not modify existing tool-change macros and intentionally does not add a generic `START_PRINT` hook.

## Profile sections per printer

The options are stored in `spoolhub_client.cfg`:

```ini
[gcode_macro _SPOOLHUB_OPTIONS]
variable_apply_spool_usage: 1
variable_apply_pressure_advance: 1
variable_apply_retract: 0
variable_apply_temperatures: 1
variable_apply_part_cooling_fan: 1
```

Set a value to `1` to enable that section or `0` to disable it. Reload Klipper after changing these options.

Each successful tool change must call the matching `_SPOOLHUB_APPLY_Tn` macro. The macro uses Moonraker's `spoolman_set_active_spool` remote method, so subsequent extrusion is reported by the standard Moonraker Spoolman integration.

Part cooling fan speed is stored in the spool profile as a value from `0` to `100` percent. SpoolHub automatically converts it to the Klipper `M106` range from `0` to `255`.

## Updating

- Server, database, or web interface changes: rerun `server_install.sh` on the server.
- Generated Klipper macro or client option changes: rerun `client_install.sh` on affected printers.
- Web-only changes do not require a client reinstall.
- Hard-refresh Mainsail or the browser after web updates.

Normal updates preserve existing spool profiles and assignments. New database fields are added automatically when the server starts.

## Uninstalling

Remove SpoolHub from a Klipper client:

```bash
sudo bash /opt/spoolhub-client/client_uninstall.sh
```

The client uninstaller removes the generated Klipper include, SpoolHub variables, the managed Moonraker block, the Mainsail menu integration, and the client files. Shared Klipper, Moonraker, Mainsail, and `save_variables` settings are preserved.

Remove the central server:

```bash
sudo bash /opt/spoolhub/server_uninstall.sh
```

The server uninstaller asks whether the SQLite database and all server data should also be deleted. For a non-interactive complete removal:

```bash
sudo REMOVE_DATA=y bash /opt/spoolhub/server_uninstall.sh
```

## Additional documentation

- [German quickstart](kurzanleitung.md)
- [English quickstart](quickstart.md)
- [Klipper macro integration](deploy/klipper-macros.md)
- [Mainsail integration](deploy/mainsail-integration.md)

## Important notes

- SpoolHub and Moonraker must be reachable when assigning a spool.
- The `[save_variables]` section is a required part of the client installation. Klipper requires exactly one such section, and the installer reuses the existing configuration.
- Profile decimals use a dot, for example `0.045`.
- Rerun the client installer after changing a printer ID or toolhead IDs.
- A spool cannot be assigned to multiple toolheads at the same time.
