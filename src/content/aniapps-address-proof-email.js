(function () {
  "use strict";

  if (window.__fxAniappsAddressProofEmailLoaded) return;
  window.__fxAniappsAddressProofEmailLoaded = true;

  function isAddressProofEditPage() {
    return (
      location.hostname === "laclef.aniapp.fr" &&
      /\/admin\/families\/\d+\/address_proofs\/\d+\/edit/.test(location.pathname)
    );
  }

  function checkSendEmailBox() {
    if (!isAddressProofEditPage()) return;

    const checkbox = document.querySelector(
      "#administrative_record_address_proof_send_email"
    );

    if (!checkbox) return;

    if (!checkbox.checked) {
      checkbox.checked = true;
      checkbox.value = "1";

      checkbox.dispatchEvent(new Event("input", { bubbles: true }));
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  checkSendEmailBox();

  new MutationObserver(checkSendEmailBox).observe(document.body, {
    childList: true,
    subtree: true
  });
})();