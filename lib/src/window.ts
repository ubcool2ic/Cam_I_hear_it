/**
 * @file window.ts
 * @summary Window functions, framing, decimation and envelope helpers.
 */

/** Window type names supported by {@link makeWindow}. */
export type WindowType = "hann" | "hamming" | "rect";

/**
 * Builds a window of length n.
 * @param n Window length in samples.
 * @param type "hann" (default), "hamming" or "rect".
 */
export function makeWindow(n: number, type: WindowType = "hann"): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = n > 1 ? i / (n - 1) : 0;
    w[i] = type === "hann" ? 0.5 - 0.5 * Math.cos(2 * Math.PI * p)
      : type === "hamming" ? 0.54 - 0.46 * Math.cos(2 * Math.PI * p) : 1;
  }
  return w;
}

/**
 * Splits a signal into overlapping frames (copies), optionally windowed.
 * @param x Input signal.
 * @param frameLen Frame length in samples.
 * @param hop Hop size in samples.
 * @param window Optional window (length frameLen) multiplied into each frame.
 * @returns Array of frames; trailing partial frame is dropped.
 */
export function frameSignal(x: ArrayLike<number>, frameLen: number, hop: number, window?: Float64Array): Float64Array[] {
  const frames: Float64Array[] = [];
  for (let start = 0; start + frameLen <= x.length; start += hop) {
    const f = new Float64Array(frameLen);
    for (let i = 0; i < frameLen; i++) f[i] = x[start + i] * (window ? window[i] : 1);
    frames.push(f);
  }
  return frames;
}

/** Removes the mean (DC) from a signal, returning a new Float64Array. */
export function removeDC(x: ArrayLike<number>): Float64Array {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  const m = x.length ? s / x.length : 0;
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] - m;
  return y;
}

/**
 * Windowed-sinc low-pass FIR coefficients.
 * @param cutoffNorm Cutoff as a fraction of the sample rate (0 < c < 0.5).
 * @param taps Odd number of taps.
 */
export function lowpassFir(cutoffNorm: number, taps: number): Float64Array {
  const h = new Float64Array(taps);
  const mid = (taps - 1) / 2;
  const w = makeWindow(taps, "hann");
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const t = i - mid;
    const s = t === 0 ? 2 * cutoffNorm : Math.sin(2 * Math.PI * cutoffNorm * t) / (Math.PI * t);
    h[i] = s * w[i];
    sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  return h;
}

/**
 * Anti-aliased integer decimation (FIR low-pass at 0.45/factor, then keep every factor-th sample).
 * @param x Input signal.
 * @param factor Integer decimation factor >= 1.
 * @returns Decimated signal.
 */
export function decimate(x: ArrayLike<number>, factor: number): Float64Array {
  if (factor <= 1) return Float64Array.from(x as ArrayLike<number>);
  const taps = 16 * factor + 1;
  const h = lowpassFir(0.45 / factor, taps);
  const mid = (taps - 1) / 2;
  const outLen = Math.floor(x.length / factor);
  const y = new Float64Array(outLen);
  for (let o = 0; o < outLen; o++) {
    const c = o * factor;
    let acc = 0;
    for (let k = 0; k < taps; k++) {
      const idx = c + k - mid;
      if (idx >= 0 && idx < x.length) acc += h[k] * x[idx];
    }
    y[o] = acc;
  }
  return y;
}

/**
 * Amplitude envelope: full-wave rectification followed by a two-pass (zero-phase) one-pole low-pass.
 * @param x Input signal.
 * @param sampleRate Sample rate in Hz.
 * @param cutoffHz Envelope smoothing cutoff in Hz.
 */
export function envelope(x: ArrayLike<number>, sampleRate: number, cutoffHz: number): Float64Array {
  const a = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  const y = new Float64Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i++) { s = a * s + (1 - a) * Math.abs(x[i]); y[i] = s; }
  s = y[y.length - 1] || 0;
  for (let i = y.length - 1; i >= 0; i--) { s = a * s + (1 - a) * y[i]; y[i] = s; }
  return y;
}
