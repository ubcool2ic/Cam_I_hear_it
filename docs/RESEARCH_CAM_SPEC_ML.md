<!-- File: docs/RESEARCH_CAM_SPEC_ML.md | Research: identifying camshaft specs (duration, LSA, ICL, lift) from idle sound with machine learning: physics, signals beyond hearing, ML design, data plan, prior art, feasibility and roadmap -->

# Cam_I_hear_it: Identifying Cam Specs from Sound (ML Research)

**Question (Tyler):** can we train a model on recordings of cars whose cam card we know (e.g. "212/218 @.050, 112 LSA, .550 lift") and then estimate those numbers for a new car from sound, including cues human ears don't pick up?

**Conventions.** Tags like [VT1] point to §9 Sources, which have the URLs. **(derived)** means arithmetic from a cited formula. **(assumption)** means our engineering judgement, not supported by a source. **(uncertain)** means a source exists but is indirect or the direction is not proven. Design recommendations in §4, §5 and §8 are our proposals, not findings. Sources were checked in October 2026. Drafting was assisted by an LLM via OpenRouter (see [SPEND.md](SPEND.md)); every citation was then checked by hand against the DOI, publisher or patent record. Background acoustics (firing math, lope as cycle-to-cycle variation, phone limits, positions) is in [RESEARCH_ACOUSTICS.md](RESEARCH_ACOUSTICS.md) and is linked here rather than repeated.

> **Bottom line**
> - **Nobody has published this.** We found no paper or patent that estimates aftermarket cam specs (duration, LSA, lift) from airborne sound. The closest work times valve closing from **head-mounted vibration sensors with a crank reference** [DET1, PAT1, PAT2, VC5]. So this is an open research problem, not a known recipe.
> - **What sound mostly carries is overlap.** Idle "lope" is cycle-to-cycle combustion variation driven largely by residual gas from valve overlap [RES1, RES2]. Overlap @.050 = (int dur + exh dur)/2 − 2·LSA [CAM2], so duration and LSA trade off: a short cam on a tight LSA and a longer cam on a wide LSA can have the same overlap **(derived)**.
> - **Identifiability ranking (hypothesis):** overlap / lope class > LSA > average duration > ICL/advance (needs a crank reference) > intake vs exhaust split > lift > ramp rates. Lift is probably close to invisible at idle **(assumption)**.
> - **"Sounds you can't hear" exist but are small.** Valve seating dominates vibration at 10–20 kHz [VT1], within a phone's 24 kHz Nyquist limit **(derived)**. Pulling it out needs crank-angle resampling and averaging over many cycles [SP1, DET1]. A phone mic is not flat up there [MIC1], and nothing above 24 kHz is captured.
> - **Recommended approach:** multi-output regression (int/exh duration, LSA, lift), plus a coarse lope class and an "I can't tell" option. Use crank-angle features first, then pretrained audio models, with calibrated prediction intervals (CQR [ML6]) so the app says "likely 220–230 @.050, LSA 110–114" or abstains. Split train and test **by vehicle** [ML7, ML9].
> - **Data is the real cost.** We need roughly 30–50 labelled cars in one engine family to see whether there is any signal, and hundreds for useful ranges **(assumption)**. The best data is **before/after cam-swap recordings** of the same car. YouTube is only good for pretraining (72.8% → 18.4% accuracy drop [ML-A2]).

## Contents
1. [Cam specs and the math that links them](#1-cam-specs-and-the-math-that-links-them)
2. [Physics: how each spec could show up at idle](#2-physics-how-each-spec-could-show-up-at-idle)
3. [Signals beyond human hearing](#3-signals-beyond-human-hearing)
4. [ML design](#4-ml-design)
5. [Data plan](#5-data-plan)
6. [Prior art and the gap](#6-prior-art-and-the-gap)
7. [Feasibility and what accuracy is useful](#7-feasibility-and-what-accuracy-is-useful)
8. [Roadmap: phases A–D](#8-roadmap-phases-ad)
9. [Sources](#9-sources)

---

## 1. Cam specs and the math that links them

A cam card lists, for each lobe, the **duration** (crank degrees the valve is open) at a checking height. That is either "advertised" (often 0.006") or **@.050"** tappet lift. It also lists **lift**, **LSA** (lobe separation angle, in cam degrees between the intake and exhaust centrelines) and an install **ICL** (intake centreline, crank degrees after TDC). Street cams are often ground about 4° advanced [CAM1]. COMP measures .050 duration at the tappet [CAM5]. Advertised and .050 figures can't be converted into each other without the card [CAM3].

Formulas [CAM1, CAM2, CAM3], with IO in degrees BTDC, IC in degrees ABDC, EO in degrees BBDC and EC in degrees ATDC:

| Quantity | Formula |
|---|---|
| Duration | IO + 180 + IC (intake), EO + 180 + EC (exhaust) |
| Intake centreline | ICL = int dur/2 − IO |
| Exhaust centreline | ECL = exh dur/2 − EC |
| LSA | (ICL + ECL)/2 |
| Advance | LSA − ICL |
| Event times from centrelines | IO = dur/2 − ICL; IC = dur/2 + ICL − 180; EO = dur/2 + ECL − 180; EC = dur/2 − ECL |
| Overlap | IO + EC = (int dur + exh dur)/2 − 2·LSA |

On asymmetric lobes, the centreline from event midpoints can differ from the peak-lift position [CAM3].

### 1.1 Worked example: 212/218 @.050 on 112 LSA, installed 4° advanced (ICL 108, ECL 116)

| Event @.050 | Value | Meaning |
|---|---|---|
| IO | 212/2 − 108 = **−2°** | opens 2° **after** TDC **(derived)** |
| IC | 106 + 108 − 180 = **34° ABDC** | **(derived)** |
| EO | 109 + 116 − 180 = **45° BBDC** | **(derived)** |
| EC | 109 − 116 = **−7°** | closes 7° **before** TDC **(derived)** |
| Overlap | −2 + (−7) = **−9°** = 215 − 224 | **(derived)** |

Negative overlap at .050 is normal for mild cams. PowerNation's example, Chevrolet Performance's 350 HO cam at 212/222, gives −8° [CAM2]. This cam should idle fairly smoothly **(assumption)**. Advertised overlap is positive but unknown without the card **(uncertain)**.

**Contrast:** 230/236 @.050 on 108 LSA gives overlap = 233 − 216 = **+17°** **(derived)**. A 26° swing in .050 overlap is the kind of difference sound has the best chance of seeing.

### 1.2 How big the timing changes are at idle

- At 750 rpm the crank turns 4,500°/s, so 1° of crank = **0.222 ms = 10.7 samples at 48 kHz** **(derived)**.
- Adding 10° to both durations at a fixed LSA and ICL moves each opening and closing event 5° outward and raises overlap by 10°. That 5° is **1.1 ms** at 750 rpm **(derived)**.
- Changing LSA by 1° at a fixed advance moves ICL and ECL by 1° each as quoted and changes overlap by 2° **(derived)**.
- So the per-event timing differences between cams are on the order of 1 ms. That is resolvable at 48 kHz *if* the event can be found in the signal at all. The hard part is detection, not sample rate **(assumption)**.

---

## 2. Physics: how each spec could show up at idle

### 2.1 Overlap and LSA: residual gas, reversion, lope, vacuum

- At idle the manifold is at deep vacuum. During overlap, exhaust flows back into the intake (**reversion**), raising the **residual gas fraction**. More overlap means more residuals [RES1]; details are in [RESEARCH_ACOUSTICS §3](RESEARCH_ACOUSTICS.md#3-cam-overlap-lsa-lope-and-cycle-to-cycle-variation).
- Residuals dilute the charge and increase **cycle-to-cycle variation (CCV)**. COV of IMEP above 10% is unstable running. In Hinze & Cheng's idle study (as summarised by Duan et al.), air, residual and fuel variation contributed 5.5%, 4.4% and 0.64% of IMEP variation [RES2].
- SAE 972936 found that moving the overlap centre 10° ATDC **increased** burn duration and cyclic IMEP variation even though the residual fraction fell. Effective compression ratio was the most important factor [RES1]. **Overlap position (i.e. ICL), not just overlap size, matters**, and compression is a confounder.
- COMP's guidance [CAM4]: **tightening LSA** reduces idle vacuum, hurts idle quality, increases overlap and natural EGR, and raises cylinder pressure. Widening LSA does the opposite.
- **Acoustic path:** uneven cycles mean the crank slows and recovers (timing jitter), and the exhaust pulses vary in strength. That energy shows up at half-orders and in the CV of pulse timing and amplitude, which is our existing lope score ([RESEARCH_ACOUSTICS §1, §3](RESEARCH_ACOUSTICS.md#1-four-stroke-firing-math-engine-orders-and-half-orders)).
- **Intake vacuum** is a strong, cheap overlap proxy. On EFI cars the Macchina M2 can read MAP if the car reports it **(assumption: PID support varies)**. On carb cars, a vacuum gauge reading typed into the form would be a useful label-side feature **(assumption)**.

### 2.2 Event timing inside the 720° cycle

- **EVO / blowdown.** Exhaust opening releases cylinder pressure as a pulse, which is the main exhaust "beat". Studies of impulse exhaust noise show that the valve **opening process** (how fast flow area grows) shapes the peak and impulsiveness of the pulse. That evidence comes from pneumatic poppet valves, not engines, so the analogy is **(uncertain)** [EXH1]. Earlier EVO releases higher pressure, but whether that changes the airborne pulse shape enough to measure behind a muffler is **(uncertain)**.
- **IVO and EC around TDC** set overlap (§2.1). **IVC** sets trapped charge and effective compression [CAM4]. Retarding the cam delays intake closing, which mainly shows up as idle quality and vacuum, not as a distinct sound event **(assumption)**.
- **Intake vs exhaust pulse timing.** With an absolute crank reference, the tailpipe pulse onset follows EVO plus the gas-path delay. That delay depends on exhaust gas temperature and pipe length ([RESEARCH_ACOUSTICS §9.6](RESEARCH_ACOUSTICS.md#9-sound-vs-distance-and-microphone-position)), so absolute EVO from tailpipe audio is not recoverable without calibration **(assumption)**. Engine-bay audio is closer to the valve events but mixes all cylinders.

### 2.3 Valvetrain mechanical events: opening and closing "ticks" (>5 kHz)

- Valve-train vibration has two sources: **cam/tappet interaction force** and **valve seating impact**. Both matter up to about 6 kHz, while **seating impact alone dominates 10–20 kHz**. Valve-train vibration is characterised above 3 kHz, but its share of overall SPL is negligible [VT1]. It is real but quiet.
- Cam **ramps** set how hard the valve lands. Traditional ramp designs can make follower vibration, spring surge and noise worse [VT2]. NVH-friendly designs aim for low seating velocity and acceleration, while performance profiles want fast opening and closing [VT4]. Which of seating velocity, acceleration or jerk matters most was studied with DOE on a motored engine [VT3].
- **Mechanical (solid) lash** makes harsh impulsive noise as the cam picks up or leaves the follower on the ramp [VT5]. A solid-lifter cam will look "louder" in the high band than a hydraulic one with similar timing **(assumption)**. Lifter type is therefore a confounder and should be a form field.
- **In time, a single tick is unreliable.** SAE 2007-01-1288 found time-domain valve signatures were not consistent cycle to cycle. Closure was wideband, and was detected reliably at the sensor's resonant frequency with a narrow band-pass after a reasonable number of cycles [DET1].

### 2.4 Lift

- At idle the throttle (or IAC) limits airflow, not the valve curtain area. So peak lift should change idle gas dynamics very little **(assumption)**.
- Lift could appear indirectly through spring load and valve-train dynamics, or through correlation within a cam family. Catalog cams with longer duration also tend to have more lift **(assumption, to verify against [CAM5] tables)**. A model may "predict lift" by learning that correlation, which is fine as a prior but is not measurement **(assumption)**.

### 2.5 Confounders

| Confounder | Why it matters | Mitigation |
|---|---|---|
| Ignition timing, idle airflow, AFR (tune) | Changes CCV and pulse strength with no cam change; can mimic or hide lope **(assumption)** | Form fields; M2 logs of spark advance/MAP where available; gold cam-swap data with the tune noted |
| Carb vs EFI | Fuel variation contributes to CCV [RES2]; carb mixture distribution differs **(assumption)** | Condition on fuel system |
| Idle RPM | Sets crank speed, firing frequency and how much time overlap lasts in ms **(derived)**; lumpy cams usually run with a higher idle target **(assumption)** | Measure RPM (audio + M2); include it as an input; record a fixed 1,500 rpm hold too |
| Exhaust (headers, X/H pipe, mufflers, cutouts) | Large transfer-function changes ([RESEARCH_ACOUSTICS §4](RESEARCH_ACOUSTICS.md#4-exhaust-and-muffler-transfer-effects-and-how-to-compensate)) | Exhaust form field; engine-bay position; EQ augmentation |
| Heads, compression ratio, displacement | Effective compression was the top factor for idle CCV [RES1] | Form fields; within-family models first |
| VVT phasing (Coyote, Gen V LT, modern OHC) | ECU commands cam angle targets by operating point, so idle timing depends on the tune, not only the card [VVT1] | Log cam angle via OBD if available; otherwise exclude or flag VVT engines |
| Lifter type (hydraulic vs solid, flat vs roller) | Changes high-band impact energy [VT5] | Form field |
| Mic, position, distance, AGC | iOS Safari may not honour AGC-off; HF response is directional ([RESEARCH_ACOUSTICS §7](RESEARCH_ACOUSTICS.md#7-phone-microphone-limits), [MIC1]) | Fixed positions; log `getSettings()`; timing/ratio features |
| Cam-family correlation | Duration, lift and LSA move together in catalogs **(assumption)** | Report per-target error and a part-number holdout test (§4.6) |

### 2.6 Identifiability ranking (hypotheses to test, not results)

| Rank | Spec | Main acoustic path | Confounded by | Expected identifiability (phone only) |
|---|---|---|---|---|
| 1 | **Overlap @.050 / lope class** | CCV → timing and amplitude jitter, half-orders [RES1, RES2] | Tune, compression, idle RPM, vacuum leaks | **Moderate** **(assumption)** |
| 2 | **LSA** | Via overlap (and idle vacuum) [CAM4] | Duration (same overlap, different LSA) | **Low–moderate**; mostly through overlap plus priors **(assumption)** |
| 3 | **Average duration @.050** | Via overlap; event spacing in high band if detectable | LSA; exhaust; RPM | **Low** alone, better with off-idle holds **(assumption)** |
| 4 | **ICL / advance** | Overlap *position* changes CCV [RES1]; absolute timing needs TDC | No crank reference in audio | **Very low without a crank reference**; possible with hardware (§3.6) **(assumption)** |
| 5 | **Intake vs exhaust split** | Separate intake vs exhaust event detection | Mixed sources, positions | **Very low** **(assumption)** |
| 6 | **Lift** | Indirect only (spring/valvetrain dynamics, family correlation) | Throttle-limited flow at idle | **Near zero as measurement** **(assumption)** |
| 7 | **Ramp rates** | Seating impact level, 10–20 kHz [VT1, VT2] | Lash, lifter type, mic HF response | **Near zero on a phone**; head sensor needed **(assumption)** |

---

## 3. Signals beyond human hearing

### 3.1 What a phone can and can't capture

- **Top end:** WebAudio at 48 kHz gives a 24 kHz Nyquist limit **(derived)**. Nothing ultrasonic is captured. iPhone high-frequency response varies strongly above about 10 kHz and is directional, with an unusual directivity at 16 kHz on the 17 Pro [MIC1]. High-band features must therefore be compared **within one position and one phone model**.
- **Bottom end:** about −3 dB at 50 Hz and −12 to −15 dB at 20 Hz ([RESEARCH_ACOUSTICS §7](RESEARCH_ACOUSTICS.md#7-phone-microphone-limits)). A V8 at 600 rpm has 5 Hz cycle and 40 Hz firing frequencies **(derived)**, so infrasound and the cam order are not usable directly. Use harmonics and timing instead.
- **Processing:** AGC/noise suppression may stay on in iOS Safari (§7 of the acoustics doc). Favour timing and ratio features.

### 3.2 What "beyond hearing" really means here

Humans hear lope (CCV) well. What we don't consciously track:
- **Statistics of timing jitter** over hundreds of cycles (distribution shape, autocorrelation, which cylinders are weak).
- **Envelopes of the 3–20 kHz band locked to crank angle.** Each tick is buried, but the average over many cycles may show where in the 720° cycle the valve events sit [DET1, SP1].
- **Phase relationships** between the exhaust pulse and the high-band events within each cycle.

All of these are **(assumption)** until shown on our data. They are the reason to use ML plus angle-domain processing rather than just listening.

### 3.3 Crank-angle resampling (order tracking without a tach)

1. Estimate instantaneous speed ω(t) from the audio by tracking a firing harmonic. Adaptive frequency tracking from a single microphone has been shown for turbo speed [SP3].
2. Integrate to get crank angle θ(t). Resample the audio to uniform angle steps (e.g. 0.5–1° per sample **(assumption)**) across 720° cycles. This is the angular-sampling step of cyclostationary engine analysis [SP1].
3. **Macchina M2 RPM** is a low-rate anchor. It fixes the cylinder-count ambiguity and drift, but OBD rates are too slow for per-degree angle; the IMEKO study logged OBD at 10 samples/s [ML-A3]. Audio has to supply intra-cycle speed **(derived from the rate)**.
4. **Phase ambiguity:** without a TDC reference, the angle has an unknown offset (and a 360° ambiguity). Relative timings within the cycle (e.g. blowdown to high-band event) are usable; absolute ICL is not **(assumption)**.

### 3.4 Angle-synchronous averaging and cyclostationarity

- **Synchronous averaging** over many cycles keeps components locked to crank angle and averages out the rest [SP1].
- Combustion and impact events **jitter** from cycle to cycle, so they are not perfectly phase-locked. **Spectral correlation / squared-envelope** analysis captures them. Integrated spectral correlation equals the Fourier transform of the average squared envelope [SP2]. In practice, band-pass at 3–6 kHz and 10–20 kHz, take the squared envelope, then average it in the angle domain **(assumption: band choice from [VT1])**.
- **Per-cycle features:** for each 720° cycle, extract pulse timing, pulse amplitude, high-band envelope peak angles and their spread. Use the per-cycle distribution (mean, SD, skew) as features.

### 3.5 Why narrow-band, many-cycle detection

SAE 2007-01-1288's finding [DET1] applies directly. A single valve-closing event is inconsistent in the time domain. It becomes reliable after band-limiting near a structural resonance and accumulating enough cycles. A phone in the engine bay hears radiated sound, not the head's vibration, so expect weaker results than a knock sensor **(assumption)**.

### 3.6 Optional hardware (only if phone-only stalls)

| Add-on | Why | Notes |
|---|---|---|
| Accelerometer on head or valve cover (ADXL1002) | Direct seating vibration; no room acoustics | 11 kHz 3 dB bandwidth, 21 kHz resonance [HW2] |
| Piezo knock sensor (Bosch KS4-P) | Same principle as [DET1, PAT1–PAT3] | 3–25 kHz range, linear 5–15 kHz [HW3] |
| Ultrasonic MEMS mic (Knowles SPU0410LR5H-QB) at ≥96 kHz | Captures above 24 kHz | 100 Hz–80 kHz but not flat; needs calibration [HW1]; whether useful seating energy exists above 24 kHz is **(uncertain)** |
| Crank/TDC reference | Unlocks absolute ICL and event angles | Tap the crank/cam sensor, or an inductive pickup on #1 plug lead **(assumption: practical idea, unsourced)** |

All channels must share **one sample clock**: 1 ms is 4.5° at 750 rpm ([RESEARCH_ACOUSTICS §9.6, §11](RESEARCH_ACOUSTICS.md#11-multi-mic-contact-mic-and-accelerometer-approaches-band-choices)).

---

## 4. ML design

### 4.1 Targets and outputs

- **Multi-output regression:** intake dur @.050, exhaust dur @.050, LSA, lift. ICL is a target only where it is known (degreed in). **Overlap @.050 is derived** from the predictions (§1) and also trained as an auxiliary target.
- **Quantiles, not just points:** predict the 5th/50th/95th percentiles for each target, then calibrate (§4.7).
- **Coarse class fallback:** for example stock / mild / street / big-lope bins, defined on overlap @.050. The bin edges are to be set from data **(assumption)**.
- **Abstain:** output "can't tell from this recording" when the calibrated interval is too wide or the input is out of distribution (VVT engine with no phaser data, wind, wrong position).

### 4.2 Features (two parallel paths)

| Path | Features |
|---|---|
| Low band, angle domain (<3 kHz) | Order spectrum including half-orders; per-cycle pulse timing and amplitude CV (our lope score); cycle-averaged waveform per position over 720°; jitter autocorrelation |
| High band, angle domain (3–20 kHz) | Band-passed squared envelope, synchronously averaged over 720° [SP1, SP2]; peak angles relative to the blowdown pulse; per-cycle spread |
| Time–frequency | Log-mel (wideband, up to 24 kHz); CQT [SP4] for log-spaced resolution at low orders; angle-domain spectrogram (frequency vs crank angle) |
| Metadata | Make, model, engine, displacement, cylinders, carb/EFI, exhaust type, heads, compression if known, lifter type, VVT yes/no, position label, phone model, `getSettings()`, measured RPM (audio + M2), MAP if available |

### 4.3 Models, in order

1. **Baseline:** gradient-boosted trees on the hand features plus metadata. They are fast, interpretable via feature importance, and work with tens of cars **(assumption)**.
2. **Small CNN** on angle-domain spectrograms and cycle-averaged waveforms.
3. **Pretrained audio encoders**, frozen first, then fine-tuned: PANNs [ML1], AST [ML2], BEATs [ML3], wav2vec 2.0-style raw-waveform models [ML4]. These were trained on AudioSet or speech at **16–32 kHz**, so they ignore our high band. Check each model card **(uncertain per checkpoint)**. Use them for the low/mid band and keep a separate high-band branch.
4. **Fusion head:** concatenate the embedding, angle features and metadata, then output quantile regression and class heads.

### 4.4 Conditioning on true RPM

Feed M2 RPM (or the audio estimate when M2 isn't there) as an input. Also use it to drive the angle resampling. Train with and without M2 so the model degrades gracefully **(assumption)**.

### 4.5 Augmentation

- Gain changes; mixing in background noise (shop, wind, crowd); SpecAugment-style time/frequency masking [ML5]; random exhaust-EQ filters (acoustics §4).
- **Avoid naive time-stretch or pitch-shift.** Changing playback speed changes RPM and event spacing, which is the very physics the model must learn **(assumption)**. If needed, resample in the angle domain and keep the RPM label consistent.

### 4.6 Leakage-safe evaluation

- Clips from the same car must never appear in both train and test. Leakage gives falsely good results [ML7]. Use **GroupKFold by vehicle** [ML9].
- Run a harder test that **holds out whole cam part numbers**, so the model can't memorise "this exact grind".
- Keep separate test sets per engine family. Report results per family.
- **Cam-swap pairs:** test whether the model predicts the right **direction and size of change** between before and after recordings.

### 4.7 Uncertainty and the app message

- **Conformalized quantile regression (CQR)** [ML6]: train quantile heads, then widen the intervals on a held-out calibration set (split by vehicle) so that, for example, 90% intervals really cover about 90% of new cars, under exchangeability. Deep ensembles [ML8] are an alternative or add-on for epistemic uncertainty.
- App output: **"Likely 220–230° @.050, LSA 110–114 (90% range). Lift: can't tell from sound."** If the interval is wider than a useful width (§7), show only the lope class.

### 4.8 Metrics

- MAE in degrees per target.
- Interval coverage and mean width.
- Class accuracy and a confusion matrix.
- Abstain rate.
- Cam-swap delta sign accuracy.
- All of the above per engine family.

---

## 5. Data plan

### 5.1 Labels

- **Cam card lookup:** the user enters brand + part number, and we look up the specs from the manufacturer's catalog. COMP's master reference lists advertised duration, duration @.050, valve lift and LSA per part, e.g. 10-201-4 "260H" (AMC 290–401) = 212/212 @.050 on 110 LSA [CAM5]. Store the source and page for each label.
- **Installed ICL** if the cam was degreed; otherwise "as ground" plus a flag **(uncertain label)**.
- **Stock cams:** OEM specs. Mark the label quality (card / catalog / forum claim).
- **Label-quality field:** gold (card + degreed), silver (part number), bronze (owner says "about 230").

### 5.2 Gold data: before/after cam swaps

Record the same car, same exhaust, same positions and same phone, before and after a cam swap. This isolates the cam from every confounder in §2.5 and is the most valuable data per hour **(assumption)**. Ask installers to record both sessions.

### 5.3 Where to get cars

- Dyno shops and cam installers (best for gold pairs and good tune notes).
- Car meets and cruise nights (volume).
- Forums and clubs for specific engine families (LS, SBC, Coyote, Hemi).
- **YouTube / web only as weak or pretraining data.** Terwilliger & Siegel saw cylinder-count accuracy fall from 72.8% to 18.4% on YouTube audio, and misfire detection from 87.0% to 64.4%. YouTube audio is cut near 16 kHz [ML-A2], which removes much of the high band.
- Consent for every upload, as already built into the app.

### 5.4 How many cars (rough guide)

| Goal | Cars / distinct cams | Basis |
|---|---|---|
| "Is there any signal?" within one family (e.g. LS or SBC) | 30–50 | **(assumption)** |
| Useful ranges within one family | 200–500 | **(assumption)** |
| Cross-family model | 1,000+ | **(assumption)** |
| Gold swap pairs | 10–20 early, more later | **(assumption)** |

For comparison, the valve-clearance CNN in [VC4] used tens of thousands of training vectors, but cut from a single engine under controlled speeds and loads. Our variation between cars is much larger, so per-car diversity matters more than hours of audio **(assumption)**.

### 5.5 Recording protocol

Use the existing capture guide ([RESEARCH_ACOUSTICS §9.8](RESEARCH_ACOUSTICS.md#9-sound-vs-distance-and-microphone-position)):
1. **Warm engine** (normal operating temperature). A/C off; note whether the fan is running.
2. **Ambient, 5 s, engine off**, at the next position.
3. **Tailpipe, 30–60 s**, 0.5 m from the outlet at 45°, at pipe height.
4. **Engine bay, hood open, 30–60 s**, 20–40 cm above the valve cover (the high-band and valvetrain position).
5. **Front wheel well, 15–30 s** (optional third position, bank comparison).
6. **Steady 1,500 rpm hold, 10 s**, at the tailpipe if safe. Off-idle holds may help separate duration from LSA **(assumption)**.
7. Log M2 RPM (and MAP/spark/cam angle if available), phone model and `getSettings()`.
8. Form fields: cam brand/part, label quality, installed ICL, lifters, VVT, exhaust, heads/CR, carb/EFI, idle target, tune notes.

---

## 6. Prior art and the gap

| Area | Work | What it shows | Sensor |
|---|---|---|---|
| Valve event timing | SAE 2007-01-1288 (Scheuerell & Pakkala) [DET1] | Closure detected at the knock-sensor resonance after many cycles; time domain inconsistent | Knock sensor |
| | US 10,760,543 (Innio Jenbacher / GE) [PAT1] | ADSR-envelope fingerprint plus a statistical model; the crank angle of the head-vibration trigger tracks valve closing, timing drift and lash | Knock sensor + crank sensor |
| | DE 10 2014 203 687 (Schaeffler) [PAT2] | Valve closing time from knock signal: filter, window, area centroid minus delays | Knock sensor |
| | US 7,089,895 (Motorola) [PAT3] | Seating impulse from knock sensor correlated with valve accelerometers; reduce seating velocity | Knock sensor + accelerometers |
| | US 6,167,852 (Fuji Heavy Industries) [PAT4] | Electromagnetic valve open/close times from head vibration vs rpm-dependent thresholds | Head vibration sensor |
| | Gao, Hu & Zhou, ICPRE 2022 [VC5] | Intake/exhaust opening and closing timing on a marine 2-stroke diesel | Cylinder-cover vibration + flywheel phase |
| Valve clearance ML | Kuai & Huang 2023 [VC1] | WPD + NN; 98.3% low noise, 82.4% average with noise-injected training | Head vibration |
| | Zhao et al. 2020 [VC2] | VMD + random forest at variable speed | Head vibration |
| | Jing et al. 2017 [VC3] | FastICA + SVM, seven valve-train states | Head acceleration |
| | Tabaszewski et al. 2022 [VC4] | CNN; error <1% intake, <3.5% exhaust; 5 speeds × 5 loads | Triaxial head sensor |
| Camshaft by audio | Goli Karimabadi et al. 2024 [VC6] | Camshaft axial clearance on an end-of-line hot test; mel + CNN ~99% at 1,700/2,500 rpm, worse at 1,300 rpm (noise) | Handheld recorder (Zoom H4n) |
| Valvetrain NVH | SAE 1999-01-1711, 1999-01-0801, 930884, 2010-01-1108, 2005-01-1834 [VT1–VT5] | Seating dominates 10–20 kHz; ramps and lash drive impact noise | Lab |
| Vehicle audio ML | Siegel et al. 2016 [ML-A1]; Terwilliger & Siegel 2022 [ML-A2] | Phone-audio misfire and vehicle attributes; YouTube drop | Phone |
| | Fosalau, Maties & Zet 2022 [ML-A3] | Engine speed from audio with ML, OBD at 10 S/s | Phone |
| Engine ID by sound | HL-CEAD / Machine Biometrics [ID1] | Manufacturer ID, 22 features + MLP, 98.45% F1 on a small dataset (1000/1500/2000 rpm) | Recorder |
| | Wu et al. 2022 [ID2] | 84.28% on engine sounds from AudioSet/VGGSound | Web audio |
| | ICASSP 2020 [ID3] | Diesel vs petrol, HGV vs car, modulation-spectrum features | Urban recordings |
| Signal processing | Antoni et al. 2002 [SP1]; Randall, Antoni & Chobsaard 2001 [SP2] | Angle-domain cyclostationary engine analysis; spectral correlation ↔ squared envelope | Vibration |

**Gap.** Every published system that times valve events uses a **structure-mounted sensor plus a crank reference**, on a known engine, often with per-engine baselining [PAT1]. No published work estimates cam specs across **different** cars from **airborne** sound. Engine-ID work shows sound carries make/model identity [ID1, ID2]. That may help the model through priors (a Coyote sounds like a Coyote) but is not the same as measuring a cam **(assumption)**.

---

## 7. Feasibility and what accuracy is useful

| Target | Phone only | With head sensor + crank ref | Useful accuracy (proposal) |
|---|---|---|---|
| Lope / overlap class (4 bins) | **Plausible** | Plausible | ≥80% correct, rarely off by more than 1 bin |
| Overlap @.050 | Possible | Plausible | ±5° MAE |
| LSA | Possible, weak | Possible | ±2° MAE (a cam's LSA range is narrow, so worse than ±2° is not useful) |
| Avg duration @.050 | Possible, weak | Plausible | ±8–10° MAE (≈ one catalog step) |
| ICL / advance | Unlikely | Possible | ±2° |
| Int vs exh split | Unlikely | Possible | ±4° |
| Lift | Unlikely (prior only) | Unlikely | Broad class at best |
| Ramp rates | No | Research only | n/a |

All entries are **(assumption)** until Phase A results. "Useful" is judged against the alternative: today a person estimates "it's a big cam" by ear. A calibrated range that is right about 90% of the time is already more than that.

---

## 8. Roadmap: phases A–D

| Phase | Goal | Work | Data | Exit gate **(assumption: thresholds to revisit)** |
|---|---|---|---|---|
| **A. Collect + baseline** | Prove there is signal | Cam-card lookup and label-quality fields in the form; protocol in §5.5; current lope/order features + metadata → gradient-boosted trees; GroupKFold by vehicle | 30–50 cars, one family; 5+ swap pairs | Overlap @.050 MAE ≥25% better than predicting the median; swap-pair direction right ≥80% |
| **B. Crank-angle features** | Use cues beyond hearing | Audio-based speed tracking [SP3] + M2 anchor; angle resampling and synchronous averages [SP1]; squared-envelope high band [SP2]; per-cycle stats | 100–200 cars; 10–20 swap pairs | Angle features improve on A by a clear margin on vehicle-held-out folds; LSA or duration beats the median baseline |
| **C. Pretrained audio model** | Scale and calibrate | Frozen then fine-tuned PANNs/AST/BEATs embeddings [ML1–ML3] + high-band branch; quantile heads + CQR [ML6]; abstain; per-family reports | 300–500+ cars | 90% intervals cover ≥88% on held-out cars; median duration interval ≤ ±10° |
| **D. Hardware add-on** | Absolute event timing | Head accelerometer or knock sensor + optional ultrasonic mic + crank/TDC reference, one clock [HW1–HW3]; validate against degree-wheel data | 10–20 degreed engines | Valve closing angle within ±2° of dial-indicator data |

**Open questions**
1. Can overlap-driven CCV be separated from CCV caused by a lean mixture, late timing or a vacuum leak? The likely answer is only with tune metadata and swap pairs.
2. Does the engine-bay high band survive well enough on a phone to see seating events after averaging? Test early with one car and a phone in a fixed holder.
3. How much does iOS processing (AGC) distort per-cycle envelopes across iPhone models? ([RESEARCH_ACOUSTICS §7](RESEARCH_ACOUSTICS.md#7-phone-microphone-limits))
4. Are VVT engines in or out? Default to out unless cam angle is logged [VVT1].

**What we will not claim**
- An exact cam part number or grind from sound.
- Lift as a measurement.
- Cam specs on VVT engines without logged phaser angle.
- That the app replaces a degree wheel or a cam card.

---

## 9. Sources

**Cam math and catalogs**
- [CAM1] musclecardiy, "Camshaft Math to Design Competitive Performance Engines": https://www.musclecardiy.com/performance/camshaft-math-design-competitive-performance-engines/
- [CAM2] PowerNation, "Cam Timing Calculator: Valve Events & Centerline": https://www.powernationtv.com/calculators/cam-timing-calculator
- [CAM3] Fastime Performance, "Cam Timing Calculator": https://fastimeperformance.com/cam-timing-calculator
- [CAM4] COMP Cams, "Effect of Changes in Cam Timing and Lobe Separation Angle": https://www.compcams.com/cam-timing-lobe-separation-angle
- [CAM5] COMP Cams, Master Reference Guide (2016): http://msprodimages.com/BrandResources/COM/COM_Master_Referance_Guide_2016.pdf

**Combustion and residuals**
- [RES1] Sandquist, Wallesten, Enwald, Strömberg, "Influence of Valve Overlap Strategies on Residual Gas Fraction and Combustion in a Spark-Ignition Engine at Idle", SAE 972936 (1997): https://doi.org/10.4271/972936
- [RES2] Duan, Feng, Xia et al., "The mechanism and effect factors of the combustion cycle-to-cycle variations in the spark ignition engine", Energy Science & Engineering 12(10):4773–4787 (2024): https://doi.org/10.1002/ese3.1879

**Valvetrain noise and exhaust impulse**
- [VT1] Suh & Lyon, "An Investigation of Valve Train Noise for the Sound Quality of I.C. Engines", SAE 1999-01-1711: https://doi.org/10.4271/1999-01-1711
- [VT2] Norton, Eovaldi, Westbrook, Stene, "Effect of Valve-Cam Ramps on Valve Train Dynamics", SAE 1999-01-0801: https://doi.org/10.4271/1999-01-0801
- [VT3] Savage & Matterazzo, "Application of Design of Experiments to Determine the Leading Contributors to Engine Valvetrain Noise", SAE 930884: https://doi.org/10.4271/930884
- [VT4] Montazersadgh, "Development of an Automated Cam Profile Designer and Optimizer", SAE 2010-01-1108: https://doi.org/10.4271/2010-01-1108
- [VT5] Hwang, Kang, Lim, Lim, "Noise Reduction and Sound Quality Improvement of Valve Train in V6 Gasoline Engine", SAE 2005-01-1834: https://doi.org/10.4271/2005-01-1834
- [EXH1] Li & Zhao, "Optimization of valve opening process for the suppression of impulse exhaust noise", J. Sound Vib. 389:24–40 (2017), pneumatic poppet valves (analogy only): https://doi.org/10.1016/j.jsv.2016.11.015

**Valve event detection (vibration / knock sensor)**
- [DET1] Scheuerell & Pakkala, "Valve Event Detection Using Knock Sensor Signals", SAE 2007-01-1288: https://doi.org/10.4271/2007-01-1288
- [PAT1] US 10,760,543 B2, "System and method for valve event detection and control": https://patents.google.com/patent/US10760543B2/en
- [PAT2] DE 10 2014 203 687 (Schaeffler), "Verfahren zum Erfassen des Schließzeitpunkts von Gaswechselventilen über eine Auswertung eines Klopfsensorsignals": https://www.freepatentsonline.com/DE102014203687.html
- [PAT3] US 7,089,895 (Motorola), "Valve operation in an internal combustion engine": https://www.freepatentsonline.com/7089895.html
- [PAT4] US 6,167,852 (Fuji Jukogyo), "Valve opening and closing time detecting apparatus ... for electromagnetically operated valve mechanism": https://www.freepatentsonline.com/6167852.html
- [VC1] Kuai & Huang, "Fault Diagnosis of Diesel Engine Valve Clearance Based on Wavelet Packet Decomposition and Neural Networks", Electronics 12(2):353 (2023): https://doi.org/10.3390/electronics12020353
- [VC2] Zhao, Mao, Wei, Zhao et al., "Fault Diagnosis of Diesel Engine Valve Clearance Based on Variational Mode Decomposition and Random Forest", Applied Sciences 10(3):1124 (2020): https://doi.org/10.3390/app10031124
- [VC3] Jing, Liu, Bi, Bi et al., "Diesel Engine Valve Clearance Fault Diagnosis Based on Features Extraction Techniques and FastICA-SVM", Chinese J. Mech. Eng. 30(4):991–1007 (2017): https://doi.org/10.1007/s10033-017-0140-2
- [VC4] Tabaszewski, Szymański, Nowakowski et al., "Vibration-based identification of engine valve clearance using a convolutional neural network", Archives of Transport 61(1):117–131 (2022): https://doi.org/10.5604/01.3001.0015.8254
- [VC5] Gao, Hu, Zhou, "Experimental Study and Hardware Design of Diesel Engine Valve Timing Detection Based on Cylinder Cover Vibrations", ICPRE 2022, pp. 630–634: https://doi.org/10.1109/icpre55555.2022.9960605
- [VC6] Goli Karimabadi et al., "Diagnosing the clearance fault of the camshaft in the hot test stage at the end of the production line by using of audio signal processing", J. Nondestructive Testing Technology (2024): https://www.jndttech.ir/article_208803_1eb23112b3e212b2709c1ce37eebb8f9.pdf

**Vehicle / engine audio ML**
- [ML-A1] Siegel, Kumar, Ehrenberg, Sarma, "Engine Misfire Detection with Pervasive Mobile Audio", ECML-PKDD 2016, LNCS pp. 226–241: https://doi.org/10.1007/978-3-319-46131-1_26
- [ML-A2] Terwilliger & Siegel, "Improving Misfire Fault Diagnosis with Cascading Architectures via Acoustic Vehicle Characterization", Sensors 22(20):7736 (2022): https://doi.org/10.3390/s22207736 (full text https://pmc.ncbi.nlm.nih.gov/articles/PMC9612320/)
- [ML-A3] Fosalau, Maties, Zet, "Engine rotational speed estimation using audio recordings and machine learning algorithms", IMEKO TC4 2022, pp. 84–89: https://doi.org/10.21014/tc4-2022.16
- [ID1] Humain-Lab Car Engine Audio Database (HL-CEAD): https://github.com/MachineLearningVisionRG/machine_biometrics ; paper "Machine Biometrics: Towards Identifying Machines in a Smart City Environment", arXiv:2102.13190: https://arxiv.org/abs/2102.13190
- [ID2] Wu, Wan, Ge, Pan, "Car engine sounds recognition based on deformable feature map residual network", Scientific Reports (2022): https://pmc.ncbi.nlm.nih.gov/articles/PMC8854583/
- [ID3] Becker, Nelus, Gauer, Rudolph et al., "Audio Feature Extraction for Vehicle Engine Noise Classification", ICASSP 2020, pp. 711–715: https://doi.org/10.1109/icassp40776.2020.9053117

**Signal processing and hardware**
- [SP1] Antoni, Danière, Guillet, "Effective vibration analysis of IC engines using cyclostationarity. Part I: A methodology for condition monitoring", J. Sound Vib. 257(5):815–837 (2002): https://doi.org/10.1006/jsvi.2002.5062
- [SP2] Randall, Antoni, Chobsaard, "The relationship between spectral correlation and envelope analysis in the diagnostics of bearing faults and other cyclostationary machine signals", MSSP 15(5):945–962 (2001): https://doi.org/10.1006/mssp.2001.1415
- [SP3] Gagliardi, Tedesco, Casavola, "An Adaptive Frequency-Locked-Loop Approach for the Turbocharger Rotational Speed Estimation via Acoustic Measurements", IEEE TCST 29(4):1437–1449 (2021): https://doi.org/10.1109/tcst.2020.3007075
- [SP4] Brown, "Calculation of a constant Q spectral transform", JASA 89(1):425–434 (1991): https://doi.org/10.1121/1.400476
- [MIC1] Faber Acoustical, "Measured: iPhone 17 Pro microphone frequency response and directivity" (2025): https://www.faberacoustical.com/blog/2025/ios/iphone/measured-iphone-17-pro-microphone-frequency-response-and-directivity/
- [HW1] Knowles SPU0410LR5H-QB datasheet: https://media.digikey.com/pdf/Data%20Sheets/Knowles%20Acoustics%20PDFs/SPU0410LR5H-QB_RevH_3-27-13.pdf
- [HW2] Analog Devices ADXL1001/ADXL1002 datasheet: https://www.analog.com/media/en/technical-documentation/data-sheets/ADXL1001-1002.pdf
- [HW3] Bosch Motorsport, Knock Sensor KS4-P: https://www.bosch-motorsport.com/products/sensors/knock/knock-sensor-ks4-p/
- [VVT1] Ford Performance, "2011–2019 5.0L Coyote" tech guide: https://performanceparts.ford.com/download/instructionsheets/COYOTE_TECH_GUIDE_062819.PDF ; HP Academy, "Variable Cam Control Tuning: Cam Angle Targets": https://www.hpacademy.com/courses/variable-cam-control-tuning/ecu-control-strategies-cam-angle-targets/

**Machine learning**
- [ML1] Kong et al., "PANNs: Large-Scale Pretrained Audio Neural Networks for Audio Pattern Recognition", IEEE/ACM TASLP 28:2880–2894 (2020): https://doi.org/10.1109/taslp.2020.3030497 (arXiv:1912.10211)
- [ML2] Gong, Chung, Glass, "AST: Audio Spectrogram Transformer", Interspeech 2021: https://arxiv.org/abs/2104.01778
- [ML3] Chen et al., "BEATs: Audio Pre-Training with Acoustic Tokenizers", ICML 2023: https://arxiv.org/abs/2212.09058
- [ML4] Baevski et al., "wav2vec 2.0: A Framework for Self-Supervised Learning of Speech Representations", NeurIPS 2020: https://arxiv.org/abs/2006.11477
- [ML5] Park et al., "SpecAugment: A Simple Data Augmentation Method for Automatic Speech Recognition", Interspeech 2019: https://arxiv.org/abs/1904.08779
- [ML6] Romano, Patterson, Candès, "Conformalized Quantile Regression", NeurIPS 2019: https://arxiv.org/abs/1905.03222 (code https://github.com/yromano/cqr)
- [ML7] Kaufman, Rosset, Perlich, Stitelman, "Leakage in data mining: Formulation, detection, and avoidance", ACM TKDD 6(4) (2012): https://doi.org/10.1145/2382577.2382579
- [ML8] Lakshminarayanan, Pritzel, Blundell, "Simple and Scalable Predictive Uncertainty Estimation using Deep Ensembles", NeurIPS 2017: https://arxiv.org/abs/1612.01474
- [ML9] scikit-learn, GroupKFold: https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.GroupKFold.html
