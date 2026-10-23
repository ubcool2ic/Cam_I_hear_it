/**
 * @file dsp.test.ts
 * @summary node:test suite for the DSP library using synthetic idle signals with known RPM, cylinders and jitter.
 */
import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  fftInPlace, rpmFromFiring, firingFromRpm, welch, hpsF0, cepstrumF0, autocorrF0,
  scoreCylinderHypotheses, detectPulses, lopeScore, analyzeClip, featuresToJSON, bandEnergies, decimate, FEATURE_SCHEMA,
} from "../src/index.js";
import { synthEngine } from "./synth.js";

const SR = 8000;

test("FFT matches a naive DFT", () => {
  const n = 64;
  const x = Array.from({ length: n }, (_, i) => Math.sin(i * 0.3) + 0.5 * Math.cos(i * 1.7) + (i % 5) * 0.1);
  const re = Float64Array.from(x), im = new Float64Array(n);
  fftInPlace(re, im);
  for (let k = 0; k < n; k++) {
    let r = 0, m = 0;
    for (let t = 0; t < n; t++) { r += x[t] * Math.cos((-2 * Math.PI * k * t) / n); m += x[t] * Math.sin((-2 * Math.PI * k * t) / n); }
    assert.ok(Math.abs(r - re[k]) < 1e-9 && Math.abs(m - im[k]) < 1e-9, `bin ${k}`);
  }
  fftInPlace(re, im, true);
  for (let t = 0; t < n; t++) assert.ok(Math.abs(re[t] - x[t]) < 1e-9);
});

test("rpmFromFiring / firingFromRpm", () => {
  assert.equal(rpmFromFiring(50, 8), 750);
  assert.equal(rpmFromFiring(25, 4), 750);
  assert.equal(firingFromRpm(900, 6), 45);
  assert.throws(() => rpmFromFiring(50, 0));
});

test("F0 estimators find a 50 Hz harmonic signal with a weak fundamental", () => {
  const n = SR * 4;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    x[i] = 0.2 * Math.sin(2 * Math.PI * 50 * t) + Math.sin(2 * Math.PI * 100 * t + 1) + 0.8 * Math.sin(2 * Math.PI * 150 * t) + 0.6 * Math.sin(2 * Math.PI * 200 * t + 2) + 0.4 * Math.sin(2 * Math.PI * 250 * t);
  }
  const spec = welch(x, SR, 16384);
  for (const [name, est] of [["hps", hpsF0(spec, 30, 300, 4)], ["cep", cepstrumF0(spec, 30, 300)], ["acf", autocorrF0(x.subarray(0, SR), SR, 30, 300)]] as const) {
    assert.ok(Math.abs(est.f0 - 50) < 1, `${name} f0=${est.f0}`);
  }
});

test("decimate keeps in-band tones and removes out-of-band ones", () => {
  const n = SR * 2;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin(2 * Math.PI * 100 * i / SR) + Math.sin(2 * Math.PI * 3000 * i / SR);
  const y = decimate(x, 4); // 2 kHz, Nyquist 1 kHz
  const s = welch(y, SR / 4, 2048);
  const k100 = Math.round(100 / s.df), kAlias = Math.round(1000 / s.df) - 1; // 3000 aliases to 1000
  assert.ok(s.power[k100] > 1000 * s.power[kAlias]);
});

test("V8 at 750 rpm with cylinder imbalance -> 8 cylinders, rpm within 10", () => {
  const x = synthEngine({ sampleRate: SR, durationS: 12, rpm: 750, cylinders: 8, ampPattern: [1, 0.8, 1.1, 0.9, 1.05, 0.85, 1, 0.95], ampJitter: 0.05, noise: 0.05, seed: 3 });
  const fv = analyzeClip(x, SR);
  assert.equal(fv.rpm.cylindersUsed, 8, JSON.stringify(fv.hypotheses.slice(0, 3)));
  assert.ok(Math.abs(fv.rpm.estimate - 750) < 10, `rpm ${fv.rpm.estimate}`);
});

test("I4 at 850 rpm -> 4 cylinders, rpm within 10", () => {
  const x = synthEngine({ sampleRate: SR, durationS: 12, rpm: 850, cylinders: 4, ampPattern: [1, 0.85, 1.1, 0.95], ampJitter: 0.05, noise: 0.05, seed: 5 });
  const fv = analyzeClip(x, SR);
  assert.equal(fv.rpm.cylindersUsed, 4, JSON.stringify(fv.hypotheses.slice(0, 3)));
  assert.ok(Math.abs(fv.rpm.estimate - 850) < 10, `rpm ${fv.rpm.estimate}`);
});

test("I6 at 650 rpm -> 6 cylinders", () => {
  const x = synthEngine({ sampleRate: SR, durationS: 12, rpm: 650, cylinders: 6, ampPattern: [1, 0.9, 1.1, 0.95, 1.05, 0.85], ampJitter: 0.05, noise: 0.05, seed: 9 });
  const fv = analyzeClip(x, SR);
  assert.equal(fv.rpm.cylindersUsed, 6, JSON.stringify(fv.hypotheses.slice(0, 3)));
  assert.ok(Math.abs(fv.rpm.estimate - 650) < 10, `rpm ${fv.rpm.estimate}`);
});

test("user-supplied cylinder count overrides the search", () => {
  const x = synthEngine({ sampleRate: SR, durationS: 10, rpm: 900, cylinders: 8, noise: 0.05, seed: 11 });
  const fv = analyzeClip(x, SR, { cylinders: 8 });
  assert.equal(fv.hypotheses.length, 1);
  assert.ok(Math.abs(fv.rpm.estimate - 900) < 10, `rpm ${fv.rpm.estimate}`);
});

test("lope score: jittery (big-cam-like) idle scores higher than a smooth one", () => {
  const base = { sampleRate: SR, durationS: 12, rpm: 800, cylinders: 8, noise: 0.03 };
  const smooth = synthEngine({ ...base, intervalJitter: 0.005, ampJitter: 0.03, seed: 21 });
  const lopey = synthEngine({ ...base, rpm: 800, cycleJitter: 0.03, intervalJitter: 0.06, ampJitter: 0.35, seed: 22 });
  const a = analyzeClip(smooth, SR, { cylinders: 8 });
  const b = analyzeClip(lopey, SR, { cylinders: 8 });
  assert.ok(a.lope.score < 40, `smooth ${a.lope.score}`);
  assert.ok(b.lope.score > a.lope.score + 25, `smooth ${a.lope.score} lopey ${b.lope.score}`);
  assert.ok(b.lope.intervalCov > a.lope.intervalCov && b.lope.ampCov > a.lope.ampCov);
});

test("pulse detection recovers firing rate", () => {
  const x = synthEngine({ sampleRate: SR, durationS: 6, rpm: 750, cylinders: 8, noise: 0.02, seed: 4 });
  const p = detectPulses(x, SR, 50);
  assert.ok(Math.abs(p.length - 300) <= 6, `pulses ${p.length}`);
  const l = lopeScore(p, 750 / 120, 8);
  assert.ok(Math.abs(l.rpmFromPulses - 750) < 10);
});

test("hypothesis probabilities are normalised and features serialise to JSON", () => {
  const x = synthEngine({ sampleRate: SR, durationS: 8, rpm: 700, cylinders: 8, ampPattern: [1, 0.8, 1, 0.9, 1.1, 0.9, 1, 1], seed: 7 });
  const h = scoreCylinderHypotheses(welch(decimate(x, 4), SR / 4, 8192));
  const sum = h.reduce((a, b) => a + b.prob, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  const fv = analyzeClip(x, SR);
  const parsed = JSON.parse(featuresToJSON(fv));
  assert.equal(parsed.schema, FEATURE_SCHEMA);
  assert.ok(Array.isArray(parsed.orders) && parsed.orders.length > 0);
  const shares = bandEnergies(welch(x, SR, 4096));
  assert.ok(shares.every((b) => b.share >= 0 && b.share <= 1));
});

test("48 kHz input (phone rate) is decimated and analysed correctly", () => {
  const x = synthEngine({ sampleRate: 48000, durationS: 10, rpm: 750, cylinders: 8, ampPattern: [1, 0.8, 1.1, 0.9, 1.05, 0.85, 1, 0.95], ampJitter: 0.05, noise: 0.05, seed: 3 });
  const fv = analyzeClip(x, 48000);
  assert.equal(fv.rpm.cylindersUsed, 8);
  assert.ok(Math.abs(fv.rpm.estimate - 750) < 10, `rpm ${fv.rpm.estimate}`);
  assert.equal(fv.sampleRate, 48000);
});

test("lope and pulse RPM agree between 44.1 kHz and 48 kHz input (browser-vs-offline regression)", () => {
  // Chrome often delivers 44.1 kHz, which decimates to 2004.5 Hz, so the 20 ms firing period is not an integer
  // number of samples. Before sub-sample peak refinement, that quantisation alone inflated lope by ~7 points.
  const opts = { durationS: 10, rpm: 750, cylinders: 8, ampPattern: [1, 0.8, 1.1, 0.9, 1.05, 0.85, 1, 0.95], ampJitter: 0.05, noise: 0.02, seed: 5 };
  const a = analyzeClip(synthEngine({ ...opts, sampleRate: 48000 }), 48000);
  const b = analyzeClip(synthEngine({ ...opts, sampleRate: 44100 }), 44100);
  assert.ok(Math.abs(a.lope.score - b.lope.score) < 3, `lope 48k ${a.lope.score} vs 44.1k ${b.lope.score}`);
  assert.ok(b.lope.intervalCov < 0.003, `interval CV at 44.1k ${b.lope.intervalCov}`);
  assert.ok(!b.warnings.some((w) => w.includes("pulse-timing")), b.warnings.join("|"));
});
