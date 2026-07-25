# Klipper macro integration

SpoolHub is designed for Klipper-based multi-material printers. It stores a separate spool assignment and material profile for every configured toolhead or material path.

SpoolHub writes the assigned spool ID and profile values to Klipper `save_variables`. Generated `_SPOOLHUB_APPLY_Tn` macros read these local values, so they do not contact SpoolHub during a print.

## Installation

Run on each printer:

```bash
sudo bash client_install.sh
```

The installer:

- reads the configured toolheads from SpoolHub
- reuses an existing `[save_variables]` section
- generates `spoolhub_client.cfg`
- optionally configures Moonraker's Spoolman integration
- lets you enable profile sections per printer

`TOOLHEAD_COUNT` is only used as a fallback when the server's toolhead list cannot be read.

## Include the generated configuration

Use the path printed by the installer:

```ini
[include /home/pi/printer_data/config/spoolhub_client.cfg]
```

Klipper must have exactly one `[save_variables]` section. Existing save-variable files are preserved.

## Call the toolhead macros

Add the matching call to each existing toolchange macro:

```ini
[gcode_macro T0]
gcode:
  # existing tool activation
  _SPOOLHUB_APPLY_T0
```

Place the call after successful tool activation and before prime/purge. This ensures that Spoolman tracks subsequent extrusion against the correct spool.

SpoolHub does not modify existing toolchange macros and does not add a generic `START_PRINT` hook because a print may start with any toolhead.

## Local apply options

The generated configuration contains:

```ini
[gcode_macro _SPOOLHUB_OPTIONS]
variable_apply_spool_usage: 1
variable_apply_pressure_advance: 1
variable_apply_retract: 1
variable_apply_temperatures: 1
variable_apply_part_cooling_fan: 1
```

Each option is local to that printer:

- `apply_spool_usage` activates the assigned spool in Moonraker/Spoolman.
- `apply_pressure_advance` emits `SET_PRESSURE_ADVANCE`.
- `apply_retract` emits `SET_RETRACTION`.
- `apply_temperatures` emits heater commands.
- `apply_part_cooling_fan` emits `M106` using the profile's 0–100 percent value.

Set an option to `0` to prevent that profile section from being applied, then reload Klipper.

## When to rerun the installer

Rerun `client_install.sh` when:

- printer or toolhead IDs change
- the toolhead count changes
- a new generated profile section is introduced
- the client helper or generated macro format changes

Changing only the `variable_apply_*` values does not require reinstalling; edit `spoolhub_client.cfg` and reload Klipper.

## Runtime behavior

- Assign spools before printing while SpoolHub and Moonraker are reachable.
- Assignment writes values locally to the selected toolhead.
- During printing, macros use only local data.
- SpoolHub blocks assignment and active-profile changes while the printer is `printing` or `paused`.
- Missing profile values are skipped.

The integration requires `[save_variables]` but does not require `RUN_SHELL_COMMAND`.
