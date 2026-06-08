(function () {
  "use strict";

  if (window.FXLaclefExtension) return;

  function getStorageArea() {
    try {
      return globalThis.chrome?.storage?.local || null;
    } catch {
      return null;
    }
  }

  function storageUnavailable() {
    return Promise.reject(new Error(
      "Le stockage de l'extension est indisponible. Actualise l'extension puis recharge cet onglet."
    ));
  }

  const storage = {
    get(key) {
      const area = getStorageArea();
      if (!area) return storageUnavailable();
      return area.get(key).then(result => result[key]);
    },
    set(key, value) {
      const area = getStorageArea();
      if (!area) return storageUnavailable();
      return area.set({ [key]: value });
    },
    remove(key) {
      const area = getStorageArea();
      if (!area) return storageUnavailable();
      return area.remove(key);
    }
  };

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function fireInputEvents(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setFieldValue(el, value) {
    if (!el) return false;
    el.focus();
    el.value = value || "";
    el.setAttribute("value", value || "");
    fireInputEvents(el);
    el.blur();
    return true;
  }

  function findVisible(selector) {
    return [...document.querySelectorAll(selector)]
      .find(el => el.offsetParent !== null);
  }

  function makeButton(label, extraClass) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.className = `fx-laclef-btn ${extraClass || ""}`.trim();
    return btn;
  }

  function showDialog(options) {
    const config = typeof options === "string" ? { message: options } : options;
    const title = config.title || "La CLEF Assistant";
    const message = config.message || "";
    const detail = config.detail || "";
    const actions = config.actions?.length ? config.actions : [{ label: "OK", value: true, primary: true }];

    document.querySelector("#fx-laclef-dialog")?.remove();

    return new Promise(resolve => {
      const backdrop = document.createElement("div");
      backdrop.id = "fx-laclef-dialog";
      backdrop.className = "fx-laclef-modal-backdrop";

      const dialog = document.createElement("div");
      dialog.className = "fx-laclef-modal fx-laclef-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");

      const header = document.createElement("div");
      header.className = "fx-laclef-modal-header";

      const titleWrap = document.createElement("div");
      const heading = document.createElement("h2");
      heading.className = "fx-laclef-modal-title";
      heading.textContent = title;

      const subtitle = document.createElement("div");
      subtitle.className = "fx-laclef-modal-subtitle";
      subtitle.textContent = "Message de l'extension";

      titleWrap.append(heading, subtitle);

      const badge = document.createElement("span");
      badge.className = "fx-laclef-modal-badge";
      badge.textContent = "Extension";

      header.append(titleWrap, badge);

      const body = document.createElement("div");
      body.className = "fx-laclef-modal-body";

      const text = document.createElement("div");
      text.className = "fx-laclef-dialog-message";
      text.textContent = message;
      body.appendChild(text);

      if (detail) {
        const detailEl = document.createElement("div");
        detailEl.className = "fx-laclef-note";
        detailEl.textContent = detail;
        body.appendChild(detailEl);
      }

      const actionRow = document.createElement("div");
      actionRow.className = "fx-laclef-modal-actions";

      const close = value => {
        backdrop.remove();
        resolve(value);
      };

      actions.forEach(action => {
        const btn = makeButton(action.label, action.primary ? "" : "fx-laclef-btn-secondary");
        btn.addEventListener("click", () => close(action.value));
        actionRow.appendChild(btn);
      });

      body.appendChild(actionRow);
      dialog.append(header, body);
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);

      backdrop.addEventListener("click", event => {
        if (event.target === backdrop && config.closeOnBackdrop !== false) {
          close(actions[0].value);
        }
      });

      const primary = actionRow.querySelector(".fx-laclef-btn");
      setTimeout(() => primary?.focus(), 50);
    });
  }

  function notify(message, title) {
    return showDialog({ title: title || "La CLEF Assistant", message });
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function installRouteHooks() {
    if (window.__fxLaclefRouteHooksInstalled) return;
    window.__fxLaclefRouteHooksInstalled = true;

    ["pushState", "replaceState"].forEach(method => {
      const original = history[method];
      history[method] = function () {
        const result = original.apply(this, arguments);
        window.dispatchEvent(new Event("fx-laclef-locationchange"));
        return result;
      };
    });

    window.addEventListener("popstate", () => {
      window.dispatchEvent(new Event("fx-laclef-locationchange"));
    });
  }

  function onPageChange(callback) {
    installRouteHooks();

    let lastHref = "";

    const runIfChanged = () => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      callback();
    };

    window.addEventListener("fx-laclef-locationchange", () => {
      setTimeout(runIfChanged, 50);
      setTimeout(runIfChanged, 500);
    });

    setInterval(runIfChanged, 700);
    runIfChanged();
  }

  window.FXLaclefExtension = {
    storage,
    wait,
    fireInputEvents,
    setFieldValue,
    findVisible,
    makeButton,
    showDialog,
    notify,
    normalizeText,
    onPageChange
  };
})();
