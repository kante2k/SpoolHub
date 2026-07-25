(function () {
  "use strict";

  var script = document.currentScript;
  var panelSrc = script?.dataset?.spoolhubSrc || "";
  if (!panelSrc) return;
  var menuId = "spoolhub-menu-entry";
  var viewId = "spoolhub-main-view";
  var styleId = "spoolhub-mainsail-menu-style";

  function safeAttr(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  function addStyle() {
    if (document.getElementById(styleId)) return;
    var style = document.createElement("style");
    style.id = styleId;
    style.textContent = [
      "#" + menuId + " {",
      "  display: flex;",
      "  align-items: center;",
      "  gap: 12px;",
      "  min-height: 44px;",
      "  padding: 0 16px;",
      "  margin: 4px 8px;",
      "  border-radius: 6px;",
      "  color: inherit;",
      "  text-decoration: none;",
      "  cursor: pointer;",
      "}",
      "#" + menuId + ":hover, #" + menuId + ".active {",
      "  background: rgba(77, 182, 172, 0.14);",
      "}",
      "#" + menuId + " .spoolhub-menu-icon {",
      "  width: 22px;",
      "  height: 22px;",
      "  border-radius: 50%;",
      "  background: #4db6ac;",
      "  box-shadow: inset 0 0 0 5px rgba(0,0,0,0.22);",
      "  flex: 0 0 auto;",
      "}",
      "#" + menuId + " .spoolhub-menu-label {",
      "  font-size: 0.95rem;",
      "  white-space: nowrap;",
      "}",
      "#" + viewId + " {",
      "  position: static;",
      "  display: flex;",
      "  flex-direction: column;",
      "  width: 100%;",
      "  height: calc(100vh - 64px);",
      "  height: calc(100dvh - 64px);",
      "  min-height: 0;",
      "  padding: 12px;",
      "  box-sizing: border-box;",
      "  overflow: hidden;",
      "}",
      "#" + viewId + " .spoolhub-view-toolbar {",
      "  display: flex;",
      "  align-items: center;",
      "  justify-content: flex-start;",
      "  gap: 8px;",
      "  margin-bottom: 10px;",
      "}",
      "#" + viewId + " .spoolhub-back-button {",
      "  min-height: 34px;",
      "  padding: 0 12px;",
      "  border: 1px solid rgba(255,255,255,0.16);",
      "  border-radius: 6px;",
      "  background: rgba(255,255,255,0.06);",
      "  color: inherit;",
      "  cursor: pointer;",
      "  font: inherit;",
      "}",
      "#" + viewId + " .spoolhub-back-button:hover {",
      "  border-color: #4db6ac;",
      "}",
      "#" + viewId + "[hidden] {",
      "  display: none !important;",
      "}",
      "#" + viewId + " .spoolhub-view-frame {",
      "  display: block;",
      "  flex: 1 1 auto;",
      "  width: 100%;",
      "  height: auto;",
      "  min-height: 0;",
      "  border: 0;",
      "  border-radius: 8px;",
      "  background: #111318;",
      "}",
      ".v-navigation-drawer, .v-menu__content, .v-overlay-container, .v-overlay, .v-dialog__content {",
      "  z-index: 1000 !important;",
      "}",
      "@media (max-width: 600px) {",
      "  #" + viewId + " {",
      "    height: calc(100vh - 56px);",
      "    height: calc(100dvh - 56px);",
      "    padding: 8px 0 0;",
      "  }",
      "  #" + viewId + " .spoolhub-view-toolbar {",
      "    padding: 0 8px;",
      "    margin-bottom: 8px;",
      "  }",
      "  #" + viewId + " .spoolhub-view-frame {",
      "    border-radius: 0;",
      "  }",
      "}",
      ".spoolhub-hidden-for-view {",
      "  display: none !important;",
      "}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function routeIsSpoolHub() {
    return [window.location.hash, window.location.pathname, window.location.search]
      .join(" ")
      .toLowerCase()
      .includes("spoolhub");
  }

  function goToDashboard() {
    hideSpoolHubView();
    if ((window.location.hash || "").toLowerCase().includes("spoolhub")) {
      window.location.hash = "#/dashboard";
    }
    window.setTimeout(hideSpoolHubView, 50);
    window.setTimeout(hideSpoolHubView, 350);
  }

  function closeMobileDrawer() {
    var drawer = document.querySelector(".v-navigation-drawer--is-mobile.v-navigation-drawer--open");
    if (!drawer) return;
    var scrim = document.querySelector(".v-overlay--active .v-overlay__scrim, .v-overlay__scrim");
    if (scrim && typeof scrim.click === "function") scrim.click();
  }

  function findMenuHost() {
    var selectors = [
      ".v-navigation-drawer .v-list",
      ".v-navigation-drawer nav",
      ".v-navigation-drawer__content",
      "aside .v-list",
      "aside nav",
      "nav",
      "aside"
    ];
    for (var i = 0; i < selectors.length; i += 1) {
      var candidate = document.querySelector(selectors[i]);
      if (candidate) return candidate;
    }
    return null;
  }

  function findMainHost() {
    var selectors = [
      ".v-main__wrap",
      ".v-main",
      "main",
      "[role='main']",
      "#app"
    ];
    for (var i = 0; i < selectors.length; i += 1) {
      var candidate = document.querySelector(selectors[i]);
      if (candidate) return candidate;
    }
    return document.body;
  }

  function addMenuEntry() {
    if (document.getElementById(menuId)) return true;
    var host = findMenuHost();
    if (!host) return false;

    var entry = document.createElement("a");
    entry.id = menuId;
    entry.href = "#/spoolhub";
    entry.innerHTML = [
      "<span class=\"spoolhub-menu-icon\" aria-hidden=\"true\"></span>",
      "<span class=\"spoolhub-menu-label\">SpoolHub</span>"
    ].join("");
    entry.addEventListener("click", function (event) {
      event.preventDefault();
      window.location.hash = "#/spoolhub";
      showSpoolHubView();
      window.setTimeout(closeMobileDrawer, 50);
    });

    host.appendChild(entry);
    return true;
  }

  function createView() {
    var existing = document.getElementById(viewId);
    if (existing) return existing;

    var view = document.createElement("section");
    view.id = viewId;
    view.hidden = true;
    view.innerHTML = [
      "<div class=\"spoolhub-view-toolbar\">",
      "  <button class=\"spoolhub-back-button\" type=\"button\">Dashboard</button>",
      "</div>",
      "<iframe class=\"spoolhub-view-frame\" title=\"SpoolHub\" src=\"" + safeAttr(panelSrc) + "\"></iframe>"
    ].join("");
    view.querySelector(".spoolhub-back-button").addEventListener("click", goToDashboard);
    return view;
  }

  function clearHiddenClasses() {
    Array.prototype.forEach.call(document.querySelectorAll(".spoolhub-hidden-for-view"), function (element) {
      element.classList.remove("spoolhub-hidden-for-view");
    });
  }

  function setMainChildrenHidden(host, hidden) {
    if (!hidden) clearHiddenClasses();
    Array.prototype.forEach.call(host.children, function (child) {
      if (child.id === viewId) return;
      child.classList.toggle("spoolhub-hidden-for-view", hidden);
    });
  }

  function showSpoolHubView() {
    addStyle();
    var host = findMainHost();
    var view = createView();
    if (!view.parentElement) host.appendChild(view);
    setMainChildrenHidden(host, true);
    view.hidden = false;
    document.getElementById(menuId)?.classList.add("active");
  }

  function hideSpoolHubView() {
    var view = document.getElementById(viewId);
    var host = view?.parentElement || findMainHost();
    setMainChildrenHidden(host, false);
    if (view) view.hidden = true;
    document.getElementById(menuId)?.classList.remove("active");
  }

  function syncRoute() {
    addStyle();
    addMenuEntry();
    if (routeIsSpoolHub()) {
      showSpoolHubView();
    } else {
      hideSpoolHubView();
    }
  }

  function scheduleSync() {
    window.setTimeout(syncRoute, 200);
    window.setTimeout(syncRoute, 1000);
    window.setTimeout(syncRoute, 2500);
  }

  window.addEventListener("hashchange", scheduleSync);
  window.addEventListener("popstate", scheduleSync);
  document.addEventListener("click", function (event) {
    var link = event.target.closest?.("a[href]");
    if (!link) return;
    var href = String(link.getAttribute("href") || "").toLowerCase();
    if (href && !href.includes("spoolhub")) {
      window.setTimeout(hideSpoolHubView, 80);
      window.setTimeout(hideSpoolHubView, 450);
    }
  }, true);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleSync);
  } else {
    scheduleSync();
  }

  new MutationObserver(function () {
    if (!document.getElementById(menuId) || routeIsSpoolHub()) {
      syncRoute();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
