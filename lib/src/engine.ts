/**
 * @file engine.ts
 * @summary Four-stroke engine math and joint (cylinder count, RPM) hypothesis scoring from a spectrum.
 *
 * Physics (docs/RESEARCH_ACOUSTICS.md §1): f_fire = RPM/60 * N/2. Cylinder-to-cylinder differences repeat
 * every 720 deg, so they appear at multiples of the cycle rate RPM/120 ("half orders"). Firing frequency alone
 * is ambiguous (I4@1500 = I6@1000 = V8@750), so we score hypotheses with firing harmonics, cycle-rate
 * evidence, penalties for unexplained sub-harmonics, and an idle-RPM prior.
 */
import { Spectrum, peakSnrDb, peakFrequency } from "./spectrum.js";

/**
 * Converts a firing frequency to crank RPM for a four-stroke engine.
 * @param firingHz Firing (combustion event) frequency in Hz.
 * @param cylinders Number of cylinders (all firing once per 720 deg).
 * @returns RPM = firingHz * 120 / cylinders.
 */
export function rpmFromFiring(firingHz: number, cylinders: number): number {
  if (!(cylinders > 0)) throw new Error("rpmFromFiring: cylinders must be > 0");
  return (firingHz * 120) / cylinders;
}

/**
 * Converts crank RPM to firing frequency for a four-stroke engine.
 * @param rpm Crank speed.
 * @param cylinders Number of cylinders.
 */
export function firingFromRpm(rpm: number, cylinders: number): number {
  return (rpm * cylinders) / 120;
}

/** Frequency (Hz) of engine order `order` at a given RPM (order 1 = crank rate). */
export function orderHz(order: number, rpm: number): number {
  return (order * rpm) / 60;
}

/** One scored (cylinders, RPM) hypothesis. */
export interface CylinderHypothesis {
  /** Cylinder count. */
  cylinders: number;
  /** Best RPM for this cylinder count. */
  rpm: number;
  /** Firing frequency (Hz) at that RPM. */
  firingHz: number;
  /** Combined score (higher is better; dB-like units). */
  score: number;
  /** Softmax probability across the returned hypotheses. */
  prob: number;
  /** Score components for transparency/debugging. */
  parts: { firing: number; cycle: number; unexplained: number; offHarmonic: number; prior: number };
}

/** Options for {@link scoreCylinderHypotheses}. */
export interface HypothesisOptions {
  /** Candidate cylinder counts (default 3,4,5,6,8,10,12). Pass one value to force it. */
  cylinders?: number[];
  /** RPM search range (default 400..1600). */
  rpmMin?: number;
  rpmMax?: number;
  /** RPM grid step (default 2). */
  rpmStep?: number;
  /** Highest frequency used for evidence (Hz, default min(500, Nyquist*0.9)). */
  fMaxHz?: number;
  /** Idle-RPM prior centre (default 750) and log-sd (default 0.35). */
  priorRpm?: number;
  priorLogSd?: number;
  /** Weights (defaults tuned on synthetic tests; to be re-fit on real labelled clips). */
  weights?: { cycle?: number; unexplained?: number; offHarmonic?: number; prior?: number };
  /** Softmax temperature in score units (default 1.5). */
  temperature?: number;
}

function gcd(a: number, b: number): number { while (b) { const t = b; b = a % b; a = t; } return a; }

function meanSnr(spec: Spectrum, freqs: number[]): number {
  if (!freqs.length) return 0;
  let s = 0;
  for (const f of freqs) s += peakSnrDb(spec, f, Math.max(1.5 * spec.df, f * 0.004));
  return s / freqs.length;
}

/** Scores one (N, rpm) pair. Exported for tests and diagnostics. */
export function scorePair(spec: Spectrum, N: number, rpm: number, o: Required<Omit<HypothesisOptions, "cylinders" | "weights">> & { weights: Required<NonNullable<HypothesisOptions["weights"]>> }): CylinderHypothesis {
  const fc = rpm / 120;
  const ff = N * fc;
  const fMax = o.fMaxHz;
  const firing: number[] = [], cycle: number[] = [], half: number[] = [], off: number[] = [];
  for (let h = 1; h * ff <= fMax; h++) { firing.push(h * ff); if ((h + 0.5) * ff <= fMax) off.push((h - 0.5) * ff); }
  const kMax = Math.min(Math.floor(fMax / fc), 4 * N);
  for (let k = 1; k <= kMax; k++) if (gcd(k, N) === 1) cycle.push(k * fc);
  for (let k = 1; k <= 2 * kMax; k += 2) if ((k * fc) / 2 <= fMax) half.push((k * fc) / 2);
  const A = meanSnr(spec, firing);
  const S = meanSnr(spec, cycle);
  const U = meanSnr(spec, half);
  const O = meanSnr(spec, off);
  const z = Math.log(rpm / o.priorRpm) / o.priorLogSd;
  const P = -0.5 * z * z;
  const w = o.weights;
  const score = A + w.cycle * S - w.unexplained * U - w.offHarmonic * O + w.prior * P;
  return { cylinders: N, rpm, firingHz: ff, score, prob: 0, parts: { firing: A, cycle: S, unexplained: U, offHarmonic: O, prior: P } };
}

/**
 * Searches (cylinders, RPM) jointly and returns the best RPM per cylinder count, ranked, with softmax probabilities.
 * The winner's RPM is refined from measured harmonic peak locations.
 * @param spec Power spectrum of the idle clip (resolution ideally <= 0.5 Hz).
 * @param opts See {@link HypothesisOptions}.
 */
export function scoreCylinderHypotheses(spec: Spectrum, opts: HypothesisOptions = {}): CylinderHypothesis[] {
  const o = {
    rpmMin: opts.rpmMin ?? 400,
    rpmMax: opts.rpmMax ?? 1600,
    rpmStep: opts.rpmStep ?? 2,
    fMaxHz: opts.fMaxHz ?? Math.min(500, spec.sampleRate * 0.45),
    priorRpm: opts.priorRpm ?? 750,
    priorLogSd: opts.priorLogSd ?? 0.35,
    temperature: opts.temperature ?? 1.5,
    weights: {
      cycle: opts.weights?.cycle ?? 0.5,
      unexplained: opts.weights?.unexplained ?? 0.8,
      offHarmonic: opts.weights?.offHarmonic ?? 0.6,
      prior: opts.weights?.prior ?? 2.0,
    },
  };
  const cyls = opts.cylinders ?? [3, 4, 5, 6, 8, 10, 12];
  const out: CylinderHypothesis[] = [];
  for (const N of cyls) {
    let best: CylinderHypothesis | null = null;
    for (let rpm = o.rpmMin; rpm <= o.rpmMax; rpm += o.rpmStep) {
      const h = scorePair(spec, N, rpm, o);
      if (!best || h.score > best.score) best = h;
    }
    if (best) {
      // local fine search
      for (let rpm = best.rpm - o.rpmStep; rpm <= best.rpm + o.rpmStep; rpm += o.rpmStep / 8) {
        const h = scorePair(spec, N, rpm, o);
        if (h.score > best.score) best = h;
      }
      const ref = refineFiring(spec, best.firingHz, o.fMaxHz);
      if (Number.isFinite(ref)) { best.firingHz = ref; best.rpm = rpmFromFiring(ref, N); }
      out.push(best);
    }
  }
  out.sort((a, b) => b.score - a.score);
  const mx = out.length ? out[0].score : 0;
  let z = 0;
  for (const h of out) { h.prob = Math.exp((h.score - mx) / o.temperature); z += h.prob; }
  for (const h of out) h.prob /= z || 1;
  return out;
}

/**
 * Refines a firing frequency from the measured locations of its harmonics (SNR-weighted mean of f_h / h).
 * @param spec Spectrum.
 * @param ff Approximate firing frequency (Hz).
 * @param fMax Highest harmonic frequency to use.
 */
export function refineFiring(spec: Spectrum, ff: number, fMax: number): number {
  let num = 0, den = 0;
  for (let h = 1; h * ff <= fMax; h++) {
    const fh = h * ff;
    const tol = Math.max(2 * spec.df, fh * 0.01);
    const pk = peakFrequency(spec, fh - tol, fh + tol);
    if (!Number.isFinite(pk)) continue;
    const w = peakSnrDb(spec, pk, spec.df);
    if (w < 6) continue;
    num += w * (pk / h);
    den += w;
  }
  return den > 0 ? num / den : NaN;
}
