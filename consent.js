/**
 * @file web/consent.js
 * @summary First-visit consent gate for the Terms of Use (terms.html) and Privacy Policy (privacy.html).
 * Acceptance is stored in localStorage as {version, acceptedAt}. It only counts while its version equals
 * CONSENT_VERSION, so bumping CONSENT_VERSION (whenever either document changes) re-prompts every user.
 * app.js keeps Record disabled until consent is given and copies {version, acceptedAt} into the payload.
 */

/** Version of the Terms + Privacy Policy pair. Must match the "Version" line in privacy.html and terms.html. */
export const CONSENT_VERSION = "2026-10-23";

/** localStorage key holding the JSON {version, acceptedAt}. */
export const CONSENT_STORAGE_KEY = "camihear.consent";

/** @typedef {{version: string, acceptedAt: string}} Consent */

/**
 * Returns the stored consent if it is for the current CONSENT_VERSION, else null. Never throws.
 * @returns {Consent|null}
 */
export function loadConsent() {
  try {
    const c = JSON.parse(globalThis.localStorage?.getItem(CONSENT_STORAGE_KEY) || "null");
    if (c && c.version === CONSENT_VERSION && typeof c.acceptedAt === "string") return { version: c.version, acceptedAt: c.acceptedAt };
  } catch { /* storage blocked or bad JSON: treat as not accepted */ }
  return null;
}

/**
 * Records acceptance of the current version now. If storage is blocked (some private modes) the acceptance
 * still holds for this page load but will be asked again next visit.
 * @returns {Consent}
 */
export function saveConsent() {
  const c = { version: CONSENT_VERSION, acceptedAt: new Date().toISOString() };
  try { globalThis.localStorage?.setItem(CONSENT_STORAGE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
  return c;
}

/**
 * Wires the consent modal (#consentModal) and resolves once the user has accepted. If valid consent is already
 * stored the modal stays hidden and the promise resolves immediately. The modal has no close button: the only way
 * past it is ticking the checkbox and pressing Continue.
 * @param {Document} doc
 * @returns {Promise<Consent>}
 */
export function requireConsent(doc = document) {
  const existing = loadConsent();
  const modal = doc.getElementById("consentModal");
  if (existing) { modal.hidden = true; return Promise.resolve(existing); }
  const box = doc.getElementById("consentAgree");
  const btn = doc.getElementById("consentContinue");
  modal.hidden = false;
  doc.body.classList.add("modal-open");
  box.checked = false;
  btn.disabled = true;
  box.addEventListener("change", () => { btn.disabled = !box.checked; });
  // Keep keyboard focus inside the dialog (Tab cycles through its links, checkbox and button).
  modal.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = [...modal.querySelectorAll("a, input, button:not([disabled])")];
    const i = f.indexOf(doc.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  });
  setTimeout(() => box.focus(), 0);
  return new Promise((resolve) => {
    btn.addEventListener("click", () => {
      if (!box.checked) return;
      const c = saveConsent();
      modal.hidden = true;
      doc.body.classList.remove("modal-open");
      resolve(c);
    });
  });
}
