<!-- File: lib/README.md | Usage and API overview of the Cam_I_hear_it TypeScript DSP library -->
# lib/: Cam_I_hear_it DSP library

This is a small, dependency-free TypeScript library. It builds to ES2020 ES modules and runs unchanged in browsers and Node 18+.

```bash
cd lib
npm install      # dev deps only: typescript, @types/node
npm test         # tsc build + node:test on synthetic signals
npm run web      # build + copy dist/src/*.js into ../web/lib/
```

## API (src/index.ts)

| Module | Exports |
|---|---|
| fft.ts | `fftInPlace`, `powerSpectrum`, `nextPow2` |
| window.ts | `makeWindow`, `frameSignal`, `removeDC`, `lowpassFir`, `decimate`, `envelope` |
| spectrum.ts | `welch` → `Spectrum`, `noiseFloor`, `peakSnrDb`, `peakFrequency`, `parabolicPeak` |
| pitch.ts | `hpsF0`, `cepstrumF0`, `autocorrF0`, `autocorrelation` |
| engine.ts | `rpmFromFiring(f, N)`, `firingFromRpm`, `orderHz`, `scoreCylinderHypotheses`, `refineFiring` |
| lope.ts | `detectPulses`, `lopeScore` → intervalCov / cycleCov / ampCov / score 0–100 |
| bands.ts | `bandEnergies`, `orderEnergies`, `spectralCentroid`, `spectralFlatness`, `DEFAULT_BANDS` |
| features.ts | `analyzeClip(samples, sampleRate, {cylinders?})` → `FeatureVector`, `featuresToJSON`, `FEATURE_SCHEMA` |

```js
import { analyzeClip, featuresToJSON } from "./lib/index.js";
const fv = analyzeClip(float32Samples, 48000, { cylinders: 8 });
console.log(fv.rpm.estimate, fv.lope.score);
send(featuresToJSON(fv));
```

## Method notes
- **RPM and cylinders:** a joint grid search over (N, RPM). The score adds firing-harmonic SNR and cycle-rate (half-order) evidence, subtracts unexplained sub-harmonic energy, and applies an idle-RPM prior. The winner is refined from harmonic peak positions. See docs/RESEARCH_ACOUSTICS.md §1.
- **Lope:** detects envelope peaks, then computes per-slot CV of firing intervals and per-cycle-normalised amplitudes. The 0–100 score is `100·(1−exp(−(12·intervalCov + 3·ampCov)))`. The constants are **heuristic**: they were chosen so that the synthetic smooth case is about 20 and the jittery case is about 90. Recalibrate them on labelled clips. See §3.
- **Weights** in `scoreCylinderHypotheses` were tuned on synthetic signals only. Expect to re-fit them on real recordings.
