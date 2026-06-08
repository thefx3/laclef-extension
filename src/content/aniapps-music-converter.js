(function () {
  "use strict";

  if (window.__fxAniappsMusicConverterLoaded) return;
  window.__fxAniappsMusicConverterLoaded = true;

  const { makeButton, notify, showDialog, storage, normalizeText, onPageChange } = window.FXLaclefExtension;

  const ROOT_ID = "fx-music-converter-root";
  const MODAL_ID = "fx-music-converter-modal";
  const AUTO_KEYS = {
    enabled: "aniapps_auto_enabled",
    data: "aniapps_programmations",
    index: "aniapps_index",
    mode: "aniapps_mode",
    clonePattern: "aniapps_clone_pattern"
  };
  const MUSIC_KEYS = {
    suffixes: "aniapps_music_prof_suffixes",
    settings: "aniapps_music_converter_settings",
    refs: "aniapps_music_refs",
    sharedRefs: "aniapps_music_refs_shared",
    sheetBatches: "aniapps_music_sheet_batches"
  };

  const DAY_MAP = {
    lun: { value: "1", label: "lundi" },
    mar: { value: "2", label: "mardi" },
    mer: { value: "3", label: "mercredi" },
    jeu: { value: "4", label: "jeudi" },
    ven: { value: "5", label: "vendredi" },
    sam: { value: "6", label: "samedi" },
    dim: { value: "0", label: "dimanche" }
  };

  const DEFAULT_SETTINGS = {
    instrument: "",
    placeId: "",
    individualTarif: "",
    collectiveTarif: "",
    clonePattern: "/clone/7"
  };

  let lastSharedRefsSignature = "";

  function isProgrammingEditPage() {
    return location.hostname === "laclef.aniapp.fr" && /\/admin\/activity_schedules\/\d+\/edit/.test(location.pathname);
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "");
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readSettings() {
    return { ...DEFAULT_SETTINGS, ...readJson(MUSIC_KEYS.settings, {}) };
  }

  function readSuffixes() {
    return readJson(MUSIC_KEYS.suffixes, {});
  }

  function writeSuffixes(suffixes) {
    saveJson(MUSIC_KEYS.suffixes, suffixes || {});
  }

  function extractOptions(selector) {
    const select = document.querySelector(selector);
    if (!select) return [];

    return [...select.options]
      .map(option => ({
        value: String(option.value || "").trim(),
        text: cleanText(option.textContent)
      }))
      .filter(option => option.value && option.text);
  }

  function refsSignature(refs) {
    return [
      refs.contacts?.length || 0,
      refs.places?.length || 0,
      refs.tarifs?.length || 0,
      refs.contacts?.map(item => `${item.value}:${item.text}`).join("|") || "",
      refs.places?.map(item => `${item.value}:${item.text}`).join("|") || "",
      refs.tarifs?.map(item => `${item.value}:${item.text}`).join("|") || ""
    ].join("::");
  }

  function refsAreComplete(refs) {
    return Boolean(refs.contacts?.length && refs.places?.length && refs.tarifs?.length);
  }

  function persistReferences(refs) {
    saveJson(MUSIC_KEYS.refs, refs);

    const signature = refsSignature(refs);
    if (signature === lastSharedRefsSignature) return;

    lastSharedRefsSignature = signature;
    storage.set(MUSIC_KEYS.sharedRefs, refs).catch(() => {});
  }

  function readReferencesFromPage() {
    const refs = {
      contacts: extractOptions("#activity_schedule_contact_id"),
      places: extractOptions("#activity_schedule_activity_session_schedules_attributes_0_place_id"),
      tarifs: extractOptions("#activity_schedule_season_pricing_attributes_fee_schedule_id"),
      refreshedAt: new Date().toISOString()
    };

    if (refsAreComplete(refs)) persistReferences(refs);
    return refs;
  }

  function getReferences() {
    const live = readReferencesFromPage();
    if (refsAreComplete(live)) return live;
    return readJson(MUSIC_KEYS.refs, { contacts: [], places: [], tarifs: [], refreshedAt: "" });
  }

  function syncReferencesFromPage() {
    if (!isProgrammingEditPage()) return;

    const refs = readReferencesFromPage();
    if (refsAreComplete(refs)) {
      console.info("[La CLEF Assistant] Listes ANIAPPS synchronisees", {
        profs: refs.contacts.length,
        salles: refs.places.length,
        tarifs: refs.tarifs.length
      });
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function minutesToTime(value) {
    const minutes = Number(value);
    return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
  }

  function minutesToLabel(value) {
    const minutes = Number(value);
    const minute = minutes % 60;
    return minute === 0 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 60)}h${pad2(minute)}`;
  }

  function parseHoraire(value) {
    const text = cleanText(value).toLowerCase();
    const match = text.match(/\b(lun|mar|mer|jeu|ven|sam|dim)[a-z.]*\s+(\d{1,2})(?:\s*[h:]\s*(\d{2}))?\s*[-–]\s*(\d{1,2})(?:\s*[h:]\s*(\d{2}))?/i);
    if (!match) return null;

    const day = DAY_MAP[match[1].slice(0, 3)];
    const start = Number(match[2]) * 60 + Number(match[3] || "0");
    const end = Number(match[4]) * 60 + Number(match[5] || "0");

    if (!day || end <= start) return null;

    return {
      dayValue: day.value,
      dayLabel: day.label,
      start,
      end,
      duration: end - start
    };
  }

  function normalizeHoraireText(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\s*-\s*/g, "-")
      .replace(/\s+/g, " ");
  }

  function parseTimeParts(hourValue, minuteValue) {
    const hour = Number(hourValue);
    const minute = minuteValue === undefined || minuteValue === "" ? 0 : Number(minuteValue);

    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

    return hour * 60 + minute;
  }

  function parseHoraireRobust(value) {
    const text = normalizeHoraireText(value);
    const dayMatch = text.match(/\b(lun|mar|mer|jeu|ven|sam|dim)/);
    const timeMatch = text.match(/(\d{1,2})(?:\s*[h:]\s*(\d{1,2})?)?-(\d{1,2})(?:\s*[h:]\s*(\d{1,2})?)?/);

    if (!dayMatch || !timeMatch) return parseHoraire(value);

    const day = DAY_MAP[dayMatch[1].slice(0, 3)];
    const start = parseTimeParts(timeMatch[1], timeMatch[2]);
    const end = parseTimeParts(timeMatch[3], timeMatch[4]);

    if (!day || start === null || end === null || end <= start) return parseHoraire(value);

    return {
      dayValue: day.value,
      dayLabel: day.label,
      start,
      end,
      duration: end - start
    };
  }

  function splitClipboardRows(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map(line => line.split("\t"))
      .map(columns => ({
        horaire: cleanText(columns[0]),
        prof: cleanText(columns[1])
      }));
  }

  function parseSlots(pasted) {
    const rows = splitClipboardRows(pasted);
    const slots = [];
    let current = null;

    rows.forEach((row, index) => {
      const parsedHoraire = row.horaire ? parseHoraireRobust(row.horaire) : null;

      if (parsedHoraire) {
        const prof = row.prof || current?.rawProf || "";
        current = {
          sourceRow: index + 1,
          rawHoraire: row.horaire,
          rawProf: prof,
          ...parsedHoraire,
          lineCount: 1,
          errors: prof ? [] : ["Professeur absent"]
        };
        slots.push(current);
        return;
      }

      if (!row.horaire && !row.prof && current) {
        if (current.duration >= 60) current.lineCount++;
        return;
      }

      if (!row.horaire && row.prof && current && normalizeText(row.prof) === normalizeText(current.rawProf)) {
        current.lineCount++;
        return;
      }

      if (row.horaire || row.prof) {
        slots.push({
          sourceRow: index + 1,
          rawHoraire: row.horaire,
          rawProf: row.prof,
          lineCount: 1,
          errors: [`Horaire invalide ligne ${index + 1}`]
        });
      }
    });

    return mergeDuplicateSlots(slots);
  }

  function mergeDuplicateSlots(slots) {
    const output = [];

    slots.forEach(slot => {
      if (slot.errors?.length) {
        output.push(slot);
        return;
      }

      const previous = output[output.length - 1];
      const samePrevious = previous &&
        !previous.errors?.length &&
        previous.dayValue === slot.dayValue &&
        previous.start === slot.start &&
        previous.end === slot.end &&
        normalizeText(previous.rawProf) === normalizeText(slot.rawProf);

      if (samePrevious) {
        previous.lineCount += slot.lineCount;
        return;
      }

      output.push(slot);
    });

    return output;
  }

  function significantTokens(value) {
    return normalizeText(value)
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean);
  }

  function findContact(profName, contacts) {
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

  function fallbackSuffix(value) {
    return significantTokens(value)
      .slice(0, 3)
      .map(token => token[0])
      .join("")
      .toUpperCase();
  }

  function buildProgramFromSlot(slot, settings, refs, suffixes) {
    const errors = [...(slot.errors || [])];
    const warnings = [];

    if (!settings.instrument) errors.push("Instrument absent");
    if (!settings.placeId) errors.push("Salle absente");
    if (!settings.individualTarif) errors.push("Tarif individuel absent");
    if (!settings.collectiveTarif) errors.push("Tarif collectif absent");

    const contact = findContact(slot.rawProf, refs.contacts);
    if (!contact) errors.push(`Professeur introuvable : ${slot.rawProf || "vide"}`);

    const isIndividual = slot.duration === 30 && slot.lineCount === 1;
    const isCollective = slot.duration === 60 && slot.lineCount > 1;
    const type = isCollective || (!isIndividual && slot.duration >= 60) ? "coll" : "individuel";

    if (!isIndividual && !isCollective) {
      warnings.push(`Regle individuelle/collective ambigue : ${slot.lineCount} ligne(s), ${slot.duration || "?"} min`);
    }

    const suffix = contact ? cleanText(suffixes[contact.value] || fallbackSuffix(slot.rawProf || contact.text)) : fallbackSuffix(slot.rawProf);
    if (!suffix) errors.push("Suffixe prof absent");

    const place = refs.places.find(item => item.value === settings.placeId);
    const tarif = type === "individuel" ? settings.individualTarif : settings.collectiveTarif;
    const label = [
      settings.instrument,
      type,
      slot.dayLabel,
      Number.isFinite(slot.start) ? minutesToLabel(slot.start) : "",
      suffix
    ].filter(Boolean).join(" ");

    return {
      slot,
      contact,
      place,
      status: errors.length ? "Erreur" : warnings.length ? "Attention" : "OK",
      errors,
      warnings,
      programmation: errors.length ? null : {
        label,
        debut: minutesToTime(slot.start),
        fin: minutesToTime(slot.end),
        duree: String(slot.duration),
        jour: slot.dayValue,
        salle: settings.placeId,
        prof: contact.value,
        places: String(type === "individuel" ? 1 : slot.lineCount),
        tarif
      }
    };
  }

  function buildPreview(pasted, settings, refs, suffixes) {
    return parseSlots(pasted).map(slot => buildProgramFromSlot(slot, settings, refs, suffixes));
  }

  function renderOptions(options, selectedValue, placeholder) {
    const first = `<option value="">${escapeHtml(placeholder || "Choisir")}</option>`;
    return first + options.map(option => {
      const selected = String(option.value) === String(selectedValue) || String(option.text) === String(selectedValue) ? " selected" : "";
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.text)}</option>`;
    }).join("");
  }

  function renderTarifOptions(options, selectedText, placeholder) {
    const first = `<option value="">${escapeHtml(placeholder || "Choisir")}</option>`;
    return first + options.map(option => {
      const selected = String(option.text) === String(selectedText) ? " selected" : "";
      return `<option value="${escapeHtml(option.text)}"${selected}>${escapeHtml(option.text)}</option>`;
    }).join("");
  }

  function renderSuffixRows(refs, suffixes) {
    return refs.contacts.map(contact => `
      <tr>
        <td>${escapeHtml(contact.text)}</td>
        <td><code>${escapeHtml(contact.value)}</code></td>
        <td>
          <input class="fx-music-suffix-input" data-prof-id="${escapeHtml(contact.value)}" value="${escapeHtml(suffixes[contact.value] || "")}" placeholder="${escapeHtml(fallbackSuffix(contact.text))}">
        </td>
      </tr>
    `).join("");
  }

  function statusClass(status) {
    if (status === "OK") return "fx-compare-badge-ok";
    if (status === "Attention") return "fx-compare-badge-warning";
    return "fx-compare-badge-danger";
  }

  function renderPreviewRows(items) {
    if (!items.length) {
      return `<div class="fx-agenda-empty">Colle les lignes A:B du cahier musique puis clique sur Previsualiser.</div>`;
    }

    return `
      <div class="fx-music-preview-summary">
        ${items.filter(item => item.status === "OK").length} OK -
        ${items.filter(item => item.status === "Attention").length} Attention -
        ${items.filter(item => item.status === "Erreur").length} Erreur
      </div>
      <table class="fx-music-table">
        <thead>
          <tr>
            <th>Statut</th>
            <th>Source</th>
            <th>Label genere</th>
            <th>Horaire</th>
            <th>Prof ANIAPPS</th>
            <th>Places</th>
            <th>Tarif</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td><span class="fx-compare-badge ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
              <td>${escapeHtml(item.slot.rawHoraire || "")}<br>${escapeHtml(item.slot.rawProf || "")}</td>
              <td>${escapeHtml(item.programmation?.label || "")}</td>
              <td>${item.programmation ? `${escapeHtml(item.programmation.debut)} - ${escapeHtml(item.programmation.fin)}` : ""}</td>
              <td>${escapeHtml(item.contact?.text || "")}</td>
              <td>${escapeHtml(item.programmation?.places || String(item.slot.lineCount || ""))}</td>
              <td>${escapeHtml(item.programmation?.tarif || "")}</td>
              <td><pre>${escapeHtml([...item.errors, ...item.warnings].join("\n") || "Aucune incoherence detectee.")}</pre></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function createModal() {
    document.querySelector(`#${MODAL_ID}`)?.remove();

    let refs = getReferences();
    let suffixes = readSuffixes();
    let lastPreview = [];
    const settings = readSettings();

    const backdrop = document.createElement("div");
    backdrop.id = MODAL_ID;
    backdrop.className = "fx-laclef-modal-backdrop";
    backdrop.innerHTML = `
      <div class="fx-laclef-modal fx-music-modal" role="dialog" aria-modal="true">
        <div class="fx-laclef-modal-header">
          <div>
            <h2 class="fx-laclef-modal-title">Convertir cahier musique</h2>
            <div class="fx-laclef-modal-subtitle">Colle les colonnes A:B de Google Sheets, puis charge le JSON dans Auto programmations.</div>
          </div>
          <button type="button" class="fx-agenda-close" aria-label="Fermer">x</button>
        </div>
        <div class="fx-laclef-modal-body">
          <div class="fx-music-tabs">
            <button type="button" class="fx-music-tab is-active" data-tab="convert">Conversion</button>
            <button type="button" class="fx-music-tab" data-tab="suffixes">Suffixes profs</button>
          </div>

          <section class="fx-music-tab-panel" data-panel="convert">
            <div class="fx-laclef-form-grid">
              <div class="fx-laclef-field">
                <label for="fx-music-instrument">Instrument</label>
                <input id="fx-music-instrument" value="${escapeHtml(settings.instrument)}" placeholder="Piano">
              </div>
              <div class="fx-laclef-field">
                <label for="fx-music-place">Salle unique</label>
                <select id="fx-music-place">${renderOptions(refs.places, settings.placeId, "Choisir une salle")}</select>
              </div>
              <div class="fx-laclef-field">
                <label for="fx-music-tarif-individual">Tarif individuel</label>
                <select id="fx-music-tarif-individual">${renderTarifOptions(refs.tarifs, settings.individualTarif, "Choisir un tarif")}</select>
              </div>
              <div class="fx-laclef-field">
                <label for="fx-music-tarif-collective">Tarif collectif</label>
                <select id="fx-music-tarif-collective">${renderTarifOptions(refs.tarifs, settings.collectiveTarif, "Choisir un tarif")}</select>
              </div>
              <div class="fx-laclef-field fx-laclef-field-full">
                <label for="fx-music-clone">Lien de duplication a utiliser</label>
                <input id="fx-music-clone" value="${escapeHtml(settings.clonePattern || "/clone/7")}">
              </div>
              <div class="fx-laclef-field fx-laclef-field-full">
                <label for="fx-music-paste">Lignes Google Sheets A:B</label>
                <textarea id="fx-music-paste" spellcheck="false" placeholder="LUN 16H30-17H\tFernando De Almeida"></textarea>
                <div class="fx-laclef-note">Individuel : 1 ligne et 30 min. Collectif : plusieurs lignes et 60 min. Les lignes vides de bloc fusionne peuvent compter comme places.</div>
              </div>
            </div>

            <div class="fx-laclef-modal-actions">
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-music-refresh">Actualiser listes ANIAPPS</button>
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-music-import-sheets">Importer lots Sheets</button>
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-music-copy-json">Copier JSON</button>
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-music-preview">Previsualiser</button>
              <button type="button" class="fx-laclef-btn" id="fx-music-load">Charger dans Auto</button>
            </div>

            <div class="fx-music-preview">${renderPreviewRows([])}</div>
          </section>

          <section class="fx-music-tab-panel" data-panel="suffixes" hidden>
            <div class="fx-laclef-note">Ces suffixes servent a produire les labels, par exemple GP dans "Piano individuel lundi 18h GP". Laisse vide pour utiliser les initiales automatiques.</div>
            <div class="fx-music-suffix-list">
              <table class="fx-music-table">
                <thead>
                  <tr>
                    <th>Intervenant ANIAPPS</th>
                    <th>ID</th>
                    <th>Suffixe</th>
                  </tr>
                </thead>
                <tbody>${renderSuffixRows(refs, suffixes)}</tbody>
              </table>
            </div>
            <div class="fx-laclef-modal-actions">
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-music-refresh-suffixes">Actualiser listes ANIAPPS</button>
              <button type="button" class="fx-laclef-btn" id="fx-music-save-suffixes">Enregistrer suffixes</button>
            </div>
          </section>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const closeButton = backdrop.querySelector(".fx-agenda-close");
    const previewContainer = backdrop.querySelector(".fx-music-preview");
    const pasteInput = backdrop.querySelector("#fx-music-paste");
    const instrumentInput = backdrop.querySelector("#fx-music-instrument");
    const placeSelect = backdrop.querySelector("#fx-music-place");
    const individualTarifSelect = backdrop.querySelector("#fx-music-tarif-individual");
    const collectiveTarifSelect = backdrop.querySelector("#fx-music-tarif-collective");
    const cloneInput = backdrop.querySelector("#fx-music-clone");

    function currentSettings() {
      return {
        instrument: cleanText(instrumentInput.value),
        placeId: placeSelect.value,
        individualTarif: individualTarifSelect.value,
        collectiveTarif: collectiveTarifSelect.value,
        clonePattern: cleanText(cloneInput.value) || "/clone/7"
      };
    }

    function persistSettings() {
      saveJson(MUSIC_KEYS.settings, currentSettings());
    }

    function refreshPreview() {
      persistSettings();
      suffixes = readSuffixes();
      lastPreview = buildPreview(pasteInput.value, currentSettings(), refs, suffixes);
      previewContainer.innerHTML = renderPreviewRows(lastPreview);
      return lastPreview;
    }

    function generatedProgrammations() {
      const preview = lastPreview.length ? lastPreview : refreshPreview();
      const errors = preview.filter(item => item.errors.length);
      if (errors.length) {
        throw new Error(`${errors.length} ligne(s) en erreur. Corrige la selection ou les parametres avant de charger.`);
      }
      return preview.map(item => item.programmation).filter(Boolean);
    }

    async function loadProgrammationsIntoAuto(programmations, clonePattern, sourceTitle) {
      localStorage.setItem(AUTO_KEYS.data, JSON.stringify(programmations));
      localStorage.setItem(AUTO_KEYS.index, "0");
      localStorage.setItem(AUTO_KEYS.mode, "fill");
      localStorage.setItem(AUTO_KEYS.clonePattern, clonePattern || currentSettings().clonePattern);
      localStorage.removeItem(AUTO_KEYS.enabled);

      const startNow = await showDialog({
        title: "Auto programmations",
        message: `${programmations.length} programmation(s) chargee(s). Demarrer maintenant ?`,
        detail: sourceTitle || "Le demarrage utilise la fiche ANIAPPS ouverte comme base de duplication.",
        actions: [
          { label: "Demarrer", value: true, primary: true },
          { label: "Plus tard", value: false }
        ]
      });

      if (!startNow) return;

      const api = window.FXAniappsCompareProgrammations;
      const remaining = api?.showAutoPrecheck
        ? await api.showAutoPrecheck(programmations)
        : programmations;

      if (remaining === null) return;

      if (!remaining.length) {
        localStorage.setItem(AUTO_KEYS.data, JSON.stringify([]));
        localStorage.removeItem(AUTO_KEYS.enabled);
        notify("Aucune creation necessaire : toutes les programmations existent deja avec les bonnes donnees.", "Cahier musique");
        return;
      }

      localStorage.setItem(AUTO_KEYS.data, JSON.stringify(remaining));
      localStorage.setItem(AUTO_KEYS.index, "0");
      localStorage.setItem(AUTO_KEYS.mode, "fill");
      localStorage.setItem(AUTO_KEYS.enabled, "1");
      backdrop.remove();
      window.dispatchEvent(new Event("fx-laclef-start-programmations"));
    }

    async function importSheetBatches() {
      const batches = await storage.get(MUSIC_KEYS.sheetBatches);
      const validBatches = Array.isArray(batches) ? batches : [];

      if (!validBatches.length) {
        notify("Aucun lot Google Sheets en attente.", "Cahier musique");
        return;
      }

      refs = readReferencesFromPage();
      suffixes = readSuffixes();

      const previews = validBatches.flatMap(batch => {
        const batchSettings = {
          instrument: batch.instrument || "",
          placeId: batch.placeId || "",
          individualTarif: batch.individualTarif || "",
          collectiveTarif: batch.collectiveTarif || "",
          clonePattern: batch.clonePattern || "/clone/7"
        };

        return buildPreview(batch.rowsText || "", batchSettings, refs, suffixes).map(item => ({
          ...item,
          batch
        }));
      });

      lastPreview = previews;
      previewContainer.innerHTML = renderPreviewRows(previews);

      const errors = previews.filter(item => item.errors.length);
      if (errors.length) {
        notify(`${errors.length} ligne(s) en erreur dans les lots Google Sheets. Corrige avant de charger.`, "Cahier musique");
        return;
      }

      const programmations = previews.map(item => item.programmation).filter(Boolean);
      const firstClonePattern = validBatches.find(batch => batch.clonePattern)?.clonePattern || currentSettings().clonePattern;

      await loadProgrammationsIntoAuto(
        programmations,
        firstClonePattern,
        `${validBatches.length} lot(s) Google Sheets importes. Les fiches deja coherentes seront filtrees au demarrage.`
      );
    }

    function saveSuffixInputs() {
      const next = { ...readSuffixes() };
      backdrop.querySelectorAll(".fx-music-suffix-input").forEach(input => {
        const value = cleanText(input.value).toUpperCase();
        if (value) next[input.dataset.profId] = value;
        else delete next[input.dataset.profId];
      });
      saveJson(MUSIC_KEYS.suffixes, next);
      suffixes = next;
    }

    function refreshReferences() {
      refs = readReferencesFromPage();
      persistSettings();
      backdrop.remove();
      createModal();
    }

    closeButton.addEventListener("click", () => backdrop.remove());
    document.addEventListener("keydown", function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      document.removeEventListener("keydown", closeOnEscape);
      backdrop.remove();
    });
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) backdrop.remove();
    });

    backdrop.querySelectorAll(".fx-music-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        backdrop.querySelectorAll(".fx-music-tab").forEach(item => item.classList.toggle("is-active", item === tab));
        backdrop.querySelectorAll(".fx-music-tab-panel").forEach(panel => {
          panel.hidden = panel.dataset.panel !== tab.dataset.tab;
        });
      });
    });

    backdrop.querySelector("#fx-music-preview").addEventListener("click", refreshPreview);
    backdrop.querySelector("#fx-music-refresh").addEventListener("click", refreshReferences);
    backdrop.querySelector("#fx-music-import-sheets").addEventListener("click", () => {
      importSheetBatches().catch(error => {
        notify(error.message || "Import Google Sheets impossible.", "Cahier musique");
      });
    });
    backdrop.querySelector("#fx-music-refresh-suffixes").addEventListener("click", refreshReferences);
    backdrop.querySelector("#fx-music-save-suffixes").addEventListener("click", () => {
      saveSuffixInputs();
      notify("Suffixes profs enregistres.", "Cahier musique");
    });

    [instrumentInput, placeSelect, individualTarifSelect, collectiveTarifSelect, cloneInput].forEach(field => {
      field.addEventListener("change", persistSettings);
      field.addEventListener("input", persistSettings);
    });

    backdrop.querySelector("#fx-music-copy-json").addEventListener("click", async () => {
      try {
        const json = JSON.stringify(generatedProgrammations(), null, 2);
        await navigator.clipboard.writeText(json);
        notify("JSON copie dans le presse-papiers.", "Cahier musique");
      } catch (error) {
        notify(error.message || "Copie impossible.", "Cahier musique");
      }
    });

    backdrop.querySelector("#fx-music-load").addEventListener("click", async () => {
      try {
        const programmations = generatedProgrammations();
        if (!programmations.length) {
          notify("Aucune programmation a charger.", "Cahier musique");
          return;
        }

        await loadProgrammationsIntoAuto(programmations, currentSettings().clonePattern);
      } catch (error) {
        notify(error.message || "Chargement impossible.", "Cahier musique");
      }
    });
  }

  function addButton() {
    if (!isProgrammingEditPage()) return;
    const existing = document.querySelector(`#${ROOT_ID}`);
    if (existing) {
      const shouldHide = Boolean(document.querySelector("#fx-programmations-panel-root .fx-laclef-panel:not([hidden])"));
      if (existing.hidden !== shouldHide) existing.hidden = shouldHide;
      return;
    }

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "fx-laclef-fixed-stack fx-music-converter-root";
    root.hidden = Boolean(document.querySelector("#fx-programmations-panel-root .fx-laclef-panel:not([hidden])"));

    const button = makeButton("Convertir cahier musique");
    button.addEventListener("click", createModal);

    root.appendChild(button);
    document.body.appendChild(root);
  }

  function removeButtonIfNeeded() {
    document.querySelector(`#${ROOT_ID}`)?.remove();
    document.querySelector(`#${MODAL_ID}`)?.remove();
  }

  function runForCurrentPage() {
    syncReferencesFromPage();
    removeButtonIfNeeded();
  }

  window.FXAniappsMusicConverter = {
    keys: MUSIC_KEYS,
    getReferences,
    syncReferencesFromPage,
    readSettings,
    readSuffixes,
    writeSuffixes,
    buildPreview,
    renderPreviewRows,
    renderOptions,
    renderTarifOptions,
    renderSuffixRows
  };

  onPageChange(() => {
    setTimeout(runForCurrentPage, 150);
    setTimeout(runForCurrentPage, 700);
  });
})();
