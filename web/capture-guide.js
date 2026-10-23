/**
 * @file web/capture-guide.js
 * @summary Step-by-step guided capture workflow for idle engine acoustic recordings with microphone orientation illustration.
 */

/**
 * Guided capture steps (docs/RESEARCH_ACOUSTICS.md §9.8). Each step's `preset` (or null) is applied to the position
 * picker and selects by app.js via `onStep`. Presets use the §10 codes.
 * @type {Array<{id:string,title:string,badge:string,instructions:string,preset:object|null,showPhone:boolean}>}
 */
export const GUIDE_STEPS = [
  {
    id: "step-tailpipe",
    title: "1. Tailpipe Capture",
    badge: "Step 1 of 3",
    instructions: "Engine warm and idling. Hold phone ~0.5 m from the exhaust outlet at 45° off-axis, level with pipe height. Point bottom edge (mic) directly toward the pipe. Hold steady for ~30 s (driver side if dual exhaust).",
    preset: {
      zone: "TAILPIPE_LEFT",
      distanceBand: "MID",
      heightBand: "LOW",
      hood: "NA",
      phoneOrientation: "MIC_TOWARD_SOURCE",
    },
    showPhone: true,
  },
  {
    id: "step-engine-bay",
    title: "2. Engine Bay Capture",
    badge: "Step 2 of 3",
    instructions: "Hood fully open. Hold phone 20–40 cm above the center of the valve covers or intake manifold with the mic end aimed at the engine. Do NOT touch moving belts, fans, or hot manifolds. Hold steady ~30 s.",
    preset: {
      zone: "ENGINE_BAY_CENTER",
      distanceBand: "NEAR",
      heightBand: "MID",
      hood: "OPEN",
      phoneOrientation: "MIC_TOWARD_SOURCE",
    },
    showPhone: true,
  },
  {
    id: "step-free",
    title: "3. Free Capture",
    badge: "Step 3 of 3",
    instructions: "Custom position mode. Select any zone on the vehicle outline (oil pan, wheel wells, grille) and configure custom distance, height, and hood states.",
    // No preset: free capture keeps whatever the user has set.
    preset: null,
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
 * @param {{ onStep?: (step: typeof GUIDE_STEPS[number]) => void }} options Callback options.
 * @returns {{ getStep: () => typeof GUIDE_STEPS[number], setStepIndex: (index: number) => void }} Controller object.
 */
export function createCaptureGuide(container, { onStep } = {}) {
  let stepIndex = 0;

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
          <div class="guide-instructions">${step.instructions}</div>
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
