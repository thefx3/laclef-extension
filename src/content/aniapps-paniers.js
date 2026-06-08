(function () {
  "use strict";

  if (window.__fxAniappsPaniersLoaded) return;
  window.__fxAniappsPaniersLoaded = true;

  const { wait, makeButton } = window.FXLaclefExtension;
  const CACHE_KEY = "fx_aniapps_pending_checkouts_cache_v1";
  let running = false;

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
      document.querySelectorAll("table").forEach(table => delete table.dataset.fxEnhanced);
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
    if (table.dataset.fxEnhanced === "1" && !forceRefresh) return;

    running = true;
    table.dataset.fxEnhanced = "1";

    addRefreshButton();

    for (let i = headerRow.children.length - 1; i >= 0; i--) {
      const text = headerRow.children[i].textContent.trim();
      if (["Activités", "Activites", "Validité du panier", "Validite du panier", "Temps restant", "Lien vers le panier (Paiement)"].includes(text)) {
        removeColumn(table, headerRow, i);
      }
    }

    let priceColumnIndex = -1;

    [...headerRow.children].forEach((th, index) => {
      const text = th.textContent.trim();
      if (text === "Souscriptions" || text === "Prix total panier") {
        th.textContent = "Prix total panier";
        priceColumnIndex = index;
      }
    });

    const newHeader = document.createElement("th");
    newHeader.textContent = "Activites";
    headerRow.insertBefore(newHeader, headerRow.children[2]);

    if (priceColumnIndex >= 2) priceColumnIndex++;

    const cache = getCache();
    const currentIds = new Set();

    for (const row of [...table.querySelectorAll("tbody tr")]) {
      const editBtn = row.querySelector('a[href*="/edit"]');
      const tdActivities = document.createElement("td");
      tdActivities.style.minWidth = "350px";
      row.insertBefore(tdActivities, row.children[2]);

      if (!editBtn) {
        tdActivities.textContent = "-";
        continue;
      }

      const cartId = getCartId(editBtn.href);
      currentIds.add(cartId);

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

    Object.keys(cache).forEach(id => {
      if (!currentIds.has(id)) delete cache[id];
    });

    setCache(cache);
    running = false;
  }

  setInterval(() => enhanceTable(false), 1000);

  new MutationObserver(() => enhanceTable(false)).observe(document.body, {
    childList: true,
    subtree: true
  });

  enhanceTable(false);
})();
