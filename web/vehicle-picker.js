/**
 * @file web/vehicle-picker.js
 * @summary Top-down 360° "where are you standing?" picker. The user taps one of the exterior ring positions around the
 * car outline: front, front corners, each door, rear corners, trunk or tailpipe. A separate optional "engine bay, hood
 * open" spot sits inside the outline. The outline also shows which way the user is facing, the driver seat
 * (LHD/RHD), and the optional noise environment (wall side, noise direction, wind, garage/open lot).
 *
 * Side convention (stored in the payload): LEFT/RIGHT are in the vehicle frame, i.e. as seen from the driver's seat
 * facing forward. The outline is drawn nose-up, so vehicle LEFT is screen left. Driver/passenger labels come from the
 * LHD/RHD setting: LHD puts the driver on the LEFT, RHD puts the driver on the RIGHT. See docs/RESEARCH_ACOUSTICS.md §10.
 */

/** @typedef {"LHD"|"RHD"} DriveSide */
/** @typedef {"LEFT"|"RIGHT"|"CENTER"} Side */
/** @typedef {"LEFT"|"RIGHT"|"CENTER"|"DUAL"} TailpipeOutlet */

const VB_W = 300;
const VB_H = 512;

/** Engine-bay centre and rear-bumper centre in viewBox units (targets for the facing arrow). */
const BAY_C = [150, 110];
const REAR_C = [150, 380];

/**
 * Exterior ring positions. `x,y` = where the person stands (viewBox units), `target` = what they face,
 * `lx,ly,anchor` = label placement, `name(d,p)` = short SVG label, `long(d,p)` = full readout label.
 * `d`/`p` are "Driver"/"Passenger" words for this side, resolved from LHD/RHD.
 */
export const RING_POSITIONS = [
  { id: "FRONT_CENTER", side: "CENTER", x: 150, y: 28, target: BAY_C, lx: 172, ly: 32, anchor: "start",
    name: () => "Front / grille", long: () => "Front centre, at the grille", faces: () => "facing the grille / engine" },
  { id: "FRONT_LEFT_CORNER", side: "LEFT", x: 52, y: 62, target: BAY_C, lx: 52, ly: 93, anchor: "middle",
    name: (s) => `${s.short} front`, long: (s) => `${s.word} front corner`, faces: (s) => `facing the ${s.lower}-side front corner (front wheel, manifold side)` },
  { id: "FRONT_RIGHT_CORNER", side: "RIGHT", x: 248, y: 62, target: BAY_C, lx: 248, ly: 93, anchor: "middle",
    name: (s) => `${s.short} front`, long: (s) => `${s.word} front corner`, faces: (s) => `facing the ${s.lower}-side front corner (front wheel, manifold side)` },
  { id: "LEFT_FRONT_DOOR", side: "LEFT", x: 46, y: 188, target: [94, 188], lx: 46, ly: 218, anchor: "middle",
    name: (s) => `${s.short} door`, long: (s) => `${s.word} front door`, faces: (s) => `facing the ${s.lower} side of the car` },
  { id: "LEFT_REAR_DOOR", side: "LEFT", x: 46, y: 272, target: [94, 272], lx: 46, ly: 302, anchor: "middle",
    name: (s) => `${s.short} rear door`, long: (s) => `${s.word} rear door`, faces: (s) => `facing the ${s.lower} side of the car` },
  { id: "RIGHT_FRONT_DOOR", side: "RIGHT", x: 254, y: 188, target: [206, 188], lx: 254, ly: 218, anchor: "middle",
    name: (s) => `${s.short} door`, long: (s) => `${s.word} front door`, faces: (s) => `facing the ${s.lower} side of the car` },
  { id: "RIGHT_REAR_DOOR", side: "RIGHT", x: 254, y: 272, target: [206, 272], lx: 254, ly: 302, anchor: "middle",
    name: (s) => `${s.short} rear door`, long: (s) => `${s.word} rear door`, faces: (s) => `facing the ${s.lower} side of the car` },
  { id: "REAR_LEFT_CORNER", side: "LEFT", x: 52, y: 420, target: REAR_C, lx: 52, ly: 393, anchor: "middle",
    name: (s) => `${s.short} rear`, long: (s) => `${s.word} rear corner`, faces: (s) => `facing the ${s.lower}-side rear corner` },
  { id: "REAR_CENTER", side: "CENTER", x: 150, y: 436, target: [150, 404], lx: 172, ly: 440, anchor: "start",
    name: () => "Trunk", long: () => "Rear centre / trunk", faces: () => "facing the trunk / rear bumper" },
  { id: "REAR_RIGHT_CORNER", side: "RIGHT", x: 248, y: 420, target: REAR_C, lx: 248, ly: 393, anchor: "middle",
    name: (s) => `${s.short} rear`, long: (s) => `${s.word} rear corner`, faces: (s) => `facing the ${s.lower}-side rear corner` },
  // TAILPIPE: x/y/target depend on the outlet; see tailpipeGeometry().
  { id: "TAILPIPE", side: "CENTER", x: 150, y: 482, target: [150, 410], lx: 0, ly: 0, anchor: "middle",
    name: () => "", long: () => "Tailpipe", faces: () => "facing the tailpipe outlet" },
];

/** Optional off-ring spot. */
export const ENGINE_BAY_ID = "ENGINE_BAY";

/** Where the person stands / faces for each tailpipe outlet choice. */
const TAILPIPE_GEOM = {
  LEFT: { x: 96, y: 470, outlet: [[116, 410]] },
  RIGHT: { x: 204, y: 470, outlet: [[184, 410]] },
  CENTER: { x: 150, y: 482, outlet: [[150, 410]] },
  DUAL: { x: 150, y: 482, outlet: [[116, 410], [184, 410]] },
};

/**
 * Maps a vehicle-frame side to driver/passenger.
 * @param {Side|string} side LEFT, RIGHT or anything else (centre/none).
 * @param {DriveSide} driveSide LHD or RHD.
 * @returns {"DRIVER"|"PASSENGER"|"CENTER"}
 */
export function seatSideOf(side, driveSide) {
  if (side !== "LEFT" && side !== "RIGHT") return "CENTER";
  const driverIsLeft = driveSide !== "RHD";
  return (side === "LEFT") === driverIsLeft ? "DRIVER" : "PASSENGER";
}

/**
 * Human words for a vehicle-frame side under the current drive side.
 * @param {Side|string} side
 * @param {DriveSide} driveSide
 * @returns {{word:string, short:string, lower:string}} e.g. {word:"Driver", short:"Driver", lower:"driver"}.
 */
export function sideWords(side, driveSide) {
  const seat = seatSideOf(side, driveSide);
  if (seat === "DRIVER") return { word: "Driver", short: "Driver", lower: "driver" };
  if (seat === "PASSENGER") return { word: "Passenger", short: "Pass.", lower: "passenger" };
  return { word: "Centre", short: "", lower: "centre" };
}

/**
 * Compass bearing (degrees, vehicle frame: 0 = toward the nose, 90 = toward vehicle RIGHT) from a to b.
 * @param {number[]} a [x,y] in viewBox units.
 * @param {number[]} b [x,y].
 */
function bearing(a, b) {
  const deg = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;
  return Math.round((deg + 360) % 360);
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Creates an SVG element with attributes.
 * @param {string} tag
 * @param {Record<string, string|number>} attrs
 * @param {string} [text] Optional textContent.
 */
function el(tag, attrs = {}, text) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  return n;
}

/**
 * Mounts the exterior-position picker.
 * @param {HTMLElement} container Host element.
 * @param {{ onChange?: (value: object) => void }} [options] onChange gets the same object as getValue().
 * @returns {{
 *   getValue: () => object,
 *   setPosition: (id: string) => void,
 *   setTailpipe: (outlet: TailpipeOutlet) => void,
 *   setDriveSide: (d: DriveSide) => void,
 *   setEnvironment: (env: {setting?:string|null, wallSide?:string|null, wind?:string|null, noiseDirection?:string|null, noiseKind?:string|null}) => void,
 * }}
 */
export function createVehiclePicker(container, { onChange } = {}) {
  /** @type {string} */ let positionId = "TAILPIPE";
  /** @type {TailpipeOutlet} */ let tailpipe = "LEFT";
  /** @type {DriveSide} */ let driveSide = "LHD";
  let env = { setting: null, wallSide: null, wind: null, noiseDirection: null, noiseKind: null };

  const root = document.createElement("div");
  root.className = "vehicle-picker-root";

  const svg = el("svg", { class: "vehicle-picker-svg", viewBox: `0 0 ${VB_W} ${VB_H}`, role: "group",
    "aria-label": "Where are you standing? Tap a position around the car" });
  const defs = el("defs");
  const marker = el("marker", { id: "vp-arrow", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse" });
  marker.append(el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "#60a5fa" }));
  defs.append(marker);
  svg.append(defs);

  // Environment layer (drawn first, under everything).
  const envLayer = el("g", { class: "vp-env", "pointer-events": "none" });
  svg.append(envLayer);

  // Car body (static, decorative).
  const car = el("g", { class: "vp-car", "pointer-events": "none" });
  car.append(
    el("path", { d: "M 100 72 Q 100 56 122 56 L 178 56 Q 200 56 200 72 L 206 150 L 206 330 L 202 390 Q 200 404 178 404 L 122 404 Q 100 404 98 390 L 94 330 L 94 150 Z",
      fill: "#12171e", stroke: "#334155", "stroke-width": 2 }),
    el("path", { d: "M 104 166 Q 150 178 196 166 L 190 200 Q 150 207 110 200 Z", fill: "#182230", stroke: "#2a3544" }),
    el("path", { d: "M 110 322 Q 150 315 190 322 L 194 346 Q 150 354 106 346 Z", fill: "#182230", stroke: "#2a3544" }),
    el("path", { d: "M 94 232 L 106 232 M 194 232 L 206 232", stroke: "#334155", "stroke-width": 1.5 }),
  );
  for (const [x, y] of [[86, 96], [204, 96], [86, 308], [204, 308]])
    car.append(el("rect", { x, y, width: 10, height: 42, rx: 3, fill: "#0b0e12", stroke: "#334155" }));
  const steering = el("g");
  const steerWheel = el("circle", { cx: 128, cy: 226, r: 9, fill: "none", stroke: "#94a3b8", "stroke-width": 2 });
  const steerLabel = el("text", { x: 128, y: 248, "font-size": 7.5, fill: "#94a3b8", "text-anchor": "middle", "font-weight": 600 }, "DRIVER");
  steering.append(steerWheel, steerLabel);
  car.append(steering, el("text", { x: 150, y: 290, "font-size": 8, fill: "#475569", "text-anchor": "middle", "font-weight": 600 }, "NOSE UP ↑"));
  const pipes = el("g");
  car.append(pipes);
  svg.append(car);

  // Optional engine-bay spot (inside the outline, dashed).
  const bay = el("g", { class: "vp-spot vp-bay", role: "button", tabindex: 0, "data-id": ENGINE_BAY_ID,
    "aria-label": "Engine bay, hood open (optional, not on the ring)" });
  bay.append(
    el("rect", { class: "vp-bay-rect", x: 110, y: 72, width: 80, height: 76, rx: 8 }),
    el("text", { x: 150, y: 106, "font-size": 8.5, "text-anchor": "middle", "font-weight": 700, class: "vp-bay-text" }, "ENGINE BAY"),
    el("text", { x: 150, y: 119, "font-size": 7.5, "text-anchor": "middle", class: "vp-bay-text" }, "(optional, hood open)"),
  );
  svg.append(bay);

  // Facing arrow layer.
  const facingLayer = el("g", { class: "vp-facing", "pointer-events": "none" });
  svg.append(facingLayer);

  // Ring spots.
  const spotEls = new Map();
  const labelEls = new Map();
  for (const p of RING_POSITIONS) {
    const g = el("g", { class: "vp-spot vp-ring", role: "button", tabindex: 0, "data-id": p.id });
    g.append(el("circle", { class: "vp-hit", r: 22, fill: "transparent" }), el("circle", { class: "vp-dot", r: 15 }));
    if (p.id === "TAILPIPE") g.append(el("text", { class: "vp-dot-text", y: 3, "font-size": 8, "text-anchor": "middle", "font-weight": 700 }, "PIPE"));
    svg.append(g);
    spotEls.set(p.id, g);
    if (p.id !== "TAILPIPE") {
      const t = el("text", { x: p.lx, y: p.ly, "font-size": 8.5, "text-anchor": p.anchor, class: "vp-label", "font-weight": 600 });
      svg.append(t);
      labelEls.set(p.id, t);
    }
  }

  const readout = document.createElement("div");
  readout.className = "picker-readout";
  readout.setAttribute("aria-live", "polite");
  const envReadout = document.createElement("div");
  envReadout.className = "picker-env-readout";

  // Tailpipe outlet buttons (shown only when TAILPIPE is selected).
  const tpRow = document.createElement("div");
  tpRow.className = "seg-buttons";
  tpRow.setAttribute("role", "group");
  tpRow.setAttribute("aria-label", "Which tailpipe outlet");
  const tpButtons = new Map();
  for (const o of ["LEFT", "RIGHT", "CENTER", "DUAL"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "seg-btn";
    b.dataset.outlet = o;
    b.addEventListener("click", () => { tailpipe = o; select("TAILPIPE"); });
    tpRow.append(b);
    tpButtons.set(o, b);
  }
  const hint = document.createElement("div");
  hint.className = "picker-hint";
  hint.textContent = "Tap where you are standing. Arrow = the way you face.";

  root.append(svg, readout, tpRow, envReadout, hint);
  container.replaceChildren(root);

  /** @returns {{x:number,y:number,target:number[],outlets:number[][]}} Current geometry of a ring position. */
  function geom(id) {
    const p = RING_POSITIONS.find((q) => q.id === id);
    if (id === "TAILPIPE") {
      const t = TAILPIPE_GEOM[tailpipe];
      const target = tailpipe === "DUAL" ? [150, 410] : t.outlet[0];
      return { x: t.x, y: t.y, target, outlets: t.outlet };
    }
    return { x: p.x, y: p.y, target: p.target, outlets: [] };
  }

  /** Vehicle-frame side of the current selection. @returns {Side} */
  function currentSide() {
    if (positionId === "TAILPIPE") return tailpipe === "LEFT" ? "LEFT" : tailpipe === "RIGHT" ? "RIGHT" : "CENTER";
    if (positionId === ENGINE_BAY_ID) return "CENTER";
    return RING_POSITIONS.find((q) => q.id === positionId)?.side ?? "CENTER";
  }

  /** Text for the tailpipe outlet under the current drive side. */
  function outletLabel(o) {
    if (o === "CENTER") return "Centre pipe";
    if (o === "DUAL") return "Dual: between pipes";
    return `${sideWords(o, driveSide).word} pipe`;
  }

  /** Full readout label for a position id. */
  function longLabel(id) {
    if (id === ENGINE_BAY_ID) return "Engine bay, hood open (over the engine)";
    if (id === "TAILPIPE") return `Tailpipe (${outletLabel(tailpipe).toLowerCase()})`;
    const p = RING_POSITIONS.find((q) => q.id === id);
    return p.long(sideWords(p.side, driveSide));
  }

  /** "facing …" text for the current selection. */
  function facingText() {
    if (positionId === ENGINE_BAY_ID) return "looking down into the engine bay";
    if (positionId === "TAILPIPE") return tailpipe === "DUAL" ? "facing between the two outlets" : `facing the ${outletLabel(tailpipe).toLowerCase()} outlet`;
    const p = RING_POSITIONS.find((q) => q.id === positionId);
    return p.faces(sideWords(p.side, driveSide));
  }

  /** Redraws the environment overlay and its text summary. */
  function renderEnv() {
    envLayer.replaceChildren();
    const words = [];
    const dirWord = (d) => (d === "FRONT" ? "in front" : d === "REAR" ? "behind" : d === "ALL_AROUND" ? "all around" : `${sideWords(d, driveSide).lower} side`);
    if (env.setting === "INDOOR_GARAGE") {
      envLayer.append(el("rect", { x: 1.5, y: 1.5, width: VB_W - 3, height: VB_H - 3, rx: 6, fill: "none", stroke: "#a78bfa", "stroke-width": 2, "stroke-dasharray": "6 4" }));
    }
    if (env.setting) {
      const label = { INDOOR_GARAGE: "GARAGE", OUTDOOR_OPEN_LOT: "OPEN LOT", OUTDOOR_DRIVEWAY_STREET: "DRIVEWAY/STREET", COVERED_CARPORT: "CARPORT", OTHER: "OTHER" }[env.setting] ?? env.setting;
      envLayer.append(el("text", { x: 7, y: 15, "font-size": 8, fill: "#c4b5fd", "font-weight": 700 }, label));
      words.push(label.toLowerCase());
    }
    if (env.wallSide) {
      const L = { FRONT: [20, 5, 280, 5], REAR: [20, VB_H - 5, 280, VB_H - 5], LEFT: [5, 30, 5, VB_H - 30], RIGHT: [VB_W - 5, 30, VB_W - 5, VB_H - 30] }[env.wallSide];
      if (L) envLayer.append(el("line", { x1: L[0], y1: L[1], x2: L[2], y2: L[3], stroke: "#f59e0b", "stroke-width": 6, "stroke-dasharray": "3 3" }));
      words.push(`wall ${dirWord(env.wallSide)}`);
    }
    if (env.noiseDirection) {
      const kindTag = env.noiseKind ? env.noiseKind.replace(/_.*/, "") : "NOISE";
      // Orange band on the edge the noise comes from, plus a tag with an arrow pointing toward the car.
      const B = { FRONT: [14, 8, VB_W - 28, 8], REAR: [14, VB_H - 16, VB_W - 28, 8], LEFT: [8, 40, 8, VB_H - 80], RIGHT: [VB_W - 16, 40, 8, VB_H - 80] }[env.noiseDirection];
      if (B) envLayer.append(el("rect", { x: B[0], y: B[1], width: B[2], height: B[3], rx: 4, fill: "#f97316", opacity: 0.35 }));
      const T = { FRONT: [VB_W - 6, 26, "end", `${kindTag} ▼`], REAR: [VB_W - 6, VB_H - 22, "end", `${kindTag} ▲`], LEFT: [20, 350, "start", `${kindTag} ▶`], RIGHT: [VB_W - 20, 350, "end", `◀ ${kindTag}`] }[env.noiseDirection];
      if (T) envLayer.append(el("text", { x: T[0], y: T[1], "text-anchor": T[2], "font-size": 9, fill: "#fb923c", "font-weight": 800 }, T[3]));
      const kind = env.noiseKind ? env.noiseKind.toLowerCase().replace(/_/g, " ") : "noise";
      words.push(`${kind} ${dirWord(env.noiseDirection)}`);
    }
    if (env.wind) {
      envLayer.append(el("text", { x: 7, y: 28, "font-size": 8, fill: "#7dd3fc", "font-weight": 700 }, `≋ WIND ${env.wind}`));
      words.push(`wind ${env.wind.toLowerCase()}`);
    }
    envReadout.textContent = words.length ? `Environment: ${words.join(" · ")}` : "";
  }

  /** Redraws selection, labels, pipes, facing arrow and readouts. */
  function render() {
    const driverLeft = driveSide !== "RHD";
    steerWheel.setAttribute("cx", driverLeft ? 128 : 172);
    steerLabel.setAttribute("x", driverLeft ? 128 : 172);

    for (const p of RING_POSITIONS) {
      const g = spotEls.get(p.id);
      const { x, y } = geom(p.id);
      for (const c of g.querySelectorAll("circle")) { c.setAttribute("cx", x); c.setAttribute("cy", y); }
      const t = g.querySelector("text");
      if (t) { t.setAttribute("x", x); t.setAttribute("y", y + 3); }
      const active = p.id === positionId;
      g.classList.toggle("active", active);
      g.setAttribute("aria-pressed", String(active));
      g.setAttribute("aria-label", p.id === "TAILPIPE" ? longLabel("TAILPIPE") : p.long(sideWords(p.side, driveSide)));
      if (labelEls.has(p.id)) {
        labelEls.get(p.id).textContent = p.name(sideWords(p.side, driveSide));
        labelEls.get(p.id).classList.toggle("active", active);
      }
    }
    bay.classList.toggle("active", positionId === ENGINE_BAY_ID);
    bay.setAttribute("aria-pressed", String(positionId === ENGINE_BAY_ID));

    // Tailpipe outlets on the bumper: highlight the chosen one(s).
    pipes.replaceChildren();
    for (const [x, y] of TAILPIPE_GEOM[tailpipe].outlet) pipes.append(el("rect", { x: x - 5, y: y - 8, width: 10, height: 9, rx: 2, fill: "#475569", stroke: "#94a3b8" }));

    // Facing arrow from the person toward the target.
    facingLayer.replaceChildren();
    if (positionId !== ENGINE_BAY_ID) {
      const g = geom(positionId);
      const dx = g.target[0] - g.x, dy = g.target[1] - g.y, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len, start = 17, end = Math.max(start + 14, Math.min(len - 4, start + 34));
      facingLayer.append(el("line", { x1: g.x + ux * start, y1: g.y + uy * start, x2: g.x + ux * end, y2: g.y + uy * end,
        stroke: "#60a5fa", "stroke-width": 3, "stroke-linecap": "round", "marker-end": "url(#vp-arrow)" }));
    }

    readout.textContent = `You: ${longLabel(positionId)}, ${facingText()}`;
    tpRow.hidden = positionId !== "TAILPIPE";
    for (const [o, b] of tpButtons) {
      b.textContent = outletLabel(o);
      b.setAttribute("aria-pressed", String(o === tailpipe));
      b.classList.toggle("active", o === tailpipe);
    }
    renderEnv();
  }

  /** @returns Current value as stored in the payload. */
  function getValue() {
    const side = currentSide();
    const isBay = positionId === ENGINE_BAY_ID;
    const g = isBay ? null : geom(positionId);
    return {
      position_id: positionId,
      ring: !isBay,
      side,
      seatSide: seatSideOf(side, driveSide),
      tailpipe: positionId === "TAILPIPE" ? tailpipe : null,
      facing: isBay
        ? { target: "ENGINE_BAY", bearingDeg: null }
        : { target: positionId === "TAILPIPE" ? "TAILPIPE_OUTLET" : positionId.startsWith("FRONT") ? "ENGINE_BAY" : positionId.includes("DOOR") ? "VEHICLE_SIDE" : "VEHICLE_REAR",
            bearingDeg: bearing([g.x, g.y], g.target) },
      label: longLabel(positionId),
    };
  }

  /** Selects a position and notifies the host. @param {string} id */
  function select(id) {
    if (id !== ENGINE_BAY_ID && !RING_POSITIONS.some((p) => p.id === id)) return;
    positionId = id;
    render();
    if (typeof onChange === "function") onChange(getValue());
  }

  // Taps: inside the engine-bay box selects it; anywhere else snaps to the nearest ring position (big, forgiving targets).
  svg.addEventListener("click", (ev) => {
    const r = svg.getBoundingClientRect();
    if (!(r.width > 0)) return;
    const x = ((ev.clientX - r.left) / r.width) * VB_W, y = ((ev.clientY - r.top) / r.height) * VB_H;
    if (x >= 110 && x <= 190 && y >= 72 && y <= 148) return select(ENGINE_BAY_ID);
    let best = null, bestD = Infinity;
    for (const p of RING_POSITIONS) {
      const g = geom(p.id), d = (g.x - x) ** 2 + (g.y - y) ** 2;
      if (d < bestD) { bestD = d; best = p.id; }
    }
    select(best);
  });
  for (const g of [...spotEls.values(), bay]) {
    g.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(g.getAttribute("data-id")); }
    });
  }

  render();

  return {
    getValue,
    /** Selects a ring position or ENGINE_BAY by id. */
    setPosition: (id) => select(id),
    /** Sets the tailpipe outlet (LEFT/RIGHT/CENTER/DUAL) without changing the selection. */
    setTailpipe(o) { if (TAILPIPE_GEOM[o]) { tailpipe = o; render(); if (positionId === "TAILPIPE" && onChange) onChange(getValue()); } },
    /** Sets LHD/RHD; relabels driver/passenger and moves the steering wheel. */
    setDriveSide(d) { driveSide = d === "RHD" ? "RHD" : "LHD"; render(); if (onChange) onChange(getValue()); },
    /** Updates the environment overlay (values from the environment form; null = not set). */
    setEnvironment(e) { env = { ...env, ...e }; renderEnv(); },
  };
}
