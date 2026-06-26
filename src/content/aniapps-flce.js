(function () {
  "use strict";

  const FX = window.FXLaclefExtension;
  if (!FX || window.__fxFlceInstalled) return;
  window.__fxFlceInstalled = true;

  const FLCE_HASH = "#flce";
  const FLCE_URL = "/admin#flce";
  const API_URL = "/admin/activity_participations.json";
  const FLCE_ACTIVITY_ID = "8";
  const CACHE_PREFIX = "fx_flce_cache_v7_";
  const CONTACT_DETAILS_CACHE_KEY = "fx_flce_contact_details_v4";
  const TEST_STATUS_STORAGE_KEY = "fx_flce_test_status_v1";
  const MANUAL_FIELDS_STORAGE_KEY = "fx_flce_manual_fields_v1";
  const DOCUMENT_SETTINGS_KEY = "fx_flce_document_settings_v1";
  const CACHE_TTL_MS = 1000 * 60 * 30;
  const CONTACT_DETAILS_TTL_MS = 1000 * 60 * 60 * 24 * 7;
  const BALANCE_TTL_MS = 1000 * 60 * 10;
  const CONTACT_FETCH_BATCH_SIZE = 4;
  const DOCUMENT_TEMPLATE_PATHS = {
    preinscription: [
      "src/templates/Preinscription.docx",
      "src/templates/preinscription.docx",
      "src/templates/Préinscription.docx"
    ],
    inscription: [
      "src/templates/Inscription.docx",
      "src/templates/inscription.docx",
      "src/templates/inscriptions.docx"
    ]
  };
  const CERTIFICATE_IMAGE_ENTRIES = {
    preinscription: {
      logo: "word/media/image2.png",
      address: "word/media/image1.png",
      signature: "word/media/image4.png",
      footer: "word/media/image3.png"
    },
    inscription: {
      logo: "word/media/image1.png",
      address: "word/media/image4.png",
      signature: "word/media/image3.png",
      footer: "word/media/image2.png"
    }
  };

  const state = {
    view: "preinscrits",
    classFilter: "all",
    stateFilter: "active",
    sortKey: "nom",
    sortDir: "asc",
    students: [],
    renderedRows: [],
    testStatuses: {},
    manualFields: {},
    documentSettings: {},
    templateCache: {},
    imageCache: {},
    loading: false,
    lastSeasonId: null,
    menuTimer: null
  };

  FX.onPageChange(init);
  window.addEventListener("hashchange", init);
  window.addEventListener("load", init);

  document.addEventListener("click", event => {
    const flceClick = event.target.closest("#fx-flce-nav-item, #fx-flce-nav-item a");
    if (!flceClick) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    goToFlce();
  }, true);

new MutationObserver(() => {
  if (!document.querySelector("#fx-flce-nav-item")) {
    scheduleMenuSync();
  }
}).observe(document.documentElement, {
  childList: true,
  subtree: true
});

  setInterval(scheduleMenuSync, 1000);

  function init() {
    scheduleMenuSync();
    listenSeasonChange();

    if (isFlcePage()) {
      restoreNativePage();
      setTimeout(renderFlcePage, 80);
    } else {
      restoreNativePage();
      highlightSidebar(false);
    }
  }

  function isFlcePage() {
    return location.pathname === "/admin" && location.hash === FLCE_HASH;
  }

  function goToFlce() {
    if (location.pathname !== "/admin") {
      window.location.href = FLCE_URL;
      return;
    }

    if (location.hash !== FLCE_HASH) {
      window.location.hash = "flce";
    }

    setTimeout(() => {
      restoreNativePage();
      renderFlcePage();
    }, 80);
  }

  function scheduleMenuSync() {
    if (state.menuTimer) return;

    state.menuTimer = setTimeout(() => {
      state.menuTimer = null;
      ensureFlceSidebarTab();
    }, 80);
  }

function ensureFlceSidebarTab() {
  const sideMenu = document.querySelector("#side-menu");
  if (!sideMenu) return;

  hideNativeSidebarItems(sideMenu);

  let flceLi = document.querySelector("#fx-flce-nav-item");

  if (!flceLi) {
    flceLi = document.createElement("li");
    flceLi.id = "fx-flce-nav-item";
    flceLi.innerHTML = `
      <a href="/admin#flce" data-turbolinks="false">
        <i class="fa fa-language"></i>
        <span class="nav-label">FLCE</span>
      </a>
    `;

    const link = flceLi.querySelector("a");

    link.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      window.location.href = "/admin#flce";
    });
  }

  if (!flceLi.parentElement) {
    sideMenu.appendChild(flceLi);
  }

  syncCustomSidebarOrder(sideMenu);
  flceLi.style.display = "";
  flceLi.style.pointerEvents = "auto";

  highlightSidebar(isFlcePage());
}

  function syncCustomSidebarOrder(sideMenu) {
    const ordered = [
      document.querySelector("#fx-flce-nav-item"),
      document.querySelector("#fx-music-members-nav-item"),
      document.querySelector("#fx-family-balances-nav-item")
    ].filter(item => item?.parentElement === sideMenu);
    const famillesLi = [...sideMenu.querySelectorAll(":scope > li")].find(li => getTopLabel(li) === "Familles");
    if (!famillesLi || !ordered.length) return;

    let anchor = famillesLi;
    [...ordered].reverse().forEach(item => {
      if (item.nextElementSibling !== anchor) {
        anchor.insertAdjacentElement("beforebegin", item);
      }
      anchor = item;
    });
  }

  function getTopLabel(li) {
    return (li.querySelector(":scope > a .nav-label")?.textContent || "").trim();
  }

  function hideNativeSidebarItems(sideMenu) {
    [...sideMenu.querySelectorAll(":scope > li")].forEach(li => {
      const label = getTopLabel(li);
      if (label === "Mémos" || label === "Documents") {
        li.style.display = "none";
      }
    });
  }

  function highlightSidebar(active) {
    const flceLi = document.querySelector("#fx-flce-nav-item");
    if (!flceLi) return;

    if (active) {
      document.querySelectorAll("#side-menu li").forEach(li => li.classList.remove("active"));
      flceLi.classList.add("active");
    } else {
      flceLi.classList.remove("active");
    }
  }

  function restoreNativePage() {
    document.querySelector("#fx-flce-page")?.remove();

    document.querySelectorAll("[data-fx-flce-hidden='1']").forEach(el => {
      el.style.display = el.dataset.fxFlceOldDisplay || "";
      delete el.dataset.fxFlceHidden;
      delete el.dataset.fxFlceOldDisplay;
    });
  }

  function hideNativePage(wrapper) {
    [...wrapper.children].forEach(child => {
      if (child.id === "fx-flce-page") return;
      if (child.matches(".row.border-bottom, nav.navbar-static-top, .navbar-static-top")) return;

      if (child.dataset.fxFlceHidden !== "1") {
        child.dataset.fxFlceHidden = "1";
        child.dataset.fxFlceOldDisplay = child.style.display || "";
      }

      child.style.display = "none";
    });
  }

  async function renderFlcePage() {
    const wrapper = document.querySelector("#page-wrapper");
    if (!wrapper) return;

    document.title = "La CLEF - FLCE";
    highlightSidebar(true);
    hideNativePage(wrapper);
    injectStyle();

    let page = document.querySelector("#fx-flce-page");

    if (!page) {
      page = document.createElement("div");
      page.id = "fx-flce-page";
      page.className = "fx-flce-root";
      page.innerHTML = `
        <div class="row wrapper border-bottom page-heading">
          <div class="col-lg-10">
            <h2>FLCE</h2>
            <ol class="breadcrumb">
              <li><a href="/admin">Accueil</a></li>
              <li class="active"><strong>FLCE</strong></li>
            </ol>
          </div>
        </div>

        <div class="wrapper wrapper-content animated fadeInRight">
          <div class="ibox-content fx-flce-card">
            <div class="fx-flce-tabs">
              <button type="button" class="fx-flce-tab is-active" data-view="preinscrits">
                Préinscrits <span id="fx-count-preinscrits">0</span>
              </button>
              <button type="button" class="fx-flce-tab" data-view="inscrits">
                Inscrits <span id="fx-count-inscrits">0</span>
              </button>
              <button type="button" class="fx-flce-tab" data-view="documents">
                Documents <span id="fx-count-documents">0</span>
              </button>
            </div>

            <div id="fx-flce-document-settings" class="fx-flce-document-settings" style="display:none;">
              <div class="fx-flce-settings-title">
                <strong>Paramètres attestations</strong>
                <span id="fx-flce-document-season">Saison sélectionnée</span>
              </div>
              <div class="row">
                <div class="col-sm-3">
                  <label>Debut des cours</label>
                  <input class="form-control" id="fx-flce-doc-start" placeholder="Ex. 22 septembre 2025">
                </div>
                <div class="col-sm-3">
                  <label>Fin des cours</label>
                  <input class="form-control" id="fx-flce-doc-end" placeholder="Ex. 19 juin 2026">
                </div>
                <div class="col-sm-3">
                  <label>Montant Préinscription</label>
                  <input class="form-control" id="fx-flce-doc-amount" placeholder="Ex. 150 EUR">
                </div>
                <div class="col-sm-3 fx-flce-settings-action">
                  <button type="button" class="btn btn-primary" id="fx-flce-doc-save">
                    <i class="fa fa-save"></i> Enregistrer
                  </button>
                </div>
              </div>
            </div>

            <div class="row fx-flce-filters">
              <div class="col-sm-3">
                <select class="form-control" id="fx-flce-class-filter">
                  <option value="all">Toutes les classes</option>
                </select>
              </div>

              <div class="col-sm-3">
                <select class="form-control" id="fx-flce-state-filter">
                  <option value="active" selected>Active</option>
                  <option value="stopped">Stoppée</option>
                  <option value="all">Tous les états</option>
                </select>
              </div>

              <div class="col-sm-4">
                <input class="form-control" id="fx-flce-search" placeholder="Rechercher nom, prénom, email, téléphone...">
              </div>

              <div class="col-sm-2 text-right">
                <button type="button" class="btn btn-primary" id="fx-flce-refresh">
                  <i class="fa fa-refresh"></i> Rafraîchir
                </button>
              </div>
            </div>

            <div class="fx-flce-actions-row">
              <span id="fx-flce-status">Chargement...</span>
              <button type="button" class="btn btn-default btn-sm" id="fx-flce-copy-sheets">
                <i class="fa fa-copy"></i> Copier vers Google Sheets
              </button>
            </div>

            <div class="table-responsive">
              <table class="table table-striped table-bordered table-hover fx-flce-table">
                <thead>
                  <tr id="fx-flce-head-row">
                    <th>N° adhérent</th>
                    <th>Civilité</th>
                    <th class="fx-sortable" data-sort="nom">Nom <span id="fx-sort-nom">▲</span></th>
                    <th class="fx-sortable" data-sort="prenom">Prénom <span id="fx-sort-prenom">↕</span></th>
                    <th>Âge</th>
                    <th>Téléphone</th>
                    <th>Email</th>
                    <th>Classe</th>
                    <th>Type</th>
                    <th>État</th>
                    <th>Contact</th>
                  </tr>
                </thead>
                <tbody id="fx-flce-tbody"></tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      wrapper.appendChild(page);
      bindEvents(page);
    }

    const stateFilter = page.querySelector("#fx-flce-state-filter");
    if (stateFilter) stateFilter.value = state.stateFilter;

    await Promise.all([
      loadDocumentSettings(),
      loadManualFields()
    ]);
    renderDocumentSettings();
    renderTableHead();
    await ensureStudentsForCurrentSeason(false);
  }

  function bindEvents(page) {
    page.querySelector("#fx-flce-refresh").addEventListener("click", () => {
      ensureStudentsForCurrentSeason(true);
    });

    page.querySelector("#fx-flce-doc-save").addEventListener("click", saveCurrentDocumentSettings);
    page.querySelector("#fx-flce-copy-sheets").addEventListener("click", copyRenderedRowsToGoogleSheets);

    page.addEventListener("change", event => {
      const manualField = event.target.closest("[data-fx-manual-field]");
      if (!manualField) return;

      saveManualField(manualField.dataset.contactKey, manualField.dataset.fxManualField, manualField.value);
    });

    page.addEventListener("blur", event => {
      const note = event.target.closest(".fx-flce-note-input");
      if (!note) return;

      saveManualField(note.dataset.contactKey, "note", note.value);
    });

    page.addEventListener("click", event => {
      const button = event.target.closest("[data-fx-doc-type]");
      if (!button) return;

      const index = Number(button.dataset.rowIndex);
      const student = state.renderedRows[index];
      if (!student) return;

      const previewWindow = window.open("about:blank", "_blank");
      writePdfPreviewLoading(previewWindow);

      generateAttestationPdf(student, button.dataset.fxDocType, previewWindow)
        .catch(error => {
          previewWindow?.close();
          console.error("[FLCE] Document impossible", error);
          FX.notify(error.message || "Generation du document impossible.", "Documents FLCE");
        });
    });

    page.querySelectorAll(".fx-flce-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        state.view = btn.dataset.view;
        state.classFilter = "all";

        page.querySelectorAll(".fx-flce-tab").forEach(tab => tab.classList.remove("is-active"));
        btn.classList.add("is-active");

        renderDocumentSettings();
        renderTableHead();
        updateClassFilter();
        renderRows();
      });
    });

    page.querySelector("#fx-flce-class-filter").addEventListener("change", event => {
      state.classFilter = event.target.value;
      renderRows();
    });

    page.querySelector("#fx-flce-state-filter").addEventListener("change", event => {
      state.stateFilter = event.target.value;
      state.classFilter = "all";
      updateClassFilter();
      renderRows();
    });

    page.querySelector("#fx-flce-search").addEventListener("input", renderRows);

    bindSortHeaders(page);
  }

  function bindSortHeaders(root) {
    root.querySelectorAll(".fx-sortable").forEach(th => {
      if (th.dataset.fxSortReady === "1") return;
      th.dataset.fxSortReady = "1";

      th.addEventListener("click", () => {
        const key = th.dataset.sort;

        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = "asc";
        }

        renderRows();
      });
    });
  }

  async function ensureStudentsForCurrentSeason(forceRefresh) {
    if (state.loading) return;

    const season = getCurrentSeason();

    if (!forceRefresh && state.lastSeasonId === season.id && state.students.length) {
      updateClassFilter();
      renderRows();
      await enrichContactDetails(state.students, season);
      updateClassFilter();
      renderRows();
      return;
    }

    state.lastSeasonId = season.id;
    await loadStudents(season, forceRefresh);
  }

  async function loadStudents(season, forceRefresh) {
    state.loading = true;

    try {
      const cacheKey = CACHE_PREFIX + season.id;
      setStatus("Chargement des lignes FLCE...");

      if (!forceRefresh) {
        const cached = await FX.storage.get(cacheKey);

        if (cached?.students?.length && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
          state.students = cached.students;
          updateClassFilter();
          renderRows();
          await enrichContactDetails(state.students, season);
          await FX.storage.set(cacheKey, {
            students: state.students,
            updatedAt: Date.now()
          });
          updateClassFilter();
          renderRows();
          setStatus(`${state.students.length} lignes chargées depuis le cache local.`);
          return;
        }
      }

      const students = await fetchStudentsFromApi(season.id);
      state.students = students;
      updateClassFilter();
      renderRows();
      await enrichContactDetails(students, season);

      await FX.storage.set(cacheKey, {
        students: state.students,
        updatedAt: Date.now()
      });

      updateClassFilter();
      renderRows();
      setStatus(`${state.students.length} lignes chargées.`);
    } catch (error) {
      console.error("[FLCE]", error);
      setStatus("Erreur : " + error.message);
    } finally {
      state.loading = false;
    }
  }

  async function fetchStudentsFromApi(seasonId) {
    const students = [];
    let start = 0;
    const length = 100;

    while (start < 5000) {
      const url = new URL(API_URL, location.origin);
      url.searchParams.set("season_id", seasonId);
      url.searchParams.set("activity_id", FLCE_ACTIVITY_ID);
      url.searchParams.set("start", String(start));
      url.searchParams.set("length", String(length));

      const response = await fetch(url.toString(), {
        credentials: "include",
        headers: { Accept: "application/json" }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const rows = Array.isArray(data.data) ? data.data : [];

      if (!rows.length) break;

      rows.forEach(row => {
        const student = parseApiRow(row);
        if (student) students.push(student);
      });

      const total = Number(data.recordsFiltered || data.recordsTotal || 0);
      start += length;

      if (total && start >= total) break;
      await FX.wait(60);
    }

    return students;
  }

  function parseApiRow(row) {
    const classe = stripHtml(row.activity_schedule_label || "");
    const classeNorm = normalize(classe);

    let type = "";
    if (classeNorm.includes("preinscription flce")) type = "Préinscrit";
    else if (classeNorm.includes("flce")) type = "Inscrit";
    else return null;

    const hrefMatch = String(row.actions || "").match(/\/admin\/families\/(\d+)\/contacts\/(\d+)/);

    return {
      idFamille: hrefMatch?.[1] || "",
      idAdherent: hrefMatch?.[2] || "",
      contactUrl: hrefMatch
        ? `${location.origin}/admin/families/${hrefMatch[1]}/contacts/${hrefMatch[2]}`
        : "",
      classe,
      nom: stripHtml(row.contact_lastname || ""),
      prenom: stripHtml(row.contact_firstname || ""),
      civilite: "",
      age: cleanAge(firstRowValue(row, [
        "contact_age",
        "age",
        "contact_age_in_years",
        "age_in_years"
      ])),
      soldeText: "",
      soldeCents: null,
      email: stripHtml(row.contact_email || ""),
      telephone: stripHtml(row.contact_phone || ""),
      type,
      etat: stripHtml(row.state || "Active")
    };
  }

  function firstRowValue(row, keys) {
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return "";
  }

  function cleanAge(value) {
    const text = stripHtml(value);
    const match = text.match(/\d+/);
    return match ? match[0] : text;
  }

  async function enrichContactDetails(students, season) {
    const cache = await readContactDetailsCache();
    const now = Date.now();
    const byContact = new Map();
    const seasonKey = getSeasonCacheKey(season);

    students.forEach(student => {
      const key = contactKey(student);
      const cached = cache[key];
      const cachedBalance = cached?.seasonBalances?.[seasonKey];

      if (cached && now - Number(cached.updatedAt || 0) < CONTACT_DETAILS_TTL_MS) {
        if (cached.civilite) student.civilite = cached.civilite;
        if (cached.age) student.age = cached.age;
      }

      if (cachedBalance && now - Number(cachedBalance.updatedAt || 0) < BALANCE_TTL_MS) {
        applyBalance(student, cachedBalance);
      }

      const needsIdentity = !student.civilite || !student.age;
      const needsBalance = !cachedBalance || now - Number(cachedBalance.updatedAt || 0) >= BALANCE_TTL_MS;

      if ((needsIdentity || needsBalance) && student.contactUrl && !byContact.has(key)) {
        byContact.set(key, student);
      }
    });

    const contacts = [...byContact.entries()];
    if (!contacts.length) return students;

    for (let index = 0; index < contacts.length; index += CONTACT_FETCH_BATCH_SIZE) {
      const batch = contacts.slice(index, index + CONTACT_FETCH_BATCH_SIZE);
      setStatus(`Détails FLCE... ${Math.min(index + batch.length, contacts.length)} / ${contacts.length}`);

      await Promise.all(batch.map(async ([key, student]) => {
        try {
          const details = await fetchContactDetails(student.contactUrl, season);
          const previous = cache[key] || {};
          const seasonBalances = {
            ...(previous.seasonBalances || {}),
            [seasonKey]: {
              ...(details.seasonBalance || {}),
              updatedAt: Date.now()
            }
          };

          cache[key] = {
            ...previous,
            civilite: details.civilite || previous.civilite || "",
            age: details.age || previous.age || "",
            seasonBalances,
            updatedAt: Date.now()
          };

          students.forEach(row => {
            if (contactKey(row) !== key) return;
            if (details.civilite) row.civilite = details.civilite;
            if (details.age) row.age = details.age;
            applyBalance(row, seasonBalances[seasonKey]);
          });
        } catch (error) {
          console.warn("[FLCE] Detail contact indisponible", student.contactUrl, error);
        }
      }));

      await FX.storage.set(CONTACT_DETAILS_CACHE_KEY, cache);
      renderRows();
      await FX.wait(80);
    }

    return students;
  }

  async function readContactDetailsCache() {
    const cache = await FX.storage.get(CONTACT_DETAILS_CACHE_KEY);
    return cache && typeof cache === "object" && !Array.isArray(cache) ? cache : {};
  }

  async function loadManualFields() {
    const [manualFields, oldTestStatuses] = await Promise.all([
      FX.storage.get(MANUAL_FIELDS_STORAGE_KEY).catch(() => null),
      FX.storage.get(TEST_STATUS_STORAGE_KEY).catch(() => null)
    ]);

    state.manualFields = manualFields && typeof manualFields === "object" && !Array.isArray(manualFields)
      ? manualFields
      : {};
    state.testStatuses = oldTestStatuses && typeof oldTestStatuses === "object" && !Array.isArray(oldTestStatuses)
      ? oldTestStatuses
      : {};

    Object.entries(state.testStatuses).forEach(([key, value]) => {
      if (!state.manualFields[key]) state.manualFields[key] = {};
      if (!state.manualFields[key].test) state.manualFields[key].test = value === "yes" ? "yes" : "no";
    });
  }

  async function saveManualField(contactKeyValue, field, value) {
    if (!contactKeyValue || !field) return;

    const normalizedValue = field === "note"
      ? String(value || "")
      : value === "yes" ? "yes" : "no";

    state.manualFields[contactKeyValue] = {
      ...(state.manualFields[contactKeyValue] || {}),
      [field]: normalizedValue
    };

    if (field === "test") {
      state.testStatuses[contactKeyValue] = normalizedValue;
    }

    try {
      await FX.storage.set(MANUAL_FIELDS_STORAGE_KEY, state.manualFields);
      if (field === "test") await FX.storage.set(TEST_STATUS_STORAGE_KEY, state.testStatuses);
    } catch (error) {
      console.warn("[FLCE] Champ manuel non sauvegarde", error);
      FX.notify("Impossible de sauvegarder la donnée FLCE.", "FLCE");
    }
  }

  async function fetchContactDetails(contactUrl, season) {
    const response = await fetch(contactUrl, {
      credentials: "include",
      headers: { Accept: "text/html" }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const doc = new DOMParser().parseFromString(await response.text(), "text/html");
    return {
      civilite: readContactDefinitionValue(doc, "civilite"),
      age: cleanAge(readContactDefinitionValue(doc, "age")),
      seasonBalance: readSeasonBalance(doc, season)
    };
  }

  function readSeasonBalance(doc, season) {
    const wanted = normalizeSeasonLabel(season?.label || "");
    const panels = [...doc.querySelectorAll(".panel, .ibox")];

    for (const panel of panels) {
      const heading = panel.querySelector(".panel-heading, .ibox-title, h2, h3, h4, strong");
      const headingText = normalizeSeasonLabel(heading?.textContent || "");
      const panelText = normalizeSeasonLabel(panel.textContent || "");
      const matchText = headingText || panelText;

      if (wanted && !matchText.includes(wanted)) continue;

      const value = readDefinitionValue(panel, "solde");
      if (value) {
        return {
          text: value,
          cents: parseEuroCents(value)
        };
      }
    }

    const fallbackPanel = panels.find(panel => {
      const text = normalize(panel.textContent || "");
      return text.includes("commande") && text.includes("total paye") && text.includes("solde");
    });
    const fallbackValue = fallbackPanel ? readDefinitionValue(fallbackPanel, "solde") : "";

    return {
      text: fallbackValue,
      cents: fallbackValue ? parseEuroCents(fallbackValue) : null
    };
  }

  function applyBalance(student, balance) {
    if (!balance) return;
    student.soldeText = balance.text || "";
    student.soldeCents = Number.isFinite(balance.cents) ? balance.cents : null;
  }

  function parseEuroCents(value) {
    const text = String(value || "")
      .replace(/\s+/g, "")
      .replace("€", "")
      .replace(",", ".");
    const match = text.match(/-?\d+(?:\.\d{1,2})?/);
    if (!match) return null;
    return Math.round(Number(match[0]) * 100);
  }

  function getSeasonCacheKey(season) {
    return normalizeSeasonLabel(season?.label || season?.id || "current") || "current";
  }

  function normalizeSeasonLabel(value) {
    return normalize(value)
      .replace(/^saison\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function readContactDefinitionValue(doc, label) {
    const coordinateTitles = [...doc.querySelectorAll(".ibox-title, .panel-heading, h3, h4, strong")]
      .filter(el => normalize(el.textContent || "").includes("coordonnees"));

    for (const title of coordinateTitles) {
      const block = title.closest(".ibox, .panel, .box, .col-lg-6, .col-md-6, .col-sm-6") || title.parentElement;
      const value = readDefinitionValue(block, label);
      if (value) return value;
    }

    const exactCoordinateBlocks = [...doc.querySelectorAll(".ibox-content, .panel-body")]
      .filter(el => {
        const text = normalize(el.textContent || "");
        return text.includes("civilite") && text.includes("date de naissance") && text.includes("email");
      });

    for (const block of exactCoordinateBlocks) {
      const value = readDefinitionValue(block, label);
      if (value) return value;
    }

    return "";
  }

  function readDefinitionValue(root, label) {
    const expected = normalize(label);
    const dt = [...root.querySelectorAll("dt")]
      .find(item => normalize(item.textContent) === expected);

    return stripHtml(dt?.nextElementSibling?.textContent || "");
  }

  function dedupeStudents(students) {
    const map = new Map();

    for (const student of students) {
      const key = student.idAdherent || `${student.nom}-${student.prenom}-${student.email}`;
      const existing = map.get(key);

      if (!existing || (existing.type === "Préinscrit" && student.type === "Inscrit")) {
        map.set(key, student);
      }
    }

    return [...map.values()];
  }

  function getBaseRows() {
    const preinscrits = state.students.filter(s => s.type === "Préinscrit");
    const inscrits = state.students.filter(s => s.type === "Inscrit");

    const preCount = document.querySelector("#fx-count-preinscrits");
    const insCount = document.querySelector("#fx-count-inscrits");
    const docCount = document.querySelector("#fx-count-documents");

    if (preCount) preCount.textContent = countUniqueActiveContacts(preinscrits);
    if (insCount) insCount.textContent = countUniqueActiveContacts(inscrits);
    if (docCount) docCount.textContent = countUniqueActiveContacts(state.students);

    if (state.view === "documents") return state.students;
    return state.view === "preinscrits" ? preinscrits : inscrits;
  }

  function contactKey(student) {
    return student.idAdherent || normalize(`${student.nom}-${student.prenom}-${student.email}`);
  }

  function isStoppedState(value) {
    return normalize(value).includes("stop");
  }

  function isActiveState(value) {
    return !isStoppedState(value);
  }

  function filterRowsByState(rows) {
    if (state.stateFilter === "all") return rows;
    if (state.stateFilter === "stopped") return rows.filter(row => isStoppedState(row.etat));
    return rows.filter(row => isActiveState(row.etat));
  }

  function countUniqueActiveContacts(rows) {
    const keys = new Set();

    rows.forEach(row => {
      if (isActiveState(row.etat)) keys.add(contactKey(row));
    });

    return keys.size;
  }

  function updateClassFilter() {
    const select = document.querySelector("#fx-flce-class-filter");
    if (!select) return;

    const previous = state.classFilter;
    const rows = filterRowsByState(getBaseRows());
    const counts = new Map();

    rows.forEach(student => {
      const classe = student.classe || "Sans classe";
      counts.set(classe, (counts.get(classe) || 0) + 1);
    });

    const classes = [...counts.keys()].sort((a, b) => a.localeCompare(b));

    const allLabel = state.view === "preinscrits" ? "Toutes les préinscriptions" : "Toutes les classes";

    select.innerHTML = `
      <option value="all">${allLabel} (${rows.length})</option>
      ${classes.map(classe => `
        <option value="${escapeHtml(classe)}">${escapeHtml(classe)} (${counts.get(classe)})</option>
      `).join("")}
    `;

    state.classFilter = previous !== "all" && counts.has(previous) ? previous : "all";
    select.value = state.classFilter;
  }

  function getTestStatus(student) {
    return getManualField(student, "test", student.testFrancais || state.testStatuses[contactKey(student)] || "no");
  }

  function getTestLabel(student) {
    return getTestStatus(student) === "yes" ? "Oui" : "Non";
  }

  function getAuPairStatus(student) {
    return getManualField(student, "auPair", "no");
  }

  function getAuPairLabel(student) {
    return getAuPairStatus(student) === "yes" ? "Oui" : "Non";
  }

  function getNote(student) {
    return getManualField(student, "note", "");
  }

  function getManualField(student, field, fallback = "") {
    return state.manualFields[contactKey(student)]?.[field] ?? fallback;
  }

  function renderTestSelect(student) {
    return renderYesNoSelect(student, "test", getTestStatus(student));
  }

  function renderAuPairSelect(student) {
    return renderYesNoSelect(student, "auPair", getAuPairStatus(student));
  }

  function renderYesNoSelect(student, field, value) {
    const key = contactKey(student);

    return `
      <select class="form-control input-sm fx-flce-yesno-select" data-contact-key="${escapeHtml(key)}" data-fx-manual-field="${escapeHtml(field)}">
        <option value="no"${value === "yes" ? "" : " selected"}>Non</option>
        <option value="yes"${value === "yes" ? " selected" : ""}>Oui</option>
      </select>
    `;
  }

  function renderNoteInput(student) {
    return `
      <input class="form-control input-sm fx-flce-note-input"
        data-contact-key="${escapeHtml(contactKey(student))}"
        data-fx-manual-field="note"
        value="${escapeHtml(getNote(student))}"
        placeholder="Note">
    `;
  }

  function renderBalanceCell(student) {
    if (!student.soldeText) return `<span class="text-muted">-</span>`;

    const cents = Number.isFinite(student.soldeCents) ? student.soldeCents : parseEuroCents(student.soldeText);
    const css = cents > 0 ? "text-danger" : cents < 0 ? "text-info" : "text-success";

    return `<strong class="${css}">${escapeHtml(student.soldeText)}</strong>`;
  }

  function getSortValue(student, key) {
    if (key === "auPair") return getAuPairLabel(student);
    if (key === "test") return getTestLabel(student);
    if (key === "note") return getNote(student);
    if (key === "solde") return String(student.soldeCents ?? parseEuroCents(student.soldeText) ?? 0).padStart(12, "0");
    return student[key] || "";
  }

  async function copyRenderedRowsToGoogleSheets() {
    const rows = state.renderedRows || [];
    if (!rows.length) {
      FX.notify("Aucune ligne affichée à copier.", "FLCE");
      return;
    }

    const columns = getGoogleSheetsColumns();
    const tsv = [
      columns.map(column => column.header).join("\t"),
      ...rows.map(student => columns.map(column => cleanSheetCell(column.value(student))).join("\t"))
    ].join("\n");

    try {
      await navigator.clipboard.writeText(tsv);
      FX.notify(`${rows.length} ligne(s) copiée(s) pour Google Sheets.`, "FLCE");
    } catch (error) {
      console.error("[FLCE] Copie Google Sheets impossible", error);
      FX.notify("Copie impossible. Vérifie l'autorisation du presse-papiers.", "FLCE");
    }
  }

  function getGoogleSheetsColumns() {
    return [
      { header: "#", value: student => student.idAdherent || "" },
      { header: "DATE", value: () => "" },
      { header: "MR/MME", value: student => student.civilite || "" },
      { header: "NOM", value: student => student.nom || "" },
      { header: "PRENOM", value: student => student.prenom || "" },
      { header: "AGE", value: student => student.age || "" },
      { header: "AU PAIR", value: getAuPairLabel },
      { header: "CLASSE", value: student => student.type === "Préinscrit" ? "Préinscription" : student.classe || "" },
      { header: "PRE-INSCRIPTION", value: student => student.type === "Préinscrit" ? "Oui" : "" },
      { header: "TEST", value: student => student.type === "Préinscrit" ? getTestLabel(student) : "" },
      { header: "PAIEMENT TOTAL", value: student => student.soldeText || "" },
      { header: "STATUT", value: student => student.etat || "" },
      { header: "INFOS", value: getNote },
      { header: "TELEPHONE", value: student => student.telephone || "" },
      { header: "EMAIL", value: student => student.email || "" }
    ];
  }

  function cleanSheetCell(value) {
    return String(value || "")
      .replace(/\r?\n/g, " ")
      .replace(/\t/g, " ")
      .trim();
  }

  function renderRows() {
    const tbody = document.querySelector("#fx-flce-tbody");
    if (!tbody) return;

    let rows = filterRowsByState(getBaseRows());

    if (state.classFilter !== "all") {
      rows = rows.filter(s => s.classe === state.classFilter);
    }

    const search = normalize(document.querySelector("#fx-flce-search")?.value || "");

    if (search) {
      rows = rows.filter(s => normalize([
        s.idAdherent,
        s.civilite,
        s.nom,
        s.prenom,
        s.age,
        getAuPairLabel(s),
        getTestLabel(s),
        s.soldeText,
        s.telephone,
        s.email,
        s.classe,
        s.type,
        s.etat,
        getNote(s)
      ].join(" ")).includes(search));
    }

    rows = [...rows].sort((a, b) => {
      const result = normalize(getSortValue(a, state.sortKey))
        .localeCompare(normalize(getSortValue(b, state.sortKey)));
      return state.sortDir === "asc" ? result : -result;
    });

    updateSortIndicators();

    setStatus(`${rows.length} ligne${rows.length > 1 ? "s" : ""} affichée${rows.length > 1 ? "s" : ""}.`);

    state.renderedRows = rows;

    if (state.view === "documents") {
      renderDocumentRows(tbody, rows);
      return;
    }

    tbody.innerHTML = rows.length
      ? rows.map(student => `
        <tr>
          <td>${escapeHtml(student.idAdherent || "-")}</td>
          <td>${escapeHtml(student.civilite || "-")}</td>
          <td>${escapeHtml(student.nom)}</td>
          <td>${escapeHtml(student.prenom)}</td>
          <td>${escapeHtml(student.age || "-")}</td>
          <td>${renderAuPairSelect(student)}</td>
          ${state.view === "preinscrits" ? `<td>${renderTestSelect(student)}</td>` : ""}
          <td>${renderBalanceCell(student)}</td>
          <td>${escapeHtml(student.telephone)}</td>
          <td>${escapeHtml(student.email)}</td>
          <td>${escapeHtml(student.classe)}</td>
          ${state.view === "inscrits" ? `
            <td>
              <span class="label label-success">${escapeHtml(student.type)}</span>
            </td>
          ` : ""}
          <td>
            <span class="label ${normalize(student.etat).includes("stop") ? "label-danger" : "label-success"}">
              ${escapeHtml(student.etat || "Active")}
            </span>
          </td>
          <td>${renderNoteInput(student)}</td>
          <td>
            ${
              student.contactUrl
                ? `<a class="btn btn-xs btn-primary" target="_blank" href="${student.contactUrl}">
                     <i class="fa fa-eye"></i> Voir
                   </a>`
                : "-"
            }
          </td>
        </tr>
      `).join("")
      : `<tr><td colspan="14" class="text-center text-muted">Aucun adhérent trouvé.</td></tr>`;
  }

  function renderTableHead() {
    const row = document.querySelector("#fx-flce-head-row");
    if (!row) return;

    if (state.view === "documents") {
      row.innerHTML = `
        <th>N° adherent</th>
        <th>Civilite</th>
        <th class="fx-sortable" data-sort="nom">Nom <span id="fx-sort-nom">▲</span></th>
        <th class="fx-sortable" data-sort="prenom">Prenom <span id="fx-sort-prenom">↕</span></th>
        <th>Age</th>
        <th>Classe</th>
        <th>Type</th>
        <th>Etat</th>
        <th>Attestation</th>
      `;
    } else {
      const preinscritColumns = state.view === "preinscrits"
        ? `<th class="fx-sortable" data-sort="test">Test <span id="fx-sort-test">↕</span></th>`
        : "";
      const typeColumn = state.view === "inscrits" ? "<th>Type</th>" : "";
      const scheduleColumn = state.view === "preinscrits" ? "Pré-inscription" : "Classe";

      row.innerHTML = `
        <th>N° adherent</th>
        <th>Civilite</th>
        <th class="fx-sortable" data-sort="nom">Nom <span id="fx-sort-nom">▲</span></th>
        <th class="fx-sortable" data-sort="prenom">Prenom <span id="fx-sort-prenom">↕</span></th>
        <th>Age</th>
        <th class="fx-sortable" data-sort="auPair">Au Pair <span id="fx-sort-auPair">↕</span></th>
        ${preinscritColumns}
        <th class="fx-sortable" data-sort="solde">Solde <span id="fx-sort-solde">↕</span></th>
        <th>Telephone</th>
        <th>Email</th>
        <th>${scheduleColumn}</th>
        ${typeColumn}
        <th>Etat</th>
        <th class="fx-sortable" data-sort="note">Note <span id="fx-sort-note">↕</span></th>
        <th>Contact</th>
      `;
    }

    bindSortHeaders(row);
    updateSortIndicators();
  }

  function renderDocumentRows(tbody, rows) {
    tbody.innerHTML = rows.length
      ? rows.map((student, index) => {
        const isInscrit = student.type === "Inscrit";
        const buttons = [
          `<button type="button" class="btn btn-xs btn-primary fx-flce-doc-btn" data-row-index="${index}" data-fx-doc-type="preinscription">
             <i class="fa fa-file-pdf-o"></i> Preinscription
           </button>`
        ];

        if (isInscrit) {
          buttons.push(`
            <button type="button" class="btn btn-xs btn-success fx-flce-doc-btn" data-row-index="${index}" data-fx-doc-type="inscription">
              <i class="fa fa-file-pdf-o"></i> Inscription
            </button>
          `);
        }

        return `
          <tr>
            <td>${escapeHtml(student.idAdherent || "-")}</td>
            <td>${escapeHtml(student.civilite || "-")}</td>
            <td>${escapeHtml(student.nom)}</td>
            <td>${escapeHtml(student.prenom)}</td>
            <td>${escapeHtml(student.age || "-")}</td>
            <td>${escapeHtml(student.classe)}</td>
            <td>
              <span class="label ${isInscrit ? "label-success" : "label-info"}">
                ${escapeHtml(student.type)}
              </span>
            </td>
            <td>
              <span class="label ${normalize(student.etat).includes("stop") ? "label-danger" : "label-success"}">
                ${escapeHtml(student.etat || "Active")}
              </span>
            </td>
            <td class="fx-flce-doc-actions">${buttons.join("")}</td>
          </tr>
        `;
      }).join("")
      : `<tr><td colspan="9" class="text-center text-muted">Aucun document a generer.</td></tr>`;
  }

  async function loadDocumentSettings() {
    const settings = await FX.storage.get(DOCUMENT_SETTINGS_KEY).catch(() => null);
    state.documentSettings = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  }

  function getSeasonSettingsKey() {
    const season = getCurrentSeason();
    return season.id || season.label;
  }

  function getCurrentDocumentSettings() {
    return state.documentSettings[getSeasonSettingsKey()] || {};
  }

  function renderDocumentSettings() {
    const box = document.querySelector("#fx-flce-document-settings");
    if (!box) return;

    box.style.display = state.view === "documents" ? "" : "none";

    const season = getCurrentSeason();
    const settings = getCurrentDocumentSettings();
    const seasonLabel = box.querySelector("#fx-flce-document-season");
    const start = box.querySelector("#fx-flce-doc-start");
    const end = box.querySelector("#fx-flce-doc-end");
    const amount = box.querySelector("#fx-flce-doc-amount");

    if (seasonLabel) seasonLabel.textContent = season.label;
    if (start && document.activeElement !== start) start.value = settings.start || "";
    if (end && document.activeElement !== end) end.value = settings.end || "";
    if (amount && document.activeElement !== amount) amount.value = settings.amount || "";
  }

  async function saveCurrentDocumentSettings() {
    const key = getSeasonSettingsKey();
    state.documentSettings[key] = {
      start: document.querySelector("#fx-flce-doc-start")?.value.trim() || "",
      end: document.querySelector("#fx-flce-doc-end")?.value.trim() || "",
      amount: document.querySelector("#fx-flce-doc-amount")?.value.trim() || ""
    };

    await FX.storage.set(DOCUMENT_SETTINGS_KEY, state.documentSettings);
    await FX.notify("Parametres attestations enregistres pour cette saison.", "Documents FLCE");
  }

  async function generateAttestationPdf(student, type, previewWindow) {
    const settings = getCurrentDocumentSettings();
    const missing = [];

    if (!settings.start) missing.push("debut des cours");
    if (!settings.end) missing.push("fin des cours");
    if (type === "preinscription" && !settings.amount) missing.push("montant de preinscription");

    if (missing.length) {
      throw new Error(`Parametres manquants : ${missing.join(", ")}.`);
    }

    const context = buildDocumentContext(student, settings);
    const images = await loadCertificateImages(type);
    const blob = createCertificatePdf(type, context, images);
    const filename = `${sanitizeFilename(student.nom)} ${sanitizeFilename(student.prenom)} - Attestation ${type}.pdf`;

    openPdfPreview(blob, filename, previewWindow);
  }

  function buildDocumentContext(student, settings) {
    const season = getCurrentSeason();
    const seasonLabel = formatSeasonForDocument(season.label);
    const today = new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(new Date());

    return {
      Saison: seasonLabel,
      Season: seasonLabel,
      "Début": settings.start,
      Debut: settings.start,
      Fin: settings.end,
      Montant: settings.amount,
      "Civilité": student.civilite || "",
      Civilite: student.civilite || "",
      Nom: student.nom || "",
      "Prénom": student.prenom || "",
      Prenom: student.prenom || "",
      Date: today
    };
  }

  function formatSeasonForDocument(value) {
    const text = String(value || "").trim();
    const match = text.match(/(\d{4})\s*[-/]\s*(\d{4})/);
    return match ? `${match[1]} / ${match[2]}` : text;
  }

  function renderTemplateParagraphs(paragraphs, context) {
    return paragraphs.map(paragraph => {
      let text = paragraph;

      Object.entries(context).forEach(([key, value]) => {
        text = text.replaceAll(`{{${key}}}`, value || "");
      });

      return text.trimEnd();
    });
  }

  async function loadTemplateParagraphs(type) {
    if (state.templateCache[type]) return state.templateCache[type];

    const buffer = await loadTemplateBuffer(type);
    const paragraphs = await extractDocxParagraphs(buffer);

    state.templateCache[type] = paragraphs;
    return paragraphs;
  }

  async function loadTemplateBuffer(type) {
    const paths = DOCUMENT_TEMPLATE_PATHS[type] || [];
    const errors = [];

    for (const path of paths) {
      try {
        const response = await fetch(chrome.runtime.getURL(path));
        if (!response.ok) {
          errors.push(`${path}: HTTP ${response.status}`);
          continue;
        }

        return response.arrayBuffer();
      } catch (error) {
        errors.push(`${path}: ${error.message}`);
      }
    }

    console.warn("[FLCE] Modele document introuvable", type, errors);
    throw new Error(`Modele ${type} introuvable dans src/templates.`);
  }

  async function loadCertificateImages(type) {
    if (state.imageCache[type]) return state.imageCache[type];

    const buffer = await loadTemplateBuffer(type);
    const entries = CERTIFICATE_IMAGE_ENTRIES[type] || {};
    const images = {};

    for (const [key, entryName] of Object.entries(entries)) {
      try {
        const bytes = await readZipEntry(buffer, entryName);
        images[key] = await pngBytesToJpegResource(bytes);
      } catch (error) {
        console.warn("[FLCE] Image modele indisponible", type, key, error);
      }
    }

    state.imageCache[type] = images;
    return images;
  }

  async function pngBytesToJpegResource(bytes) {
    const blob = new Blob([bytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);

    try {
      const image = await loadBrowserImage(url);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.94);
      const base64 = dataUrl.split(",")[1] || "";
      const binary = atob(base64);
      const jpegBytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        jpegBytes[index] = binary.charCodeAt(index);
      }

      return {
        width: canvas.width,
        height: canvas.height,
        hex: bytesToHex(jpegBytes)
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function loadBrowserImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Image illisible."));
      image.src = url;
    });
  }

  function bytesToHex(bytes) {
    let hex = "";
    for (let index = 0; index < bytes.length; index += 1) {
      hex += bytes[index].toString(16).padStart(2, "0");
    }
    return hex;
  }

  async function extractDocxParagraphs(buffer) {
    const xmlBytes = await readZipEntry(buffer, "word/document.xml");
    const xml = new TextDecoder("utf-8").decode(xmlBytes);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const paragraphs = [...doc.getElementsByTagName("w:p")];

    return paragraphs
      .map(readWordParagraph)
      .map(text => text.replace(/\s+\n/g, "\n").trim())
      .filter(text => text !== "");
  }

  function readWordParagraph(paragraph) {
    let text = "";

    function walk(node) {
      [...node.childNodes].forEach(child => {
        const name = child.localName || child.nodeName.replace(/^.*:/, "");

        if (name === "t") text += child.textContent || "";
        else if (name === "tab") text += " ";
        else if (name === "br") text += "\n";
        else walk(child);
      });
    }

    walk(paragraph);
    return text;
  }

  async function readZipEntry(buffer, expectedName) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let eocdOffset = -1;

    for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        eocdOffset = offset;
        break;
      }
    }

    if (eocdOffset === -1) throw new Error("Archive DOCX invalide.");

    const entryCount = view.getUint16(eocdOffset + 10, true);
    let directoryOffset = view.getUint32(eocdOffset + 16, true);
    const decoder = new TextDecoder("utf-8");

    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(directoryOffset, true) !== 0x02014b50) {
        throw new Error("Repertoire DOCX invalide.");
      }

      const method = view.getUint16(directoryOffset + 10, true);
      const compressedSize = view.getUint32(directoryOffset + 20, true);
      const nameLength = view.getUint16(directoryOffset + 28, true);
      const extraLength = view.getUint16(directoryOffset + 30, true);
      const commentLength = view.getUint16(directoryOffset + 32, true);
      const localOffset = view.getUint32(directoryOffset + 42, true);
      const nameBytes = bytes.slice(directoryOffset + 46, directoryOffset + 46 + nameLength);
      const name = decoder.decode(nameBytes);

      if (name === expectedName) {
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = bytes.slice(dataStart, dataStart + compressedSize);

        if (method === 0) return compressed;
        if (method === 8) return inflateRaw(compressed);

        throw new Error(`Compression DOCX non supportee: ${method}.`);
      }

      directoryOffset += 46 + nameLength + extraLength + commentLength;
    }

    throw new Error(`${expectedName} introuvable dans le modele.`);
  }

  async function inflateRaw(bytes) {
    if (!("DecompressionStream" in window)) {
      throw new Error("Decompression ZIP indisponible dans ce navigateur.");
    }

    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
  }

  function createCertificatePdf(type, context, images) {
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const page = buildCertificatePage(type, context, pageWidth, images);
    return buildPdfBlob([page], pageWidth, pageHeight);
  }

  function buildCertificatePage(type, context, pageWidth, images) {
    const lines = [];
    const imagePlacements = [];
    const drawings = [];
    const marginX = 82;
    const maxWidth = pageWidth - marginX * 2;
    let y = 648;

    const placeImage = (resource, x, bottomY, width) => {
      if (!resource?.hex || !resource.width || !resource.height) return;

      imagePlacements.push({
        resource,
        x,
        y: bottomY,
        width,
        height: width * resource.height / resource.width
      });
    };

    const rect = (x, bottomY, width, height) => {
      drawings.push({ type: "rect", x, y: bottomY, width, height });
    };

    placeImage(images?.logo, 48, 750, 58);
    placeImage(images?.footer, 132, 24, 332);

    const add = (text, x, options = {}) => {
      lines.push({
        text,
        x,
        y: options.y ?? y,
        size: options.size || 12,
        font: options.font || "F1"
      });
    };

    const center = (text, options = {}) => {
      const size = options.size || 12;
      const font = options.font || "F1";
      add(text, (pageWidth - pdfTextWidth(text, size, font)) / 2, { size, font, y: options.y });
    };

    const paragraph = (text, options = {}) => {
      const size = options.size || 12;
      const font = options.font || "F1";
      const lineHeight = options.lineHeight || 18;
      const indent = options.indent || 0;

      wrapPdfText(text, size, maxWidth - indent).forEach(line => {
        add(line, marginX + indent, { size, font });
        y -= lineHeight;
      });

      y -= options.after ?? 10;
    };

    const isPreinscription = type === "preinscription";
    const title = isPreinscription
      ? "ATTESTATION DE PRÉ-INSCRIPTION"
      : "ATTESTATION D'INSCRIPTION";
    const statusSentence = isPreinscription
      ? `Est pré-inscrit(e) aux cours de Français Langue et Culture Étrangère pour la saison ${context.Saison}.`
      : `Est inscrit(e) aux cours de Français Langue et Culture Étrangère pour la saison ${context.Saison}.`;
    const studySentence = isPreinscription
      ? `${context.Civilité} ${context.Nom} ${context.Prénom} consacrera 10 heures par semaine à l'étude du français.`
      : `${context.Civilité} ${context.Nom} ${context.Prénom} consacre 10 heures par semaine à l'étude du français.`;
    const feeSentence = isPreinscription
      ? `La totalité des frais de pré-inscription de ${context.Montant} non remboursables a été réglée.`
      : "La totalité des frais d'inscription non remboursables a été réglée.";

    rect(44, 704, 508, 34);
    center(title, { size: 15, font: "F2", y: 715 });
    y = 674;
    center(`SAISON ${context.Saison}`, { size: 13, font: "F2" });
    y -= 48;

    paragraph("Je, soussigné Franck MICHAUT, directeur de La CLEF, certifie que :", { after: 20 });

    center(`${context.Civilité} ${context.Nom} ${context.Prénom}`, { size: 12, font: "F2" });
    y -= 44;

    paragraph(statusSentence);
    paragraph(`L'étudiant(e) s'engage à assister aux cours de français du ${context["Début"]} au ${context.Fin}.`);
    paragraph(studySentence);
    paragraph(feeSentence);
    paragraph("Attestation faite de bonne foi pour servir ce que de droit.", { after: 34 });

    paragraph("A Saint-Germain-en-Laye,", { after: 6 });
    paragraph(`Le ${context.Date}`, { after: 16 });

    placeImage(images?.signature, 490, 238, 54);

    y = 244;
    add("Franck MICHAUT", 370, { size: 10 });
    y -= 14;
    add("Directeur", 370, { size: 10 });
    y -= 14;
    add("P/o François-Xavier PAIRAULT", 370, { size: 10 });
    y -= 14;
    add("Suivi étudiants FLCE", 370, { size: 10 });

    placeImage(images?.address, 370, 112, 126);

    return { lines, images: imagePlacements, drawings };
  }

  function wrapPdfText(text, fontSize, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    const approxCharWidth = fontSize * 0.52;
    const maxChars = Math.max(28, Math.floor(maxWidth / approxCharWidth));

    words.forEach(word => {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });

    if (line) lines.push(line);
    return lines;
  }

  function pdfTextWidth(text, fontSize, font) {
    const boldRatio = font === "F2" ? 0.56 : 0.52;
    return toPdfWinAnsi(text).length * fontSize * boldRatio;
  }

  function buildPdfBlob(pages, width, height) {
    const objects = [];
    const pageIds = [];

    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    objects.push("");
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

    pages.forEach(page => {
      const pageLines = Array.isArray(page) ? page : page.lines || [];
      const pageImages = Array.isArray(page) ? [] : page.images || [];
      const pageDrawings = Array.isArray(page) ? [] : page.drawings || [];
      const imageResources = [];

      pageImages.forEach((image, index) => {
        const imageId = objects.length + 1;
        const name = `Im${index + 1}`;
        imageResources.push({ ...image, id: imageId, name });
        objects.push(buildPdfImageObject(image.resource));
      });

      const imageContent = imageResources.map(image => (
        `q ${image.width.toFixed(2)} 0 0 ${image.height.toFixed(2)} ${image.x.toFixed(2)} ${image.y.toFixed(2)} cm /${image.name} Do Q`
      )).join("\n");
      const drawingContent = pageDrawings.map(drawing => {
        if (drawing.type === "rect") {
          return `q 0.6 w ${drawing.x.toFixed(2)} ${drawing.y.toFixed(2)} ${drawing.width.toFixed(2)} ${drawing.height.toFixed(2)} re S Q`;
        }

        return "";
      }).filter(Boolean).join("\n");
      const textContent = pageLines.map(line => (
        `BT /${line.font} ${line.size} Tf ${line.x.toFixed(2)} ${line.y.toFixed(2)} Td (${escapePdfText(line.text)}) Tj ET`
      )).join("\n");
      const content = [imageContent, drawingContent, textContent].filter(Boolean).join("\n");
      const contentId = objects.length + 1;

      objects.push(`<< /Length ${toPdfWinAnsi(content).length} >>\nstream\n${content}\nendstream`);

      const pageId = objects.length + 1;
      pageIds.push(pageId);
      const xObjects = imageResources.length
        ? `/XObject << ${imageResources.map(image => `/${image.name} ${image.id} 0 R`).join(" ")} >>`
        : "";
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xObjects} >> /Contents ${contentId} 0 R >>`);
    });

    objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

    const fixedObjects = objects.map((object, index) => `${index + 1} 0 obj\n${object}\nendobj\n`);
    let pdf = "%PDF-1.4\n";
    const offsets = [0];

    fixedObjects.forEach(object => {
      offsets.push(toPdfWinAnsi(pdf).length);
      pdf += object;
    });

    const xrefOffset = toPdfWinAnsi(pdf).length;
    pdf += `xref\n0 ${fixedObjects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset => {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });

    pdf += `trailer\n<< /Size ${fixedObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return new Blob([stringToBinary(toPdfWinAnsi(pdf))], { type: "application/pdf" });
  }

  function buildPdfImageObject(resource) {
    const stream = `${resource.hex}>`;
    return `<< /Type /XObject /Subtype /Image /Width ${resource.width} /Height ${resource.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }

  function escapePdfText(value) {
    return toPdfWinAnsi(value)
      .replaceAll("\\", "\\\\")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)");
  }

  function toPdfWinAnsi(value) {
    return String(value || "")
      .replaceAll("’", "'")
      .replaceAll("‘", "'")
      .replaceAll("“", '"')
      .replaceAll("”", '"')
      .replaceAll("–", "-")
      .replaceAll("—", "-")
      .replaceAll("œ", "oe")
      .replaceAll("Œ", "OE")
      .replaceAll("€", "EUR")
      .replace(/\u00a0/g, " ")
      .replace(/[^\x09\x0a\x0d\x20-\xff]/g, "");
  }

  function stringToBinary(value) {
    const bytes = new Uint8Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      bytes[index] = value.charCodeAt(index) & 0xff;
    }
    return bytes;
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function writePdfPreviewLoading(previewWindow) {
    if (!previewWindow) return;

    previewWindow.document.open();
    previewWindow.document.write(`
      <!doctype html>
      <html lang="fr">
        <head>
          <meta charset="utf-8">
          <title>Attestation FLCE</title>
          <style>
            body {
              align-items: center;
              background: #f4f6f8;
              color: #2f4050;
              display: flex;
              font: 14px Arial, sans-serif;
              height: 100vh;
              justify-content: center;
              margin: 0;
            }
          </style>
        </head>
        <body>Generation du PDF...</body>
      </html>
    `);
    previewWindow.document.close();
  }

  function openPdfPreview(blob, filename, previewWindow) {
    if (!previewWindow || previewWindow.closed) {
      downloadBlob(blob, filename);
      return;
    }

    const url = URL.createObjectURL(blob);
    const safeFilename = escapeHtml(filename);

    previewWindow.document.open();
    previewWindow.document.write(`
      <!doctype html>
      <html lang="fr">
        <head>
          <meta charset="utf-8">
          <title>${safeFilename}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              background: #eef1f5;
              color: #2f4050;
              font: 14px Arial, sans-serif;
              height: 100vh;
              margin: 0;
              overflow: hidden;
            }
            .bar {
              align-items: center;
              background: #fff;
              border-bottom: 1px solid #d9dee8;
              display: flex;
              gap: 10px;
              height: 54px;
              justify-content: space-between;
              padding: 10px 14px;
            }
            .title {
              font-weight: 700;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .actions {
              display: flex;
              gap: 8px;
              flex: none;
            }
            button,
            a {
              background: #8e24aa;
              border: 0;
              border-radius: 4px;
              color: #fff;
              cursor: pointer;
              font: 700 13px Arial, sans-serif;
              padding: 8px 12px;
              text-decoration: none;
            }
            button.secondary {
              background: #eef1f5;
              color: #2f4050;
            }
            iframe {
              border: 0;
              height: calc(100vh - 54px);
              width: 100vw;
            }
          </style>
        </head>
        <body>
          <div class="bar">
            <div class="title">${safeFilename}</div>
            <div class="actions">
              <a href="${url}" download="${safeFilename}">Telecharger</a>
              <button type="button" onclick="document.querySelector('iframe').contentWindow.print()">Imprimer</button>
              <button type="button" class="secondary" onclick="window.close()">Fermer</button>
            </div>
          </div>
          <iframe src="${url}" title="${safeFilename}"></iframe>
        </body>
      </html>
    `);
    previewWindow.document.close();

    setTimeout(() => URL.revokeObjectURL(url), 1000 * 60 * 10);
  }

  function sanitizeFilename(value) {
    return String(value || "")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      || "Adherent";
  }

  function updateSortIndicators() {
    ["auPair", "test", "solde", "note"].forEach(key => {
      const marker = document.querySelector(`#fx-sort-${key}`);
      if (!marker) return;
      marker.textContent = state.sortKey === key ? (state.sortDir === "asc" ? "▲" : "▼") : "↕";
    });

    const nom = document.querySelector("#fx-sort-nom");
    const prenom = document.querySelector("#fx-sort-prenom");

    if (nom) nom.textContent = state.sortKey === "nom" ? (state.sortDir === "asc" ? "▲" : "▼") : "↕";
    if (prenom) prenom.textContent = state.sortKey === "prenom" ? (state.sortDir === "asc" ? "▲" : "▼") : "↕";
  }

  function listenSeasonChange() {
    const select = document.querySelector("form.navbar-form-custom #season_id, #season_id");
    if (!select || select.dataset.fxFlceSeasonReady === "1") return;

    select.dataset.fxFlceSeasonReady = "1";
    select.addEventListener("change", () => {
      state.students = [];
      state.classFilter = "all";
      state.lastSeasonId = null;
      renderDocumentSettings();
    });
  }

  function getCurrentSeason() {
    const select = document.querySelector("form.navbar-form-custom #season_id, #season_id");
    return {
      id: select?.value || "",
      label: select?.selectedOptions?.[0]?.textContent?.trim() || "Saison sélectionnée"
    };
  }

  function setStatus(message) {
    const el = document.querySelector("#fx-flce-status");
    if (el) el.textContent = message;
  }

  function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = String(html || "");
    return div.textContent.trim();
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function injectStyle() {
    if (document.querySelector("#fx-flce-style")) return;

    const style = document.createElement("style");
    style.id = "fx-flce-style";
    style.textContent = `
      #fx-flce-nav-item.active > a {
        background: #8e24aa !important;
        color: #fff !important;
      }

      #fx-flce-page {
        padding: 0 !important;
      }

      #fx-flce-page .page-heading {
        margin: 0 -15px 20px -15px;
        padding: 0 10px 20px 10px;
      }

      #fx-flce-page > .wrapper-content {
        padding: 0 10px 40px;
      }

      #fx-flce-page .page-heading h2 {
        color: #2f4050;
        font-size: 26px;
        font-weight: 600;
        margin-top: 20px;
      }

      .fx-flce-card {
        background: #fff;
        padding: 16px;
      }

      .fx-flce-tabs {
        border-bottom: 1px solid #e7eaec;
        display: flex;
        gap: 4px;
        margin-bottom: 16px;
      }

      .fx-flce-tab {
        background: #f9f9f9;
        border: 1px solid #e7eaec;
        border-bottom: 0;
        color: #676a6c;
        cursor: pointer;
        font-weight: 600;
        padding: 10px 15px;
      }

      .fx-flce-tab.is-active {
        background: #fff;
        color: #8e24aa;
      }

      .fx-flce-tab span {
        background: #ddd;
        border-radius: 10px;
        color: #555;
        font-size: 11px;
        margin-left: 6px;
        padding: 2px 6px;
      }

      .fx-flce-filters {
        margin-bottom: 18px;
      }

      .fx-flce-actions-row {
        align-items: center;
        color: #676a6c;
        display: flex;
        justify-content: space-between;
        margin: 10px 0 12px;
      }

      .fx-flce-document-settings {
        background: #f7f8fb;
        border: 1px solid #e7eaec;
        border-left: 4px solid #8e24aa;
        margin: 0 0 16px;
        padding: 14px;
      }

      .fx-flce-settings-title {
        align-items: center;
        display: flex;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .fx-flce-settings-title span {
        color: #7f8897;
        font-size: 12px;
      }

      .fx-flce-settings-action {
        padding-top: 24px;
      }

      .fx-flce-doc-actions {
        white-space: nowrap;
      }

      .fx-flce-doc-btn + .fx-flce-doc-btn {
        margin-left: 6px;
      }

      #fx-flce-status {
        color: #676a6c;
        font-size: 13px;
      }

      .fx-sortable {
        cursor: pointer;
        user-select: none;
      }

      .fx-sortable span {
        color: #c3c7cc;
        font-size: 11px;
        margin-left: 6px;
      }

      .fx-flce-table td,
      .fx-flce-table th {
        vertical-align: middle !important;
      }

      .fx-flce-yesno-select {
        min-width: 72px;
        width: 72px;
      }

      .fx-flce-note-input {
        min-width: 180px;
      }
    `;

    document.head.appendChild(style);
  }

  init();
})();
