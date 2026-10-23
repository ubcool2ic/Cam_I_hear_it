<!-- File: docs/PLAN.md | Roadmap, feasibility, and platform decision for Cam_I_hear_it -->
# Cam_I_hear_it: Project Plan

## Project map
| What | Where |
|---|---|
| Acoustics research (cited): firing math, lope, knock, phone limits, distance/position, exterior position + noise environment scheme | [docs/RESEARCH_ACOUSTICS.md](RESEARCH_ACOUSTICS.md) |
| DSP library (TypeScript): RPM, cylinder hypotheses, lope, features | [lib/](../lib/README.md) |
| Capture website (static, iPhone-first). Run locally with `npx serve web` | [web/](../web/README.md) |
| OpenRouter spend log for model-assisted coding | [docs/SPEND.md](SPEND.md) |

## 1. What sound can and can't tell us

| Target | Feasibility | How |
|---|---|---|
| Idle RPM | High | 4-stroke firing frequency f = RPM/60 x cyl/2. Find the fundamental with FFT/cepstrum/autocorrelation. Cylinder count is needed to break the ambiguity. |
| Cylinder count / layout | Medium-high | Harmonic pattern and pulse spacing. A cross-plane V8 has an uneven half-order "burble"; inline-4 and flat-plane are even. |
| Idle stability / lope | High | Cycle-to-cycle variation of pulse timing and amplitude. A lope score maps well to "how big is the cam." |
| Cam spec class | Medium (as a class) | Classify stock / mild / big from the lope score, with labeled clips. |
| Exact cam specs (duration, LSA, lift) | Low | Overlap affects sound but many specs sound alike, and exhaust, tune, and idle target all change it. The best we can do is a rough range ("~230+ @.050, tight LSA") with a confidence score. |
| Engine family | Medium-low | ML on labeled clips. Exhaust and mufflers mask a lot. |
| Rod knock / lifter tick / exhaust leak | Medium | Event detection at 0.5x or 1x cam order, with a hood-open mic near the source. Many diagnostic apps already prove this works. |
| Spark knock / ping | Low at idle | Detonation mostly happens under load. Use a revving or load test and contact sensing; at idle, label it "not testable." |

## 2. Platform decision

**Recommendation: webpage first (iPhone mic), custom hardware later as an optional pro add-on.**

### Webpage / PWA (Phase 1)
- getUserMedia with `echoCancellation`, `noiseSuppression`, and `autoGainControl` all requested off, at 48 kHz. **Research update:** iOS Safari may honour only `echoCancellation` (WebKit bug 311451, caniuse), so the app logs `track.getSettings()` in every payload and relies on timing/ratio features. Verify on a real iPhone ([RESEARCH_ACOUSTICS §7](RESEARCH_ACOUSTICS.md#7-phone-microphone-limits)).
- DSP runs in the browser (an AudioWorklet plus WASM/JS FFT), so it works offline and costs nothing per scan.
- A guided capture flow: tailpipe 30 s, then hood open 30 s, then a blip to 2,000 rpm.
- Pros: zero hardware, instant to share. Cons: phone mic roll-off (about −3 dB at 50 Hz, −12 to −15 dB at 20 Hz per Faber Acoustical), placement variation, and ambient noise.

### Custom hardware (Phase 3, optional)
- A piezo contact mic or MEMS accelerometer on the block or valve cover, plus a measurement mic, using an ESP32-S3 or Pi with an I2S ADC.
- **Ground truth:** pair with the Macchina M2 (ubcool2ic/macchina) to log OBD RPM, and later timing and knock retard, alongside audio. This builds a labeled dataset no app has.
- Pros: way better fault detection and real labels. Cons: cost, install, and not instant.

## 3. Phases
1. **P0 Dataset + baseline DSP.** Record clips with OBD RPM ground truth (Macchina). Build a Python notebook for the RPM estimator and lope score. Target: RPM within ±25 at idle on 90% of clips.
2. **P1 Web MVP.** iPhone PWA: record, show RPM, cylinders, lope score, and spectrogram. Save clips (with consent) to grow the dataset.
3. **P2 ML classifiers.** Cam class (stock/mild/big), layout, and a fault detector (tick/knock/leak). Public clips (YouTube cam-sound videos with known specs) are useful but need labeling and licensing care.
4. **P3 Hardware kit.** Contact sensor plus an M2 sync logger for shops and enthusiasts.
5. **P4 Engine family ID.** Only once the dataset is large.

## 4. Open decisions
- Public product or personal tool?
- Hosting for the web app. GitHub Pages is free for public repos, but a private repo needs a paid plan. Pages can serve only the repo root or `/docs` unless an Actions workflow publishes `web/`.
- Dataset privacy and storage.
- **Exterior position picker (in PR #1):** a top-down outline with a ring of tappable spots around the outside of the car (driver/passenger via LHD/RHD), a separate engine-bay spot, and an optional noise-environment form. Fields and the noise-compensation plan are in [RESEARCH_ACOUSTICS §10](RESEARCH_ACOUSTICS.md#10-exterior-standing-position-and-noise-environment-website-picker). Open: when to implement §10.4 compensation in lib/.
