/**
 * @file fft.ts
 * @summary Dependency-free radix-2 FFT plus helpers (power spectrum, inverse FFT, next power of two).
 *
 * Works the same in browsers and Node. Arrays are Float64Array for precision.
 */

/** Returns the smallest power of two that is >= n (n >= 1). */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * In-place iterative radix-2 Cooley–Tukey FFT.
 * @param re Real parts (length must be a power of two). Overwritten with the result.
 * @param im Imaginary parts (same length). Overwritten with the result.
 * @param inverse If true, computes the inverse transform (scaled by 1/N).
 */
export function fftInPlace(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n !== im.length) throw new Error("fft: re/im length mismatch");
  if ((n & (n - 1)) !== 0) throw new Error("fft: length must be a power of two");
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  // Butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}

/**
 * One-sided power spectrum |X[k]|^2 for k = 0..N/2 of a real signal, zero-padded to `nfft`.
 * @param x Real input samples (already windowed if desired).
 * @param nfft FFT size (power of two, >= x.length). Defaults to nextPow2(x.length).
 * @returns Float64Array of length nfft/2 + 1.
 */
export function powerSpectrum(x: ArrayLike<number>, nfft = nextPow2(x.length)): Float64Array {
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  const m = Math.min(x.length, nfft);
  for (let i = 0; i < m; i++) re[i] = x[i];
  fftInPlace(re, im);
  const out = new Float64Array(nfft / 2 + 1);
  for (let k = 0; k <= nfft / 2; k++) out[k] = re[k] * re[k] + im[k] * im[k];
  return out;
}
