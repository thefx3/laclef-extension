(function () {
  "use strict";

  if (window.__fxAniappsExportTarifsLoaded) return;
  window.__fxAniappsExportTarifsLoaded = true;

  const {
    wait,
    makeButton,
    notify,
    onPageChange
  } = window.FXLaclefExtension;

  const BUTTON_ID = "fx-export-programmations-tarifs";
  const LIGHT_BUTTON_ID = "fx-export-programmations-tarifs-light";
  const MODAL_ID = "fx-export-programmations-tarifs-modal";
  const EXTRA_COLUMNS = ["Type tarif", "Tarif", "Code inscription"];
  const LIGHT_COLUMNS = [
    "ID Programmation",
    "Intervenant (Contact)",
    "Code Analytique",
    "Programmation",
    "Etat",
    "Fréquence",
    "Date de début",
    "Date de fin",
    "Jour(s) (Planification des séances)",
    "Heure(s) de début (Planification des séances)",
    "Heure(s) fin (Planification des séances)",
    "Salle(s) (Planification des séances)",
    "Niveau",
    "Places disponibles",
    "Durée (en minute)",
    "Âge minimal",
    "Âge maximum",
    "Nb de sessions",
    ...EXTRA_COLUMNS
  ];

  function isExportsPage() {
    return location.hostname === "laclef.aniapp.fr" && location.pathname === "/admin/ani_exports";
  }

  function findProgrammationsForm() {
    return [...document.querySelectorAll("form")]
      .find(form => (form.getAttribute("action") || "").includes("/admin/ani_exports/activity_schedule_offers.csv"));
  }

  async function decodeCsvResponse(response) {
    const buffer = await response.arrayBuffer();

    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder("windows-1252").decode(buffer);
    }
  }

  function parseCsv(text, separator = ";") {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    const source = String(text || "").replace(/^\uFEFF/, "");

    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      const next = source[i + 1];

      if (char === "\"") {
        if (inQuotes && next === "\"") {
          cell += "\"";
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === separator && !inQuotes) {
        row.push(cell);
        cell = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        continue;
      }

      cell += char;
    }

    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }

    const [headers = [], ...lines] = rows;
    const records = lines
      .filter(line => line.some(value => String(value).trim() !== ""))
      .map(line => {
        const record = {};
        headers.forEach((header, index) => {
          record[header] = line[index] ?? "";
        });
        return record;
      });

    return { headers, records };
  }

  function escapeCsv(value) {
    return `"${String(value ?? "").replace(/"/g, "\"\"").replace(/\r?\n/g, " ")}"`;
  }

  function stringifyCsv(records, headers) {
    const lines = [headers.map(escapeCsv).join(";")];

    records.forEach(record => {
      lines.push(headers.map(header => escapeCsv(record[header])).join(";"));
    });

    return "\uFEFF" + lines.join("\r\n");
  }

  function buildExportUrl(form) {
    const url = new URL(form.getAttribute("action"), location.origin);
    const data = new FormData(form);

    for (const [key, value] of data.entries()) {
      url.searchParams.set(key, value);
    }

    return url;
  }

  function getSeasonLabel(form) {
    const select = form.querySelector("select");
    return select?.selectedOptions?.[0]?.textContent?.trim() || select?.value || "saison";
  }

  function getInputValue(doc, selectors) {
    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      const value = el?.getAttribute("value") ?? el?.value;
      if (value && String(value).trim()) return String(value).trim();
    }

    return "";
  }

  function getSelectedOptionText(select) {
    if (!select) return "";

    const selected = select.querySelector("option[selected]");
    if (selected?.textContent?.trim()) return selected.textContent.trim();

    if (select.value) {
      const byValue = [...select.options].find(option => option.value === select.value);
      if (byValue?.textContent?.trim()) return byValue.textContent.trim();
    }

    return select.options[select.selectedIndex]?.textContent?.trim() || "";
  }

  function getSelect2ChosenText(doc, fieldId) {
    const chosen = doc.querySelector(`#s2id_${fieldId} .select2-chosen`);
    const text = chosen?.textContent?.trim() || "";

    if (!text || text.toLowerCase() === "rechercher") return "";
    return text;
  }

  async function fetchTarifData(id) {
    const url = `/admin/activity_schedules/${encodeURIComponent(id)}/edit`;
    const response = await fetch(url, { credentials: "include" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const codeInscription = getInputValue(doc, [
      'input[name="activity_schedule[registration_code]"]',
      'input[id*="registration_code"]'
    ]);

    const prixFixeCheckbox = doc.querySelector(
      'input[type="checkbox"][name="activity_schedule[season_pricing_attributes][price_fixed]"], #activity_schedule_season_pricing_attributes_price_fixed'
    );

    const isPrixFixe = prixFixeCheckbox?.checked === true || prixFixeCheckbox?.hasAttribute("checked");

    if (isPrixFixe) {
      const prix = getInputValue(doc, [
        'input[type="number"][name="activity_schedule[season_pricing_attributes][price]"]',
        "#activity_schedule_season_pricing_attributes_price",
        'input[name="activity_schedule[season_pricing_attributes][price]"]'
      ]);

      return {
        "Type tarif": "Prix fixe",
        "Tarif": prix ? prix.replace(".", ",") : "NON TROUVE",
        "Code inscription": codeInscription
      };
    }

    const select = doc.querySelector(
      'select[name="activity_schedule[season_pricing_attributes][fee_schedule_id]"], #activity_schedule_season_pricing_attributes_fee_schedule_id'
    );

    const tarif =
      getSelectedOptionText(select) ||
      getSelect2ChosenText(doc, "activity_schedule_season_pricing_attributes_fee_schedule_id");

    return {
      "Type tarif": "Groupe tarifaire",
      "Tarif": tarif || "NON TROUVE",
      "Code inscription": codeInscription
    };
  }

  function downloadCsv(csv, filename) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");

    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 1000);
  }

  function createProgressModal(total) {
    document.querySelector(`#${MODAL_ID}`)?.remove();

    const backdrop = document.createElement("div");
    backdrop.id = MODAL_ID;
    backdrop.className = "fx-laclef-modal-backdrop";
    backdrop.innerHTML = `
      <div class="fx-laclef-modal fx-export-modal" role="dialog" aria-modal="true">
        <div class="fx-laclef-modal-header">
          <div>
            <h2 class="fx-laclef-modal-title">Export programmations + tarifs</h2>
            <div class="fx-laclef-modal-subtitle">Recuperation des groupes tarifaires depuis ANIAPPS</div>
          </div>
          <span class="fx-laclef-modal-badge">Extension</span>
        </div>
        <div class="fx-laclef-modal-body">
          <div class="fx-export-status">Preparation de l'export...</div>
          <div class="fx-export-progress" aria-hidden="true">
            <div class="fx-export-progress-bar"></div>
          </div>
          <div class="fx-laclef-note fx-export-detail">0 / ${total}</div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const status = backdrop.querySelector(".fx-export-status");
    const detail = backdrop.querySelector(".fx-export-detail");
    const bar = backdrop.querySelector(".fx-export-progress-bar");

    return {
      update(done, currentId, errorCount) {
        const percent = total ? Math.round((done / total) * 100) : 0;
        status.textContent = currentId ? `Programmation ${currentId}` : "Finalisation...";
        detail.textContent = `${done} / ${total}${errorCount ? ` - ${errorCount} erreur(s)` : ""}`;
        bar.style.width = `${percent}%`;
      },
      close() {
        backdrop.remove();
      }
    };
  }

  async function runExport(form, button, mode = "full") {
    const defaultLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Export en cours...";

    let modal = null;

    try {
      const exportUrl = buildExportUrl(form);
      const seasonLabel = getSeasonLabel(form);
      const csvResponse = await fetch(exportUrl, { credentials: "include" });

      if (!csvResponse.ok) {
        throw new Error(`Export ANIAPPS impossible : HTTP ${csvResponse.status}`);
      }

      const csvText = await decodeCsvResponse(csvResponse);
      const { headers: originalHeaders, records } = parseCsv(csvText);

      if (!records.length) {
        notify("Le CSV exporte ne contient aucune programmation.", "Export programmations");
        return;
      }

      const missingId = records.find(record => !record["ID Programmation"]);
      if (missingId) {
        notify("La colonne ID Programmation est absente ou vide dans le CSV exporte.", "Export programmations");
        return;
      }

      modal = createProgressModal(records.length);

      let errorCount = 0;

      for (let index = 0; index < records.length; index++) {
        const record = records[index];
        const id = record["ID Programmation"];
        modal.update(index, id, errorCount);

        try {
          Object.assign(record, await fetchTarifData(id));
        } catch (error) {
          console.error("[La CLEF Assistant] Tarif introuvable", id, error);
          errorCount++;
          record["Type tarif"] = "ERREUR";
          record["Tarif"] = "ERREUR";
          record["Code inscription"] = "";
        }

        modal.update(index + 1, id, errorCount);
        await wait(80);
      }

      const headers = mode === "light"
        ? LIGHT_COLUMNS
        : [
            ...originalHeaders.filter(header => !EXTRA_COLUMNS.includes(header)),
            ...EXTRA_COLUMNS
          ];
      const output = stringifyCsv(records, headers);
      const fileSeason = seasonLabel.replace(/[^\d-]/g, "") || "saison";
      const filePrefix = mode === "light"
        ? "programmations_offre_utiles_avec_tarifs"
        : "programmations_offre_avec_tarifs";

      downloadCsv(output, `${filePrefix}_${fileSeason}.csv`);
      modal.close();

      notify(
        `CSV telecharge avec ${records.length} programmation(s).${errorCount ? `\n${errorCount} ligne(s) en erreur a verifier.` : ""}`,
        "Export termine"
      );
    } catch (error) {
      console.error("[La CLEF Assistant] Export enrichi impossible", error);
      modal?.close();
      notify(error.message || "Export impossible.", "Export programmations");
    } finally {
      button.disabled = false;
      button.textContent = defaultLabel;
    }
  }

  function addExportButton() {
    if (!isExportsPage()) {
      document.querySelector(`#${BUTTON_ID}`)?.remove();
      document.querySelector(`#${LIGHT_BUTTON_ID}`)?.remove();
      return;
    }

    if (document.querySelector(`#${BUTTON_ID}`) && document.querySelector(`#${LIGHT_BUTTON_ID}`)) return;

    const form = findProgrammationsForm();
    const nativeSubmit = form?.querySelector('input[type="submit"], button[type="submit"]');
    if (!form || !nativeSubmit?.parentElement) return;

    if (!document.querySelector(`#${BUTTON_ID}`)) {
      const button = makeButton("Exporter + tarifs", "fx-laclef-btn-inline fx-laclef-btn-outline fx-export-tarifs-btn");
      button.id = BUTTON_ID;
      button.addEventListener("click", () => runExport(form, button, "full"));
      nativeSubmit.insertAdjacentElement("afterend", button);
    }

    if (!document.querySelector(`#${LIGHT_BUTTON_ID}`)) {
      const lightButton = makeButton("Exporter utile + tarifs", "fx-laclef-btn-inline fx-laclef-btn-outline fx-export-tarifs-btn");
      lightButton.id = LIGHT_BUTTON_ID;
      lightButton.addEventListener("click", () => runExport(form, lightButton, "light"));

      const fullButton = document.querySelector(`#${BUTTON_ID}`) || nativeSubmit;
      fullButton.insertAdjacentElement("afterend", lightButton);
    }
  }

  onPageChange(() => {
    setTimeout(addExportButton, 150);
    setTimeout(addExportButton, 700);
  });

  new MutationObserver(addExportButton).observe(document.body, {
    childList: true,
    subtree: true
  });
})();
