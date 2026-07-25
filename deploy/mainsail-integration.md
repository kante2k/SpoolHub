# Mainsail integration

The recommended setup installs SpoolHub as a Mainsail menu item for managing the toolheads and material paths of a multi-material printer. It opens the compact panel directly from the central SpoolHub server.

## Install with the client

During:

```bash
sudo bash client_install.sh
```

answer `y` when asked whether the SpoolHub Mainsail menu item should be installed. The panel is filtered to the printer ID used by that client.

After installation, hard-refresh Mainsail.

## Install or update the menu item later

Run on the Mainsail host:

```bash
sudo \
  SPOOLHUB_URL=http://192.168.1.87:8087 \
  SPOOLHUB_PRINTER_ID=voron \
  bash /opt/spoolhub-client/mainsail_patch_install.sh
```

The installer backs up `index.html`, replaces older marked SpoolHub integrations, installs the menu script, and adds a cache-busting URL.

Remove the integration with:

```bash
sudo bash /opt/spoolhub-client/mainsail_patch_uninstall.sh
```

## What the panel provides

- assigned spool per toolhead
- direct assignment through a dropdown
- color-coded spool icons
- remaining weight and consumption from Spoolman
- spool profile values, including part cooling fan speed
- assignment locking while the printer is `printing` or `paused`

There is no separate Assign or Apply Profile button. Selecting a spool stores its values locally. The printer's `_SPOOLHUB_APPLY_Tn` macro later applies only the profile sections enabled on that printer.

## Troubleshooting

The menu item loads the panel directly from `SPOOLHUB_URL`; no local nginx proxy is used. If the panel does not load, test the central server from the printer:

```bash
curl http://192.168.1.87:8087/api/config
```

Check the configured server IP, port, firewall, and whether the SpoolHub service is running.
