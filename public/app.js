import { applyTranslations, availableLanguages, normalizeLanguage, setLanguage, t } from "./i18n.js?v=6";

const state = {
  config: null,
  spools: [],
  assignments: {},
  history: [],
  query: "",
  historyVisible: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const elements = {
  printerList: $("#printerList"),
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
  const level = usage.percent === null ? 100 : usage.percent;
  const material = String(spool.material || "FIL").trim().slice(0, 4).toUpperCase();
  return `
    <span class="spool-visual${compact ? " compact" : ""}" style="--spool-color:${escapeHtml(spool.color || "#49b6a8")};--spool-level:${level}%"
      role="img" aria-label="${escapeHtml(`${spool.name}: ${usage.label}`)}">
      <span class="spool-flange"></span>
      <span class="spool-filament"></span>
      <span class="spool-hub">${escapeHtml(material)}</span>
    </span>
  `;
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

function renderPrinters() {
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
              <small>${escapeHtml(printer.moonrakerUrl)}</small>
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
    const close = () => {
      menu.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.value = select.selectedOptions[0]?.textContent || t("spool.none");
    };
    const filter = () => {
      const query = input.value.trim().toLocaleLowerCase();
      $$(".spool-combobox-option", menu).forEach((option) => {
        option.hidden = Boolean(query) && !option.textContent.toLocaleLowerCase().includes(query);
      });
      menu.hidden = false;
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
        setConnectionState(t("status.assigning"), "");
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

function renderSpools() {
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

    card.dataset.printerIndex = printerIndex;
    applyTranslations(template);
    elements.printerEditor.appendChild(template);
  });

  bindEditorEvents();
}

function readEditorModel() {
  return $$(".editor-card", elements.printerEditor).map((card, index) => ({
    id: $("[data-field='id']", card).value.trim(),
    name: $("[data-field='name']", card).value.trim(),
    moonrakerUrl: $("[data-field='moonrakerUrl']", card).value.trim().replace(/\/+$/, ""),
    mainsailUrl: $("[data-field='mainsailUrl']", card).value.trim().replace(/\/+$/, ""),
    toolheads: $$(".extruder-line", card).map((line, toolheadIndex) => ({
      id: $("[data-field='toolhead-id']", line).value.trim(),
      name: $("[data-field='toolhead-name']", line).value.trim(),
      klipperObject: $("[data-field='toolhead-klipper-object']", line).value.trim()
    }))
  }));
}

function bindEditorEvents() {
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
      renderPrinterEditor(printers);
    });
  });

  $$("[data-action='remove-toolhead']", elements.printerEditor).forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".extruder-line").remove();
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

elements.addPrinterButton.addEventListener("click", () => {
  const printers = readEditorModel();
  const printerId = `printer-${printers.length + 1}`;
  printers.push({
    id: printerId,
    name: `Printer ${printers.length + 1}`,
    moonrakerUrl: "http://localhost:7125",
    mainsailUrl: "http://localhost",
    toolheads: [{
      id: `${printerId}-t0`,
      name: "T0",
      klipperObject: "extruder"
    }]
  });
  renderPrinterEditor(printers);
});

elements.saveSettingsButton.addEventListener("click", async (event) => {
  event.preventDefault();
  const config = {
    spoolmanUrl: elements.spoolmanUrlInput.value.trim().replace(/\/+$/, ""),
    syncSpoolLocation: elements.syncLocationInput.checked,
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
