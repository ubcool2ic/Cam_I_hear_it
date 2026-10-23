/**
 * @file web/app.js
 * @summary Cam_I_hear_it capture page logic. Handles mic capture with browser processing disabled, a live log-frequency
 * spectrogram, rolling RPM/lope analysis with the DSP lib, payload assembly, and download plus opt-in POST.
 *
 * Safari note (docs/RESEARCH_ACOUSTICS.md §7): iOS Safari may ignore autoGainControl/noiseSuppression, so the
 * actual track settings are recorded in every payload.
 */
import { analyzeClip, FEATURE_SCHEMA } from "./lib/index.js";

/** Upload payload schema id (see docs/ML_BACKEND.md). */
const PAYLOAD_SCHEMA = "cam-i-hear-it/upload@1";
/** Seconds of audio used for each live analysis pass. */
const LIVE_WINDOW_S = 8;
/** Max recording length kept in memory (s). */
const MAX_S = 120;

const $ = (id) => document.getElementById(id);
const state = { ctx: null, stream: null, track: null, node: null, analyser: null, chunks: [], total: 0, raf: 0, timer: 0, sampleRate: 0, settings: null, features: null, startedAt: null };

/** Builds the getUserMedia audio constraints with all voice processing disabled. */
function audioConstraints() {
  return { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
}

/** Starts recording: opens the mic, wires the worklet and analyser, and starts the UI loops. */
async function start() {
  $("warnings").textContent = "";
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: false });
  } catch (e) {
    $("warnings").textContent = "Microphone permission denied or unavailable: " + e.message;
    return;
  }
  state.track = state.stream.getAudioTracks()[0];
  // Re-apply; some WebKit versions only honour constraints via applyConstraints (WebKit bug 179411).
  try { await state.track.applyConstraints(audioConstraints()); } catch (_) { /* ignore */ }
  state.settings = state.track.getSettings ? state.track.getSettings() : {};
  state.ctx = new (window.AudioContext || window.webkitAudioContext)();
  await state.ctx.audioWorklet.addModule("recorder-worklet.js");
  const src = state.ctx.createMediaStreamSource(state.stream);
  state.node = new AudioWorkletNode(state.ctx, "recorder");
  state.analyser = state.ctx.createAnalyser();
  state.analyser.fftSize = 8192;
  state.analyser.smoothingTimeConstant = 0;
  src.connect(state.analyser);
  src.connect(state.node);
  // Keep the worklet pulled without audible output.
  const mute = state.ctx.createGain(); mute.gain.value = 0;
  state.node.connect(mute).connect(state.ctx.destination);
  state.sampleRate = state.ctx.sampleRate;
  state.chunks = []; state.total = 0; state.features = null; state.startedAt = new Date().toISOString();
  state.node.port.onmessage = (ev) => {
    state.chunks.push(ev.data); state.total += ev.data.length;
    while (state.total > MAX_S * state.sampleRate) state.total -= state.chunks.shift().length;
  };
  $("sr").textContent = ` ${state.sampleRate} Hz`;
  const processingOn = ["echoCancellation", "noiseSuppression", "autoGainControl"].filter((k) => state.settings[k] === true || state.settings[k] === undefined);
  if (processingOn.length) $("warnings").textContent = `Browser reports these may still be active or unknown: ${processingOn.join(", ")}. Timing features are still valid; level features are less reliable.`;
  $("start").disabled = true; $("stop").disabled = false; $("dlJson").disabled = true; $("dlWav").disabled = true;
  drawLoop();
  state.timer = setInterval(liveAnalyse, 2000);
}

/** Returns the last `seconds` of recorded audio (or all of it if null) as one Float32Array. */
function samples(seconds = null) {
  const out = new Float32Array(state.total);
  let o = 0;
  for (const c of state.chunks) { out.set(c, o); o += c.length; }
  if (seconds == null) return out;
  const n = Math.min(out.length, Math.round(seconds * state.sampleRate));
  return out.subarray(out.length - n);
}

/** Reads the cylinder count from the form (undefined if auto). */
function formCylinders() {
  const v = parseInt($("cylinders").value, 10);
  return Number.isFinite(v) ? v : undefined;
}

/** Runs analysis on the latest window and updates the readout. */
function liveAnalyse() {
  $("time").textContent = `${(state.total / state.sampleRate).toFixed(0)} s`;
  if (state.total < state.sampleRate * 4) return;
  const fv = analyzeClip(samples(LIVE_WINDOW_S), state.sampleRate, { cylinders: formCylinders() });
  show(fv);
}

/** Renders a feature vector into the readout cards. */
function show(fv) {
  $("rpm").textContent = Number.isFinite(fv.rpm.estimate) ? Math.round(fv.rpm.estimate) : "–";
  $("rpmConf").textContent = ` firing ${fv.rpm.firingHz.toFixed(1)} Hz`;
  $("cyl").textContent = fv.rpm.cylindersUsed;
  $("cylNote").textContent = formCylinders() ? " (from form)" : ` p=${fv.rpm.confidence.toFixed(2)}`;
  $("lope").textContent = Number.isFinite(fv.lope.score) ? Math.round(fv.lope.score) : "–";
  if (fv.warnings.length) $("warnings").textContent = fv.warnings.join(" · ");
}

/** Stops recording, analyses the whole clip, and builds the payload. */
function stop() {
  clearInterval(state.timer); cancelAnimationFrame(state.raf);
  state.node.port.onmessage = null;
  state.stream.getTracks().forEach((t) => t.stop());
  state.ctx.close();
  $("start").disabled = false; $("stop").disabled = true;
  if (state.total < state.sampleRate * 4) { $("warnings").textContent = "Clip too short (need at least 4 s)."; return; }
  state.features = analyzeClip(samples(), state.sampleRate, { cylinders: formCylinders() });
  show(state.features);
  refreshPayload();
  $("dlJson").disabled = false; $("dlWav").disabled = false;
}

/** Assembles the upload payload: vehicle, capture, device, and features. */
function buildPayload() {
  const val = (id) => $(id).value.trim();
  return {
    schema: PAYLOAD_SCHEMA,
    featureSchema: FEATURE_SCHEMA,
    createdAt: new Date().toISOString(),
    recordingStartedAt: state.startedAt,
    vehicle: { make: val("make"), model: val("model"), year: parseInt(val("year"), 10) || null, engine: val("engine"), cylinders: formCylinders() ?? null, mods: val("mods") || null },
    capture: {
      position: { zone: val("zone"), distanceBand: val("distanceBand"), heightBand: val("heightBand"), hood: val("hood"), phoneOrientation: val("phoneOrientation") },
      engineTemp: val("engineTemp"),
      durationS: state.total / state.sampleRate,
    },
    device: {
      userAgent: navigator.userAgent,
      sampleRate: state.sampleRate,
      trackSettings: state.settings,
      supportedConstraints: navigator.mediaDevices.getSupportedConstraints ? navigator.mediaDevices.getSupportedConstraints() : null,
    },
    features: state.features,
  };
}

/** JSON-stringifies with NaN/Infinity mapped to null. */
function toJSON(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v), 2);
}

/** Re-renders the payload preview and the POST button state. */
function refreshPayload() {
  if (state.features) $("payload").textContent = toJSON(buildPayload());
  const url = $("postUrl").value.trim();
  $("post").disabled = !(state.features && url && $("postEnable").checked && /^https?:\/\//.test(url));
}

/** Triggers a browser download of a Blob. */
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Encodes mono float samples as 16-bit PCM WAV. */
function wav(x, sr) {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + x.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 0x7fff, true);
  return new Blob([buf], { type: "audio/wav" });
}

/** POSTs the payload to the configured URL. Only runs when explicitly enabled by the user. */
async function post() {
  const url = $("postUrl").value.trim();
  if (!$("postEnable").checked || !url) return;
  $("postStatus").textContent = "sending…";
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: toJSON(buildPayload()) });
    $("postStatus").textContent = `HTTP ${r.status}`;
  } catch (e) { $("postStatus").textContent = "failed: " + e.message; }
}

/** Scrolling log-frequency spectrogram (20 Hz – 8 kHz) from the AnalyserNode. */
function drawLoop() {
  const cv = $("spec"), g = cv.getContext("2d");
  const bins = new Float32Array(state.analyser.frequencyBinCount);
  const df = state.sampleRate / state.analyser.fftSize;
  const fLo = 20, fHi = Math.min(8000, state.sampleRate / 2);
  const step = () => {
    state.analyser.getFloatFrequencyData(bins);
    g.drawImage(cv, -2, 0);
    for (let y = 0; y < cv.height; y++) {
      const f = fLo * Math.pow(fHi / fLo, 1 - y / (cv.height - 1));
      const db = bins[Math.min(bins.length - 1, Math.round(f / df))];
      const t = Math.max(0, Math.min(1, (db + 110) / 80));
      g.fillStyle = `hsl(${240 - 240 * t},100%,${10 + 50 * t}%)`;
      g.fillRect(cv.width - 2, y, 2, 1);
    }
    state.raf = requestAnimationFrame(step);
  };
  step();
}

// Wire up controls.
$("start").onclick = start;
$("stop").onclick = stop;
$("dlJson").onclick = () => download(new Blob([toJSON(buildPayload())], { type: "application/json" }), `cam-i-hear-it-${Date.now()}.json`);
$("dlWav").onclick = () => download(wav(samples(), state.sampleRate), `cam-i-hear-it-${Date.now()}.wav`);
$("post").onclick = post;
for (const id of ["postUrl", "postEnable", "make", "model", "year", "engine", "cylinders", "mods", "zone", "distanceBand", "heightBand", "hood", "phoneOrientation", "engineTemp"]) {
  $(id).addEventListener("input", refreshPayload); $(id).addEventListener("change", refreshPayload);
}
// Optional ?post=URL pre-fills the backend URL (upload still needs the checkbox).
const qp = new URLSearchParams(location.search).get("post");
if (qp) $("postUrl").value = qp;
