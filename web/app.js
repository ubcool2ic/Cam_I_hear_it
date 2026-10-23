/**
 * @file web/app.js
 * @summary Cam_I_hear_it capture page controller. Opens the mic with voice processing off (and shows what the browser
 * actually applied), records via an AudioWorklet, draws a hi-DPI log-frequency spectrogram, runs live (every 2 s, last
 * 8 s) and final analysis with the DSP lib, wires the 360° position picker and guided capture steps, and builds the
 * JSON payload for download or strictly opt-in POST (audio is never uploaded).
 */

import { analyzeClip, FEATURE_SCHEMA } from "./lib/index.js";
import { createVehiclePicker } from "./vehicle-picker.js";
import { createCaptureGuide } from "./capture-guide.js";

/** Upload payload schema version id. */
const PAYLOAD_SCHEMA = "cam-i-hear-it/upload@1";

/** Rolling window length (seconds) for live background analysis. */
const LIVE_WINDOW_S = 8;

/** Initial transient skip in seconds before running live analysis. */
const TRANSIENT_SKIP_S = 1.0;

/** Minimum audio required after the initial transient before running analysis. */
const MIN_ANALYSIS_S = 4.0;

/** Maximum clip audio duration kept in ring buffer (seconds). */
const MAX_S = 120;

/** Frequency ticks to label on the Hi-DPI spectrogram vertical axis. */
const FREQ_TICKS = [50, 100, 200, 500, 1000, 2000, 5000];

/** Shorthand document element retriever. */
const $ = (id) => document.getElementById(id);

/** Internal audio & capture state machine. */
const state = {
  ctx: null,
  stream: null,
  track: null,
  node: null,
  analyser: null,
  chunks: [],
  total: 0,
  raf: 0,
  timer: 0,
  sampleRate: 0,
  requestedConstraints: null,
  supportedConstraints: null,
  settings: {},
  features: null,
  startedAt: null,
  currentGuideStep: "step-tailpipe",
  pickerValue: { zone: "TAILPIPE_LEFT", side: "LEFT", tapXY: [0.28, 0.93] },
};

/**
 * Returns audio constraint configuration disabling browser speech filters.
 * @returns {MediaTrackConstraints}
 */
function audioConstraints() {
  return {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  };
}

/**
 * Formats lope score into a qualitative label and returns badge color.
 * @param {number} lope Numeric score 0-100 or NaN.
 * @returns {{ label: string, pct: number }}
 */
function formatLope(lope) {
  if (!Number.isFinite(lope)) return { label: "unknown", pct: 0 };
  const clamped = Math.max(0, Math.min(100, lope));
  let word = "smooth";
  if (clamped >= 65) word = "heavy";
  else if (clamped >= 40) word = "noticeable";
  else if (clamped >= 20) word = "mild";
  return { label: `${word} (${Math.round(clamped)})`, pct: clamped };
}

/**
 * Reads user-specified cylinders from the select box.
 * @returns {number|undefined} Positive integer cylinder count or undefined.
 */
function formCylinders() {
  const v = parseInt($("cylinders").value, 10);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * Returns the recorded audio samples as one contiguous Float32Array.
 * @param {number|null} [seconds=null] Duration to slice from tail, or null for all.
 * @param {number} [skipStartS=0] Duration in seconds to drop from head.
 * @returns {Float32Array}
 */
function samples(seconds = null, skipStartS = 0) {
  const out = new Float32Array(state.total);
  let offset = 0;
  for (const c of state.chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  const skipCount = Math.min(out.length, Math.round(skipStartS * state.sampleRate));
  const valid = skipCount > 0 ? out.subarray(skipCount) : out;

  if (seconds == null) return valid;
  const needCount = Math.min(valid.length, Math.round(seconds * state.sampleRate));
  return valid.subarray(valid.length - needCount);
}

/**
 * Rows shown in the "Mic settings applied" table: key, label, what we request, and how to judge the applied value.
 * `judge` returns "ok" | "warn" | "info".
 */
const MIC_ROWS = [
  { key: "echoCancellation", label: "Echo cancellation", requested: "off", judge: (v) => (v === false ? "ok" : v === true ? "warn" : "unk") },
  { key: "noiseSuppression", label: "Noise suppression", requested: "off", judge: (v) => (v === false ? "ok" : v === true ? "warn" : "unk") },
  { key: "autoGainControl", label: "Auto gain control", requested: "off", judge: (v) => (v === false ? "ok" : v === true ? "warn" : "unk") },
  { key: "channelCount", label: "Channels", requested: "1", judge: (v) => (v === undefined ? "unk" : "info") },
  { key: "sampleRate", label: "Sample rate (Hz)", requested: "native", judge: (v) => (v === undefined ? "unk" : "info") },
  { key: "latency", label: "Latency (s)", requested: "–", judge: (v) => (v === undefined ? "unk" : "info") },
];

/** Status text and CSS class per judgement. */
const MIC_STATUS = {
  ok: ["✓ off", "status-tag status-ok"],
  warn: ["⚠ on", "status-tag status-warn"],
  unk: ["? unknown", "status-tag status-unk"],
  info: ["reported", "status-tag status-ok"],
};

/**
 * Renders the "Mic settings applied" table from `track.getSettings()` and `getSupportedConstraints()`.
 * Uses DOM nodes and textContent only (browser-reported strings are never parsed as HTML).
 */
function updateMicAuditPanel() {
  const tbody = $("micAuditRows");
  if (!state.track) return;
  tbody.textContent = "";
  const td = (text, cls) => { const c = document.createElement("td"); c.textContent = text; if (cls) c.className = cls; return c; };
  const flagged = [];
  for (const row of MIC_ROWS) {
    const actual = state.settings ? state.settings[row.key] : undefined;
    const verdict = row.judge(actual);
    if (verdict === "warn" || verdict === "unk") if (row.requested === "off") flagged.push(`${row.label}: ${verdict === "warn" ? "on" : "unknown"}`);
    const [statusText, statusClass] = MIC_STATUS[verdict];
    const sup = state.supportedConstraints ? state.supportedConstraints[row.key] : undefined;
    const tr = document.createElement("tr");
    const status = document.createElement("td");
    const tag = document.createElement("span"); tag.className = statusClass; tag.textContent = statusText; status.appendChild(tag);
    tr.append(td(row.label), td(row.requested), td(actual === undefined ? "not reported" : String(actual)), status, td(sup === true ? "yes" : sup === false ? "no" : "?"));
    tbody.appendChild(tr);
  }
  const devId = state.settings && state.settings.deviceId ? String(state.settings.deviceId).slice(0, 12) + "…" : "n/a";
  $("micDeviceId").textContent = `Mic: ${state.track.label || "default input"} (deviceId ${devId}); AudioContext rate ${state.sampleRate || "–"} Hz`;
  $("micSummary").textContent = flagged.length
    ? `Heads-up: ${flagged.join(", ")}. Timing features (RPM, lope) are still valid; level/timbre features are less reliable.`
    : "All voice processing reported off.";
}

/**
 * Updates UI readout cards with feature vector values.
 * @param {import("./lib/index.js").FeatureVector} fv
 */
function show(fv) {
  // RPM
  $("rpm").textContent = Number.isFinite(fv.rpm.estimate) ? Math.round(fv.rpm.estimate) : "–";
  $("rpmConf").textContent = Number.isFinite(fv.rpm.firingHz) ? `${fv.rpm.firingHz.toFixed(1)} Hz firing` : "– Hz firing";

  // Cylinders
  const userCyl = formCylinders();
  $("cyl").textContent = fv.rpm.cylindersUsed || "–";
  const confPct = Math.round((fv.rpm.confidence || 0) * 100);
  $("cylBar").style.width = `${userCyl ? 100 : confPct}%`;
  $("cylNote").textContent = userCyl
    ? "(from form)"
    : `Confidence: ${confPct}%${fv.hypotheses && fv.hypotheses.length > 1 ? ` (alt: ${fv.hypotheses[1].cylinders} cyl)` : ""}`;

  // Lope
  const lopeInfo = formatLope(fv.lope.score);
  $("lope").textContent = Number.isFinite(fv.lope.score) ? Math.round(fv.lope.score) : "–";
  $("lopeBar").style.width = `${lopeInfo.pct}%`;
  $("lopeNote").textContent = `${lopeInfo.label} — provisional, uncalibrated`;

  // Warnings: replace completely to prevent stale warnings from persisting
  const warnEl = $("warnings");
  if (fv.warnings && fv.warnings.length) {
    warnEl.textContent = fv.warnings.join(" · ");
  } else {
    warnEl.textContent = "";
  }
}

/**
 * Runs live analysis periodically on trailing window.
 */
function liveAnalyse() {
  const durationS = state.total / state.sampleRate;
  $("time").textContent = `${durationS.toFixed(0)} s`;

  // Require transient skip + minimum analysis length
  if (durationS < TRANSIENT_SKIP_S + MIN_ANALYSIS_S) return;

  const clip = samples(LIVE_WINDOW_S, TRANSIENT_SKIP_S);
  if (clip.length < state.sampleRate * MIN_ANALYSIS_S) return;

  try {
    const fv = analyzeClip(clip, state.sampleRate, { cylinders: formCylinders() });
    show(fv);
  } catch (err) {
    $("warnings").textContent = `Analysis error: ${err.message}`;
  }
}

/**
 * JSON serialization helper mapping non-finite numbers to null.
 * @param {object} obj Object to format.
 * @returns {string} Formatted JSON string.
 */
function toJSON(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v), 2);
}

/**
 * Constructs the final upload payload object.
 * @returns {object}
 */
function buildPayload() {
  const val = (id) => ($(id) ? $(id).value.trim() : "");
  return {
    schema: PAYLOAD_SCHEMA,
    featureSchema: FEATURE_SCHEMA,
    createdAt: new Date().toISOString(),
    recordingStartedAt: state.startedAt,
    vehicle: {
      make: val("make"),
      model: val("model"),
      year: parseInt(val("year"), 10) || null,
      engine: val("engine"),
      cylinders: formCylinders() ?? null,
      mods: val("mods") || null,
    },
    capture: {
      guideStep: state.currentGuideStep,
      rhd: $("rhd").checked,
      position: {
        zone: state.pickerValue.zone,
        side: state.pickerValue.side,
        tapXY: state.pickerValue.tapXY,
        distanceBand: val("distanceBand"),
        heightBand: val("heightBand"),
        hood: val("hood"),
        phoneOrientation: val("phoneOrientation"),
        notes: val("positionNotes") || null,
      },
      engineTemp: val("engineTemp"),
      durationS: state.sampleRate ? state.total / state.sampleRate : 0,
    },
    device: {
      userAgent: navigator.userAgent,
      sampleRate: state.sampleRate,
      requestedConstraints: state.requestedConstraints,
      // deviceId/groupId are per-device identifiers; drop them from the payload (privacy), keep the DSP settings.
      trackSettings: state.settings ? Object.fromEntries(Object.entries(state.settings).filter(([k]) => k !== "deviceId" && k !== "groupId")) : null,
      supportedConstraints: state.supportedConstraints,
    },
    features: state.features,
  };
}

/**
 * Refreshes payload display and upload button enabled state.
 */
function refreshPayload() {
  if (state.features) {
    $("payload").textContent = toJSON(buildPayload());
  }
  const url = $("postUrl").value.trim();
  const validUrl = /^https?:\/\//i.test(url);
  $("post").disabled = !(state.features && $("postEnable").checked && validUrl);
}

/**
 * Initiates browser file download for a Blob.
 * @param {Blob} blob Data blob.
 * @param {string} filename Output file name.
 */
function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Encodes Float32Array PCM samples into standard 16-bit WAV Blob.
 * @param {Float32Array} x Samples.
 * @param {number} sr Sample rate.
 * @returns {Blob}
 */
function encodeWav(x, sr) {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const view = new DataView(buf);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + x.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) {
    const s = Math.max(-1, Math.min(1, x[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * POSTs payload JSON features only to the user-entered URL. Audio is never sent.
 */
async function postPayload() {
  const url = $("postUrl").value.trim();
  if (!$("postEnable").checked || !url) return;
  const statusEl = $("postStatus");
  statusEl.textContent = "sending…";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: toJSON(buildPayload()),
    });
    statusEl.textContent = `HTTP ${res.status}`;
  } catch (err) {
    statusEl.textContent = `failed: ${err.message}`;
  }
}

/**
 * Hi-DPI scrolling spectrogram loop with frequency axis labels.
 */
function drawSpectrogram() {
  const canvas = $("spec");
  const ctx = canvas.getContext("2d");

  // Hi-DPI canvas backing store scaling
  const dpr = window.devicePixelRatio || 1;
  const displayW = canvas.clientWidth || 900;
  const displayH = 220;

  if (canvas.width !== Math.round(displayW * dpr) || canvas.height !== Math.round(displayH * dpr)) {
    canvas.width = Math.round(displayW * dpr);
    canvas.height = Math.round(displayH * dpr);
  }

  const w = canvas.width;
  const h = canvas.height;
  const fftBins = new Float32Array(state.analyser.frequencyBinCount);
  const df = state.sampleRate / state.analyser.fftSize;
  const fLo = 20;
  const fHi = Math.min(8000, state.sampleRate / 2);

  // Axis margins
  const axisW = Math.round(44 * dpr);
  const plotW = w - axisW;

  const renderFrame = () => {
    state.analyser.getFloatFrequencyData(fftBins);

    // Scroll spectrogram display left by 2px inside plot area
    ctx.drawImage(canvas, axisW + 2, 0, plotW - 2, h, axisW, 0, plotW - 2, h);

    // Render new spectrum column at the right edge
    for (let y = 0; y < h; y++) {
      const f = fLo * Math.pow(fHi / fLo, 1 - y / (h - 1));
      const binIdx = Math.min(fftBins.length - 1, Math.round(f / df));
      const db = fftBins[binIdx];
      const norm = Math.max(0, Math.min(1, (db + 110) / 80));
      ctx.fillStyle = `hsl(${240 - 240 * norm}, 100%, ${10 + 55 * norm}%)`;
      ctx.fillRect(w - 2, y, 2, 1);
    }

    // Overlay frequency scale on the left axis bar
    ctx.fillStyle = "#090d12";
    ctx.fillRect(0, 0, axisW, h);
    ctx.strokeStyle = "#27313f";
    ctx.beginPath();
    ctx.moveTo(axisW, 0);
    ctx.lineTo(axisW, h);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = `${Math.round(9 * dpr)}px system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (const freq of FREQ_TICKS) {
      if (freq < fLo || freq > fHi) continue;
      const y = (1 - Math.log(freq / fLo) / Math.log(fHi / fLo)) * (h - 1);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
      ctx.beginPath();
      ctx.moveTo(axisW - 4, y);
      ctx.lineTo(axisW, y);
      ctx.stroke();

      const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
      ctx.fillText(label, axisW - 6, y);
    }

    state.raf = requestAnimationFrame(renderFrame);
  };

  renderFrame();
}

/**
 * Opens microphone stream, wires worklet recorder and analyser, and starts capture.
 */
async function startCapture() {
  $("warnings").textContent = "";
  state.requestedConstraints = audioConstraints();
  state.supportedConstraints = navigator.mediaDevices.getSupportedConstraints
    ? navigator.mediaDevices.getSupportedConstraints()
    : null;

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: state.requestedConstraints,
      video: false,
    });
  } catch (err) {
    $("warnings").textContent = `Microphone permission denied or unavailable: ${err.message}`;
    return;
  }

  state.track = state.stream.getAudioTracks()[0];
  try {
    await state.track.applyConstraints(state.requestedConstraints);
  } catch (_) {
    /* Safari may reject applyConstraints; proceed */
  }

  state.settings = state.track.getSettings ? state.track.getSettings() : {};
  updateMicAuditPanel();

  state.ctx = new (window.AudioContext || window.webkitAudioContext)();
  // iOS Safari can create the context "suspended" because the user gesture has expired after the getUserMedia await.
  if (state.ctx.state === "suspended") {
    try { await state.ctx.resume(); } catch (_) { /* reported below if no audio arrives */ }
  }
  try {
    await state.ctx.audioWorklet.addModule("recorder-worklet.js");
  } catch (err) {
    $("warnings").textContent = `AudioWorklet failed to load: ${err.message}`;
    state.stream.getTracks().forEach((t) => t.stop());
    state.ctx.close();
    return;
  }

  const source = state.ctx.createMediaStreamSource(state.stream);
  state.node = new AudioWorkletNode(state.ctx, "recorder");
  state.analyser = state.ctx.createAnalyser();
  state.analyser.fftSize = 8192;
  state.analyser.smoothingTimeConstant = 0;

  source.connect(state.analyser);
  source.connect(state.node);

  // Mute audio path to speakers while keeping node awake
  const muteGain = state.ctx.createGain();
  muteGain.gain.value = 0;
  state.node.connect(muteGain).connect(state.ctx.destination);

  state.sampleRate = state.ctx.sampleRate;
  state.chunks = [];
  state.total = 0;
  state.features = null;
  state.startedAt = new Date().toISOString();

  state.node.port.onmessage = (ev) => {
    state.chunks.push(ev.data);
    state.total += ev.data.length;
    while (state.total > MAX_S * state.sampleRate) {
      state.total -= state.chunks.shift().length;
    }
  };

  $("sr").textContent = `Audio rate: ${state.sampleRate} Hz`;
  updateMicAuditPanel();
  $("micAudit").open = true;

  $("start").disabled = true;
  $("stop").disabled = false;
  $("dlJson").disabled = true;
  $("dlWav").disabled = true;

  drawSpectrogram();
  state.timer = setInterval(liveAnalyse, 2000);
}

/**
 * Stops microphone capture, runs final clip analysis, and enables export.
 */
function stopCapture() {
  clearInterval(state.timer);
  cancelAnimationFrame(state.raf);

  if (state.node && state.node.port) {
    state.node.port.onmessage = null;
  }
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
  }
  if (state.ctx) {
    state.ctx.close();
  }

  $("start").disabled = false;
  $("stop").disabled = true;

  const totalS = state.total / state.sampleRate;
  if (totalS < TRANSIENT_SKIP_S + MIN_ANALYSIS_S) {
    $("warnings").textContent = "Recording too short (need at least 5 s of audio).";
    return;
  }

  // Final pass on full clip dropping startup transient
  try {
    const clip = samples(null, TRANSIENT_SKIP_S);
    state.features = analyzeClip(clip, state.sampleRate, { cylinders: formCylinders() });
    show(state.features);
    refreshPayload();
    $("dlJson").disabled = false;
    $("dlWav").disabled = false;
  } catch (err) {
    $("warnings").textContent = `Final analysis error: ${err.message}`;
  }
}

// Initialise Submodules: Vehicle Outline Picker & Capture Guide
const picker = createVehiclePicker($("vehiclePicker"), {
  onChange(val) {
    state.pickerValue = val;
    $("zone").value = val.zone;
    refreshPayload();
  },
});

state.pickerValue = picker.getValue();

createCaptureGuide($("captureGuide"), {
  onStep(step) {
    state.currentGuideStep = step.id;
    if (step.preset) {
      if (step.preset.zone) {
        picker.setZone(step.preset.zone);
        $("zone").value = step.preset.zone;
        state.pickerValue = picker.getValue();
      }
      if (step.preset.distanceBand) $("distanceBand").value = step.preset.distanceBand;
      if (step.preset.heightBand) $("heightBand").value = step.preset.heightBand;
      if (step.preset.hood) $("hood").value = step.preset.hood;
      if (step.preset.phoneOrientation) $("phoneOrientation").value = step.preset.phoneOrientation;
      if (step.preset.engineTemp) $("engineTemp").value = step.preset.engineTemp;
    }
    refreshPayload();
  },
});

// Sync RHD checkbox with vehicle picker
$("rhd").addEventListener("change", (e) => {
  picker.setRhd(e.target.checked);
  refreshPayload();
});

// Hidden zone select fallback sync
$("zone").addEventListener("change", (e) => {
  picker.setZone(e.target.value);
  state.pickerValue = picker.getValue();
  refreshPayload();
});

// Bind recording and download actions
$("start").onclick = startCapture;
$("stop").onclick = stopCapture;
$("dlJson").onclick = () => {
  download(new Blob([toJSON(buildPayload())], { type: "application/json" }), `cam-i-hear-it-${Date.now()}.json`);
};
$("dlWav").onclick = () => {
  download(encodeWav(samples(), state.sampleRate), `cam-i-hear-it-${Date.now()}.wav`);
};
$("post").onclick = postPayload;

// Bind inputs for live payload updates
const formIds = [
  "postUrl",
  "postEnable",
  "make",
  "model",
  "year",
  "engine",
  "cylinders",
  "mods",
  "distanceBand",
  "heightBand",
  "hood",
  "phoneOrientation",
  "engineTemp",
  "positionNotes",
];

formIds.forEach((id) => {
  const el = $(id);
  if (el) {
    el.addEventListener("input", refreshPayload);
    el.addEventListener("change", refreshPayload);
  }
});

// Prefill backend submission URL from query parameter if present
const urlParam = new URLSearchParams(window.location.search).get("post");
if (urlParam) {
  $("postUrl").value = urlParam;
}

refreshPayload();
