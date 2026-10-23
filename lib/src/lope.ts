/**
 * @file lope.ts
 * @summary Combustion-pulse detection and a cycle-to-cycle "lope" score (sound-domain stand-in for COV of IMEP).
 *
 * Rationale (docs/RESEARCH_ACOUSTICS.md §3): big-overlap cams raise residual gas at idle, which raises
 * cycle-to-cycle combustion variation. Weak cycles show up as timing jitter (crank slows) and amplitude
 * variation of exhaust pulses. Amplitudes are normalised per cycle so slow AGC (§7) mostly cancels.
 */
import { envelope } from "./window.js";

/** A detected combustion pulse. */
export interface Pulse {
  /** Time in seconds. */
  t: number;
  /** Envelope amplitude at the peak (arbitrary units). */
  a: number;
}

/**
 * Detects firing pulses from the amplitude envelope.
 * @param x Signal (ideally low-passed / decimated to a few kHz).
 * @param sampleRate Sample rate (Hz).
 * @param firingHz Expected pulse rate (Hz), e.g. from hypothesis scoring.
 * @returns Pulses in time order.
 */
export function detectPulses(x: ArrayLike<number>, sampleRate: number, firingHz: number): Pulse[] {
  const env = envelope(x, sampleRate, Math.min(sampleRate / 4, Math.max(20, 3 * firingHz)));
  const T = sampleRate / firingHz;
  const half = Math.max(1, Math.floor(0.35 * T));
  const sorted = Array.from(env).sort((a, b) => a - b);
  const thr = sorted[Math.floor(sorted.length * 0.3)] ?? 0;
  const pulses: Pulse[] = [];
  for (let i = half; i < env.length - half; i++) {
    const v = env[i];
    if (v <= thr) continue;
    let isMax = true;
    for (let j = i - half; j <= i + half; j++) if (env[j] > v || (env[j] === v && j < i)) { isMax = false; break; }
    if (isMax) {
      // Sub-sample peak refinement (parabolic fit through i-1, i, i+1). Without it, peak times are quantised to the
      // analysis sample period (~0.5 ms at ~2 kHz). When the firing period is not an integer number of samples
      // (e.g. 44.1 kHz input decimated by 22 -> 2004.5 Hz), that quantisation alone adds ~0.7% interval CV, which
      // the x12 weighting turns into ~+7 lope points. This was the main cause of the browser-vs-offline mismatch.
      const y0 = env[i - 1], y2 = env[i + 1], den = y0 - 2 * v + y2;
      const d = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0;
      pulses.push({ t: (i + d) / sampleRate, a: v - 0.25 * (y0 - y2) * d });
    }
  }
  return pulses;
}

/** Lope / stability metrics. */
export interface LopeResult {
  /** 0 (dead smooth) .. 100 (very lopey). Heuristic mapping; to be calibrated on labelled clips. */
  score: number;
  /** Mean per-slot CV of firing intervals (cycle-to-cycle timing variation). */
  intervalCov: number;
  /** CV of full-cycle (720 deg) durations. */
  cycleCov: number;
  /** Mean per-slot CV of per-cycle-normalised pulse amplitude. */
  ampCov: number;
  /** Pulses per 720 deg cycle used for slotting. */
  eventsPerCycle: number;
  /** Number of complete cycles analysed. */
  cycles: number;
  /** RPM from the median inter-pulse interval times eventsPerCycle (robust to a few missed/extra pulses; NaN if too few pulses). */
  rpmFromPulses: number;
}

function cv(v: number[]): number {
  if (v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  if (m === 0) return 0;
  const s = Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1));
  return s / Math.abs(m);
}

/**
 * Computes the lope score from detected pulses.
 * @param pulses Output of {@link detectPulses}.
 * @param cycleHz Cycle rate RPM/120 (Hz).
 * @param eventsPerCycle Pulses expected per cycle (usually the cylinder count; fewer for one bank's tailpipe).
 *                       If omitted it is inferred from pulse count and duration.
 */
export function lopeScore(pulses: Pulse[], cycleHz: number, eventsPerCycle?: number): LopeResult {
  const nan: LopeResult = { score: NaN, intervalCov: NaN, cycleCov: NaN, ampCov: NaN, eventsPerCycle: eventsPerCycle ?? 0, cycles: 0, rpmFromPulses: NaN };
  if (pulses.length < 8 || !(cycleHz > 0)) return nan;
  const dur = pulses[pulses.length - 1].t - pulses[0].t;
  const E = eventsPerCycle ?? Math.max(1, Math.round((pulses.length - 1) / (dur * cycleHz)));
  const cycles = Math.floor((pulses.length - 1) / E);
  if (cycles < 3) return { ...nan, eventsPerCycle: E };
  const slotIntervals: number[][] = Array.from({ length: E }, () => []);
  const slotAmps: number[][] = Array.from({ length: E }, () => []);
  const cycleDur: number[] = [];
  for (let c = 0; c < cycles; c++) {
    const base = c * E;
    cycleDur.push(pulses[base + E].t - pulses[base].t);
    let am = 0;
    for (let s = 0; s < E; s++) am += pulses[base + s].a;
    am /= E;
    for (let s = 0; s < E; s++) {
      slotIntervals[s].push(pulses[base + s + 1].t - pulses[base + s].t);
      slotAmps[s].push(pulses[base + s].a / (am || 1));
    }
  }
  const intervalCov = slotIntervals.reduce((a, v) => a + cv(v), 0) / E;
  const ampCov = slotAmps.reduce((a, v) => a + cv(v), 0) / E;
  const cycleCov = cv(cycleDur);
  // Median single interval is robust to an occasional missed or doubled pulse, which would otherwise shift the
  // slotting and make whole-cycle durations (and so pulse RPM) wrong.
  const iv: number[] = [];
  for (let i = 1; i < pulses.length; i++) iv.push(pulses[i].t - pulses[i - 1].t);
  iv.sort((a, b) => a - b);
  const medD = iv[iv.length >> 1] * E;
  const x = 12 * intervalCov + 3 * ampCov;
  return { score: 100 * (1 - Math.exp(-x)), intervalCov, cycleCov, ampCov, eventsPerCycle: E, cycles, rpmFromPulses: 120 / medD };
}
