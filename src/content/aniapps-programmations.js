(function () {
  "use strict";

  if (window.__fxAniappsProgrammationsLoaded) return;
  window.__fxAniappsProgrammationsLoaded = true;

  const { wait, fireInputEvents, makeButton, notify, storage, normalizeText, onPageChange } = window.FXLaclefExtension;

  const KEYS = {
    enabled: "aniapps_auto_enabled",
    data: "aniapps_programmations",
    index: "aniapps_index",
    mode: "aniapps_mode",
    clonePattern: "aniapps_clone_pattern",
    runId: "aniapps_auto_run_id",
    updatedAt: "aniapps_auto_updated_at",
    cloneSourceId: "aniapps_auto_clone_source_id",
    verifyAttempts: "aniapps_auto_verify_attempts"
  };
  const SESSION_RUN_ID_KEY = "aniapps_auto_session_run_id";
  const SESSION_NEXT_ACTION_KEY = "aniapps_auto_next_action_allowed";
  const MAX_AUTO_IDLE_MS = 3 * 60 * 1000;
  const MAX_NEXT_ACTION_MS = 25 * 1000;
  const PAGE_READY_TIMEOUT_MS = 7000;
  const CLONE_DIALOG_TIMEOUT_MS = 4000;
  const CLONE_MENU_SETTLE_MS = 550;
  const SHORT_SETTLE_MS = 120;
  const AFTER_FILL_SETTLE_MS = 180;
  const AFTER_COMPLETE_VERIFY_DELAY_MS = 900;
  const MAX_VERIFY_RETRY_ATTEMPTS = 2;

  const SAMPLE = [
    {
      "label": "Atelier exemple",
      "debut": "18:00",
      "fin": "19:30",
      "duree": "1:30",
      "jour": "1",
      "salle": "12",
      "prof": "34",
      "places": "15",
      "tarif": "300"
    }
  ];

  const AUTO_MODAL_ID = "fx-auto-programmations-modal";
  const EMERGENCY_STOP_ID = "fx-auto-emergency-stop";
  const SHEET_BATCHES_KEY = "aniapps_music_sheet_batches";

  function readProgrammations() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.data) || "[]");
    } catch {
      return [];
    }
  }

  function isProgrammingEditPage() {
    return /\/admin\/activity_schedules\/\d+\/edit/.test(location.pathname);
  }

  function getCurrentScheduleId() {
    return location.pathname.match(/\/admin\/activity_schedules\/(\d+)\/edit/)?.[1] || "";
  }

  function setInput(selector, value) {
    const el = document.querySelector(selector);
    if (!el) throw new Error("Champ introuvable : " + selector);
    el.value = value || "";
    fireInputEvents(el);
  }

  function setSelect(selector, value) {
    const el = document.querySelector(selector);
    if (!el) throw new Error("Select introuvable : " + selector);
    el.value = value || "";
    fireInputEvents(el);
  }

  function setTarifGroup(tarif) {
    const select = document.querySelector("#activity_schedule_season_pricing_attributes_fee_schedule_id");
    if (!select) throw new Error("Select groupe tarifaire introuvable");

    const numbers = String(tarif).match(/\d+/g);
    if (!numbers) return;

    const option = [...select.options].find(item => {
      const optionNumbers = item.textContent.match(/\d+/g);
      return optionNumbers && numbers.every(number => optionNumbers.includes(number));
    });

    if (!option) throw new Error("Groupe tarifaire introuvable pour : " + tarif);

    select.value = option.value;
    fireInputEvents(select);

    const chosen = document.querySelector(`#s2id_${select.id} .select2-chosen`);
    if (chosen) chosen.textContent = option.textContent.trim();
  }

  function findCloneLink() {
    const pattern = localStorage.getItem(KEYS.clonePattern) || "/clone/7";
    return [...document.querySelectorAll("a[href]")]
      .find(link => link.href.includes(pattern) || link.getAttribute("href")?.includes(pattern));
  }

  function findSubmitButton() {
    return [...document.querySelectorAll('input[type="submit"], button')]
      .find(btn => normalizeText(btn.value || btn.innerText || "").includes("modifier la programmation"));
  }

  function findValidateButton() {
    const buttons = [...document.querySelectorAll("button")].filter(btn => {
      if (btn.disabled) return false;
      if (btn.offsetParent === null) return false;
      return true;
    });

    return buttons.find(btn => btn.classList.contains("confirm")) ||
      buttons.find(btn => normalizeText(btn.textContent) === "valider");
  }

  async function waitForCondition(predicate, timeoutMs, label) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const result = predicate();
      if (result) return result;
      await wait(50);
    }

    throw new Error(`${label || "Element"} introuvable apres ${Math.round(timeoutMs / 1000)}s`);
  }

  async function waitForEditFormReady() {
    await waitForCondition(() => {
      if (document.readyState === "loading") return false;
      if (!document.querySelector("#activity_schedule_label")) return false;
      if (!document.querySelector("#activity_schedule_activity_session_schedules_attributes_0_hour_begin")) return false;
      if (!document.querySelector("#activity_schedule_contact_id")) return false;
      return findSubmitButton();
    }, PAGE_READY_TIMEOUT_MS, "Formulaire programmation");

    await wait(SHORT_SETTLE_MS);
  }

  function stopAutomation(message) {
    localStorage.removeItem(KEYS.enabled);
    localStorage.removeItem(KEYS.mode);
    localStorage.removeItem(KEYS.runId);
    localStorage.removeItem(KEYS.updatedAt);
    localStorage.removeItem(KEYS.cloneSourceId);
    localStorage.removeItem(KEYS.verifyAttempts);
    localStorage.removeItem("aniapps_compare_correction_queue");
    localStorage.removeItem("aniapps_compare_correction_index");
    localStorage.removeItem("aniapps_compare_correction_enabled");
    localStorage.removeItem("aniapps_compare_correction_mode");
    localStorage.removeItem("aniapps_compare_correction_run_id");
    localStorage.removeItem("aniapps_sepa_step5");
    sessionStorage.removeItem(SESSION_RUN_ID_KEY);
    sessionStorage.removeItem(SESSION_NEXT_ACTION_KEY);
    sessionStorage.removeItem("aniapps_compare_correction_step_allowed");
    if (message) notify(message, "Auto programmations");
    updateAutoControls();
  }

  window.FXStopAniappsAutoProgrammations = function (showMessage = false) {
    localStorage.removeItem(KEYS.enabled);
    localStorage.removeItem(KEYS.mode);
    localStorage.removeItem(KEYS.runId);
    localStorage.removeItem(KEYS.updatedAt);
    localStorage.removeItem(KEYS.cloneSourceId);
    localStorage.removeItem(KEYS.verifyAttempts);
    localStorage.removeItem("aniapps_compare_correction_queue");
    localStorage.removeItem("aniapps_compare_correction_index");
    localStorage.removeItem("aniapps_compare_correction_enabled");
    localStorage.removeItem("aniapps_compare_correction_mode");
    localStorage.removeItem("aniapps_compare_correction_run_id");
    localStorage.removeItem("aniapps_sepa_step5");
    sessionStorage.removeItem(SESSION_RUN_ID_KEY);
    sessionStorage.removeItem(SESSION_NEXT_ACTION_KEY);
    sessionStorage.removeItem("aniapps_compare_correction_step_allowed");
    window.__fxAniappsProgrammationsRunning = false;
    window.__fxCompareCorrectionRunning = false;
    document.querySelector("#fx-auto-precheck-modal")?.remove();
    document.querySelector(`#${AUTO_MODAL_ID}`)?.remove();
    document.querySelector("#fx-music-converter-modal")?.remove();
    document.querySelector("#fx-laclef-dialog")?.remove();
    updateAutoControls();
    if (showMessage) notify("Auto programmation arretee.", "Auto programmations");
    console.info("[La CLEF Assistant] Auto programmations stoppees.");
  };

  function createRunSession() {
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(KEYS.enabled, "1");
    localStorage.setItem(KEYS.runId, runId);
    localStorage.setItem(KEYS.updatedAt, String(Date.now()));
    sessionStorage.setItem(SESSION_RUN_ID_KEY, runId);
    allowNextAutomationAction();
  }

  function touchRunSession() {
    localStorage.setItem(KEYS.updatedAt, String(Date.now()));
  }

  function allowNextAutomationAction(reason = "next") {
    sessionStorage.setItem(SESSION_NEXT_ACTION_KEY, JSON.stringify({
      at: Date.now(),
      reason
    }));
  }

  function consumeNextAutomationAction() {
    const raw = sessionStorage.getItem(SESSION_NEXT_ACTION_KEY);
    if (!raw) {
      cleanupStaleAutomation("action automatique non autorisee");
      return false;
    }

    let token = null;
    try {
      token = JSON.parse(raw);
    } catch {
      token = null;
    }

    if (!token?.at || Date.now() - Number(token.at) > MAX_NEXT_ACTION_MS) {
      cleanupStaleAutomation("action automatique expiree");
      return false;
    }

    sessionStorage.removeItem(SESSION_NEXT_ACTION_KEY);
    return true;
  }

  function cleanupStaleAutomation(reason) {
    localStorage.removeItem(KEYS.enabled);
    localStorage.removeItem(KEYS.mode);
    localStorage.removeItem(KEYS.runId);
    localStorage.removeItem(KEYS.updatedAt);
    localStorage.removeItem(KEYS.cloneSourceId);
    localStorage.removeItem(KEYS.verifyAttempts);
    sessionStorage.removeItem(SESSION_RUN_ID_KEY);
    sessionStorage.removeItem(SESSION_NEXT_ACTION_KEY);
    window.__fxAniappsProgrammationsRunning = false;
    updateAutoControls();
    console.warn("[La CLEF Assistant] Auto programmations ignoree :", reason);
  }

  function isAutomationSessionValid() {
    if (localStorage.getItem(KEYS.enabled) !== "1") return false;

    const runId = localStorage.getItem(KEYS.runId);
    const sessionRunId = sessionStorage.getItem(SESSION_RUN_ID_KEY);
    const updatedAt = Number(localStorage.getItem(KEYS.updatedAt) || "0");

    if (!runId || !sessionRunId || runId !== sessionRunId) {
      cleanupStaleAutomation("session absente ou differente");
      return false;
    }

    if (!updatedAt || Date.now() - updatedAt > MAX_AUTO_IDLE_MS) {
      cleanupStaleAutomation("session expiree");
      return false;
    }

    return true;
  }

  async function precheckProgrammations(programmations) {
    const api = window.FXAniappsCompareProgrammations;
    if (!api?.showAutoPrecheck) return programmations;
    return api.showAutoPrecheck(programmations);
  }

  async function findMissingAfterCreation(programmations) {
    const api = window.FXAniappsCompareProgrammations;
    if (!api?.compareProgrammations || !api?.getStatus) return [];

    const results = await api.compareProgrammations(programmations, (done, total) => {
      const current = programmations[Math.min(done, programmations.length - 1)] || {};
      console.log(
        `[La CLEF Assistant] Verification post-creation ${Math.min(done + 1, total)} / ${total}`,
        current.label || ""
      );
    });

    return results
      .filter(result => api.getStatus(result) === "Absente")
      .map(result => result.originalItem || result.item)
      .filter(Boolean);
  }

  async function finishAutomationWithVerification(programmations) {
    await wait(AFTER_COMPLETE_VERIFY_DELAY_MS);

    let missing = [];
    try {
      missing = await findMissingAfterCreation(programmations);
    } catch (error) {
      console.warn("[La CLEF Assistant] Verification post-creation impossible", error);
      stopAutomation("Derniere fiche enregistree. Verification automatique impossible : " + (error.message || error));
      return;
    }

    if (!missing.length) {
      stopAutomation("Automatisation terminee. Toutes les fiches demandees ont ete verifiees.");
      return;
    }

    const attempts = Number(localStorage.getItem(KEYS.verifyAttempts) || "0");
    if (attempts >= MAX_VERIFY_RETRY_ATTEMPTS) {
      localStorage.setItem(KEYS.data, JSON.stringify(missing));
      stopAutomation(`${missing.length} fiche(s) restent absentes apres verification. Elles sont conservees dans Auto programmations.`);
      return;
    }

    console.warn("[La CLEF Assistant] Fiches absentes apres creation, relance automatique", missing);
    localStorage.setItem(KEYS.data, JSON.stringify(missing));
    localStorage.setItem(KEYS.index, "-1");
    localStorage.setItem(KEYS.mode, "clone");
    localStorage.setItem(KEYS.verifyAttempts, String(attempts + 1));
    localStorage.removeItem(KEYS.cloneSourceId);
    touchRunSession();
    allowNextAutomationAction("retry-missing");
    setTimeout(() => runAutomation().catch(handleError), 100);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function startProgrammations(programmations, clonePattern, ui = {}) {
    const remaining = await precheckProgrammations(programmations);
    if (remaining === null) return;

    if (!remaining.length) {
      localStorage.setItem(KEYS.data, JSON.stringify([]));
      localStorage.setItem(KEYS.index, "0");
      stopAutomation();
      if (ui.indexLabel) ui.indexLabel.textContent = "0";
      notify("Aucune creation necessaire : toutes les programmations existent deja avec les bonnes donnees.", "Auto programmations");
      return;
    }

    localStorage.setItem(KEYS.data, JSON.stringify(remaining));
    localStorage.setItem(KEYS.index, "0");
    localStorage.setItem(KEYS.mode, "fill");
    localStorage.setItem(KEYS.clonePattern, clonePattern || "/clone/7");
    localStorage.removeItem(KEYS.cloneSourceId);
    localStorage.setItem(KEYS.verifyAttempts, "0");
    createRunSession();
    if (ui.indexLabel) ui.indexLabel.textContent = "0";
    if (ui.close) ui.close();
    runAutomation().catch(handleError);
  }

  async function runAutomation() {
    if (!isProgrammingEditPage()) return;
    if (!isAutomationSessionValid()) return;
    if (window.__fxAniappsProgrammationsRunning) return;
    ensureEmergencyStopButton();
    updateAutoControls();
    if (!consumeNextAutomationAction()) return;

    window.__fxAniappsProgrammationsRunning = true;
    touchRunSession();

    try {
      await waitForEditFormReady();
      if (!isAutomationSessionValid()) return;

      const programmations = readProgrammations();
      let index = Number(localStorage.getItem(KEYS.index) || "0");
      const mode = localStorage.getItem(KEYS.mode) || "fill";

      if (!programmations.length) return;

      if (index >= programmations.length) {
        await finishAutomationWithVerification(programmations);
        return;
      }

      const programmation = programmations[index];

      if (mode === "fill") {
        const cloneSourceId = localStorage.getItem(KEYS.cloneSourceId);
        const currentScheduleId = getCurrentScheduleId();

        if (cloneSourceId && currentScheduleId === cloneSourceId) {
          stopAutomation("Duplication non confirmee : la fiche source est encore ouverte. Relance depuis une fiche correctement dupliquee.");
          return;
        }

        if (cloneSourceId) localStorage.removeItem(KEYS.cloneSourceId);

        console.log("[La CLEF Assistant] Remplissage programmation", index + 1, programmation.label);

        setInput("#activity_schedule_label", programmation.label);
        setInput("#activity_schedule_activity_session_schedules_attributes_0_hour_begin", programmation.debut);
        setInput("#activity_schedule_activity_session_schedules_attributes_0_hour_end", programmation.fin);
        setInput("#activity_schedule_duration", programmation.duree);

        setSelect("#activity_schedule_activity_session_schedules_attributes_0_day", programmation.jour);
        setSelect("#activity_schedule_activity_session_schedules_attributes_0_place_id", programmation.salle);
        setSelect("#activity_schedule_contact_id", programmation.prof);

        if (programmation.places) setInput("#activity_schedule_capacity", programmation.places);
        if (programmation.tarif) setTarifGroup(programmation.tarif);

        localStorage.setItem(KEYS.mode, "clone");
        touchRunSession();
        await wait(AFTER_FILL_SETTLE_MS);

        const submit = findSubmitButton();
        if (!submit) throw new Error("Bouton Modifier la programmation introuvable");
        allowNextAutomationAction("after-save");
        submit.click();
        return;
      }

      if (mode === "clone") {
        const nextIndex = index + 1;

        if (nextIndex >= programmations.length) {
          await finishAutomationWithVerification(programmations);
          return;
        }

        const cloneLink = findCloneLink();
        if (!cloneLink) {
          stopAutomation("Lien de duplication introuvable.");
          return;
        }

        cloneLink.click();
        await wait(CLONE_MENU_SETTLE_MS);

        const validateButton = await waitForCondition(
          findValidateButton,
          CLONE_DIALOG_TIMEOUT_MS,
          "Bouton Valider"
        );

        localStorage.setItem(KEYS.cloneSourceId, getCurrentScheduleId());
        localStorage.setItem(KEYS.index, String(nextIndex));
        localStorage.setItem(KEYS.mode, "fill");
        touchRunSession();
        allowNextAutomationAction("confirm-clone");
        validateButton.click();
      }
    } finally {
      window.__fxAniappsProgrammationsRunning = false;
    }
  }

  function parseManualJson(value) {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.length) {
      throw new Error("Le JSON doit etre un tableau non vide.");
    }
    return parsed;
  }

  async function readSheetBatches() {
    const batches = await storage.get(SHEET_BATCHES_KEY);
    return Array.isArray(batches) ? batches : [];
  }

  function batchLabel(batch) {
    const rowCount = String(batch.rowsText || "").split(/\r?\n/).filter(line => line.trim()).length;
    return `${batch.instrument || "Instrument ?"} - ${rowCount} ligne(s)`;
  }

  function renderBatchList(batches) {
    if (!batches.length) return `<div class="fx-agenda-empty">Aucun lot Google Sheets en attente.</div>`;

    return `
      <table class="fx-music-table">
        <thead>
          <tr>
            <th>Lot</th>
            <th>Salle</th>
            <th>Tarifs</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${batches.map(batch => `
            <tr>
              <td>${escapeHtml(batchLabel(batch))}</td>
              <td><code>${escapeHtml(batch.placeId || "")}</code></td>
              <td>${escapeHtml(batch.individualTarif || "")}<br>${escapeHtml(batch.collectiveTarif || "")}</td>
              <td>${escapeHtml(batch.source || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function getMusicApi() {
    return window.FXAniappsMusicConverter || null;
  }

  function convertSheetBatches(batches) {
    const api = getMusicApi();
    if (!api) throw new Error("Moteur de conversion cahier musique indisponible.");

    api.syncReferencesFromPage?.();
    const refs = api.getReferences();
    const suffixes = api.readSuffixes();

    return batches.flatMap(batch => {
      const settings = {
        instrument: batch.instrument || "",
        placeId: batch.placeId || "",
        individualTarif: batch.individualTarif || "",
        collectiveTarif: batch.collectiveTarif || "",
        clonePattern: batch.clonePattern || "/clone/7"
      };

      return api.buildPreview(batch.rowsText || "", settings, refs, suffixes).map(item => ({
        ...item,
        batch
      }));
    });
  }

  function previewToProgrammations(preview) {
    const errors = preview.filter(item => item.errors?.length);
    if (errors.length) {
      throw new Error(`${errors.length} ligne(s) en erreur. Corrige les donnees avant de lancer.`);
    }
    return preview.map(item => item.programmation).filter(Boolean);
  }

  function renderConversionPreview(container, preview) {
    const api = getMusicApi();
    container.innerHTML = api?.renderPreviewRows
      ? api.renderPreviewRows(preview)
      : `<div class="fx-compare-summary">${preview.length} programmation(s) convertie(s).</div>`;
  }

  function createAutoModal() {
    document.querySelector(`#${AUTO_MODAL_ID}`)?.remove();

    const existing = readProgrammations();
    const clonePattern = localStorage.getItem(KEYS.clonePattern) || "/clone/7";
    const api = getMusicApi();
    const refs = api?.getReferences?.() || { contacts: [], places: [], tarifs: [] };
    const settings = api?.readSettings?.() || {};
    const suffixes = api?.readSuffixes?.() || {};

    const backdrop = document.createElement("div");
    backdrop.id = AUTO_MODAL_ID;
    backdrop.className = "fx-laclef-modal-backdrop";
    backdrop.innerHTML = `
      <div class="fx-laclef-modal fx-auto-modal" role="dialog" aria-modal="true">
        <div class="fx-laclef-modal-header">
          <div>
            <h2 class="fx-laclef-modal-title">Auto programmations</h2>
            <div class="fx-laclef-modal-subtitle">Importer, convertir, verifier, puis creer les programmations ANIAPPS.</div>
          </div>
          <button type="button" class="fx-agenda-close" aria-label="Fermer">x</button>
        </div>
        <div class="fx-laclef-modal-body">
          <div class="fx-music-tabs">
            <button type="button" class="fx-music-tab is-active" data-tab="sheets">Import Google Sheets</button>
            <button type="button" class="fx-music-tab" data-tab="manual">Import manuel</button>
            <button type="button" class="fx-music-tab" data-tab="convert">Convertisseur</button>
            <button type="button" class="fx-music-tab" data-tab="suffixes">Suffixes profs</button>
          </div>

          <section class="fx-music-tab-panel" data-panel="sheets">
            <div class="fx-laclef-note">Importe les lots prepares depuis Google Sheets. Une verification ANIAPPS est lancee avant toute creation.</div>
            <div class="fx-auto-sheets-list"><div class="fx-agenda-loading">Chargement des lots...</div></div>
            <div class="fx-laclef-modal-actions">
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-auto-refresh-sheets">Actualiser</button>
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-auto-clear-sheets">Effacer lots Sheets</button>
              <button type="button" class="fx-laclef-btn" id="fx-auto-start-sheets">Verifier et demarrer</button>
            </div>
            <div class="fx-auto-sheets-preview"></div>
          </section>

          <section class="fx-music-tab-panel" data-panel="manual" hidden>
            <label class="fx-compare-label" for="fx-auto-manual-json">Programmations JSON</label>
            <textarea id="fx-auto-manual-json" spellcheck="false"></textarea>
            <label class="fx-compare-label" for="fx-auto-manual-clone">Lien de duplication a utiliser</label>
            <input id="fx-auto-manual-clone" class="fx-auto-input" value="${escapeHtml(clonePattern)}">
            <div class="fx-laclef-note">Champs attendus : label, debut, fin, duree, jour, salle, prof, places, tarif. Verification ANIAPPS obligatoire avant creation.</div>
            <div class="fx-laclef-modal-actions">
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-auto-manual-sample">Exemple</button>
              <button type="button" class="fx-laclef-btn" id="fx-auto-start-manual">Verifier et demarrer</button>
            </div>
          </section>

          <section class="fx-music-tab-panel" data-panel="convert" hidden>
            <div class="fx-laclef-form-grid">
              <div class="fx-laclef-field">
                <label for="fx-auto-convert-instrument">Instrument</label>
                <input id="fx-auto-convert-instrument" value="${escapeHtml(settings.instrument || "")}" placeholder="Piano">
              </div>
              <div class="fx-laclef-field">
                <label for="fx-auto-convert-place">Salle unique</label>
                <select id="fx-auto-convert-place">${api?.renderOptions ? api.renderOptions(refs.places || [], settings.placeId || "", "Choisir une salle") : ""}</select>
              </div>
              <div class="fx-laclef-field">
                <label for="fx-auto-convert-tarif-individual">Tarif individuel</label>
                <select id="fx-auto-convert-tarif-individual">${api?.renderTarifOptions ? api.renderTarifOptions(refs.tarifs || [], settings.individualTarif || "", "Choisir un tarif") : ""}</select>
              </div>
              <div class="fx-laclef-field">
                <label for="fx-auto-convert-tarif-collective">Tarif collectif</label>
                <select id="fx-auto-convert-tarif-collective">${api?.renderTarifOptions ? api.renderTarifOptions(refs.tarifs || [], settings.collectiveTarif || "", "Choisir un tarif") : ""}</select>
              </div>
              <div class="fx-laclef-field fx-laclef-field-full">
                <label for="fx-auto-convert-clone">Lien de duplication a utiliser</label>
                <input id="fx-auto-convert-clone" value="${escapeHtml(settings.clonePattern || clonePattern)}">
              </div>
              <div class="fx-laclef-field fx-laclef-field-full">
                <label for="fx-auto-convert-rows">Lignes Google Sheets A:B</label>
                <textarea id="fx-auto-convert-rows" spellcheck="false" placeholder="LUN 16H30-17H\tFernando De Almeida"></textarea>
                <div class="fx-laclef-note">Individuel : 1 ligne et 30 min. Collectif : plusieurs lignes et 60 min. Les lignes vides de bloc fusionne peuvent compter comme places.</div>
              </div>
            </div>
            <div class="fx-laclef-modal-actions">
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-auto-convert-preview">Previsualiser</button>
              <button type="button" class="fx-laclef-btn" id="fx-auto-start-convert">Verifier et demarrer</button>
            </div>
            <div class="fx-auto-convert-preview"></div>
          </section>

          <section class="fx-music-tab-panel" data-panel="suffixes" hidden>
            <div class="fx-laclef-note">Suffixes utilises dans les labels, par exemple GP dans "Piano individuel lundi 18h GP".</div>
            <div class="fx-music-suffix-list">
              <table class="fx-music-table">
                <thead>
                  <tr>
                    <th>Intervenant ANIAPPS</th>
                    <th>ID</th>
                    <th>Suffixe</th>
                  </tr>
                </thead>
                <tbody>${api?.renderSuffixRows ? api.renderSuffixRows(refs, suffixes) : ""}</tbody>
              </table>
            </div>
            <div class="fx-laclef-modal-actions">
              <button type="button" class="fx-laclef-btn" id="fx-auto-save-suffixes">Enregistrer suffixes</button>
            </div>
          </section>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    const indexLabel = { textContent: localStorage.getItem(KEYS.index) || "0" };
    const sheetList = backdrop.querySelector(".fx-auto-sheets-list");
    const sheetPreview = backdrop.querySelector(".fx-auto-sheets-preview");
    const manualTextarea = backdrop.querySelector("#fx-auto-manual-json");
    const manualClone = backdrop.querySelector("#fx-auto-manual-clone");
    const convertPreview = backdrop.querySelector(".fx-auto-convert-preview");
    let lastConvertPreview = [];
    let lastSheetBatches = [];

    manualTextarea.value = JSON.stringify(existing.length ? existing : SAMPLE, null, 2);

    async function refreshSheetList() {
      lastSheetBatches = await readSheetBatches();
      sheetList.innerHTML = renderBatchList(lastSheetBatches);
    }

    function currentConvertSettings() {
      return {
        instrument: backdrop.querySelector("#fx-auto-convert-instrument").value.trim(),
        placeId: backdrop.querySelector("#fx-auto-convert-place").value,
        individualTarif: backdrop.querySelector("#fx-auto-convert-tarif-individual").value,
        collectiveTarif: backdrop.querySelector("#fx-auto-convert-tarif-collective").value,
        clonePattern: backdrop.querySelector("#fx-auto-convert-clone").value.trim() || "/clone/7"
      };
    }

    function refreshConvertPreview() {
      const converter = getMusicApi();
      if (!converter) throw new Error("Moteur de conversion indisponible.");
      converter.syncReferencesFromPage?.();
      lastConvertPreview = converter.buildPreview(
        backdrop.querySelector("#fx-auto-convert-rows").value,
        currentConvertSettings(),
        converter.getReferences(),
        converter.readSuffixes()
      );
      renderConversionPreview(convertPreview, lastConvertPreview);
      return lastConvertPreview;
    }

    closeButtonSetup(backdrop, close);

    backdrop.querySelectorAll(".fx-music-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        backdrop.querySelectorAll(".fx-music-tab").forEach(item => item.classList.toggle("is-active", item === tab));
        backdrop.querySelectorAll(".fx-music-tab-panel").forEach(panel => {
          panel.hidden = panel.dataset.panel !== tab.dataset.tab;
        });
      });
    });

    backdrop.querySelector("#fx-auto-refresh-sheets").addEventListener("click", refreshSheetList);
    backdrop.querySelector("#fx-auto-clear-sheets").addEventListener("click", async () => {
      await storage.set(SHEET_BATCHES_KEY, []);
      await refreshSheetList();
      sheetPreview.innerHTML = "";
    });
    backdrop.querySelector("#fx-auto-start-sheets").addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Verification...";
      try {
        await refreshSheetList();
        if (!lastSheetBatches.length) throw new Error("Aucun lot Google Sheets en attente.");
        const preview = convertSheetBatches(lastSheetBatches);
        renderConversionPreview(sheetPreview, preview);
        const programmations = previewToProgrammations(preview);
        const firstClonePattern = lastSheetBatches.find(batch => batch.clonePattern)?.clonePattern || "/clone/7";
        await startProgrammations(programmations, firstClonePattern, { indexLabel, close });
      } catch (error) {
        notify(error.message || "Import Google Sheets impossible.", "Auto programmations");
      } finally {
        button.disabled = false;
        button.textContent = "Verifier et demarrer";
      }
    });

    backdrop.querySelector("#fx-auto-manual-sample").addEventListener("click", () => {
      manualTextarea.value = JSON.stringify(SAMPLE, null, 2);
    });
    backdrop.querySelector("#fx-auto-start-manual").addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Verification...";
      try {
        await startProgrammations(parseManualJson(manualTextarea.value), manualClone.value, { indexLabel, close });
      } catch (error) {
        notify(error.message || "JSON invalide.", "Auto programmations");
      } finally {
        button.disabled = false;
        button.textContent = "Verifier et demarrer";
      }
    });

    backdrop.querySelector("#fx-auto-convert-preview").addEventListener("click", () => {
      try {
        refreshConvertPreview();
      } catch (error) {
        notify(error.message || "Previsualisation impossible.", "Auto programmations");
      }
    });
    backdrop.querySelector("#fx-auto-start-convert").addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Verification...";
      try {
        const preview = lastConvertPreview.length ? lastConvertPreview : refreshConvertPreview();
        await startProgrammations(previewToProgrammations(preview), currentConvertSettings().clonePattern, { indexLabel, close });
      } catch (error) {
        notify(error.message || "Conversion impossible.", "Auto programmations");
      } finally {
        button.disabled = false;
        button.textContent = "Verifier et demarrer";
      }
    });

    backdrop.querySelector("#fx-auto-save-suffixes").addEventListener("click", () => {
      const converter = getMusicApi();
      if (!converter) return;
      const next = { ...converter.readSuffixes() };
      backdrop.querySelectorAll(".fx-music-suffix-input").forEach(input => {
        const value = input.value.trim().toUpperCase();
        if (value) next[input.dataset.profId] = value;
        else delete next[input.dataset.profId];
      });
      converter.writeSuffixes(next);
      notify("Suffixes profs enregistres.", "Auto programmations");
    });

    refreshSheetList().catch(error => notify(error.message || "Chargement lots Google Sheets impossible.", "Auto programmations"));
  }

  function closeButtonSetup(backdrop, close) {
    const closeButton = backdrop.querySelector(".fx-agenda-close");
    closeButton.addEventListener("click", close);
    document.addEventListener("keydown", function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      document.removeEventListener("keydown", closeOnEscape);
      close();
    });
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) close();
    });
  }

  function addPanel() {
    if (!isProgrammingEditPage()) return;
    if (localStorage.getItem(KEYS.enabled) === "1") ensureEmergencyStopButton();
    if (document.querySelector("#fx-programmations-panel-root")) {
      updateAutoControls();
      return;
    }

    const root = document.createElement("div");
    root.id = "fx-programmations-panel-root";
    root.className = "fx-laclef-fixed-stack fx-programmations-root";

    const stopButton = makeButton("Stop auto", "fx-laclef-btn-danger");
    stopButton.id = "fx-programmations-stop-fixed";
    stopButton.onclick = () => window.FXStopAniappsAutoProgrammations(true);

    const toggle = makeButton("Auto programmations");
    toggle.id = "fx-programmations-open";
    toggle.onclick = createAutoModal;

    root.appendChild(stopButton);
    root.appendChild(toggle);
    document.body.appendChild(root);
    updateAutoControls();
  }

  function updateAutoControls() {
    const stopButton = document.querySelector("#fx-programmations-stop-fixed");
    const emergencyStop = document.querySelector(`#${EMERGENCY_STOP_ID}`);
    const openButton = document.querySelector("#fx-programmations-open");
    const isActive = localStorage.getItem(KEYS.enabled) === "1";

    if (stopButton) stopButton.hidden = !isActive;
    if (emergencyStop) emergencyStop.hidden = !isActive;
    if (openButton) openButton.textContent = isActive ? "Auto en cours" : "Auto programmations";
  }

  function ensureEmergencyStopButton() {
    let button = document.querySelector(`#${EMERGENCY_STOP_ID}`);
    if (button) return button;

    button = makeButton("Stop auto", "fx-laclef-btn-danger");
    button.id = EMERGENCY_STOP_ID;
    button.classList.add("fx-auto-emergency-stop");
    button.type = "button";
    button.title = "Arreter immediatement l'auto programmation (Alt+Shift+S)";
    button.addEventListener("click", () => window.FXStopAniappsAutoProgrammations(true));
    document.body.appendChild(button);
    return button;
  }

  function handleError(error) {
    console.error("[La CLEF Assistant] Erreur programmations", error);
    stopAutomation("Erreur ANIAPPS auto : " + error.message);
  }

  function removePanelIfNeeded() {
    if (isProgrammingEditPage()) return;
    document.querySelector("#fx-programmations-panel-root")?.remove();
    document.querySelector(`#${EMERGENCY_STOP_ID}`)?.remove();
  }

  function runForCurrentPage() {
    if (localStorage.getItem(KEYS.enabled) === "1") {
      ensureEmergencyStopButton();
      updateAutoControls();
    }

    if (isProgrammingEditPage()) {
      addPanel();
      updateAutoControls();
      if (localStorage.getItem(KEYS.enabled) === "1") {
        runAutomation().catch(handleError);
      }
      return;
    }

    removePanelIfNeeded();
  }

  onPageChange(() => {
    setTimeout(runForCurrentPage, 40);
    setTimeout(runForCurrentPage, 250);
  });

  window.addEventListener("fx-laclef-start-programmations", () => {
    allowNextAutomationAction("manual-event");
    runAutomation().catch(handleError);
  });

  document.addEventListener("keydown", event => {
    if (!event.altKey || !event.shiftKey || event.key.toLowerCase() !== "s") return;
    event.preventDefault();
    window.FXStopAniappsAutoProgrammations(true);
  }, true);
})();
