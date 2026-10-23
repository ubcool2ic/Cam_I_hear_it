/**
 * @file bands.ts
 * @summary Band-energy shares, engine-order energies and simple spectral shape descriptors.
 *
 * All outputs are relative (shares / ratios / normalised dB) so they are robust to distance and gain
 * (docs/RESEARCH_ACOUSTICS.md §9.7).
 */
import { Spectrum, peakSnrDb } from "./spectrum.js";

/** Default analysis bands (Hz), chosen from the research doc (firing, valvetrain, knock-mode regions). */
export const DEFAULT_BANDS: Array<[number, number]> = [
  [20, 80], [80, 250], [250, 1000], [1000, 4000], [4000, 8000], [8000, 16000], [5000, 15000],
];

/** Energy share of a band. */
export interface BandEnergy { loHz: number; hiHz: number; share: number; db: number }

/**
 * Fraction of total power (20 Hz..Nyquist) in each band, plus the same in dB.
 * Bands beyond Nyquist get share 0.
 */
export function bandEnergies(spec: Spectrum, bands: Array<[number, number]> = DEFAULT_BANDS): BandEnergy[] {
  const k20 = Math.ceil(20 / spec.df);
  let total = 0;
  for (let k = k20; k < spec.power.length; k++) total += spec.power[k];
  return bands.map(([lo, hi]) => {
    let s = 0;
    const k0 = Math.max(k20, Math.ceil(lo / spec.df));
    const k1 = Math.min(spec.power.length - 1, Math.floor(hi / spec.df));
    for (let k = k0; k <= k1; k++) s += spec.power[k];
    const share = total > 0 ? s / total : 0;
    return { loHz: lo, hiHz: hi, share, db: 10 * Math.log10(share + 1e-12) };
  });
}

/** Spectral centroid (Hz) over [fLo, fHi]. */
export function spectralCentroid(spec: Spectrum, fLo = 20, fHi = spec.sampleRate / 2): number {
  let num = 0, den = 0;
  const k0 = Math.max(1, Math.ceil(fLo / spec.df)), k1 = Math.min(spec.power.length - 1, Math.floor(fHi / spec.df));
  for (let k = k0; k <= k1; k++) { num += k * spec.df * spec.power[k]; den += spec.power[k]; }
  return den > 0 ? num / den : 0;
}

/** Spectral flatness (geometric / arithmetic mean, 0..1) over [fLo, fHi]. */
export function spectralFlatness(spec: Spectrum, fLo = 20, fHi = spec.sampleRate / 2): number {
  let lg = 0, ar = 0, n = 0;
  const k0 = Math.max(1, Math.ceil(fLo / spec.df)), k1 = Math.min(spec.power.length - 1, Math.floor(fHi / spec.df));
  for (let k = k0; k <= k1; k++) { lg += Math.log(spec.power[k] + 1e-30); ar += spec.power[k]; n++; }
  return n && ar > 0 ? Math.exp(lg / n) / (ar / n) : 0;
}

/** Energy at one engine order. */
export interface OrderEnergy {
  /** Engine order (1 = crank rate). */
  order: number;
  /** Frequency in Hz at the estimated RPM. */
  hz: number;
  /** Peak SNR over local floor (dB). */
  snrDb: number;
  /** Peak power relative to the firing order's peak power (dB). */
  relDb: number;
}

/**
 * Energies at orders 0.5, 1.0, ... maxOrder (step 0.5) relative to the firing order N/2.
 * @param spec Spectrum.
 * @param rpm Estimated RPM.
 * @param cylinders Cylinder count used to locate the firing order.
 * @param maxOrder Highest order (default 3x firing order).
 */
export function orderEnergies(spec: Spectrum, rpm: number, cylinders: number, maxOrder = 1.5 * cylinders): OrderEnergy[] {
  const out: OrderEnergy[] = [];
  const peakPow = (f: number): number => {
    const tol = Math.max(1.5 * spec.df, f * 0.004);
    const k0 = Math.max(1, Math.floor((f - tol) / spec.df)), k1 = Math.min(spec.power.length - 1, Math.ceil((f + tol) / spec.df));
    let m = 0;
    for (let k = k0; k <= k1; k++) if (spec.power[k] > m) m = spec.power[k];
    return m;
  };
  const ref = peakPow((cylinders / 2) * rpm / 60) || 1e-30;
  for (let o = 0.5; o <= maxOrder + 1e-9; o += 0.5) {
    const hz = (o * rpm) / 60;
    if (hz >= spec.sampleRate / 2) break;
    out.push({ order: o, hz, snrDb: peakSnrDb(spec, hz), relDb: 10 * Math.log10(peakPow(hz) / ref + 1e-30) });
  }
  return out;
}
