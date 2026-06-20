(function () {
  "use strict";

  if (window.__fxAniappsAgendaLiveLoaded) return;
  window.__fxAniappsAgendaLiveLoaded = true;

  const {
    wait,
    makeButton,
    notify,
    normalizeText,
    onPageChange
  } = window.FXLaclefExtension;

  const BUTTON_ID = "fx-agenda-live-btn";
  const MODAL_ID = "fx-agenda-live-modal";
  const EXCLUDED_TITLE_PARTS = [
    "preinscription",
    "vacances"
  ];

  const CACHE_KEY = "fx_agenda_live_cache_v1";
  const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
  let memoryCache = null;

  let refreshTimer = null;

  function isAgendaPage() {
    return location.hostname === "laclef.aniapp.fr" && location.pathname === "/admin/agenda";
  }

  function formatDateForAgenda(date) {
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  }

  function endOfNextDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 2, 0, 0, 0);
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function saveAgendaCache(events) {
  const payload = {
    savedAt: Date.now(),
    events: events.map(event => ({
      ...event,
      start: event.start?.toISOString(),
      end: event.end?.toISOString()
    }))
  };

  memoryCache = payload;
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

function loadAgendaCache() {
  const payload =
    memoryCache ||
    JSON.parse(localStorage.getItem(CACHE_KEY) || "null");

  if (!payload?.events) return null;

  return {
    savedAt: payload.savedAt,
    events: payload.events.map(event => ({
      ...event,
      start: new Date(event.start),
      end: new Date(event.end)
    }))
  };
}

function isCacheFresh(cache) {
  return cache && Date.now() - cache.savedAt < CACHE_TTL_MS;
}

function parseTimeOnDate(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;

  let datePart;

  if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
    const pad = value => String(value).padStart(2, "0");
    datePart = `${dateValue.getFullYear()}-${pad(dateValue.getMonth() + 1)}-${pad(dateValue.getDate())}`;
  } else {
    datePart = String(dateValue).slice(0, 10);
  }

  const match = String(timeValue).match(/(\d{1,2})[:h](\d{2})/i);
  if (!datePart || !match) return null;

  const result = new Date(
    `${datePart}T${match[1].padStart(2, "0")}:${match[2]}:00`
  );

  return Number.isNaN(result.getTime()) ? null : result;
}

  function formatTime(date) {
    if (!date) return "--:--";
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  function cleanTitle(title) {
    return String(title || "").replace(/\s+/g, " ").trim();
  }

  function shouldExclude(event) {
    const title = normalizeText(event.title);
    return EXCLUDED_TITLE_PARTS.some(part => title.includes(part));
  }

function buildAgendaUrl() {
  const source =
    document.querySelector(".calendar")?.dataset?.source ||
    "/admin/agenda.json";

  const url = new URL(source, location.origin);
  const form = document.querySelector("form.calendar-filter");
  const data = form ? new FormData(form) : new FormData();
  const now = new Date();

  for (const [key, value] of data.entries()) {
    if (value !== "" && key !== "utf8" && key !== "commit") {
      url.searchParams.set(key, value);
    }
  }

  url.searchParams.set("start", formatDateForAgenda(startOfDay(now)));
  url.searchParams.set("end", formatDateForAgenda(endOfNextDay(now)));

  return url;
}

  function normalizeAgendaEvent(raw) {
    const props = raw.extendedProps || raw;
    const start = parseDate(raw.start || props.start);
    let end = parseDate(raw.end || props.end);

    if (!end && props.hour_end) end = parseTimeOnDate(raw.start || props.date, props.hour_end);
    if (!end && props.end_time) end = parseTimeOnDate(raw.start || props.date, props.end_time);
    if (!end && start) end = new Date(start.getTime() + 60 * 60 * 1000);

    return {
      id: raw.id || props.id || props.activity_session_id,
      title: cleanTitle(raw.title || props.title),
      start,
      end,
      teacher: props.teacher || props.contact || props.intervenant || props.instructor || "",
      room: props.room || props.place || props.location || props.lieu || "",
      registrations: props.registrations || props.registration_count || props.inscriptions || "",
      capacity: props.capacity || props.max_capacity || props.capacite || "",
      raw
    };
  }

  function textAfterLabel(doc, label) {
    const wanted = normalizeText(label);
    const blocks = [...doc.querySelectorAll(".ibox-content")];

    for (const block of blocks) {
      const labelEl = [...block.querySelectorAll("span")]
        .find(span => normalizeText(span.textContent) === wanted);
      if (!labelEl) continue;

      const value = block.querySelector("h2, h3, h4");
      if (value?.textContent?.trim()) return value.textContent.trim();
    }

    return "";
  }

  function parseDetailsHtml(html, fallbackEvent) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const modalTitle = doc.querySelector(".modal-title .center")?.textContent?.trim() || "";
    const activity = doc.querySelector(".modal-title .small")?.textContent?.trim() || "";
    const dateText = textAfterLabel(doc, "Samedi") ||
      textAfterLabel(doc, "Lundi") ||
      textAfterLabel(doc, "Mardi") ||
      textAfterLabel(doc, "Mercredi") ||
      textAfterLabel(doc, "Jeudi") ||
      textAfterLabel(doc, "Vendredi") ||
      textAfterLabel(doc, "Dimanche");
    const startText = textAfterLabel(doc, "Debut") || textAfterLabel(doc, "Début");
    const endText = textAfterLabel(doc, "Fin");
    const registrationsText = textAfterLabel(doc, "Inscriptions");
    const locationText = textAfterLabel(doc, "Lieu");

    const parsedStart = parseTimeOnDate(fallbackEvent.start, startText);
    const parsedEnd = parseTimeOnDate(fallbackEvent.start, endText);

    const start = parsedStart || fallbackEvent.start;
    const end = parsedEnd || fallbackEvent.end;
    const [registered, capacity] = String(registrationsText).split("/").map(part => part?.trim() || "");

    return {
      ...fallbackEvent,
      title: cleanTitle(modalTitle.replace(/^●\s*/, "")) || fallbackEvent.title,
      activity: activity || "",
      start,
      end,
      teacher: textAfterLabel(doc, "Intervenant") || fallbackEvent.teacher,
      room: locationText.replace(/^MJC La CLEF\s*-\s*/i, "") || fallbackEvent.room,
      registrations: registered || fallbackEvent.registrations,
      capacity: capacity || fallbackEvent.capacity,
      dateText
    };
  }

  async function fetchEventDetails(event) {
    if (!event.id) return event;

    try {
      const response = await fetch(`/admin/agenda/${encodeURIComponent(event.id)}`, {
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest" }
      });

      if (!response.ok) return event;

      return parseDetailsHtml(await response.text(), event);
    } catch (error) {
      console.warn("[La CLEF Assistant] Detail agenda non lu", event.id, error);
      return event;
    }
  }

async function fetchAgendaEvents() {
  const url = buildAgendaUrl();

  const response = await fetch(url.toString(), {
    credentials: "include",
    headers: {
      "Accept": "application/json",
      "X-Requested-With": "XMLHttpRequest"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Agenda indisponible : HTTP ${response.status}`);
  }

  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
    console.error("[Agenda live] Réponse HTML reçue au lieu du JSON :", text.slice(0, 500));
    throw new Error("ANIAPPS a renvoyé du HTML au lieu du JSON. Vérifie l'URL agenda.json.");
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    console.error("[Agenda live] Réponse non JSON :", text.slice(0, 500));
    throw new Error("Réponse agenda.json illisible.");
  }

  const rawEvents = Array.isArray(payload) ? payload : payload.events || [];

  console.table(rawEvents.map(e => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end
  })));

  const baseEvents = rawEvents
    .map(normalizeAgendaEvent)
    .filter(event => event.start && event.end && !shouldExclude(event));

  const now = new Date();
  const horizon = new Date(now.getTime() + 60 * 60 * 1000);

  const relevant = baseEvents
    .filter(event => event.end >= now && event.start <= horizon)
    .sort((a, b) => a.start - b.start)
    .slice(0, 35);

  const detailed = [];

  for (const event of relevant) {
    detailed.push(await fetchEventDetails(event));
    await wait(25);
  }

  return detailed;
}

  function classifyEvents(events) {
    const now = new Date();
    const soon30 = new Date(now.getTime() + 30 * 60 * 1000);

    return {
      current: events.filter(event => event.start <= now && event.end > now),
      startingSoon: events.filter(event => event.start > now && event.start <= soon30)
    };
  }

  function countText(event) {
    if (event.registrations || event.capacity) return `${event.registrations || "0"} / ${event.capacity || "?"}`;
    return "-";
  }

  function renderRows(events) {
    if (!events.length) {
      return `<tr><td colspan="5" class="fx-agenda-empty">Aucun cours</td></tr>`;
    }

    return events.map(event => `
      <tr>
        <td class="fx-agenda-time">${formatTime(event.start)} - ${formatTime(event.end)}</td>
        <td>${event.title || "-"}</td>
        <td>${event.teacher || "-"}</td>
        <td>${event.room || "-"}</td>
        <td class="fx-agenda-count">${countText(event)}</td>
      </tr>
    `).join("");
  }

  function renderSection(title, events, hint) {
    return `
      <section class="fx-agenda-section">
        <div class="fx-agenda-section-head">
          <h3>${title}</h3>
          <span>${hint}</span>
        </div>
        <table class="fx-agenda-table">
          <thead>
            <tr>
              <th>Horaire</th>
              <th>Cours</th>
              <th>Intervenant</th>
              <th>Salle</th>
              <th>Inscrits</th>
            </tr>
          </thead>
          <tbody>${renderRows(events)}</tbody>
        </table>
      </section>
    `;
  }

  function ensureModal() {
    let modal = document.querySelector(`#${MODAL_ID}`);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "fx-laclef-modal-backdrop";
    modal.innerHTML = `
      <div class="fx-laclef-modal fx-agenda-modal" role="dialog" aria-modal="true">
        <div class="fx-laclef-modal-header">
          <div>
            <h2 class="fx-laclef-modal-title">Cours en cours et à venir</h2>
            <div class="fx-laclef-modal-subtitle fx-agenda-updated">Actualisation...</div>
          </div>
          <button type="button" class="fx-agenda-close" aria-label="Fermer">×</button>
        </div>
        <div class="fx-laclef-modal-body">
          <div class="fx-agenda-content">Chargement...</div>
        </div>
      </div>
    `;

    modal.querySelector(".fx-agenda-close").addEventListener("click", closeAgendaModal);
    modal.addEventListener("click", event => {
      if (event.target === modal) closeAgendaModal();
    });

    document.body.appendChild(modal);
    return modal;
  }

async function refreshAgendaModal(force = false) {
  const modal = ensureModal();
  const content = modal.querySelector(".fx-agenda-content");
  const updated = modal.querySelector(".fx-agenda-updated");

  const cache = loadAgendaCache();

  if (cache) {
    const groups = classifyEvents(cache.events);

    content.innerHTML = [
      renderSection("Cours du moment", groups.current, "maintenant"),
      renderSection("Démarrent bientôt", groups.startingSoon, "dans les 30 prochaines minutes")
    ].join("");

    updated.textContent = `Cache mis à jour à ${formatTime(new Date(cache.savedAt))}`;
  } else {
    content.innerHTML = `<div class="fx-agenda-loading">Chargement des cours...</div>`;
  }

  if (!force && isCacheFresh(cache)) return;

  try {
    const events = await fetchAgendaEvents();
    saveAgendaCache(events);

    const groups = classifyEvents(events);

    content.innerHTML = [
      renderSection("Cours du moment", groups.current, "maintenant"),
      renderSection("Démarrent bientôt", groups.startingSoon, "dans les 30 prochaines minutes")
    ].join("");

    updated.textContent = `Mis à jour à ${formatTime(new Date())}`;
  } catch (error) {
    console.error("[La CLEF Assistant] Agenda live impossible", error);

    if (!cache) {
      content.innerHTML = `<div class="fx-agenda-empty">Impossible de charger l'agenda : ${error.message}</div>`;
    }
  }
}

function openAgendaModal() {
  refreshAgendaModal(false);
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => refreshAgendaModal(false), 60 * 1000);
}

  function closeAgendaModal() {
    document.querySelector(`#${MODAL_ID}`)?.remove();
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  function addAgendaButton() {
    if (!isAgendaPage()) {
      document.querySelector(`#${BUTTON_ID}`)?.remove();
      closeAgendaModal();
      return;
    }

    if (document.querySelector(`#${BUTTON_ID}`)) return;

    const actionsBox = [...document.querySelectorAll(".ibox")]
      .find(box => normalizeText(box.textContent).includes("actions"));
    const target = actionsBox?.querySelector(".ibox-content") ||
      document.querySelector(".calendar")?.closest(".ibox")?.querySelector(".ibox-content");

    if (!target) return;

    const button = makeButton("Voir les cours du moment", "fx-laclef-btn-inline fx-agenda-live-btn");
    button.id = BUTTON_ID;
    button.addEventListener("click", openAgendaModal);
    target.appendChild(button);
  }

  onPageChange(() => {
    setTimeout(addAgendaButton, 150);
    setTimeout(addAgendaButton, 700);
  });

  new MutationObserver(addAgendaButton).observe(document.body, {
    childList: true,
    subtree: true
  });
})();
