/**
 * @file web/units.js
 * @summary Display-unit setting (metric m/cm vs imperial ft/in) for every user-facing length on the page.
 * Lengths are written once, in metres, as `{0.5}` (single value) or `{0.2-0.4}` (range) tokens inside a template
 * string; `formatLengths` turns them into "50 cm" / "20 in" etc. Elements carrying a `data-len` template are
 * re-rendered by `applyLengthTemplates` (into textContent, or into the attribute named by `data-len-attr`).
 * The setting is stored in localStorage; the default is imperial for navigator.language "en-US", else metric.
 * Payloads stay in SI: only the display changes (app.js records the preference as capture.display_units).
 */

/** localStorage key for the unit preference. */
export const UNITS_STORAGE_KEY = "camihear.displayUnits";

/** @typedef {"metric"|"imperial"} DisplayUnits */

const M_PER_IN = 0.0254;
const IN_PER_FT = 12;

/**
 * Default units for a browser language tag: imperial for en-US, metric otherwise.
 * @param {string|undefined} lang e.g. navigator.language.
 * @returns {DisplayUnits}
 */
export function defaultUnits(lang) {
  return /^en-US$/i.test(String(lang || "").trim()) ? "imperial" : "metric";
}

/**
 * Reads the saved preference, falling back to defaultUnits(navigator.language). Never throws (private mode etc.).
 * @returns {DisplayUnits}
 */
export function loadUnits() {
  try {
    const v = globalThis.localStorage?.getItem(UNITS_STORAGE_KEY);
    if (v === "metric" || v === "imperial") return v;
  } catch { /* storage blocked: use the default */ }
  return defaultUnits(globalThis.navigator?.language);
}

/**
 * Saves the preference. Never throws.
 * @param {DisplayUnits} units
 */
export function saveUnits(units) {
  try { globalThis.localStorage?.setItem(UNITS_STORAGE_KEY, units); } catch { /* ignore */ }
}

/** Trims trailing ".0". */
const num = (x) => String(Number(x.toFixed(1)));

/** Feet rounded to the nearest 0.5 ft below 3 ft and to the nearest foot from 3 ft up. */
const roundFt = (ft) => (ft < 3 ? Math.round(ft * 2) / 2 : Math.round(ft));

/**
 * Formats a length or range given in metres. Metric: centimetres when the largest value is under 0.5 m,
 * otherwise metres. Imperial: whole inches when the largest value is under 2 ft (rounded to the nearest
 * inch; values of 12 in or more are rounded to a multiple of 2), otherwise feet (see roundFt).
 * @param {number} a Metres (single value, or start of range).
 * @param {number} [b] Metres (end of range).
 * @param {DisplayUnits} units
 * @returns {string} e.g. "20–40 cm", "0.3–1 m", "8–16 in", "1–3 ft", "20 in".
 */
export function formatLength(a, b, units) {
  const vals = b === undefined ? [a] : [a, b];
  const max = Math.max(...vals);
  let parts, unit;
  if (units === "imperial") {
    const inches = vals.map((m) => m / M_PER_IN);
    if (max / M_PER_IN < 2 * IN_PER_FT) {
      parts = inches.map((i) => (i >= 12 ? Math.round(i / 2) * 2 : Math.round(i)));
      unit = "in";
      // Whole feet read better when every value is a multiple of 12 in (e.g. "≤ 1 ft").
      if (parts.every((p) => p > 0 && p % 12 === 0)) { parts = parts.map((p) => p / 12); unit = "ft"; }
    } else {
      parts = inches.map((i) => roundFt(i / IN_PER_FT));
      unit = "ft";
    }
  } else if (max < 0.5) {
    parts = vals.map((m) => Math.round(m * 100));
    unit = "cm";
  } else {
    parts = vals.map((m) => num(m));
    unit = "m";
  }
  // Non-breaking space so "20 in" never wraps between the number and the unit.
  return `${parts.map(String).join("–")}\u00a0${unit}`;
}

/**
 * Replaces every `{a}` / `{a-b}` metre token in a template with formatLength output.
 * @param {string} template e.g. "Mid ({0.3-1}; tailpipe {0.5})".
 * @param {DisplayUnits} units
 * @returns {string}
 */
export function formatLengths(template, units) {
  return template.replace(/\{(\d*\.?\d+)(?:-(\d*\.?\d+))?\}/g, (_, a, b) => formatLength(Number(a), b === undefined ? undefined : Number(b), units));
}

/**
 * Re-renders every `[data-len]` element under root for the given units.
 * @param {ParentNode} root
 * @param {DisplayUnits} units
 */
export function applyLengthTemplates(root, units) {
  root.querySelectorAll("[data-len]").forEach((el) => {
    const text = formatLengths(el.dataset.len, units);
    if (el.dataset.lenAttr) el.setAttribute(el.dataset.lenAttr, text);
    else el.textContent = text;
  });
}
