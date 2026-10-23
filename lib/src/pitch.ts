/**
 * @file pitch.ts
 * @summary Fundamental-frequency estimators: harmonic product spectrum, real cepstrum, and autocorrelation.
 *
 * References (see docs/RESEARCH_ACOUSTICS.md §12): Noll 1967 (cepstrum), Noll 1969/70 (HPS),
 * de Cheveigné & Kawahara 2002 (YIN, autocorrelation family).
 */
import { fftInPlace, nextPow2 } from "./fft.js";
import { Spectrum, parabolicPeak } from "./spectrum.js";
import { removeDC, makeWindow } from "./window.js";

/** Result of a fundamental estimate. */
export interface F0Estimate {
  /** Estimated fundamental in Hz (NaN if none found). */
  f0: number;
  /** Method-specific strength (higher = more confident), roughly 0..1 where possible. */
  strength: number;
}

/**
 * Harmonic product spectrum: multiply (sum in log) the spectrum decimated by 1..H, pick the maximum in [fMin, fMax].
 * @param spec Power spectrum.
 * @param fMin Lowest candidate fundamental (Hz).
 * @param fMax Highest candidate fundamental (Hz).
 * @param harmonics Number of harmonics H (default 5).
 */
export function hpsF0(spec: Spectrum, fMin: number, fMax: number, harmonics = 5): F0Estimate {
  const n = spec.power.length;
  const k0 = Math.max(1, Math.ceil(fMin / spec.df));
  const k1 = Math.min(Math.floor((n - 1) / harmonics), Math.floor(fMax / spec.df));
  if (k1 < k0) return { f0: NaN, strength: 0 };
  const hps = new Float64Array(k1 + 2);
  let best = k0, sum = 0, cnt = 0;
  for (let k = Math.max(1, k0 - 1); k <= k1 + 1 && k * harmonics < n; k++) {
    let s = 0;
    for (let h = 1; h <= harmonics; h++) {
      // max over the +/-h/2 neighbourhood so fractional harmonics are not missed
      const c = k * h;
      const r = Math.floor(h / 2);
      let m = 0;
      for (let j = c - r; j <= c + r; j++) if (j > 0 && j < n && spec.power[j] > m) m = spec.power[j];
      s += Math.log(m + 1e-30);
    }
    hps[k] = s;
  }
  for (let k = k0; k <= k1; k++) { if (hps[k] > hps[best]) best = k; sum += hps[k]; cnt++; }
  const mean = cnt ? sum / cnt : 0;
  const expd = hps.map((v) => Math.exp((v - hps[best]) / harmonics));
  const kf = parabolicPeak(expd, best);
  return { f0: kf * spec.df, strength: Math.tanh((hps[best] - mean) / (harmonics * 4)) };
}

/**
 * Real-cepstrum fundamental: inverse FFT of log power spectrum; peak quefrency in [1/fMax, 1/fMin].
 * @param spec Power spectrum.
 * @param fMin Lowest fundamental (Hz).
 * @param fMax Highest fundamental (Hz).
 */
export function cepstrumF0(spec: Spectrum, fMin: number, fMax: number): F0Estimate {
  const nfft = spec.nfft;
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  for (let k = 0; k <= nfft / 2; k++) {
    const v = Math.log(spec.power[k] + 1e-20);
    re[k] = v;
    if (k > 0 && k < nfft / 2) re[nfft - k] = v;
  }
  fftInPlace(re, im, true);
  const q0 = Math.max(2, Math.floor(spec.sampleRate / fMax));
  const q1 = Math.min(nfft / 2 - 2, Math.ceil(spec.sampleRate / fMin));
  if (q1 <= q0) return { f0: NaN, strength: 0 };
  let best = q0;
  let energy = 0;
  for (let q = q0; q <= q1; q++) { if (re[q] > re[best]) best = q; energy += re[q] * re[q]; }
  const rms = Math.sqrt(energy / (q1 - q0 + 1)) + 1e-30;
  const shifted = new Float64Array(3);
  const base = Math.min(...[re[best - 1], re[best], re[best + 1]]);
  shifted[0] = re[best - 1] - base + 1e-9; shifted[1] = re[best] - base + 1e-9; shifted[2] = re[best + 1] - base + 1e-9;
  const qf = best - 1 + parabolicPeak(shifted, 1);
  return { f0: spec.sampleRate / qf, strength: Math.tanh(re[best] / rms / 6) };
}

/**
 * Normalized autocorrelation fundamental (FFT-based, Hann-windowed), picking the strongest lag in [1/fMax, 1/fMin].
 * @param x Time signal.
 * @param sampleRate Sample rate (Hz).
 * @param fMin Lowest fundamental (Hz).
 * @param fMax Highest fundamental (Hz).
 */
export function autocorrF0(x: ArrayLike<number>, sampleRate: number, fMin: number, fMax: number): F0Estimate {
  const r = autocorrelation(x);
  const l0 = Math.max(2, Math.floor(sampleRate / fMax));
  const l1 = Math.min(r.length - 2, Math.ceil(sampleRate / fMin));
  if (l1 <= l0) return { f0: NaN, strength: 0 };
  let best = l0;
  for (let l = l0; l <= l1; l++) if (r[l] > r[best]) best = l;
  const shifted = [r[best - 1] + 1.01, r[best] + 1.01, r[best + 1] + 1.01];
  const lf = best - 1 + parabolicPeak(shifted, 1);
  return { f0: sampleRate / lf, strength: Math.max(0, r[best]) };
}

/**
 * Normalized (r[0] = 1) autocorrelation via FFT with zero padding; Hann-windowed and bias-corrected.
 * @param x Time signal.
 * @returns Autocorrelation for lags 0..N-1.
 */
export function autocorrelation(x: ArrayLike<number>): Float64Array {
  const xs = removeDC(x);
  const n = xs.length;
  const w = makeWindow(n, "hann");
  const nfft = nextPow2(2 * n);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  for (let i = 0; i < n; i++) re[i] = xs[i] * w[i];
  fftInPlace(re, im);
  for (let k = 0; k < nfft; k++) { re[k] = re[k] * re[k] + im[k] * im[k]; im[k] = 0; }
  fftInPlace(re, im, true);
  // window autocorrelation for bias correction
  const wr = new Float64Array(nfft);
  const wi = new Float64Array(nfft);
  for (let i = 0; i < n; i++) wr[i] = w[i];
  fftInPlace(wr, wi);
  for (let k = 0; k < nfft; k++) { wr[k] = wr[k] * wr[k] + wi[k] * wi[k]; wi[k] = 0; }
  fftInPlace(wr, wi, true);
  const out = new Float64Array(n);
  const r0 = re[0] / (wr[0] || 1) || 1;
  for (let l = 0; l < n; l++) {
    const wl = wr[l];
    out[l] = wl > wr[0] * 0.05 ? re[l] / wl / r0 : 0;
  }
  return out;
}
