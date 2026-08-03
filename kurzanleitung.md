# SpoolHub – Kurzanleitung

SpoolHub verwaltet Spulen und Materialprofile für Klipper-basierte Multimaterial-Drucker. Besonders geeignet ist es für Toolchanger und Systeme mit mehreren Toolheads oder getrennten Materialpfaden.

## 1. Server installieren

```bash
sudo bash server_install.sh
```

Danach die Oberfläche öffnen:

```text
http://<SERVER-IP>:8087
```

## 2. Drucker einrichten

Unter **Einstellungen**:

1. Spoolman-Adresse prüfen.
2. Drucker-ID, Moonraker-URL und Mainsail-URL eintragen.
3. Toolheads mit passender Klipper-Objektbezeichnung anlegen.
4. Einstellungen speichern.

## 3. Spulenprofile pflegen

In der Spulenliste auf **Profil** klicken. Verfügbar sind:

- Pressure Advance
- Retract-Länge und -Geschwindigkeit
- Düsen-, Bett- und Kammertemperatur
- Bauteillüftergeschwindigkeit von 0 bis 100 Prozent

Leere Felder werden nicht angewendet. Dezimalwerte müssen einen Punkt verwenden, beispielsweise `0.045`.

## 4. Spule zuordnen

Am gewünschten Toolhead die Spule direkt im Dropdown auswählen. Es gibt keinen zusätzlichen Auswahl- oder Zuweisungsbutton.

Die Oberfläche zeigt:

- Spulenfarbe und Material
- Restgewicht
- verbleibenden Anteil aus den Spoolman-Verbrauchsdaten
- aktuellen Besitzer einer bereits zugewiesenen Spule

Während `printing` oder `paused` sind Änderungen gesperrt.

Wenn nur Mainsail erreichbar ist, speichert SpoolHub eine neue Zuordnung ohne einen Befehl an Klipper zu senden. Sobald Klipper bereit ist, wird sie automatisch übertragen. Bei einem vollständig offline befindlichen Drucker können Spulen entfernt, aber nicht hinzugefügt werden; beim Hinzufügen erscheint `Printer not available`.

## 5. Client installieren

Auf jedem Klipper-/Mainsail-Drucker:

```bash
sudo bash client_install.sh
```

Wähle dabei, welche Profilbereiche dieser Drucker anwenden soll. Für die Bauteillüftergeschwindigkeit gibt es eine eigene Abfrage.

## 6. Makros einbinden

Die generierte Datei in `printer.cfg` einbinden:

```ini
[include /home/pi/printer_data/config/spoolhub_client.cfg]
```

Das passende Makro am Ende der Werkzeugaktivierung und vor Prime/Purge aufrufen:

```ini
[gcode_macro T0]
gcode:
  # vorhandener T0-Code
  _SPOOLHUB_APPLY_T0
```

Für weitere Toolheads entsprechend `_SPOOLHUB_APPLY_T1`, `_SPOOLHUB_APPLY_T2` usw. verwenden. Danach Klipper neu laden.

## 7. Profilbereiche später ändern

In `spoolhub_client.cfg`:

```ini
[gcode_macro _SPOOLHUB_OPTIONS]
variable_apply_spool_usage: 1
variable_apply_pressure_advance: 1
variable_apply_retract: 0
variable_apply_temperatures: 1
variable_apply_part_cooling_fan: 1
```

Danach Klipper neu laden.

Jeder erfolgreiche Toolwechsel muss das passende `_SPOOLHUB_APPLY_Tn`-Makro aufrufen. Das Makro setzt die aktive Spule über Moonrakers Spoolman-Plugin; Moonraker meldet den folgenden Verbrauch anschließend an Spoolman. Wird in SpoolHub die gerade von Moonraker getrackte Spule ersetzt, übernimmt SpoolHub die neue ID. Änderungen an inaktiven Toolheads verändern die aktive Tracking-Spule nicht.

## 8. Mainsail

Der Client-Installer kann den SpoolHub-Menüpunkt direkt installieren. Nach der Installation Mainsail mit `Strg+F5` vollständig neu laden.

Der Menüpunkt lädt das Panel direkt vom zentralen SpoolHub-Server. Ein lokaler nginx-Proxy ist nicht erforderlich.

## 9. Wann neu installieren?

- Nur Weboberfläche geändert: Server aktualisieren.
- Serverlogik oder Datenbank geändert: Server aktualisieren und Dienst neu starten.
- Client-Makros oder neue Profilbereiche geändert: Client-Installer auf den betroffenen Druckern erneut ausführen.
- Drucker-ID, Toolhead-ID oder Toolhead-Anzahl geändert: Client-Installer erneut ausführen.

## 10. Vollständig deinstallieren

Auf jedem Klipper-Client:

```bash
sudo bash /opt/spoolhub-client/client_uninstall.sh
```

Auf dem zentralen Server:

```bash
sudo bash /opt/spoolhub/server_uninstall.sh
```

Der Server-Uninstaller fragt vor dem endgültigen Löschen der Datenbank ausdrücklich nach.
