(function () {
  "use strict";

  const FX = window.FXLaclefExtension;
  if (!FX || window.__fxAniappsMusicMembersLoaded) return;
  window.__fxAniappsMusicMembersLoaded = true;

  const HASH = "#cahier-musique";
  const PAGE_URL = "/admin#cahier-musique";
  const STORAGE_KEY = "aniapps_music_members_settings_v1";
  const PENDING_ADDRESS_KEY = "aniapps_music_members_pending_address";
  const PENDING_SCHEDULE_KEY = "aniapps_music_members_pending_schedule";
  const PENDING_ADHESION_KEY = "aniapps_music_members_pending_adhesion";
  const PENDING_AUTO_KEY = "aniapps_music_members_pending_auto";
  const PENDING_AUTO_QUEUE_KEY = "aniapps_music_members_pending_auto_queue";
  const PENDING_AUTO_ERRORS_KEY = "aniapps_music_members_pending_auto_errors";
  const PENDING_AUTO_RETRY_KEY = "aniapps_music_members_pending_auto_retry";
  const AUTO_COMPARE_REQUEST_KEY = "aniapps_music_members_compare_request";
  const CONTACTS_SOURCE_CACHE_KEY = "aniapps_music_members_contacts_source";
  const CONTACTS_VISIBLE_CACHE_KEY = "aniapps_music_members_contacts_visible_cache";

  const DEFAULT_SETTINGS = {
    instrument: "",
    seasonId: ""
  };

  const DAY_MAP = {
    lun: { label: "lundi", value: "1" },
    mar: { label: "mardi", value: "2" },
    mer: { label: "mercredi", value: "3" },
    jeu: { label: "jeudi", value: "4" },
    ven: { label: "vendredi", value: "5" },
    sam: { label: "samedi", value: "6" },
    dim: { label: "dimanche", value: "0" }
  };

  const AUTO_STEP_DELAY = 2200;
  const AUTO_TRANSITION_TTL = 15000;
  const AUTO_CONFIRM_ATTEMPTS = 8;
  const AUTO_CONFIRM_WAIT = 1500;

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    rows: [],
    loading: false,
    menuTimer: null
  };

  function debugLog(step, payload) {
    console.log("[Cahier musique]", step, payload || "");
  }

  function appendDebug(row, message, payload) {
    debugLog(message, payload);
  }

  FX.onPageChange(init);
  window.addEventListener("hashchange", init);
  window.addEventListener("load", init);
  window.addEventListener("storage", event => {
    if (event.key !== AUTO_COMPARE_REQUEST_KEY || !event.newValue || !isPage()) return;
    compareAllRows("Relecture apres Auto tous").catch(error => {
      console.error("[Cahier musique] Comparaison impossible", error);
      setStatus(error.message || "Comparaison impossible.");
    });
  });

  document.addEventListener("click", event => {
    const nav = event.target.closest("#fx-music-members-nav-item, #fx-music-members-nav-item a");
    if (!nav) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    goToPage();
  }, true);

  new MutationObserver(() => {
    if (!document.querySelector("#fx-music-members-nav-item")) scheduleMenuSync();
  }).observe(document.documentElement, { childList: true, subtree: true });

  setInterval(scheduleMenuSync, 1000);
  setInterval(runRouteHelpers, 1500);

  function init() {
    scheduleMenuSync();
    runRouteHelpers();
    setTimeout(runRouteHelpers, 500);
    setTimeout(runRouteHelpers, 1500);

    if (isPage()) {
      restoreOwnPage();
      setTimeout(renderPage, 80);
      setTimeout(consumeAutoCompareRequest, 400);
    } else {
      restoreOwnPage();
      highlightSidebar(false);
    }
  }

  function isPage() {
    return location.pathname === "/admin" && location.hash === HASH;
  }

  function goToPage() {
    if (location.pathname !== "/admin") {
      window.location.href = PAGE_URL;
      return;
    }

    if (location.hash !== HASH) window.location.hash = "cahier-musique";
    setTimeout(renderPage, 80);
  }

  function scheduleMenuSync() {
    if (state.menuTimer) return;

    state.menuTimer = setTimeout(() => {
      state.menuTimer = null;
      ensureSidebarTab();
    }, 80);
  }

  function ensureSidebarTab() {
    const sideMenu = document.querySelector("#side-menu");
    if (!sideMenu) return;

    let li = document.querySelector("#fx-music-members-nav-item");

    if (!li) {
      li = document.createElement("li");
      li.id = "fx-music-members-nav-item";
      li.innerHTML = `
        <a href="${PAGE_URL}" data-turbolinks="false">
          <i class="fa fa-music"></i>
          <span class="nav-label">Cahier musique</span>
        </a>
      `;
    }

    const items = [...sideMenu.querySelectorAll(":scope > li")];
    const flce = document.querySelector("#fx-flce-nav-item");
    const familles = items.find(item => getTopLabel(item) === "Familles");

    if (flce?.parentElement === sideMenu && flce.nextElementSibling !== li) {
      flce.insertAdjacentElement("afterend", li);
    } else if (familles && li.nextElementSibling !== familles) {
      familles.insertAdjacentElement("beforebegin", li);
    } else if (!li.parentElement) {
      sideMenu.appendChild(li);
    }

    li.style.display = "";
    highlightSidebar(isPage());
  }

  function getTopLabel(li) {
    return (li.querySelector(":scope > a .nav-label")?.textContent || "").trim();
  }

  function highlightSidebar(active) {
    const li = document.querySelector("#fx-music-members-nav-item");
    if (!li) return;

    if (active) {
      document.querySelectorAll("#side-menu li").forEach(item => item.classList.remove("active"));
      li.classList.add("active");
    } else {
      li.classList.remove("active");
    }
  }

  function restoreOwnPage() {
    document.querySelector("#fx-music-members-page")?.remove();

    document.querySelectorAll("[data-fx-music-members-hidden='1']").forEach(el => {
      el.style.display = el.dataset.fxMusicMembersOldDisplay || "";
      delete el.dataset.fxMusicMembersHidden;
      delete el.dataset.fxMusicMembersOldDisplay;
    });
  }

  function hideNativePage(wrapper) {
    [...wrapper.children].forEach(child => {
      if (child.id === "fx-music-members-page") return;
      if (child.matches(".row.border-bottom, nav.navbar-static-top, .navbar-static-top")) return;

      if (child.dataset.fxMusicMembersHidden !== "1") {
        child.dataset.fxMusicMembersHidden = "1";
        child.dataset.fxMusicMembersOldDisplay = child.style.display || "";
      }

      child.style.display = "none";
    });
  }

  async function renderPage() {
    const wrapper = document.querySelector("#page-wrapper");
    if (!wrapper) return;

    document.title = "La CLEF - Cahier musique";
    highlightSidebar(true);
    hideNativePage(wrapper);
    injectStyle();

    await loadSettings();

    let page = document.querySelector("#fx-music-members-page");
    if (!page) {
      page = document.createElement("div");
      page.id = "fx-music-members-page";
      page.className = "fx-mm-root";
      page.innerHTML = `
        <div class="row wrapper border-bottom page-heading">
          <div class="col-lg-10">
            <h2>Cahier musique</h2>
            <ol class="breadcrumb">
              <li><a href="/admin">Accueil</a></li>
              <li class="active"><strong>Cahier musique</strong></li>
            </ol>
          </div>
        </div>

        <div class="wrapper wrapper-content animated fadeInRight">
          <div class="ibox-content fx-mm-card">
            <div class="fx-laclef-form-grid fx-laclef-form-grid-compact">
              <div class="fx-laclef-field">
                <label for="fx-mm-instrument">Instrument</label>
                <input id="fx-mm-instrument" placeholder="Batterie">
              </div>
              <div class="fx-laclef-field">
                <label for="fx-mm-season">Saison</label>
                <select id="fx-mm-season"></select>
              </div>
              <div class="fx-laclef-field">
                <label for="fx-mm-count">Lignes</label>
                <input id="fx-mm-count" readonly>
              </div>
              <div class="fx-laclef-field fx-laclef-field-full">
                <label for="fx-mm-paste">Selection Google Sheets</label>
                <textarea id="fx-mm-paste" spellcheck="false" placeholder="LUN 16H30-17H&#9;Didier Joubert&#9;Gatton&#9;Alexandre&#9;adu&#9;&#9;mail@example.com&#9;0612345678&#9;7"></textarea>
                <div class="fx-laclef-note">
                  Copie la selection Google Sheets comme avant. Le tableau affiche uniquement les infos utiles pour retrouver la famille et creer les souscriptions.
                </div>
              </div>
            </div>

            <div class="fx-mm-actions">
              <span id="fx-mm-status">Colle une selection puis clique sur Previsualiser.</span>
              <div>
                <button type="button" class="btn btn-default btn-sm" id="fx-mm-read-clipboard">
                  <i class="fa fa-clipboard"></i> Lire presse-papiers
                </button>
                <button type="button" class="btn btn-default btn-sm" id="fx-mm-copy-export">
                  <i class="fa fa-copy"></i> Copier export
                </button>
                <button type="button" class="btn btn-primary btn-sm" id="fx-mm-preview">
                  <i class="fa fa-eye"></i> Previsualiser
                </button>
                <button type="button" class="btn btn-primary btn-sm" id="fx-mm-search-all">
                  <i class="fa fa-search"></i> Chercher familles
                </button>
                <button type="button" class="btn btn-default btn-sm" id="fx-mm-compare">
                  <i class="fa fa-check-square-o"></i> Comparer
                </button>
                <button type="button" class="btn btn-primary btn-sm" id="fx-mm-auto-all">
                  <i class="fa fa-magic"></i> Auto tous
                </button>
              </div>
            </div>

            <div class="table-responsive fx-mm-table-wrap">
              <table class="table table-striped table-bordered table-hover fx-mm-table">
                <thead>
                  <tr>
                    <th>Statut</th>
                    <th>ID famille</th>
                    <th>Nom famille</th>
                    <th>Mail famille</th>
                    <th>ID contact</th>
                    <th>Nom adherent</th>
                    <th>Prenom</th>
                    <th>Age</th>
                    <th>Programmation</th>
                    <th>Justificatif</th>
                    <th>Adhesion</th>
                    <th>Prog. existante</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="fx-mm-tbody"></tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      wrapper.appendChild(page);
      bindPage(page);
    }

    fillSettings(page);
    renderRows();
  }

  function bindPage(page) {
    page.querySelector("#fx-mm-preview").addEventListener("click", () => {
      persistSettingsFromPage(page);
      previewFromTextarea(page);
    });

    page.querySelector("#fx-mm-search-all").addEventListener("click", () => {
      lookupAllRows().catch(error => {
        console.error("[Cahier musique] Recherche impossible", error);
        setStatus(error.message || "Recherche impossible.");
      });
    });

    page.querySelector("#fx-mm-auto-all").addEventListener("click", () => {
      startAutoAllWorkflow().catch(error => {
        console.error("[Cahier musique] Auto tous impossible", error);
        setStatus(error.message || "Auto tous impossible.");
        FX.notify(error.message || "Auto tous impossible.", "Cahier musique");
      });
    });

    page.querySelector("#fx-mm-compare").addEventListener("click", () => {
      compareAllRows("Comparaison").catch(error => {
        console.error("[Cahier musique] Comparaison impossible", error);
        setStatus(error.message || "Comparaison impossible.");
        FX.notify(error.message || "Comparaison impossible.", "Cahier musique");
      });
    });

    page.querySelector("#fx-mm-read-clipboard").addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) page.querySelector("#fx-mm-paste").value = text;
      } catch (error) {
        FX.notify(error.message || "Lecture du presse-papiers impossible.", "Cahier musique");
      }
    });

    page.querySelector("#fx-mm-copy-export").addEventListener("click", copyExport);

    page.addEventListener("input", event => {
      if (!event.target.matches("#fx-mm-instrument, #fx-mm-season")) return;
      persistSettingsFromPage(page);
    });

    page.addEventListener("change", event => {
      if (!event.target.matches("#fx-mm-season")) return;
      persistSettingsFromPage(page);
      state.rows.forEach(row => {
        row.label = buildLabel(row, state.settings);
        row.searchQuery = buildScheduleSearchQuery(row);
        row.checks = null;
      });
      renderRows();
    });

    page.addEventListener("click", event => {
      const action = event.target.closest("[data-fx-mm-action]");
      if (!action) return;

      event.preventDefault();
      handleRowAction(action).catch(error => {
        console.error("[Cahier musique] Action impossible", error);
        FX.notify(error.message || "Action impossible.", "Cahier musique");
      });
    });
  }

  async function loadSettings() {
    const stored = await FX.storage.get(STORAGE_KEY).catch(() => null);
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...(stored || {})
    };

    if (!state.settings.seasonId) {
      state.settings.seasonId = getCurrentSeason().id || "";
    }
  }

  function fillSettings(page) {
    ensureSeasonOptions(page.querySelector("#fx-mm-season"));
    page.querySelector("#fx-mm-instrument").value = state.settings.instrument || "";
    page.querySelector("#fx-mm-season").value = state.settings.seasonId || getCurrentSeason().id || "";
    page.querySelector("#fx-mm-count").value = String(state.rows.length || 0);
  }

  function persistSettingsFromPage(page) {
    state.settings = {
      instrument: cleanText(page.querySelector("#fx-mm-instrument").value),
      seasonId: cleanText(page.querySelector("#fx-mm-season").value)
    };

    FX.storage.set(STORAGE_KEY, state.settings).catch(() => {});
  }

  function previewFromTextarea(page) {
    const text = page.querySelector("#fx-mm-paste").value;
    state.rows = parseSelection(text, state.settings);
    fillSettings(page);
    renderRows();
    setStatus(`${state.rows.length} adherent(s) prepares.`);
  }

  function parseSelection(text, settings) {
    const selectedSeason = getSelectedSeason();
    const rows = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map(line => line.split("\t"));

    const parsed = [];
    let currentSlot = null;
    let currentProf = "";
    const selectedSlotRows = new Map();

    rows.forEach((columns, index) => {
      while (columns.length < 9) columns.push("");

      const rawSeance = cleanText(columns[0]);
      const rawProf = cleanText(columns[1]);
      const nom = cleanText(columns[2]);
      const prenom = cleanText(columns[3]);
      const age = cleanText(columns[4]);
      const niveau = cleanText(columns[5]);
      const email = cleanText(columns[6]);
      const tel = cleanText(columns[7]);
      const numeroArrivee = cleanText(columns[8]);

      if (isHeaderRow({ rawSeance, rawProf, nom, prenom, email })) return;

      const slot = rawSeance ? parseHoraire(rawSeance) : null;
      if (slot) currentSlot = { ...slot, rawSeance };
      if (rawProf) currentProf = rawProf;
      if (currentSlot) {
        const selectedKey = slotKey(currentSlot, rawProf || currentProf);
        selectedSlotRows.set(selectedKey, (selectedSlotRows.get(selectedKey) || 0) + 1);
      }

      if (!nom && !prenom && !email && !tel && !numeroArrivee) return;
      if (!currentSlot) return;

      parsed.push({
        id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
        sourceRow: index + 1,
        rawSeance: currentSlot.rawSeance,
        rawProf: rawProf || currentProf,
        slot: currentSlot,
        instrument: settings.instrument || "",
        nom,
        prenom,
        age,
        niveau,
        email,
        tel,
        numeroArrivee,
        status: "Pret",
        statusType: "muted",
        details: "",
        match: null,
        checks: null,
        seasonId: selectedSeason.id || settings.seasonId || "",
        seasonLabel: selectedSeason.label || "",
        label: ""
      });
    });

    const slotCounts = new Map();
    parsed.forEach(row => {
      const key = slotKey(row.slot, row.rawProf);
      slotCounts.set(key, (slotCounts.get(key) || 0) + 1);
    });

    parsed.forEach(row => {
      const count = slotCounts.get(slotKey(row.slot, row.rawProf)) || 1;
      const selectedCount = selectedSlotRows.get(slotKey(row.slot, row.rawProf)) || count;
      row.type = count > 1 || selectedCount > 1 ? "coll" : "individuel";
      row.label = buildLabel(row, settings);
      row.searchQuery = buildScheduleSearchQuery(row);
      row.errors = validateRow(row, settings);
      if (row.errors.length) {
        row.status = "A verifier";
        row.statusType = "warning";
        row.details = row.errors.join("\n");
      }
    });

    return parsed;
  }

  function isHeaderRow(row) {
    const text = normalize([
      row.rawSeance,
      row.rawProf,
      row.nom,
      row.prenom,
      row.email
    ].join(" "));

    return text.includes("seance") && text.includes("professeur") && text.includes("mail");
  }

  function validateRow(row, settings) {
    const errors = [];
    if (!settings.instrument) errors.push("Instrument absent");
    if (!row.nom) errors.push("Nom absent");
    if (!row.prenom) errors.push("Prenom absent");
    if (!row.email) errors.push("Mail absent");
    if (!row.rawProf) errors.push("Professeur absent");
    return errors;
  }

  function parseHoraire(value) {
    const text = normalize(String(value || "").replace(/[\u2010-\u2015\u2212]/g, "-"));
    const dayMatch = text.match(/\b(lun|mar|mer|jeu|ven|sam|dim)/);
    const timeMatch = text.match(/(\d{1,2})(?:\s*[h:]\s*(\d{1,2})?)?\s*-\s*(\d{1,2})(?:\s*[h:]\s*(\d{1,2})?)?/);

    if (!dayMatch || !timeMatch) return null;

    const day = DAY_MAP[dayMatch[1].slice(0, 3)];
    const start = parseTimeParts(timeMatch[1], timeMatch[2]);
    const end = parseTimeParts(timeMatch[3], timeMatch[4]);

    if (!day || start === null || end === null || end <= start) return null;

    return {
      dayLabel: day.label,
      dayValue: day.value,
      start,
      end
    };
  }

  function parseTimeParts(hourValue, minuteValue) {
    const hour = Number(hourValue);
    const minute = minuteValue === undefined || minuteValue === "" ? 0 : Number(minuteValue);

    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
  }

  function slotKey(slot, prof) {
    return [
      slot?.dayValue || "",
      slot?.start ?? "",
      slot?.end ?? "",
      normalize(prof)
    ].join("|");
  }

  function buildLabel(row, settings) {
    return [
      settings.instrument,
      row.type,
      row.slot.dayLabel,
      minutesToLabel(row.slot.start),
      professorSuffix(row.rawProf)
    ].filter(Boolean).join(" ");
  }

  function buildScheduleSearchQuery(row) {
    return [
      state.settings.instrument,
      row.slot.dayLabel,
      minutesToLabel(row.slot.start),
      professorSuffix(row.rawProf)
    ].filter(Boolean).join(" ");
  }

  function professorSuffix(profName) {
    const converter = window.FXAniappsMusicConverter;
    const refs = converter?.getReferences?.() || { contacts: [] };
    const suffixes = converter?.readSuffixes?.() || {};
    const contact = findProfessor(profName, refs.contacts || []);

    if (contact && suffixes[contact.value]) return cleanText(suffixes[contact.value]).toUpperCase();
    return fallbackSuffix(profName || contact?.text || "");
  }

  function findProfessor(profName, contacts) {
    const sourceTokens = significantTokens(profName);
    if (!sourceTokens.length) return null;

    const sourceSorted = [...sourceTokens].sort().join(" ");
    return contacts.find(contact => {
      const contactTokens = significantTokens(contact.text);
      const contactSorted = [...contactTokens].sort().join(" ");
      return contactSorted === sourceSorted ||
        sourceTokens.every(token => contactTokens.includes(token)) ||
        contactTokens.every(token => sourceTokens.includes(token));
    }) || null;
  }

  function significantTokens(value) {
    return normalize(value)
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean);
  }

  function fallbackSuffix(value) {
    return significantTokens(value)
      .slice(0, 3)
      .map(token => token[0])
      .join("")
      .toUpperCase();
  }

  function minutesToLabel(value) {
    const minutes = Number(value);
    const minute = minutes % 60;
    return minute === 0 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 60)}h${String(minute).padStart(2, "0")}`;
  }

  async function lookupAllRows() {
    if (state.loading) return;
    if (!state.rows.length) {
      FX.notify("Aucune ligne a chercher.", "Cahier musique");
      return;
    }

    state.loading = true;
    try {
      for (let index = 0; index < state.rows.length; index += 1) {
        const row = state.rows[index];
        if (row.errors?.some(error => error.includes("Mail"))) continue;

        row.status = "Recherche...";
        row.statusType = "muted";
        row.details = "";
        renderRows();
        setStatus(`Recherche ${index + 1}/${state.rows.length} : ${row.email}`);

        try {
          row.match = await lookupRow(row);
          if (row.match?.contactId) {
            await enrichRowStatus(row);
            row.status = "Contact trouve";
            row.statusType = "ok";
            row.details = "";
          } else if (row.match?.familyId) {
            await enrichRowStatus(row);
            row.status = "Famille trouvee";
            row.statusType = "warning";
            row.details = "Aucun membre ne correspond exactement au Nom + Prenom.";
          } else {
            row.status = "Introuvable";
            row.statusType = "danger";
            row.details = "Aucune famille trouvee avec ce mail.";
          }
        } catch (error) {
          row.status = "Erreur";
          row.statusType = "danger";
          row.details = error.message || String(error);
        }

        renderRows();
        await FX.wait(120);
      }

      setStatus("Recherche terminee.");
    } finally {
      state.loading = false;
    }
  }

  async function compareAllRows(sourceLabel) {
    if (state.loading) return;
    if (!state.rows.length) {
      FX.notify("Aucune ligne a comparer.", "Cahier musique");
      return;
    }

    state.loading = true;
    let okCount = 0;
    let issueCount = 0;

    try {
      for (let index = 0; index < state.rows.length; index += 1) {
        const row = state.rows[index];
        if (row.errors?.length) continue;

        row.status = "Comparaison...";
        row.statusType = "muted";
        row.details = "";
        renderRows();
        setStatus(`${sourceLabel || "Comparaison"} ${index + 1}/${state.rows.length} : ${row.email || row.nom}`);

        try {
          if (!row.match?.contactId) row.match = await lookupRow(row);
          if (row.match?.familyId) await enrichRowStatus(row, { force: true });

          const missing = missingChecks(row);
          if (!row.match?.contactId) {
            row.status = row.match?.familyId ? "Membre a verifier" : "Introuvable";
            row.statusType = row.match?.familyId ? "warning" : "danger";
            row.details = row.match?.familyId
              ? "Famille trouvee, mais pas le bon Nom + Prenom."
              : "Aucune famille trouvee avec ce mail.";
            issueCount += 1;
          } else if (missing.length) {
            row.status = "A completer";
            row.statusType = "warning";
            row.details = `Manquant : ${missing.join(", ")}`;
            issueCount += 1;
          } else {
            row.status = "Conforme";
            row.statusType = "ok";
            row.details = "";
            okCount += 1;
          }
        } catch (error) {
          row.status = "Erreur comparaison";
          row.statusType = "danger";
          row.details = error.message || String(error);
          issueCount += 1;
        }

        renderRows();
        await FX.wait(220);
      }

      const message = `${sourceLabel || "Comparaison"} terminee : ${okCount} conforme(s), ${issueCount} a verifier.`;
      setStatus(message);
      FX.notify(message, "Cahier musique");
    } finally {
      state.loading = false;
      localStorage.removeItem(AUTO_COMPARE_REQUEST_KEY);
    }
  }

  function missingChecks(row) {
    const checks = row.checks || {};
    const missing = [];
    if (checks.addressProof !== "yes") missing.push("justificatif");
    if (checks.adhesion !== "yes") missing.push("adhesion");
    if (checks.schedule !== "yes") missing.push("programmation");
    return missing;
  }

  function consumeAutoCompareRequest() {
    const request = readStoredJson(AUTO_COMPARE_REQUEST_KEY);
    if (!request || !isFreshPending(request) || !state.rows.length || state.loading) return;
    compareAllRows(request.label || "Relecture apres Auto tous").catch(error => {
      console.error("[Cahier musique] Comparaison impossible", error);
      setStatus(error.message || "Comparaison impossible.");
    });
  }

  async function lookupRow(row) {
    appendDebug(row, "debut recherche", {
      email: row.email,
      nom: row.nom,
      prenom: row.prenom
    });

    const cached = await findVisibleCachedContact(row);
    if (cached) {
      appendDebug(row, "cache visible contacts OK", {
        contactId: cached.contactId,
        familyId: cached.familyId
      });
      return cached;
    }

    appendDebug(row, "cache visible contacts absent");

    const candidates = await fetchContactFamiliesByEmail(row.email);
    appendDebug(row, "candidats recherche contacts", candidates);

    let familyFallback = null;
    for (const candidate of candidates) {
      const resolved = await resolveContactCandidate(candidate, row);
      appendDebug(row, "resolution candidat", {
        candidate,
        resolved: resolved ? {
          contactId: resolved.contactId,
          familyId: resolved.familyId,
          member: resolved.member
        } : null
      });
      if (resolved?.contactId) return resolved;
      if (resolved?.familyId && !familyFallback) familyFallback = resolved;
    }

    if (familyFallback) return familyFallback;
    appendDebug(row, "aucun candidat resolu");
    return null;
  }

  async function enrichRowStatus(row, options = {}) {
    const match = row.match;
    if (!match?.familyId) return;

    try {
      const expectedSeason = row.seasonLabel || getSelectedSeason().label;
      const family = options.force
        ? await fetchFamilyMembers(match.familyId, expectedSeason)
        : match.family?.info ? match.family : await fetchFamilyMembers(match.familyId, expectedSeason);
      match.family = {
        ...(match.family || {}),
        ...family
      };

      if (family.info) {
        match.familyName = family.info.name || match.familyName || "";
        match.familyEmail = family.info.email || match.familyEmail || "";
      }

      const checks = {
        addressProof: family.info?.addressProofValidated ? "yes" : "no",
        adhesion: "unknown",
        schedule: "unknown"
      };

      if (match.contactId) {
        const registrations = await fetchFamilyRegistrations(match.familyId);
        checks.adhesion = hasMatchingRegistration(registrations, row, "adhesion") ? "yes" : "no";
        checks.schedule = hasMatchingRegistration(registrations, row, "schedule") ? "yes" : "no";
      }

      row.checks = checks;
      debugLog("statuts ligne", {
        email: row.email,
        familyId: match.familyId,
        contactId: match.contactId,
        force: Boolean(options.force),
        checks
      });
    } catch (error) {
      row.checks = {
        addressProof: "unknown",
        adhesion: "unknown",
        schedule: "unknown"
      };
      debugLog("statuts ligne erreur", {
        email: row.email,
        message: error.message || String(error)
      });
    }
  }

  async function findVisibleCachedContact(row) {
    const cache = await FX.storage.get(CONTACTS_VISIBLE_CACHE_KEY).catch(() => null);
    const emailKey = normalize(row.email);
    const candidate = cache?.[emailKey];

    if (!candidate) return null;
    if (Date.now() - Number(candidate.updatedAt || 0) > 1000 * 60 * 30) return null;
    if (!candidateLooksLikeSamePerson(candidate, row)) return null;

    return {
      familyId: candidate.familyId || "",
      familyUrl: candidate.familyId ? `/admin/families/${candidate.familyId}/contacts` : "",
      contactId: candidate.contactId || "",
      contactUrl: candidate.contactUrl || "",
      member: {
        contactId: candidate.contactId || "",
        contactUrl: candidate.contactUrl || "",
        nom: candidate.nom || row.nom,
        prenom: candidate.prenom || row.prenom,
        age: candidate.age || row.age
      },
      family: {
        familyId: candidate.familyId || "",
        members: []
      }
    };
  }

  async function resolveContactCandidate(candidate, row) {
    debugLog("resolve candidat debut", {
      candidate,
      wanted: {
        nom: row.nom,
        prenom: row.prenom,
        email: row.email
      }
    });

    if (candidateLooksLikeSamePerson(candidate, row) && candidate.contactId) {
      debugLog("candidat accepte depuis recherche contacts", {
        contactId: candidate.contactId,
        familyId: candidate.familyId || "",
        nom: candidate.nom,
        prenom: candidate.prenom,
        email: candidate.email
      });

      return {
        familyId: candidate.familyId || "",
        familyUrl: candidate.familyId ? `/admin/families/${candidate.familyId}/contacts` : "",
        contactId: candidate.contactId,
        contactUrl: candidate.familyId
          ? `/admin/families/${candidate.familyId}/contacts/${candidate.contactId}`
          : "",
        member: {
          contactId: candidate.contactId,
          contactUrl: candidate.familyId
            ? `/admin/families/${candidate.familyId}/contacts/${candidate.contactId}`
            : "",
          nom: candidate.nom || row.nom,
          prenom: candidate.prenom || row.prenom,
          age: candidate.age || row.age
        },
        family: {
          familyId: candidate.familyId || "",
          members: []
        }
      };
    }

    if (!candidate?.familyId && candidate?.contactId) {
      candidate.familyId = await fetchFamilyIdFromContact(candidate.contactId);
      debugLog("familyId depuis contact", {
        contactId: candidate.contactId,
        familyId: candidate.familyId || ""
      });
    }

    if (!candidate?.familyId) {
      if (candidateLooksLikeSamePerson(candidate, row) && candidate.contactId) {
        debugLog("candidat accepte sans famille", candidate);
        return {
          familyId: "",
          familyUrl: "",
          contactId: candidate.contactId,
          contactUrl: "",
          member: {
            contactId: candidate.contactId,
            contactUrl: "",
            nom: candidate.nom || row.nom,
            prenom: candidate.prenom || row.prenom,
            age: candidate.age || row.age
          },
          family: { familyId: "", members: [] }
        };
      }

      debugLog("candidat rejete sans famille", {
        candidate,
        samePerson: candidateLooksLikeSamePerson(candidate, row)
      });
      return null;
    }

    const family = await fetchFamilyMembers(candidate.familyId, row.seasonLabel || getSelectedSeason().label);
    debugLog("membres famille lus", {
      familyId: candidate.familyId,
      members: family.members
    });
    const member = family.members.find(item => samePerson(item, row));

    if (member) {
      debugLog("membre famille matche", member);
      return {
        familyId: candidate.familyId,
        familyUrl: `/admin/families/${candidate.familyId}/contacts`,
        contactId: member.contactId || candidate.contactId || "",
        contactUrl: member.contactUrl,
        member,
        family
      };
    }

    if (family.members.length) {
      debugLog("famille trouvee mais aucun membre exact", {
        wanted: { nom: row.nom, prenom: row.prenom },
        members: family.members.map(member => ({
          nom: member.nom,
          prenom: member.prenom,
          contactId: member.contactId,
          nomNorm: normalize(member.nom),
          prenomNorm: normalize(member.prenom)
        }))
      });
      return {
        familyId: candidate.familyId,
        familyUrl: `/admin/families/${candidate.familyId}/contacts`,
        contactId: "",
        contactUrl: "",
        member: null,
        family
      };
    }

    debugLog("famille sans membres lisibles", candidate.familyId);
    return null;
  }

  async function fetchContactFamiliesByEmail(email) {
    const source = await getContactsDataSource();
    const sources = [...new Set([source, "/admin/contacts", "/admin/contacts.json"])];
    let lastError = null;
    debugLog("sources contacts", sources);

    for (const item of sources) {
      try {
        const records = await fetchContactRecords(item, email);
        debugLog("records contacts", {
          source: item,
          count: records.length,
          first: records[0] || null
        });
        if (records.length) {
          const parsed = records
            .map(parseContactSearchRecord)
            .filter(record => record.familyId || record.contactId || record.email);
          debugLog("records contacts parses", parsed);
          return parsed;
        }
      } catch (error) {
        lastError = error;
        debugLog("erreur source contacts", {
          source: item,
          message: error.message || String(error)
        });
      }
    }

    if (lastError) throw lastError;
    return [];
  }

  async function fetchContactRecords(source, email) {
    const url = new URL(source, location.origin);
    addContactsDataTableParams(url, email);
    debugLog("fetch contacts", url.toString());

    const response = await fetch(url.toString(), {
      credentials: "include",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    debugLog("fetch contacts status", {
      url: url.toString(),
      status: response.status,
      contentType: response.headers.get("content-type") || ""
    });

    if (!response.ok) throw new Error(`Recherche contacts HTTP ${response.status}`);

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      debugLog("fetch contacts non-json", text.slice(0, 500));
      throw error;
    }

    debugLog("fetch contacts payload", {
      keys: data && typeof data === "object" ? Object.keys(data) : [],
      recordsTotal: data?.recordsTotal,
      recordsFiltered: data?.recordsFiltered,
      dataLength: Array.isArray(data?.data) ? data.data.length : null
    });

    return Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
  }

  function addContactsDataTableParams(url, email) {
    const columns = [
      "id",
      "lastname",
      "firstname",
      "age",
      "email",
      "phone",
      "mobile_phone",
      "address",
      "membership_date",
      "indicators",
      "actions"
    ];

    url.searchParams.set("draw", String(Date.now()));
    url.searchParams.set("start", "0");
    url.searchParams.set("length", "25");
    url.searchParams.set("search[value]", email);
    url.searchParams.set("search[regex]", "false");
    url.searchParams.set("order[0][column]", "0");
    url.searchParams.set("order[0][dir]", "asc");

    columns.forEach((column, index) => {
      url.searchParams.set(`columns[${index}][data]`, column);
      url.searchParams.set(`columns[${index}][name]`, "");
      url.searchParams.set(`columns[${index}][searchable]`, "true");
      url.searchParams.set(`columns[${index}][orderable]`, index === columns.length - 1 ? "false" : "true");
      url.searchParams.set(`columns[${index}][search][value]`, "");
      url.searchParams.set(`columns[${index}][search][regex]`, "false");
    });
  }

  async function getContactsDataSource() {
    const cached = await FX.storage.get(CONTACTS_SOURCE_CACHE_KEY).catch(() => "");
    if (cached) return cached;

    const response = await fetch("/admin/contacts", {
      credentials: "include",
      headers: { Accept: "text/html" }
    });

    if (!response.ok) return "/admin/contacts.json";

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const source = doc.querySelector("[data-source*='contacts']")?.getAttribute("data-source") || "/admin/contacts.json";
    await FX.storage.set(CONTACTS_SOURCE_CACHE_KEY, source).catch(() => {});
    return source;
  }

  function parseContactSearchRecord(record) {
    const html = flattenRecord(record);
    const familyId = html.match(/\/admin\/families\/(\d+)/)?.[1] ||
      html.match(/\/families\/(\d+)/)?.[1] ||
      "";
    const contactId = html.match(/\/contacts\/(\d+)/)?.[1] ||
      firstRecordValue(record, ["id", "contact_id", "DT_RowId"], 0).replace(/\D+/g, "") ||
      "";

    return {
      familyId,
      contactId,
      nom: stripHtml(firstRecordValue(record, ["lastname", "last_name", "nom"], 1)),
      prenom: stripHtml(firstRecordValue(record, ["firstname", "first_name", "prenom"], 2)),
      age: stripHtml(firstRecordValue(record, ["age"], 3)),
      email: stripHtml(firstRecordValue(record, ["email", "mail"], 4)),
      telephone: stripHtml(firstRecordValue(record, ["mobile_phone", "phone", "telephone"], 6) || firstRecordValue(record, [], 5)),
      raw: record
    };
  }

  function firstRecordValue(record, keys, arrayIndex) {
    if (Array.isArray(record)) return String(record[arrayIndex] || "");
    if (!record || typeof record !== "object") return "";

    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
    }

    return "";
  }

  function flattenRecord(record) {
    if (Array.isArray(record)) return record.map(flattenRecord).join(" ");
    if (record && typeof record === "object") return Object.values(record).map(flattenRecord).join(" ");
    return String(record || "");
  }

  async function fetchFamilyIdFromContact(contactId) {
    const urls = [
      `/admin/contacts/${contactId}`,
      `/admin/contacts/${contactId}/edit`
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          credentials: "include",
          headers: { Accept: "text/html" },
          redirect: "follow"
        });

        debugLog("fetch fiche contact status", {
          contactId,
          url,
          status: response.status,
          finalUrl: response.url || ""
        });

        if (!response.ok) continue;

        const finalUrl = response.url || "";
        const fromUrl = finalUrl.match(/\/admin\/families\/(\d+)\/contacts/)?.[1] ||
          finalUrl.match(/\/families\/(\d+)\/contacts/)?.[1];
        if (fromUrl) {
          debugLog("familyId trouve dans url finale", { contactId, familyId: fromUrl });
          return fromUrl;
        }

        const html = await response.text();
        const fromHtml = html.match(/\/admin\/families\/(\d+)\/contacts/)?.[1] ||
          html.match(/\/families\/(\d+)\/contacts/)?.[1];
        if (fromHtml) {
          debugLog("familyId trouve dans html fiche contact", { contactId, familyId: fromHtml });
          return fromHtml;
        }

        debugLog("familyId introuvable dans fiche contact", {
          contactId,
          url,
          htmlStart: html.slice(0, 240)
        });
      } catch (error) {
        debugLog("erreur fetch fiche contact", {
          contactId,
          url,
          message: error.message || String(error)
        });
      }
    }

    return "";
  }

  async function fetchFamilyMembers(familyId, expectedSeasonLabel) {
    const response = await fetch(`/admin/families/${familyId}/contacts`, {
      credentials: "include",
      headers: { Accept: "text/html" }
    });

    if (!response.ok) throw new Error(`Famille ${familyId} HTTP ${response.status}`);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = doc.querySelector('table[data-datatable="contacts"]') || doc.querySelector("table");
    const source = table?.getAttribute("data-source");
    const info = parseFamilyInfo(doc, familyId, expectedSeasonLabel);

    if (source) {
      const jsonMembers = await fetchFamilyMembersFromJson(familyId, source);
      if (jsonMembers.length) {
        return {
          familyId,
          info,
          members: jsonMembers
        };
      }
    }

    return {
      familyId,
      info,
      members: parseFamilyMembersTable(familyId, table)
    };
  }

  function parseFamilyInfo(doc, familyId, expectedSeasonLabel) {
    const heading = cleanText(doc.querySelector(".page-heading h2, h2")?.textContent || "");
    const byLabel = (label, root = doc) => {
      const entry = [...root.querySelectorAll(".datalist-entry")].find(item => (
        normalize(item.querySelector("dt")?.textContent || "") === normalize(label)
      ));
      return cleanText(entry?.querySelector("dd")?.textContent || "");
    };

    const nameFromHeading = heading.replace(new RegExp(`\\s*#${familyId}\\s*$`), "");
    const representativeName = [byLabel("Prenom"), byLabel("Nom")].filter(Boolean).join(" ");
    const season = expectedSeasonLabel ? { label: expectedSeasonLabel } : getSelectedSeason();
    const seasonNeedle = normalize((season.label || "").replace(/^saison\s+/i, ""));
    const panels = [...doc.querySelectorAll(".sidebar-information .panel, .panel")];
    const seasonPanel = panels.find(panel => {
      const headingText = normalize(panel.querySelector(":scope > .panel-heading")?.textContent || "");
      return seasonNeedle && headingText.includes(seasonNeedle);
    });
    const proofEntry = seasonPanel ? [...seasonPanel.querySelectorAll(".datalist-entry")].find(item => (
      normalize(item.querySelector("dt")?.textContent || "") === normalize("Just. de domicile")
    )) : null;
    const proofValue = proofEntry?.querySelector("dd");
    const proofLink = proofValue?.querySelector("a");
    const proofText = normalize(proofValue?.textContent || "");
    const addressProofValidated = Boolean(
      proofLink?.classList.contains("text-success") &&
      proofText.includes("valide") &&
      !proofText.includes("non renseigne")
    );

    debugLog("justificatif saison lu", {
      familyId,
      season,
      seasonPanel: cleanText(seasonPanel?.querySelector(":scope > .panel-heading")?.textContent || ""),
      proofText: cleanText(proofValue?.textContent || ""),
      addressProofValidated
    });

    return {
      name: nameFromHeading || representativeName || `Famille ${familyId}`,
      email: byLabel("Email"),
      phone: byLabel("Telephone mobile") || byLabel("Telephone fixe"),
      addressProofValidated
    };
  }

  async function fetchFamilyMembersFromJson(familyId, source) {
    const url = new URL(source, location.origin);
    addFamilyContactsDataTableParams(url);
    debugLog("fetch membres famille json", url.toString());

    const response = await fetch(url.toString(), {
      credentials: "include",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    debugLog("fetch membres famille status", {
      familyId,
      status: response.status,
      contentType: response.headers.get("content-type") || ""
    });

    if (!response.ok) return [];

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      debugLog("fetch membres famille non-json", text.slice(0, 500));
      return [];
    }

    const records = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
    const members = records.map(record => parseFamilyMemberRecord(familyId, record)).filter(member => (
      member.nom || member.prenom || member.contactId
    ));

    debugLog("membres famille json parses", {
      familyId,
      count: members.length,
      members
    });

    return members;
  }

  function addFamilyContactsDataTableParams(url) {
    const columns = [
      "is_master",
      "civility",
      "lastname",
      "firstname",
      "birthdate",
      "adherent_label",
      "family_role",
      "activities",
      "actions"
    ];

    url.searchParams.set("draw", String(Date.now()));
    url.searchParams.set("start", "0");
    url.searchParams.set("length", "100");
    url.searchParams.set("search[value]", "");
    url.searchParams.set("search[regex]", "false");
    url.searchParams.set("order[0][column]", "0");
    url.searchParams.set("order[0][dir]", "desc");
    url.searchParams.set("order[1][column]", "2");
    url.searchParams.set("order[1][dir]", "asc");
    url.searchParams.set("order[2][column]", "3");
    url.searchParams.set("order[2][dir]", "asc");

    columns.forEach((column, index) => {
      const orderable = !["civility", "adherent_label", "family_role", "activities", "actions"].includes(column);
      url.searchParams.set(`columns[${index}][data]`, column);
      url.searchParams.set(`columns[${index}][name]`, "");
      url.searchParams.set(`columns[${index}][searchable]`, "true");
      url.searchParams.set(`columns[${index}][orderable]`, orderable ? "true" : "false");
      url.searchParams.set(`columns[${index}][search][value]`, "");
      url.searchParams.set(`columns[${index}][search][regex]`, "false");
    });
  }

  function parseFamilyMemberRecord(familyId, record) {
    const html = flattenRecord(record);
    const contactId = extractContactIdFromHtml(html) ||
      firstRecordValue(record, ["id", "contact_id", "DT_RowId"], 0).replace(/\D+/g, "") ||
      "";

    return {
      contactId,
      contactUrl: contactId ? `/admin/families/${familyId}/contacts/${contactId}` : "",
      nom: stripHtml(firstRecordValue(record, ["lastname", "last_name", "nom"], 2)),
      prenom: stripHtml(firstRecordValue(record, ["firstname", "first_name", "prenom"], 3)),
      age: stripHtml(firstRecordValue(record, ["birthdate", "age"], 4))
    };
  }

  function parseFamilyMembersTable(familyId, table) {
    const headers = [...(table?.querySelectorAll("thead th") || [])].map(th => normalize(th.textContent));
    const nomIndex = headerIndex(headers, "nom", 2);
    const prenomIndex = headerIndex(headers, "prenom", 3);
    const ageIndex = headerIndex(headers, "age", -1);

    return [...(table?.querySelectorAll("tbody tr") || [])].map(row => {
      const cells = [...row.querySelectorAll("td")];
      const htmlRow = row.innerHTML;
      const contactId = extractContactIdFromHtml(htmlRow);
      const nom = cellText(cells, nomIndex);
      const prenom = cellText(cells, prenomIndex);

      return {
        contactId,
        contactUrl: contactId ? `/admin/families/${familyId}/contacts/${contactId}` : "",
        nom,
        prenom,
        age: ageIndex >= 0 ? cellText(cells, ageIndex) : ""
      };
    }).filter(member => member.nom || member.prenom || member.contactId);
  }

  function headerIndex(headers, wanted, fallback) {
    const index = headers.findIndex(header => header === wanted || header.includes(wanted));
    return index >= 0 ? index : fallback;
  }

  function cellText(cells, index) {
    return index >= 0 ? cleanText(cells[index]?.textContent || "") : "";
  }

  function extractContactIdFromHtml(html) {
    const text = String(html || "");
    return text.match(/\/registrations\/new\/ActivitySchedule\/(\d+)/)?.[1] ||
      text.match(/\/registrations\/new\/Adhesion\/(\d+)/)?.[1] ||
      text.match(/\/families\/\d+\/contacts\/(\d+)/)?.[1] ||
      text.match(/\/contacts\/(\d+)/)?.[1] ||
      "";
  }

  function samePerson(member, row) {
    return normalize(member.nom) === normalize(row.nom) &&
      normalize(member.prenom) === normalize(row.prenom);
  }

  function candidateLooksLikeSamePerson(candidate, row) {
    return normalize(candidate.nom) === normalize(row.nom) &&
      normalize(candidate.prenom) === normalize(row.prenom) &&
      (!candidate.email || normalize(candidate.email) === normalize(row.email));
  }

  async function fetchFamilyRegistrations(familyId) {
    const response = await fetch(`/admin/families/${familyId}/registrations`, {
      credentials: "include",
      headers: { Accept: "text/html" }
    });

    if (!response.ok) throw new Error(`Souscriptions famille ${familyId} HTTP ${response.status}`);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = doc.querySelector('table[data-datatable], table');
    const source = table?.getAttribute("data-source");

    if (source) {
      const jsonRecords = await fetchFamilyRegistrationsFromJson(source);
      if (jsonRecords.length) return jsonRecords;
    }

    return parseFamilyRegistrationsTable(table);
  }

  async function fetchFamilyRegistrationsFromJson(source) {
    const url = new URL(source, location.origin);
    addRegistrationsDataTableParams(url);
    debugLog("fetch souscriptions famille json", url.toString());

    const response = await fetch(url.toString(), {
      credentials: "include",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    if (!response.ok) return [];

    const data = await response.json().catch(() => null);
    const records = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    return records.map(parseRegistrationRecord).filter(item => item.member || item.product || item.type);
  }

  function addRegistrationsDataTableParams(url) {
    const columns = [
      "contact",
      "orderable_type",
      "product",
      "invoice_number",
      "created_at",
      "valid_from",
      "total",
      "stop_date",
      "amount_to_cancel",
      "state",
      "actions"
    ];

    url.searchParams.set("draw", String(Date.now()));
    url.searchParams.set("start", "0");
    url.searchParams.set("length", "100");
    url.searchParams.set("search[value]", "");
    url.searchParams.set("search[regex]", "false");
    url.searchParams.set("order[0][column]", "4");
    url.searchParams.set("order[0][dir]", "desc");

    columns.forEach((column, index) => {
      url.searchParams.set(`columns[${index}][data]`, column);
      url.searchParams.set(`columns[${index}][name]`, "");
      url.searchParams.set(`columns[${index}][searchable]`, "true");
      url.searchParams.set(`columns[${index}][orderable]`, index < 9 ? "true" : "false");
      url.searchParams.set(`columns[${index}][search][value]`, "");
      url.searchParams.set(`columns[${index}][search][regex]`, "false");
    });
  }

  function parseFamilyRegistrationsTable(table) {
    const headers = [...(table?.querySelectorAll("thead th") || [])].map(th => normalize(th.textContent));
    const indexes = {
      member: headerIndex(headers, "membre", 0),
      type: headerIndex(headers, "type", 1),
      product: headerIndex(headers, "produit", 2),
      stopDate: headerIndex(headers, "date d'arret", 7),
      state: headerIndex(headers, "etat", 9)
    };

    return [...(table?.querySelectorAll("tbody tr") || [])].map(row => {
      const cells = [...row.querySelectorAll("td")];
      return {
        member: cellText(cells, indexes.member),
        type: cellText(cells, indexes.type),
        product: cellText(cells, indexes.product),
        stopDate: cellText(cells, indexes.stopDate),
        state: cellText(cells, indexes.state),
        raw: cleanText(row.textContent || "")
      };
    }).filter(item => item.member || item.product || item.type);
  }

  function parseRegistrationRecord(record) {
    const html = flattenRecord(record);
    return {
      member: stripHtml(firstRecordValue(record, ["contact", "member", "membre"], 0)),
      type: stripHtml(firstRecordValue(record, ["orderable_type", "type"], 1)),
      product: stripHtml(firstRecordValue(record, ["product", "produit"], 2)),
      stopDate: stripHtml(firstRecordValue(record, ["stop_date", "date_stop", "date_arret"], 7)),
      state: stripHtml(firstRecordValue(record, ["state", "etat"], 9)),
      raw: stripHtml(html)
    };
  }

  function hasMatchingRegistration(registrations, row, type) {
    const wantedName = normalize(`${row.nom} ${row.prenom}`);
    const wantedReverse = normalize(`${row.prenom} ${row.nom}`);

    return registrations.some(item => {
      const member = normalize(item.member || item.raw || "");
      const memberMatches = !member ||
        member.includes(wantedName) ||
        member.includes(wantedReverse) ||
        (member.includes(normalize(row.nom)) && member.includes(normalize(row.prenom)));
      const text = normalize([item.type, item.product, item.raw].join(" "));
      if (type === "adhesion") {
        const result = memberMatches && text.includes("adhesion") && seasonTextMatches(text, row.seasonLabel) && adhesionRegistrationIsActive(item);
        debugLog("test adhesion", { item, memberMatches, result });
        return result;
      }
      if (type === "schedule") {
        const result = memberMatches && scheduleRegistrationIsActive(item) && scheduleTextMatches(row, text);
        debugLog("test programmation existante", { item, memberMatches, result });
        return result;
      }
      return false;
    });
  }

  function adhesionRegistrationIsActive(item) {
    const stateText = normalize([item.state, item.product, item.type].join(" "));
    if (stateText.includes("complete") || stateText.includes("valide")) return true;
    return !registrationHasStoppedState(item, false);
  }

  function scheduleRegistrationIsActive(item) {
    return !registrationHasStoppedState(item, true);
  }

  function registrationHasStoppedState(item, includeStopDate) {
    const stateText = normalize([item.state, item.stopDate].join(" "));
    const stoppedWords = [
      "arretee",
      "arrete",
      "annulee",
      "annule",
      "resiliee",
      "resilie",
      "stoppee",
      "stoppe",
      "supprimee",
      "supprime"
    ];

    if (stoppedWords.some(word => stateText.includes(word))) return true;

    const stopDate = cleanText(item.stopDate || "");
    if (includeStopDate && stopDate && /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}/.test(stopDate)) return true;

    return false;
  }

  function seasonTextMatches(text, expectedSeasonLabel) {
    const season = getSelectedSeason();
    const label = normalize(expectedSeasonLabel || season.label || "");
    const years = label.match(/(\d{4})\s*-\s*(\d{4})/);
    if (!years) return true;
    const short = `${years[1].slice(2)}-${years[2].slice(2)}`;
    return text.includes(normalize(short)) || text.includes(label.replace(/^saison\s+/, ""));
  }

  function scheduleTextMatches(row, normalizedText) {
    const instrumentTokens = significantTokens(row.instrument || state.settings.instrument || row.label).slice(0, 3);
    const suffix = normalize(professorSuffix(row.rawProf));
    const day = normalize(row.slot?.dayLabel || "");
    const hour = minutesToLabel(row.slot?.start || 0);
    const type = normalize(row.type || "");

    const hasInstrument = instrumentTokens.some(token => normalizedText.includes(token));
    const hasDay = day ? normalizedText.includes(day) : true;
    const hasHour = timeTextIncludes(normalizedText, hour);
    const hasSuffix = suffix ? normalizedText.includes(suffix) : true;
    const hasType = !type || (
      (type.includes("coll") ? (normalizedText.includes("coll") || normalizedText.includes("collectif")) : true) &&
      (type.includes("individuel") ? (normalizedText.includes("individuel") || normalizedText.includes("indiv")) : true)
    );

    return hasInstrument && hasDay && hasHour && hasSuffix && hasType;
  }

  function timeTextIncludes(normalizedText, hourLabel) {
    const compact = normalize(normalizedText)
      .replace(/\s+/g, "")
      .replace(/:/g, "h")
      .replace(/h00/g, "h");
    const wanted = normalize(hourLabel)
      .replace(/\s+/g, "")
      .replace(/:/g, "h")
      .replace(/h00$/, "h");
    const match = wanted.match(/^0?(\d{1,2})h(\d{2})?$/);
    if (!match) return compact.includes(wanted);

    const hour = String(Number(match[1]));
    const minute = match[2] || "";
    const pattern = minute
      ? new RegExp(`(^|[^0-9])0?${hour}h${minute}(?![0-9])`)
      : new RegExp(`(^|[^0-9])0?${hour}h(?![0-9])`);
    return pattern.test(compact);
  }

  async function handleRowAction(button) {
    const row = state.rows[Number(button.dataset.rowIndex)];
    if (!row) return;

    const action = button.dataset.fxMmAction;
    const match = row.match;

    if (action === "search") {
      row.status = "Recherche...";
      row.statusType = "muted";
      renderRows();
      row.match = await lookupRow(row);
      if (row.match?.familyId) await enrichRowStatus(row);
      row.status = row.match?.contactId ? "Contact trouve" : row.match?.familyId ? "Famille trouvee" : "Introuvable";
      row.statusType = row.match?.contactId ? "ok" : row.match?.familyId ? "warning" : "danger";
      row.details = row.match?.contactId ? "" : row.match?.familyId ? "Aucun membre ne correspond exactement." : "Aucune famille trouvee avec ce mail.";
      renderRows();
      return;
    }

    if (action === "family") {
      if (!match?.familyId) throw new Error("Famille introuvable pour ce contact.");
      window.open(match.familyUrl || `/admin/families/${match.familyId}/contacts`, "_blank", "noopener");
      return;
    }

    if (action === "address") {
      if (!match?.familyId) throw new Error("Famille introuvable pour ajouter le justificatif.");
      localStorage.setItem(PENDING_ADDRESS_KEY, JSON.stringify(buildPendingAddressProof(row, match)));
      window.open(`/admin/families/${match.familyId}/address_proofs/new`, "_blank", "noopener");
      return;
    }

    if (action === "auto") {
      await startAutoWorkflow(row);
      return;
    }

    if (!match?.contactId) throw new Error("Contact non trouve.");

    if (action === "adhesion") {
      if (row.checks?.addressProof !== "yes") {
        throw new Error("Justificatif de domicile requis avant d'ajouter une adhesion.");
      }
      localStorage.setItem(PENDING_ADHESION_KEY, JSON.stringify(buildPendingAdhesion(row, match)));
      window.open(`/admin/registrations/new/Adhesion/${match.contactId}`, "_blank", "noopener");
      return;
    }

    if (action === "schedule") {
      if (row.checks?.addressProof !== "yes") {
        throw new Error("Justificatif de domicile requis avant d'ajouter une programmation.");
      }
      localStorage.setItem(PENDING_SCHEDULE_KEY, JSON.stringify(buildPendingSchedule(row, match)));
      window.open(`/admin/registrations/new/ActivitySchedule/${match.contactId}`, "_blank", "noopener");
    }
  }

  async function startAutoWorkflow(row) {
    await prepareRowForAuto(row);
    row.status = "Auto en cours";
    row.statusType = "muted";
    renderRows();

    const workflow = buildAutoWorkflow(row);
    if (!workflow.needsAddressProof && !workflow.needsAdhesion && !workflow.needsSchedule) {
      localStorage.removeItem(PENDING_AUTO_KEY);
      row.status = "Deja complet";
      row.statusType = "ok";
      renderRows();
      FX.notify("Rien a ajouter pour ce contact.", "Cahier musique");
      return;
    }

    launchAutoWorkflow(workflow, true).catch(error => {
      blockAutoWorkflow(workflow, error.message || String(error));
    });
  }

  async function startAutoAllWorkflow() {
    if (!state.rows.length) {
      FX.notify("Aucune ligne a traiter.", "Cahier musique");
      return;
    }

    localStorage.removeItem(PENDING_AUTO_KEY);
    localStorage.removeItem(PENDING_AUTO_QUEUE_KEY);
    localStorage.removeItem(PENDING_AUTO_ERRORS_KEY);
    localStorage.removeItem(PENDING_AUTO_RETRY_KEY);
    localStorage.removeItem(PENDING_ADDRESS_KEY);
    localStorage.removeItem(PENDING_ADHESION_KEY);
    localStorage.removeItem(PENDING_SCHEDULE_KEY);

    await lookupAllRows();

    const workflows = [];
    for (let index = 0; index < state.rows.length; index += 1) {
      const row = state.rows[index];
      if (row.errors?.length) continue;

      setStatus(`Preparation Auto ${index + 1}/${state.rows.length} : ${row.email || row.nom}`);
      try {
        await prepareRowForAuto(row);
        const workflow = buildAutoWorkflow(row);
        if (workflow.needsAddressProof || workflow.needsAdhesion || workflow.needsSchedule) {
          workflow.autoAll = true;
          workflow.retryCount = 0;
          workflows.push(workflow);
          row.status = "En file Auto";
          row.statusType = "muted";
          row.details = "";
        } else if (row.match?.contactId) {
          row.status = "Deja complet";
          row.statusType = "ok";
          row.details = "";
        }
      } catch (error) {
        row.status = "Auto impossible";
        row.statusType = "danger";
        row.details = error.message || String(error);
      }
      renderRows();
      await FX.wait(80);
    }

    if (!workflows.length) {
      setStatus("Auto tous : rien a ajouter.");
      FX.notify("Aucun contact a completer.", "Cahier musique");
      return;
    }

    const [first, ...rest] = workflows;
    localStorage.setItem(PENDING_AUTO_QUEUE_KEY, JSON.stringify(rest));
    setStatus(`Auto tous lance : ${workflows.length} contact(s) en file.`);
    launchAutoWorkflow(first, true).catch(error => {
      blockAutoWorkflow(first, error.message || String(error));
    });
  }

  async function prepareRowForAuto(row) {
    if (!row.match?.familyId || !row.match?.contactId) {
      row.status = "Recherche...";
      row.statusType = "muted";
      renderRows();
      row.match = await lookupRow(row);
      if (row.match?.familyId) await enrichRowStatus(row);
    } else if (!row.checks) {
      await enrichRowStatus(row);
    }

    const match = row.match;
    if (!match?.familyId) throw new Error("Famille introuvable pour lancer Auto.");
    if (!match?.contactId) throw new Error("Contact introuvable pour lancer Auto.");

    if (!row.checks) await enrichRowStatus(row);
  }

  function buildAutoWorkflow(row) {
    const match = row.match;
    return {
      contactId: match.contactId,
      familyId: match.familyId,
      nom: row.nom,
      prenom: row.prenom,
      slot: row.slot,
      rawProf: row.rawProf,
      type: row.type,
      instrument: row.instrument || state.settings.instrument,
      label: row.label,
      adherent: `${row.prenom} ${row.nom}`,
      seasonId: row.seasonId || getSelectedSeason().id,
      seasonLabel: row.seasonLabel || getSelectedSeason().label,
      needsAddressProof: row.checks?.addressProof !== "yes",
      needsAdhesion: row.checks?.adhesion !== "yes",
      needsSchedule: row.checks?.schedule !== "yes",
      createdAt: Date.now(),
      address: buildPendingAddressProof(row, match, true),
      schedule: buildPendingSchedule(row, match, true),
      adhesion: buildPendingAdhesion(row, match, true)
    };
  }

  async function launchAutoWorkflow(workflow, openNewTab) {
    if (!workflow?.contactId) return;

    if (workflow.autoAll && Number(workflow.retryCount || 0) > 0) {
      await refreshWorkflowNeeds(workflow);
      if (!workflow.needsAddressProof && !workflow.needsAdhesion && !workflow.needsSchedule) {
        ensureHelperBanner(
          "fx-mm-auto-helper",
          `Contact deja corrige apres relecture : ${workflow.adherent || "contact"}.`
        );
        setTimeout(() => launchNextAutoWorkflow(openNewTab), AUTO_STEP_DELAY);
        return;
      }
    }

    workflow.createdAt = Date.now();
    workflow.runnerId = openNewTab ? "" : (workflow.runnerId || getAutoRunnerId());
    workflow.transitioning = false;
    workflow.transitionAt = 0;
    workflow.blocked = false;
    workflow.blockedReason = "";
    workflow.stageStartedAt = Date.now();
    if (workflow.needsAddressProof) {
      workflow.stage = "address";
      workflow.address = { ...(workflow.address || {}), auto: true, workflow: true, createdAt: Date.now() };
      localStorage.setItem(PENDING_AUTO_KEY, JSON.stringify(workflow));
      localStorage.setItem(PENDING_ADDRESS_KEY, JSON.stringify(workflow.address));
      openWorkflowUrl(`/admin/families/${workflow.familyId}/address_proofs/new`, openNewTab);
      return;
    }

    if (workflow.needsAdhesion) {
      workflow.stage = "adhesion";
      workflow.adhesion = { ...(workflow.adhesion || {}), auto: true, workflow: true, createdAt: Date.now() };
      localStorage.setItem(PENDING_AUTO_KEY, JSON.stringify(workflow));
      localStorage.setItem(PENDING_ADHESION_KEY, JSON.stringify(workflow.adhesion));
      openWorkflowUrl(`/admin/registrations/new/Adhesion/${workflow.contactId}`, openNewTab);
      return;
    }

    if (workflow.needsSchedule) {
      workflow.stage = "schedule";
      workflow.schedule = { ...(workflow.schedule || {}), auto: true, workflow: true, createdAt: Date.now() };
      localStorage.setItem(PENDING_AUTO_KEY, JSON.stringify(workflow));
      localStorage.setItem(PENDING_SCHEDULE_KEY, JSON.stringify(workflow.schedule));
      openWorkflowUrl(`/admin/registrations/new/ActivitySchedule/${workflow.contactId}`, openNewTab);
      return;
    }

    launchNextAutoWorkflow(openNewTab);
  }

  function openWorkflowUrl(url, openNewTab) {
    if (openNewTab) {
      window.open(url, "_blank", "noopener");
    } else {
      window.location.href = url;
    }
  }

  function launchNextAutoWorkflow(openNewTab) {
    const queue = readStoredJson(PENDING_AUTO_QUEUE_KEY);
    if (!Array.isArray(queue) || !queue.length) {
      const errors = readStoredJson(PENDING_AUTO_ERRORS_KEY);
      const retryAlreadyDone = readStoredJson(PENDING_AUTO_RETRY_KEY)?.done;
      if (Array.isArray(errors) && errors.length && !retryAlreadyDone) {
        const retryQueue = errors
          .map(item => ({
            ...(item.workflow || {}),
            autoAll: true,
            retryCount: Number(item.workflow?.retryCount || 0) + 1,
            lastError: item.reason || "",
            blocked: false,
            blockedReason: "",
            transitioning: false,
            transitionAt: 0,
            verifyingStep: "",
            verifyingAt: 0,
            createdAt: Date.now()
          }))
          .filter(item => item.contactId && item.familyId);

        localStorage.setItem(PENDING_AUTO_RETRY_KEY, JSON.stringify({
          done: true,
          createdAt: Date.now()
        }));
        localStorage.removeItem(PENDING_AUTO_ERRORS_KEY);

        if (retryQueue.length) {
          const [firstRetry, ...restRetry] = retryQueue;
          localStorage.setItem(PENDING_AUTO_QUEUE_KEY, JSON.stringify(restRetry));
          ensureHelperBanner(
            "fx-mm-auto-helper",
            `Auto tous : nouvelle passe sur ${retryQueue.length} contact(s) en erreur.`
          );
          setTimeout(() => {
            launchAutoWorkflow(firstRetry, Boolean(openNewTab)).catch(error => {
              blockAutoWorkflow(firstRetry, error.message || String(error));
            });
          }, AUTO_STEP_DELAY);
          return;
        }
      }

      localStorage.removeItem(PENDING_AUTO_KEY);
      localStorage.removeItem(PENDING_AUTO_QUEUE_KEY);
      localStorage.removeItem(PENDING_AUTO_RETRY_KEY);
      localStorage.setItem(AUTO_COMPARE_REQUEST_KEY, JSON.stringify({
        label: "Relecture apres Auto tous",
        errors: Array.isArray(errors) ? errors : [],
        createdAt: Date.now()
      }));
      ensureHelperBanner(
        "fx-mm-auto-helper",
        Array.isArray(errors) && errors.length
          ? `Auto tous termine avec ${errors.length} contact(s) encore en erreur. Relecture lancee.`
          : "Auto tous termine."
      );
      return;
    }

    const [next, ...rest] = queue;
    localStorage.setItem(PENDING_AUTO_QUEUE_KEY, JSON.stringify(rest));
    ensureHelperBanner(
      "fx-mm-auto-helper",
      `Auto tous : prochain contact dans quelques secondes (${next.adherent || "contact"}).`
    );
    setTimeout(() => {
      launchAutoWorkflow(next, Boolean(openNewTab)).catch(error => {
        blockAutoWorkflow(next, error.message || String(error));
      });
    }, AUTO_STEP_DELAY);
  }

  function markWorkflowTransition(workflow) {
    workflow.transitioning = true;
    workflow.transitionAt = Date.now();
    workflow.createdAt = Date.now();
    localStorage.setItem(PENDING_AUTO_KEY, JSON.stringify(workflow));
  }

  function resumeExpiredTransition(workflow) {
    if (!workflow.transitioning) return false;

    const age = Date.now() - Number(workflow.transitionAt || 0);
    if (age < AUTO_TRANSITION_TTL) return true;

    workflow.transitioning = false;
    workflow.transitionAt = 0;
    workflow.createdAt = Date.now();
    localStorage.setItem(PENDING_AUTO_KEY, JSON.stringify(workflow));
    debugLog("reprise transition auto expiree", {
      stage: workflow.stage,
      contactId: workflow.contactId,
      familyId: workflow.familyId,
      needsAddressProof: workflow.needsAddressProof,
      needsAdhesion: workflow.needsAdhesion,
      needsSchedule: workflow.needsSchedule
    });
    setTimeout(() => {
      launchAutoWorkflow(workflow, false).catch(error => {
        blockAutoWorkflow(workflow, error.message || String(error));
      });
    }, 200);
    return true;
  }

  async function refreshWorkflowNeeds(workflow) {
    const row = rowFromWorkflow(workflow);
    const family = await fetchFamilyMembers(workflow.familyId, workflow.seasonLabel);
    const registrations = await fetchFamilyRegistrations(workflow.familyId);

    workflow.needsAddressProof = !family.info?.addressProofValidated;
    workflow.needsAdhesion = !hasMatchingRegistration(registrations, row, "adhesion");
    workflow.needsSchedule = !hasMatchingRegistration(registrations, row, "schedule");
    workflow.createdAt = Date.now();
    workflow.address = {
      ...(workflow.address || {}),
      familyId: workflow.familyId,
      contactId: workflow.contactId,
      seasonId: workflow.seasonId,
      seasonLabel: workflow.seasonLabel,
      label: workflow.adherent || "",
      auto: true,
      workflow: true,
      createdAt: Date.now()
    };
    workflow.adhesion = {
      ...(workflow.adhesion || {}),
      contactId: workflow.contactId,
      seasonId: workflow.seasonId,
      seasonLabel: workflow.seasonLabel,
      label: workflow.adherent || "",
      auto: true,
      workflow: true,
      createdAt: Date.now()
    };
    workflow.schedule = {
      ...(workflow.schedule || {}),
      contactId: workflow.contactId,
      label: workflow.label || "",
      searchQuery: workflow.label || workflow.schedule?.searchQuery || "",
      type: workflow.type || workflow.schedule?.type || "",
      day: workflow.schedule?.day || workflow.slot?.dayLabel || "",
      hour: workflow.schedule?.hour || minutesToLabel(workflow.slot?.start || 0),
      suffix: workflow.schedule?.suffix || professorSuffix(workflow.rawProf || ""),
      instrument: workflow.instrument || workflow.schedule?.instrument || "",
      adherent: workflow.adherent || "",
      seasonId: workflow.seasonId,
      seasonLabel: workflow.seasonLabel,
      auto: true,
      workflow: true,
      createdAt: Date.now()
    };

    debugLog("workflow relu avant relance", {
      contactId: workflow.contactId,
      familyId: workflow.familyId,
      needsAddressProof: workflow.needsAddressProof,
      needsAdhesion: workflow.needsAdhesion,
      needsSchedule: workflow.needsSchedule
    });
  }

  function blockAutoWorkflow(workflow, reason) {
    if (isAutoAllWorkflow(workflow)) {
      failAutoWorkflowAndContinue(workflow, reason);
      return;
    }

    workflow.blocked = true;
    workflow.blockedReason = reason;
    workflow.transitioning = false;
    workflow.transitionAt = 0;
    workflow.createdAt = Date.now();
    localStorage.setItem(PENDING_AUTO_KEY, JSON.stringify(workflow));
    ensureHelperBanner("fx-mm-auto-helper", `Auto tous interrompu : ${reason}`);
    FX.notify(`Auto tous interrompu : ${reason}`, "Cahier musique");
  }

  function isAutoAllWorkflow(workflow) {
    if (workflow?.autoAll) return true;
    const queue = readStoredJson(PENDING_AUTO_QUEUE_KEY);
    return Array.isArray(queue);
  }

  function failAutoWorkflowAndContinue(workflow, reason) {
    const cleanReason = cleanText(reason || "erreur inconnue");
    const errors = readStoredJson(PENDING_AUTO_ERRORS_KEY);
    const nextErrors = Array.isArray(errors) ? errors : [];
    const errorItem = {
      contactId: workflow.contactId || "",
      familyId: workflow.familyId || "",
      adherent: workflow.adherent || "",
      label: workflow.label || "",
      stage: workflow.stage || "",
      reason: cleanReason,
      retryCount: Number(workflow.retryCount || 0),
      createdAt: Date.now(),
      workflow: {
        ...workflow,
        autoAll: true,
        blocked: false,
        blockedReason: "",
        transitioning: false,
        transitionAt: 0,
        verifyingStep: "",
        verifyingAt: 0,
        createdAt: Date.now()
      }
    };

    const existingIndex = nextErrors.findIndex(item => (
      String(item.contactId) === String(errorItem.contactId) &&
      String(item.stage) === String(errorItem.stage)
    ));
    if (existingIndex >= 0) nextErrors[existingIndex] = errorItem;
    else nextErrors.push(errorItem);

    localStorage.setItem(PENDING_AUTO_ERRORS_KEY, JSON.stringify(nextErrors));
    localStorage.removeItem(PENDING_ADDRESS_KEY);
    localStorage.removeItem(PENDING_ADHESION_KEY);
    localStorage.removeItem(PENDING_SCHEDULE_KEY);

    ensureHelperBanner(
      "fx-mm-auto-helper",
      `Erreur notee pour ${workflow.adherent || "contact"} : ${cleanReason}. Passage au suivant.`
    );
    debugLog("auto tous erreur notee", errorItem);

    setTimeout(() => launchNextAutoWorkflow(false), AUTO_STEP_DELAY);
  }

  function buildPendingAdhesion(row, match, workflow) {
    return {
      contactId: match.contactId,
      seasonId: row.seasonId || getSelectedSeason().id,
      seasonLabel: row.seasonLabel || getSelectedSeason().label,
      label: `${row.prenom} ${row.nom}`,
      auto: true,
      workflow: Boolean(workflow),
      createdAt: Date.now()
    };
  }

  function buildPendingAddressProof(row, match, workflow) {
    return {
      familyId: match.familyId,
      contactId: match.contactId || "",
      seasonId: row.seasonId || getSelectedSeason().id,
      seasonLabel: row.seasonLabel || getSelectedSeason().label,
      label: `${row.prenom || ""} ${row.nom || ""}`.trim(),
      auto: true,
      workflow: Boolean(workflow),
      createdAt: Date.now()
    };
  }

  function buildPendingSchedule(row, match, workflow) {
    return {
      contactId: match.contactId,
      label: row.label,
      searchQuery: row.label,
      type: row.type,
      day: row.slot?.dayLabel || "",
      hour: minutesToLabel(row.slot?.start || 0),
      suffix: professorSuffix(row.rawProf),
      instrument: row.instrument || state.settings.instrument,
      adherent: `${row.prenom} ${row.nom}`,
      seasonId: row.seasonId || getSelectedSeason().id,
      seasonLabel: row.seasonLabel || getSelectedSeason().label,
      auto: true,
      workflow: Boolean(workflow),
      createdAt: Date.now()
    };
  }

  async function resolveScheduleActionUrl(row, contactId) {
    const season = getSelectedSeason();
    const queries = [
      row.searchQuery,
      [state.settings.instrument, row.slot?.dayLabel, minutesToLabel(row.slot?.start || 0), professorSuffix(row.rawProf)].filter(Boolean).join(" "),
      [state.settings.instrument, minutesToLabel(row.slot?.start || 0), professorSuffix(row.rawProf)].filter(Boolean).join(" "),
      row.label
    ].map(cleanText).filter(Boolean);

    let best = null;
    for (const query of [...new Set(queries)]) {
      const records = await fetchScheduleRecords(contactId, season.id, query);
      const scored = records
        .map(record => ({
          record,
          score: scoreScheduleRecord(row, record)
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

      debugLog("programmations candidates", {
        contactId,
        query,
        count: records.length,
        best: scored[0] || null
      });

      if (scored[0] && (!best || scored[0].score > best.score)) best = scored[0];
      if (best?.score >= 5 && best.record.actionUrl) break;
    }

    if (!best?.record?.actionUrl) {
      throw new Error(`Programmation introuvable : ${row.label}`);
    }

    debugLog("programmation action cible", {
      label: row.label,
      actionUrl: best.record.actionUrl,
      matched: best.record
    });

    return best.record.actionUrl;
  }

  async function fetchScheduleRecords(contactId, seasonId, query) {
    const url = new URL(`/admin/registrations/orderable_activity_schedules/${contactId}.json`, location.origin);
    if (seasonId) url.searchParams.set("season_id", seasonId);
    addScheduleDataTableParams(url, query);

    const response = await fetch(url.toString(), {
      credentials: "include",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    if (!response.ok) throw new Error(`Recherche programmation HTTP ${response.status}`);
    const data = await response.json().catch(() => null);
    const records = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    return records.map(parseScheduleRecord).filter(record => record.label || record.actionUrl || record.raw);
  }

  function addScheduleDataTableParams(url, query) {
    const columns = [
      "label",
      "activity_name",
      "level",
      "age_min",
      "age_max",
      "date_begin",
      "date_end",
      "detailed_label",
      "schedule_type",
      "available_capacity",
      "actions"
    ];

    url.searchParams.set("draw", String(Date.now()));
    url.searchParams.set("start", "0");
    url.searchParams.set("length", "25");
    url.searchParams.set("search[value]", query || "");
    url.searchParams.set("search[regex]", "false");
    url.searchParams.set("order[0][column]", "0");
    url.searchParams.set("order[0][dir]", "asc");

    columns.forEach((column, index) => {
      url.searchParams.set(`columns[${index}][data]`, column);
      url.searchParams.set(`columns[${index}][name]`, "");
      url.searchParams.set(`columns[${index}][searchable]`, "true");
      url.searchParams.set(`columns[${index}][orderable]`, index < 7 ? "true" : "false");
      url.searchParams.set(`columns[${index}][search][value]`, "");
      url.searchParams.set(`columns[${index}][search][regex]`, "false");
    });
  }

  function parseScheduleRecord(record) {
    const html = flattenRecord(record);
    const actionHtml = firstRecordValue(record, ["actions", "action"], 10) || html;
    const actionUrl = extractFirstHref(actionHtml) || extractFirstHref(html);

    return {
      label: stripHtml(firstRecordValue(record, ["label", "intitule"], 0)),
      activityName: stripHtml(firstRecordValue(record, ["activity_name", "activity"], 1)),
      detailedLabel: stripHtml(firstRecordValue(record, ["detailed_label", "details"], 7)),
      scheduleType: stripHtml(firstRecordValue(record, ["schedule_type", "type"], 8)),
      actionUrl,
      raw: stripHtml(html)
    };
  }

  function extractFirstHref(html) {
    const div = document.createElement("div");
    div.innerHTML = String(html || "");
    const href = div.querySelector("a[href]")?.getAttribute("href") ||
      String(html || "").match(/href=["']([^"']+)["']/)?.[1] ||
      "";
    return href ? new URL(href.replace(/&amp;/g, "&"), location.origin).toString() : "";
  }

  function scoreScheduleRecord(row, record) {
    const text = normalize([record.label, record.activityName, record.detailedLabel, record.scheduleType, record.raw].join(" "));
    if (!text) return 0;

    let score = 0;
    const instrumentTokens = significantTokens(row.instrument || state.settings.instrument || "").slice(0, 3);
    const suffix = normalize(professorSuffix(row.rawProf));
    const day = normalize(row.slot?.dayLabel || "");
    const hour = minutesToLabel(row.slot?.start || 0);

    if (instrumentTokens.some(token => text.includes(token))) score += 1;
    if (day && text.includes(day)) score += 1;
    if (timeTextIncludes(text, hour)) score += 1;
    if (suffix && text.includes(suffix)) score += 1;

    if (row.type === "individuel" && text.includes("individuel")) score += 1;
    if (row.type === "coll" && (text.includes("collectif") || text.includes(" coll ") || text.includes(" coll"))) score += 1;
    if (scheduleTextMatches(row, text)) score += 3;

    return score;
  }

  async function createAddressProof(familyId) {
    const season = getSelectedSeason();
    const url = `/admin/families/${familyId}/address_proofs/new?season=${encodeURIComponent(season.id || "")}`;
    const response = await fetch(url, {
      credentials: "include",
      headers: { Accept: "text/html" }
    });

    if (!response.ok) throw new Error(`Justificatif HTTP ${response.status}`);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const form = doc.querySelector("form");
    if (!form) throw new Error("Formulaire justificatif introuvable.");

    const data = new FormData(form);
    setFormSelectValue(data, form, season.id, input => (
      input.name?.includes("season") || input.id?.includes("season")
    ));

    form.querySelectorAll("input[type='checkbox']").forEach(input => {
      if (normalize(input.name + " " + input.id).includes("email")) data.delete(input.name);
    });

    const submit = form.querySelector("input[type='submit'][name]");
    if (submit?.name && submit.value) data.set(submit.name, submit.value);

    const post = await fetch(new URL(form.getAttribute("action") || url, location.origin).toString(), {
      method: (form.getAttribute("method") || "post").toUpperCase(),
      credentials: "include",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "X-CSRF-Token": csrfTokenFromDoc(doc),
        "X-Requested-With": "XMLHttpRequest"
      },
      body: data,
      redirect: "follow"
    });

    debugLog("creation justificatif", {
      familyId,
      season,
      status: post.status,
      finalUrl: post.url
    });

    if (!post.ok) throw new Error(`Creation justificatif HTTP ${post.status}`);
  }

  function setFormSelectValue(data, form, value, predicate) {
    if (!value) return;
    const select = [...form.querySelectorAll("select")].find(predicate) || form.querySelector("select");
    if (select?.name) data.set(select.name, value);
  }

  function csrfTokenFromDoc(doc) {
    return doc.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ||
      document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ||
      "";
  }

  function renderRows() {
    const tbody = document.querySelector("#fx-mm-tbody");
    if (!tbody) return;

    const count = document.querySelector("#fx-mm-count");
    if (count) count.value = String(state.rows.length || 0);

    tbody.innerHTML = state.rows.length
      ? state.rows.map((row, index) => renderRow(row, index)).join("")
      : `<tr><td colspan="13" class="text-center text-muted">Aucune ligne previsualisee.</td></tr>`;
  }

  function renderRow(row, index) {
    const match = row.match;
    const member = match?.member || {};
    const familyName = match?.familyName || match?.family?.info?.name || "";
    const familyEmail = match?.familyEmail || match?.family?.info?.email || "";
    const checks = row.checks || {};
    const hasProof = checks.addressProof === "yes";
    const canAddAdhesion = match?.contactId && checks.adhesion !== "yes" && hasProof;
    const adhesionBlocked = match?.contactId && checks.adhesion !== "yes" && !hasProof;
    const canAddSchedule = match?.contactId && checks.schedule !== "yes" && checks.addressProof === "yes";
    const scheduleBlocked = match?.contactId && checks.schedule !== "yes" && checks.addressProof !== "yes";
    const needsAnything = match?.familyId && (
      checks.addressProof !== "yes" ||
      checks.adhesion !== "yes" ||
      checks.schedule !== "yes"
    );

    return `
      <tr>
        <td>
          <span class="fx-compare-badge ${badgeClass(row.statusType)}">${escapeHtml(row.status || "Pret")}</span>
          ${row.details ? `<pre>${escapeHtml(row.details)}</pre>` : ""}
        </td>
        <td>
          ${match?.familyId ? `<code>${escapeHtml(match.familyId)}</code>` : "-"}
        </td>
        <td>${familyName ? escapeHtml(familyName) : "-"}</td>
        <td>${familyEmail ? `<code>${escapeHtml(familyEmail)}</code>` : "-"}</td>
        <td>${match?.contactId ? `<code>${escapeHtml(match.contactId)}</code>` : "-"}</td>
        <td>
          <strong>${escapeHtml(member.nom || row.nom || "")}</strong>
        </td>
        <td><strong>${escapeHtml(member.prenom || row.prenom || "")}</strong></td>
        <td>${escapeHtml(member.age || row.age || "")}</td>
        <td>
          <strong>${escapeHtml(row.label || "")}</strong><br>
          ${row.tel ? `<span>${escapeHtml(row.tel)}</span><br>` : ""}
          ${row.email ? `<code>${escapeHtml(row.email)}</code>` : ""}
        </td>
        <td>${renderCheckBadge(checks.addressProof)}</td>
        <td>${renderCheckBadge(checks.adhesion)}</td>
        <td>${renderCheckBadge(checks.schedule)}</td>
        <td class="fx-mm-row-actions">
          <button type="button" class="btn btn-xs btn-default" data-fx-mm-action="search" data-row-index="${index}">Chercher</button>
          ${needsAnything ? `<button type="button" class="btn btn-xs btn-primary" data-fx-mm-action="auto" data-row-index="${index}">Auto</button>` : ""}
          ${match?.familyId ? `<button type="button" class="btn btn-xs btn-default" data-fx-mm-action="family" data-row-index="${index}">Famille</button>` : ""}
          ${match?.familyId && checks.addressProof !== "yes" ? `<button type="button" class="btn btn-xs btn-default" data-fx-mm-action="address" data-row-index="${index}">Ajouter justif.</button>` : ""}
          ${canAddAdhesion ? `<button type="button" class="btn btn-xs btn-default" data-fx-mm-action="adhesion" data-row-index="${index}">Ajouter adhesion</button>` : ""}
          ${adhesionBlocked ? `<button type="button" class="btn btn-xs btn-default" disabled title="Justificatif requis avant adhesion">Adh. bloquee</button>` : ""}
          ${canAddSchedule ? `<button type="button" class="btn btn-xs btn-primary" data-fx-mm-action="schedule" data-row-index="${index}">Ajouter prog.</button>` : ""}
          ${scheduleBlocked ? `<button type="button" class="btn btn-xs btn-default" disabled title="Justificatif requis avant programmation">Prog. bloquee</button>` : ""}
        </td>
      </tr>
    `;
  }

  function renderCheckBadge(value) {
    if (value === "yes") return `<span class="fx-mm-check fx-mm-check-ok">Oui</span>`;
    if (value === "no") return `<span class="fx-mm-check fx-mm-check-no">Non</span>`;
    return `<span class="fx-mm-check fx-mm-check-muted">-</span>`;
  }

  function badgeClass(type) {
    if (type === "ok") return "fx-compare-badge-ok";
    if (type === "danger") return "fx-compare-badge-danger";
    if (type === "warning") return "fx-compare-badge-warning";
    return "fx-compare-badge-muted";
  }

  async function copyExport() {
    const headers = [
      "ID famille",
      "Nom famille",
      "Mail famille",
      "ID contact",
      "Nom adherent",
      "Prenom adherent",
      "Age",
      "Mail adherent",
      "Tel",
      "Programmation",
      "Statut",
      "Justificatif",
      "Adhesion",
      "Programmation deja presente"
    ];
    const lines = state.rows.map(row => [
      row.match?.familyId || "",
      row.match?.familyName || row.match?.family?.info?.name || "",
      row.match?.familyEmail || row.match?.family?.info?.email || "",
      row.match?.contactId || "",
      row.match?.member?.nom || row.nom,
      row.match?.member?.prenom || row.prenom,
      row.age,
      row.email,
      row.tel,
      row.label,
      row.status,
      checkExportValue(row.checks?.addressProof),
      checkExportValue(row.checks?.adhesion),
      checkExportValue(row.checks?.schedule)
    ].map(tsvCell).join("\t"));

    try {
      await navigator.clipboard.writeText([headers.join("\t"), ...lines].join("\n"));
      FX.notify(`${state.rows.length} ligne(s) copiees.`, "Cahier musique");
    } catch (error) {
      FX.notify(error.message || "Copie impossible.", "Cahier musique");
    }
  }

  function checkExportValue(value) {
    if (value === "yes") return "Oui";
    if (value === "no") return "Non";
    return "";
  }

  function tsvCell(value) {
    return String(value || "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
  }

  function runRouteHelpers() {
    injectStyle();
    cacheVisibleContactsPageRows();
    enhanceFamilyContactsPage();
    if (!claimCurrentAutoWorkflow()) return;
    setupPendingAdhesion();
    setupPendingAddressProof();
    setupPendingSchedule();
    setupPendingRegistrationValidation();
    setupPendingAutoWorkflow();
  }

  function getAutoRunnerId() {
    let id = sessionStorage.getItem("aniapps_music_members_auto_runner_id");
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem("aniapps_music_members_auto_runner_id", id);
    }
    return id;
  }

  function claimCurrentAutoWorkflow() {
    const workflow = readStoredJson(PENDING_AUTO_KEY);
    if (!workflow?.contactId || workflow.blocked || !isAutoWorkflowRelevantPage(workflow)) return true;

    const runnerId = getAutoRunnerId();
    if (workflow.runnerId && workflow.runnerId !== runnerId) {
      ensureHelperBanner(
        "fx-mm-auto-helper",
        `Auto tous en cours dans un autre onglet : ${workflow.adherent || workflow.label || "contact"}.`
      );
      return false;
    }

    if (!workflow.runnerId) {
      workflow.runnerId = runnerId;
      workflow.createdAt = Date.now();
      localStorage.setItem(PENDING_AUTO_KEY, JSON.stringify(workflow));
      debugLog("onglet auto assigne", {
        runnerId,
        stage: workflow.stage,
        contactId: workflow.contactId,
        familyId: workflow.familyId
      });
    }

    return true;
  }

  function cacheVisibleContactsPageRows() {
    if (location.pathname !== "/admin/contacts") return;

    const table = document.querySelector("table");
    const headers = [...(table?.querySelectorAll("thead th") || [])].map(th => normalize(th.textContent));
    const rows = [...(table?.querySelectorAll("tbody tr") || [])];
    if (!table || !headers.length || !rows.length) return;

    const indexes = {
      id: headerIndex(headers, "id", 0),
      nom: headerIndex(headers, "nom", 1),
      prenom: headerIndex(headers, "prenom", 2),
      age: headerIndex(headers, "age", 3),
      email: headerIndex(headers, "email", 4),
      phone: headerIndex(headers, "telephone fixe", 5),
      mobile: headerIndex(headers, "telephone mobile", 6)
    };

    const nextEntries = {};

    rows.forEach(row => {
      const cells = [...row.querySelectorAll("td")];
      const email = cellText(cells, indexes.email);
      if (!email || !email.includes("@")) return;

      const html = row.innerHTML;
      const contactId = extractContactIdFromHtml(html) || cellText(cells, indexes.id).replace(/\D+/g, "");
      const contactHref = row.querySelector('a[href*="/contacts/"], a[href*="/admin/contacts/"]')?.getAttribute("href") || "";
      const familyId = html.match(/\/admin\/families\/(\d+)/)?.[1] ||
        html.match(/\/families\/(\d+)/)?.[1] ||
        contactHref.match(/\/families\/(\d+)/)?.[1] ||
        "";

      nextEntries[normalize(email)] = {
        familyId,
        contactId,
        contactUrl: contactHref || (familyId && contactId ? `/admin/families/${familyId}/contacts/${contactId}` : ""),
        nom: cellText(cells, indexes.nom),
        prenom: cellText(cells, indexes.prenom),
        age: cellText(cells, indexes.age),
        email,
        telephone: cellText(cells, indexes.mobile) || cellText(cells, indexes.phone),
        updatedAt: Date.now()
      };
    });

    if (!Object.keys(nextEntries).length) return;

    debugLog("cache lignes visibles contacts", nextEntries);

    FX.storage.get(CONTACTS_VISIBLE_CACHE_KEY)
      .then(cache => FX.storage.set(CONTACTS_VISIBLE_CACHE_KEY, {
        ...(cache || {}),
        ...nextEntries
      }))
      .catch(() => {});
  }

  function enhanceFamilyContactsPage() {
    if (!/\/admin\/families\/\d+\/contacts/.test(location.pathname)) return;

    document.querySelectorAll("table tbody tr").forEach(row => {
      if (row.dataset.fxMmContactReady === "1") return;

      const contactId = extractContactIdFromHtml(row.innerHTML);
      if (!contactId) return;

      row.dataset.fxMmContactReady = "1";

      const actionCell = [...row.querySelectorAll("td")].find(cell => (
        /\/registrations\/new\/ActivitySchedule\/\d+/.test(cell.innerHTML) ||
        /\/registrations\/new\/Adhesion\/\d+/.test(cell.innerHTML) ||
        cell.querySelector("a[href], button")
      )) || row.lastElementChild;

      if (!actionCell) return;

      const tools = document.createElement("span");
      tools.className = "fx-mm-contact-tools";
      tools.innerHTML = `
        <span class="fx-mm-contact-id">ID contact: ${escapeHtml(contactId)}</span>
        <a class="btn btn-xs btn-default" href="/admin/registrations/new/ActivitySchedule/${escapeHtml(contactId)}" target="_blank">Prog</a>
        <a class="btn btn-xs btn-default" href="/admin/registrations/new/Adhesion/${escapeHtml(contactId)}" target="_blank">Adhesion</a>
      `;
      actionCell.appendChild(tools);
    });
  }

  function setupPendingAdhesion() {
    const pending = readStoredJson(PENDING_ADHESION_KEY);
    if (pending && !isFreshPending(pending)) {
      localStorage.removeItem(PENDING_ADHESION_KEY);
      return;
    }
    if (!pending?.contactId || !location.pathname.includes(`/registrations/new/Adhesion/${pending.contactId}`)) return;

    const select = document.querySelector("#registration_orderable_id");
    if (select) {
      chooseSeasonOption(select, pending.seasonId, pending.seasonLabel);
      FX.fireInputEvents(select);
    }

    ensureHelperBanner(
      "fx-mm-adhesion-helper",
      `Adhesion cible : ${pending.label || ""}. Saison ${pending.seasonLabel || ""}.`
    );

    if (pending.clicked) {
      const elapsed = Date.now() - Number(pending.clickedAt || 0);
      if (elapsed < 3500) return;

      pending.clicked = false;
      pending.creationRetries = Number(pending.creationRetries || 0) + 1;
      if (pending.creationRetries > 3) {
        pending.blocked = true;
        pending.blockedReason = "Le bouton de creation adhesion ne declenche pas de navigation.";
        localStorage.setItem(PENDING_ADHESION_KEY, JSON.stringify(pending));
        const workflow = readStoredJson(PENDING_AUTO_KEY);
        if (workflow?.stage === "adhesion" && String(workflow.contactId) === String(pending.contactId)) {
          blockAutoWorkflow(workflow, pending.blockedReason);
        }
        ensureHelperBanner("fx-mm-adhesion-helper", pending.blockedReason);
        return;
      }
      localStorage.setItem(PENDING_ADHESION_KEY, JSON.stringify(pending));
    }

    if (pending.auto && select?.value && !pending.clicked) {
      const button = findSubmitButton("Valider l'enregistrement");
      if (!button) return;

      pending.clicked = true;
      pending.clickedAt = Date.now();
      localStorage.setItem(PENDING_ADHESION_KEY, JSON.stringify(pending));
      setTimeout(() => submitActionButtonWithFallback(button, pending, PENDING_ADHESION_KEY, "creation adhesion"), 400);
    }
  }

  function setupPendingAddressProof() {
    const pending = readStoredJson(PENDING_ADDRESS_KEY);
    if (pending && !isFreshPending(pending)) {
      localStorage.removeItem(PENDING_ADDRESS_KEY);
      return;
    }
    if (!pending?.familyId) return;

    const newPath = `/admin/families/${pending.familyId}/address_proofs/new`;
    const indexPath = `/admin/families/${pending.familyId}/address_proofs`;
    const contactsPath = `/admin/families/${pending.familyId}/contacts`;
    if (pending.blocked && ![indexPath, contactsPath].includes(location.pathname)) return;

    if (location.pathname === newPath) {
      const form = findAddressProofForm(pending.familyId);
      if (!form) {
        ensureHelperBanner("fx-mm-address-helper", "Formulaire justificatif introuvable sur cette page.");
        debugLog("formulaire justificatif introuvable", { familyId: pending.familyId, path: location.pathname });
        return;
      }
      const submittedElapsed = Date.now() - Number(pending.submittedAt || 0);
      if (pending.submitted && submittedElapsed <= 15000) {
        ensureHelperBanner(
          "fx-mm-address-helper",
          `Ajout du justificatif ${pending.seasonLabel || ""} en attente de confirmation Aniapps.`
        );
        if (submittedElapsed > 1200 && !pending.nativeFallbackAt) {
          pending.nativeFallbackAt = Date.now();
          localStorage.setItem(PENDING_ADDRESS_KEY, JSON.stringify(pending));
          submitAddressProofForm(form, pending, true);
        }
        return;
      }
      if (pending.submitted) {
        pending.submitted = false;
        pending.nativeFallbackAt = 0;
        pending.retryCount = Number(pending.retryCount || 0) + 1;
        if (pending.retryCount > 1) {
          pending.blocked = true;
          pending.blockedReason = "Le bouton justificatif ne declenche pas de confirmation Aniapps.";
          localStorage.setItem(PENDING_ADDRESS_KEY, JSON.stringify(pending));
          ensureHelperBanner("fx-mm-address-helper", pending.blockedReason);
          return;
        }
      }

      const select = [...form.querySelectorAll("select")].find(input => (
        input.name?.includes("season") || input.id?.includes("season")
      )) || form.querySelector("select");
      if (select) {
        chooseSeasonOption(select, pending.seasonId, pending.seasonLabel);
        FX.fireInputEvents(select);
      }

      form.querySelectorAll("input[type='checkbox']").forEach(input => {
        if (normalize(input.name + " " + input.id + " " + input.closest("label")?.textContent).includes("email")) {
          input.checked = false;
          FX.fireInputEvents(input);
        }
      });

      pending.submitted = true;
      pending.submittedAt = Date.now();
      pending.nativeFallbackAt = 0;
      localStorage.setItem(PENDING_ADDRESS_KEY, JSON.stringify(pending));
      ensureHelperBanner(
        "fx-mm-address-helper",
        `Ajout du justificatif ${pending.seasonLabel || ""} pour la famille ${pending.familyId}.`
      );
      debugLog("soumission justificatif domicile", pending);
      setTimeout(() => submitAddressProofForm(form, pending, false), 300);
      return;
    }

    if (location.pathname === indexPath && !pending.submitted && !pending.verifying) {
      const addLink = [...document.querySelectorAll("a[href]")]
        .find(link => new URL(link.href, location.origin).pathname === newPath);
      if (addLink) {
        ensureHelperBanner(
          "fx-mm-address-helper",
          `Ouverture du formulaire justificatif ${pending.seasonLabel || ""}.`
        );
        debugLog("ouverture formulaire justificatif depuis index", {
          familyId: pending.familyId,
          href: addLink.href
        });
        simulateUserClick(addLink);
        setTimeout(() => {
          if (location.pathname === indexPath) location.href = newPath;
        }, 500);
        return;
      }
    }

    if ((location.pathname === indexPath || location.pathname === contactsPath) && !pending.verifying) {
      pending.verifying = true;
      pending.blocked = false;
      pending.blockedReason = "";
      localStorage.setItem(PENDING_ADDRESS_KEY, JSON.stringify(pending));
      verifyPendingAddressProof(pending).catch(error => {
        pending.blocked = true;
        pending.blockedReason = error.message || String(error);
        pending.verifying = false;
        localStorage.setItem(PENDING_ADDRESS_KEY, JSON.stringify(pending));
        const workflow = readStoredJson(PENDING_AUTO_KEY);
        if (workflow?.stage === "address" && String(workflow.familyId) === String(pending.familyId)) {
          blockAutoWorkflow(workflow, `justificatif non confirme pour ${workflow.adherent || pending.label || "le contact"}`);
        }
        ensureHelperBanner("fx-mm-address-helper", `Justificatif non confirme : ${pending.blockedReason}`);
      });
    }
  }

  function findAddressProofForm(familyId) {
    const expectedPath = `/admin/families/${familyId}/address_proofs`;
    const forms = [...document.querySelectorAll("form")];
    return forms.find(form => {
      const action = form.getAttribute("action") || "";
      if (!action) return false;
      try {
        return new URL(action, location.origin).pathname === expectedPath;
      } catch (error) {
        return action === expectedPath;
      }
    }) || forms.find(form => normalize(form.id + " " + form.className).includes("address_proof"));
  }

  function submitAddressProofForm(form, pending, nativeOnly) {
    const freshForm = findAddressProofForm(pending.familyId) || form;
    const submit = freshForm.querySelector("input[type='submit'], button[type='submit']");
    const newPath = `/admin/families/${pending.familyId}/address_proofs/new`;

    if (submit) restoreSubmitButton(submit);

    if (!nativeOnly && submit) {
      debugLog("clic justificatif domicile", {
        familyId: pending.familyId,
        seasonId: pending.seasonId,
        seasonLabel: pending.seasonLabel,
        submitText: submit.value || submit.textContent || ""
      });
      simulateUserClick(submit);
    }

    setTimeout(() => {
      if (location.pathname !== newPath) return;
      const currentForm = findAddressProofForm(pending.familyId) || freshForm;
      const currentSubmit = currentForm.querySelector("input[type='submit'], button[type='submit']");
      if (currentSubmit) restoreSubmitButton(currentSubmit);
      debugLog("fallback requestSubmit justificatif domicile", {
        familyId: pending.familyId,
        seasonId: pending.seasonId,
        seasonLabel: pending.seasonLabel
      });
      if (currentForm.requestSubmit && currentSubmit) {
        currentForm.requestSubmit(currentSubmit);
      } else {
        nativeSubmitForm(currentForm, currentSubmit);
      }
    }, nativeOnly ? 150 : 1200);

    setTimeout(() => {
      if (location.pathname !== newPath) return;
      const currentForm = findAddressProofForm(pending.familyId) || freshForm;
      const currentSubmit = currentForm.querySelector("input[type='submit'], button[type='submit']");
      if (currentSubmit) restoreSubmitButton(currentSubmit);
      debugLog("fallback native submit justificatif domicile", {
        familyId: pending.familyId,
        seasonId: pending.seasonId,
        seasonLabel: pending.seasonLabel
      });
      nativeSubmitForm(currentForm, currentSubmit);
    }, nativeOnly ? 900 : 3000);
  }

  function restoreSubmitButton(button) {
    button.disabled = false;
    button.removeAttribute("disabled");
    button.removeAttribute("aria-disabled");
    button.classList.remove("disabled");
  }

  function simulateUserClick(element) {
    element.scrollIntoView({ block: "center", inline: "center" });
    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
    }

    const common = { bubbles: true, cancelable: true, view: window };
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(type => {
      const event = type.startsWith("pointer") && window.PointerEvent
        ? new PointerEvent(type, { ...common, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 })
        : new MouseEvent(type, { ...common, button: 0 });
      element.dispatchEvent(event);
    });
    element.click();
  }

  function nativeSubmitForm(form, submit) {
    if (submit?.name) {
      let hidden = form.querySelector("input[data-fx-mm-submit-fallback='1']");
      if (!hidden) {
        hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.setAttribute("data-fx-mm-submit-fallback", "1");
        form.appendChild(hidden);
      }
      hidden.name = submit.name;
      hidden.value = submit.value || submit.textContent || "";
    }

    HTMLFormElement.prototype.submit.call(form);
  }

  async function verifyPendingAddressProof(pending) {
    const family = await fetchFamilyMembers(pending.familyId, pending.seasonLabel);
    const validated = Boolean(family.info?.addressProofValidated);
    debugLog("verification justificatif domicile", {
      pending,
      validated,
      familyInfo: family.info
    });

    if (!validated) {
      throw new Error("Aniapps ne renvoie pas le justificatif comme valide.");
    }

    localStorage.removeItem(PENDING_ADDRESS_KEY);
    const workflow = readStoredJson(PENDING_AUTO_KEY);
    if (workflow?.stage === "address" && String(workflow.familyId) === String(pending.familyId)) {
      workflow.needsAddressProof = false;
      markWorkflowTransition(workflow);
      ensureHelperBanner("fx-mm-address-helper", "Justificatif valide. Passage a l'etape suivante.");
      setTimeout(() => {
        launchAutoWorkflow(workflow, false).catch(error => {
          blockAutoWorkflow(workflow, error.message || String(error));
        });
      }, AUTO_STEP_DELAY);
    } else {
      ensureHelperBanner("fx-mm-address-helper", "Justificatif valide.");
    }
  }

  async function setupPendingSchedule() {
    const pending = readStoredJson(PENDING_SCHEDULE_KEY);
    if (pending && !isFreshPending(pending)) {
      localStorage.removeItem(PENDING_SCHEDULE_KEY);
      return;
    }
    if (!pending?.contactId || !location.pathname.includes(`/registrations/new/ActivitySchedule/${pending.contactId}`)) return;

    const query = pending.searchQuery || pending.label || "";
    const input = document.querySelector("#DataTables_Table_1_filter input[type='search'], #DataTables_Table_2_filter input[type='search'], .dataTables_filter input[type='search']");
    if (input && (input.value !== query || !pending.searchApplied)) {
      applyDataTableSearch(input, query);
      pending.searchApplied = true;
      pending.searchAppliedAt = Date.now();
      localStorage.setItem(PENDING_SCHEDULE_KEY, JSON.stringify(pending));
      return;
    }

    highlightScheduleRows(pending.label || query);
    ensureHelperBanner(
      "fx-mm-schedule-helper",
      `Programmation cible : ${pending.label || query}.`
    );

    if (pending.auto && !pending.clicked && Date.now() - Number(pending.searchAppliedAt || 0) > 700) {
      const match = findBestScheduleRow(pending);
      const row = match?.row || null;
      const addButton = row ? [...row.querySelectorAll("a, button, input[type='submit']")].find(el => (
        normalize(el.textContent || el.value || "").includes("ajouter") &&
        !normalize(el.textContent || el.value || "").includes("attente")
      )) : null;

      if (addButton) {
        const actionUrl = extractActionUrl(addButton);
        pending.clicked = true;
        pending.chosenRow = cleanText(row.textContent || "").slice(0, 240);
        pending.expectedActivityScheduleId = extractOrderableIdFromRegistrationAction(actionUrl) || match.orderableId || "";
        pending.expectedScheduleText = match.label || pending.chosenRow;
        pending.selectionScore = match.score;
        localStorage.setItem(PENDING_SCHEDULE_KEY, JSON.stringify(pending));
        debugLog("programmation ligne choisie", {
          pending,
          row: pending.chosenRow,
          actionUrl,
          verification: match
        });
        try {
          submitScheduleRegistrationForm(actionUrl, pending);
        } catch (error) {
          pending.blocked = true;
          pending.blockedReason = error?.message || String(error);
          localStorage.setItem(PENDING_SCHEDULE_KEY, JSON.stringify(pending));
          ensureHelperBanner(
            "fx-mm-schedule-helper",
            `Creation bloquee : ${pending.blockedReason}`
          );
          debugLog("creation programmation bloquee", { error: pending.blockedReason, pending });
        }
      } else {
        debugLog("programmation non cliquee verification insuffisante", {
          pending,
          meilleur: match || null
        });
        ensureHelperBanner(
          "fx-mm-schedule-helper",
          `Programmation cible : ${pending.label || query}. Aucun resultat assez fiable pour cliquer automatiquement.`
        );
      }
    }
  }

  function pendingRegistrationFromWorkflow(pendingSchedule, pendingAdhesion) {
    const workflow = readStoredJson(PENDING_AUTO_KEY);
    if (workflow?.contactId && !workflow.blocked && isAutoWorkflowRelevantPage(workflow)) {
      if (workflow.stage === "adhesion") {
        localStorage.removeItem(PENDING_SCHEDULE_KEY);
        if (pendingAdhesion?.auto && String(pendingAdhesion.contactId) === String(workflow.contactId)) {
          return { pending: pendingAdhesion, isSchedule: false, key: PENDING_ADHESION_KEY };
        }
        return recoverAdhesionPendingFromWorkflow(workflow);
      }

      if (workflow.stage === "schedule") {
        localStorage.removeItem(PENDING_ADHESION_KEY);
        if (pendingSchedule?.auto && String(pendingSchedule.contactId) === String(workflow.contactId)) {
          return { pending: pendingSchedule, isSchedule: true, key: PENDING_SCHEDULE_KEY };
        }
        return recoverSchedulePendingFromWorkflow(workflow);
      }
    }

    const pageKind = registrationPageKind();
    if (pageKind === "adhesion") {
      localStorage.removeItem(PENDING_SCHEDULE_KEY);
      if (pendingAdhesion?.auto) return { pending: pendingAdhesion, isSchedule: false, key: PENDING_ADHESION_KEY };
      return { pending: null, isSchedule: false, key: "" };
    }
    if (pageKind === "schedule") {
      localStorage.removeItem(PENDING_ADHESION_KEY);
      if (pendingSchedule?.auto) return { pending: pendingSchedule, isSchedule: true, key: PENDING_SCHEDULE_KEY };
      return { pending: null, isSchedule: true, key: "" };
    }

    if (pendingSchedule?.auto) {
      return { pending: pendingSchedule, isSchedule: true, key: PENDING_SCHEDULE_KEY };
    }
    if (pendingAdhesion?.auto) {
      return { pending: pendingAdhesion, isSchedule: false, key: PENDING_ADHESION_KEY };
    }
    return { pending: null, isSchedule: false, key: "" };
  }

  function recoverAdhesionPendingFromWorkflow(workflow) {
    const pending = {
      ...(workflow.adhesion || {}),
      contactId: workflow.contactId,
      seasonId: workflow.seasonId || workflow.adhesion?.seasonId || "",
      seasonLabel: workflow.seasonLabel || workflow.adhesion?.seasonLabel || "",
      label: workflow.adherent || workflow.label || workflow.adhesion?.label || "",
      auto: true,
      workflow: true,
      recovered: true,
      createdAt: Date.now()
    };
    localStorage.setItem(PENDING_ADHESION_KEY, JSON.stringify(pending));
    debugLog("pending adhesion restaure depuis workflow", pending);
    return { pending, isSchedule: false, key: PENDING_ADHESION_KEY };
  }

  function recoverSchedulePendingFromWorkflow(workflow) {
    const pending = {
      ...(workflow.schedule || {}),
      contactId: workflow.contactId,
      label: workflow.label || workflow.schedule?.label || "",
      searchQuery: workflow.schedule?.searchQuery || workflow.label || "",
      type: workflow.type || workflow.schedule?.type || "",
      day: workflow.schedule?.day || workflow.slot?.dayLabel || "",
      hour: workflow.schedule?.hour || minutesToLabel(workflow.slot?.start || 0),
      suffix: workflow.schedule?.suffix || professorSuffix(workflow.rawProf || ""),
      instrument: workflow.instrument || workflow.schedule?.instrument || "",
      adherent: workflow.adherent || workflow.schedule?.adherent || "",
      seasonId: workflow.seasonId || workflow.schedule?.seasonId || "",
      seasonLabel: workflow.seasonLabel || workflow.schedule?.seasonLabel || "",
      auto: true,
      workflow: true,
      recovered: true,
      createdAt: Date.now()
    };
    localStorage.setItem(PENDING_SCHEDULE_KEY, JSON.stringify(pending));
    debugLog("pending programmation restaure depuis workflow", pending);
    return { pending, isSchedule: true, key: PENDING_SCHEDULE_KEY };
  }

  function registrationPageKind() {
    const text = normalize([
      document.querySelector(".page-heading")?.textContent || "",
      document.querySelector("h1, h2")?.textContent || "",
      document.querySelector(".registration-form")?.textContent || "",
      document.querySelector(".row.mb-lg, .row.m-b-lg, .table.small")?.textContent || ""
    ].join(" "));
    if (text.includes("adhesion")) return "adhesion";
    if (text.includes("programmation") || text.includes("activite")) return "schedule";
    return "";
  }

  function setupPendingRegistrationValidation() {
    if (!/\/admin\/registrations\/\d+(\/edit)?$/.test(location.pathname)) return;

    const pendingSchedule = readStoredJson(PENDING_SCHEDULE_KEY);
    const pendingAdhesion = readStoredJson(PENDING_ADHESION_KEY);
    let registrationPending = pendingRegistrationFromWorkflow(pendingSchedule, pendingAdhesion);
    let { pending, isSchedule, key } = registrationPending;
    if (pending && !isFreshPending(pending)) {
      localStorage.removeItem(PENDING_SCHEDULE_KEY);
      localStorage.removeItem(PENDING_ADHESION_KEY);
      registrationPending = pendingRegistrationFromWorkflow(null, null);
      pending = registrationPending.pending;
      isSchedule = registrationPending.isSchedule;
      key = registrationPending.key;
    }
    if (!pending || pending.blocked) return;

    if (pending.validating) {
      const elapsed = Date.now() - Number(pending.validatingAt || 0);
      if (!/\/edit$/.test(location.pathname)) {
        pending.validating = false;
        pending.validatingAt = 0;
        localStorage.setItem(key, JSON.stringify(pending));
      } else if (elapsed < 3500) {
        return;
      } else {
        pending.validating = false;
        pending.validationRetries = Number(pending.validationRetries || 0) + 1;
        if (pending.validationRetries > 3) {
          pending.blocked = true;
          pending.blockedReason = "Le bouton Valider l'enregistrement ne declenche pas de navigation.";
          localStorage.setItem(key, JSON.stringify(pending));
          const workflow = readStoredJson(PENDING_AUTO_KEY);
          if (workflow?.contactId && String(workflow.contactId) === String(pending.contactId)) {
            blockAutoWorkflow(workflow, pending.blockedReason);
          }
          ensureHelperBanner("fx-mm-validation-helper", pending.blockedReason);
          return;
        }
        localStorage.setItem(key, JSON.stringify(pending));
        debugLog("retry validation enregistrement", {
          retry: pending.validationRetries,
          contactId: pending.contactId,
          label: pending.label
        });
      }
    }

    if (isSchedule) {
      const check = verifyRegistrationPageAgainstPendingSchedule(pending);
      debugLog("verification fiche programmation", check);

      if (!check.ok) {
        pending.blocked = true;
        pending.blockedReason = check.reason;
        localStorage.setItem(PENDING_SCHEDULE_KEY, JSON.stringify(pending));
        const workflow = readStoredJson(PENDING_AUTO_KEY);
        if (workflow?.stage === "schedule" && String(workflow.contactId) === String(pending.contactId)) {
          blockAutoWorkflow(workflow, check.reason);
        }
        ensureHelperBanner(
          "fx-mm-validation-helper",
          `Validation bloquee : ${check.reason}. Attendu : ${pending.label || ""}. Lu : ${check.actualLabel || "non lu"}.`
        );
        return;
      }

      if (!/\/edit$/.test(location.pathname)) {
        localStorage.removeItem(PENDING_SCHEDULE_KEY);
        ensureHelperBanner(
          "fx-mm-validation-helper",
          `Programmation confirmee : ${check.actualLabel || pending.label || ""}.`
        );
        const workflow = readStoredJson(PENDING_AUTO_KEY);
        if (workflow?.stage === "schedule" && String(workflow.contactId) === String(pending.contactId)) {
          setTimeout(() => confirmAutoWorkflowStage(workflow, "schedule"), 300);
        }
        return;
      }
    }

    const button = findSubmitButton("Valider l'enregistrement");
    if (!button) return;

    pending.validating = true;
    pending.validatingAt = Date.now();
    localStorage.setItem(key, JSON.stringify(pending));
    ensureHelperBanner("fx-mm-validation-helper", "Verification OK. Validation automatique de l'enregistrement en cours.");
    setTimeout(() => submitRegistrationValidation(button, pending, key), 500);
  }

  function submitRegistrationValidation(button, pending, key) {
    const path = location.pathname;
    const form = button.closest("form") ||
      document.querySelector("form[id^='edit_registration'], form.registration-form, form[action*='/admin/registrations/']");

    restoreSubmitButton(button);
    debugLog("clic validation enregistrement", {
      contactId: pending.contactId,
      label: pending.label,
      key,
      path
    });
    simulateUserClick(button);

    setTimeout(() => {
      if (location.pathname !== path || !/\/edit$/.test(location.pathname)) return;
      const stored = readStoredJson(key);
      if (!stored?.validating) return;

      const currentButton = findSubmitButton("Valider l'enregistrement") || button;
      const currentForm = currentButton.closest("form") || form;
      if (!currentForm) return;

      restoreSubmitButton(currentButton);
      debugLog("fallback validation enregistrement", {
        contactId: pending.contactId,
        label: pending.label,
        key,
        path
      });

      if (currentForm.requestSubmit && currentButton) {
        currentForm.requestSubmit(currentButton);
      } else {
        nativeSubmitForm(currentForm, currentButton);
      }
    }, 1500);

    setTimeout(() => {
      if (location.pathname !== path || !/\/edit$/.test(location.pathname)) return;
      const stored = readStoredJson(key);
      if (!stored?.validating) return;

      const currentButton = findSubmitButton("Valider l'enregistrement") || button;
      const currentForm = currentButton.closest("form") || form;
      if (!currentForm) return;

      restoreSubmitButton(currentButton);
      debugLog("fallback natif validation enregistrement", {
        contactId: pending.contactId,
        label: pending.label,
        key,
        path
      });
      nativeSubmitForm(currentForm, currentButton);
    }, 3000);
  }

  function submitActionButtonWithFallback(button, pending, key, label) {
    const path = location.pathname;
    const form = button.closest("form") || document.querySelector("form");

    restoreSubmitButton(button);
    debugLog(`clic ${label}`, {
      contactId: pending.contactId,
      familyId: pending.familyId,
      pendingLabel: pending.label,
      path
    });
    simulateUserClick(button);

    setTimeout(() => {
      if (location.pathname !== path) return;
      const stored = readStoredJson(key);
      if (!stored?.clicked) return;

      const currentButton = findSubmitButton("Valider l'enregistrement") ||
        findSubmitButton("Ajouter le justificatif de domicile") ||
        button;
      const currentForm = currentButton.closest("form") || form;
      if (!currentForm) return;

      restoreSubmitButton(currentButton);
      debugLog(`fallback ${label}`, {
        contactId: pending.contactId,
        familyId: pending.familyId,
        pendingLabel: pending.label,
        path
      });

      if (currentForm.requestSubmit && currentButton) {
        currentForm.requestSubmit(currentButton);
      } else {
        nativeSubmitForm(currentForm, currentButton);
      }
    }, 1500);

    setTimeout(() => {
      if (location.pathname !== path) return;
      const stored = readStoredJson(key);
      if (!stored?.clicked) return;

      const currentButton = findSubmitButton("Valider l'enregistrement") ||
        findSubmitButton("Ajouter le justificatif de domicile") ||
        button;
      const currentForm = currentButton.closest("form") || form;
      if (!currentForm) return;

      restoreSubmitButton(currentButton);
      debugLog(`fallback natif ${label}`, {
        contactId: pending.contactId,
        familyId: pending.familyId,
        pendingLabel: pending.label,
        path
      });
      nativeSubmitForm(currentForm, currentButton);
    }, 3000);
  }

  function setupPendingAutoWorkflow() {
    const workflow = readStoredJson(PENDING_AUTO_KEY);
    if (workflow && !isFreshPending(workflow)) {
      localStorage.removeItem(PENDING_AUTO_KEY);
      localStorage.removeItem(PENDING_AUTO_QUEUE_KEY);
      return;
    }
    if (!workflow?.contactId) return;
    if (workflow.blocked) {
      if (isAutoAllWorkflow(workflow)) {
        failAutoWorkflowAndContinue(workflow, workflow.blockedReason || "verification impossible");
        return;
      }
      ensureHelperBanner("fx-mm-auto-helper", `Auto tous interrompu : ${workflow.blockedReason || "verification impossible"}`);
      return;
    }
    if (!isAutoWorkflowRelevantPage(workflow)) return;
    if (/\/edit$/.test(location.pathname)) {
      ensureHelperBanner(
        "fx-mm-auto-helper",
        `Auto en attente de validation : ${workflow.adherent || workflow.label || "enregistrement"}.`
      );
      return;
    }
    if (resumeExpiredTransition(workflow)) return;

    if (workflow.stage === "address") return;

    if (!/\/admin\/registrations\/\d+$/.test(location.pathname)) return;

    if (workflow.stage === "adhesion") {
      confirmAutoWorkflowStage(workflow, "adhesion");
      return;
    }

    if (workflow.stage === "schedule" && !readStoredJson(PENDING_SCHEDULE_KEY)) {
      confirmAutoWorkflowStage(workflow, "schedule");
    }
  }

  function isAutoWorkflowRelevantPage(workflow) {
    if (!workflow?.stage) return false;

    const path = location.pathname;
    if (workflow.stage === "address") {
      return path === `/admin/families/${workflow.familyId}/address_proofs/new` ||
        path === `/admin/families/${workflow.familyId}/address_proofs` ||
        path === `/admin/families/${workflow.familyId}/contacts`;
    }

    if (workflow.stage === "adhesion") {
      return path.includes(`/registrations/new/Adhesion/${workflow.contactId}`) ||
        /\/admin\/registrations\/\d+(\/edit)?$/.test(path);
    }

    if (workflow.stage === "schedule") {
      return path.includes(`/registrations/new/ActivitySchedule/${workflow.contactId}`) ||
        /\/admin\/registrations\/\d+(\/edit)?$/.test(path);
    }

    return false;
  }

  function confirmAutoWorkflowStage(workflow, stage) {
    if (workflow.blocked) return;
    if (workflow.verifyingStep === stage) {
      const age = Date.now() - Number(workflow.verifyingAt || 0);
      if (age < (AUTO_CONFIRM_ATTEMPTS * AUTO_CONFIRM_WAIT) + 5000) return;

      workflow.verifyingStep = "";
      workflow.verifyingAt = 0;
      localStorage.setItem(PENDING_AUTO_KEY, JSON.stringify(workflow));
      debugLog("reprise verification auto expiree", {
        stage,
        contactId: workflow.contactId,
        familyId: workflow.familyId,
        label: workflow.label
      });
    }

    workflow.verifyingStep = stage;
    workflow.verifyingAt = Date.now();
    workflow.createdAt = Date.now();
    localStorage.setItem(PENDING_AUTO_KEY, JSON.stringify(workflow));

    ensureHelperBanner(
      "fx-mm-auto-helper",
      stage === "adhesion"
        ? `Verification de l'adhesion pour ${workflow.adherent || "le contact"}.`
        : `Verification de la programmation : ${workflow.label || ""}.`
    );

    setTimeout(async () => {
      try {
        const confirmed = await waitForWorkflowStageConfirmation(workflow, stage);
        const latest = readStoredJson(PENDING_AUTO_KEY);
        if (!latest || String(latest.contactId) !== String(workflow.contactId) || latest.stage !== stage) return;

        latest.verifyingStep = "";
        latest.verifyingAt = 0;
        latest.createdAt = Date.now();

        if (stage === "adhesion") {
          localStorage.removeItem(PENDING_ADHESION_KEY);
          latest.needsAdhesion = !confirmed;
          ensureHelperBanner(
            "fx-mm-auto-helper",
            confirmed
              ? `Adhesion confirmee. Passage a la programmation : ${latest.label || ""}.`
              : `Adhesion non confirmee pour ${latest.adherent || "le contact"}. Auto interrompu.`
          );
          if (confirmed) {
            markWorkflowTransition(latest);
            setTimeout(() => {
              launchAutoWorkflow(latest, false).catch(error => {
                blockAutoWorkflow(latest, error.message || String(error));
              });
            }, AUTO_STEP_DELAY);
          } else {
            blockAutoWorkflow(latest, `adhesion non confirmee pour ${latest.adherent || "le contact"}`);
          }
          return;
        }

        if (stage === "schedule") {
          localStorage.removeItem(PENDING_SCHEDULE_KEY);
          latest.needsSchedule = !confirmed;
          ensureHelperBanner(
            "fx-mm-auto-helper",
            confirmed
              ? `Programmation confirmee pour ${latest.adherent || "le contact"}. Passage au suivant.`
              : `Programmation non confirmee pour ${latest.adherent || "le contact"}. Auto interrompu.`
          );
          if (confirmed) {
            markWorkflowTransition(latest);
            setTimeout(() => launchNextAutoWorkflow(false), AUTO_STEP_DELAY);
          } else {
            blockAutoWorkflow(latest, `programmation non confirmee pour ${latest.adherent || "le contact"}`);
          }
        }
      } catch (error) {
        const latest = readStoredJson(PENDING_AUTO_KEY) || workflow;
        latest.verifyingStep = "";
        latest.verifyingAt = 0;
        latest.transitioning = false;
        latest.transitionAt = 0;
        blockAutoWorkflow(latest, error.message || String(error));
      }
    }, 900);
  }

  async function waitForWorkflowStageConfirmation(workflow, stage) {
    for (let attempt = 1; attempt <= AUTO_CONFIRM_ATTEMPTS; attempt += 1) {
      const registrations = await fetchFamilyRegistrations(workflow.familyId);
      const row = rowFromWorkflow(workflow);
      const confirmed = hasMatchingRegistration(
        registrations,
        row,
        stage === "adhesion" ? "adhesion" : "schedule"
      );
      debugLog("verification etape auto", {
        stage,
        attempt,
        confirmed,
        contactId: workflow.contactId,
        familyId: workflow.familyId,
        label: workflow.label
      });
      if (confirmed) return true;
      await FX.wait(AUTO_CONFIRM_WAIT);
    }

    return false;
  }

  function rowFromWorkflow(workflow) {
    const adherentParts = cleanText(workflow.adherent || "").split(" ").filter(Boolean);
    return {
      nom: workflow.nom || adherentParts.slice(1).join(" "),
      prenom: workflow.prenom || adherentParts[0] || "",
      label: workflow.label || "",
      slot: workflow.slot || workflow.schedule?.slot || null,
      rawProf: workflow.rawProf || workflow.schedule?.rawProf || "",
      type: workflow.type || workflow.schedule?.type || "",
      instrument: workflow.instrument || workflow.schedule?.instrument || "",
      seasonLabel: workflow.seasonLabel || workflow.schedule?.seasonLabel || ""
    };
  }

  function chooseSeasonOption(select, seasonId, seasonLabel) {
    const options = [...select.options];
    const byId = options.find(option => option.value === String(seasonId || ""));
    if (byId) {
      select.value = byId.value;
      return;
    }

    const label = normalize(seasonLabel || "");
    const years = label.match(/(\d{4})\s*-\s*(\d{4})/);
    const short = years ? `${years[1].slice(2)}-${years[2].slice(2)}` : "";
    const byLabel = options.find(option => {
      const text = normalize(option.textContent || "");
      return (label && text.includes(label.replace(/^saison\s+/, ""))) ||
        (short && text.includes(short));
    });
    if (byLabel) select.value = byLabel.value;
  }

  function isFreshPending(pending) {
    return Date.now() - Number(pending.createdAt || 0) < 1000 * 60 * 10;
  }

  function clickSubmitButton(label) {
    const button = findSubmitButton(label);
    if (button) button.click();
  }

  function findSubmitButton(label) {
    const wanted = normalize(label);
    return [...document.querySelectorAll("input[type='submit'], button[type='submit'], button, input.btn")]
      .find(button => normalize(button.value || button.textContent || "").includes(wanted));
  }

  function submitScheduleRegistrationForm(actionUrl, pending) {
    if (!actionUrl) throw new Error("URL d'ajout de programmation introuvable.");

    ensureHelperBanner(
      "fx-mm-schedule-helper",
      `Programmation verifiee. Creation de l'inscription : ${pending.label || ""}.`
    );

    const form = document.createElement("form");
    form.method = "post";
    form.action = actionUrl;
    form.style.display = "none";
    form.setAttribute("data-turbolinks", "false");

    const utf8 = document.createElement("input");
    utf8.type = "hidden";
    utf8.name = "utf8";
    utf8.value = "✓";
    form.appendChild(utf8);

    const token = csrfTokenFromDoc(document);
    if (token) {
      const csrf = document.createElement("input");
      csrf.type = "hidden";
      csrf.name = "authenticity_token";
      csrf.value = token;
      form.appendChild(csrf);
    }

    document.body.appendChild(form);
    debugLog("soumission formulaire programmation", {
      actionUrl,
      expectedActivityScheduleId: pending.expectedActivityScheduleId,
      expectedLabel: pending.label
    });
    form.submit();
  }

  function applyDataTableSearch(input, query) {
    const pulsedQuery = `${query} `;
    setNativeInputValue(input, pulsedQuery);
    input.focus();
    FX.fireInputEvents(input);

    ["keydown", "keypress", "keyup"].forEach(type => {
      input.dispatchEvent(new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key: " ",
        code: "Space"
      }));
    });
    input.dispatchEvent(new Event("search", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    setTimeout(() => {
      setNativeInputValue(input, query);
      FX.fireInputEvents(input);
      input.dispatchEvent(new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        key: "Backspace",
        code: "Backspace"
      }));
    }, 60);

    triggerDataTableSearch(input, pulsedQuery);
    setTimeout(() => triggerDataTableSearch(input, query), 150);
    setTimeout(() => triggerDataTableSearch(input, query), 500);
  }

  function setNativeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }
  }

  function triggerDataTableSearch(input, query) {
    const $ = window.jQuery || window.$;
    const table = input.closest(".dataTables_wrapper")?.querySelector("table.dataTable");
    if (!$ || !table || !$.fn?.DataTable) return false;

    try {
      $(table).DataTable().search(query).draw();
      debugLog("recherche datatable declenchee", { table: table.id, query });
      return true;
    } catch (error) {
      debugLog("recherche datatable impossible", { message: error?.message || String(error) });
      return false;
    }
  }

  function extractActionUrl(element) {
    if (!element) return "";

    const href = element.getAttribute?.("href") || "";
    if (href && href !== "#") {
      try {
        return new URL(href.replace(/&amp;/g, "&"), location.origin).toString();
      } catch {
        return href.replace(/&amp;/g, "&");
      }
    }

    const formAction = element.form?.getAttribute?.("action") || element.closest?.("form")?.getAttribute?.("action") || "";
    if (!formAction) return "";

    try {
      return new URL(formAction.replace(/&amp;/g, "&"), location.origin).toString();
    } catch {
      return formAction.replace(/&amp;/g, "&");
    }
  }

  function extractOrderableIdFromRegistrationAction(actionUrl) {
    const source = String(actionUrl || "").replace(/&amp;/g, "&");
    if (!source) return "";

    try {
      const url = new URL(source, location.origin);
      const direct = url.searchParams.get("registration[orderable_id]");
      if (direct) return cleanText(direct);

      for (const [key, value] of url.searchParams.entries()) {
        if (key === "registration[orderable_id]" || key.includes("orderable_id")) {
          return cleanText(value);
        }
      }
    } catch {
      // Fallback below handles partial URLs.
    }

    const match = source.match(/registration(?:%5B|\[)orderable_id(?:%5D|\])=([^&]+)/i);
    return match ? cleanText(decodeURIComponent(match[1].replace(/\+/g, " "))) : "";
  }

  function extractActivityScheduleIdFromPage() {
    const link = document.querySelector("a[href*='/admin/activity_schedules/']");
    const href = link?.getAttribute("href") || "";
    return href.match(/\/admin\/activity_schedules\/(\d+)/)?.[1] || "";
  }

  function readRegistrationScheduleInfo() {
    const wrapper = document.querySelector("#page-wrapper") || document.body;
    const scheduleLink = wrapper.querySelector("a[href*='/admin/activity_schedules/']");
    const href = scheduleLink?.getAttribute("href") || "";
    const heading = cleanText(wrapper.querySelector(".page-heading h2, h2")?.textContent || "");
    const linkLabel = cleanText(scheduleLink?.textContent || "");
    const headingLabel = heading.match(/\bpour\s+(.+)$/i)?.[1] || "";

    return {
      activityScheduleId: href.match(/\/admin\/activity_schedules\/(\d+)/)?.[1] || extractActivityScheduleIdFromPage(),
      label: linkLabel || cleanText(headingLabel),
      heading,
      text: normalize([linkLabel, headingLabel, heading].filter(Boolean).join(" "))
    };
  }

  function scheduleTextCheckFromPending(pending, actualText) {
    const text = normalize(actualText || "");
    const instrumentTokens = significantTokens(pending.instrument || pending.label || "").slice(0, 3);
    const suffix = normalize(pending.suffix || "");
    const day = normalize(pending.day || "");
    const hour = normalize(pending.hour || "").replace(/h00$/, "h");
    const wantsCollective = normalize(pending.type || pending.label || "").includes("coll");
    const wantsIndividual = normalize(pending.type || pending.label || "").includes("individuel");
    const rowIsCollective = text.includes("collectif") || /\bcoll\b/.test(text);
    const rowIsIndividual = text.includes("individuel");

    const missing = [];
    if (instrumentTokens.length && !instrumentTokens.some(token => text.includes(token))) missing.push("instrument");
    if (day && !text.includes(day)) missing.push("jour");
    if (hour && !timeTextIncludes(text, hour)) missing.push("heure");
    if (suffix && !text.includes(suffix)) missing.push("suffixe prof");
    if (wantsCollective && !rowIsCollective) missing.push("type coll");
    if (wantsIndividual && !rowIsIndividual) missing.push("type individuel");

    return {
      ok: missing.length === 0,
      missing,
      text
    };
  }

  function verifyRegistrationPageAgainstPendingSchedule(pending) {
    const actual = readRegistrationScheduleInfo();
    const expectedId = cleanText(pending.expectedActivityScheduleId || "");
    const actualId = cleanText(actual.activityScheduleId || "");
    const textCheck = scheduleTextCheckFromPending(pending, actual.text || actual.label || actual.heading);
    const pageText = normalize((document.querySelector("#page-wrapper") || document.body).textContent || "");
    const adherentTokens = significantTokens(pending.adherent || "");
    const adherentOk = !adherentTokens.length || adherentTokens.every(token => pageText.includes(token));

    if (expectedId && actualId && expectedId !== actualId) {
      return {
        ok: false,
        reason: `ID programmation differente (${actualId} au lieu de ${expectedId})`,
        expectedId,
        actualId,
        actualLabel: actual.label,
        actual
      };
    }

    if (expectedId && !actualId) {
      return {
        ok: false,
        reason: "ID programmation introuvable sur la fiche",
        expectedId,
        actualId,
        actualLabel: actual.label,
        actual
      };
    }

    if (!textCheck.ok) {
      return {
        ok: false,
        reason: `criteres manquants (${textCheck.missing.join(", ")})`,
        expectedId,
        actualId,
        actualLabel: actual.label,
        actual,
        textCheck
      };
    }

    if (!adherentOk) {
      return {
        ok: false,
        reason: "adherent different de la ligne du cahier",
        expectedId,
        actualId,
        actualLabel: actual.label,
        actual
      };
    }

    return {
      ok: true,
      expectedId,
      actualId,
      actualLabel: actual.label,
      actual,
      textCheck
    };
  }

  function findBestScheduleRow(pending) {
    const rows = [...document.querySelectorAll("table[data-datatable='activity-schedules'] tbody tr, table.dataTable tbody tr")]
      .filter(row => cleanText(row.textContent || ""));
    const scored = rows
      .map(row => evaluateVisibleScheduleRow(pending, row))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    debugLog("programmations visibles scorees", scored.map(item => ({
      score: item.score,
      allowed: item.allowed,
      missing: item.missing,
      orderableId: item.orderableId,
      text: item.text.slice(0, 220)
    })));

    return scored.find(item => item.allowed) || null;
  }

  function scoreVisibleScheduleRow(pending, row) {
    return evaluateVisibleScheduleRow(pending, row).score;
  }

  function evaluateVisibleScheduleRow(pending, row) {
    const cells = [...row.querySelectorAll("td")];
    const label = cleanText(cells[0]?.textContent || "");
    const labelText = normalize(label);
    const details = cleanText(cells[7]?.textContent || "");
    const detailsText = normalize(details);
    const fullText = normalize(row.textContent || "");
    const actionText = normalize(cells[cells.length - 1]?.textContent || "");
    const action = [...row.querySelectorAll("a, button, input[type='submit']")].find(el => (
      normalize(el.textContent || el.value || "").includes("ajouter") &&
      !normalize(el.textContent || el.value || "").includes("attente")
    ));
    const actionUrl = extractActionUrl(action);

    if (!fullText || actionText.includes("non disponible")) {
      return {
        row,
        score: 0,
        allowed: false,
        missing: ["action"],
        orderableId: "",
        label,
        text: cleanText(row.textContent || "")
      };
    }

    let score = 0;
    const instrumentTokens = significantTokens(pending.instrument || pending.label || "").slice(0, 3);
    const suffix = normalize(pending.suffix || "");
    const day = normalize(pending.day || "");
    const hour = normalize(pending.hour || "").replace(/h00$/, "h");
    const wantsCollective = normalize(pending.type || pending.label || "").includes("coll");
    const wantsIndividual = normalize(pending.type || pending.label || "").includes("individuel");
    const hasInstrument = !instrumentTokens.length || instrumentTokens.some(token => fullText.includes(token));
    const hasDay = !day || fullText.includes(day);
    const hasHour = !hour || timeTextIncludes(fullText, hour);
    const hasSuffix = !suffix || fullText.includes(suffix);

    if (hasInstrument) score += 2;
    if (hasDay) score += 2;
    if (hasHour) score += 2;
    if (hasSuffix) score += 4;

    const rowIsCollective = fullText.includes("collectif") || /\bcoll\b/.test(fullText);
    const rowIsIndividual = fullText.includes("individuel");
    const typeOk = wantsCollective ? rowIsCollective : wantsIndividual ? rowIsIndividual : true;

    if (wantsCollective && rowIsCollective) score += 5;
    if (wantsCollective && rowIsIndividual) score -= 4;
    if (wantsIndividual && rowIsIndividual) score += 5;
    if (wantsIndividual && rowIsCollective) score -= 4;

    if (labelText.includes(normalize(pending.label || ""))) score += 8;
    if (detailsText && suffix && detailsText.includes(suffix)) score += 2;

    const missing = [];
    if (!action) missing.push("bouton Ajouter");
    if (!hasInstrument) missing.push("instrument");
    if (!hasDay) missing.push("jour");
    if (!hasHour) missing.push("heure");
    if (!hasSuffix) missing.push("suffixe prof");
    if (!typeOk) missing.push("type individuel/coll");

    return {
      row,
      score,
      allowed: !missing.length && score >= 13,
      missing,
      orderableId: extractOrderableIdFromRegistrationAction(actionUrl),
      label: label || cleanText([labelText, details].join(" ")),
      text: cleanText(row.textContent || "")
    };
  }

  function highlightScheduleRows(label) {
    const wanted = normalize(label);
    if (!wanted) return;

    document.querySelectorAll("tbody tr").forEach(row => {
      const firstCell = row.querySelector("td");
      const text = normalize(firstCell?.textContent || row.textContent || "");
      if (!text) return;

      if (text === wanted || wanted.includes(text) || text.includes(wanted)) {
        row.classList.add("fx-mm-highlight-row");
      }
    });
  }

  function ensureHelperBanner(id, text) {
    let banner = document.querySelector(`#${id}`);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = id;
      banner.className = "fx-mm-helper-banner";
      document.body.appendChild(banner);
    }
    banner.textContent = text;
  }

  function readStoredJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  function ensureSeasonOptions(select) {
    if (!select) return;

    const seasons = getSeasonOptions();
    const previous = state.settings.seasonId || select.value || getCurrentSeason().id || "";
    select.innerHTML = seasons.map(season => (
      `<option value="${escapeHtml(season.id)}">${escapeHtml(season.label)}</option>`
    )).join("");

    if (previous && seasons.some(season => season.id === previous)) {
      select.value = previous;
    } else if (seasons[0]) {
      select.value = seasons[0].id;
      state.settings.seasonId = seasons[0].id;
    }
  }

  function getSeasonOptions() {
    const select = document.querySelector("form.navbar-form-custom #season_id, #season_id");
    const options = [...(select?.querySelectorAll("option") || [])]
      .map(option => ({
        id: option.value,
        label: cleanText(option.textContent || "")
      }))
      .filter(option => option.id && option.label);

    const current = getCurrentSeason();
    if (!options.length && current.id) return [current];
    return options;
  }

  function getSelectedSeason() {
    const selectedId = state.settings.seasonId || getCurrentSeason().id || "";
    const season = getSeasonOptions().find(option => option.id === selectedId);
    return season || getCurrentSeason() || { id: selectedId, label: "" };
  }

  function getCurrentSeason() {
    const select = document.querySelector("form.navbar-form-custom #season_id, #season_id");
    return {
      id: select?.value || "",
      label: select?.selectedOptions?.[0]?.textContent?.trim() || ""
    };
  }

  function setStatus(message) {
    const status = document.querySelector("#fx-mm-status");
    if (status) status.textContent = message;
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function stripHtml(value) {
    const div = document.createElement("div");
    div.innerHTML = String(value || "");
    return cleanText(div.textContent || "");
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function injectStyle() {
    if (document.querySelector("#fx-mm-style")) return;

    const style = document.createElement("style");
    style.id = "fx-mm-style";
    style.textContent = `
      #fx-music-members-nav-item.active > a {
        background: #8e24aa !important;
        color: #fff !important;
      }

      #fx-music-members-page {
        padding: 0 !important;
      }

      #fx-music-members-page .page-heading {
        margin: 0 -15px 20px -15px;
        padding: 0 10px 20px 10px;
      }

      #fx-music-members-page > .wrapper-content {
        padding: 0 10px 40px;
      }

      .fx-mm-card {
        background: #fff;
        padding: 16px;
      }

      #fx-mm-paste {
        border: 1px solid #c9d1dc;
        border-radius: 6px;
        box-sizing: border-box;
        color: #273043;
        font: 13px/1.45 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        min-height: 140px;
        padding: 10px;
        resize: vertical;
        width: 100%;
      }

      #fx-mm-paste:focus {
        border-color: #8e24aa;
        box-shadow: 0 0 0 3px rgba(142, 36, 170, 0.12);
        outline: 0;
      }

      .fx-mm-actions {
        align-items: center;
        display: flex;
        gap: 12px;
        justify-content: space-between;
        margin: 16px 0 12px;
      }

      .fx-mm-actions > div {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }

      #fx-mm-status {
        color: #676a6c;
        font-size: 13px;
      }

      .fx-mm-table td,
      .fx-mm-table th {
        vertical-align: top !important;
      }

      .fx-mm-table {
        min-width: 1420px;
      }

      .fx-mm-table pre {
        color: #344054;
        font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        margin: 6px 0 0;
        max-width: 260px;
        white-space: pre-wrap;
      }

      .fx-mm-table code {
        background: #f3f4f7;
        border-radius: 4px;
        color: #344054;
        display: inline-block;
        margin-top: 4px;
        padding: 2px 5px;
      }

      .fx-mm-table span {
        color: #7b8495;
        font-size: 12px;
      }

      .fx-mm-check {
        border-radius: 999px;
        display: inline-flex;
        font-size: 12px !important;
        font-weight: 700;
        line-height: 1;
        padding: 6px 8px;
      }

      .fx-mm-check-ok {
        background: #e8f7ef;
        color: #1f7a47 !important;
      }

      .fx-mm-check-no {
        background: #fdecec;
        color: #a83b3b !important;
      }

      .fx-mm-check-muted {
        background: #eef1f5;
        color: #667085 !important;
      }

      .fx-mm-row-actions {
        min-width: 180px;
      }

      .fx-mm-row-actions .btn {
        margin: 0 4px 4px 0;
      }

      .fx-mm-helper-banner {
        background: #fff;
        border-left: 4px solid #8e24aa;
        border-radius: 6px;
        box-shadow: 0 10px 28px rgba(52, 64, 84, 0.24);
        color: #344054;
        font: 700 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        max-width: 460px;
        padding: 10px 12px;
        position: fixed;
        right: 22px;
        top: 86px;
        z-index: 2147483647;
      }

      .fx-mm-highlight-row {
        outline: 3px solid rgba(142, 36, 170, 0.35) !important;
        outline-offset: -3px;
      }

      .fx-mm-contact-tools {
        align-items: center;
        display: inline-flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-left: 8px;
        vertical-align: middle;
      }

      .fx-mm-contact-id {
        background: #f3f4f7;
        border-radius: 4px;
        color: #344054;
        display: inline-flex;
        font: 700 11px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: 4px 6px;
        white-space: nowrap;
      }
    `;

    document.head.appendChild(style);
  }

  init();
})();
