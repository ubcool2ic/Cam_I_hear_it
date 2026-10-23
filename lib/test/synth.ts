/**
 * @file synth.ts
 * @summary Deterministic synthetic engine-idle signals for tests (pulse trains with known RPM, pattern and jitter).
 */

/** Seeded PRNG (mulberry32) returning uniform [0,1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller from a uniform source. */
export function gauss(u: () => number): number {
  return Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

/** Options for {@link synthEngine}. */
export interface SynthOptions {
  sampleRate: number;
  durationS: number;
  rpm: number;
  cylinders: number;
  /** Per-slot amplitude multipliers (length = cylinders). Default all 1. */
  ampPattern?: number[];
  /** Fractional SD of per-cycle duration (crank speed jitter). */
  cycleJitter?: number;
  /** Fractional SD of each firing interval. */
  intervalJitter?: number;
  /** Fractional SD of each pulse amplitude. */
  ampJitter?: number;
  /** White noise RMS relative to pulse peak. */
  noise?: number;
  /** Resonance frequency of each pulse (Hz) and decay time constant (s). */
  resonanceHz?: number;
  decayS?: number;
  seed?: number;
}

/**
 * Generates an evenly-firing four-stroke idle: each firing event is a decaying resonance plus a low "thump".
 * Jitter is applied to cycle duration, individual intervals and amplitudes.
 */
export function synthEngine(o: SynthOptions): Float64Array {
  const u = rng(o.seed ?? 1);
  const n = Math.round(o.sampleRate * o.durationS);
  const x = new Float64Array(n);
  const N = o.cylinders;
  const pat = o.ampPattern ?? new Array(N).fill(1);
  const fr = o.resonanceHz ?? 180;
  const tau = o.decayS ?? 0.006;
  const L = Math.round(o.sampleRate * tau * 6);
  let t = 0;
  const cycleNominal = 120 / o.rpm;
  while (t < o.durationS) {
    const cyc = cycleNominal * (1 + (o.cycleJitter ?? 0) * gauss(u));
    for (let s = 0; s < N; s++) {
      const amp = pat[s] * Math.max(0.05, 1 + (o.ampJitter ?? 0) * gauss(u));
      const i0 = Math.round(t * o.sampleRate);
      for (let i = 0; i < L && i0 + i < n; i++) {
        const tt = i / o.sampleRate;
        x[i0 + i] += amp * Math.exp(-tt / tau) * (Math.sin(2 * Math.PI * fr * tt) + 0.6 * Math.sin(2 * Math.PI * 60 * tt));
      }
      t += (cyc / N) * (1 + (o.intervalJitter ?? 0) * gauss(u));
    }
  }
  const nz = o.noise ?? 0.02;
  for (let i = 0; i < n; i++) x[i] += nz * gauss(u);
  return x;
}
