/**
 * @file lope.ts
 * @summary Combustion-pulse detection and a cycle-to-cycle "lope" score (sound-domain stand-in for COV of IMEP).
 *
 * Rationale (docs/RESEARCH_ACOUSTICS.md §3): big-overlap cams raise residual gas at idle, which raises
 * cycle-to-cycle combustion variation. Weak cycles show up as timing jitter (crank slows) and amplitude
 * variation of exhaust pulses. Amplitudes are normalised per cycle so slow AGC (§7) mostly cancels.
 */
import { envelope } from "./window.js";
/**
 * Detects firing pulses from the amplitude envelope.
 * @param x Signal (ideally low-passed / decimated to a few kHz).
 * @param sampleRate Sample rate (Hz).
 * @param firingHz Expected pulse rate (Hz), e.g. from hypothesis scoring.
 * @returns Pulses in time order.
 */
export function detectPulses(x, sampleRate, firingHz) {
    const env = envelope(x, sampleRate, Math.min(sampleRate / 4, Math.max(20, 3 * firingHz)));
    const T = sampleRate / firingHz;
    const half = Math.max(1, Math.floor(0.35 * T));
    const sorted = Array.from(env).sort((a, b) => a - b);
    const thr = sorted[Math.floor(sorted.length * 0.3)] ?? 0;
    const pulses = [];
    for (let i = half; i < env.length - half; i++) {
        const v = env[i];
        if (v <= thr)
            continue;
        let isMax = true;
        for (let j = i - half; j <= i + half; j++)
            if (env[j] > v || (env[j] === v && j < i)) {
                isMax = false;
                break;
            }
        if (isMax)
            pulses.push({ t: i / sampleRate, a: v });
    }
    return pulses;
}
function cv(v) {
    if (v.length < 2)
        return 0;
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    if (m === 0)
        return 0;
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
export function lopeScore(pulses, cycleHz, eventsPerCycle) {
    const nan = { score: NaN, intervalCov: NaN, cycleCov: NaN, ampCov: NaN, eventsPerCycle: eventsPerCycle ?? 0, cycles: 0, rpmFromPulses: NaN };
    if (pulses.length < 8 || !(cycleHz > 0))
        return nan;
    const dur = pulses[pulses.length - 1].t - pulses[0].t;
    const E = eventsPerCycle ?? Math.max(1, Math.round((pulses.length - 1) / (dur * cycleHz)));
    const cycles = Math.floor((pulses.length - 1) / E);
    if (cycles < 3)
        return { ...nan, eventsPerCycle: E };
    const slotIntervals = Array.from({ length: E }, () => []);
    const slotAmps = Array.from({ length: E }, () => []);
    const cycleDur = [];
    for (let c = 0; c < cycles; c++) {
        const base = c * E;
        cycleDur.push(pulses[base + E].t - pulses[base].t);
        let am = 0;
        for (let s = 0; s < E; s++)
            am += pulses[base + s].a;
        am /= E;
        for (let s = 0; s < E; s++) {
            slotIntervals[s].push(pulses[base + s + 1].t - pulses[base + s].t);
            slotAmps[s].push(pulses[base + s].a / (am || 1));
        }
    }
    const intervalCov = slotIntervals.reduce((a, v) => a + cv(v), 0) / E;
    const ampCov = slotAmps.reduce((a, v) => a + cv(v), 0) / E;
    const cycleCov = cv(cycleDur);
    const sortedD = [...cycleDur].sort((a, b) => a - b);
    const medD = sortedD[sortedD.length >> 1];
    const x = 12 * intervalCov + 3 * ampCov;
    return { score: 100 * (1 - Math.exp(-x)), intervalCov, cycleCov, ampCov, eventsPerCycle: E, cycles, rpmFromPulses: 120 / medD };
}
