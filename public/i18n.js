export const locales = {
  de: {
    label: "Deutsch",
    messages: {
      "app.subtitle": "Zentrale Spulenverwaltung für Klipper-Multimaterial-Drucker und Toolchanger",
      "actions.refresh": "Spulen neu laden",
      "actions.settings": "Einstellungen",
      "actions.close": "Schließen",
      "actions.cancel": "Abbrechen",
      "actions.save": "Speichern",
      "actions.addPrinter": "Drucker hinzufügen",
      "actions.addToolhead": "Toolhead hinzufügen",
      "actions.remove": "Entfernen",
      "actions.profile": "Profil",
      "actions.showHistory": "Historie anzeigen",
      "actions.hideHistory": "Historie ausblenden",
      "sections.printers": "Drucker und Toolheads",
      "sections.spools": "Spulen",
      "sections.history": "Historie",
      "status.loading": "Wird geladen …",
      "status.updating": "Wird aktualisiert …",
      "search.spools": "Material, Hersteller, Farbe …",
      "settings.title": "Einstellungen",
      "settings.language": "Sprache",
      "settings.spoolmanUrl": "Spoolman-URL",
      "settings.syncLocation": "Spoolman-Standort beim Zuweisen aktualisieren",
      "profile.title": "Spulenprofil",
      "profile.pressureAdvance": "Pressure Advance",
      "profile.retractLength": "Rückzugslänge (mm)",
      "profile.retractSpeed": "Rückzugsgeschwindigkeit (mm/s)",
      "profile.nozzleTemperature": "Düsentemperatur (°C)",
      "profile.bedTemperature": "Betttemperatur (°C)",
      "profile.chamberTemperature": "Kammertemperatur (°C)",
      "profile.partCoolingFanSpeed": "Bauteillüfter (%)",
      "profile.nozzleShort": "Düse",
      "profile.bedShort": "Bett",
      "profile.chamberShort": "Kammer",
      "profile.partCoolingFanShort": "Bauteillüfter",
      "editor.printerId": "Drucker-ID",
      "editor.name": "Name",
      "editor.managedOffline": "Nur offline verwalten – keine Daten an den Drucker übertragen",
      "editor.moonrakerUrl": "Moonraker-URL",
      "editor.mainsailUrl": "Mainsail-URL",
      "editor.toolheadId": "Toolhead-ID",
      "editor.displayName": "Anzeigename",
      "editor.klipperObject": "Klipper-Objekt",
      "empty.noPrinters": "Noch keine Drucker konfiguriert.",
      "empty.noToolheads": "Keine Toolheads konfiguriert.",
      "empty.noSpools": "Keine passenden Spulen gefunden.",
      "empty.noHistory": "Noch keine Zuweisungen protokolliert.",
      "spool.unknownWeight": "unbekannt",
      "spool.remaining": "Verbleibend: {weight}",
      "spool.remainingPercent": "{percent}% verbleibend",
      "spool.usageUnknown": "Verbrauch unbekannt",
      "spool.assignment": "Spulenzuordnung",
      "spool.assignmentFor": "Spule für {name}",
      "spool.noAssigned": "Keine Spule zugewiesen",
      "spool.profileFromAssignment": "Das Profil stammt von der zugewiesenen Spule",
      "spool.noProfile": "Kein Spulenprofil hinterlegt",
      "spool.none": "Keine Spule",
      "spool.number": "Spule #{id}",
      "spool.unknownMaterial": "Material unbekannt",
      "spool.noLocation": "Kein Standort",
      "spool.assignedTo": "Zugewiesen: {printer} / {toolhead}",
      "printer.toolheadCount": "{count} Toolheads",
      "printer.managedOffline": "Nur Offline-Verwaltung",
      "printer.toolheadState": "{count} Toolheads / {state}",
      "status.spoolCount": "{count} Spulen",
      "status.assigning": "Zuweisung wird an den Drucker übertragen …",
      "status.assignmentSaved": "Zuweisung gespeichert.",
      "status.profileSaved": "Profil gespeichert.",
      "status.profileSavedAndPushed": "Profil gespeichert und lokale Druckerdatei aktualisiert.",
      "status.saving": "Wird gespeichert …",
      "status.assignmentLocked": "Während des Status „{state}“ gesperrt",
      "status.syncPending": "Klipper-Synchronisierung ausstehend",
      "printState.unknown": "unbekannt",
      "printState.standby": "bereit",
      "printState.printing": "Druck läuft",
      "printState.paused": "pausiert",
      "printState.complete": "abgeschlossen",
      "printState.cancelled": "abgebrochen",
      "printState.error": "Fehler",
      "validation.decimal": "{label}: Bitte eine Klipper-kompatible Zahl mit Punkt als Dezimaltrenner eingeben, z. B. 0.045.",
      "validation.integer": "{label}: Bitte eine ganze nicht-negative Zahl eingeben, z. B. 215.",
      "mainsail.subtitle": "Multimaterial-Spulen und Profile",
      "mainsail.noPrinter": "Drucker nicht gefunden: {id}",
      "mainsail.noPrinters": "Keine Drucker konfiguriert."
    }
  },
  en: {
    label: "English",
    messages: {
      "app.subtitle": "Central spool management for Klipper multi-material printers and tool changers",
      "actions.refresh": "Reload spools",
      "actions.settings": "Settings",
      "actions.close": "Close",
      "actions.cancel": "Cancel",
      "actions.save": "Save",
      "actions.addPrinter": "Add printer",
      "actions.addToolhead": "Add toolhead",
      "actions.remove": "Remove",
      "actions.profile": "Profile",
      "actions.showHistory": "Show history",
      "actions.hideHistory": "Hide history",
      "sections.printers": "Printers and toolheads",
      "sections.spools": "Spools",
      "sections.history": "History",
      "status.loading": "Loading…",
      "status.updating": "Updating…",
      "search.spools": "Material, manufacturer, color…",
      "settings.title": "Settings",
      "settings.language": "Language",
      "settings.spoolmanUrl": "Spoolman URL",
      "settings.syncLocation": "Update the Spoolman location when assigning",
      "profile.title": "Spool profile",
      "profile.pressureAdvance": "Pressure advance",
      "profile.retractLength": "Retraction length (mm)",
      "profile.retractSpeed": "Retraction speed (mm/s)",
      "profile.nozzleTemperature": "Nozzle temperature (°C)",
      "profile.bedTemperature": "Bed temperature (°C)",
      "profile.chamberTemperature": "Chamber temperature (°C)",
      "profile.partCoolingFanSpeed": "Part cooling fan (%)",
      "profile.nozzleShort": "Nozzle",
      "profile.bedShort": "Bed",
      "profile.chamberShort": "Chamber",
      "profile.partCoolingFanShort": "Part cooling fan",
      "editor.printerId": "Printer ID",
      "editor.name": "Name",
      "editor.managedOffline": "Manage offline only – do not send data to the printer",
      "editor.moonrakerUrl": "Moonraker URL",
      "editor.mainsailUrl": "Mainsail URL",
      "editor.toolheadId": "Toolhead ID",
      "editor.displayName": "Display name",
      "editor.klipperObject": "Klipper object",
      "empty.noPrinters": "No printers configured yet.",
      "empty.noToolheads": "No toolheads configured.",
      "empty.noSpools": "No matching spools found.",
      "empty.noHistory": "No assignments have been recorded yet.",
      "spool.unknownWeight": "unknown",
      "spool.remaining": "Remaining {weight}",
      "spool.remainingPercent": "{percent}% remaining",
      "spool.usageUnknown": "Usage unknown",
      "spool.assignment": "Spool assignment",
      "spool.assignmentFor": "Spool for {name}",
      "spool.noAssigned": "No spool assigned",
      "spool.profileFromAssignment": "The profile comes from the assigned spool",
      "spool.noProfile": "No spool profile saved",
      "spool.none": "No spool",
      "spool.number": "Spool #{id}",
      "spool.unknownMaterial": "Unknown material",
      "spool.noLocation": "No location",
      "spool.assignedTo": "Assigned to: {printer} / {toolhead}",
      "printer.toolheadCount": "{count} toolheads",
      "printer.managedOffline": "Offline management only",
      "printer.toolheadState": "{count} toolheads / {state}",
      "status.spoolCount": "{count} spools",
      "status.assigning": "Writing assignment to the printer...",
      "status.assignmentSaved": "Assignment saved.",
      "status.profileSaved": "Profile saved.",
      "status.profileSavedAndPushed": "Profile saved and local printer file updated.",
      "status.saving": "Saving…",
      "status.assignmentLocked": "Locked while {state}",
      "status.syncPending": "Klipper synchronization pending",
      "printState.unknown": "unknown",
      "printState.standby": "ready",
      "printState.printing": "printing",
      "printState.paused": "paused",
      "printState.complete": "complete",
      "printState.cancelled": "cancelled",
      "printState.error": "error",
      "validation.decimal": "{label}: Enter a Klipper-compatible number with a dot as the decimal separator, for example 0.045.",
      "validation.integer": "{label}: Enter a non-negative integer, for example 215.",
      "mainsail.subtitle": "Multi-material spools and profiles",
      "mainsail.noPrinter": "Printer not found: {id}",
      "mainsail.noPrinters": "No printers configured."
    }
  }
};

let currentLanguage = "en";

export function availableLanguages() {
  return Object.entries(locales).map(([code, locale]) => ({ code, label: locale.label }));
}

export function normalizeLanguage(language) {
  const code = String(language || "").trim().toLowerCase();
  return Object.hasOwn(locales, code) ? code : "en";
}

export function setLanguage(language) {
  currentLanguage = normalizeLanguage(language);
  document.documentElement.lang = currentLanguage;
  return currentLanguage;
}

export function getLanguage() {
  return currentLanguage;
}

export function t(key, values = {}) {
  const messages = locales[currentLanguage]?.messages || {};
  const fallback = locales.en.messages;
  const template = messages[key] ?? fallback[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? `{${name}}`);
}

export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const label = t(element.dataset.i18nTitle);
    element.title = label;
    element.setAttribute("aria-label", label);
  });
}
