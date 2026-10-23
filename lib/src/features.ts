/**
 * @file features.ts
 * @summary One-call clip analysis producing a JSON-serialisable feature vector for the ML backend.
 *
 * Schema id: "cam-i-hear-it/features@1" (backend design is parked on branch parked/early-code). Bump the version on breaking changes.
 */
import { decimate } from "./window.js";
import { welch } from "./spectrum.js";
import { hpsF0, cepstrumF0, autocorrF0, F0Estimate } from "./pitch.js";
import { scoreCylinderHypotheses, CylinderHypothesis } from "./engine.js";
import { detectPulses, lopeScore, LopeResult } from "./lope.js";
import { bandEnergies, spectralCentroid, spectralFlatness, orderEnergies, BandEnergy, OrderEnergy } from "./bands.js";

/** Schema identifier written into every feature vector. */
export const FEATURE_SCHEMA = "cam-i-hear-it/features@1";

/** A run of digital silence (exact zeros) inside a clip, in samples. */
export interface Dropout { start: number; length: number }

/**
 * Finds dropouts: runs of exact-zero samples at least `minMs` long. A live mic never produces many consecutive exact
 * zeros, but an audio-thread underrun does (seen in headless Chrome under load, and possible on phones). Even a 10 ms
 * gap adds a sharp edge that the envelope reads as extra pulses. That shifts the cylinder slotting for the rest of the
 * clip and can inflate lope from ~14 to ~30, or to 100 on a short window.
 * @param samples Mono PCM.
 * @param sampleRate Sample rate (Hz).
 * @param minMs Minimum run length to count (default 2 ms).
 */
export function findDropouts(samples: ArrayLike<number>, sampleRate: number, minMs = 2): Dropout[] {
  const min = Math.max(2, Math.round((minMs / 1000) * sampleRate));
  const out: Dropout[] = [];
  let run = 0;
  for (let i = 0; i <= samples.length; i++) {
    if (i < samples.length && samples[i] === 0) run++;
    else {
      if (run >= min) out.push({ start: i - run, length: run });
      run = 0;
    }
  }
  return out;
}

/** Returns [start, end) of the longest stretch of `n` samples that avoids every dropout (each padded by `pad`). */
function longestCleanSpan(n: number, drops: Dropout[], pad: number): [number, number] {
  let best: [number, number] = [0, 0], from = 0;
  for (const d of [...drops, { start: n + pad, length: 0 }]) {
    const to = Math.max(from, Math.min(n, d.start - pad));
    if (to - from > best[1] - best[0]) best = [from, to];
    from = Math.min(n, d.start + d.length + pad);
  }
  return best;
}

/** Options for {@link analyzeClip}. */
export interface AnalyzeOptions {
  /** Known cylinder count from the vehicle form (overrides the search). */
  cylinders?: number;
  /** Pulses per cycle for lope slotting (defaults to cylinders; inferred if unknown). */
  eventsPerCycle?: number;
  /** Target low-band analysis rate in Hz (default ~2000). */
  analysisRate?: number;
  /** RPM search range. */
  rpmMin?: number;
  rpmMax?: number;
}

/** The exported feature vector. */
export interface FeatureVector {
  schema: string;
  sampleRate: number;
  analysisRate: number;
  durationS: number;
  rpm: { estimate: number; firingHz: number; cylindersUsed: number; confidence: number; fromPulses: number };
  hypotheses: Array<Pick<CylinderHypothesis, "cylinders" | "rpm" | "firingHz" | "score" | "prob">>;
  f0: { hps: F0Estimate; cepstrum: F0Estimate; autocorr: F0Estimate };
  lope: LopeResult;
  orders: OrderEnergy[];
  bands: BandEnergy[];
  spectral: { centroidHz: number; flatness: number };
  /** Dropouts (exact-zero runs >= 2 ms) found in the clip, in samples. */
  dropouts: Dropout[];
  warnings: string[];
}

/**
 * Analyses an idle recording and returns the feature vector.
 * @param samples Mono PCM (any scale), ideally >= 8 s.
 * @param sampleRate Sample rate (Hz).
 * @param opts See {@link AnalyzeOptions}.
 */
export function analyzeClip(samples: ArrayLike<number>, sampleRate: number, opts: AnalyzeOptions = {}): FeatureVector {
  const warnings: string[] = [];
  const durationS = samples.length / sampleRate;
  if (durationS < 4) warnings.push("clip shorter than 4 s: RPM/lope unreliable");
  const factor = Math.max(1, Math.floor(sampleRate / (opts.analysisRate ?? 2000)));
  const low = decimate(samples, factor);
  const ar = sampleRate / factor;
  // Dropouts: lope needs an unbroken pulse train, so it runs on the longest dropout-free stretch. Leading/trailing silence
  // (mic start-up, stop) is trimmed quietly; interior dropouts get a warning.
  const drops = findDropouts(samples, sampleRate);
  const interior = drops.filter((d) => d.start > 0 && d.start + d.length < samples.length);
  const pad = Math.round(0.05 * sampleRate); // keep 50 ms clear of each gap edge (filter/envelope settling)
  const [c0, c1] = drops.length ? longestCleanSpan(samples.length, drops, pad) : [0, samples.length];
  const lowClean = drops.length ? low.subarray(Math.ceil(c0 / factor), Math.floor(c1 / factor)) : low;
  const cleanS = (c1 - c0) / sampleRate;
  if (interior.length) {
    const ms = Math.round((interior.reduce((a, d) => a + d.length, 0) / sampleRate) * 1000);
    const where = cleanS >= 3 ? `: lope measured on the longest clean ${cleanS.toFixed(1)} s` : "";
    warnings.push(`audio dropout detected (${interior.length} gap${interior.length > 1 ? "s" : ""}, ${ms} ms)${where}`);
  }
  if (drops.length && cleanS < 3) warnings.push("less than 3 s of gap-free audio: lope not measured");
  // The spectrum also degrades when a gap sits inside a short window, so use the clean stretch when it is long enough.
  const specLow = drops.length && cleanS >= 4 ? lowClean : low;
  // ~0.25 Hz resolution if the clip allows, else whatever fits.
  let seg = 1;
  while (seg * 2 <= specLow.length && seg < Math.round(ar * 4)) seg *= 2;
  const lowSpec = welch(specLow, ar, seg);
  const hyps = scoreCylinderHypotheses(lowSpec, {
    cylinders: opts.cylinders ? [opts.cylinders] : undefined,
    rpmMin: opts.rpmMin, rpmMax: opts.rpmMax,
  });
  const best = hyps[0];
  const fMaxF0 = 300;
  const f0 = {
    hps: hpsF0(lowSpec, 15, fMaxF0, 5),
    cepstrum: cepstrumF0(lowSpec, 15, fMaxF0),
    autocorr: autocorrF0(specLow.subarray(0, Math.min(specLow.length, Math.round(ar * 2))), ar, 15, fMaxF0),
  };
  const pulses = detectPulses(lowClean, ar, best.firingHz);
  const lopeRaw = lopeScore(pulses, best.rpm / 120, opts.eventsPerCycle ?? opts.cylinders ?? best.cylinders);
  const lope: LopeResult = drops.length && cleanS < 3
    ? { ...lopeRaw, score: NaN, intervalCov: NaN, cycleCov: NaN, ampCov: NaN, rpmFromPulses: NaN }
    : lopeRaw;
  if (Number.isFinite(lope.rpmFromPulses) && Math.abs(lope.rpmFromPulses - best.rpm) / best.rpm > 0.05)
    warnings.push("pulse-timing RPM disagrees with spectral RPM by >5%: pulse detection may be unreliable");
  if (!opts.cylinders && best.prob < 0.6) warnings.push("cylinder count ambiguous: enter cylinders in the form");
  const fullSpec = welch(samples, sampleRate, Math.min(4096, 1 << Math.floor(Math.log2(Math.max(2, samples.length)))));
  return {
    schema: FEATURE_SCHEMA,
    sampleRate,
    analysisRate: ar,
    durationS,
    rpm: { estimate: best.rpm, firingHz: best.firingHz, cylindersUsed: best.cylinders, confidence: best.prob, fromPulses: lope.rpmFromPulses },
    hypotheses: hyps.map(({ cylinders, rpm, firingHz, score, prob }) => ({ cylinders, rpm, firingHz, score, prob })),
    f0,
    lope,
    orders: orderEnergies(lowSpec, best.rpm, best.cylinders),
    bands: bandEnergies(fullSpec),
    spectral: { centroidHz: spectralCentroid(fullSpec), flatness: spectralFlatness(fullSpec) },
    dropouts: drops,
    warnings,
  };
}

/** Serialises a feature vector (NaN -> null) for transport. */
export function featuresToJSON(fv: FeatureVector, space = 0): string {
  return JSON.stringify(fv, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v), space);
}
