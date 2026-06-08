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

  let automationRunning = false;

  function isPaymentPage() {
    return /\/admin\/families\/\d+\/payments/.test(location.pathname);
  }

  function isPaymentFormPage() {
    return /\/payments\/new/.test(location.pathname) || /\/payments\/\d+\/edit/.test(location.pathname);
  }

  function setVisibleValue(selector, value) {
    const el = findVisible(selector);
    if (!el) {
      notify("Champ visible introuvable : " + selector, "SEPA");
      return false;
    }

    return setFieldValue(el, value);
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

  function clearPlan() {
    localStorage.removeItem(KEY);
  }

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

    const btn = [...document.querySelectorAll("a, button")]
      .find(el => normalizeText(el.innerText || el.value || "").includes("enregistrer le paiement"));

    if (!btn) return false;

    btn.click();
    return true;
  }

  function removeSepaUi() {
    document.querySelector(`#${BUTTON_ID}`)?.remove();
    document.querySelector(`#${MODAL_ID}`)?.remove();
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
        step: "fill"
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

    const current = document.querySelector(`#${BUTTON_ID}`);
    if (current && document.body.contains(current)) return;

    if (isPaymentFormPage() && insertNearCreatePayment()) return;
    insertNearAddPayment();
  }

  function fillCurrent() {
    const plan = readPlan();
    if (!plan) return;

    if (plan.familyId !== getFamilyId()) {
      clearPlan();
      return;
    }

    const ref = `${plan.season}.${plan.familyId}.${plan.current}`;

    setVisibleValue("#payment_amount", amount(plan.total, plan.count, plan.current));
    setVisibleValue("#payment_reference", ref);
    setVisibleValue("#payment_expected_cashing_date", plan.currentDate);

    plan.step = "save_final";
    savePlan(plan);

    setTimeout(clickCreateOrUpdatePayment, 500);
  }

  async function duplicateNext() {
    const plan = readPlan();
    if (!plan || plan.step !== "duplicate") return;

    if (plan.familyId !== getFamilyId()) {
      clearPlan();
      return;
    }

    await wait(1500);

    if (plan.current >= plan.count) {
      clearPlan();
      notify("SEPA termine.", "SEPA");
      return;
    }

    const arrow = document.querySelector("tbody tr:first-child td.dtr-control");
    if (!arrow) {
      console.warn("[La CLEF Assistant] Fleche du premier paiement introuvable.");
      clearPlan();
      return;
    }

    arrow.click();
    await wait(700);

    const duplicate = [...document.querySelectorAll("a")]
      .find(a => normalizeText(a.innerText || "").includes("dupliquer") || (a.href || "").includes("/clone"));

    if (!duplicate) {
      console.warn("[La CLEF Assistant] Bouton Dupliquer introuvable.");
      clearPlan();
      return;
    }

    plan.current += 1;
    plan.currentDate = nextDate(plan.currentDate, plan.wantedDay);
    plan.step = "fill";
    savePlan(plan);

    duplicate.click();

    await wait(700);

    const confirm = [...document.querySelectorAll("button")]
      .find(btn => normalizeText(btn.innerText || "").includes("dupliquer"));

    if (confirm) confirm.click();
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

      if (isPaymentFormPage()) {
        await wait(800);

        if (plan?.step === "fill") {
          fillCurrent();
          return;
        }

        if (plan?.step === "save_final") {
          await clickFinalSave();
          plan.step = "duplicate";
          savePlan(plan);

          await wait(800);
          location.href = location.pathname
            .replace(/\/payments\/\d+\/edit.*/, "/payments")
            .replace(/\/payments\/new.*/, "/payments");
          return;
        }

        if (plan?.step === "duplicate") {
          await wait(800);
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

  new MutationObserver(() => ensureButton()).observe(document.body, {
    childList: true,
    subtree: true
  });

  setInterval(ensureButton, 1000);
})();
