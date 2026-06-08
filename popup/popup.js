(function () {
  "use strict";

  const clientEl = document.querySelector("#client");
  const clearClientBtn = document.querySelector("#clear-client");
  const openAniappsBtn = document.querySelector("#open-aniapps");
  const openBilletterieBtn = document.querySelector("#open-billetterie");
  const stopAutoBtn = document.querySelector("#stop-auto");
  const debugAutoBtn = document.querySelector("#debug-auto");
  const autoStatusEl = document.querySelector("#auto-status");

  const AUTO_LOCAL_KEYS = [
    "aniapps_auto_enabled",
    "aniapps_mode",
    "aniapps_auto_run_id",
    "aniapps_auto_updated_at",
    "aniapps_compare_correction_queue",
    "aniapps_compare_correction_index",
    "aniapps_compare_correction_enabled",
    "aniapps_compare_correction_mode",
    "aniapps_compare_correction_run_id",
    "aniapps_sepa_step5"
  ];
  const AUTO_SESSION_KEYS = [
    "aniapps_auto_session_run_id",
    "aniapps_auto_next_action_allowed",
    "aniapps_compare_correction_step_allowed"
  ];

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function renderClient() {
    const result = await chrome.storage.local.get("billetterie_client");
    const client = result.billetterie_client;

    if (!client) {
      clientEl.className = "muted";
      clientEl.textContent = "Aucun client copié depuis ANIAPPS.";
      return;
    }

    clientEl.className = "";
    clientEl.innerHTML = `
      <div class="client-name">${escapeHtml(client.prenom)} ${escapeHtml(client.nom)}</div>
      <div class="client-details">${escapeHtml(client.email || "Email absent")}</div>
      <div class="client-details">${escapeHtml(client.telephone || "Telephone absent")}</div>
      <div class="client-details">Copie : ${escapeHtml(client.copiedAt || "")}</div>
    `;
  }

  clearClientBtn.addEventListener("click", async () => {
    await chrome.storage.local.remove("billetterie_client");
    renderClient();
  });

  openAniappsBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://laclef.aniapp.fr/admin/" });
  });

  openBilletterieBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://billetterie.laclef.asso.fr/" });
  });

  stopAutoBtn.addEventListener("click", async () => {
    stopAutoBtn.disabled = true;
    autoStatusEl.textContent = "Nettoyage en cours...";

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("Aucun onglet actif.");

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const localKeys = [
            "aniapps_auto_enabled",
            "aniapps_mode",
            "aniapps_auto_run_id",
            "aniapps_auto_updated_at",
            "aniapps_compare_correction_queue",
            "aniapps_compare_correction_index",
            "aniapps_compare_correction_enabled",
            "aniapps_compare_correction_mode",
            "aniapps_compare_correction_run_id",
            "aniapps_sepa_step5"
          ];
          const sessionKeys = [
            "aniapps_auto_session_run_id",
            "aniapps_auto_next_action_allowed",
            "aniapps_compare_correction_step_allowed"
          ];

          localKeys.forEach(key => localStorage.removeItem(key));
          sessionKeys.forEach(key => sessionStorage.removeItem(key));
          window.__fxAniappsProgrammationsRunning = false;
          window.__fxCompareCorrectionRunning = false;
          document.querySelector("#fx-auto-precheck-modal")?.remove();
          document.querySelector("#fx-auto-programmations-modal")?.remove();
          document.querySelector("#fx-music-converter-modal")?.remove();
          document.querySelector("#fx-laclef-dialog")?.remove();
          document.querySelector("#fx-auto-emergency-stop")?.remove();

          if (typeof window.FXStopAniappsAutoProgrammations === "function") {
            window.FXStopAniappsAutoProgrammations(false);
          }
        }
      });

      autoStatusEl.textContent = "Auto programmation arretee sur l'onglet actif.";
    } catch (error) {
      autoStatusEl.textContent = error.message || "Impossible de stopper depuis cet onglet.";
    } finally {
      stopAutoBtn.disabled = false;
    }
  });

  debugAutoBtn.addEventListener("click", async () => {
    debugAutoBtn.disabled = true;
    autoStatusEl.textContent = "Diagnostic en cours...";

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("Aucun onglet actif.");

      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [AUTO_LOCAL_KEYS, AUTO_SESSION_KEYS],
        func: (localKeys, sessionKeys) => {
          const readKeys = (store, keys) => Object.fromEntries(
            keys.map(key => [key, store.getItem(key)])
          );

          return {
            href: location.href,
            readyState: document.readyState,
            localStorage: readKeys(localStorage, localKeys),
            sessionStorage: readKeys(sessionStorage, sessionKeys),
            flags: {
              autoRunning: Boolean(window.__fxAniappsProgrammationsRunning),
              correctionRunning: Boolean(window.__fxCompareCorrectionRunning)
            },
            extensionNodes: [
              "#fx-auto-precheck-modal",
              "#fx-auto-programmations-modal",
              "#fx-music-converter-modal",
              "#fx-laclef-dialog",
              "#fx-auto-emergency-stop",
              "#fx-programmations-panel-root"
            ].filter(selector => document.querySelector(selector))
          };
        }
      });

      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      autoStatusEl.textContent = "Diagnostic copie dans le presse-papiers.";
    } catch (error) {
      autoStatusEl.textContent = error.message || "Diagnostic impossible.";
    } finally {
      debugAutoBtn.disabled = false;
    }
  });

  renderClient();
})();
