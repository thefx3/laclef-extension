(function () {
  "use strict";

  if (window.__fxAniappsCompareProgrammationsLoaded) return;
  window.__fxAniappsCompareProgrammationsLoaded = true;

  const {
    wait,
    fireInputEvents,
    makeButton,
    notify,
    showDialog,
    storage,
    normalizeText,
    onPageChange
  } = window.FXLaclefExtension;

  const ROOT_ID = "fx-compare-programmations-root";
  const BUTTON_ID = "fx-compare-programmations-btn";
  const MODAL_ID = "fx-compare-programmations-modal";
  const AUTO_DATA_KEY = "aniapps_programmations";
  const AUTO_INDEX_KEY = "aniapps_index";
  const AUTO_MODE_KEY = "aniapps_mode";
  const AUTO_ENABLED_KEY = "aniapps_auto_enabled";
  const AUTO_CLONE_KEY = "aniapps_clone_pattern";
  const SHEET_BATCHES_KEY = "aniapps_music_sheet_batches";
  const DEFAULT_CLONE_PATTERN = "/clone/7";
  const CORRECTION_QUEUE_KEY = "aniapps_compare_correction_queue";
  const CORRECTION_INDEX_KEY = "aniapps_compare_correction_index";
  const CORRECTION_ENABLED_KEY = "aniapps_compare_correction_enabled";
  const CORRECTION_MODE_KEY = "aniapps_compare_correction_mode";
  const CORRECTION_RUN_KEY = "aniapps_compare_correction_run_id";
  const CORRECTION_STEP_KEY = "aniapps_compare_correction_step_allowed";
  const MAX_CORRECTION_STEP_MS = 25 * 1000;
  const DAY_WORDS = {
    lundi: "1",
    mardi: "2",
    mercredi: "3",
    jeudi: "4",
    vendredi: "5",
    samedi: "6",
    dimanche: "0"
  };
  const COLUMNS = [
    "label",
    "activity_name",
    "date_begin",
    "date_end",
    "detailed_label",
    "schedule_type",
    "state",
    "registration_code",
    "has_front_regroupment",
    "actions"
  ];

  const SAMPLE = [
    {
      "label": "Guitare individuel mardi 20h30 PHR",
      "debut": "20:30",
      "fin": "21:00",
      "duree": "30",
      "jour": "2",
      "salle": "23",
      "prof": "46",
      "places": "1",
      "tarif": "920 - 1020"
    }
  ];

  function isListPage() {
    return location.hostname === "laclef.aniapp.fr" && location.pathname === "/admin/activity_schedules";
  }

  function isEditPage() {
    return location.hostname === "laclef.aniapp.fr" && /\/admin\/activity_schedules\/\d+\/edit/.test(location.pathname);
  }

  function readStoredProgrammations() {
    try {
      const parsed = JSON.parse(localStorage.getItem(AUTO_DATA_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function htmlDecode(value) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value || "");
    return textarea.value;
  }

  function repairMojibake(value) {
    const text = String(value || "");
    if (!/[ÃÂ]/.test(text)) return text;

    try {
      const bytes = [...text].map(char => {
        const code = char.charCodeAt(0);
        return code <= 255 ? `%${code.toString(16).padStart(2, "0")}` : char;
      }).join("");

      return decodeURIComponent(bytes);
    } catch {
      return text;
    }
  }

  function cleanText(value) {
    return repairMojibake(htmlDecode(value)).replace(/\s+/g, " ").trim();
  }

  function comparableText(value) {
    return normalizeText(cleanText(value)).replace(/\s+/g, " ");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function minutesToLabel(value) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) return "";
    const minute = minutes % 60;
    return minute === 0
      ? `${Math.floor(minutes / 60)}h`
      : `${Math.floor(minutes / 60)}h${pad2(minute)}`;
  }

  function parseTimeToMinutes(value) {
    const text = String(value || "").trim();
    const match = text.match(/(\d{1,2})\s*(?:h|H|:)\s*(\d{2})?/);
    if (!match) return null;

    const hour = Number(match[1]);
    const minute = Number(match[2] || "0");
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

    return hour * 60 + minute;
  }

  function parseDurationToMinutes(value) {
    const text = String(value || "").trim();
    if (!text) return null;

    if (/^\d+$/.test(text)) return Number(text);

    const hourMatch = text.match(/^(\d{1,2})\s*(?:h|H|:)\s*(\d{2})?$/);
    if (hourMatch) {
      return Number(hourMatch[1]) * 60 + Number(hourMatch[2] || "0");
    }

    return null;
  }

  function extractTimes(value) {
    const source = String(value || "");
    const matches = [...source.matchAll(/(\d{1,2})\s*(?:h|H|:)\s*(\d{2})?/g)];

    return matches.map(match => {
      const hour = Number(match[1]);
      const minute = Number(match[2] || "0");
      return {
        raw: match[0],
        minutes: hour * 60 + minute
      };
    });
  }

  function normalizeCourseType(value) {
    const text = comparableText(value);
    if (/\b(individuel|indiv|ind)\b/.test(text)) return "individuel";
    if (/\b(collectif|collective|coll|col)\b/.test(text)) return "collectif";
    return "";
  }

  function preferredCourseTypeLabel(value, fallback) {
    const text = comparableText(value);
    if (/\b(coll|col)\b/.test(text)) return "coll";
    if (/\b(collectif|collective)\b/.test(text)) return "collectif";
    if (/\b(individuel|indiv|ind)\b/.test(text)) return "individuel";
    return fallback || "";
  }

  function inferEndTime(start, type) {
    if (start === null || start === undefined) return null;
    if (type === "individuel") return start + 30;
    if (type === "collectif") return start + 60;
    return null;
  }

  function extractCode(value) {
    const text = cleanText(value)
      .replace(/\b(Brouillon|Publi[eé]e?|Annul[eé]e?)\b/gi, " ")
      .trim();
    const tokens = text.match(/\b[A-Z]{2,5}\b/g) || [];

    return tokens.length ? tokens[tokens.length - 1] : "";
  }

  function extractDay(value) {
    const text = comparableText(value);
    const day = Object.keys(DAY_WORDS).find(key => new RegExp(`\\b${key}\\b`).test(text));
    return day ? DAY_WORDS[day] : "";
  }

  function removeKnownSyntax(value) {
    const code = cleanText(extractCode(value));
    let text = cleanText(value);

    text = text.replace(/\b(individuel|indiv|ind|collectif|collective|coll|col)\b/gi, " ");
    text = text.replace(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi, " ");
    text = text.replace(/\d{1,2}\s*(?:h|H|:)\s*\d{0,2}\s*(?:[-\u2010-\u2015\u2212aà]\s*\d{1,2}\s*(?:h|H|:)\s*\d{0,2})?/gi, " ");
    if (code) text = text.replace(new RegExp(`\\b${escapeRegExp(code)}\\b`, "gi"), " ");
    text = text.replace(/\b(Brouillon|Publi[eé]e?|Annul[eé]e?)\b/gi, " ");

    return text.replace(/\s+/g, " ").trim();
  }

  function titleTokens(value) {
    return comparableText(value)
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(token => token.length > 1);
  }

  function titlesCompatible(expectedTitle, actualTitle) {
    const expected = titleTokens(expectedTitle);
    const actual = titleTokens(actualTitle);

    if (!expected.length || !actual.length) return false;
    if (expected.join(" ") === actual.join(" ")) return true;

    return expected.every(token => actual.includes(token)) ||
      actual.every(token => expected.includes(token));
  }

  function parseLabelParts(label, item = {}) {
    const labelText = cleanText(label || item.label || "");
    const type = normalizeCourseType(labelText || item.label);
    const times = extractTimes(labelText);
    const start = parseTimeToMinutes(item.debut) ?? times[0]?.minutes ?? null;
    const end = parseTimeToMinutes(item.fin) ?? times[1]?.minutes ?? inferEndTime(start, type);

    return {
      title: removeKnownSyntax(labelText),
      type,
      day: item.jour ? String(item.jour) : extractDay(labelText),
      start,
      end,
      code: extractCode(labelText)
    };
  }

  function semanticKey(parts) {
    return [
      comparableText(parts.title || ""),
      parts.type || "",
      parts.day || "",
      parts.start ?? "",
      parts.end ?? "",
      comparableText(parts.code || "")
    ].join("|");
  }

  function labelsMatchSemantically(expectedItem, actualLabel) {
    const expected = parseLabelParts(expectedItem.label, expectedItem);
    const actual = parseLabelParts(actualLabel);

    if (expected.title && actual.title && !titlesCompatible(expected.title, actual.title)) return false;
    if (expected.type && actual.type && expected.type !== actual.type) return false;
    if (expected.day && actual.day && expected.day !== actual.day) return false;
    if (expected.code && actual.code && comparableText(expected.code) !== comparableText(actual.code)) return false;
    if (expected.start !== null && actual.start !== null && expected.start !== actual.start) return false;
    if (expected.end !== null && actual.end !== null && expected.end !== actual.end) return false;

    return Boolean(expected.title && actual.title && expected.start !== null && actual.start !== null);
  }

  function isCompatibleRecord(expectedItem, record) {
    return labelsMatchSemantically(expectedItem, record.label) ||
      comparableText(record.label) === comparableText(expectedItem.label);
  }

  function correctedLabel(item) {
    const parts = parseLabelParts(item.label, item);
    const words = [];
    const original = cleanText(item.label || "");
    const rawTitle = removeKnownSyntax(original)
      .split(" ")
      .map(word => word ? word[0].toUpperCase() + word.slice(1) : "")
      .join(" ");

    if (rawTitle) words.push(rawTitle);
    if (parts.type) words.push(preferredCourseTypeLabel(original, parts.type));

    const day = Object.entries(DAY_WORDS).find(([, value]) => value === parts.day)?.[0];
    if (day) words.push(day);

    if (parts.start !== null) {
      words.push(minutesToLabel(parts.start));
    }

    if (parts.code) words.push(parts.code);
    return words.join(" ").trim();
  }

  function normalizeProgrammationItem(item) {
    const normalized = { ...item };
    const parts = parseLabelParts(item.label, item);

    normalized.label = correctedLabel(item);
    if (parts.start !== null) normalized.debut = `${pad2(Math.floor(parts.start / 60))}:${pad2(parts.start % 60)}`;
    if (parts.end !== null) normalized.fin = `${pad2(Math.floor(parts.end / 60))}:${pad2(parts.end % 60)}`;

    if (parts.start !== null && parts.end !== null) {
      normalized.duree = String(parts.end - parts.start);
    }

    return normalized;
  }

  function buildCorrectionItem(item, requestedLabel) {
    const normalized = normalizeProgrammationItem(item);
    return {
      ...normalized,
      label: cleanText(requestedLabel || item.label || normalized.label)
    };
  }

  function dedupeProgrammations(items) {
    const seen = new Set();
    const output = [];

    items.forEach(item => {
      const normalized = normalizeProgrammationItem(item);
      const key = semanticKey(parseLabelParts(normalized.label, normalized));
      if (seen.has(key)) return;
      seen.add(key);
      output.push(normalized);
    });

    return output;
  }

  function buildSearchTerms(item) {
    const label = cleanText(item.label || "");
    const corrected = correctedLabel(item);
    const compactHour = corrected.replace(/(\d{1,2})h00\b/gi, "$1h");
    const parts = parseLabelParts(corrected || label, item);
    const dayLabel = Object.entries(DAY_WORDS).find(([, value]) => value === parts.day)?.[0] || "";
    const startLabel = parts.start !== null ? minutesToLabel(parts.start) : "";
    const titleFirstToken = titleTokens(parts.title)[0] || "";
    const relaxedCore = [
      parts.type,
      dayLabel,
      startLabel,
      parts.code
    ].filter(Boolean).join(" ");
    const relaxedWithTitle = [
      titleFirstToken,
      relaxedCore
    ].filter(Boolean).join(" ");
    const rangeToStart = label
      .replace(/(\d{1,2})\s*(?:h|H|:)\s*00\s*-\s*\d{1,2}\s*(?:h|H|:)\s*\d{0,2}/g, "$1h")
      .replace(/(\d{1,2})\s*(?:h|H|:)\s*(\d{2})\s*-\s*\d{1,2}\s*(?:h|H|:)\s*\d{0,2}/g, "$1h$2");
    const typeVariants = [
      corrected,
      corrected.replace(/\bcollectif\b/gi, "coll"),
      corrected.replace(/\bcoll\b/gi, "collectif"),
      compactHour,
      relaxedWithTitle,
      relaxedCore,
      rangeToStart,
      correctedLabel({ ...item, label: rangeToStart }),
      label
    ];

    return [...new Set(typeVariants.map(term => term.replace(/\s+/g, " ").trim()).filter(Boolean))];
  }

  function getFormFilters() {
    const candidates = [...document.querySelectorAll("form")]
      .filter(form => {
        const action = form.getAttribute("action") || "";
        const method = (form.getAttribute("method") || "get").toLowerCase();
        return method === "get" && (!action || action.includes("/admin/activity_schedules"));
      });

    const form = candidates[0];
    if (!form) return [];

    return [...new FormData(form).entries()]
      .filter(([key, value]) => {
        const text = String(value || "").trim();
        return text && !["utf8", "commit"].includes(key);
      });
  }

  function buildSearchUrl(term, length = 50) {
    const url = new URL("/admin/activity_schedules.json", location.origin);

    getFormFilters().forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    url.searchParams.set("draw", String(Date.now()));
    url.searchParams.set("start", "0");
    url.searchParams.set("length", String(length));
    url.searchParams.set("search[value]", term);
    url.searchParams.set("search[regex]", "false");
    url.searchParams.set("order[0][column]", "0");
    url.searchParams.set("order[0][dir]", "asc");

    COLUMNS.forEach((column, index) => {
      const orderable = column !== "actions";
      url.searchParams.set(`columns[${index}][data]`, column);
      url.searchParams.set(`columns[${index}][name]`, "");
      url.searchParams.set(`columns[${index}][searchable]`, column === "actions" ? "false" : "true");
      url.searchParams.set(`columns[${index}][orderable]`, orderable ? "true" : "false");
      url.searchParams.set(`columns[${index}][search][value]`, "");
      url.searchParams.set(`columns[${index}][search][regex]`, "false");
    });

    return url;
  }

  async function fetchSearchTerm(term) {
    const response = await fetch(buildSearchUrl(term), {
      credentials: "include",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Recherche impossible : HTTP ${response.status}`);
    }

    const payload = await response.json();
    return (payload.data || []).map(normalizeRecord);
  }

  async function searchProgrammation(item) {
    const byId = new Map();
    const terms = buildSearchTerms(item);

    for (const term of terms) {
      const records = await fetchSearchTerm(term);
      records.forEach(record => byId.set(record.id, record));
      if (byId.size >= 50) break;
      await wait(30);
    }

    return [...byId.values()];
  }

  function extractEditHref(actions) {
    const html = document.createElement("div");
    html.innerHTML = actions || "";
    const link = html.querySelector('a[href*="/admin/activity_schedules/"][href$="/edit"]') ||
      html.querySelector('a[href*="/admin/activity_schedules/"][href*="/edit"]');
    return link ? new URL(link.getAttribute("href"), location.origin).pathname : "";
  }

  function canonicalEditPath(id) {
    return `/admin/activity_schedules/${encodeURIComponent(id)}/edit`;
  }

  function normalizeRecord(record) {
    return {
      id: String(record.id || ""),
      label: cleanText(record.label),
      activity: cleanText(record.activity_name),
      dateBegin: cleanText(record.date_begin),
      dateEnd: cleanText(record.date_end),
      detail: cleanText(record.detailed_label),
      type: cleanText(record.schedule_type),
      state: cleanText(record.state),
      registrationCode: cleanText(record.registration_code),
      editPath: extractEditHref(record.actions)
    };
  }

  async function fetchEditDocument(id) {
    const response = await fetch(`/admin/activity_schedules/${encodeURIComponent(id)}/edit`, {
      credentials: "include"
    });

    if (!response.ok) throw new Error(`Fiche ${id} impossible : HTTP ${response.status}`);

    const html = await response.text();
    return new DOMParser().parseFromString(html, "text/html");
  }

  async function fetchEditPage(id) {
    const response = await fetch(`/admin/activity_schedules/${encodeURIComponent(id)}/edit`, {
      credentials: "include"
    });

    if (!response.ok) throw new Error(`Fiche ${id} impossible : HTTP ${response.status}`);

    const html = await response.text();
    return new DOMParser().parseFromString(html, "text/html");
  }

  function getValue(doc, selectors) {
    for (const selector of selectors) {
      const field = doc.querySelector(selector);
      const value = field?.getAttribute("value") ?? field?.value;
      if (value !== undefined && value !== null) return String(value).trim();
    }

    return "";
  }

  function getSelectValue(doc, selectors) {
    for (const selector of selectors) {
      const select = doc.querySelector(selector);
      if (!select) continue;
      return String(select.value || select.getAttribute("value") || "").trim();
    }

    return "";
  }

  function getSelectedOptionText(doc, selector) {
    const select = doc.querySelector(selector);
    if (!select) return "";

    const selected = select.querySelector("option[selected]");
    if (selected?.textContent?.trim()) return selected.textContent.trim();

    if (select.value) {
      const byValue = [...select.options].find(option => option.value === select.value);
      if (byValue?.textContent?.trim()) return byValue.textContent.trim();
    }

    return select.options[select.selectedIndex]?.textContent?.trim() || "";
  }

  function getSelect2Text(doc, fieldId) {
    const chosen = doc.querySelector(`#s2id_${fieldId} .select2-chosen`);
    return chosen?.textContent?.trim() || "";
  }

  function fieldSelectorList(selectors) {
    return selectors.join(",");
  }

  function findEditForm(doc, id) {
    const labelSelectors = [
      "#activity_schedule_label",
      "#activity_schedule_title",
      'input[name="activity_schedule[label]"]',
      'input[name="activity_schedule[title]"]'
    ];

    const forms = [...doc.querySelectorAll("form")];
    const byClass = forms.find(form => form.matches("form.edit_activity_schedule") && form.querySelector(fieldSelectorList(labelSelectors)));
    if (byClass) return byClass;

    const byActionAndField = forms.find(form => {
      const action = form.getAttribute("action") || "";
      return action.includes(`/admin/activity_schedules/${id}`) && form.querySelector(fieldSelectorList(labelSelectors));
    });
    if (byActionAndField) return byActionAndField;

    const byField = forms.find(form => form.querySelector(fieldSelectorList(labelSelectors)));
    if (byField) return byField;

    return null;
  }

  function setFormValue(form, formData, selectors, value) {
    if (value === undefined || value === null || String(value).trim() === "") return false;

    for (const selector of selectors) {
      const field = form.querySelector(selector);
      if (!field?.name) continue;

      formData.set(field.name, String(value).trim());
      return true;
    }

    return false;
  }

  function findField(selectors) {
    for (const selector of selectors) {
      const field = document.querySelector(selector);
      if (field) return field;
    }

    return null;
  }

  function setDomValue(selectors, value, required = false) {
    if (value === undefined || value === null || String(value).trim() === "") return false;

    const field = findField(selectors);
    if (!field) {
      if (required) throw new Error("Champ introuvable : " + selectors[0]);
      return false;
    }

    field.focus();
    field.value = String(value).trim();
    field.setAttribute("value", String(value).trim());
    fireInputEvents(field);
    field.blur();
    return true;
  }

  function setDomSelect(selectors, value, required = false) {
    if (value === undefined || value === null || String(value).trim() === "") return false;

    const field = findField(selectors);
    if (!field) {
      if (required) throw new Error("Select introuvable : " + selectors[0]);
      return false;
    }

    field.value = String(value).trim();
    fireInputEvents(field);

    const chosen = field.id ? document.querySelector(`#s2id_${field.id} .select2-chosen`) : null;
    if (chosen && field.selectedOptions?.[0]) chosen.textContent = field.selectedOptions[0].textContent.trim();

    return true;
  }

  function setDomTarifGroup(tarif) {
    if (!tarif) return false;

    const select = findField([
      "#activity_schedule_season_pricing_attributes_fee_schedule_id",
      'select[name="activity_schedule[season_pricing_attributes][fee_schedule_id]"]'
    ]);

    if (!select) return false;

    const expectedNumbers = numbers(tarif);
    if (!expectedNumbers.length) return false;

    const option = [...select.options].find(item => {
      const optionNumbers = numbers(item.textContent);
      return expectedNumbers.every(number => optionNumbers.includes(number));
    });

    if (!option) return false;

    select.value = option.value;
    fireInputEvents(select);

    const chosen = select.id ? document.querySelector(`#s2id_${select.id} .select2-chosen`) : null;
    if (chosen) chosen.textContent = option.textContent.trim();

    return true;
  }

  function getCsrfToken(doc) {
    return doc.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ||
      doc.querySelector('input[name="authenticity_token"]')?.getAttribute("value") ||
      doc.querySelector('input[name="authenticity_token"]')?.value ||
      document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ||
      "";
  }

  function appendSubmitValue(form, formData) {
    const submit = [...form.querySelectorAll('input[type="submit"], button[type="submit"], button:not([type])')]
      .find(button => normalizeText(button.value || button.textContent || "").includes("modifier la programmation")) ||
      form.querySelector('input[type="submit"], button[type="submit"]');

    if (!submit?.name) return;

    const value = submit.getAttribute("value") || submit.textContent || "";
    formData.set(submit.name, value.trim());
  }

  function preserveNamedControls(form, formData, pattern) {
    const valuesByName = new Map();

    function addValue(name, value) {
      if (value === undefined || value === null || String(value).trim() === "") return;
      if (!valuesByName.has(name)) valuesByName.set(name, []);
      valuesByName.get(name).push(String(value));
    }

    [...form.querySelectorAll("[name]")].forEach(field => {
      const name = field.getAttribute("name") || "";
      if (!pattern.test(name)) return;

      if (field.matches("select")) {
        const values = [...field.selectedOptions]
          .map(option => option.value)
          .filter(Boolean);

        if (!values.length && field.value) values.push(field.value);
        if (!values.length) return;

        values.forEach(value => addValue(name, value));
        return;
      }

      if ((field.type === "checkbox" || field.type === "radio") && !field.checked) return;

      const value = field.getAttribute("value") ?? field.value;
      addValue(name, value);
    });

    valuesByName.forEach((values, name) => {
      formData.delete(name);

      if (name.endsWith("[]") || values.length > 1) {
        values.forEach(value => formData.append(name, value));
        return;
      }

      formData.set(name, values[0]);
    });
  }

  function preserveVentilationFields(form, formData) {
    preserveNamedControls(
      form,
      formData,
      /(ventilation|accounting|account|analytic|analytique|code_comptable|code_comptable|sector|secteur)/i
    );
  }

  function extractFormErrors(doc) {
    const selectors = [
      "#error_explanation",
      ".alert-danger",
      ".alert-error",
      ".has-error .help-block",
      ".field_with_errors",
      "[class*='error_explanation']"
    ];
    const messages = selectors
      .flatMap(selector => [...doc.querySelectorAll(selector)])
      .map(node => cleanText(node.textContent))
      .filter(Boolean)
      .filter(text => !/^255 caracteres max$/i.test(comparableText(text)));

    const bodyText = comparableText(doc.body?.textContent || "");
    if (bodyText.includes("n a pas pu etre enregistre")) {
      messages.push("La programmation n'a pas pu etre enregistree.");
    }

    return [...new Set(messages)].slice(0, 6);
  }

  function responseHasFormErrors(doc) {
    return extractFormErrors(doc).length > 0;
  }

  function findTarifOptionValue(doc, tarif) {
    if (!tarif) return "";

    const select = doc.querySelector(
      'select[name="activity_schedule[season_pricing_attributes][fee_schedule_id]"], #activity_schedule_season_pricing_attributes_fee_schedule_id'
    );

    if (!select) return "";

    const expectedNumbers = numbers(tarif);
    if (!expectedNumbers.length) return "";

    const option = [...select.options].find(item => {
      const optionNumbers = numbers(item.textContent);
      return expectedNumbers.every(number => optionNumbers.includes(number));
    });

    return option?.value || "";
  }

  async function updateAniappsSchedule(result) {
    if (result.exactMatches.length !== 1) {
      throw new Error("Correction possible uniquement avec une correspondance unique.");
    }

    const record = result.exactMatches[0];
    const item = buildCorrectionItem(result.item, result.label);
    const doc = await fetchEditPage(record.id);
    const form = findEditForm(doc, record.id);

    if (!form) {
      throw new Error(`Formulaire introuvable pour ${record.id}`);
    }

    const formData = new FormData(form);

    setFormValue(form, formData, [
      "#activity_schedule_label",
      "#activity_schedule_title",
      'input[name="activity_schedule[label]"]',
      'input[name="activity_schedule[title]"]',
      'input[id*="title"]'
    ], item.label);

    if (item.date_begin || item.dateBegin) {
      setFormValue(form, formData, [
        "#activity_schedule_date_begin",
        'input[name="activity_schedule[date_begin]"]',
        'input[id*="date_begin"]'
      ], item.date_begin || item.dateBegin);
    }

    if (item.date_end || item.dateEnd) {
      setFormValue(form, formData, [
        "#activity_schedule_date_end",
        'input[name="activity_schedule[date_end]"]',
        'input[id*="date_end"]'
      ], item.date_end || item.dateEnd);
    }

    setFormValue(form, formData, [
      "#activity_schedule_activity_session_schedules_attributes_0_hour_begin",
      'input[id*="hour_begin"]',
      'input[name*="[hour_begin]"]'
    ], item.debut);

    setFormValue(form, formData, [
      "#activity_schedule_activity_session_schedules_attributes_0_hour_end",
      'input[id*="hour_end"]',
      'input[name*="[hour_end]"]'
    ], item.fin);

    setFormValue(form, formData, [
      "#activity_schedule_duration",
      'input[name="activity_schedule[duration]"]'
    ], item.duree);

    setFormValue(form, formData, [
      "#activity_schedule_activity_session_schedules_attributes_0_day",
      'select[id*="day"]',
      'select[name*="[day]"]'
    ], item.jour);

    setFormValue(form, formData, [
      "#activity_schedule_activity_session_schedules_attributes_0_place_id",
      'select[id*="place_id"]',
      'select[name*="[place_id]"]'
    ], item.salle);

    setFormValue(form, formData, [
      "#activity_schedule_contact_id",
      'select[name="activity_schedule[contact_id]"]',
      'select[id*="contact_id"]'
    ], item.prof);

    setFormValue(form, formData, [
      "#activity_schedule_capacity",
      'input[name="activity_schedule[capacity]"]',
      'input[id*="capacity"]',
      'input[name*="[capacity]"]',
      'input[name*="[places]"]',
      'input[name*="[available]"]'
    ], item.places);

    const tarifOption = findTarifOptionValue(doc, item.tarif);
    if (tarifOption) {
      setFormValue(form, formData, [
        "#activity_schedule_season_pricing_attributes_fee_schedule_id",
        'select[name="activity_schedule[season_pricing_attributes][fee_schedule_id]"]'
      ], tarifOption);
    }

    if (!formData.has("_method")) formData.set("_method", "patch");
    preserveVentilationFields(form, formData);
    appendSubmitValue(form, formData);

    const method = (form.getAttribute("method") || "post").toUpperCase();
    const action = new URL(form.getAttribute("action") || `/admin/activity_schedules/${record.id}`, location.origin);
    const csrfToken = getCsrfToken(doc);
    const response = await fetch(action, {
      method,
      credentials: "include",
      body: formData,
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "X-CSRF-Token": csrfToken
      }
    });

    if (!response.ok) {
      throw new Error(`Enregistrement ${record.id} impossible : HTTP ${response.status}`);
    }

    const responseText = await response.text();
    const responseDoc = new DOMParser().parseFromString(responseText, "text/html");

    const formErrors = extractFormErrors(responseDoc);
    if (formErrors.length) {
      throw new Error(`ANIAPPS a refuse la correction ${record.id} : ${formErrors.join(" | ")}`);
    }

    await wait(250);

    const check = await compareEditFields(item, record);
    const actualLabel = check.actual.label;

    if (cleanText(actualLabel) !== cleanText(item.label) && !labelsMatchSemantically(item, actualLabel)) {
      throw new Error(`Label non modifie pour ${record.id} : "${actualLabel}"`);
    }

    if (check.differences.length) {
      throw new Error(`Correction incomplete pour ${record.id} : ${check.differences.map(diff => diff.field).join(", ")}`);
    }

    return record.id;
  }

  function readCorrectionQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CORRECTION_QUEUE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function clearCorrectionQueue() {
    localStorage.removeItem(CORRECTION_QUEUE_KEY);
    localStorage.removeItem(CORRECTION_INDEX_KEY);
    localStorage.removeItem(CORRECTION_ENABLED_KEY);
    localStorage.removeItem(CORRECTION_MODE_KEY);
    localStorage.removeItem(CORRECTION_RUN_KEY);
    sessionStorage.removeItem(CORRECTION_STEP_KEY);
    window.__fxCompareCorrectionRunning = false;
  }

  function createCorrectionSession() {
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(CORRECTION_RUN_KEY, runId);
    allowCorrectionStep("start");
  }

  function allowCorrectionStep(reason = "next") {
    sessionStorage.setItem(CORRECTION_STEP_KEY, JSON.stringify({
      at: Date.now(),
      runId: localStorage.getItem(CORRECTION_RUN_KEY) || "",
      reason
    }));
  }

  function consumeCorrectionStep() {
    const runId = localStorage.getItem(CORRECTION_RUN_KEY);
    const raw = sessionStorage.getItem(CORRECTION_STEP_KEY);

    if (!runId || !raw) {
      clearCorrectionQueue();
      console.warn("[La CLEF Assistant] Correction ignoree : session absente.");
      return false;
    }

    let token = null;
    try {
      token = JSON.parse(raw);
    } catch {
      token = null;
    }

    if (!token?.at || token.runId !== runId || Date.now() - Number(token.at) > MAX_CORRECTION_STEP_MS) {
      clearCorrectionQueue();
      console.warn("[La CLEF Assistant] Correction ignoree : session expiree.");
      return false;
    }

    sessionStorage.removeItem(CORRECTION_STEP_KEY);
    return true;
  }

  function getCurrentEditId() {
    return location.pathname.match(/\/admin\/activity_schedules\/(\d+)\/edit/)?.[1] || "";
  }

  function fillCorrectionForm(item) {
    setDomValue([
      "#activity_schedule_label",
      "#activity_schedule_title",
      'input[name="activity_schedule[label]"]',
      'input[name="activity_schedule[title]"]',
      'input[id*="title"]'
    ], item.label, true);

    if (item.date_begin || item.dateBegin) {
      setDomValue([
        "#activity_schedule_date_begin",
        'input[name="activity_schedule[date_begin]"]',
        'input[id*="date_begin"]'
      ], item.date_begin || item.dateBegin);
    }

    if (item.date_end || item.dateEnd) {
      setDomValue([
        "#activity_schedule_date_end",
        'input[name="activity_schedule[date_end]"]',
        'input[id*="date_end"]'
      ], item.date_end || item.dateEnd);
    }

    setDomValue([
      "#activity_schedule_activity_session_schedules_attributes_0_hour_begin",
      'input[id*="hour_begin"]',
      'input[name*="[hour_begin]"]'
    ], item.debut);

    setDomValue([
      "#activity_schedule_activity_session_schedules_attributes_0_hour_end",
      'input[id*="hour_end"]',
      'input[name*="[hour_end]"]'
    ], item.fin);

    setDomValue([
      "#activity_schedule_duration",
      'input[name="activity_schedule[duration]"]'
    ], item.duree);

    setDomSelect([
      "#activity_schedule_activity_session_schedules_attributes_0_day",
      'select[id*="day"]',
      'select[name*="[day]"]'
    ], item.jour);

    setDomSelect([
      "#activity_schedule_activity_session_schedules_attributes_0_place_id",
      'select[id*="place_id"]',
      'select[name*="[place_id]"]'
    ], item.salle);

    setDomSelect([
      "#activity_schedule_contact_id",
      'select[name="activity_schedule[contact_id]"]',
      'select[id*="contact_id"]'
    ], item.prof);

    setDomValue([
      "#activity_schedule_capacity",
      'input[name="activity_schedule[capacity]"]',
      'input[id*="capacity"]',
      'input[name*="[capacity]"]',
      'input[name*="[places]"]',
      'input[name*="[available]"]'
    ], item.places);

    setDomTarifGroup(item.tarif);
  }

  function findSubmitButton() {
    return [...document.querySelectorAll('input[type="submit"], button[type="submit"], button')]
      .find(btn => normalizeText(btn.value || btn.innerText || btn.textContent || "").includes("modifier la programmation")) ||
      [...document.querySelectorAll('input[type="submit"], button[type="submit"]')]
        .find(Boolean);
  }

  async function verifyCorrection(queueItem) {
    const check = await compareEditFields(queueItem.item, { id: queueItem.id });
    const actualLabel = cleanText(check.actual.label);
    const expectedLabel = cleanText(queueItem.item.label);

    if (actualLabel !== expectedLabel) {
      throw new Error(`Label non modifie pour ${queueItem.id} : "${actualLabel}"`);
    }

    if (check.differences.length) {
      throw new Error(`Correction incomplete pour ${queueItem.id} : ${check.differences.map(diff => diff.field).join(", ")}`);
    }
  }

  function goToCorrectionIndex(queue, index) {
    const item = queue[index];
    if (!item) return;
    localStorage.setItem(CORRECTION_INDEX_KEY, String(index));
    localStorage.setItem(CORRECTION_MODE_KEY, "fill");
    allowCorrectionStep("open-edit");
    location.href = canonicalEditPath(item.id);
  }

  async function runCorrectionQueue() {
    if (window.__fxCompareCorrectionRunning) return;
    if (localStorage.getItem(CORRECTION_ENABLED_KEY) !== "1") return;
    if (!consumeCorrectionStep()) return;

    window.__fxCompareCorrectionRunning = true;

    try {
      const queue = readCorrectionQueue();
      let index = Number(localStorage.getItem(CORRECTION_INDEX_KEY) || "0");
      const mode = localStorage.getItem(CORRECTION_MODE_KEY) || "fill";

      if (!queue.length || index >= queue.length) {
        clearCorrectionQueue();
        await notify("Corrections terminees. Relance la comparaison pour verifier.", "Correction ANIAPPS");
        if (location.pathname !== "/admin/activity_schedules") location.href = "/admin/activity_schedules";
        return;
      }

      const current = queue[index];

      if (mode === "verify") {
        try {
          await wait(700);
          await verifyCorrection(current);
        } catch (error) {
          clearCorrectionQueue();
          await notify(error.message || "Correction interrompue.", "Correction ANIAPPS");
          return;
        }

        index++;
        if (index >= queue.length) {
          clearCorrectionQueue();
          await notify("Corrections terminees. Relance la comparaison pour verifier.", "Correction ANIAPPS");
          location.href = "/admin/activity_schedules";
          return;
        }

        goToCorrectionIndex(queue, index);
        return;
      }

      if (!isEditPage() || getCurrentEditId() !== String(current.id)) {
        goToCorrectionIndex(queue, index);
        return;
      }

      await wait(900);
      fillCorrectionForm(current.item);
      localStorage.setItem(CORRECTION_MODE_KEY, "verify");

      await wait(400);

      const submit = findSubmitButton();
      if (!submit) {
        clearCorrectionQueue();
        await notify("Bouton Modifier la programmation introuvable.", "Correction ANIAPPS");
        return;
      }

      allowCorrectionStep("after-submit");
      submit.click();
    } finally {
      window.__fxCompareCorrectionRunning = false;
    }
  }

  function startCorrectionQueue(results) {
    const queue = results
      .filter(resultNeedsCorrection)
      .map(result => {
        const record = result.exactMatches[0];
        return {
          id: record.id,
          editPath: canonicalEditPath(record.id),
          item: buildCorrectionItem(result.item, result.label)
        };
      });

    if (!queue.length) {
      notify("Aucune fiche a corriger. Les correspondances uniques sont deja coherentes.", "Comparaison programmations");
      return;
    }

    localStorage.setItem(CORRECTION_QUEUE_KEY, JSON.stringify(queue));
    localStorage.setItem(CORRECTION_INDEX_KEY, "0");
    localStorage.setItem(CORRECTION_ENABLED_KEY, "1");
    localStorage.setItem(CORRECTION_MODE_KEY, "fill");
    createCorrectionSession();
    location.href = canonicalEditPath(queue[0].id);
  }

  function expectedCorrectionLabel(result) {
    return cleanText(result.label || result.normalizedLabel || result.item?.label || "");
  }

  function actualCorrectionLabel(result) {
    return cleanText(result.actual?.label || result.exactMatches?.[0]?.label || "");
  }

  function labelNeedsCorrection(result) {
    if (result.exactMatches.length !== 1) return false;

    const expected = expectedCorrectionLabel(result);
    const actual = actualCorrectionLabel(result);
    return Boolean(expected && actual && expected !== actual);
  }

  function resultNeedsCorrection(result) {
    return !result.error &&
      result.exactMatches.length === 1 &&
      (labelNeedsCorrection(result) || Boolean(result.differences?.length));
  }

  function numbers(value) {
    return String(value || "").match(/\d+/g) || [];
  }

  function valuesMatch(expected, actual, mode = "text") {
    if (expected === undefined || expected === null || String(expected).trim() === "") return true;

    if (mode === "label") {
      return comparableText(expected) === comparableText(actual);
    }

    if (mode === "numbers") {
      const expectedNumbers = numbers(expected);
      const actualNumbers = numbers(actual);
      return expectedNumbers.length > 0 && expectedNumbers.every(number => actualNumbers.includes(number));
    }

    if (mode === "duration") {
      const expectedMinutes = parseDurationToMinutes(expected);
      const actualMinutes = parseDurationToMinutes(actual);
      return expectedMinutes !== null && actualMinutes !== null && expectedMinutes === actualMinutes;
    }

    return String(expected).trim() === String(actual).trim();
  }

  function pushDifference(differences, field, expected, actual, mode) {
    if (valuesMatch(expected, actual, mode)) return;

    differences.push({
      field,
      expected: String(expected ?? ""),
      actual: String(actual ?? "")
    });
  }

  async function compareEditFields(item, record) {
    const doc = await fetchEditDocument(record.id);

    const actual = {
      label: getValue(doc, [
        "#activity_schedule_label",
        "#activity_schedule_title",
        'input[name="activity_schedule[label]"]',
        'input[name="activity_schedule[title]"]',
        'input[id*="title"]',
        'input[id*="label"]'
      ]),
      dateBegin: getValue(doc, [
        "#activity_schedule_date_begin",
        'input[name="activity_schedule[date_begin]"]',
        'input[id*="date_begin"]'
      ]),
      dateEnd: getValue(doc, [
        "#activity_schedule_date_end",
        'input[name="activity_schedule[date_end]"]',
        'input[id*="date_end"]'
      ]),
      debut: getValue(doc, [
        "#activity_schedule_activity_session_schedules_attributes_0_hour_begin",
        'input[id*="hour_begin"]',
        'input[name*="[hour_begin]"]'
      ]),
      fin: getValue(doc, [
        "#activity_schedule_activity_session_schedules_attributes_0_hour_end",
        'input[id*="hour_end"]',
        'input[name*="[hour_end]"]'
      ]),
      duree: getValue(doc, [
        "#activity_schedule_duration",
        'input[name="activity_schedule[duration]"]'
      ]),
      jour: getSelectValue(doc, [
        "#activity_schedule_activity_session_schedules_attributes_0_day",
        'select[id*="day"]',
        'select[name*="[day]"]'
      ]),
      salle: getSelectValue(doc, [
        "#activity_schedule_activity_session_schedules_attributes_0_place_id",
        'select[id*="place_id"]',
        'select[name*="[place_id]"]'
      ]),
      prof: getSelectValue(doc, [
        "#activity_schedule_contact_id",
        'select[name="activity_schedule[contact_id]"]',
        'select[id*="contact_id"]'
      ]),
      places: getValue(doc, [
        "#activity_schedule_capacity",
        'input[name="activity_schedule[capacity]"]',
        'input[id*="capacity"]',
        'input[name*="[capacity]"]',
        'input[name*="[places]"]',
        'input[name*="[available]"]'
      ]),
      tarif: getSelectedOptionText(doc, "#activity_schedule_season_pricing_attributes_fee_schedule_id") ||
        getSelect2Text(doc, "activity_schedule_season_pricing_attributes_fee_schedule_id")
    };

    const differences = [];

    if (!labelsMatchSemantically(item, actual.label) && !valuesMatch(item.label, actual.label, "label")) {
      differences.push({
        field: "Intitule",
        expected: String(item.label ?? ""),
        actual: String(actual.label ?? "")
      });
    }

    if (item.date_begin || item.dateBegin) {
      pushDifference(differences, "Debute le", item.date_begin || item.dateBegin, actual.dateBegin);
    }
    if (item.date_end || item.dateEnd) {
      pushDifference(differences, "Termine le", item.date_end || item.dateEnd, actual.dateEnd);
    }

    pushDifference(differences, "Debut", item.debut, actual.debut);
    pushDifference(differences, "Fin", item.fin, actual.fin);
    pushDifference(differences, "Duree", item.duree, actual.duree, "duration");
    pushDifference(differences, "Jour", item.jour, actual.jour);
    pushDifference(differences, "Salle", item.salle, actual.salle);
    pushDifference(differences, "Intervenant", item.prof, actual.prof);
    pushDifference(differences, "Places", item.places, actual.places);
    pushDifference(differences, "Tarif", item.tarif, actual.tarif, "numbers");

    return { actual, differences };
  }

  function getStatus(result) {
    if (result.error) return "Erreur";
    if (!result.matches.length) return "Absente";
    if (!result.exactMatches.length) return "A verifier";
    if (result.exactMatches.length > 1) return "Doublon possible";
    if (resultNeedsCorrection(result)) return "Differences";
    return "OK";
  }

  async function compareItem(item) {
    const label = String(item.label || "").trim();
    if (!label) {
      return {
        item,
        label: "",
        matches: [],
        exactMatches: [],
        differences: [{ field: "JSON", expected: "label", actual: "Champ absent" }],
        error: ""
      };
    }

    const normalizedItem = normalizeProgrammationItem(item);
    const rawMatches = await searchProgrammation(normalizedItem);
    const matches = rawMatches.filter(record => isCompatibleRecord(normalizedItem, record));
    const expected = comparableText(label);
    const exactMatches = matches.filter(record => {
      return comparableText(record.label) === expected ||
        comparableText(record.label) === comparableText(normalizedItem.label) ||
        labelsMatchSemantically(normalizedItem, record.label);
    });
    const best = exactMatches[0] || matches[0] || null;
    const result = {
      item: normalizedItem,
      label,
      normalizedLabel: normalizedItem.label || label,
      matches,
      exactMatches,
      best,
      differences: [],
      error: ""
    };

    if (exactMatches.length === 1) {
      try {
        const detail = await compareEditFields(normalizedItem, exactMatches[0]);
        result.actual = detail.actual;
        result.differences = detail.differences;
      } catch (error) {
        result.error = error.message || String(error);
      }
    }

    return result;
  }

  function badgeClass(status) {
    if (status === "OK") return "fx-compare-badge-ok";
    if (status === "Absente" || status === "Erreur") return "fx-compare-badge-danger";
    if (status === "Differences" || status === "Doublon possible") return "fx-compare-badge-warning";
    return "fx-compare-badge-muted";
  }

  function renderDifferences(result) {
    if (result.error) return result.error;
    const differences = [...result.differences];

    if (labelNeedsCorrection(result) && !differences.some(diff => diff.field === "Intitule")) {
      differences.unshift({
        field: "Intitule",
        expected: expectedCorrectionLabel(result),
        actual: actualCorrectionLabel(result)
      });
    }

    if (!differences.length) return "Aucune difference detectee.";

    return differences
      .map(diff => `${diff.field} : attendu "${diff.expected}", trouve "${diff.actual}"`)
      .join("\n");
  }

  function renderMatches(result) {
    const records = result.exactMatches?.length ? result.exactMatches : result.matches;
    if (!records.length) return "Aucun resultat ANIAPPS";

    return records.slice(0, 4).map(record => {
      const href = canonicalEditPath(record.id);
      return `<a href="${href}" target="_blank" rel="noopener">${record.id}</a> - ${escapeHtml(record.label)} <span>${escapeHtml(record.state)}</span>`;
    }).join("<br>");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderResults(container, results) {
    const counts = results.reduce((acc, result) => {
      const status = getStatus(result);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const summary = Object.entries(counts)
      .map(([status, count]) => `${count} ${status}`)
      .join(" - ");

    container.innerHTML = `
      <div class="fx-compare-summary">${escapeHtml(summary || "Aucun resultat")}</div>
      <table class="fx-compare-table">
        <thead>
          <tr>
            <th>Statut</th>
            <th>Programmation demandee</th>
            <th>Resultat ANIAPPS</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(result => {
            const status = getStatus(result);
            return `
              <tr>
                <td><span class="fx-compare-badge ${badgeClass(status)}">${escapeHtml(status)}</span></td>
                <td>${escapeHtml(result.label || result.item?.label || "")}</td>
                <td>${renderMatches(result)}</td>
                <td><pre>${escapeHtml(renderDifferences(result))}</pre></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  async function compareProgrammations(items, onProgress) {
    const output = [];

    for (let index = 0; index < items.length; index++) {
      if (onProgress) onProgress(index, items.length);

      try {
        const result = await compareItem(items[index]);
        result.sourceIndex = index;
        result.originalItem = items[index];
        output.push(result);
      } catch (error) {
        output.push({
          sourceIndex: index,
          originalItem: items[index],
          item: items[index],
          label: items[index]?.label || "",
          matches: [],
          exactMatches: [],
          differences: [],
          error: error.message || String(error)
        });
      }

      await wait(80);
    }

    if (onProgress) onProgress(items.length, items.length);
    return output;
  }

  function isExistingCoherent(result) {
    return getStatus(result) === "OK";
  }

  function remainingAfterPrecheck(results) {
    return results
      .filter(result => getStatus(result) === "Absente")
      .map(result => result.originalItem || result.item)
      .filter(Boolean);
  }

  function formatProgramValue(value) {
    return value === undefined || value === null || String(value).trim() === "" ? "-" : String(value);
  }

  function renderCreationPreview(container, programmations) {
    if (!programmations.length) {
      container.innerHTML = `
        <div class="fx-compare-summary">Aucune fiche a creer : toutes les programmations verifiees sont deja coherentes.</div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="fx-auto-create-preview-head">
        <h3>Fiches qui seront creees</h3>
        <span>${programmations.length} programmation(s)</span>
      </div>
      <table class="fx-auto-create-table">
        <thead>
          <tr>
            <th>Label</th>
            <th>Horaire</th>
            <th>Jour</th>
            <th>Salle</th>
            <th>Prof</th>
            <th>Places</th>
            <th>Tarif</th>
          </tr>
        </thead>
        <tbody>
          ${programmations.map(item => `
            <tr>
              <td>${escapeHtml(formatProgramValue(item.label))}</td>
              <td>${escapeHtml(formatProgramValue(item.debut))} - ${escapeHtml(formatProgramValue(item.fin))}<br><span>${escapeHtml(formatProgramValue(item.duree))} min</span></td>
              <td><code>${escapeHtml(formatProgramValue(item.jour))}</code></td>
              <td><code>${escapeHtml(formatProgramValue(item.salle))}</code></td>
              <td><code>${escapeHtml(formatProgramValue(item.prof))}</code></td>
              <td>${escapeHtml(formatProgramValue(item.places))}</td>
              <td>${escapeHtml(formatProgramValue(item.tarif))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  async function readSheetBatches() {
    const batches = await storage.get(SHEET_BATCHES_KEY);
    return Array.isArray(batches) ? batches : [];
  }

  function batchLabel(batch) {
    const rowCount = String(batch.rowsText || "").split(/\r?\n/).filter(line => line.trim() || line.includes("\t")).length;
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
            <th>Periode</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${batches.map(batch => `
            <tr>
              <td>${escapeHtml(batchLabel(batch))}</td>
              <td><code>${escapeHtml(batch.placeId || "")}</code></td>
              <td>${escapeHtml(batch.individualTarif || "")}<br>${escapeHtml(batch.collectiveTarif || "")}</td>
              <td>${escapeHtml(batch.dateBegin || batch.date_begin || "")}<br>${escapeHtml(batch.dateEnd || batch.date_end || "")}</td>
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
        dateBegin: batch.dateBegin || batch.date_begin || "",
        dateEnd: batch.dateEnd || batch.date_end || "",
        clonePattern: batch.clonePattern || DEFAULT_CLONE_PATTERN
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
      throw new Error(`${errors.length} ligne(s) en erreur. Corrige les donnees avant de comparer.`);
    }

    return preview.map(item => item.programmation).filter(Boolean);
  }

  function renderConversionPreview(container, preview) {
    const api = getMusicApi();
    container.innerHTML = api?.renderPreviewRows
      ? api.renderPreviewRows(preview)
      : `<div class="fx-compare-summary">${preview.length} programmation(s) convertie(s).</div>`;
  }

  async function fixResultsInline(results, onProgress) {
    const eligible = results.filter(resultNeedsCorrection);
    const fixed = [];

    for (let index = 0; index < eligible.length; index++) {
      if (onProgress) onProgress(index, eligible.length, eligible[index]);
      fixed.push(await updateAniappsSchedule(eligible[index]));
      await wait(120);
    }

    if (onProgress) onProgress(eligible.length, eligible.length, null);
    return fixed;
  }

  function showAutoPrecheck(items) {
    document.querySelector("#fx-auto-precheck-modal")?.remove();

    return new Promise(resolve => {
      let lastResults = [];
      const backdrop = document.createElement("div");
      backdrop.id = "fx-auto-precheck-modal";
      backdrop.className = "fx-laclef-modal-backdrop";
      backdrop.innerHTML = `
        <div class="fx-laclef-modal fx-compare-modal" role="dialog" aria-modal="true">
          <div class="fx-laclef-modal-header">
            <div>
              <h2 class="fx-laclef-modal-title">Verification avant creation</h2>
              <div class="fx-laclef-modal-subtitle">Les programmations deja presentes et coherentes seront retirees du lancement.</div>
            </div>
            <button type="button" class="fx-agenda-close" aria-label="Fermer">x</button>
          </div>
          <div class="fx-laclef-modal-body">
            <div class="fx-compare-loading">Comparaison ANIAPPS en cours...</div>
            <div class="fx-auto-precheck-results"></div>
            <div class="fx-auto-create-preview"></div>
            <div class="fx-laclef-modal-actions">
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-auto-precheck-cancel">Annuler</button>
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-auto-precheck-fix" disabled>Corriger existantes</button>
              <button type="button" class="fx-laclef-btn" id="fx-auto-precheck-continue" disabled>Charger les absentes</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(backdrop);

      const loading = backdrop.querySelector(".fx-compare-loading");
      const resultsContainer = backdrop.querySelector(".fx-auto-precheck-results");
      const creationPreviewContainer = backdrop.querySelector(".fx-auto-create-preview");
      const cancelButton = backdrop.querySelector("#fx-auto-precheck-cancel");
      const fixButton = backdrop.querySelector("#fx-auto-precheck-fix");
      const continueButton = backdrop.querySelector("#fx-auto-precheck-continue");

      const close = value => {
        backdrop.remove();
        resolve(value);
      };

      backdrop.querySelector(".fx-agenda-close").addEventListener("click", () => close(null));
      cancelButton.addEventListener("click", () => close(null));
      backdrop.addEventListener("click", event => {
        if (event.target === backdrop) close(null);
      });

      continueButton.addEventListener("click", () => close(remainingAfterPrecheck(lastResults)));

      async function renderFreshComparison() {
        const results = await compareProgrammations(items, (done, total) => {
          loading.textContent = `Comparaison ANIAPPS en cours... ${Math.min(done + 1, total)} / ${total}`;
        });

        lastResults = results;
        const existingCount = results.filter(isExistingCoherent).length;
        const remaining = remainingAfterPrecheck(results);
        const fixableCount = results.filter(resultNeedsCorrection).length;

        loading.textContent = `${existingCount} programmation(s) deja presente(s) et coherente(s) - ${remaining.length} absente(s) a charger.`;
        renderResults(resultsContainer, results);
        renderCreationPreview(creationPreviewContainer, remaining);
        fixButton.disabled = fixableCount === 0;
        fixButton.textContent = fixableCount ? `Corriger ${fixableCount} existante(s)` : "Corriger existantes";
        continueButton.disabled = false;
        continueButton.textContent = remaining.length
          ? `Charger ${remaining.length} absente(s)`
          : "Aucune creation necessaire";
      }

      fixButton.addEventListener("click", async () => {
        const eligibleCount = lastResults.filter(resultNeedsCorrection).length;
        if (!eligibleCount) return;

        const confirmed = await showDialog({
          title: "Corriger ANIAPPS",
          message: `Corriger ${eligibleCount} fiche(s) ANIAPPS existante(s) ?`,
          detail: "Les labels et les champs incoherents seront remis sur les valeurs demandees, puis la comparaison sera relancee.",
          actions: [
            { label: "Corriger", value: true, primary: true },
            { label: "Annuler", value: false }
          ]
        });

        if (!confirmed) return;

        close(null);
        startCorrectionQueue(lastResults);
      });

      renderFreshComparison().catch(error => {
        loading.textContent = "Comparaison impossible.";
        resultsContainer.innerHTML = `<div class="fx-compare-summary">${escapeHtml(error.message || String(error))}</div>`;
        continueButton.disabled = true;
      });
    });
  }

  function createModal() {
    document.querySelector(`#${MODAL_ID}`)?.remove();

    const stored = readStoredProgrammations();
    let lastResults = [];
    const backdrop = document.createElement("div");
    backdrop.id = MODAL_ID;
    backdrop.className = "fx-laclef-modal-backdrop";
    backdrop.innerHTML = `
      <div class="fx-laclef-modal fx-compare-modal" role="dialog" aria-modal="true">
        <div class="fx-laclef-modal-header">
          <div>
            <h2 class="fx-laclef-modal-title">Comparer des programmations</h2>
            <div class="fx-laclef-modal-subtitle">Recherche directe dans ANIAPPS, sans export CSV</div>
          </div>
          <button type="button" class="fx-agenda-close" aria-label="Fermer">×</button>
        </div>
        <div class="fx-laclef-modal-body">
          <label class="fx-compare-label" for="fx-compare-json">Programmations JSON a verifier</label>
          <textarea id="fx-compare-json" spellcheck="false"></textarea>
          <div class="fx-laclef-note">
            La comparaison cherche chaque label dans ANIAPPS. Si un resultat exact existe, l'extension ouvre la fiche en arriere-plan pour verifier les champs techniques.
          </div>
          <div class="fx-laclef-modal-actions">
            <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-compare-clean">Corriger</button>
            <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-compare-dedupe">Supprimer doublons</button>
            <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-compare-sample">Exemple</button>
            <button type="button" class="fx-laclef-btn" id="fx-compare-run">Comparer</button>
          </div>
          <div class="fx-compare-followup">
            <button type="button" class="fx-laclef-btn fx-laclef-btn-outline" id="fx-compare-create-missing" hidden>Charger manquantes dans Auto</button>
          </div>
          <div class="fx-compare-results" aria-live="polite"></div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const textarea = backdrop.querySelector("#fx-compare-json");
    const closeButton = backdrop.querySelector(".fx-agenda-close");
    const cleanButton = backdrop.querySelector("#fx-compare-clean");
    const dedupeButton = backdrop.querySelector("#fx-compare-dedupe");
    const sampleButton = backdrop.querySelector("#fx-compare-sample");
    const runButton = backdrop.querySelector("#fx-compare-run");
    const createMissingButton = backdrop.querySelector("#fx-compare-create-missing");
    const results = backdrop.querySelector(".fx-compare-results");

    textarea.value = JSON.stringify(stored.length ? stored : SAMPLE, null, 2);

    closeButton.addEventListener("click", () => backdrop.remove());
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) backdrop.remove();
    });

    sampleButton.addEventListener("click", () => {
      textarea.value = JSON.stringify(SAMPLE, null, 2);
    });

    function readJsonFromTextarea() {
      const parsed = JSON.parse(textarea.value);
      if (!Array.isArray(parsed)) throw new Error("Le JSON doit etre un tableau.");
      return parsed;
    }

    cleanButton.addEventListener("click", async () => {
      try {
        if (!lastResults.length) {
          const parsed = readJsonFromTextarea();
          const cleaned = parsed.map(normalizeProgrammationItem);
          textarea.value = JSON.stringify(cleaned, null, 2);
          notify(`${cleaned.length} label(s) normalise(s).`, "Comparaison programmations");
          return;
        }

        const eligible = lastResults.filter(resultNeedsCorrection);

        if (!eligible.length) {
          notify("Aucune fiche a corriger. Les correspondances uniques sont deja coherentes.", "Comparaison programmations");
          return;
        }

        const confirmed = await showDialog({
          title: "Corriger ANIAPPS",
          message: `Corriger ${eligible.length} fiche(s) ANIAPPS ?`,
          detail: "Le label ANIAPPS sera remplace par le label demande. Les champs en difference seront aussi remis sur les valeurs du JSON.",
          actions: [
            { label: "Corriger", value: true, primary: true },
            { label: "Annuler", value: false }
          ]
        });

        if (!confirmed) return;

        startCorrectionQueue(lastResults);
      } catch (error) {
        notify(error.message || "Correction impossible.", "Comparaison programmations");
      } finally {
        cleanButton.disabled = false;
        cleanButton.textContent = "Corriger";
      }
    });

    dedupeButton.addEventListener("click", () => {
      try {
        const parsed = readJsonFromTextarea();
        const deduped = dedupeProgrammations(parsed);
        textarea.value = JSON.stringify(deduped, null, 2);
        notify(`${parsed.length - deduped.length} doublon(s) supprime(s).`, "Comparaison programmations");
      } catch (error) {
        notify("JSON invalide : " + error.message, "Comparaison programmations");
      }
    });

    createMissingButton.addEventListener("click", () => {
      const missing = lastResults
        .filter(result => getStatus(result) === "Absente")
        .map(result => normalizeProgrammationItem(result.item));

      if (!missing.length) {
        notify("Aucune programmation absente a charger.", "Comparaison programmations");
        return;
      }

      localStorage.setItem(AUTO_DATA_KEY, JSON.stringify(dedupeProgrammations(missing)));
      localStorage.setItem(AUTO_INDEX_KEY, "0");
      localStorage.setItem(AUTO_MODE_KEY, "fill");
      localStorage.setItem(AUTO_CLONE_KEY, localStorage.getItem(AUTO_CLONE_KEY) || DEFAULT_CLONE_PATTERN);
      localStorage.removeItem(AUTO_ENABLED_KEY);

      notify(
        `${missing.length} programmation(s) manquante(s) chargee(s) dans Auto programmations.\nOuvre une fiche modele clonee, puis lance Auto programmations > Demarrer.`,
        "Creation preparee"
      );
    });

    runButton.addEventListener("click", async () => {
      let parsed;

      try {
        parsed = readJsonFromTextarea();
      } catch (error) {
        notify("JSON invalide : " + error.message, "Comparaison programmations");
        return;
      }

      if (!Array.isArray(parsed) || !parsed.length) {
        notify("Le JSON doit etre un tableau non vide.", "Comparaison programmations");
        return;
      }

      runButton.disabled = true;
      runButton.textContent = "Comparaison...";
      results.innerHTML = `<div class="fx-compare-loading">0 / ${parsed.length}</div>`;

      createMissingButton.hidden = true;

      try {
        const output = await compareProgrammations(parsed, (done, total) => {
          const current = parsed[Math.min(done, parsed.length - 1)] || {};
          results.innerHTML = `<div class="fx-compare-loading">${Math.min(done + 1, total)} / ${total} - ${escapeHtml(current.label || "")}</div>`;
        });

        lastResults = output;
        renderResults(results, output);
        createMissingButton.hidden = !output.some(result => getStatus(result) === "Absente");
      } finally {
        runButton.disabled = false;
        runButton.textContent = "Comparer";
      }
    });

    setTimeout(() => textarea.focus(), 50);
  }

  function createModal() {
    document.querySelector(`#${MODAL_ID}`)?.remove();

    const stored = readStoredProgrammations();
    const api = getMusicApi();
    const refs = api?.getReferences?.() || { contacts: [], places: [], tarifs: [] };
    const settings = api?.readSettings?.() || {};
    const suffixes = api?.readSuffixes?.() || {};
    let lastResults = [];
    let lastItems = [];
    let lastConvertPreview = [];
    let lastSheetBatches = [];

    const backdrop = document.createElement("div");
    backdrop.id = MODAL_ID;
    backdrop.className = "fx-laclef-modal-backdrop";
    backdrop.innerHTML = `
      <div class="fx-laclef-modal fx-compare-modal fx-auto-modal" role="dialog" aria-modal="true">
        <div class="fx-laclef-modal-header">
          <div>
            <h2 class="fx-laclef-modal-title">Comparer des programmations</h2>
            <div class="fx-laclef-modal-subtitle">Google Sheets, JSON manuel ou conversion directe, avec correction des fiches existantes.</div>
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
            <div class="fx-laclef-note">Compare les lots prepares depuis Google Sheets avec les fiches ANIAPPS existantes.</div>
            <div class="fx-compare-sheets-list"><div class="fx-agenda-loading">Chargement des lots...</div></div>
            <div class="fx-laclef-modal-actions">
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-compare-refresh-sheets">Actualiser</button>
              <button type="button" class="fx-laclef-btn" id="fx-compare-run-sheets">Comparer lots</button>
            </div>
            <div class="fx-compare-sheets-preview"></div>
          </section>

          <section class="fx-music-tab-panel" data-panel="manual" hidden>
            <label class="fx-compare-label" for="fx-compare-json">Programmations JSON a verifier</label>
            <textarea id="fx-compare-json" spellcheck="false"></textarea>
            <div class="fx-laclef-note">La comparaison cherche chaque programmation dans ANIAPPS puis verifie les champs techniques de la fiche.</div>
            <div class="fx-laclef-modal-actions">
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-compare-clean">Normaliser JSON</button>
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-compare-dedupe">Supprimer doublons</button>
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-compare-sample">Exemple</button>
              <button type="button" class="fx-laclef-btn" id="fx-compare-run">Comparer JSON</button>
            </div>
          </section>

          <section class="fx-music-tab-panel" data-panel="convert" hidden>
            <div class="fx-laclef-form-grid fx-laclef-form-grid-compact">
              <div class="fx-laclef-field">
                <label for="fx-compare-convert-instrument">Instrument</label>
                <input id="fx-compare-convert-instrument" value="${escapeHtml(settings.instrument || "")}" placeholder="Piano">
              </div>
              <div class="fx-laclef-field">
                <label for="fx-compare-convert-place">Salle unique</label>
                <select id="fx-compare-convert-place">${api?.renderOptions ? api.renderOptions(refs.places || [], settings.placeId || "", "Choisir une salle") : ""}</select>
              </div>
              <div class="fx-laclef-field">
                <label for="fx-compare-convert-tarif-individual">Tarif individuel</label>
                <select id="fx-compare-convert-tarif-individual">${api?.renderTarifOptions ? api.renderTarifOptions(refs.tarifs || [], settings.individualTarif || "", "Choisir un tarif") : ""}</select>
              </div>
              <div class="fx-laclef-field">
                <label for="fx-compare-convert-tarif-collective">Tarif collectif</label>
                <select id="fx-compare-convert-tarif-collective">${api?.renderTarifOptions ? api.renderTarifOptions(refs.tarifs || [], settings.collectiveTarif || "", "Choisir un tarif") : ""}</select>
              </div>
              <div class="fx-laclef-field">
                <label for="fx-compare-convert-date-begin">Debute le</label>
                <input id="fx-compare-convert-date-begin" type="date" value="${escapeHtml(settings.dateBegin || "")}">
              </div>
              <div class="fx-laclef-field">
                <label for="fx-compare-convert-date-end">Termine le</label>
                <input id="fx-compare-convert-date-end" type="date" value="${escapeHtml(settings.dateEnd || "")}">
              </div>
              <div class="fx-laclef-field fx-laclef-field-full">
                <label for="fx-compare-convert-rows">Lignes Google Sheets A:B</label>
                <textarea id="fx-compare-convert-rows" spellcheck="false" placeholder="LUN 16H30-17H\tFernando De Almeida"></textarea>
              </div>
            </div>
            <div class="fx-laclef-modal-actions">
              <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-compare-convert-preview">Previsualiser</button>
              <button type="button" class="fx-laclef-btn" id="fx-compare-run-convert">Comparer conversion</button>
            </div>
            <div class="fx-compare-convert-preview"></div>
          </section>

          <section class="fx-music-tab-panel" data-panel="suffixes" hidden>
            <div class="fx-laclef-note">Suffixes utilises dans les labels generes depuis le cahier musique.</div>
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
              <button type="button" class="fx-laclef-btn" id="fx-compare-save-suffixes">Enregistrer suffixes</button>
            </div>
          </section>

          <div class="fx-compare-followup">
            <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-compare-fix-existing" hidden>Corriger existantes</button>
            <button type="button" class="fx-laclef-btn fx-laclef-btn-outline" id="fx-compare-create-missing" hidden>Charger manquantes dans Auto</button>
          </div>
          <div class="fx-compare-results" aria-live="polite"></div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const textarea = backdrop.querySelector("#fx-compare-json");
    const closeButton = backdrop.querySelector(".fx-agenda-close");
    const cleanButton = backdrop.querySelector("#fx-compare-clean");
    const dedupeButton = backdrop.querySelector("#fx-compare-dedupe");
    const sampleButton = backdrop.querySelector("#fx-compare-sample");
    const runButton = backdrop.querySelector("#fx-compare-run");
    const runSheetsButton = backdrop.querySelector("#fx-compare-run-sheets");
    const refreshSheetsButton = backdrop.querySelector("#fx-compare-refresh-sheets");
    const runConvertButton = backdrop.querySelector("#fx-compare-run-convert");
    const previewConvertButton = backdrop.querySelector("#fx-compare-convert-preview");
    const saveSuffixesButton = backdrop.querySelector("#fx-compare-save-suffixes");
    const fixExistingButton = backdrop.querySelector("#fx-compare-fix-existing");
    const createMissingButton = backdrop.querySelector("#fx-compare-create-missing");
    const sheetList = backdrop.querySelector(".fx-compare-sheets-list");
    const sheetPreview = backdrop.querySelector(".fx-compare-sheets-preview");
    const convertPreview = backdrop.querySelector(".fx-compare-convert-preview");
    const results = backdrop.querySelector(".fx-compare-results");

    textarea.value = JSON.stringify(stored.length ? stored : SAMPLE, null, 2);

    closeButton.addEventListener("click", () => backdrop.remove());
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

    function readJsonFromTextarea() {
      const parsed = JSON.parse(textarea.value);
      if (!Array.isArray(parsed)) throw new Error("Le JSON doit etre un tableau.");
      return parsed;
    }

    function currentConvertSettings() {
      return {
        instrument: backdrop.querySelector("#fx-compare-convert-instrument").value.trim(),
        placeId: backdrop.querySelector("#fx-compare-convert-place").value,
        individualTarif: backdrop.querySelector("#fx-compare-convert-tarif-individual").value,
        collectiveTarif: backdrop.querySelector("#fx-compare-convert-tarif-collective").value,
        dateBegin: backdrop.querySelector("#fx-compare-convert-date-begin").value,
        dateEnd: backdrop.querySelector("#fx-compare-convert-date-end").value
      };
    }

    async function refreshSheetList() {
      lastSheetBatches = await readSheetBatches();
      sheetList.innerHTML = renderBatchList(lastSheetBatches);
    }

    function refreshConvertPreview() {
      const converter = getMusicApi();
      if (!converter) throw new Error("Moteur de conversion indisponible.");
      converter.syncReferencesFromPage?.();
      lastConvertPreview = converter.buildPreview(
        backdrop.querySelector("#fx-compare-convert-rows").value,
        currentConvertSettings(),
        converter.getReferences(),
        converter.readSuffixes()
      );
      renderConversionPreview(convertPreview, lastConvertPreview);
      return lastConvertPreview;
    }

    async function compareItems(items, button, idleLabel) {
      if (!Array.isArray(items) || !items.length) {
        notify("Aucune programmation a comparer.", "Comparaison programmations");
        return;
      }

      lastItems = dedupeProgrammations(items);
      button.disabled = true;
      button.textContent = "Comparaison...";
      results.innerHTML = `<div class="fx-compare-loading">0 / ${lastItems.length}</div>`;
      createMissingButton.hidden = true;
      fixExistingButton.hidden = true;

      try {
        const output = await compareProgrammations(lastItems, (done, total) => {
          const current = lastItems[Math.min(done, lastItems.length - 1)] || {};
          results.innerHTML = `<div class="fx-compare-loading">${Math.min(done + 1, total)} / ${total} - ${escapeHtml(current.label || "")}</div>`;
        });

        lastResults = output;
        renderResults(results, output);
        createMissingButton.hidden = !output.some(result => getStatus(result) === "Absente");
        fixExistingButton.hidden = !output.some(resultNeedsCorrection);
        fixExistingButton.textContent = `Corriger ${output.filter(resultNeedsCorrection).length} existante(s)`;
      } finally {
        button.disabled = false;
        button.textContent = idleLabel;
      }
    }

    sampleButton.addEventListener("click", () => {
      textarea.value = JSON.stringify(SAMPLE, null, 2);
    });

    cleanButton.addEventListener("click", () => {
      try {
        const parsed = readJsonFromTextarea();
        const cleaned = parsed.map(normalizeProgrammationItem);
        textarea.value = JSON.stringify(cleaned, null, 2);
        notify(`${cleaned.length} label(s) normalise(s).`, "Comparaison programmations");
      } catch (error) {
        notify(error.message || "Normalisation impossible.", "Comparaison programmations");
      }
    });

    dedupeButton.addEventListener("click", () => {
      try {
        const parsed = readJsonFromTextarea();
        const deduped = dedupeProgrammations(parsed);
        textarea.value = JSON.stringify(deduped, null, 2);
        notify(`${parsed.length - deduped.length} doublon(s) supprime(s).`, "Comparaison programmations");
      } catch (error) {
        notify("JSON invalide : " + error.message, "Comparaison programmations");
      }
    });

    refreshSheetsButton.addEventListener("click", refreshSheetList);

    runSheetsButton.addEventListener("click", async () => {
      try {
        await refreshSheetList();
        if (!lastSheetBatches.length) throw new Error("Aucun lot Google Sheets en attente.");
        const preview = convertSheetBatches(lastSheetBatches);
        renderConversionPreview(sheetPreview, preview);
        await compareItems(previewToProgrammations(preview), runSheetsButton, "Comparer lots");
      } catch (error) {
        notify(error.message || "Comparaison des lots impossible.", "Comparaison programmations");
      }
    });

    previewConvertButton.addEventListener("click", () => {
      try {
        refreshConvertPreview();
      } catch (error) {
        notify(error.message || "Previsualisation impossible.", "Comparaison programmations");
      }
    });

    runConvertButton.addEventListener("click", async () => {
      try {
        const preview = lastConvertPreview.length ? lastConvertPreview : refreshConvertPreview();
        await compareItems(previewToProgrammations(preview), runConvertButton, "Comparer conversion");
      } catch (error) {
        notify(error.message || "Comparaison conversion impossible.", "Comparaison programmations");
      }
    });

    saveSuffixesButton.addEventListener("click", () => {
      const converter = getMusicApi();
      if (!converter) return;
      const next = { ...converter.readSuffixes() };
      backdrop.querySelectorAll(".fx-music-suffix-input").forEach(input => {
        const value = input.value.trim().toUpperCase();
        if (value) next[input.dataset.profId] = value;
        else delete next[input.dataset.profId];
      });
      converter.writeSuffixes(next);
      notify("Suffixes profs enregistres.", "Comparaison programmations");
    });

    fixExistingButton.addEventListener("click", async () => {
      const eligibleCount = lastResults.filter(resultNeedsCorrection).length;
      if (!eligibleCount) return;

      const confirmed = await showDialog({
        title: "Corriger ANIAPPS",
        message: `Corriger ${eligibleCount} fiche(s) ANIAPPS ?`,
        detail: "Les labels et champs incoherents seront remis sur les valeurs demandees, puis la comparaison sera relancee.",
        actions: [
          { label: "Corriger", value: true, primary: true },
          { label: "Annuler", value: false }
        ]
      });

      if (!confirmed) return;

      backdrop.remove();
      startCorrectionQueue(lastResults);
    });

    createMissingButton.addEventListener("click", () => {
      const missing = lastResults
        .filter(result => getStatus(result) === "Absente")
        .map(result => normalizeProgrammationItem(result.item));

      if (!missing.length) {
        notify("Aucune programmation absente a charger.", "Comparaison programmations");
        return;
      }

      localStorage.setItem(AUTO_DATA_KEY, JSON.stringify(dedupeProgrammations(missing)));
      localStorage.setItem(AUTO_INDEX_KEY, "0");
      localStorage.setItem(AUTO_MODE_KEY, "fill");
      localStorage.setItem(AUTO_CLONE_KEY, localStorage.getItem(AUTO_CLONE_KEY) || DEFAULT_CLONE_PATTERN);
      localStorage.removeItem(AUTO_ENABLED_KEY);

      notify(
        `${missing.length} programmation(s) manquante(s) chargee(s) dans Auto programmations.\nOuvre une fiche modele clonee, puis lance Auto programmations > Demarrer.`,
        "Creation preparee"
      );
    });

    runButton.addEventListener("click", async () => {
      try {
        await compareItems(readJsonFromTextarea(), runButton, "Comparer JSON");
      } catch (error) {
        notify("JSON invalide : " + error.message, "Comparaison programmations");
      }
    });

    refreshSheetList().catch(error => {
      sheetList.innerHTML = `<div class="fx-compare-summary">${escapeHtml(error.message || String(error))}</div>`;
    });
    setTimeout(() => textarea.focus(), 50);
  }

  window.FXAniappsCompareProgrammations = {
    compareProgrammations,
    showAutoPrecheck,
    getStatus
  };

  function findInsertionPoint() {
    const exportButton = [...document.querySelectorAll("a, button, input")]
      .find(el => normalizeText(el.value || el.textContent || "").includes("exporter"));

    if (exportButton?.parentElement) return exportButton.parentElement;

    const filterActions = [...document.querySelectorAll(".form-group, .text-center")]
      .find(el => normalizeText(el.textContent || "").includes("filtrer"));

    return filterActions || document.querySelector(".ibox-content") || document.body;
  }

  function addButton() {
    if (!isListPage()) {
      document.querySelector(`#${ROOT_ID}`)?.remove();
      return;
    }

    if (document.querySelector(`#${BUTTON_ID}`)) return;

    const root = document.createElement("span");
    root.id = ROOT_ID;
    root.className = "fx-compare-root";

    const button = makeButton("Comparer programmations", "fx-laclef-btn-inline fx-laclef-btn-outline fx-compare-btn");
    button.id = BUTTON_ID;
    button.addEventListener("click", createModal);
    root.appendChild(button);

    const insertionPoint = findInsertionPoint();
    insertionPoint.appendChild(root);
  }

  onPageChange(() => {
    setTimeout(addButton, 150);
    setTimeout(addButton, 700);
    setTimeout(() => runCorrectionQueue().catch(error => {
      console.error("[La CLEF Assistant] Correction queue impossible", error);
      clearCorrectionQueue();
      notify(error.message || "Correction interrompue.", "Correction ANIAPPS");
    }), 300);
  });

  new MutationObserver(addButton).observe(document.body, {
    childList: true,
    subtree: true
  });

  setTimeout(() => runCorrectionQueue().catch(error => {
    console.error("[La CLEF Assistant] Correction queue impossible", error);
    clearCorrectionQueue();
    notify(error.message || "Correction interrompue.", "Correction ANIAPPS");
  }), 900);
})();
