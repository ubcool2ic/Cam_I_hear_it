/**
 * @file fable.test.ts
 * @summary Regression tests for edge-case fixes (hangs, NaN propagation, edge interpolation, buffer reuse).
 */
import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  nextPow2, makeWindow, lowpassFir, frameSignal, welch, powerSpectrum, hpsF0,
  lopeScore, analyzeClip, scoreCylinderHypotheses,
} from "../src/index.js";

/** Harmonic test tone (fundamental f0 with 4 harmonics) plus a tiny deterministic dither. */
function tone(sr: number, seconds: number, f0: number): Float64Array {
  const x = new Float64Array(Math.round(sr * seconds));
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    let s = 0;
    for (let h = 1; h <= 4; h++) s += Math.sin(2 * Math.PI * f0 * h * t) / h;
    x[i] = s + 1e-3 * Math.sin(i * 12.9898);
  }
  return x;
}

test("nextPow2 does not overflow int32", () => {
  assert.equal(nextPow2(2 ** 30 + 1), 2 ** 31);
  assert.equal(nextPow2(2 ** 31), 2 ** 31);
  assert.equal(nextPow2(1000), 1024);
  assert.equal(nextPow2(1), 1);
});

test("length-1 window is 1 and lowpassFir(…, 1) is finite", () => {
  assert.equal(makeWindow(1, "hann")[0], 1);
  assert.equal(makeWindow(1, "hamming")[0], 1);
  const h = lowpassFir(0.25, 1);
  assert.equal(h.length, 1);
  assert.ok(Math.abs(h[0] - 1) < 1e-12);
});

test("frameSignal rejects non-positive hop instead of hanging", () => {
  const x = new Float64Array(8);
  assert.throws(() => frameSignal(x, 4, 0), RangeError);
  assert.throws(() => frameSignal(x, 4, -1), RangeError);
  assert.equal(frameSignal(x, 4, 2).length, 3);
});

test("welch with reused buffers matches a reference average", () => {
  const sr = 1024, n = 1024, L = 256;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 100 * i) / sr) + 0.3 * Math.sin(i * 0.7);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  const w = makeWindow(L, "hann");
  const ref = new Float64Array(L / 2 + 1);
  let count = 0;
  for (let start = 0; start + L <= n; start += L / 2) {
    const seg = new Float64Array(L);
    for (let i = 0; i < L; i++) seg[i] = (x[start + i] - mean) * w[i];
    const p = powerSpectrum(seg, L);
    for (let k = 0; k < ref.length; k++) ref[k] += p[k];
    count++;
  }
  const spec = welch(x, sr, L);
  assert.equal(spec.power.length, ref.length);
  for (let k = 0; k < ref.length; k++) {
    const r = ref[k] / count;
    assert.ok(Math.abs(spec.power[k] - r) <= 1e-9 * (1 + Math.abs(r)), `bin ${k}`);
  }
  let pk = 1;
  for (let k = 1; k < spec.power.length; k++) if (spec.power[k] > spec.power[pk]) pk = k;
  assert.equal(pk, 25); // 100 Hz / 4 Hz per bin
});

test("welch tolerates empty input and invalid segLen", () => {
  assert.doesNotThrow(() => welch(new Float64Array(0), 2000));
  const s = welch(new Float64Array(64).fill(1), 2000, -5);
  assert.ok(s.power.length >= 1);
  for (const v of s.power) assert.ok(Number.isFinite(v));
});

test("hpsF0 does not interpolate against an uncomputed edge bin", () => {
  const power = new Float64Array(101).fill(1e-6);
  for (const k of [20, 40, 60, 80, 100]) power[k] = 1;
  const spec = { power, df: 1, sampleRate: 200, nfft: 200 };
  const est = hpsF0(spec, 5, 90, 5); // k1 = floor(100/5) = 20, bin 21 cannot be computed
  assert.equal(est.f0, 20);
});

test("lopeScore survives eventsPerCycle of 0 or a fraction", () => {
  const pulses = Array.from({ length: 40 }, (_v, i) => ({ t: i * 0.02, a: 1 }));
  const r0 = lopeScore(pulses, 6.25, 0); // 50 pulses/s at 6.25 cycles/s -> 8 per cycle
  assert.equal(r0.eventsPerCycle, 8);
  assert.ok(Number.isFinite(r0.score));
  const r1 = lopeScore(pulses, 6.25, 2.5);
  assert.ok(Number.isInteger(r1.eventsPerCycle) && r1.eventsPerCycle >= 1);
  const r2 = lopeScore(pulses, 6.25, NaN);
  assert.equal(r2.eventsPerCycle, 8);
});

test("analyzeClip with cylinders: 0 terminates and uses the detected count", () => {
  const fv = analyzeClip(tone(8000, 5, 25), 8000, { cylinders: 0 });
  assert.ok(fv.lope.eventsPerCycle >= 1);
  assert.ok(Number.isFinite(fv.rpm.estimate));
});

test("analyzeClip sanitises non-finite samples", () => {
  const x = tone(8000, 5, 25);
  x[100] = NaN;
  x[2000] = Infinity;
  const fv = analyzeClip(x, 8000);
  assert.ok(Number.isFinite(fv.rpm.estimate));
  assert.ok(Number.isFinite(fv.spectral.centroidHz));
  assert.ok(fv.warnings.some((w) => w.includes("non-finite")));
  assert.ok(Number.isNaN(x[100])); // caller's buffer is not modified
});

test("analyzeClip does not throw on empty or silent input", () => {
  assert.doesNotThrow(() => analyzeClip(new Float32Array(0), 44100));
  const fv = analyzeClip(new Float32Array(44100), 44100);
  assert.ok(Number.isNaN(fv.lope.score));
  assert.ok(Number.isFinite(fv.rpm.estimate));
});

test("scoreCylinderHypotheses ignores invalid rpm options", () => {
  const spec = welch(tone(2000, 8, 25), 2000, 4096);
  const hyps = scoreCylinderHypotheses(spec, { cylinders: [4], rpmStep: 0, rpmMin: NaN, rpmMax: NaN });
  assert.equal(hyps.length, 1);
  assert.ok(Number.isFinite(hyps[0].rpm));
  // Invalid values fall back to the defaults, so the result matches a default-options run.
  const ref = scoreCylinderHypotheses(spec, { cylinders: [4] });
  assert.equal(hyps[0].rpm, ref[0].rpm);
});
