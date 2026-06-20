(function () {
  "use strict";

  if (window.__fxBilletterieAutofillLoaded) return;
  window.__fxBilletterieAutofillLoaded = true;

  const {
    wait,
    storage,
    setFieldValue,
    makeButton,
    notify,
    normalizeText,
    onPageChange
  } = window.FXLaclefExtension;

  const STORAGE_KEY = "billetterie_client";
  const FILL_BUTTON_ID = "fill-from-aniapps";

  function isAniappsContactsPage() {
    return location.hostname === "laclef.aniapp.fr" &&
      /\/admin\/(families|familles)\/\d+\/contacts/.test(location.pathname);
  }

  function isBilletteriePage() {
    return location.hostname === "billetterie.laclef.asso.fr";
  }

  function setInput(selector, value) {
    const input = document.querySelector(selector);
    return setFieldValue(input, value);
  }

  function getHeaderIndex(table, matcher) {
    const headers = [...(table?.querySelectorAll("thead th") || [])];
    return headers.findIndex(th => matcher(normalizeText(th.textContent)));
  }

  function getContactColumns(table) {
    return {
      adherent: getHeaderIndex(table, text => text.includes("adherent")),
      nom: getHeaderIndex(table, text => text === "nom"),
      prenom: getHeaderIndex(table, text => text === "prenom")
    };
  }

  function getCellText(cells, index, fallbackIndex) {
    return cells[index >= 0 ? index : fallbackIndex]?.innerText.trim() || "";
  }

  function getFamilyInfo() {
    const entries = [...document.querySelectorAll(".datalist-entry")];

    const getValue = label => {
      const wanted = normalizeText(label);
      const entry = entries.find(item =>
        normalizeText(item.querySelector("dt")?.textContent) === wanted
      );

      return entry?.querySelector("dd")?.innerText.trim().replace(/\s+/g, " ") || "";
    };

    const email = getValue("Email");
    const telFixe = getValue("Telephone fixe");
    const telMobile = getValue("Telephone mobile");
    const adresse = getValue("Adresse");
    const codePostal = (adresse.match(/\b\d{5}\b/) || [""])[0];

    return {
      email,
      telephone: telMobile || telFixe,
      adresse,
      codePostal
    };
  }

  function addAniappsButtons() {
    if (!isAniappsContactsPage()) return;

    const table = document.querySelector("table");
    const columns = getContactColumns(table);
    const rows = [...(table?.querySelectorAll("tbody tr") || [])];

    rows.forEach(row => {
      if (row.querySelector(".copy-billetterie-btn")) return;

      const cells = row.querySelectorAll("td");
      if (cells.length < 5) return;

      const nom = getCellText(cells, columns.nom, 2);
      const prenom = getCellText(cells, columns.prenom, 3);

      if (!nom || !prenom) return;

      const targetCell = cells[columns.adherent >= 0 ? columns.adherent : 5] || cells[cells.length - 1];
      if (!targetCell) return;

      const btn = makeButton("Copier vers billetterie", "fx-laclef-btn-inline fx-laclef-btn-outline");
      btn.classList.add("copy-billetterie-btn");

      targetCell.appendChild(btn);
    });
  }

  async function copyClientFromButton(btn) {
    const row = btn.closest("tr");
    const table = row?.closest("table");
    const cells = row?.querySelectorAll("td") || [];
    const columns = getContactColumns(table);
    const nom = getCellText(cells, columns.nom, 2);
    const prenom = getCellText(cells, columns.prenom, 3);

    if (!nom || !prenom) {
      notify("Impossible de lire le nom et le prenom sur cette ligne.", "Billetterie");
      return;
    }

    const family = getFamilyInfo();
    const data = {
      nom,
      prenom,
      email: family.email,
      telephone: family.telephone,
      codePostal: family.codePostal,
      adresse: family.adresse,
      copiedAt: new Date().toLocaleString("fr-FR")
    };

    await storage.set(STORAGE_KEY, data);

    btn.textContent = "Copie !";
    setTimeout(() => {
      btn.textContent = "Copier vers billetterie";
    }, 1500);

    console.log("[La CLEF Assistant] Client copie vers la billetterie", data);
  }

  function installCopyHandler() {
    document.addEventListener("mousedown", event => {
      if (!event.target.closest?.(".copy-billetterie-btn")) return;
      event.stopPropagation();
    }, true);

    document.addEventListener("click", event => {
      const btn = event.target.closest?.(".copy-billetterie-btn");
      if (!btn) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      copyClientFromButton(btn).catch(error => {
        console.error("[La CLEF Assistant] Copie billetterie impossible", error);
        notify("Copie impossible : " + error.message, "Billetterie");
      });
    }, true);
  }

  function addBilletterieButton() {
    if (!isBilletteriePage()) return;

    const existing = document.querySelector(`#${FILL_BUTTON_ID}`);
    if (existing) {
      existing.classList.add("fx-laclef-fixed");
      existing.classList.remove("fx-laclef-btn-inline", "fx-laclef-btn-outline");
      return;
    }

    const btn = makeButton("Remplir depuis ANIAPPS");
    btn.id = FILL_BUTTON_ID;
    btn.classList.add("fx-laclef-fixed");

    btn.addEventListener("click", async () => {
      try {
        const data = await storage.get(STORAGE_KEY);

        if (!data) {
          notify("Aucune donnee ANIAPPS copiee.", "Billetterie");
          return;
        }

        setInput("#edit-nom", data.nom);
        setInput("#edit-prenom", data.prenom);
        setInput("#edit-structure", data.structure);
        setInput("#edit-email", data.email);
        setInput("#edit-telephone", data.telephone);
        setInput("#edit-code-postal", data.codePostal);

        btn.textContent = "Rempli";
        setTimeout(() => {
          btn.textContent = "Remplir depuis ANIAPPS";
        }, 1500);

        console.log("[La CLEF Assistant] Billetterie remplie", data);
      } catch (error) {
        console.error("[La CLEF Assistant] Remplissage billetterie impossible", error);
        notify("Remplissage impossible : " + error.message, "Billetterie");
      }
    });

    document.body.appendChild(btn);
  }

  function runForCurrentPage() {
    if (isAniappsContactsPage()) addAniappsButtons();
    if (isBilletteriePage()) addBilletterieButton();
  }

  async function init() {
    installCopyHandler();

    await wait(500);
    runForCurrentPage();

    onPageChange(() => {
      setTimeout(runForCurrentPage, 150);
      setTimeout(runForCurrentPage, 700);
    });

    new MutationObserver(runForCurrentPage).observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  init();
})();
