/**
 * @file spectrum.ts
 * @summary Welch-averaged power spectra, noise-floor estimation and peak-SNR lookups.
 *
 * The {@link Spectrum} object is the common currency between pitch, engine and band modules.
 */
import { powerSpectrum, nextPow2 } from "./fft.js";
import { makeWindow, removeDC } from "./window.js";
/**
 * Welch-averaged power spectrum (Hann window, 50% overlap).
 * @param x Signal.
 * @param sampleRate Sample rate in Hz.
 * @param segLen Segment length (samples). Defaults to the largest power of two <= x.length, capped at 65536.
 */
export function welch(x, sampleRate, segLen) {
    const xs = removeDC(x);
    let L = segLen ?? Math.min(65536, nextPow2(xs.length + 1) >> 1);
    if (L > xs.length)
        L = nextPow2(xs.length);
    const nfft = nextPow2(L);
    const w = makeWindow(Math.min(L, xs.length), "hann");
    const hop = Math.max(1, Math.floor(L / 2));
    const acc = new Float64Array(nfft / 2 + 1);
    let count = 0;
    const seg = new Float64Array(w.length);
    for (let start = 0; start + w.length <= xs.length; start += hop) {
        for (let i = 0; i < w.length; i++)
            seg[i] = xs[start + i] * w[i];
        const p = powerSpectrum(seg, nfft);
        for (let k = 0; k < acc.length; k++)
            acc[k] += p[k];
        count++;
    }
    if (count === 0) {
        const p = powerSpectrum(xs, nfft);
        acc.set(p);
        count = 1;
    }
    for (let k = 0; k < acc.length; k++)
        acc[k] /= count;
    return { power: acc, df: sampleRate / nfft, sampleRate, nfft };
}
/**
 * Smoothed noise floor by running median over +/- halfWidthHz (computed once and cached on the spectrum).
 * @param spec Spectrum.
 * @param halfWidthHz Half-width of the median window in Hz (default 4 Hz).
 */
export function noiseFloor(spec, halfWidthHz = 4) {
    if (spec.floor)
        return spec.floor;
    const n = spec.power.length;
    const hw = Math.max(2, Math.round(halfWidthHz / spec.df));
    const out = new Float64Array(n);
    // Decimated median for speed: evaluate every `step` bins and interpolate.
    const step = Math.max(1, Math.floor(hw / 4));
    const tmp = [];
    const pts = [];
    const vals = [];
    for (let k = 0; k < n; k += step) {
        tmp.length = 0;
        for (let j = Math.max(0, k - hw); j <= Math.min(n - 1, k + hw); j++)
            tmp.push(spec.power[j]);
        tmp.sort((a, b) => a - b);
        pts.push(k);
        vals.push(tmp[tmp.length >> 1] + 1e-30);
    }
    let p = 0;
    for (let k = 0; k < n; k++) {
        while (p < pts.length - 2 && pts[p + 1] < k)
            p++;
        const k0 = pts[p], k1 = pts[Math.min(p + 1, pts.length - 1)];
        const t = k1 === k0 ? 0 : Math.min(1, Math.max(0, (k - k0) / (k1 - k0)));
        out[k] = vals[p] * (1 - t) + vals[Math.min(p + 1, vals.length - 1)] * t;
    }
    spec.floor = out;
    return out;
}
/**
 * Peak power within +/- tolHz of f, divided by the local noise floor, in dB (clamped at >= 0).
 * @param spec Spectrum.
 * @param f Frequency in Hz.
 * @param tolHz Search tolerance in Hz (default: 1.5 bins).
 */
export function peakSnrDb(spec, f, tolHz = 1.5 * spec.df) {
    const floor = noiseFloor(spec);
    const k0 = Math.max(1, Math.floor((f - tolHz) / spec.df));
    const k1 = Math.min(spec.power.length - 1, Math.ceil((f + tolHz) / spec.df));
    if (k1 < k0)
        return 0;
    let best = 0;
    for (let k = k0; k <= k1; k++) {
        const r = spec.power[k] / floor[k];
        if (r > best)
            best = r;
    }
    return Math.max(0, 10 * Math.log10(best + 1e-30));
}
/**
 * Frequency of the largest bin in [fLo, fHi], refined by parabolic interpolation.
 * @returns Frequency in Hz, or NaN if the range is empty.
 */
export function peakFrequency(spec, fLo, fHi) {
    const k0 = Math.max(1, Math.ceil(fLo / spec.df));
    const k1 = Math.min(spec.power.length - 2, Math.floor(fHi / spec.df));
    if (k1 < k0)
        return NaN;
    let bk = k0;
    for (let k = k0; k <= k1; k++)
        if (spec.power[k] > spec.power[bk])
            bk = k;
    return parabolicPeak(spec.power, bk) * spec.df;
}
/**
 * Parabolic (quadratic) interpolation of a peak location in an array, using log magnitude.
 * @param a Array of values.
 * @param k Index of a local maximum.
 * @returns Fractional index.
 */
export function parabolicPeak(a, k) {
    if (k <= 0 || k >= a.length - 1)
        return k;
    const l = Math.log(a[k - 1] + 1e-30), c = Math.log(a[k] + 1e-30), r = Math.log(a[k + 1] + 1e-30);
    const d = l - 2 * c + r;
    if (d === 0)
        return k;
    const off = (0.5 * (l - r)) / d;
    return k + Math.max(-0.5, Math.min(0.5, off));
}
