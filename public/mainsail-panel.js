import { applyTranslations, setLanguage, t } from "./i18n.js?v=5";

const state = {
  config: null,
  assignments: {},
  spools: [],
  printerStatus: {}
};

const params = new URLSearchParams(window.location.search);
const selectedPrinterId = params.get("printer") || "";

const $ = (selector, root = document) => root.querySelector(selector);

const elements = {
  statusChip: $("#statusChip"),
  printerGrid: $("#printerGrid"),
  refreshButton: $("#refreshButton"),
  printerTemplate: $("#printerTemplate")
};

function localUrl(path) {
  return new URL(String(path).replace(/^\/+/, ""), new URL(".", window.location.href)).toString();
}

async function api(path, options = {}) {
  const headers = { accept: "application/json", ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(localUrl(path), { ...options, headers });
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

function formatWeight(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return t("spool.unknownWeight");
  return `${Math.round(Number(value))} g`;
}

function spoolUsage(spool) {
  const remaining = Number(spool.remainingWeight);
  const used = Number(spool.usedWeight);
  const total = remaining + used;
  const percent = Number.isFinite(remaining) && remaining >= 0 && Number.isFinite(used) && used >= 0 && total > 0
    ? Math.max(0, Math.min(100, (remaining / total) * 100))
    : null;
  return {
    percent,
    label: percent === null ? t("spool.usageUnknown") : t("spool.remainingPercent", { percent: Math.round(percent) })
  };
}

function spoolVisual(spool) {
  const usage = spoolUsage(spool);
  const material = String(spool.material || "FIL").trim().slice(0, 4).toUpperCase();
  return `
    <span class="spool-visual" style="--spool-color:${escapeHtml(spool.color || "#49b6a8")};--spool-level:${usage.percent ?? 100}%"
      role="img" aria-label="${escapeHtml(`${spool.name}: ${usage.label}`)}">
      <span class="spool-flange"></span><span class="spool-filament"></span><span class="spool-hub">${escapeHtml(material)}</span>
    </span>
  `;
}

function materialLabel(spool) {
  return [spool.material, spool.vendor, spool.filamentName].filter(Boolean).join(" / ") || t("spool.unknownMaterial");
}

function profileRows(profile = {}) {
  return [
    [t("profile.pressureAdvance"), profile.pressureAdvance],
    [t("profile.retractLength"), profile.retractLength === null || profile.retractLength === undefined ? null : `${profile.retractLength} mm`],
    [t("profile.retractSpeed"), profile.retractSpeed === null || profile.retractSpeed === undefined ? null : `${profile.retractSpeed} mm/s`],
    [t("profile.nozzleShort"), profile.nozzleTemperature ? `${profile.nozzleTemperature} C` : null],
    [t("profile.bedShort"), profile.bedTemperature ? `${profile.bedTemperature} C` : null],
    [t("profile.chamberShort"), profile.chamberTemperature ? `${profile.chamberTemperature} C` : null],
    [t("profile.partCoolingFanShort"), profile.partCoolingFanSpeed === null || profile.partCoolingFanSpeed === undefined ? null : `${profile.partCoolingFanSpeed}%`]
  ];
}

function assignedSpool(printerId, toolheadId) {
  const spoolId = state.assignments?.[printerId]?.[toolheadId]?.spoolId;
  return state.spools.find((spool) => Number(spool.id) === Number(spoolId));
}

function assignmentOwners(spoolId) {
  const owners = [];
  for (const printer of state.config?.printers || []) {
    for (const toolhead of printer.toolheads || printer.extruders || []) {
      const assignedId = state.assignments?.[printer.id]?.[toolhead.id]?.spoolId;
      if (Number(assignedId) === Number(spoolId)) {
        owners.push({ printerId: printer.id, printerName: printer.name, toolheadId: toolhead.id, toolheadName: toolhead.name });
      }
    }
  }
  return owners;
}

function printerPrintState(printerId) {
  const status = state.printerStatus?.[printerId];
  const rawState = status?.result?.status?.print_stats?.state;
  return String(rawState || "unknown").toLowerCase();
}

function printerIsLocked(printerId) {
  return ["printing", "paused"].includes(printerPrintState(printerId));
}

function spoolOptionLabel(spool) {
  return [
    spool.name || `Spool #${spool.id}`,
    materialLabel(spool),
    formatWeight(spool.remainingWeight)
  ].filter(Boolean).join(" - ");
}

function renderSpoolOptions(currentSpoolId, printerId, toolheadId) {
  const options = [`<option value="">${escapeHtml(t("spool.none"))}</option>`];
  state.spools.forEach((spool) => {
    const selected = String(spool.id) === String(currentSpoolId) ? " selected" : "";
    const occupiedElsewhere = assignmentOwners(spool.id)
      .filter((owner) => owner.printerId !== printerId || owner.toolheadId !== toolheadId);
    const ownerLabel = occupiedElsewhere.length
      ? ` - ${occupiedElsewhere.map((owner) => t("spool.assignedTo", { printer: owner.printerName, toolhead: owner.toolheadName })).join("; ")}`
      : "";
    options.push(`<option value="${escapeHtml(spool.id)}"${selected}${occupiedElsewhere.length ? " disabled" : ""}>${escapeHtml(spoolOptionLabel(spool) + ownerLabel)}</option>`);
  });
  return options.join("");
}

function renderAssignmentControls(printer, toolhead, spool, locked) {
  const currentSpoolId = spool?.id ?? state.assignments?.[printer.id]?.[toolhead.id]?.spoolId ?? "";
  const syncPending = state.assignments?.[printer.id]?.[toolhead.id]?.syncPending;
  const disabled = locked ? " disabled" : "";
  const lockText = locked ? `<span class="assignment-lock">${escapeHtml(t("status.assignmentLocked", { state: printerPrintState(printer.id) }))}</span>` : "";
  const pendingText = syncPending ? `<span class="assignment-lock">${escapeHtml(t("status.syncPending"))}</span>` : "";
  return `
    <form class="assignment-form" data-printer-id="${escapeHtml(printer.id)}" data-toolhead-id="${escapeHtml(toolhead.id)}">
      <select class="spool-select" name="spoolId"${disabled} aria-label="Spule fuer ${escapeHtml(toolhead.name)}">
        ${renderSpoolOptions(currentSpoolId, printer.id, toolhead.id)}
      </select>
      ${lockText}
      ${pendingText}
    </form>
  `;
}

function renderToolhead(printer, toolhead) {
  const spool = assignedSpool(printer.id, toolhead.id);
  const locked = printerIsLocked(printer.id);
  if (!spool) {
    return `
      <section class="toolhead-card empty">
        <div class="toolhead-title">
          <strong>${escapeHtml(toolhead.name)}</strong>
          <span>${escapeHtml(toolhead.klipperObject || "")}</span>
        </div>
        <div class="empty-state">${escapeHtml(t("spool.noAssigned"))}</div>
        ${renderAssignmentControls(printer, toolhead, spool, locked)}
      </section>
    `;
  }

  const profile = spool.profile || {};
  const profileHtml = profileRows(profile)
    .map(([label, value]) => `
      <div class="profile-cell ${value === null || value === undefined ? "muted" : ""}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value ?? "-")}</strong>
      </div>
    `)
    .join("");

  return `
    <section class="toolhead-card">
      <div class="toolhead-title">
        <strong>${escapeHtml(toolhead.name)}</strong>
        <span>${escapeHtml(toolhead.klipperObject || "")}</span>
      </div>
      <div class="spool-line">
        ${spoolVisual(spool)}
        <div>
          <h3>${escapeHtml(spool.name)}</h3>
          <p>${escapeHtml(materialLabel(spool))}</p>
        </div>
        <span class="weight-chip">${escapeHtml(t("spool.remaining", { weight: formatWeight(spool.remainingWeight) }))} · ${escapeHtml(spoolUsage(spool).label)}</span>
      </div>
      <div class="profile-grid">${profileHtml}</div>
      ${renderAssignmentControls(printer, toolhead, spool, locked)}
      <div class="spool-footer">
        <span>Spool #${escapeHtml(spool.id)}</span>
        ${spool.location ? `<span>${escapeHtml(spool.location)}</span>` : `<span>${escapeHtml(t("spool.noLocation"))}</span>`}
      </div>
    </section>
  `;
}

function render() {
  const allPrinters = state.config?.printers || [];
  const printers = selectedPrinterId
    ? allPrinters.filter((printer) => String(printer.id) === selectedPrinterId)
    : allPrinters;
  if (!printers.length) {
    elements.printerGrid.innerHTML = `<div class="empty-state page-empty">${escapeHtml(selectedPrinterId ? t("mainsail.noPrinter", { id: selectedPrinterId }) : t("mainsail.noPrinters"))}</div>`;
    return;
  }

  elements.printerGrid.innerHTML = "";
  printers.forEach((printer) => {
    const toolheads = printer.toolheads || printer.extruders || [];
    const fragment = elements.printerTemplate.content.cloneNode(true);
    const card = $(".printer-card", fragment);
    $("[data-field='printer-name']", card).textContent = printer.name;
    $("[data-field='printer-url']", card).textContent = printer.moonrakerUrl;
    const printState = printerPrintState(printer.id);
    const toolheadBadge = $("[data-field='toolhead-count']", card);
    toolheadBadge.textContent = t("printer.toolheadState", { count: toolheads.length, state: printState });
    toolheadBadge.classList.toggle("locked", printerIsLocked(printer.id));
    $("[data-field='toolheads']", card).innerHTML = toolheads.map((toolhead) => renderToolhead(printer, toolhead)).join("");
    elements.printerGrid.appendChild(fragment);
  });
}

function setStatus(text, mode = "") {
  elements.statusChip.textContent = text;
  elements.statusChip.className = `status-chip ${mode}`.trim();
}

async function loadPanel() {
  try {
    setStatus("Aktualisiere...");
    const [config, assignments, spools] = await Promise.all([
      api("/api/config"),
      api("/api/assignments"),
      api("/api/spoolman/spools")
    ]);
    state.config = config;
    setLanguage(config.language);
    applyTranslations();
    state.assignments = assignments;
    state.spools = spools;
    await loadPrinterStatuses();
    const spoolCount = t("status.spoolCount", { count: spools.length });
    setStatus(selectedPrinterId ? `${selectedPrinterId} / ${spoolCount}` : spoolCount, "ok");
    render();
  } catch (error) {
    console.error(error);
    setStatus(error.message, "error");
  }
}

async function loadPrinterStatuses() {
  const allPrinters = state.config?.printers || [];
  const printers = selectedPrinterId
    ? allPrinters.filter((printer) => String(printer.id) === selectedPrinterId)
    : allPrinters;
  const results = await Promise.allSettled(
    printers.map((printer) => api(`/api/moonraker/${encodeURIComponent(printer.id)}/status`))
  );
  const statuses = {};
  printers.forEach((printer, index) => {
    statuses[printer.id] = results[index].status === "fulfilled" ? results[index].value : null;
  });
  state.printerStatus = statuses;
}

async function assignSpool(printerId, toolheadId, spoolId) {
  const result = await api(`/api/assignments/${encodeURIComponent(printerId)}/${encodeURIComponent(toolheadId)}`, {
    method: "PUT",
    body: JSON.stringify({ spoolId: spoolId ? Number(spoolId) : null })
  });
  state.assignments = result.assignments;
  await loadPrinterStatuses();
  setStatus(
    result.warning || t("status.assignmentSaved"),
    result.pendingSync ? "locked" : (result.warning ? "error" : "ok")
  );
  render();
}

elements.refreshButton.addEventListener("click", loadPanel);
elements.printerGrid.addEventListener("change", async (event) => {
  const select = event.target.closest(".spool-select");
  if (!select) return;
  const form = select.closest(".assignment-form");
  const printerId = form.dataset.printerId;
  const toolheadId = form.dataset.toolheadId;
  const spoolId = select.value;
  const previousValue = state.assignments?.[printerId]?.[toolheadId]?.spoolId ?? "";
  try {
    select.disabled = true;
    setStatus(t("status.saving"));
    await assignSpool(printerId, toolheadId, spoolId);
  } catch (error) {
    console.error(error);
    select.value = String(previousValue);
    setStatus(error.message, "error");
  } finally {
    select.disabled = false;
  }
});

setLanguage("en");
applyTranslations();
loadPanel();
setInterval(loadPanel, 10000);
