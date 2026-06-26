(function () {
  "use strict";

  const FX = window.FXLaclefExtension;
  if (!FX || window.__fxAniappsFamilyBalancesLoaded) return;
  window.__fxAniappsFamilyBalancesLoaded = true;

  const HASH = "#soldes-familles";
  const PAGE_URL = "/admin#soldes-familles";
  const CONTACTS_SOURCE_CACHE_KEY = "fx_family_balances_contacts_source_v1";
  const SETTINGS_KEY = "fx_family_balances_settings_v1";
  const FAMILY_CACHE_TTL_MS = 1000 * 60 * 5;

  const DEFAULT_SETTINGS = {
    seasonId: ""
  };

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    rows: [],
    loading: false,
    menuTimer: null,
    familyCache: new Map()
  };

  FX.onPageChange(init);
  window.addEventListener("hashchange", init);
  window.addEventListener("load", init);

  document.addEventListener("click", event => {
    const nav = event.target.closest("#fx-family-balances-nav-item, #fx-family-balances-nav-item a");
    if (!nav) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    goToPage();
  }, true);

  new MutationObserver(() => {
    if (!document.querySelector("#fx-family-balances-nav-item")) scheduleMenuSync();
  }).observe(document.documentElement, { childList: true, subtree: true });

  setInterval(scheduleMenuSync, 1000);

  function init() {
    scheduleMenuSync();

    if (isPage()) {
      restoreOwnPage();
      setTimeout(renderPage, 80);
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

    if (location.hash !== HASH) window.location.hash = HASH.slice(1);
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

    let li = document.querySelector("#fx-family-balances-nav-item");

    if (!li) {
      li = document.createElement("li");
      li.id = "fx-family-balances-nav-item";
      li.innerHTML = `
        <a href="${PAGE_URL}" data-turbolinks="false">
          <i class="fa fa-eur"></i>
          <span class="nav-label">Soldes familles</span>
        </a>
      `;
    }

    if (!li.parentElement) {
      sideMenu.appendChild(li);
    }

    syncCustomSidebarOrder(sideMenu);
    li.style.display = "";
    highlightSidebar(isPage());
  }

  function syncCustomSidebarOrder(sideMenu) {
    const ordered = [
      document.querySelector("#fx-flce-nav-item"),
      document.querySelector("#fx-music-members-nav-item"),
      document.querySelector("#fx-family-balances-nav-item")
    ].filter(item => item?.parentElement === sideMenu);
    const familles = [...sideMenu.querySelectorAll(":scope > li")].find(item => getTopLabel(item) === "Familles");
    if (!familles || !ordered.length) return;

    let anchor = familles;
    [...ordered].reverse().forEach(item => {
      if (item.nextElementSibling !== anchor) {
        anchor.insertAdjacentElement("beforebegin", item);
      }
      anchor = item;
    });
  }

  function getTopLabel(li) {
    return cleanText(li.querySelector(":scope > a .nav-label")?.textContent || "");
  }

  function highlightSidebar(active) {
    const li = document.querySelector("#fx-family-balances-nav-item");
    if (!li) return;

    if (active) {
      document.querySelectorAll("#side-menu li").forEach(item => item.classList.remove("active"));
      li.classList.add("active");
    } else {
      li.classList.remove("active");
    }
  }

  function restoreOwnPage() {
    document.querySelector("#fx-family-balances-page")?.remove();

    document.querySelectorAll("[data-fx-family-balances-hidden='1']").forEach(el => {
      el.style.display = el.dataset.fxFamilyBalancesOldDisplay || "";
      delete el.dataset.fxFamilyBalancesHidden;
      delete el.dataset.fxFamilyBalancesOldDisplay;
    });
  }

  function hideNativePage(wrapper) {
    [...wrapper.children].forEach(child => {
      if (child.id === "fx-family-balances-page") return;
      if (child.matches(".row.border-bottom, nav.navbar-static-top, .navbar-static-top")) return;

      if (child.dataset.fxFamilyBalancesHidden !== "1") {
        child.dataset.fxFamilyBalancesHidden = "1";
        child.dataset.fxFamilyBalancesOldDisplay = child.style.display || "";
      }

      child.style.display = "none";
    });
  }

  async function renderPage() {
    const wrapper = document.querySelector("#page-wrapper");
    if (!wrapper) return;

    document.title = "La CLEF - Soldes familles";
    highlightSidebar(true);
    hideNativePage(wrapper);
    injectStyle();

    await loadSettings();

    let page = document.querySelector("#fx-family-balances-page");
    if (!page) {
      page = document.createElement("div");
      page.id = "fx-family-balances-page";
      page.className = "fx-fb-root";
      page.innerHTML = `
        <div class="row wrapper border-bottom page-heading">
          <div class="col-lg-10">
            <h2>Soldes familles</h2>
            <ol class="breadcrumb">
              <li><a href="/admin">Accueil</a></li>
              <li class="active"><strong>Soldes familles</strong></li>
            </ol>
          </div>
        </div>

        <div class="wrapper wrapper-content animated fadeInRight">
          <div class="ibox-content fx-fb-card">
            <div class="fx-laclef-form-grid fx-laclef-form-grid-compact">
              <div class="fx-laclef-field">
                <label for="fx-fb-season">Saison</label>
                <select id="fx-fb-season"></select>
              </div>
              <div class="fx-laclef-field">
                <label for="fx-fb-count">Familles</label>
                <input id="fx-fb-count" readonly>
              </div>
              <div class="fx-laclef-field">
                <label for="fx-fb-email-count">Mails</label>
                <input id="fx-fb-email-count" readonly>
              </div>
              <div class="fx-laclef-field fx-laclef-field-full">
                <label for="fx-fb-paste">Mails Google Sheets</label>
                <textarea id="fx-fb-paste" spellcheck="false" placeholder="mail@example.com&#10;autre.mail@example.com"></textarea>
                <div class="fx-laclef-note">
                  Colle une colonne ou une selection Google Sheets. Les mails sont detectes automatiquement, dedoublonnes, puis regroupes par famille.
                </div>
              </div>
            </div>

            <div class="fx-fb-actions">
              <span id="fx-fb-status">Colle une liste de mails puis clique sur Chercher familles.</span>
              <div>
                <button type="button" class="btn btn-default btn-sm" id="fx-fb-read-clipboard">
                  <i class="fa fa-clipboard"></i> Lire presse-papiers
                </button>
                <button type="button" class="btn btn-default btn-sm" id="fx-fb-preview">
                  <i class="fa fa-eye"></i> Previsualiser
                </button>
                <button type="button" class="btn btn-primary btn-sm" id="fx-fb-search">
                  <i class="fa fa-search"></i> Chercher familles
                </button>
                <button type="button" class="btn btn-default btn-sm" id="fx-fb-copy">
                  <i class="fa fa-copy"></i> Copier export
                </button>
              </div>
            </div>

            <div class="table-responsive fx-fb-table-wrap">
              <table class="table table-striped table-bordered table-hover fx-fb-table">
                <thead>
                  <tr>
                    <th>Statut</th>
                    <th>Mails source</th>
                    <th>ID famille</th>
                    <th>Nom de la famille</th>
                    <th>Justificatif valide</th>
                    <th>Souscriptions par adherent</th>
                    <th>Solde global</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="fx-fb-tbody"></tbody>
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
    page.querySelector("#fx-fb-preview").addEventListener("click", () => {
      persistSettingsFromPage(page);
      previewFromTextarea(page);
    });

    page.querySelector("#fx-fb-search").addEventListener("click", () => {
      persistSettingsFromPage(page);
      searchFamiliesFromTextarea(page, false).catch(error => {
        console.error("[Soldes familles] Recherche impossible", error);
        setStatus(error.message || "Recherche impossible.");
      });
    });

    page.querySelector("#fx-fb-copy").addEventListener("click", copyExport);

    page.querySelector("#fx-fb-read-clipboard").addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) page.querySelector("#fx-fb-paste").value = text;
      } catch (error) {
        FX.notify(error.message || "Lecture du presse-papiers impossible.", "Soldes familles");
      }
    });

    page.addEventListener("change", event => {
      if (!event.target.matches("#fx-fb-season")) return;
      persistSettingsFromPage(page);
      state.familyCache.clear();
      state.rows.forEach(row => {
        if (row.familyId) {
          row.status = "A rafraichir";
          row.statusType = "warning";
          row.details = "La saison a change. Relance la recherche pour recalculer cette famille.";
        }
      });
      renderRows();
    });

    page.addEventListener("click", event => {
      const button = event.target.closest("[data-fx-fb-action]");
      if (!button) return;

      event.preventDefault();
      handleRowAction(button).catch(error => {
        console.error("[Soldes familles] Action impossible", error);
        FX.notify(error.message || "Action impossible.", "Soldes familles");
      });
    });
  }

  async function loadSettings() {
    const stored = await FX.storage.get(SETTINGS_KEY).catch(() => null);
    const currentSeason = getCurrentSeason();
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...(stored || {})
    };

    if (currentSeason.id) {
      state.settings.seasonId = currentSeason.id;
    } else if (!state.settings.seasonId) {
      state.settings.seasonId = "";
    }
  }

  function fillSettings(page) {
    ensureSeasonOptions(page.querySelector("#fx-fb-season"));
    page.querySelector("#fx-fb-season").value = state.settings.seasonId || getCurrentSeason().id || "";
    updateCounts();
  }

  function persistSettingsFromPage(page) {
    state.settings = {
      seasonId: cleanText(page.querySelector("#fx-fb-season").value)
    };

    FX.storage.set(SETTINGS_KEY, state.settings).catch(() => {});
  }

  function previewFromTextarea(page) {
    const emails = extractEmails(page.querySelector("#fx-fb-paste").value);
    state.rows = emails.map(email => ({
      key: `email:${email}`,
      sourceEmails: [email],
      familyId: "",
      status: "Pret",
      statusType: "muted",
      details: ""
    }));
    renderRows();
    setStatus(`${emails.length} mail(s) detecte(s).`);
  }

  async function searchFamiliesFromTextarea(page, forceRefresh) {
    if (state.loading) return;

    const emails = extractEmails(page.querySelector("#fx-fb-paste").value);
    if (!emails.length) {
      FX.notify("Aucun mail detecte dans la selection.", "Soldes familles");
      return;
    }

    state.loading = true;
    state.rows = emails.map(email => ({
      key: `email:${email}`,
      sourceEmails: [email],
      familyId: "",
      status: "Recherche...",
      statusType: "muted",
      details: ""
    }));
    renderRows();

    try {
      const families = new Map();
      const unresolved = [];

      for (let index = 0; index < emails.length; index += 1) {
        const email = emails[index];
        setStatus(`Recherche contact ${index + 1}/${emails.length} : ${email}`);

        try {
          const matches = await resolveFamiliesForEmail(email);
          if (!matches.length) {
            unresolved.push({
              key: `unresolved:${email}`,
              sourceEmails: [email],
              familyId: "",
              status: "Introuvable",
              statusType: "danger",
              details: "Aucune famille trouvee avec ce mail."
            });
            continue;
          }

          matches.forEach(match => {
            const existing = families.get(match.familyId) || {
              key: `family:${match.familyId}`,
              sourceEmails: [],
              familyId: match.familyId,
              familyUrl: `/admin/families/${match.familyId}/contacts`,
              status: "Famille trouvee",
              statusType: "muted",
              details: ""
            };

            if (!existing.sourceEmails.includes(email)) existing.sourceEmails.push(email);
            families.set(match.familyId, existing);
          });
        } catch (error) {
          unresolved.push({
            key: `error:${email}`,
            sourceEmails: [email],
            familyId: "",
            status: "Erreur",
            statusType: "danger",
            details: error.message || String(error)
          });
        }

        state.rows = [...families.values(), ...unresolved];
        renderRows();
        await FX.wait(90);
      }

      const rows = [...families.values(), ...unresolved];
      state.rows = rows;

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (!row.familyId) continue;

        row.status = "Lecture famille...";
        row.statusType = "muted";
        row.details = "";
        renderRows();
        setStatus(`Lecture famille ${index + 1}/${rows.length} : ${row.familyId}`);

        try {
          const snapshot = await fetchFamilySnapshot(row.familyId, getSelectedSeason(), forceRefresh);
          Object.assign(row, snapshot, {
            status: "OK",
            statusType: "ok",
            details: ""
          });
        } catch (error) {
          row.status = "Erreur famille";
          row.statusType = "danger";
          row.details = error.message || String(error);
        }

        renderRows();
        await FX.wait(120);
      }

      const okCount = state.rows.filter(row => row.familyId && row.statusType === "ok").length;
      const missingCount = state.rows.filter(row => !row.familyId || row.statusType === "danger").length;
      setStatus(`Recherche terminee : ${okCount} famille(s), ${missingCount} mail(s) a verifier.`);
    } finally {
      state.loading = false;
      renderRows();
    }
  }

  async function resolveFamiliesForEmail(email) {
    const candidates = await fetchContactFamiliesByEmail(email);
    const output = [];
    const seen = new Set();

    for (const candidate of candidates) {
      let familyId = candidate.familyId || "";
      if (!familyId && candidate.contactId) {
        familyId = await fetchFamilyIdFromContact(candidate.contactId);
      }

      if (!familyId || seen.has(familyId)) continue;
      seen.add(familyId);
      output.push({ familyId, candidate });
    }

    return output;
  }

  async function fetchContactFamiliesByEmail(email) {
    const source = await getContactsDataSource();
    const sources = [...new Set([source, "/admin/contacts", "/admin/contacts.json"])];
    let lastError = null;

    for (const item of sources) {
      try {
        const records = await fetchContactRecords(item, email);
        if (records.length) {
          return records
            .map(parseContactSearchRecord)
            .filter(record => record.familyId || record.contactId || record.email);
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) throw lastError;
    return [];
  }

  async function fetchContactRecords(source, email) {
    const url = new URL(source, location.origin);
    addContactsDataTableParams(url, email);

    const response = await fetch(url.toString(), {
      credentials: "include",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    if (!response.ok) throw new Error(`Recherche contacts HTTP ${response.status}`);

    const data = await response.json();
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
    url.searchParams.set("length", "50");
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
      email: stripHtml(firstRecordValue(record, ["email", "mail"], 4)),
      raw: record
    };
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

        if (!response.ok) continue;

        const finalUrl = response.url || "";
        const fromUrl = finalUrl.match(/\/admin\/families\/(\d+)\/contacts/)?.[1] ||
          finalUrl.match(/\/families\/(\d+)\/contacts/)?.[1];
        if (fromUrl) return fromUrl;

        const html = await response.text();
        const fromHtml = html.match(/\/admin\/families\/(\d+)\/contacts/)?.[1] ||
          html.match(/\/families\/(\d+)\/contacts/)?.[1];
        if (fromHtml) return fromHtml;
      } catch {
        // Try the next contact URL shape.
      }
    }

    return "";
  }

  async function fetchFamilySnapshot(familyId, season, forceRefresh) {
    const cacheKey = `${familyId}:${season.id || season.label || "current"}`;
    const cached = state.familyCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.updatedAt < FAMILY_CACHE_TTL_MS) {
      return cached.value;
    }

    const [family, registrations] = await Promise.all([
      fetchFamilyMembers(familyId, season),
      fetchFamilyRegistrations(familyId)
    ]);
    const activeRegistrationsAllSeasons = registrations.filter(registrationIsActive);
    const activeRegistrationsForSeason = activeRegistrationsAllSeasons.filter(item => registrationMatchesSeason(item, season));
    const activeRegistrations = activeRegistrationsForSeason.length
      ? activeRegistrationsForSeason
      : activeRegistrationsAllSeasons;
    const subscriptionsByMember = groupSubscriptionsByMember(activeRegistrations, family.members);
    const value = {
      familyId,
      familyUrl: `/admin/families/${familyId}/contacts`,
      familyName: family.info.name,
      familyEmail: family.info.email,
      addressProofValidated: family.info.addressProofValidated,
      balanceText: family.info.balanceText,
      balanceCents: family.info.balanceCents,
      subscriptionsByMember,
      activeRegistrations,
      registrationStats: {
        total: registrations.length,
        active: activeRegistrationsAllSeasons.length,
        activeSeason: activeRegistrationsForSeason.length,
        fallbackAllActive: !activeRegistrationsForSeason.length && activeRegistrationsAllSeasons.length > 0
      }
    };

    state.familyCache.set(cacheKey, {
      updatedAt: Date.now(),
      value
    });
    return value;
  }

  async function fetchFamilyMembers(familyId, season) {
    const response = await fetch(`/admin/families/${familyId}/contacts`, {
      credentials: "include",
      headers: { Accept: "text/html" }
    });

    if (!response.ok) throw new Error(`Famille ${familyId} HTTP ${response.status}`);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = doc.querySelector('table[data-datatable="contacts"]') || doc.querySelector("table");
    const source = table?.getAttribute("data-source");
    const info = parseFamilyInfo(doc, familyId, season);
    const jsonMembers = source ? await fetchFamilyMembersFromJson(familyId, source) : [];

    return {
      familyId,
      info,
      members: jsonMembers.length ? jsonMembers : parseFamilyMembersTable(familyId, table)
    };
  }

  function parseFamilyInfo(doc, familyId, season) {
    const heading = cleanText(doc.querySelector(".page-heading h2, h2")?.textContent || "");
    const byLabel = (label, root = doc) => {
      const entry = [...root.querySelectorAll(".datalist-entry")].find(item => (
        normalize(item.querySelector("dt")?.textContent || "") === normalize(label)
      ));
      return cleanText(entry?.querySelector("dd")?.textContent || "");
    };

    const nameFromHeading = heading.replace(new RegExp(`\\s*#${familyId}\\s*$`), "");
    const representativeName = [byLabel("Prenom"), byLabel("Nom")].filter(Boolean).join(" ");
    const seasonPanel = findSeasonPanel(doc, season);
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
    const balanceText = readDefinitionValue(seasonPanel || doc, "Solde");

    return {
      name: nameFromHeading || representativeName || `Famille ${familyId}`,
      email: byLabel("Email"),
      phone: byLabel("Telephone mobile") || byLabel("Telephone fixe"),
      addressProofValidated,
      balanceText,
      balanceCents: parseEuroCents(balanceText)
    };
  }

  function findSeasonPanel(doc, season) {
    const wanted = normalizeSeasonLabel(season?.label || "");
    const panels = [...doc.querySelectorAll(".sidebar-information .panel, .panel, .ibox")];

    return panels.find(panel => {
      const heading = panel.querySelector(":scope > .panel-heading, .ibox-title, h2, h3, h4, strong");
      const headingText = normalizeSeasonLabel(heading?.textContent || "");
      return wanted && headingText.includes(wanted);
    }) || panels.find(panel => {
      const text = normalize(panel.textContent || "");
      return text.includes("commande") && text.includes("total paye") && text.includes("solde");
    }) || null;
  }

  async function fetchFamilyMembersFromJson(familyId, source) {
    const url = new URL(source, location.origin);
    addFamilyContactsDataTableParams(url);

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
    return records.map(record => parseFamilyMemberRecord(familyId, record)).filter(member => (
      member.nom || member.prenom || member.contactId
    ));
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
      const contactId = extractContactIdFromHtml(row.innerHTML);
      return {
        contactId,
        contactUrl: contactId ? `/admin/families/${familyId}/contacts/${contactId}` : "",
        nom: cellText(cells, nomIndex),
        prenom: cellText(cells, prenomIndex),
        age: ageIndex >= 0 ? cellText(cells, ageIndex) : ""
      };
    }).filter(member => member.nom || member.prenom || member.contactId);
  }

  async function fetchFamilyRegistrations(familyId) {
    const response = await fetch(`/admin/families/${familyId}/registrations`, {
      credentials: "include",
      headers: { Accept: "text/html" }
    });

    if (!response.ok) throw new Error(`Souscriptions famille ${familyId} HTTP ${response.status}`);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = doc.querySelector("table[data-source*='registrations'], table[data-source*='registration'], table[data-datatable], table");
    const source = table?.getAttribute("data-source") ||
      doc.querySelector("[data-source*='registrations'], [data-source*='registration']")?.getAttribute("data-source") ||
      "";
    const jsonRecords = source ? await fetchFamilyRegistrationsFromJson(source) : [];

    return jsonRecords.length ? jsonRecords : parseFamilyRegistrationsTable(table);
  }

  async function fetchFamilyRegistrationsFromJson(source) {
    const url = new URL(source, location.origin);
    addRegistrationsDataTableParams(url);

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
    url.searchParams.set("length", "200");
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
      invoice: headerIndex(headers, "numero de facture", 3),
      createdAt: headerIndex(headers, "cree le", 4),
      validFrom: headerIndex(headers, "valide des le", 5),
      total: headerIndex(headers, "prix total", 6),
      stopDate: headerIndex(headers, "date d'arret", 7),
      state: headerIndex(headers, "etat", 9)
    };

    return [...(table?.querySelectorAll("tbody tr") || [])].map(row => {
      const cells = [...row.querySelectorAll("td")];
      return {
        member: cellText(cells, indexes.member),
        type: cellText(cells, indexes.type),
        product: cellText(cells, indexes.product),
        invoice: cellText(cells, indexes.invoice),
        createdAt: cellText(cells, indexes.createdAt),
        validFrom: cellText(cells, indexes.validFrom),
        total: cellText(cells, indexes.total),
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
      invoice: stripHtml(firstRecordValue(record, ["invoice_number", "invoice", "facture"], 3)),
      createdAt: stripHtml(firstRecordValue(record, ["created_at", "created", "cree_le"], 4)),
      validFrom: stripHtml(firstRecordValue(record, ["valid_from", "valid_from_on", "valide_des_le"], 5)),
      total: stripHtml(firstRecordValue(record, ["total", "price", "prix"], 6)),
      stopDate: stripHtml(firstRecordValue(record, ["stop_date", "date_stop", "date_arret"], 7)),
      state: stripHtml(firstRecordValue(record, ["state", "etat"], 9)),
      raw: stripHtml(html)
    };
  }

  function registrationIsActive(item) {
    return !registrationHasStoppedState(item);
  }

  function registrationHasStoppedState(item) {
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
    return Boolean(stopDate && /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}/.test(stopDate));
  }

  function registrationMatchesSeason(item, season) {
    const text = normalize([item.type, item.product, item.validFrom, item.createdAt, item.raw].join(" "));
    const years = seasonYears(season);
    if (!years) return true;

    const full = `${years.start}-${years.end}`;
    const spaced = `${years.start} ${years.end}`;
    const short = `${String(years.start).slice(2)}-${String(years.end).slice(2)}`;
    if (text.includes(normalize(full)) || text.includes(normalize(spaced)) || text.includes(normalize(short))) {
      return true;
    }

    const date = parseDateValue(item.validFrom || item.createdAt || "");
    if (!date) {
      return !/\b20\d{2}\s*[-/]\s*20\d{2}\b|\b\d{2}\s*[-/]\s*\d{2}\b/.test(text);
    }

    const seasonStart = new Date(years.start, 6, 1);
    const seasonEnd = new Date(years.end, 7, 31, 23, 59, 59);
    return date >= seasonStart && date <= seasonEnd;
  }

  function groupSubscriptionsByMember(registrations, members) {
    const groups = new Map();

    members.forEach(member => {
      const label = memberLabel(member);
      if (label) groups.set(normalize(label), { label, items: [] });
    });

    registrations.forEach(item => {
      const member = cleanText(item.member || "Famille");
      const key = normalize(member) || "famille";
      if (!groups.has(key)) groups.set(key, { label: member || "Famille", items: [] });
      groups.get(key).items.push({
        label: subscriptionLabel(item),
        price: cleanText(item.total || ""),
        type: cleanText(item.type || ""),
        state: cleanText(item.state || ""),
        total: cleanText(item.total || "")
      });
    });

    return [...groups.values()]
      .filter(group => group.items.length)
      .sort((a, b) => normalize(a.label).localeCompare(normalize(b.label)));
  }

  function registrationLabel(item) {
    const subscription = subscriptionLabel(item);
    const total = cleanText(item.total || "");
    return [subscription, total].filter(Boolean).join(" - ") || cleanText(item.raw || "");
  }

  function subscriptionLabel(item) {
    const type = cleanText(item.type || "");
    const product = cleanText(item.product || "");
    const parts = [];

    if (type && !normalize(product).includes(normalize(type))) parts.push(type);
    if (product) parts.push(product);

    return parts.join(" - ") || cleanText(item.raw || "");
  }

  function memberLabel(member) {
    return [member.nom, member.prenom].filter(Boolean).join(" ");
  }

  function renderRows() {
    const tbody = document.querySelector("#fx-fb-tbody");
    if (!tbody) return;

    updateCounts();

    tbody.innerHTML = state.rows.length
      ? state.rows.map((row, index) => renderRow(row, index)).join("")
      : `<tr><td colspan="8" class="text-center text-muted">Aucun mail previsualise.</td></tr>`;
  }

  function renderRow(row, index) {
    return `
      <tr>
        <td>
          <span class="fx-compare-badge ${badgeClass(row.statusType)}">${escapeHtml(row.status || "Pret")}</span>
          ${row.details ? `<pre>${escapeHtml(row.details)}</pre>` : ""}
        </td>
        <td>${renderEmailList(row.sourceEmails)}</td>
        <td>${row.familyId ? `<code>${escapeHtml(row.familyId)}</code>` : "-"}</td>
        <td>${row.familyName ? escapeHtml(row.familyName) : "-"}</td>
        <td>${renderYesNo(row.addressProofValidated)}</td>
        <td>${renderSubscriptions(row.subscriptionsByMember, row.registrationStats)}</td>
        <td>${renderBalance(row.balanceCents, row.balanceText)}</td>
        <td class="fx-fb-row-actions">
          <button type="button" class="btn btn-xs btn-default" data-fx-fb-action="search" data-row-index="${index}">Chercher</button>
          ${row.familyId ? `<button type="button" class="btn btn-xs btn-default" data-fx-fb-action="family" data-row-index="${index}">Famille</button>` : ""}
        </td>
      </tr>
    `;
  }

  function renderEmailList(emails) {
    const list = Array.isArray(emails) ? emails : [];
    return list.length
      ? list.map(email => `<code>${escapeHtml(email)}</code>`).join("<br>")
      : "-";
  }

  function renderYesNo(value) {
    if (value === true) return `<span class="fx-fb-check fx-fb-check-ok">Oui</span>`;
    if (value === false) return `<span class="fx-fb-check fx-fb-check-no">Non</span>`;
    return `<span class="fx-fb-check fx-fb-check-muted">-</span>`;
  }

  function renderSubscriptions(groups, stats) {
    if (!Array.isArray(groups) || !groups.length) {
      const total = Number(stats?.total || 0);
      const active = Number(stats?.active || 0);
      const activeSeason = Number(stats?.activeSeason || 0);
      const detail = total
        ? ` (${total} lue(s), ${active} active(s), ${activeSeason} sur la saison)`
        : "";
      return `<span class="text-muted">Aucune souscription active trouvee sur la saison${escapeHtml(detail)}.</span>`;
    }

    const fallback = stats?.fallbackAllActive
      ? `<div class="fx-fb-subscriptions-warning">Saison non retrouvee dans les souscriptions : affichage des souscriptions actives lues.</div>`
      : "";
    const rows = groups.flatMap(group => group.items.map(item => `
      <div class="fx-fb-subscription-row">
        <strong>${escapeHtml(group.label)}</strong>
        <span>${escapeHtml(item.label)}</span>
        <em>${escapeHtml(item.price || "-")}</em>
      </div>
    `)).join("");

    return `${fallback}<div class="fx-fb-subscription-list">${rows}</div>`;
  }

  function renderBalance(cents, fallbackText) {
    if (!Number.isFinite(cents)) {
      return fallbackText ? escapeHtml(fallbackText) : `<span class="text-muted">-</span>`;
    }

    if (cents > 0) {
      return `<strong class="text-danger">A payer : ${escapeHtml(formatEuro(cents))}</strong>`;
    }

    if (cents < 0) {
      return `<strong class="text-success">Avoir : ${escapeHtml(formatEuro(Math.abs(cents)))}</strong>`;
    }

    return `<strong class="text-success">Solde : 0,00 EUR</strong>`;
  }

  function badgeClass(type) {
    if (type === "ok") return "fx-compare-badge-ok";
    if (type === "danger") return "fx-compare-badge-danger";
    if (type === "warning") return "fx-compare-badge-warning";
    return "fx-compare-badge-muted";
  }

  async function handleRowAction(button) {
    const row = state.rows[Number(button.dataset.rowIndex)];
    if (!row) return;

    if (button.dataset.fxFbAction === "search") {
      await refreshRow(row, Number(button.dataset.rowIndex));
      return;
    }

    if (button.dataset.fxFbAction === "family" && row.familyId) {
      window.open(row.familyUrl || `/admin/families/${row.familyId}/contacts`, "_blank", "noopener");
    }
  }

  async function refreshRow(row, index) {
    if (state.loading) return;

    state.loading = true;
    row.status = "Recherche...";
    row.statusType = "muted";
    row.details = "";
    renderRows();

    try {
      let familyId = row.familyId || "";

      if (!familyId) {
        const emails = Array.isArray(row.sourceEmails) ? row.sourceEmails : [];
        for (const email of emails) {
          const matches = await resolveFamiliesForEmail(email);
          if (matches[0]?.familyId) {
            familyId = matches[0].familyId;
            break;
          }
        }
      }

      if (!familyId) {
        row.status = "Introuvable";
        row.statusType = "danger";
        row.details = "Aucune famille trouvee avec ce mail.";
        return;
      }

      row.familyId = familyId;
      row.familyUrl = `/admin/families/${familyId}/contacts`;
      row.status = "Lecture famille...";
      renderRows();
      setStatus(`Mise a jour ${index + 1}/${state.rows.length} : famille ${familyId}`);

      const snapshot = await fetchFamilySnapshot(familyId, getSelectedSeason(), true);
      Object.assign(row, snapshot, {
        status: "OK",
        statusType: "ok",
        details: ""
      });
      setStatus(`Famille ${familyId} mise a jour.`);
    } catch (error) {
      row.status = "Erreur";
      row.statusType = "danger";
      row.details = error.message || String(error);
    } finally {
      state.loading = false;
      renderRows();
    }
  }

  async function copyExport() {
    const headers = [
      "Mails source",
      "ID famille",
      "Nom de la famille",
      "Justificatif valide",
      "Souscriptions par adherent",
      "Solde global",
      "Statut"
    ];
    const lines = state.rows.map(row => [
      (row.sourceEmails || []).join(", "),
      row.familyId || "",
      row.familyName || "",
      row.addressProofValidated === true ? "Oui" : row.addressProofValidated === false ? "Non" : "",
      exportSubscriptions(row.subscriptionsByMember),
      exportBalance(row.balanceCents, row.balanceText),
      row.status || ""
    ].map(tsvCell).join("\t"));

    try {
      await navigator.clipboard.writeText([headers.join("\t"), ...lines].join("\n"));
      FX.notify(`${state.rows.length} ligne(s) copiee(s).`, "Soldes familles");
    } catch (error) {
      FX.notify(error.message || "Copie impossible.", "Soldes familles");
    }
  }

  function exportSubscriptions(groups) {
    if (!Array.isArray(groups) || !groups.length) return "";
    return groups.map(group => (
      group.items.map(item => `${group.label} | ${item.label} | ${item.price || ""}`).join(" ; ")
    )).join(" ; ");
  }

  function exportBalance(cents, fallbackText) {
    if (!Number.isFinite(cents)) return fallbackText || "";
    if (cents > 0) return `A payer : ${formatEuro(cents)}`;
    if (cents < 0) return `Avoir : ${formatEuro(Math.abs(cents))}`;
    return "Solde : 0,00 EUR";
  }

  function updateCounts() {
    const familyCount = document.querySelector("#fx-fb-count");
    const emailCount = document.querySelector("#fx-fb-email-count");
    if (familyCount) familyCount.value = String(state.rows.filter(row => row.familyId).length || 0);
    if (emailCount) {
      const emails = new Set(state.rows.flatMap(row => row.sourceEmails || []));
      emailCount.value = String(emails.size || 0);
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
    return getSeasonOptions().find(option => option.id === selectedId) ||
      getCurrentSeason() ||
      { id: selectedId, label: "" };
  }

  function getCurrentSeason() {
    const select = document.querySelector("form.navbar-form-custom #season_id, #season_id");
    return {
      id: select?.value || "",
      label: cleanText(select?.selectedOptions?.[0]?.textContent || "")
    };
  }

  function seasonYears(season) {
    const match = String(season?.label || "").match(/(\d{4})\s*[-/]\s*(\d{4})/);
    if (!match) return null;
    return {
      start: Number(match[1]),
      end: Number(match[2])
    };
  }

  function parseDateValue(value) {
    const text = cleanText(value);
    let match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

    match = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (!match) return null;

    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return new Date(year, Number(match[2]) - 1, Number(match[1]));
  }

  function extractEmails(value) {
    const matches = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    return [...new Set(matches.map(email => email.toLowerCase()))];
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

  function extractContactIdFromHtml(html) {
    const text = String(html || "");
    return text.match(/\/registrations\/new\/ActivitySchedule\/(\d+)/)?.[1] ||
      text.match(/\/registrations\/new\/Adhesion\/(\d+)/)?.[1] ||
      text.match(/\/families\/\d+\/contacts\/(\d+)/)?.[1] ||
      text.match(/\/contacts\/(\d+)/)?.[1] ||
      "";
  }

  function headerIndex(headers, wanted, fallback) {
    const normalizedWanted = normalize(wanted);
    const index = headers.findIndex(header => header === normalizedWanted || header.includes(normalizedWanted));
    return index >= 0 ? index : fallback;
  }

  function cellText(cells, index) {
    return index >= 0 ? cleanText(cells[index]?.textContent || "") : "";
  }

  function readDefinitionValue(root, label) {
    if (!root) return "";
    const expected = normalize(label);
    const dt = [...root.querySelectorAll("dt")]
      .find(item => normalize(item.textContent) === expected);

    return stripHtml(dt?.nextElementSibling?.textContent || "");
  }

  function parseEuroCents(value) {
    const text = String(value || "")
      .replace(/\s+/g, "")
      .replace("EUR", "")
      .replace("\u20ac", "")
      .replace(",", ".");
    const match = text.match(/-?\d+(?:\.\d{1,2})?/);
    if (!match) return null;
    return Math.round(Number(match[0]) * 100);
  }

  function formatEuro(cents) {
    return `${(Number(cents || 0) / 100).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })} EUR`;
  }

  function tsvCell(value) {
    return String(value || "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
  }

  function setStatus(message) {
    const status = document.querySelector("#fx-fb-status");
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

  function normalizeSeasonLabel(value) {
    return normalize(value)
      .replace(/^saison\s+/, "")
      .replace(/\s+/g, " ")
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
    if (document.querySelector("#fx-fb-style")) return;

    const style = document.createElement("style");
    style.id = "fx-fb-style";
    style.textContent = `
      #fx-family-balances-nav-item.active > a {
        background: #8e24aa !important;
        color: #fff !important;
      }

      #fx-family-balances-page {
        padding: 0 !important;
      }

      #fx-family-balances-page .page-heading {
        margin: 0 -15px 20px -15px;
        padding: 0 10px 20px 10px;
      }

      #fx-family-balances-page > .wrapper-content {
        padding: 0 10px 40px;
      }

      .fx-fb-card {
        background: #fff;
        padding: 16px;
      }

      #fx-fb-paste {
        border: 1px solid #c9d1dc;
        border-radius: 6px;
        box-sizing: border-box;
        color: #273043;
        font: 13px/1.45 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        min-height: 130px;
        padding: 10px;
        resize: vertical;
        width: 100%;
      }

      #fx-fb-paste:focus {
        border-color: #8e24aa;
        box-shadow: 0 0 0 3px rgba(142, 36, 170, 0.12);
        outline: 0;
      }

      .fx-fb-actions {
        align-items: center;
        display: flex;
        gap: 12px;
        justify-content: space-between;
        margin: 16px 0 12px;
      }

      .fx-fb-actions > div {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }

      #fx-fb-status {
        color: #676a6c;
        font-size: 13px;
      }

      .fx-fb-table {
        min-width: 1320px;
      }

      .fx-fb-table td,
      .fx-fb-table th {
        vertical-align: top !important;
      }

      .fx-fb-table pre {
        color: #344054;
        font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        margin: 6px 0 0;
        max-width: 280px;
        white-space: pre-wrap;
      }

      .fx-fb-table code {
        background: #f3f4f7;
        border-radius: 4px;
        color: #344054;
        display: inline-block;
        margin: 0 0 4px;
        padding: 2px 5px;
      }

      .fx-fb-check {
        border-radius: 999px;
        display: inline-flex;
        font-size: 12px !important;
        font-weight: 700;
        line-height: 1;
        padding: 6px 8px;
      }

      .fx-fb-check-ok {
        background: #e8f7ef;
        color: #1f7a47 !important;
      }

      .fx-fb-check-no {
        background: #fdecec;
        color: #a83b3b !important;
      }

      .fx-fb-check-muted {
        background: #eef1f5;
        color: #667085 !important;
      }

      .fx-fb-member-subscriptions + .fx-fb-member-subscriptions {
        border-top: 1px solid #edf0f4;
        margin-top: 8px;
        padding-top: 8px;
      }

      .fx-fb-member-subscriptions strong {
        display: block;
        margin-bottom: 4px;
      }

      .fx-fb-member-subscriptions ul {
        margin: 0;
        padding-left: 18px;
      }

      .fx-fb-subscriptions-warning {
        color: #a76000;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 6px;
      }

      .fx-fb-subscription-list {
        display: grid;
        gap: 4px;
      }

      .fx-fb-subscription-row {
        align-items: start;
        display: grid;
        gap: 8px;
        grid-template-columns: minmax(110px, 0.85fr) minmax(220px, 1.8fr) minmax(82px, 0.55fr);
      }

      .fx-fb-subscription-row strong,
      .fx-fb-subscription-row span,
      .fx-fb-subscription-row em {
        color: #344054;
        font-size: 12px;
        line-height: 1.35;
      }

      .fx-fb-subscription-row em {
        font-style: normal;
        font-weight: 700;
        text-align: right;
      }

      .fx-fb-row-actions {
        min-width: 90px;
      }
    `;

    document.head.appendChild(style);
  }

  init();
})();
