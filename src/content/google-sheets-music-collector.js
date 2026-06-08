(function () {
  "use strict";

  if (window.__fxGoogleSheetsMusicCollectorLoaded) return;
  window.__fxGoogleSheetsMusicCollectorLoaded = true;

  const { makeButton, notify, storage, normalizeText, onPageChange } = window.FXLaclefExtension;

  const ROOT_ID = "fx-sheets-music-root";
  const MODAL_ID = "fx-sheets-music-modal";
  const BATCHES_KEY = "aniapps_music_sheet_batches";
  const REFS_KEY = "aniapps_music_refs_shared";
  const SETTINGS_KEY = "aniapps_music_sheet_settings";

  const DEFAULT_SETTINGS = {
    instrument: "",
    placeId: "",
    individualTarif: "",
    collectiveTarif: "",
    clonePattern: "/clone/7"
  };

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function looksLikeMusicRows(text) {
    return /\t/.test(text) && /\b(lun|mar|mer|jeu|ven|sam|dim)/i.test(text) && /\d{1,2}\s*h/i.test(text);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function readBatches() {
    const batches = await storage.get(BATCHES_KEY);
    return Array.isArray(batches) ? batches : [];
  }

  async function writeBatches(batches) {
    await storage.set(BATCHES_KEY, batches);
  }

  async function readSettings() {
    return { ...DEFAULT_SETTINGS, ...((await storage.get(SETTINGS_KEY)) || {}) };
  }

  async function writeSettings(settings) {
    await storage.set(SETTINGS_KEY, settings);
  }

  async function readRefs() {
    return (await storage.get(REFS_KEY)) || { contacts: [], places: [], tarifs: [], refreshedAt: "" };
  }

  function renderOptions(options, selectedValue, placeholder) {
    const first = `<option value="">${escapeHtml(placeholder)}</option>`;
    const hasSelected = options.some(option => String(option.value) === String(selectedValue));
    const missingSelected = selectedValue && !hasSelected
      ? `<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(selectedValue)} (memoire)</option>`
      : "";

    return first + missingSelected + options.map(option => {
      const selected = String(option.value) === String(selectedValue) ? " selected" : "";
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.text)}</option>`;
    }).join("");
  }

  function renderTarifOptions(options, selectedText, placeholder) {
    const first = `<option value="">${escapeHtml(placeholder)}</option>`;
    const hasSelected = options.some(option => String(option.text) === String(selectedText));
    const missingSelected = selectedText && !hasSelected
      ? `<option value="${escapeHtml(selectedText)}" selected>${escapeHtml(selectedText)} (memoire)</option>`
      : "";

    return first + missingSelected + options.map(option => {
      const selected = String(option.text) === String(selectedText) ? " selected" : "";
      return `<option value="${escapeHtml(option.text)}"${selected}>${escapeHtml(option.text)}</option>`;
    }).join("");
  }

  function renderRefsStatus(refs) {
    const refreshed = refs.refreshedAt ? new Date(refs.refreshedAt).toLocaleString("fr-FR") : "jamais";
    const contacts = refs.contacts?.length || 0;
    const places = refs.places?.length || 0;
    const tarifs = refs.tarifs?.length || 0;
    const complete = contacts && places && tarifs;

    return `
      <div class="fx-sheets-ref-status ${complete ? "is-ok" : "is-warning"}">
        ANIAPPS : ${contacts} prof(s), ${places} salle(s), ${tarifs} tarif(s) - synchro : ${escapeHtml(refreshed)}
      </div>
    `;
  }

  function batchLabel(batch) {
    const rowCount = String(batch.rowsText || "").split(/\r?\n/).filter(line => cleanText(line)).length;
    return `${batch.instrument || "Instrument ?"} - ${rowCount} ligne(s)`;
  }

  function renderBatchList(batches) {
    if (!batches.length) return `<div class="fx-agenda-empty">Aucun lot en attente.</div>`;

    return `
      <table class="fx-music-table">
        <thead>
          <tr>
            <th>Lot</th>
            <th>Salle</th>
            <th>Tarifs</th>
            <th>Source</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${batches.map(batch => `
            <tr>
              <td>${escapeHtml(batchLabel(batch))}</td>
              <td><code>${escapeHtml(batch.placeId || "")}</code></td>
              <td>${escapeHtml(batch.individualTarif || "")}<br>${escapeHtml(batch.collectiveTarif || "")}</td>
              <td>${escapeHtml(batch.source || "")}</td>
              <td><button type="button" class="fx-laclef-btn fx-laclef-btn-secondary fx-laclef-btn-inline fx-sheets-remove-batch" data-batch-id="${escapeHtml(batch.id)}">Retirer</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  async function readClipboardText() {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return "";
    }
  }

  async function createModal(initialRowsText) {
    document.querySelector(`#${MODAL_ID}`)?.remove();

    const refs = await readRefs();
    const settings = await readSettings();
    let batches = await readBatches();

    const backdrop = document.createElement("div");
    backdrop.id = MODAL_ID;
    backdrop.className = "fx-laclef-modal-backdrop";
    backdrop.innerHTML = `
      <div class="fx-laclef-modal fx-sheets-music-modal" role="dialog" aria-modal="true">
        <div class="fx-laclef-modal-header">
          <div>
            <h2 class="fx-laclef-modal-title">Ajouter un lot cahier musique</h2>
            <div class="fx-laclef-modal-subtitle">Copie les colonnes A:B dans Google Sheets, puis ajoute plusieurs lots avant import ANIAPPS.</div>
          </div>
          <button type="button" class="fx-agenda-close" aria-label="Fermer">x</button>
        </div>
        <div class="fx-laclef-modal-body">
          ${renderRefsStatus(refs)}
          <div class="fx-laclef-form-grid">
            <div class="fx-laclef-field">
              <label for="fx-sheets-instrument">Instrument</label>
              <input id="fx-sheets-instrument" value="${escapeHtml(settings.instrument)}" placeholder="Piano">
            </div>
            <div class="fx-laclef-field">
              <label for="fx-sheets-place">Salle</label>
              <select id="fx-sheets-place">${renderOptions(refs.places || [], settings.placeId, "Choisir une salle")}</select>
            </div>
            <div class="fx-laclef-field">
              <label for="fx-sheets-tarif-individual">Tarif individuel</label>
              <select id="fx-sheets-tarif-individual">${renderTarifOptions(refs.tarifs || [], settings.individualTarif, "Choisir un tarif")}</select>
            </div>
            <div class="fx-laclef-field">
              <label for="fx-sheets-tarif-collective">Tarif collectif</label>
              <select id="fx-sheets-tarif-collective">${renderTarifOptions(refs.tarifs || [], settings.collectiveTarif, "Choisir un tarif")}</select>
            </div>
            <div class="fx-laclef-field fx-laclef-field-full">
              <label for="fx-sheets-clone">Lien de duplication</label>
              <input id="fx-sheets-clone" value="${escapeHtml(settings.clonePattern || "/clone/7")}">
            </div>
            <div class="fx-laclef-field fx-laclef-field-full">
              <label for="fx-sheets-rows">Selection A:B copiee</label>
              <textarea id="fx-sheets-rows" spellcheck="false" placeholder="LUN 16H30-17H\tFernando De Almeida">${escapeHtml(initialRowsText || "")}</textarea>
              <div class="fx-laclef-note">
                Les listes salles/tarifs viennent d'ANIAPPS. Si elles sont vides, ouvre une fiche programmation ANIAPPS et clique Actualiser listes ANIAPPS dans le convertisseur.
              </div>
            </div>
          </div>

          <div class="fx-laclef-modal-actions">
            <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-sheets-read-clipboard">Lire presse-papiers</button>
            <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-sheets-clear">Tout effacer</button>
            <button type="button" class="fx-laclef-btn" id="fx-sheets-add">Ajouter au lot</button>
          </div>

          <div class="fx-sheets-batches">${renderBatchList(batches)}</div>

          <div class="fx-laclef-modal-actions">
            <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-sheets-copy-package">Copier paquet</button>
            <button type="button" class="fx-laclef-btn" id="fx-sheets-open-aniapps">Ouvrir ANIAPPS</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const rowsInput = backdrop.querySelector("#fx-sheets-rows");
    const instrumentInput = backdrop.querySelector("#fx-sheets-instrument");
    const placeSelect = backdrop.querySelector("#fx-sheets-place");
    const individualTarifSelect = backdrop.querySelector("#fx-sheets-tarif-individual");
    const collectiveTarifSelect = backdrop.querySelector("#fx-sheets-tarif-collective");
    const cloneInput = backdrop.querySelector("#fx-sheets-clone");
    const batchContainer = backdrop.querySelector(".fx-sheets-batches");

    function currentSettings() {
      return {
        instrument: cleanText(instrumentInput.value),
        placeId: placeSelect.value,
        individualTarif: individualTarifSelect.value,
        collectiveTarif: collectiveTarifSelect.value,
        clonePattern: cleanText(cloneInput.value) || "/clone/7"
      };
    }

    async function persistSettings() {
      await writeSettings(currentSettings());
    }

    function refreshBatches() {
      batchContainer.innerHTML = renderBatchList(batches);
      batchContainer.querySelectorAll(".fx-sheets-remove-batch").forEach(button => {
        button.addEventListener("click", async () => {
          batches = batches.filter(batch => batch.id !== button.dataset.batchId);
          await writeBatches(batches);
          refreshBatches();
        });
      });
    }

    backdrop.querySelector(".fx-agenda-close").addEventListener("click", () => backdrop.remove());
    document.addEventListener("keydown", function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      document.removeEventListener("keydown", closeOnEscape);
      backdrop.remove();
    });
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) backdrop.remove();
    });

    [instrumentInput, placeSelect, individualTarifSelect, collectiveTarifSelect, cloneInput].forEach(field => {
      field.addEventListener("change", persistSettings);
      field.addEventListener("input", persistSettings);
    });

    backdrop.querySelector("#fx-sheets-read-clipboard").addEventListener("click", async () => {
      const text = await readClipboardText();
      if (text) rowsInput.value = text;
      else notify("Lecture du presse-papiers impossible. Colle manuellement la selection A:B.", "Cahier musique");
    });

    backdrop.querySelector("#fx-sheets-add").addEventListener("click", async () => {
      const config = currentSettings();
      const rowsText = rowsInput.value.trim();

      if (!rowsText) {
        notify("Aucune selection A:B a ajouter.", "Cahier musique");
        return;
      }

      if (!config.instrument || !config.placeId || !config.individualTarif || !config.collectiveTarif) {
        notify("Instrument, salle, tarif individuel et tarif collectif sont obligatoires.", "Cahier musique");
        return;
      }

      const batch = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        source: document.title,
        rowsText,
        ...config
      };

      batches = [...batches, batch];
      await writeBatches(batches);
      await persistSettings();
      rowsInput.value = "";
      refreshBatches();
    });

    backdrop.querySelector("#fx-sheets-clear").addEventListener("click", async () => {
      batches = [];
      await writeBatches(batches);
      refreshBatches();
    });

    backdrop.querySelector("#fx-sheets-copy-package").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(batches, null, 2));
        notify(`${batches.length} lot(s) copie(s).`, "Cahier musique");
      } catch (error) {
        notify(error.message || "Copie impossible.", "Cahier musique");
      }
    });

    backdrop.querySelector("#fx-sheets-open-aniapps").addEventListener("click", () => {
      window.open("https://laclef.aniapp.fr/admin/activity_schedules", "_blank", "noopener");
    });

    refreshBatches();
    setTimeout(() => rowsInput.focus(), 50);
  }

  async function openFromClipboard() {
    const text = await readClipboardText();
    createModal(text || "");
  }

  function addButton() {
    if (document.querySelector(`#${ROOT_ID}`)) return;

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "fx-laclef-fixed-stack fx-sheets-music-root";

    const button = makeButton("Cahier musique");
    button.addEventListener("click", openFromClipboard);
    root.appendChild(button);
    document.body.appendChild(root);
  }

  document.addEventListener("copy", () => {
    setTimeout(async () => {
      if (document.querySelector(`#${MODAL_ID}`)) return;
      const text = await readClipboardText();
      if (looksLikeMusicRows(text)) createModal(text);
    }, 120);
  }, true);

  onPageChange(() => {
    setTimeout(addButton, 300);
    setTimeout(addButton, 1000);
  });

  new MutationObserver(addButton).observe(document.body, {
    childList: true,
    subtree: true
  });
})();
