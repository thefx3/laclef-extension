(function () {
  "use strict";

  if (window.__fxAniappsSepaLoaded) return;
  window.__fxAniappsSepaLoaded = true;

  const {
    wait,
    findVisible,
    setFieldValue,
    makeButton,
    notify,
    normalizeText,
    onPageChange
  } = window.FXLaclefExtension;

  const KEY = "aniapps_sepa_step5";
  const BUTTON_ID = "aniapps-sepa-step5";
  const MODAL_ID = "aniapps-sepa-modal";
  const CONTROL_ID = "aniapps-sepa-controls";

  let automationRunning = false;
  let ensureButtonScheduled = false;

  function isPaymentPage() {
    return /\/admin\/families\/\d+\/payments/.test(location.pathname);
  }

  function isPaymentFormPage() {
    return /\/payments\/new/.test(location.pathname) || /\/payments\/\d+\/edit/.test(location.pathname);
  }

  function getFamilyId() {
    return location.pathname.match(/families\/(\d+)/)?.[1] || "";
  }

  function getSeasonCodeFallback() {
    const text = document.body.innerText;
    const match = text.match(/Saison\s*:\s*20(\d{2})-20(\d{2})/i);
    return match ? `${match[1]}${match[2]}` : "2627";
  }

  function amount(total, count, index) {
    const totalEuros = Math.round(
      parseFloat(String(total).replace(",", ".").replace(/[^\d.]/g, ""))
    );

    const base = Math.floor(totalEuros / count);
    const value = index === count ? totalEuros - base * (count - 1) : base;

    return `${value},00`;
  }

  function nextDate(dateStr, wantedDay) {
    const d = new Date(dateStr + "T12:00:00");
    d.setMonth(d.getMonth() + 1);

    while (d.getMonth() === 7) d.setMonth(d.getMonth() + 1);

    if (wantedDay === 1 && d.getMonth() === 0) d.setDate(15);
    else d.setDate(wantedDay);

    return d.toISOString().slice(0, 10);
  }

  function readPlan() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      return null;
    }
  }

  function savePlan(plan) {
    localStorage.setItem(KEY, JSON.stringify(plan));
  }

  function updatePlan(patch) {
    const plan = readPlan();
    if (!plan) return null;

    const nextPlan = {
      ...plan,
      ...patch,
      updatedAt: Date.now()
    };

    savePlan(nextPlan);
    ensureAutomationControls();
    return nextPlan;
  }

  function clearPlan() {
    localStorage.removeItem(KEY);
    document.querySelector(`#${CONTROL_ID}`)?.remove();
  }

  function stopSepaAutomation(message) {
    clearPlan();
    if (message) notify(message, "SEPA");
  }

  window.FXStopSepaAutomation = () => stopSepaAutomation("Generation SEPA arretee.");

  function findCreateOrUpdatePaymentButton() {
    return [...document.querySelectorAll("input[type='submit'], button")]
      .find(el => {
        const text = normalizeText(el.value || el.innerText || "");
        return text.includes("creer un paiement") || text.includes("mettre a jour le paiement");
      });
  }

  function findAddPaymentButton() {
    return [...document.querySelectorAll("a, button")]
      .find(el => normalizeText(el.innerText || el.value || "").includes("ajouter un paiement"));
  }

  function findPaymentMethodField() {
    const direct = document.querySelector("#payment_payment_method_id")
      || document.querySelector("select[name='payment[payment_method_id]']")
      || document.querySelector("select[id*='payment_method']")
      || document.querySelector("select[name*='payment_method']")
      || findVisible("#payment_payment_method_id")
      || findVisible("select[name='payment[payment_method_id]']")
      || findVisible("select[id*='payment_method']")
      || findVisible("select[name*='payment_method']");

    if (direct) return direct;

    const labels = [...document.querySelectorAll("label")]
      .filter(label => normalizeText(label.innerText || "").includes("methode de paiement"));

    for (const label of labels) {
      const target = label.getAttribute("for");
      if (target) {
        const field = document.querySelector(`#${CSS.escape(target)}`)
          || findVisible(`#${CSS.escape(target)}`);
        if (field) return field;
      }

      const group = label.closest(".form-group, .row, div");
      const field = group?.querySelector("select, input");
      if (field && field.offsetParent !== null) return field;
    }

    return null;
  }

  function getPaymentMethodText() {
    const field = findPaymentMethodField();
    if (!field) return "";

    if (field.tagName === "SELECT") {
      return field.selectedOptions?.[0]?.textContent?.trim() || "";
    }

    return field.value?.trim() || field.textContent?.trim() || "";
  }

  function isSepaMethodText(text) {
    const normalized = normalizeText(text || "");
    return normalized.includes("sepa") || normalized.includes("mandat");
  }

  function canSafelyFillSepaForm(plan) {
    const methodText = getPaymentMethodText();

    if (!methodText) {
      stopSepaAutomation("Securite SEPA : methode de paiement introuvable. Aucun champ n'a ete modifie.");
      return false;
    }

    if (!isSepaMethodText(methodText)) {
      stopSepaAutomation(`Securite SEPA : formulaire "${methodText}" detecte. Aucun champ n'a ete modifie.`);
      return false;
    }

    if (!plan || plan.familyId !== getFamilyId()) {
      clearPlan();
      return false;
    }

    return true;
  }

  function clickCreateOrUpdatePayment() {
    const btn = findCreateOrUpdatePaymentButton();

    if (!btn) {
      notify("Bouton Creer / Mettre a jour introuvable.", "SEPA");
      return;
    }

    btn.click();
  }

  async function clickFinalSave() {
    await wait(800);

    const plan = readPlan();
    if (!plan || plan.paused) return false;
    if (!canSafelyFillSepaForm(plan)) return false;

    const btn = [...document.querySelectorAll("a, button")]
      .find(el => normalizeText(el.innerText || el.value || "").includes("enregistrer le paiement"));

    if (!btn) return false;

    btn.click();
    return true;
  }

  function removeSepaUi() {
    document.querySelector(`#${BUTTON_ID}`)?.remove();
    document.querySelector(`#${MODAL_ID}`)?.remove();
    document.querySelector(`#${CONTROL_ID}`)?.remove();
  }

  function getDefaultTotal() {
    return findVisible("#payment_amount")?.value || "";
  }

  function buildModal() {
    document.querySelector(`#${MODAL_ID}`)?.remove();

    const backdrop = document.createElement("div");
    backdrop.id = MODAL_ID;
    backdrop.className = "fx-laclef-modal-backdrop";

    backdrop.innerHTML = `
      <form class="fx-laclef-modal" id="aniapps-sepa-form">
        <div class="fx-laclef-modal-header">
          <div>
            <h2 class="fx-laclef-modal-title">Generer un mandat SEPA</h2>
            <div class="fx-laclef-modal-subtitle">Assistant La CLEF integre a ANIAPPS</div>
          </div>
          <span class="fx-laclef-modal-badge">Extension</span>
        </div>
        <div class="fx-laclef-modal-body">
          <div class="fx-laclef-form-grid">
            <div class="fx-laclef-field">
              <label for="fx-sepa-total">Montant total</label>
              <input id="fx-sepa-total" name="total" inputmode="decimal" required>
            </div>
            <div class="fx-laclef-field">
              <label for="fx-sepa-count">Nombre de mensualites</label>
              <input id="fx-sepa-count" name="count" type="number" min="1" step="1" value="6" required>
            </div>
            <div class="fx-laclef-field">
              <label for="fx-sepa-first-date">Premiere mensualite</label>
              <input id="fx-sepa-first-date" name="firstDate" type="date" value="2026-09-15" required>
            </div>
            <div class="fx-laclef-field">
              <label for="fx-sepa-wanted-day">Jour d'encaissement</label>
              <select id="fx-sepa-wanted-day" name="wantedDay">
                <option value="15">Le 15</option>
                <option value="1">Le 1er</option>
              </select>
            </div>
            <div class="fx-laclef-field fx-laclef-field-full">
              <label for="fx-sepa-season">Code saison pour la reference</label>
              <input id="fx-sepa-season" name="season" maxlength="4" pattern="[0-9]{4}" required>
            </div>
          </div>
          <div class="fx-laclef-note">
            Exemple de reference generee : saison.famille.numero, comme 2627.${getFamilyId() || "450"}.1.
          </div>
          <div class="fx-laclef-modal-actions">
            <button type="button" class="fx-laclef-btn fx-laclef-btn-secondary" id="fx-sepa-cancel">Annuler</button>
            <button type="submit" class="fx-laclef-btn">Generer</button>
          </div>
        </div>
      </form>
    `;

    document.body.appendChild(backdrop);

    const form = backdrop.querySelector("#aniapps-sepa-form");
    form.elements.total.value = getDefaultTotal();
    form.elements.season.value = getSeasonCodeFallback();

    backdrop.querySelector("#fx-sepa-cancel").onclick = () => backdrop.remove();

    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) backdrop.remove();
    });

    form.addEventListener("submit", event => {
      event.preventDefault();

      const count = Number(form.elements.count.value);
      const wantedDay = Number(form.elements.wantedDay.value);
      const total = form.elements.total.value.trim();
      const firstDate = form.elements.firstDate.value;
      const season = form.elements.season.value.trim();

      if (!total || !count || !firstDate || ![1, 15].includes(wantedDay) || !/^\d{4}$/.test(season)) {
        notify("Merci de verifier les champs SEPA.", "SEPA");
        return;
      }

      const plan = {
        total,
        count,
        wantedDay,
        current: 1,
        currentDate: firstDate,
        season,
        familyId: getFamilyId(),
        step: "fill",
        status: "Preparation du premier paiement SEPA",
        paused: false
      };

      clearPlan();
      savePlan(plan);
      backdrop.remove();

      if (isPaymentFormPage()) {
        fillCurrent();
        return;
      }

      const addPayment = findAddPaymentButton();
      if (addPayment) {
        addPayment.click();
        return;
      }

      notify("Paiement configure. Ouvre la creation d'un paiement pour lancer le remplissage.", "SEPA");
    });

    setTimeout(() => form.elements.total.focus(), 50);
  }

  function makeSepaButton() {
    const btn = makeButton("Generer SEPA", "fx-laclef-btn-inline fx-laclef-btn-outline");
    btn.id = BUTTON_ID;
    btn.onclick = buildModal;
    return btn;
  }

  function insertNearCreatePayment() {
    const submit = findCreateOrUpdatePaymentButton();
    if (!submit?.parentElement) return false;

    const btn = makeSepaButton();
    btn.style.marginLeft = "8px";
    submit.insertAdjacentElement("afterend", btn);
    return true;
  }

  function insertNearAddPayment() {
    const addPayment = findAddPaymentButton();
    if (!addPayment?.parentElement) return false;

    const btn = makeSepaButton();
    btn.style.marginLeft = "8px";
    addPayment.insertAdjacentElement("afterend", btn);
    return true;
  }

  function ensureButton() {
    if (!isPaymentPage()) {
      removeSepaUi();
      return;
    }

    ensureAutomationControls();

    const current = document.querySelector(`#${BUTTON_ID}`);
    if (current && document.body.contains(current)) return;

    if (isPaymentFormPage() && insertNearCreatePayment()) return;
    insertNearAddPayment();
  }

  function ensureAutomationControls() {
    const plan = readPlan();

    if (!plan || plan.familyId !== getFamilyId()) {
      document.querySelector(`#${CONTROL_ID}`)?.remove();
      return;
    }

    let controls = document.querySelector(`#${CONTROL_ID}`);

    if (!controls) {
      controls = document.createElement("div");
      controls.id = CONTROL_ID;
      controls.style.cssText = `
        position: fixed;
        right: 18px;
        bottom: 86px;
        z-index: 2147483000;
        background: #fff;
        border-left: 4px solid #8e24aa;
        border-radius: 6px;
        box-shadow: 0 8px 26px rgba(0,0,0,.22);
        color: #2f4050;
        font: 12px Arial, sans-serif;
        min-width: 250px;
        padding: 10px;
      `;
      controls.innerHTML = `
        <div style="font-weight:700;margin-bottom:6px;">Generation SEPA</div>
        <div data-fx-sepa-status style="color:#677085;margin-bottom:8px;"></div>
        <div style="display:flex;gap:6px;">
          <button type="button" data-fx-sepa-pause class="btn btn-xs btn-warning" style="flex:1;"></button>
          <button type="button" data-fx-sepa-stop class="btn btn-xs btn-danger" style="flex:1;">Stop</button>
        </div>
      `;
      document.body.appendChild(controls);

      controls.querySelector("[data-fx-sepa-pause]").addEventListener("click", () => {
        const currentPlan = readPlan();
        if (!currentPlan) return;
        currentPlan.paused = !currentPlan.paused;
        savePlan(currentPlan);
        ensureAutomationControls();
      });

      controls.querySelector("[data-fx-sepa-stop]").addEventListener("click", () => {
        stopSepaAutomation("Generation SEPA arretee.");
      });
    }

    const status = controls.querySelector("[data-fx-sepa-status]");
    const pause = controls.querySelector("[data-fx-sepa-pause]");
    const currentRef = `${plan.season}.${plan.familyId}.${plan.current}`;
    const label = plan.status || "Automatisation en cours";

    const nextStatus = `${plan.paused ? "En pause" : "En cours"} - ${plan.current}/${plan.count} - ref ${currentRef} - ${label}`;
    const nextPauseText = plan.paused ? "Reprendre" : "Pause";

    if (status.textContent !== nextStatus) status.textContent = nextStatus;
    if (pause.textContent !== nextPauseText) pause.textContent = nextPauseText;
  }

  function fillCurrent() {
    const plan = readPlan();
    if (!plan || plan.paused) return;

    if (!canSafelyFillSepaForm(plan)) return;

    const ref = `${plan.season}.${plan.familyId}.${plan.current}`;
    updatePlan({
      status: `Verification et remplissage du paiement SEPA ${plan.current}/${plan.count}`
    });

    const amountField = findVisible("#payment_amount");
    const referenceField = findVisible("#payment_reference");
    const dateField = findVisible("#payment_expected_cashing_date");

    if (!amountField || !referenceField || !dateField) {
      stopSepaAutomation(`Remplissage SEPA interrompu : champ introuvable pour la reference ${ref}.`);
      return;
    }

    setFieldValue(amountField, amount(plan.total, plan.count, plan.current));
    setFieldValue(referenceField, ref);
    setFieldValue(dateField, plan.currentDate);

    updatePlan({
      step: "save_final",
      status: `Paiement SEPA ${plan.current}/${plan.count} rempli. Enregistrement en cours`
    });

    setTimeout(() => {
      const latestPlan = readPlan();
      if (!latestPlan || latestPlan.paused || latestPlan.step !== "save_final") return;
      if (latestPlan.familyId !== getFamilyId()) return;
      if (!canSafelyFillSepaForm(latestPlan)) return;

      clickCreateOrUpdatePayment();
    }, 500);
  }

  function expectedReference(plan) {
    return `${plan.season}.${plan.familyId}.${plan.current}`;
  }

  function findPaymentRowByReference(reference) {
    const normalizedRef = normalizeText(reference);
    const rows = [...document.querySelectorAll("tbody tr")]
      .filter(row => !row.classList.contains("child") && row.offsetParent !== null);

    return rows.find(row => {
      const text = normalizeText(row.innerText || "");
      return text.includes(normalizedRef) && text.includes("sepa");
    }) || rows.find(row => normalizeText(row.innerText || "").includes(normalizedRef));
  }

  function findResponsiveControl(row) {
    return row?.querySelector("td.dtr-control, td.sorting_1.dtr-control, td:first-child");
  }

  function findDuplicateButtonNearRow(row) {
    const scopes = [row];
    let next = row?.nextElementSibling;

    while (next && next.tagName === "TR") {
      const text = normalizeText(next.innerText || "");
      const isActionRow = next.classList.contains("child") || text.includes("actions");
      if (!isActionRow) break;

      scopes.push(next);
      next = next.nextElementSibling;
    }

    for (const scope of scopes) {
      const button = [...scope.querySelectorAll("a, button")]
        .find(el => {
          const text = normalizeText(el.innerText || el.value || "");
          const href = normalizeText(el.getAttribute("href") || "");
          return text.includes("dupliquer") || href.includes("/clone");
        });

      if (button) return button;
    }

    return null;
  }

  function findDuplicateConfirmButton() {
    const dialogSelectors = [
      ".modal.in",
      ".modal.show",
      ".modal",
      ".bootbox",
      ".sweet-alert",
      ".swal2-container",
      "#modal-receiver",
      "[role='dialog']"
    ];

    for (const selector of dialogSelectors) {
      const dialogs = [...document.querySelectorAll(selector)]
        .filter(el => {
          const style = getComputedStyle(el);
          return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
        });

      for (const dialog of dialogs) {
        const button = [...dialog.querySelectorAll("button, input[type='submit'], a")]
          .find(el => {
            const text = normalizeText(el.innerText || el.value || "");
            const style = getComputedStyle(el);
            return text.includes("dupliquer")
              && style.display !== "none"
              && style.visibility !== "hidden"
              && !el.closest("table");
          });

        if (button) return button;
      }
    }

    return [...document.querySelectorAll("button, input[type='submit'], a")]
      .find(el => {
        const text = normalizeText(el.innerText || el.value || "");
        const style = getComputedStyle(el);
        return text.includes("dupliquer")
          && style.display !== "none"
          && style.visibility !== "hidden"
          && !el.closest("table")
          && !el.closest(`#${CONTROL_ID}`)
          && !el.closest(`#${MODAL_ID}`)
          && !el.closest("#fx-laclef-dialog");
      }) || null;
  }

  async function duplicateNext() {
    const plan = readPlan();
    if (!plan || plan.step !== "duplicate") return;

    if (plan.familyId !== getFamilyId()) {
      clearPlan();
      return;
    }

    if (plan.paused) {
      ensureAutomationControls();
      return;
    }

    updatePlan({
      status: `Retour liste. Recherche du paiement SEPA ${plan.current}/${plan.count} a dupliquer`
    });

    await wait(1500);

    const latestPlan = readPlan();
    if (!latestPlan || latestPlan.paused || latestPlan.step !== "duplicate") return;
    if (latestPlan.familyId !== getFamilyId()) {
      clearPlan();
      return;
    }

    if (latestPlan.current >= latestPlan.count) {
      clearPlan();
      notify("SEPA termine.", "SEPA");
      return;
    }

    const reference = expectedReference(latestPlan);
    updatePlan({
      status: `Recherche de la ligne SEPA ${reference}`
    });

    const row = findPaymentRowByReference(reference);

    if (!row) {
      console.warn("[La CLEF Assistant] Paiement SEPA introuvable pour la reference", reference);
      stopSepaAutomation(`Paiement SEPA introuvable pour la reference ${reference}.`);
      return;
    }

    const duplicateAlreadyVisible = findDuplicateButtonNearRow(row);
    if (!duplicateAlreadyVisible) {
      updatePlan({
        status: `Ouverture des actions de la ligne SEPA ${reference}`
      });

      const arrow = findResponsiveControl(row);

      if (!arrow) {
        console.warn("[La CLEF Assistant] Fleche du paiement SEPA introuvable.", reference);
        stopSepaAutomation(`Impossible d'ouvrir la ligne SEPA ${reference}.`);
        return;
      }

      arrow.click();
    }

    await wait(700);

    const beforeDuplicatePlan = readPlan();
    if (!beforeDuplicatePlan || beforeDuplicatePlan.paused || beforeDuplicatePlan.step !== "duplicate") return;

    const duplicate = findDuplicateButtonNearRow(row);

    if (!duplicate) {
      console.warn("[La CLEF Assistant] Bouton Dupliquer introuvable pour", reference);
      stopSepaAutomation(`Bouton Dupliquer introuvable pour la reference ${reference}.`);
      return;
    }

    beforeDuplicatePlan.status = `Duplication de la ligne SEPA ${reference}`;
    savePlan(beforeDuplicatePlan);
    ensureAutomationControls();

    duplicate.click();

    await wait(700);

    const beforeConfirmPlan = readPlan();
    if (!beforeConfirmPlan || beforeConfirmPlan.paused || beforeConfirmPlan.step !== "duplicate") return;

    const confirm = findDuplicateConfirmButton();

    if (!confirm) {
      stopSepaAutomation(`Confirmation de duplication introuvable pour la reference ${reference}.`);
      return;
    }

    beforeConfirmPlan.current += 1;
    beforeConfirmPlan.currentDate = nextDate(beforeConfirmPlan.currentDate, beforeConfirmPlan.wantedDay);
    beforeConfirmPlan.step = "fill";
    beforeConfirmPlan.status = `Duplication confirmee. Attente du formulaire SEPA ${beforeConfirmPlan.current}/${beforeConfirmPlan.count}`;
    savePlan(beforeConfirmPlan);
    ensureAutomationControls();

    confirm.click();
  }

  async function runAutomationForRoute() {
    if (!isPaymentPage() || automationRunning) return;

    automationRunning = true;

    try {
      ensureButton();

      const plan = readPlan();
      if (plan && plan.familyId !== getFamilyId()) {
        clearPlan();
        return;
      }

      if (plan?.paused) {
        ensureAutomationControls();
        return;
      }

      if (isPaymentFormPage()) {
        await wait(800);

        const latestPlan = readPlan();
        if (!latestPlan || latestPlan.paused) {
          ensureAutomationControls();
          return;
        }

        if (latestPlan.familyId !== getFamilyId()) {
          clearPlan();
          return;
        }

        if (latestPlan.step === "fill") {
          fillCurrent();
          return;
        }

        if (latestPlan.step === "save_final") {
          updatePlan({
            status: `Validation finale du paiement SEPA ${latestPlan.current}/${latestPlan.count}`
          });

          const saved = await clickFinalSave();
          const afterSavePlan = readPlan();
          if (!saved || !afterSavePlan || afterSavePlan.paused) return;

          updatePlan({
            step: "duplicate",
            status: `Paiement SEPA ${afterSavePlan.current}/${afterSavePlan.count} enregistre. Retour a la liste`
          });

          await wait(800);
          const beforeRedirectPlan = readPlan();
          if (!beforeRedirectPlan || beforeRedirectPlan.paused || beforeRedirectPlan.step !== "duplicate") return;

          location.href = location.pathname
            .replace(/\/payments\/\d+\/edit.*/, "/payments")
            .replace(/\/payments\/new.*/, "/payments");
          return;
        }

        if (latestPlan.step === "duplicate") {
          updatePlan({
            status: `Retour a la liste des paiements avant duplication`
          });

          await wait(800);
          const beforeRedirectPlan = readPlan();
          if (!beforeRedirectPlan || beforeRedirectPlan.paused || beforeRedirectPlan.step !== "duplicate") return;

          location.href = location.pathname
            .replace(/\/payments\/\d+\/edit.*/, "/payments")
            .replace(/\/payments\/new.*/, "/payments");
          return;
        }
      }

      if (/\/payments$/.test(location.pathname)) {
        await duplicateNext();
      }
    } finally {
      automationRunning = false;
    }
  }

  onPageChange(() => {
    setTimeout(ensureButton, 150);
    setTimeout(runAutomationForRoute, 500);
  });

  function scheduleEnsureButton() {
    if (ensureButtonScheduled) return;

    ensureButtonScheduled = true;
    setTimeout(() => {
      ensureButtonScheduled = false;
      ensureButton();
    }, 150);
  }

  new MutationObserver(scheduleEnsureButton).observe(document.body, {
    childList: true,
    subtree: true
  });

  setInterval(ensureButton, 1000);
})();
