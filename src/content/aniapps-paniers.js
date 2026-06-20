(function () {
  "use strict";

  if (window.__fxAniappsPaniersLoaded) return;
  window.__fxAniappsPaniersLoaded = true;

  const { wait, makeButton } = window.FXLaclefExtension;
  const CACHE_KEY = "fx_aniapps_pending_checkouts_cache_v1";
  let running = false;
  let scheduled = false;

  function isPendingCheckoutsPage() {
    return location.pathname === "/admin/pending_checkouts";
  }

  function getCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function setCache(cache) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }

  function getCartId(url) {
    const match = url.match(/pending_checkouts\/(\d+)/);
    return match ? match[1] : url;
  }

  function parsePrice(value) {
    return Number(
      String(value || "")
        .replace(/\s/g, "")
        .replace("EUR", "")
        .replace("€", "")
        .replace(",", ".")
        .replace(/[^\d.]/g, "")
    ) || 0;
  }

  function formatPrice(value) {
    return value.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " €";
  }

  async function fetchCartData(url) {
    const res = await fetch(url, { credentials: "include" });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const activities = [...doc.querySelectorAll("strong.pull-left")]
      .map(el => el.textContent.trim())
      .filter(text => {
        const lower = text.toLowerCase();
        return text && !lower.includes("prix conseillé") && !lower.includes("prix conseille") && !lower.includes("panier");
      });

    let total = 0;

    [...doc.querySelectorAll("label")].forEach(label => {
      const lower = label.textContent.toLowerCase();
      if (!lower.includes("prix conseillé") && !lower.includes("prix conseille")) return;

      const group = label.closest(".form-group") || label.parentElement;
      const input = group?.querySelector("input");
      if (input) total += parsePrice(input.value);
    });

    return {
      activities,
      total,
      updatedAt: Date.now()
    };
  }

  function removeColumn(table, headerRow, index) {
    headerRow.children[index]?.remove();
    [...table.querySelectorAll("tbody tr")].forEach(row => row.children[index]?.remove());
  }

  function getHeaderIndex(headerRow, predicate) {
    return [...headerRow.children].findIndex(th => predicate(th.textContent.trim(), th));
  }

  function removeNativeColumns(table, headerRow) {
    for (let i = headerRow.children.length - 1; i >= 0; i--) {
      if (headerRow.children[i].dataset.fxColumn) continue;

      const text = headerRow.children[i].textContent.trim();
      const normalized = text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

      if (
        normalized === "activites"
        || normalized === "validite du panier"
        || normalized === "temps restant"
        || normalized === "lien vers le panier (paiement)"
      ) {
        removeColumn(table, headerRow, i);
      }
    }
  }

  function ensureActivitiesColumn(table, headerRow) {
    const existingIndex = getHeaderIndex(headerRow, (_text, th) => th.dataset.fxColumn === "activities");
    if (existingIndex !== -1) return { index: existingIndex, inserted: false };

    const newHeader = document.createElement("th");
    newHeader.textContent = "Activites";
    newHeader.dataset.fxColumn = "activities";
    headerRow.insertBefore(newHeader, headerRow.children[2] || null);

    [...table.querySelectorAll("tbody tr")].forEach(row => {
      if (row.querySelector("td[data-fx-column='activities']")) return;

      const tdActivities = document.createElement("td");
      tdActivities.dataset.fxColumn = "activities";
      tdActivities.style.minWidth = "350px";
      row.insertBefore(tdActivities, row.children[2] || null);
    });

    return {
      index: getHeaderIndex(headerRow, (_text, th) => th.dataset.fxColumn === "activities"),
      inserted: true
    };
  }

  function resetEnhancedRows(table) {
    [...table.querySelectorAll("tbody tr")].forEach(row => {
      row.dataset.fxEnhanced = "0";
      delete row.dataset.fxCartId;
      const cell = row.querySelector("td[data-fx-column='activities']");
      if (cell) cell.innerHTML = "";
    });
  }

  function getActionCellIndex(row) {
    return [...row.children].findIndex(cell => (
      cell.querySelector('a[href*="/edit"], a[href*="/admin/families/"], button, .btn')
    ));
  }

  function trimRowToHeader(row, headerRow) {
    const targetLength = headerRow.children.length;

    while (row.children.length > targetLength) {
      const actionIndex = getActionCellIndex(row);
      const removeIndex = actionIndex > 0 ? actionIndex - 1 : row.children.length - 1;
      row.children[removeIndex]?.remove();
    }
  }

  function ensureRowActivitiesCell(row, activitiesIndex) {
    let tdActivities = row.querySelector("td[data-fx-column='activities']");
    if (tdActivities) return tdActivities;

    tdActivities = row.children[activitiesIndex] || row.children[2];

    if (!tdActivities) {
      tdActivities = document.createElement("td");
      row.insertBefore(tdActivities, row.children[activitiesIndex] || row.children[2] || null);
    }

    tdActivities.dataset.fxColumn = "activities";
    tdActivities.style.minWidth = "350px";
    tdActivities.innerHTML = "";
    return tdActivities;
  }

  function renderActivities(td, activities, cached) {
    td.innerHTML = "";

    if (!activities?.length) {
      td.textContent = "Aucune activite";
      td.style.color = "#999";
      return;
    }

    activities.forEach(activity => {
      const pill = document.createElement("span");
      pill.className = `fx-laclef-pill ${cached ? "fx-laclef-pill-cache" : ""}`.trim();
      pill.textContent = activity;
      td.appendChild(pill);
    });
  }

  function renderPrice(td, total, cached) {
    td.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = formatPrice(total);
    if (cached) strong.style.color = "#2274a5";
    td.appendChild(strong);
  }

  function addRefreshButton() {
    if (document.querySelector("#fx-refresh-cache-btn")) return;

    const exportBtn = [...document.querySelectorAll("button, a")]
      .find(el => el.textContent.trim().includes("Exporter"));

    const btn = makeButton("Actualiser cache", "fx-laclef-btn-secondary");
    btn.id = "fx-refresh-cache-btn";
    btn.style.marginRight = "8px";
    btn.onclick = () => {
      localStorage.removeItem(CACHE_KEY);
      document.querySelectorAll("table").forEach(resetEnhancedRows);
      enhanceTable(true);
    };

    if (exportBtn?.parentElement) {
      exportBtn.parentElement.insertBefore(btn, exportBtn);
    }
  }

  async function enhanceTable(forceRefresh) {
    if (running || !isPendingCheckoutsPage()) return;

    const table = document.querySelector("table");
    const headerRow = table?.querySelector("thead tr");
    const rows = [...(table?.querySelectorAll("tbody tr") || [])];

    if (!table || !headerRow || !rows.length) return;

    running = true;

    try {
      addRefreshButton();

      removeNativeColumns(table, headerRow);

      let priceColumnIndex = -1;

      [...headerRow.children].forEach((th, index) => {
        const text = th.textContent.trim();
        if (text === "Souscriptions" || text === "Prix total panier") {
          th.textContent = "Prix total panier";
          priceColumnIndex = index;
        }
      });

      const activitiesColumn = ensureActivitiesColumn(table, headerRow);
      const activitiesIndex = activitiesColumn.index;

      if (activitiesColumn.inserted && priceColumnIndex >= activitiesIndex) priceColumnIndex++;

      const cache = getCache();

      if (forceRefresh) resetEnhancedRows(table);

      for (const row of [...table.querySelectorAll("tbody tr")]) {
        const editBtn = row.querySelector('a[href*="/edit"]');
        const tdActivities = ensureRowActivitiesCell(row, activitiesIndex);

        trimRowToHeader(row, headerRow);

        if (!editBtn) {
          tdActivities.textContent = "-";
          row.dataset.fxEnhanced = "1";
          continue;
        }

        const cartId = getCartId(editBtn.href);

        if (row.dataset.fxEnhanced === "1" && row.dataset.fxCartId === cartId && !forceRefresh) {
          trimRowToHeader(row, headerRow);
          continue;
        }

        row.dataset.fxEnhanced = "1";
        row.dataset.fxCartId = cartId;

        if (cache[cartId] && !forceRefresh) {
          renderActivities(tdActivities, cache[cartId].activities, true);
          if (priceColumnIndex !== -1 && row.children[priceColumnIndex]) {
            renderPrice(row.children[priceColumnIndex], cache[cartId].total, true);
          }
          continue;
        }

        tdActivities.textContent = "Chargement...";
        tdActivities.style.color = "#999";

        try {
          const data = await fetchCartData(editBtn.href);
          cache[cartId] = data;
          setCache(cache);

          tdActivities.style.color = "";
          renderActivities(tdActivities, data.activities, false);

          if (priceColumnIndex !== -1 && row.children[priceColumnIndex]) {
            renderPrice(row.children[priceColumnIndex], data.total, false);
          }
        } catch (error) {
          console.error("[La CLEF Assistant] Panier non lu", error);
          tdActivities.textContent = "Erreur";
          tdActivities.style.color = "#c62828";
        }

        await wait(100);
      }

      setCache(cache);
    } finally {
      running = false;
    }
  }

  function scheduleEnhance(forceRefresh = false) {
    if (scheduled) return;

    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      enhanceTable(forceRefresh);
    }, 150);
  }

  setInterval(() => enhanceTable(false), 1000);

  new MutationObserver(() => scheduleEnhance(false)).observe(document.body, {
    childList: true,
    subtree: true
  });

  enhanceTable(false);
})();
