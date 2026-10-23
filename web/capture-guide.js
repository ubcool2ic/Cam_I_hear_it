/**
 * @file web/capture-guide.js
 * @summary Step-by-step guided capture workflow for idle engine acoustic recordings with microphone orientation illustration.
 * Shown lengths follow the metric/imperial display setting (web/units.js). Each step carries the recommended
 * mic-to-car distance in metres (`preset.distanceM`); app.js preselects the distance band that contains it.
 */

import { formatLengths } from "./units.js";

/**
 * Guided capture steps (docs/RESEARCH_ACOUSTICS.md §9.8). Each step *recommends* a position; its `preset` is applied to
 * the picker and form when the step is entered, but the user can then tap any ring position and that choice is what
 * gets saved. Lengths in `instructions` are metre tokens (`{0.5}`, `{0.2-0.4}`) rendered in the user's display units
 * by web/units.js, in both `instructions` and `recommended`. `preset.position` is a picker id; `preset.tailpipe: "DRIVER"` is resolved to LEFT/RIGHT by app.js
 * from the LHD/RHD setting. `preset.distanceM` is the recommended distance from the pipe outlet / engine, as
 * [min, max] metres; app.js picks the distance band containing it. Preset keys that are absent are left as the user set them.
 * @type {Array<{id:string,title:string,badge:string,instructions:string,recommended:string,preset:object|null,showPhone:boolean}>}
 */
export const GUIDE_STEPS = [
  {
    id: "step-tailpipe",
    title: "1. Tailpipe",
    badge: "Step 1 of 3",
    instructions: "Engine warm and idling. Stand behind the car and hold the phone about {0.5} from the pipe outlet, 45&deg; off to the side, at pipe height, bottom edge (mic) toward the pipe. Hold still for ~30 s.",
    recommended: "Tailpipe (driver-side pipe if dual), about {0.5} from the outlet, Low height",
    preset: { position: "TAILPIPE", tailpipe: "DRIVER", distanceM: [0.5, 0.5], heightBand: "LOW", phoneOrientation: "MIC_TOWARD_SOURCE" },
    showPhone: true,
  },
  {
    id: "step-engine-bay",
    title: "2. Engine bay (hood open)",
    badge: "Step 2 of 3",
    instructions: "Open the hood. Stand at the front and hold the phone {0.2-0.3} above the valve covers / intake, mic end toward the engine. Keep clear of belts, the fan and hot manifolds. Hold still ~30 s.",
    recommended: "Engine bay spot, hood Open, {0.2-0.3} from the engine, Mid height",
    preset: { position: "ENGINE_BAY", hood: "OPEN", distanceM: [0.2, 0.3], heightBand: "MID", phoneOrientation: "MIC_TOWARD_SOURCE" },
    showPhone: true,
  },
  {
    id: "step-free",
    title: "3. Walk-around (optional)",
    badge: "Step 3 of 3",
    instructions: "Extra clips help us separate the engine from the surroundings. Driver and passenger front corners (~{0.3} from the front wheel, 15 s each) compare the two banks. Any ring position is fine: tap where you actually stand.",
    recommended: "Front corners, or any spot on the ring",
    // Distance only: the standing spot is left as the user picks it.
    preset: { distanceM: [0.3, 0.3] },
    showPhone: false,
  },
];

/**
 * SVG markup for phone silhouette with bottom microphone port highlighted.
 */
const PHONE_SVG = `
  <svg width="48" height="84" viewBox="0 0 48 84" aria-label="Phone orientation guide" role="img">
    <rect x="2" y="2" width="44" height="80" rx="8" fill="#182230" stroke="#3b82f6" stroke-width="2"/>
    <!-- Speaker notch -->
    <rect x="18" y="7" width="12" height="2" rx="1" fill="#475569"/>
    <!-- Screen outline -->
    <rect x="6" y="13" width="36" height="58" rx="3" fill="#0b0e14"/>
    <!-- Bottom mic target highlight -->
    <circle cx="16" cy="76" r="3" fill="#ef4444"/>
    <circle cx="32" cy="76" r="1.5" fill="#64748b"/>
    <!-- Direction pointer radiating from bottom mic -->
    <path d="M 16 80 L 16 83" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
    <text x="24" y="52" font-size="8" fill="#60a5fa" text-anchor="middle" font-weight="600">MIC &darr;</text>
  </svg>
`;

/**
 * Creates and mounts the guided capture card in the container.
 * @param {HTMLElement} container Host DOM element.
 * @param {{ onStep?: (step: typeof GUIDE_STEPS[number]) => void, units?: "metric"|"imperial" }} options Callback and
 *   initial display units (default metric).
 * @returns {{ getStep: () => typeof GUIDE_STEPS[number], setStepIndex: (index: number) => void,
 *   setUnits: (units: "metric"|"imperial") => void }} Controller object. setUnits re-renders without firing onStep.
 */
export function createCaptureGuide(container, { onStep, units = "metric" } = {}) {
  let stepIndex = 0;
  let displayUnits = units;

  const root = document.createElement("div");
  root.className = "guide-container";
  container.replaceChildren(root);

  /**
   * Renders the current step into the container.
   */
  function render() {
    const step = GUIDE_STEPS[stepIndex];
    // Static step text from GUIDE_STEPS only (no user input), so innerHTML is safe here.
    root.innerHTML = `
      <div class="guide-step-card">
        <div class="guide-header">
          <span class="guide-step-title">${step.title}</span>
          <span class="guide-step-badge">${step.badge}</span>
        </div>
        <div class="guide-body">
          ${step.showPhone ? `<div class="guide-illustration" title="Point the bottom microphone at the engine sound source">${PHONE_SVG}</div>` : ""}
          <div class="guide-instructions">${formatLengths(step.instructions, displayUnits)}
            <div class="guide-recommended"><strong>Recommended:</strong> ${formatLengths(step.recommended, displayUnits)}. <span class="muted">Can&rsquo;t stand there? Tap any spot on the outline; we save what you pick.</span></div>
          </div>
        </div>
        <div class="guide-nav">
          <button type="button" class="guide-btn" id="guide-prev" ${stepIndex === 0 ? "disabled" : ""}>&larr; Back</button>
          <button type="button" class="guide-btn" id="guide-next" ${stepIndex === GUIDE_STEPS.length - 1 ? "disabled" : ""}>Next &rarr;</button>
        </div>
      </div>
    `;

    const prevBtn = root.querySelector("#guide-prev");
    const nextBtn = root.querySelector("#guide-next");

    if (prevBtn) {
      prevBtn.onclick = () => {
        if (stepIndex > 0) {
          stepIndex--;
          render();
          if (typeof onStep === "function") onStep(GUIDE_STEPS[stepIndex]);
        }
      };
    }

    if (nextBtn) {
      nextBtn.onclick = () => {
        if (stepIndex < GUIDE_STEPS.length - 1) {
          stepIndex++;
          render();
          if (typeof onStep === "function") onStep(GUIDE_STEPS[stepIndex]);
        }
      };
    }
  }

  render();
  if (typeof onStep === "function") {
    onStep(GUIDE_STEPS[stepIndex]);
  }

  return {
    /** Re-renders the current step in new display units (does not fire onStep). @param {"metric"|"imperial"} u */
    setUnits(u) {
      displayUnits = u;
      render();
    },
    /** @returns the current step object. */
    getStep() {
      return GUIDE_STEPS[stepIndex];
    },
    /** Jumps to step `idx` (0-based) and fires onStep. @param {number} idx */
    setStepIndex(idx) {
      if (idx >= 0 && idx < GUIDE_STEPS.length) {
        stepIndex = idx;
        render();
        if (typeof onStep === "function") onStep(GUIDE_STEPS[stepIndex]);
      }
    },
  };
}
