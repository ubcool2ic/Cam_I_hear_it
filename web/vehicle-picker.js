/**
 * @file web/vehicle-picker.js
 * @summary Top-down 360-degree vehicle SVG outline picker for idle engine acoustic capture positioning.
 * Supports LHD/RHD orientation, keyboard selection, tap-point tracking, and exact zone mappings.
 */

/**
 * Derives lateral vehicle side from zone code.
 * @param {string} zone Zone identifier.
 * @returns {"LEFT"|"RIGHT"|"CENTER"} Physical side relative to top-down view (nose = top).
 */
function deriveSide(zone) {
  if (zone.endsWith("_LEFT")) return "LEFT";
  if (zone.endsWith("_RIGHT")) return "RIGHT";
  return "CENTER";
}

/**
 * Returns human-readable label for a zone, respecting RHD/LHD driver assignment.
 * @param {string} zone Zone identifier.
 * @param {boolean} isRhd True if vehicle is right-hand drive.
 * @returns {string} Human friendly label.
 */
function getZoneLabel(zone, isRhd) {
  const driverSide = isRhd ? "passenger" : "driver";
  const passengerSide = isRhd ? "driver" : "passenger";

  switch (zone) {
    case "GRILLE": return "Front Grille (belts & fan radiate here)";
    case "ENGINE_BAY_CENTER": return "Engine Bay – Center (intake & throttle body)";
    case "ENGINE_BAY_LEFT": return `Engine Bay – Left (${driverSide} valve cover)`;
    case "ENGINE_BAY_RIGHT": return `Engine Bay – Right (${passengerSide} valve cover)`;
    case "ENGINE_BAY_LOW": return "Engine Bay – Low (oil pan & bottom end)";
    case "FRONT_WHEEL_LEFT": return `Front Wheel – Left (${driverSide} manifold / downpipe)`;
    case "FRONT_WHEEL_RIGHT": return `Front Wheel – Right (${passengerSide} manifold / downpipe)`;
    case "REAR_WHEEL_LEFT": return `Rear Wheel – Left (${driverSide} muffler shell)`;
    case "REAR_WHEEL_RIGHT": return `Rear Wheel – Right (${passengerSide} muffler shell)`;
    case "REAR_BUMPER": return "Rear Bumper – Center (body & diffuse exhaust)";
    case "TAILPIPE_LEFT": return `Tailpipe – Left (${driverSide} outlet)`;
    case "TAILPIPE_RIGHT": return `Tailpipe – Right (${passengerSide} outlet)`;
    case "TAILPIPE_CENTER": return "Tailpipe – Center / Single Outlet";
    case "CABIN": return "Cabin Interior";
    default: return zone;
  }
}

/**
 * Creates and mounts the interactive vehicle outline picker inside a container.
 * @param {HTMLElement} container Parent DOM element.
 * @param {{ onChange?: (value: { zone: string, side: "LEFT"|"RIGHT"|"CENTER", tapXY: [number, number] }) => void }} options Callbacks.
 * @returns {{ getValue: () => { zone: string, side: "LEFT"|"RIGHT"|"CENTER", tapXY: [number, number] }, setZone: (code: string) => void, setRhd: (bool: boolean) => void }} Picker controller.
 */
export function createVehiclePicker(container, { onChange } = {}) {
  let currentZone = "TAILPIPE_LEFT";
  let currentTapXY = [0.28, 0.93];
  let isRhd = false;

  const svgNs = "http://www.w3.org/2000/svg";
  const root = document.createElement("div");
  root.className = "vehicle-picker-root";

  // Outline dimensions: 200 x 420 viewBox
  const viewBoxW = 200;
  const viewBoxH = 420;

  // Static template only (no user-provided strings), so innerHTML is safe here.
  root.innerHTML = `
    <svg class="vehicle-picker-svg" viewBox="0 0 ${viewBoxW} ${viewBoxH}" role="group" aria-label="Top-down vehicle zone selector">
      <defs>
        <filter id="vp-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#3b82f6" flood-opacity="0.8"/>
        </filter>
      </defs>

      <!-- Chassis Silhouette -->
      <path d="M 50 50 C 50 20, 150 20, 150 50 L 158 110 C 168 140, 168 280, 158 350 L 152 380 C 150 395, 50 395, 48 380 L 42 350 C 32 280, 32 140, 42 110 Z"
            fill="#12171e" stroke="#2a3544" stroke-width="2.5" />

      <!-- Windshield & Rear Glass Details -->
      <path d="M 52 120 Q 100 135 148 120 L 142 165 Q 100 172 58 165 Z" fill="#182230" stroke="#253243" stroke-width="1.2"/>
      <path d="M 58 275 Q 100 268 142 275 L 146 305 Q 100 312 54 305 Z" fill="#182230" stroke="#253243" stroke-width="1.2"/>

      <!-- Wheels (Non-tappable styling accents) -->
      <rect x="22" y="85" width="14" height="38" rx="5" fill="#0b0e12" stroke="#222b37" stroke-width="1.5"/>
      <rect x="164" y="85" width="14" height="38" rx="5" fill="#0b0e12" stroke="#222b37" stroke-width="1.5"/>
      <rect x="22" y="285" width="14" height="38" rx="5" fill="#0b0e12" stroke="#222b37" stroke-width="1.5"/>
      <rect x="164" y="285" width="14" height="38" rx="5" fill="#0b0e12" stroke="#222b37" stroke-width="1.5"/>

      <!-- Zone: GRILLE (front nose) -->
      <path id="zone-GRILLE" class="car-zone" role="button" tabindex="0" data-zone="GRILLE"
            d="M 60 12 L 140 12 L 135 34 L 65 34 Z"
            fill="#1e293b" stroke="#334155" stroke-width="1.5" />

      <!-- Engine Bay Subzones -->
      <g id="engine-bay-group">
        <!-- Bay Left -->
        <path id="zone-ENGINE_BAY_LEFT" class="car-zone" role="button" tabindex="0" data-zone="ENGINE_BAY_LEFT"
              d="M 50 42 L 95 42 L 95 108 L 48 108 Z"
              fill="#1e293b" stroke="#334155" stroke-width="1.5" />
        <!-- Bay Right -->
        <path id="zone-ENGINE_BAY_RIGHT" class="car-zone" role="button" tabindex="0" data-zone="ENGINE_BAY_RIGHT"
              d="M 105 42 L 150 42 L 152 108 L 105 108 Z"
              fill="#1e293b" stroke="#334155" stroke-width="1.5" />
        <!-- Bay Center -->
        <rect id="zone-ENGINE_BAY_CENTER" class="car-zone" role="button" tabindex="0" data-zone="ENGINE_BAY_CENTER"
              x="76" y="46" width="48" height="42" rx="4"
              fill="#243447" stroke="#475569" stroke-width="1.5" />
        <!-- Bay Low / Oil Pan Chip -->
        <rect id="zone-ENGINE_BAY_LOW" class="car-zone" role="button" tabindex="0" data-zone="ENGINE_BAY_LOW"
              x="82" y="92" width="36" height="18" rx="3"
              fill="#334155" stroke="#64748b" stroke-width="1.2" />
        <text x="100" y="104" font-size="7" fill="#94a3b8" text-anchor="middle" pointer-events="none" font-weight="bold">PAN</text>
      </g>

      <!-- Front Wheel Wells -->
      <rect id="zone-FRONT_WHEEL_LEFT" class="car-zone" role="button" tabindex="0" data-zone="FRONT_WHEEL_LEFT"
            x="4" y="80" width="22" height="48" rx="4"
            fill="#1e293b" stroke="#334155" stroke-width="1.5" />
      <rect id="zone-FRONT_WHEEL_RIGHT" class="car-zone" role="button" tabindex="0" data-zone="FRONT_WHEEL_RIGHT"
            x="174" y="80" width="22" height="48" rx="4"
            fill="#1e293b" stroke="#334155" stroke-width="1.5" />

      <!-- Cabin -->
      <path id="zone-CABIN" class="car-zone" role="button" tabindex="0" data-zone="CABIN"
            d="M 58 172 L 142 172 L 140 262 L 60 262 Z"
            fill="#151e28" stroke="#253243" stroke-width="1.5" />
      <text x="100" y="222" font-size="9" fill="#475569" text-anchor="middle" pointer-events="none" font-weight="600">CABIN</text>

      <!-- Rear Wheel Wells -->
      <rect id="zone-REAR_WHEEL_LEFT" class="car-zone" role="button" tabindex="0" data-zone="REAR_WHEEL_LEFT"
            x="4" y="280" width="22" height="48" rx="4"
            fill="#1e293b" stroke="#334155" stroke-width="1.5" />
      <rect id="zone-REAR_WHEEL_RIGHT" class="car-zone" role="button" tabindex="0" data-zone="REAR_WHEEL_RIGHT"
            x="174" y="280" width="22" height="48" rx="4"
            fill="#1e293b" stroke="#334155" stroke-width="1.5" />

      <!-- Rear Bumper -->
      <path id="zone-REAR_BUMPER" class="car-zone" role="button" tabindex="0" data-zone="REAR_BUMPER"
            d="M 64 366 L 136 366 L 132 384 L 68 384 Z"
            fill="#1e293b" stroke="#334155" stroke-width="1.5" />

      <!-- Tailpipes (behind rear) -->
      <rect id="zone-TAILPIPE_LEFT" class="car-zone" role="button" tabindex="0" data-zone="TAILPIPE_LEFT"
            x="44" y="388" width="26" height="20" rx="4"
            fill="#1e293b" stroke="#334155" stroke-width="1.5" />
      <rect id="zone-TAILPIPE_CENTER" class="car-zone" role="button" tabindex="0" data-zone="TAILPIPE_CENTER"
            x="86" y="388" width="28" height="20" rx="4"
            fill="#1e293b" stroke="#334155" stroke-width="1.5" />
      <rect id="zone-TAILPIPE_RIGHT" class="car-zone" role="button" tabindex="0" data-zone="TAILPIPE_RIGHT"
            x="130" y="388" width="26" height="20" rx="4"
            fill="#1e293b" stroke="#334155" stroke-width="1.5" />

      <!-- Static, non-interactive labels so each tappable zone is identifiable -->
      <g class="vp-labels" font-size="7" fill="#94a3b8" text-anchor="middle" pointer-events="none" font-weight="600">
        <text x="100" y="8">FRONT</text>
        <text x="100" y="26">GRILLE</text>
        <text x="62" y="58">BAY L</text>
        <text x="138" y="58">BAY R</text>
        <text x="100" y="70">INTAKE</text>
        <text x="15" y="76">FL</text><text x="185" y="76">FR</text>
        <text x="15" y="276">RL</text><text x="185" y="276">RR</text>
        <text x="100" y="378">BUMPER</text>
        <text x="57" y="416">PIPE L</text><text x="100" y="416">PIPE C</text><text x="143" y="416">PIPE R</text>
      </g>

      <!-- Tap Indicator Dot -->
      <circle id="vp-tap-dot" cx="56" cy="398" r="4.5" fill="#60a5fa" stroke="#ffffff" stroke-width="1.8" pointer-events="none" filter="url(#vp-glow)"/>
    </svg>
    <div class="picker-readout" id="vp-readout" aria-live="polite"></div>
    <div class="picker-hint">Tap outline or exhaust to place capture position</div>
  `;

  container.replaceChildren(root);

  const svg = root.querySelector("svg");
  const tapDot = root.querySelector("#vp-tap-dot");
  const readout = root.querySelector("#vp-readout");
  const zones = Array.from(root.querySelectorAll(".car-zone"));

  /**
   * Refreshes zone highlight classes, tap indicator position, and readout label.
   */
  function render() {
    zones.forEach((el) => {
      const code = el.getAttribute("data-zone");
      const active = code === currentZone;
      el.classList.toggle("active", active);
      el.setAttribute("aria-pressed", active ? "true" : "false");
      el.setAttribute("aria-label", getZoneLabel(code, isRhd));
    });

    if (tapDot) {
      tapDot.setAttribute("cx", (currentTapXY[0] * viewBoxW).toFixed(1));
      tapDot.setAttribute("cy", (currentTapXY[1] * viewBoxH).toFixed(1));
    }

    if (readout) {
      readout.textContent = getZoneLabel(currentZone, isRhd);
    }
  }

  /**
   * Selects a zone, updates tap coordinates, and notifies parent.
   * @param {string} zone Zone code.
   * @param {[number, number]} [tapXY] Normalised coords 0..1 within viewBox.
   */
  function selectZone(zone, tapXY) {
    currentZone = zone;
    if (tapXY) {
      currentTapXY = [
        Math.max(0, Math.min(1, tapXY[0])),
        Math.max(0, Math.min(1, tapXY[1])),
      ];
    } else {
      // Default fallback coordinates if zone selected via program/keyboard
      const el = root.querySelector(`[data-zone="${zone}"]`);
      if (el && typeof el.getBBox === "function") {
        try {
          const bb = el.getBBox();
          // WebKit returns a zero box for not-yet-laid-out SVG; keep the previous point rather than jumping to (0,0).
          if (bb.width > 0 && bb.height > 0) currentTapXY = [(bb.x + bb.width / 2) / viewBoxW, (bb.y + bb.height / 2) / viewBoxH];
        } catch (_) {
          /* SVG getBBox might throw if disconnected */
        }
      }
    }

    render();

    if (typeof onChange === "function") {
      onChange({
        zone: currentZone,
        side: deriveSide(currentZone),
        tapXY: [Number(currentTapXY[0].toFixed(3)), Number(currentTapXY[1].toFixed(3))],
      });
    }
  }

  /**
   * Finds the zone whose bounding-box centre is closest to a point in viewBox units.
   * @param {number} x
   * @param {number} y
   * @returns {string} Zone code.
   */
  function nearestZone(x, y) {
    let best = currentZone, bestD = Infinity;
    for (const el of zones) {
      try {
        const bb = el.getBBox();
        if (!(bb.width > 0)) continue;
        const d = (bb.x + bb.width / 2 - x) ** 2 + (bb.y + bb.height / 2 - y) ** 2;
        if (d < bestD) { bestD = d; best = el.getAttribute("data-zone"); }
      } catch (_) { /* not rendered */ }
    }
    return best;
  }

  // Click & Tap handling on the SVG
  svg.addEventListener("click", (ev) => {
    const rect = svg.getBoundingClientRect();
    const nx = (ev.clientX - rect.left) / rect.width;
    const ny = (ev.clientY - rect.top) / rect.height;

    // Check if clicked directly on or inside a zone element
    const hitZone = ev.target.closest(".car-zone");
    if (hitZone) {
      const code = hitZone.getAttribute("data-zone");
      selectZone(code, [nx, ny]);
      return;
    }

    // Tap on the body but outside a drawn zone: snap to the nearest zone centre (keeps tapXY as tapped).
    selectZone(nearestZone(nx * viewBoxW, ny * viewBoxH), [nx, ny]);
  });

  // Keyboard accessibility on zone buttons
  zones.forEach((el) => {
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        const code = el.getAttribute("data-zone");
        selectZone(code);
      }
    });
  });

  // Initial render
  render();

  return {
    /** Returns current picker state. */
    getValue() {
      return {
        zone: currentZone,
        side: deriveSide(currentZone),
        tapXY: [Number(currentTapXY[0].toFixed(3)), Number(currentTapXY[1].toFixed(3))],
      };
    },
    /** Programmatically sets the active zone code. */
    setZone(code) {
      if (!code) return;
      selectZone(code);
    },
    /** Updates RHD configuration and human labels. */
    setRhd(rhd) {
      isRhd = Boolean(rhd);
      render();
    },
  };
}
