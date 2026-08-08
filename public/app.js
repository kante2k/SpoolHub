import { applyTranslations, availableLanguages, normalizeLanguage, setLanguage, t } from "./i18n.js?v=8";

const state = {
  config: null,
  spools: [],
  assignments: {},
  history: [],
  query: "",
  historyVisible: false,
  selectedPrinterId: null,
  selectedSettingsPrinterId: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const elements = {
  printerList: $("#printerList"),
  selectedPrinterPanel: $("#selectedPrinterPanel"),
  selectedPrinterName: $("#selectedPrinterName"),
  selectedPrinterMode: $("#selectedPrinterMode"),
  selectedPrinterDetails: $("#selectedPrinterDetails"),
  spoolsPanel: $("#spoolsPanel"),
  spoolList: $("#spoolList"),
  historyPanel: $("#historyPanel"),
  historyList: $("#historyList"),
  historyToggleButton: $("#historyToggleButton"),
  spoolSearch: $("#spoolSearch"),
  refreshButton: $("#refreshButton"),
  settingsButton: $("#settingsButton"),
  settingsDialog: $("#settingsDialog"),
  connectionState: $("#connectionState"),
  languageInput: $("#languageInput"),
  spoolmanUrlInput: $("#spoolmanUrlInput"),
  syncLocationInput: $("#syncLocationInput"),
  spoolIconStyleInput: $("#spoolIconStyleInput"),
  spoolGroupingInput: $("#spoolGroupingInput"),
  printerEditor: $("#printerEditor"),
  addPrinterButton: $("#addPrinterButton"),
  saveSettingsButton: $("#saveSettingsButton"),
  spoolProfileDialog: $("#spoolProfileDialog"),
  profileSpoolIdInput: $("#profileSpoolIdInput"),
  profileSpoolName: $("#profileSpoolName"),
  profilePressureAdvance: $("#profilePressureAdvance"),
  profileRetractLength: $("#profileRetractLength"),
  profileRetractSpeed: $("#profileRetractSpeed"),
  profileNozzleTemperature: $("#profileNozzleTemperature"),
  profileBedTemperature: $("#profileBedTemperature"),
  profileChamberTemperature: $("#profileChamberTemperature"),
  profilePartCoolingFanSpeed: $("#profilePartCoolingFanSpeed"),
  saveSpoolProfileButton: $("#saveSpoolProfileButton")
};

function renderLanguageOptions(selectedLanguage) {
  elements.languageInput.innerHTML = availableLanguages()
    .map(({ code, label }) => `<option value="${escapeHtml(code)}">${escapeHtml(label)}</option>`)
    .join("");
  elements.languageInput.value = normalizeLanguage(selectedLanguage);
}

function activateLanguage(language) {
  const activeLanguage = setLanguage(language);
  applyTranslations();
  renderLanguageOptions(activeLanguage);
  return activeLanguage;
}

function localUrl(path) {
  return new URL(String(path).replace(/^\/+/, ""), new URL(".", window.location.href)).toString();
}

async function api(path, options = {}) {
  const response = await fetch(localUrl(path), {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error([body.error, body.details].filter(Boolean).join(" ") || response.statusText);
  return body;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function optionalKlipperDecimal(value, label) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    throw new Error(t("validation.decimal", { label }));
  }
  return Number(text);
}

function optionalKlipperInteger(value, label) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  if (!/^(?:0|[1-9]\d*)$/.test(text)) {
    throw new Error(t("validation.integer", { label }));
  }
  return Number(text);
}

function formatWeight(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return t("spool.unknownWeight");
  return `${Math.round(Number(value))} g`;
}

function spoolUsage(spool) {
  const remaining = Number(spool.remainingWeight);
  const used = Number(spool.usedWeight);
  const hasRemaining = Number.isFinite(remaining) && remaining >= 0;
  const hasUsed = Number.isFinite(used) && used >= 0;
  const total = hasRemaining && hasUsed ? remaining + used : NaN;
  const percent = Number.isFinite(total) && total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : null;
  return {
    percent,
    label: percent === null ? t("spool.usageUnknown") : t("spool.remainingPercent", { percent: Math.round(percent) })
  };
}

function spoolVisual(spool, compact = false) {
  const usage = spoolUsage(spool);
  const material = String(spool.material || "FIL").trim().toUpperCase();
  const style = state.config?.spoolIconStyle || "contour";
  const icons = {
    contour: `<svg viewBox="0 0 90 70" aria-hidden="true"><path d="M25 15h40v39H25Z" class="spool-icon-filament-fill"/><path d="M29 17v35m6-35v35m6-35v35m6-35v35m6-35v35m6-35v35" class="spool-icon-filament-lines"/><path d="M25 15h40M25 54h40M19 8c-4 0-6 12-6 27s2 27 6 27 6-12 6-27S23 8 19 8Zm52 0c-4 0-6 12-6 27s2 27 6 27 6-12 6-27-2-27-6-27Z" class="spool-icon-frame"/><path d="M29 54v5c0 5 4 7 10 7" class="spool-icon-filament-end"/><circle cx="40" cy="66" r="1.8" class="spool-icon-filament-tip"/></svg>`,
    solid: `<svg viewBox="0 0 90 70" aria-hidden="true"><path d="M25 8h34c13 0 23 12 23 27S72 62 59 62H25v-9c7 0 12-8 12-18S32 17 25 17V8Z" class="spool-icon-solid"/><ellipse cx="25" cy="35" rx="18" ry="27" class="spool-icon-solid"/><ellipse cx="25" cy="35" rx="6" ry="9" class="spool-icon-hole"/></svg>`,
    technical: `<svg viewBox="0 0 90 70" aria-hidden="true"><circle cx="32" cy="35" r="27"/><circle cx="32" cy="35" r="9"/><path d="M59 15h12c7 0 12 9 12 20S78 55 71 55H59M70 20v30M13 20l13 8m19-8-7 11m7 19-13-8M19 52l7-11"/></svg>`
  };
  return `<span class="spool-icon${compact ? " compact" : ""}" style="--spool-color:${escapeHtml(spool.color || "#49b6a8")}" role="img" aria-label="${escapeHtml(`${spool.name}: ${usage.label}`)}">${icons[style] || icons.contour}<span>${escapeHtml(material)}</span></span>`;
}

function materialLabel(spool) {
  return [spool.material, spool.vendor, spool.filamentName].filter(Boolean).join(" / ");
}

function profileLabel(profile = {}) {
  const parts = [];
  if (profile.pressureAdvance !== null && profile.pressureAdvance !== undefined) parts.push(`PA ${profile.pressureAdvance}`);
  if (profile.retractLength !== null && profile.retractLength !== undefined) parts.push(`Retract ${profile.retractLength} mm`);
  if (profile.retractSpeed !== null && profile.retractSpeed !== undefined) parts.push(`${profile.retractSpeed} mm/s`);
  if (profile.nozzleTemperature) parts.push(`${profile.nozzleTemperature} C ${t("profile.nozzleShort")}`);
  if (profile.bedTemperature) parts.push(`${profile.bedTemperature} C ${t("profile.bedShort")}`);
  if (profile.chamberTemperature) parts.push(`${profile.chamberTemperature} C ${t("profile.chamberShort")}`);
  if (profile.partCoolingFanSpeed !== null && profile.partCoolingFanSpeed !== undefined) parts.push(`${profile.partCoolingFanSpeed}% ${t("profile.partCoolingFanShort")}`);
  return parts.length ? parts.join(" / ") : t("spool.noProfile");
}

function getAssignedSpool(printerId, toolheadId) {
  const spoolId = state.assignments?.[printerId]?.[toolheadId]?.spoolId;
  return state.spools.find((spool) => Number(spool.id) === Number(spoolId));
}

function assignmentOwners(spoolId) {
  const owners = [];
  for (const printer of state.config?.printers || []) {
    for (const toolhead of printer.toolheads || printer.extruders || []) {
      const assignedId = state.assignments?.[printer.id]?.[toolhead.id]?.spoolId;
      if (Number(assignedId) === Number(spoolId)) {
        owners.push({
          printerId: printer.id,
          printerName: printer.name,
          toolheadId: toolhead.id,
          toolheadName: toolhead.name
        });
      }
    }
  }
  return owners;
}

function render() {
  renderPrinters();
  renderSpools();
  renderHistory();
  renderHistoryVisibility();
}

function renderHistoryVisibility() {
  elements.historyPanel.classList.toggle("collapsed", !state.historyVisible);
  elements.historyToggleButton.textContent = t(state.historyVisible ? "actions.hideHistory" : "actions.showHistory");
  elements.historyToggleButton.setAttribute("aria-expanded", String(state.historyVisible));
}

function printerIconSvg(iconType) {
  const icons = {
    enclosed: `<svg viewBox="0 0 100 120" aria-hidden="true"><rect x="16" y="7" width="68" height="106" rx="7" class="printer-icon-fill"/><rect x="23" y="15" width="54" height="76" rx="2"/><path d="M29 25h42M37 25v15h26V25M50 40v10m-11 0h22l5 15H34l5-15"/><rect x="35" y="98" width="30" height="7" rx="2" class="printer-icon-solid"/></svg>`,
    corexy: `<svg viewBox="0 0 100 120" aria-hidden="true"><path d="M12 108V18h70v90M12 27h70M22 37h50M27 37v20h40V37M47 57v11m-13 0h26l6 17H28l6-17M82 40h8v42h-8"/></svg>`,
    bedslinger: `<svg viewBox="0 0 100 120" aria-hidden="true"><path d="M16 103V25h67M24 34h51M29 34v20h40V34M49 54v13M20 92h66M35 76h33l7 16H28l7-16M83 21v75"/></svg>`
  };
  return `<span class="printer-icon">${icons[iconType] || icons.corexy}</span>`;
}

function renderPrinters() {
  const printers = state.config?.printers || [];
  if (!printers.length) {
    elements.printerList.innerHTML = `<div class="empty-state">${escapeHtml(t("empty.noPrinters"))}</div>`;
    elements.selectedPrinterPanel.hidden = true;
    elements.spoolsPanel.hidden = true;
    return;
  }
  if (state.selectedPrinterId && !printers.some((printer) => printer.id === state.selectedPrinterId)) state.selectedPrinterId = null;
  elements.printerList.innerHTML = printers.map((printer) => {
    const toolheads = printer.toolheads || printer.extruders || [];
    const assignedCount = toolheads.filter((toolhead) => getAssignedSpool(printer.id, toolhead.id)).length;
    return `<button type="button" class="printer-tile${printer.id === state.selectedPrinterId ? " selected" : ""}" data-printer-id="${escapeHtml(printer.id)}">${printerIconSvg(printer.iconType || "corexy")}<span class="printer-tile-copy"><span class="printer-tile-title"><strong>${escapeHtml(printer.name)}</strong></span><span class="printer-tile-meta">${escapeHtml(t("printer.toolheadCount", { count: toolheads.length }))}</span><span>${escapeHtml(t("printer.assignedCount", { assigned: assignedCount, count: toolheads.length }))}</span><span class="printer-mode">${escapeHtml(printer.connectionMode === "managed" ? t("printer.managedOffline") : t("printer.connected"))}</span></span></button>`;
  }).join("");
  $$(".printer-tile", elements.printerList).forEach((tile) => tile.addEventListener("click", () => {
    state.selectedPrinterId = state.selectedPrinterId === tile.dataset.printerId ? null : tile.dataset.printerId;
    renderPrinters();
    renderSpools();
  }));
  const printer = printers.find((item) => item.id === state.selectedPrinterId);
  elements.selectedPrinterPanel.hidden = !printer;
  elements.spoolsPanel.hidden = !printer;
  if (!printer) {
    elements.selectedPrinterDetails.innerHTML = "";
    return;
  }
  elements.selectedPrinterName.textContent = printer.name;
  elements.selectedPrinterMode.textContent = printer.connectionMode === "managed" ? t("printer.managedOffline") : t("printer.connected");
  const toolheads = printer.toolheads || printer.extruders || [];
  elements.selectedPrinterDetails.innerHTML = toolheads.map((toolhead) => renderToolheadAssignment(printer, toolhead)).join("") || `<div class="empty-state">${escapeHtml(t("empty.noToolheads"))}</div>`;
  bindSelectedPrinterAssignments();
}

function renderToolheadAssignment(printer, toolhead) {
  const spool = getAssignedSpool(printer.id, toolhead.id);
  const assignment = state.assignments?.[printer.id]?.[toolhead.id];
  const currentSpoolId = spool?.id ?? "";
  const choices = state.spools.map((candidate) => ({ id: candidate.id, disabled: assignmentOwners(candidate.id).some((owner) => owner.printerId !== printer.id || owner.toolheadId !== toolhead.id), label: `${candidate.name} · ${materialLabel(candidate)} · ${formatWeight(candidate.remainingWeight)}` }));
  const options = [`<option value="">${escapeHtml(t("spool.none"))}</option>`, ...choices.map((choice) => `<option value="${escapeHtml(choice.id)}"${String(choice.id) === String(currentSpoolId) ? " selected" : ""}${choice.disabled ? " disabled" : ""}>${escapeHtml(choice.label)}</option>`)].join("");
  const menuOptions = [`<button type="button" class="spool-combobox-option" data-value="">${escapeHtml(t("spool.none"))}</button>`, ...choices.map((choice) => `<button type="button" class="spool-combobox-option" data-value="${escapeHtml(choice.id)}"${choice.disabled ? " disabled" : ""}>${escapeHtml(choice.label)}</button>`)].join("");
  const selectedLabel = choices.find((choice) => String(choice.id) === String(currentSpoolId))?.label || t("spool.none");
  return `<div class="extruder-row" data-printer-id="${escapeHtml(printer.id)}" data-toolhead-id="${escapeHtml(toolhead.id)}"><div class="extruder-name">${escapeHtml(toolhead.name)}</div><div class="assigned-spool">${spool ? spoolVisual(spool, true) : ""}<label class="assignment-select-label"><span>${escapeHtml(t("spool.assignment"))}</span><div class="spool-combobox"><input class="spool-combobox-input" type="text" value="${escapeHtml(selectedLabel)}" autocomplete="off" role="combobox" aria-expanded="false"><select class="assignment-select" tabindex="-1" aria-hidden="true">${options}</select><div class="spool-combobox-menu" role="listbox" hidden>${menuOptions}</div></div></label>${spool ? `<span class="assigned-profile-summary">${escapeHtml(profileLabel(spool.profile))}</span>` : ""}${spool && assignment?.syncPending ? `<span class="assignment-owner">${escapeHtml(t("status.syncPending"))}</span>` : ""}</div></div>`;
}

function bindSelectedPrinterAssignments() {
  bindSpoolDropTargets();
  $$(".spool-combobox-input", elements.selectedPrinterDetails).forEach((input) => {
    const combobox = input.closest(".spool-combobox");
    const menu = $(".spool-combobox-menu", combobox);
    const select = $(".assignment-select", combobox);
    const close = () => { menu.hidden = true; input.setAttribute("aria-expanded", "false"); input.value = select.selectedOptions[0]?.textContent || t("spool.none"); };
    const filter = () => { const query = input.value.trim().toLocaleLowerCase(); $$(".spool-combobox-option", menu).forEach((option) => option.hidden = Boolean(query) && !option.textContent.toLocaleLowerCase().includes(query)); menu.hidden = false; input.setAttribute("aria-expanded", "true"); };
    input.addEventListener("focus", () => { input.value = ""; filter(); });
    input.addEventListener("input", filter);
    input.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); if (event.key === "Enter") { const option = $$(".spool-combobox-option", menu).find((item) => !item.hidden && !item.disabled); if (option) { event.preventDefault(); option.click(); } } });
    input.addEventListener("blur", () => setTimeout(close, 100));
    menu.addEventListener("mousedown", (event) => event.preventDefault());
    menu.addEventListener("click", (event) => { const option = event.target.closest(".spool-combobox-option"); if (!option || option.disabled) return; select.value = option.dataset.value; input.value = option.textContent.trim(); menu.hidden = true; select.dispatchEvent(new Event("change", { bubbles: true })); });
  });
  $$(".assignment-select", elements.selectedPrinterDetails).forEach((select) => select.addEventListener("change", async () => {
    const row = select.closest(".extruder-row");
    const previousValue = state.assignments?.[row.dataset.printerId]?.[row.dataset.toolheadId]?.spoolId ?? "";
    try { select.disabled = true; const printer = state.config?.printers?.find((item) => item.id === row.dataset.printerId); setConnectionState(t(printer?.connectionMode === "managed" ? "status.saving" : "status.assigning"), ""); await assignSpool(select.value, row.dataset.printerId, row.dataset.toolheadId); }
    catch (error) { console.error(error); select.value = String(previousValue); setConnectionState(error.message, "error"); }
    finally { select.disabled = false; }
  }));
}

function bindSpoolDropTargets() {
  $$(".extruder-row", elements.selectedPrinterDetails).forEach((row) => {
    const clearDropState = () => row.classList.remove("spool-drop-target");
    row.addEventListener("dragenter", (event) => {
      if (!event.dataTransfer.types.includes("application/x-spoolhub-spool")) return;
      event.preventDefault();
      row.classList.add("spool-drop-target");
    });
    row.addEventListener("dragover", (event) => {
      if (!event.dataTransfer.types.includes("application/x-spoolhub-spool")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("dragleave", (event) => {
      if (!row.contains(event.relatedTarget)) clearDropState();
    });
    row.addEventListener("drop", async (event) => {
      event.preventDefault();
      clearDropState();
      const spoolId = event.dataTransfer.getData("application/x-spoolhub-spool");
      if (!spoolId) return;
      try {
        const printer = state.config?.printers?.find((item) => item.id === row.dataset.printerId);
        setConnectionState(t(printer?.connectionMode === "managed" ? "status.saving" : "status.assigning"), "");
        await assignSpool(spoolId, row.dataset.printerId, row.dataset.toolheadId);
      } catch (error) {
        console.error(error);
        setConnectionState(error.message, "error");
      }
    });
  });
}

function renderPrintersLegacy() {
  if (!state.config?.printers?.length) {
    elements.printerList.innerHTML = `<div class="empty-state">${escapeHtml(t("empty.noPrinters"))}</div>`;
    return;
  }

  elements.printerList.innerHTML = state.config.printers
    .map((printer) => {
      const toolheads = printer.toolheads || printer.extruders || [];
      const rows = toolheads
        .map((toolhead) => {
          const spool = getAssignedSpool(printer.id, toolhead.id);
          const assignment = state.assignments?.[printer.id]?.[toolhead.id];
          const currentSpoolId = spool?.id ?? "";
          const choices = state.spools.map((candidate) => {
              const occupiedElsewhere = assignmentOwners(candidate.id)
                .some((owner) => owner.printerId !== printer.id || owner.toolheadId !== toolhead.id);
              return {
                id: candidate.id,
                disabled: occupiedElsewhere,
                label: `${candidate.name} · ${materialLabel(candidate)} · ${formatWeight(candidate.remainingWeight)}`
              };
            });
          const options = [
            `<option value="">${escapeHtml(t("spool.none"))}</option>`,
            ...choices.map((choice) => `<option value="${escapeHtml(choice.id)}"${String(choice.id) === String(currentSpoolId) ? " selected" : ""}${choice.disabled ? " disabled" : ""}>${escapeHtml(choice.label)}</option>`)
          ].join("");
          const menuOptions = [
            `<button type="button" class="spool-combobox-option" data-value="">${escapeHtml(t("spool.none"))}</button>`,
            ...choices.map((choice) => `<button type="button" class="spool-combobox-option" data-value="${escapeHtml(choice.id)}"${choice.disabled ? " disabled" : ""}>${escapeHtml(choice.label)}</button>`)
          ].join("");
          const selectedLabel = choices.find((choice) => String(choice.id) === String(currentSpoolId))?.label || t("spool.none");
          return `
            <div class="extruder-row" data-printer-id="${escapeHtml(printer.id)}" data-toolhead-id="${escapeHtml(toolhead.id)}">
              <div class="extruder-name">${escapeHtml(toolhead.name)}</div>
              <div class="assigned-spool">
                ${spool ? spoolVisual(spool, true) : ""}
                <label class="assignment-select-label">
                  <span>${escapeHtml(t("spool.assignment"))}</span>
                  <div class="spool-combobox">
                    <input class="spool-combobox-input" type="text" value="${escapeHtml(selectedLabel)}" autocomplete="off" role="combobox" aria-expanded="false" aria-label="${escapeHtml(t("spool.assignmentFor", { name: toolhead.name }))}">
                    <select class="assignment-select" tabindex="-1" aria-hidden="true">${options}</select>
                    <div class="spool-combobox-menu" role="listbox" hidden>${menuOptions}</div>
                  </div>
                </label>
                ${spool ? `<span>${escapeHtml(profileLabel(spool.profile))}</span>` : ""}
                ${spool && assignment?.syncPending ? `<span class="assignment-owner">${escapeHtml(t("status.syncPending"))}</span>` : ""}
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <article class="printer-card">
          <div class="printer-title">
            <div>
              <h3>${escapeHtml(printer.name)}</h3>
              <small>${escapeHtml(printer.connectionMode === "managed" ? t("printer.managedOffline") : printer.moonrakerUrl)}</small>
            </div>
            <span class="status-chip">${escapeHtml(t("printer.toolheadCount", { count: toolheads.length }))}</span>
          </div>
          ${rows || `<div class="empty-state">${escapeHtml(t("empty.noToolheads"))}</div>`}
        </article>
      `;
    })
    .join("");

  $$(".spool-combobox-input", elements.printerList).forEach((input) => {
    const combobox = input.closest(".spool-combobox");
    const menu = $(".spool-combobox-menu", combobox);
    const select = $(".assignment-select", combobox);
    const positionMenu = () => {
      menu.classList.remove("opens-upward");
      const inputRect = input.getBoundingClientRect();
      const desiredHeight = Math.min(menu.scrollHeight, 260) + 6;
      const spaceBelow = window.innerHeight - inputRect.bottom;
      const spaceAbove = inputRect.top;
      if (spaceBelow < desiredHeight && spaceAbove > spaceBelow) {
        menu.classList.add("opens-upward");
      }
    };
    const close = () => {
      menu.hidden = true;
      menu.classList.remove("opens-upward");
      input.setAttribute("aria-expanded", "false");
      input.value = select.selectedOptions[0]?.textContent || t("spool.none");
    };
    const filter = () => {
      const query = input.value.trim().toLocaleLowerCase();
      $$(".spool-combobox-option", menu).forEach((option) => {
        option.hidden = Boolean(query) && !option.textContent.toLocaleLowerCase().includes(query);
      });
      menu.hidden = false;
      positionMenu();
      input.setAttribute("aria-expanded", "true");
    };
    input.addEventListener("focus", () => {
      input.value = "";
      filter();
    });
    input.addEventListener("input", filter);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
      if (event.key === "Enter") {
        const option = $$(".spool-combobox-option", menu).find((item) => !item.hidden && !item.disabled);
        if (option) {
          event.preventDefault();
          option.click();
        }
      }
    });
    input.addEventListener("blur", () => setTimeout(close, 100));
    menu.addEventListener("mousedown", (event) => event.preventDefault());
    menu.addEventListener("click", (event) => {
      const option = event.target.closest(".spool-combobox-option");
      if (!option || option.disabled) return;
      select.value = option.dataset.value;
      input.value = option.textContent.trim();
      menu.hidden = true;
      input.setAttribute("aria-expanded", "false");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  $$(".assignment-select", elements.printerList).forEach((select) => {
    select.addEventListener("change", async () => {
      const row = select.closest(".extruder-row");
      const previousValue = state.assignments?.[row.dataset.printerId]?.[row.dataset.toolheadId]?.spoolId ?? "";
      try {
        select.disabled = true;
        const printer = state.config?.printers?.find((item) => item.id === row.dataset.printerId);
        setConnectionState(t(printer?.connectionMode === "managed" ? "status.saving" : "status.assigning"), "");
        await assignSpool(select.value, row.dataset.printerId, row.dataset.toolheadId);
      } catch (error) {
        console.error(error);
        select.value = String(previousValue);
        select.closest(".spool-combobox").querySelector(".spool-combobox-input").value = select.selectedOptions[0]?.textContent || t("spool.none");
        setConnectionState(error.message, "error");
      } finally {
        select.disabled = false;
      }
    });
  });

}

function renderSpoolCard(spool) {
  const owners = assignmentOwners(spool.id);
  const ownerLabel = owners.length ? `<span class="assignment-owner">${escapeHtml(owners.map((owner) => t("spool.assignedTo", { printer: owner.printerName, toolhead: owner.toolheadName })).join("; "))}</span>` : "";
  return `<article class="spool-card" data-spool-id="${escapeHtml(spool.id)}" draggable="true" title="${escapeHtml(t("spool.dragToSlot"))}">${spoolVisual(spool)}<span><strong>${escapeHtml(spool.name)}</strong><span class="spool-meta"><span>${escapeHtml(materialLabel(spool))}</span><span>${escapeHtml(t("spool.remaining", { weight: formatWeight(spool.remainingWeight) }))}</span><span>${escapeHtml(spoolUsage(spool).label)}</span>${spool.location ? `<span>${escapeHtml(spool.location)}</span>` : ""}<span>${escapeHtml(profileLabel(spool.profile))}</span>${ownerLabel}</span><span class="spool-actions"><button data-action="edit-spool-profile">${escapeHtml(t("actions.profile"))}</button></span></span></article>`;
}

function renderSpools() {
  if (!state.selectedPrinterId) {
    elements.spoolList.innerHTML = "";
    return;
  }
  const query = state.query.trim().toLowerCase();
  const spools = state.spools.filter((spool) => {
    const text = `${spool.name} ${spool.material} ${spool.vendor} ${spool.filamentName} ${spool.location}`.toLowerCase();
    return !query || text.includes(query);
  });
  if (!spools.length) {
    elements.spoolList.innerHTML = `<div class="empty-state">${escapeHtml(t("empty.noSpools"))}</div>`;
    return;
  }
  const grouping = state.config?.spoolGrouping === "vendor" ? "vendor" : "material";
  elements.spoolGroupingInput.value = grouping;
  const groups = new Map();
  spools.forEach((spool) => {
    const label = String(spool[grouping] || t(grouping === "vendor" ? "spool.unknownVendor" : "spool.unknownMaterial"));
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(spool);
  });
  elements.spoolList.innerHTML = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, items]) => `<section class="spool-group"><div class="spool-group-heading"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(t("spool.groupCount", { count: items.length }))}</span></div><div class="spool-group-grid">${items.map(renderSpoolCard).join("")}</div></section>`).join("");
  $$("[data-action='edit-spool-profile']", elements.spoolList).forEach((button) => button.addEventListener("click", () => {
    const spool = state.spools.find((item) => String(item.id) === String(button.closest(".spool-card").dataset.spoolId));
    openSpoolProfile(spool);
  }));
  $$(".spool-card", elements.spoolList).forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-spoolhub-spool", card.dataset.spoolId);
      event.dataTransfer.setData("text/plain", card.dataset.spoolId);
      card.classList.add("spool-dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("spool-dragging");
      $$(".spool-drop-target", elements.selectedPrinterDetails).forEach((row) => row.classList.remove("spool-drop-target"));
    });
  });
}

function renderSpoolsLegacy() {
  const query = state.query.trim().toLowerCase();
  const spools = state.spools.filter((spool) => {
    const text = `${spool.name} ${spool.material} ${spool.vendor} ${spool.filamentName} ${spool.location}`.toLowerCase();
    return !query || text.includes(query);
  });

  if (!spools.length) {
    elements.spoolList.innerHTML = `<div class="empty-state">${escapeHtml(t("empty.noSpools"))}</div>`;
    return;
  }

  elements.spoolList.innerHTML = spools
    .map((spool) => {
      const owners = assignmentOwners(spool.id);
      const ownerLabel = owners.length
        ? `<span class="assignment-owner">${escapeHtml(owners.map((owner) => t("spool.assignedTo", { printer: owner.printerName, toolhead: owner.toolheadName })).join("; "))}</span>`
        : "";
      return `
      <article class="spool-card" data-spool-id="${escapeHtml(spool.id)}">
        ${spoolVisual(spool)}
        <span>
          <strong>${escapeHtml(spool.name)}</strong>
          <span class="spool-meta">
            <span>${escapeHtml(materialLabel(spool))}</span>
            <span>${escapeHtml(t("spool.remaining", { weight: formatWeight(spool.remainingWeight) }))}</span>
            <span>${escapeHtml(spoolUsage(spool).label)}</span>
            ${spool.location ? `<span>${escapeHtml(spool.location)}</span>` : ""}
            <span>${escapeHtml(profileLabel(spool.profile))}</span>
            ${ownerLabel}
          </span>
          <span class="spool-actions">
            <button data-action="edit-spool-profile">${escapeHtml(t("actions.profile"))}</button>
          </span>
        </span>
      </article>
    `;
    })
    .join("");

  $$("[data-action='edit-spool-profile']", elements.spoolList).forEach((button) => {
    button.addEventListener("click", () => {
      const spool = state.spools.find((item) => String(item.id) === String(button.closest(".spool-card").dataset.spoolId));
      openSpoolProfile(spool);
    });
  });
}

function renderHistory() {
  if (!state.history.length) {
    elements.historyList.innerHTML = `<div class="empty-state">${escapeHtml(t("empty.noHistory"))}</div>`;
    return;
  }

  elements.historyList.innerHTML = state.history
    .map((item) => {
      const spool = state.spools.find((entry) => Number(entry.id) === Number(item.spool_id));
      const label = spool ? spool.name : item.spool_id ? t("spool.number", { id: item.spool_id }) : t("spool.none");
      return `
        <article class="history-item">
          <time>${escapeHtml(item.created_at)}</time>
          <strong>${escapeHtml(item.printer_name)} / ${escapeHtml(item.toolhead_name)} -> ${escapeHtml(label)}</strong>
          <span>${escapeHtml(item.action)}</span>
        </article>
      `;
    })
    .join("");
}

function setConnectionState(text, mode = "") {
  elements.connectionState.textContent = text;
  elements.connectionState.className = `status-chip ${mode}`.trim();
}

async function loadAll() {
  try {
    const [config, assignments, spools, history] = await Promise.all([
      api("/api/config"),
      api("/api/assignments"),
      api("/api/spoolman/spools"),
      api("/api/history?limit=30")
    ]);
    state.config = config;
    const savedGrouping = window.localStorage.getItem("spoolhub-spool-grouping");
    if (["material", "vendor"].includes(savedGrouping)) state.config.spoolGrouping = savedGrouping;
    state.assignments = assignments;
    state.spools = spools;
    state.history = history;
    activateLanguage(config.language);
    setConnectionState(t("status.spoolCount", { count: spools.length }), "ok");
    render();
  } catch (error) {
    setConnectionState(error.message, "error");
    state.config ||= await api("/api/config");
    state.assignments ||= await api("/api/assignments");
    activateLanguage(state.config.language);
    render();
  }
}

async function assignSpool(spoolId, printerId, toolheadId) {
  const result = await api(`/api/assignments/${encodeURIComponent(printerId)}/${encodeURIComponent(toolheadId)}`, {
    method: "PUT",
    body: JSON.stringify({ spoolId: spoolId ? Number(spoolId) : null })
  });
  state.assignments = result.assignments;
  state.history = result.history || state.history;
  setConnectionState(
    result.warning || t("status.assignmentSaved"),
    result.pendingSync ? "" : (result.warning ? "error" : "ok")
  );
  render();
}

function openSpoolProfile(spool) {
  if (!spool) return;
  const profile = spool.profile || {};
  elements.profileSpoolIdInput.value = spool.id;
  elements.profileSpoolName.textContent = `${spool.name} (${materialLabel(spool)})`;
  elements.profilePressureAdvance.value = profile.pressureAdvance ?? "";
  elements.profileRetractLength.value = profile.retractLength ?? "";
  elements.profileRetractSpeed.value = profile.retractSpeed ?? "";
  elements.profileNozzleTemperature.value = profile.nozzleTemperature ?? "";
  elements.profileBedTemperature.value = profile.bedTemperature ?? "";
  elements.profileChamberTemperature.value = profile.chamberTemperature ?? "";
  elements.profilePartCoolingFanSpeed.value = profile.partCoolingFanSpeed ?? "";
  elements.spoolProfileDialog.showModal();
}

async function saveSpoolProfile() {
  const spoolId = elements.profileSpoolIdInput.value;
  const result = await api(`/api/spool-profiles/${encodeURIComponent(spoolId)}`, {
    method: "PUT",
    body: JSON.stringify({
      pressureAdvance: optionalKlipperDecimal(elements.profilePressureAdvance.value, t("profile.pressureAdvance")),
      retractLength: optionalKlipperDecimal(elements.profileRetractLength.value, t("profile.retractLength")),
      retractSpeed: optionalKlipperDecimal(elements.profileRetractSpeed.value, t("profile.retractSpeed")),
      nozzleTemperature: optionalKlipperInteger(elements.profileNozzleTemperature.value, t("profile.nozzleTemperature")),
      bedTemperature: optionalKlipperInteger(elements.profileBedTemperature.value, t("profile.bedTemperature")),
      chamberTemperature: optionalKlipperInteger(elements.profileChamberTemperature.value, t("profile.chamberTemperature")),
      partCoolingFanSpeed: optionalKlipperInteger(elements.profilePartCoolingFanSpeed.value, t("profile.partCoolingFanSpeed"))
    })
  });
  const profile = result.profile || result;
  const spool = state.spools.find((item) => String(item.id) === String(spoolId));
  if (spool) spool.profile = profile;
  elements.spoolProfileDialog.close();
  setConnectionState(t(result.pushed?.length ? "status.profileSavedAndPushed" : "status.profileSaved"), "ok");
  render();
}

function openSettings() {
  renderLanguageOptions(state.config?.language || "en");
  elements.spoolmanUrlInput.value = state.config?.spoolmanUrl || "";
  elements.syncLocationInput.checked = Boolean(state.config?.syncSpoolLocation);
  elements.spoolIconStyleInput.value = state.config?.spoolIconStyle || "contour";
  state.selectedSettingsPrinterId = null;
  renderPrinterEditor(structuredClone((state.config?.printers || []).map((printer) => ({
    ...printer,
    toolheads: printer.toolheads || printer.extruders || []
  }))));
  elements.settingsDialog.returnValue = "cancel";
  elements.settingsDialog.showModal();
}

function renderPrinterEditor(printers) {
  elements.printerEditor.innerHTML = "";

  printers.forEach((printer, printerIndex) => {
    const template = $("#printerEditorTemplate").content.cloneNode(true);
    const card = $(".editor-card", template);
    $("[data-field='id']", card).value = printer.id || "";
    $("[data-field='name']", card).value = printer.name || "";
    $("[data-field='moonrakerUrl']", card).value = printer.moonrakerUrl || "";
    $("[data-field='mainsailUrl']", card).value = printer.mainsailUrl || "";
    $("[data-field='managed-offline']", card).checked = printer.connectionMode === "managed";
    $("[data-field='iconType']", card).value = printer.iconType || (printer.connectionMode === "managed" ? "enclosed" : "corexy");
    const extruderEditor = $(".extruder-editor", card);

    (printer.toolheads || printer.extruders || []).forEach((toolhead, toolheadIndex) => {
      extruderEditor.insertAdjacentHTML(
        "beforeend",
        `<div class="extruder-line" data-toolhead-index="${toolheadIndex}">
          <label><span>${escapeHtml(t("editor.toolheadId"))}</span><input data-field="toolhead-id" value="${escapeHtml(toolhead.id || "")}" required></label>
          <label><span>${escapeHtml(t("editor.displayName"))}</span><input data-field="toolhead-name" value="${escapeHtml(toolhead.name || "")}" required></label>
          <label><span>${escapeHtml(t("editor.klipperObject"))}</span><input data-field="toolhead-klipper-object" value="${escapeHtml(toolhead.klipperObject || toolhead.id || "")}" required></label>
          <button type="button" data-action="remove-toolhead">x</button>
        </div>`
      );
    });

    $("[data-field='summary-icon']", card).innerHTML = printerIconSvg(printer.iconType || (printer.connectionMode === "managed" ? "enclosed" : "corexy"));
    $("[data-field='summary-name']", card).textContent = printer.name || printer.id || t("actions.addPrinter");
    $("[data-field='summary-toolheads']", card).textContent = t("printer.toolheadCount", { count: (printer.toolheads || printer.extruders || []).length });
    $("[data-field='summary-mode']", card).textContent = printer.connectionMode === "managed" ? t("printer.managedOffline") : t("printer.connected");
    const expanded = state.selectedSettingsPrinterId === (printer.id || `new-${printerIndex}`);
    card.classList.toggle("expanded", expanded);
    $("[data-action='toggle-printer-editor']", card).setAttribute("aria-expanded", String(expanded));

    card.dataset.printerIndex = printerIndex;
    card.dataset.isNewPrinter = String(Boolean(printer.isNewPrinter));
    card.dataset.lastPrinterId = printer.id || "";
    applyTranslations(template);
    elements.printerEditor.appendChild(template);
    updatePrinterEditorMode(elements.printerEditor.lastElementChild);
  });

  bindEditorEvents();
}

function updatePrinterEditorMode(card) {
  const managed = $("[data-field='managed-offline']", card).checked;
  for (const field of ["moonrakerUrl", "mainsailUrl"]) {
    const input = $(`[data-field='${field}']`, card);
    input.disabled = managed;
    input.required = !managed;
    input.closest("label").hidden = managed;
  }
  $$("[data-field='toolhead-klipper-object']", card).forEach((input) => {
    input.disabled = managed;
    input.required = !managed;
    input.closest("label").hidden = managed;
  });
}

function readEditorModel() {
  return $$(".editor-card", elements.printerEditor).map((card, index) => ({
    id: $("[data-field='id']", card).value.trim(),
    name: $("[data-field='name']", card).value.trim(),
    moonrakerUrl: $("[data-field='moonrakerUrl']", card).value.trim().replace(/\/+$/, ""),
    mainsailUrl: $("[data-field='mainsailUrl']", card).value.trim().replace(/\/+$/, ""),
    connectionMode: $("[data-field='managed-offline']", card).checked ? "managed" : "connected",
    iconType: $("[data-field='iconType']", card).value,
    isNewPrinter: card.dataset.isNewPrinter === "true",
    toolheads: $$(".extruder-line", card).map((line, toolheadIndex) => ({
      id: $("[data-field='toolhead-id']", line).value.trim(),
      name: $("[data-field='toolhead-name']", line).value.trim(),
      klipperObject: $("[data-field='toolhead-klipper-object']", line).value.trim()
    }))
  }));
}

function bindEditorEvents() {
  $$('[data-action="toggle-printer-editor"]', elements.printerEditor).forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".editor-card");
      const printerId = $("[data-field='id']", card).value.trim() || `new-${card.dataset.printerIndex}`;
      const shouldExpand = !card.classList.contains("expanded");
      state.selectedSettingsPrinterId = shouldExpand ? printerId : null;
      $$(".editor-card", elements.printerEditor).forEach((item) => {
        const expanded = shouldExpand && item === card;
        item.classList.toggle("expanded", expanded);
        $("[data-action='toggle-printer-editor']", item).setAttribute("aria-expanded", String(expanded));
      });
      if (shouldExpand) window.requestAnimationFrame(() => card.scrollIntoView({ block: "start", behavior: "smooth" }));
    });
  });
  $$("[data-field='id']", elements.printerEditor).forEach((input) => {
    input.addEventListener("input", () => {
      const card = input.closest(".editor-card");
      if (card.dataset.isNewPrinter !== "true") return;
      const previousPrinterId = card.dataset.lastPrinterId || "";
      const firstToolheadId = $(".extruder-line:first-child [data-field='toolhead-id']", card);
      if (firstToolheadId && (!firstToolheadId.value || firstToolheadId.value === `${previousPrinterId}-t0`)) {
        firstToolheadId.value = input.value.trim() ? `${input.value.trim()}-t0` : "";
      }
      card.dataset.lastPrinterId = input.value.trim();
      if (card.classList.contains("expanded")) state.selectedSettingsPrinterId = input.value.trim() || `new-${card.dataset.printerIndex}`;
    });
  });
  $$("[data-field='name']", elements.printerEditor).forEach((input) => {
    input.addEventListener("input", () => {
      const card = input.closest(".editor-card");
      $("[data-field='summary-name']", card).textContent = input.value.trim() || $("[data-field='id']", card).value.trim() || t("actions.addPrinter");
    });
  });
  $$("[data-field='iconType']", elements.printerEditor).forEach((select) => {
    select.addEventListener("change", () => {
      $("[data-field='summary-icon']", select.closest(".editor-card")).innerHTML = printerIconSvg(select.value);
    });
  });
  $$("[data-field='managed-offline']", elements.printerEditor).forEach((input) => {
    input.addEventListener("change", () => {
      const card = input.closest(".editor-card");
      updatePrinterEditorMode(card);
      $("[data-field='summary-mode']", card).textContent = input.checked ? t("printer.managedOffline") : t("printer.connected");
    });
  });
  $$("[data-action='add-extruder']", elements.printerEditor).forEach((button) => {
    button.addEventListener("click", () => {
      const printers = readEditorModel();
      const index = Number(button.closest(".editor-card").dataset.printerIndex);
      printers[index].toolheads ||= [];
      const printerId = printers[index].id || `printer-${index + 1}`;
      printers[index].toolheads.push({
        id: `${printerId}-t${printers[index].toolheads.length}`,
        name: `T${printers[index].toolheads.length}`,
        klipperObject: `extruder${printers[index].toolheads.length || ""}`
      });
      renderPrinterEditor(printers);
    });
  });

  $$("[data-action='remove-printer']", elements.printerEditor).forEach((button) => {
    button.addEventListener("click", () => {
      const printers = readEditorModel();
      printers.splice(Number(button.closest(".editor-card").dataset.printerIndex), 1);
      state.selectedSettingsPrinterId = null;
      renderPrinterEditor(printers);
    });
  });

  $$("[data-action='remove-toolhead']", elements.printerEditor).forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".editor-card");
      button.closest(".extruder-line").remove();
      $("[data-field='summary-toolheads']", card).textContent = t("printer.toolheadCount", { count: $$(".extruder-line", card).length });
    });
  });
}

elements.refreshButton.addEventListener("click", loadAll);
elements.settingsButton.addEventListener("click", openSettings);
elements.languageInput.addEventListener("change", (event) => {
  const printers = readEditorModel();
  activateLanguage(event.target.value);
  renderPrinterEditor(printers);
  render();
});
elements.settingsDialog.addEventListener("close", () => {
  if (elements.settingsDialog.returnValue === "cancel") {
    activateLanguage(state.config?.language || "en");
    render();
  }
});
elements.historyToggleButton.addEventListener("click", () => {
  state.historyVisible = !state.historyVisible;
  renderHistoryVisibility();
});
elements.spoolSearch.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderSpools();
});
elements.spoolGroupingInput.addEventListener("change", (event) => {
  if (!state.config) return;
  state.config.spoolGrouping = event.target.value === "vendor" ? "vendor" : "material";
  window.localStorage.setItem("spoolhub-spool-grouping", state.config.spoolGrouping);
  renderSpools();
});

elements.addPrinterButton.addEventListener("click", () => {
  const printers = readEditorModel();
  const printerId = `printer-${printers.length + 1}`;
  printers.push({
    id: printerId,
    name: `Printer ${printers.length + 1}`,
    moonrakerUrl: "http://localhost:7125",
    mainsailUrl: "http://localhost",
    connectionMode: "connected",
    iconType: "corexy",
    isNewPrinter: true,
    toolheads: [{
      id: `${printerId}-t0`,
      name: "T0",
      klipperObject: "extruder"
    }]
  });
  state.selectedSettingsPrinterId = printerId;
  renderPrinterEditor(printers);
  window.requestAnimationFrame(() => {
    const activeCard = $(".editor-card.expanded", elements.printerEditor);
    if (!activeCard) return;
    activeCard.scrollIntoView({ block: "start", behavior: "smooth" });
    $("[data-field='id']", activeCard)?.focus({ preventScroll: true });
  });
});

elements.saveSettingsButton.addEventListener("click", async (event) => {
  event.preventDefault();
  const config = {
    spoolmanUrl: elements.spoolmanUrlInput.value.trim().replace(/\/+$/, ""),
    syncSpoolLocation: elements.syncLocationInput.checked,
    spoolIconStyle: elements.spoolIconStyleInput.value,
    spoolGrouping: state.config?.spoolGrouping || "material",
    language: normalizeLanguage(elements.languageInput.value),
    printers: readEditorModel()
  };
  await api("/api/config", {
    method: "PUT",
    body: JSON.stringify(config)
  });
  elements.settingsDialog.close("saved");
  await loadAll();
});

elements.saveSpoolProfileButton.addEventListener("click", async (event) => {
  event.preventDefault();
  try {
    await saveSpoolProfile();
  } catch (error) {
    setConnectionState(error.message, "error");
  }
});

activateLanguage("en");
loadAll();
setInterval(loadAll, 15000);
