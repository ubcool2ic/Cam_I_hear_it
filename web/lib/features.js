/**
 * @file features.ts
 * @summary One-call clip analysis producing a JSON-serialisable feature vector for the ML backend.
 *
 * Schema id: "cam-i-hear-it/features@1" (see docs/ML_BACKEND.md). Bump the version on breaking changes.
 */
import { decimate } from "./window.js";
import { welch } from "./spectrum.js";
import { hpsF0, cepstrumF0, autocorrF0 } from "./pitch.js";
import { scoreCylinderHypotheses } from "./engine.js";
import { detectPulses, lopeScore } from "./lope.js";
import { bandEnergies, spectralCentroid, spectralFlatness, orderEnergies } from "./bands.js";
/** Schema identifier written into every feature vector. */
export const FEATURE_SCHEMA = "cam-i-hear-it/features@1";
/**
 * Analyses an idle recording and returns the feature vector.
 * @param samples Mono PCM (any scale), ideally >= 8 s.
 * @param sampleRate Sample rate (Hz).
 * @param opts See {@link AnalyzeOptions}.
 */
export function analyzeClip(samples, sampleRate, opts = {}) {
    const warnings = [];
    const durationS = samples.length / sampleRate;
    if (durationS < 4)
        warnings.push("clip shorter than 4 s: RPM/lope unreliable");
    const factor = Math.max(1, Math.floor(sampleRate / (opts.analysisRate ?? 2000)));
    const low = decimate(samples, factor);
    const ar = sampleRate / factor;
    // ~0.25 Hz resolution if the clip allows, else whatever fits.
    let seg = 1;
    while (seg * 2 <= low.length && seg < Math.round(ar * 4))
        seg *= 2;
    const lowSpec = welch(low, ar, seg);
    const hyps = scoreCylinderHypotheses(lowSpec, {
        cylinders: opts.cylinders ? [opts.cylinders] : undefined,
        rpmMin: opts.rpmMin, rpmMax: opts.rpmMax,
    });
    const best = hyps[0];
    const fMaxF0 = 300;
    const f0 = {
        hps: hpsF0(lowSpec, 15, fMaxF0, 5),
        cepstrum: cepstrumF0(lowSpec, 15, fMaxF0),
        autocorr: autocorrF0(low.subarray(0, Math.min(low.length, Math.round(ar * 2))), ar, 15, fMaxF0),
    };
    const pulses = detectPulses(low, ar, best.firingHz);
    const lope = lopeScore(pulses, best.rpm / 120, opts.eventsPerCycle ?? opts.cylinders ?? best.cylinders);
    if (Number.isFinite(lope.rpmFromPulses) && Math.abs(lope.rpmFromPulses - best.rpm) / best.rpm > 0.05)
        warnings.push("pulse-timing RPM disagrees with spectral RPM by >5%: pulse detection may be unreliable");
    if (!opts.cylinders && best.prob < 0.6)
        warnings.push("cylinder count ambiguous: enter cylinders in the form");
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
        warnings,
    };
}
/** Serialises a feature vector (NaN -> null) for transport. */
export function featuresToJSON(fv, space = 0) {
    return JSON.stringify(fv, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v), space);
}
