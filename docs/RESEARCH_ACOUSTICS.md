<!-- File: docs/RESEARCH_ACOUSTICS.md | Cited research on engine acoustics, capture, and prior work that shapes Cam_I_hear_it's design -->
# Cam_I_hear_it: Acoustics Research Notes

This document collects the science behind each thing we try to hear. Every source has a URL. Numbers credited to a source come from that source. Anything marked **(derived)** is our own arithmetic from a cited formula. Anything marked **(assumption)** is a stated working guess that still needs measuring. Links were checked in October 2026.

Contents
1. Four-stroke firing math, engine orders and half-orders
2. Crank layout: cross-plane vs flat-plane V8, odd-fire engines
3. Cam overlap, LSA, lope and cycle-to-cycle variation
4. Exhaust and muffler transfer effects, and how to compensate
5. Knock acoustics (Draper modes) and why knock is rare at idle
6. Lifter tick, rod knock and exhaust leak signatures
7. Phone microphone limits (iPhone roll-off, AGC, Safari constraints)
8. Ambient noise and wind
9. Sound vs. distance and microphone position (front, sides, tailpipe)
10. Exterior standing position and noise environment (website picker)
11. Multi-mic, contact mic and accelerometer approaches; band choices
12. Prior work: papers, apps and datasets
13. What this means for Cam_I_hear_it

---

## 1. Four-stroke firing math, engine orders and half-orders

- In a four-stroke engine each cylinder fires once every two crank revolutions (720°). So one cylinder excites **order 0.5**, meaning half of crank speed. An evenly firing N-cylinder engine excites **order N/2**: 2nd order for an I4, 3rd for a six, 4th for a V8. Changing the firing order changes the half-order content (0.5, 1.5, 2.5 ...), while the integer orders stay put. Sources: Siemens "What's an order?" (https://community.sw.siemens.com/s/article/what-s-an-order); Dewesoft order-tracking notes (http://www.dewesolutions.sg/uploads/7/7/1/6/7716986/order-tracking.pdf); Cracow Univ. of Technology PhD on firing order and crank torsional vibration (https://repozytorium.biblos.pk.edu.pl/resources/45168).
- Firing frequency: **f_fire = (RPM / 60) × (N / 2)**. At 750 rpm a V8 fires at 50 Hz, crank order 1 is 12.5 Hz and the cam (cycle) order 0.5 is 6.25 Hz **(derived)**.
- Consequence: anything that differs from cylinder to cylinder (one weak cylinder, uneven exhaust merging, a single noisy lifter) repeats once per 720°. It shows up as energy at multiples of **RPM/120**, the cycle rate. A perfectly even engine has energy only at multiples of f_fire. Real engines fall between those two cases. That is why the cylinder count can't be fixed from f_fire alone: an I4 at 1500, a six at 1000 and a V8 at 750 all fire at 50 Hz **(derived)**. Breaking that tie takes the user's cylinder count, a plausible idle-RPM prior, or the sub-harmonic (half-order) pattern.

## 2. Crank layout: cross-plane vs flat-plane V8, odd-fire engines

- **Cross-plane V8:** firing is evenly spaced every 90° overall, but uneven within each bank. The typical bank pattern is LRLLRLRR, which gives per-bank intervals of 180-90-180-270°. Wikipedia credits the characteristic "burble" to the exhaust manifold merging each bank's four ports, which brings out this uneven pattern. Source: https://en.wikipedia.org/wiki/Crossplane. Hot Rod also discusses how the layout complicates scavenging: https://www.hotrod.com/how-to/v8s-inherent-layout-complicates-exhaust-scavenging
- **Flat-plane V8:** banks alternate evenly, so each bank behaves like an even-firing I4. The sound is smoother and has fewer half-order components (same Wikipedia article; see also Road & Track on the F355, https://www.roadandtrack.com/news/a43805754/ferrari-f355-exhaust-sound/).
- **Odd-fire V6 (Buick 231, early):** a 90° V6 with shared crankpins fires at alternating 90° and 150° intervals. The 1977-78 split-pin crank made it even-fire at 120°. Sources: SAE 770821 "Buick's New Even Firing 90° V-6 Engine" (https://doi.org/10.4271/770821); Curbside Classic (https://www.curbsideclassic.com/blog/tech/cc-tech-1978-buick-even-fire-v6-evening-the-odds/).
- **Consequence for us:** a microphone on **one tailpipe** of a dual-exhaust cross-plane V8 mostly hears one bank's uneven 180-90-180-270 pattern. That is a strong, physically grounded marker of the cross-plane layout, and it lives in the inter-pulse timing pattern and the half-orders. An X- or H-pipe, or a single merged exhaust, blurs the pattern **(derived from the bank-interval geometry above)**. The form should therefore ask about exhaust layout (in the mods box).

## 3. Cam overlap, LSA, lope and cycle-to-cycle variation

- At idle the manifold is at deep vacuum, so during valve overlap exhaust gas flows back into the intake. That raises the **residual gas fraction**. More overlap means more residuals. Sources: SAE 972936, "Influence of Valve Overlap Strategies on Residual Gas Fraction and Combustion in a Spark-Ignition Engine at Idle" (https://doi.org/10.4271/972936); a KSAE CFD study at idle (http://koreascience.or.kr/article/ArticleFullRecord.jsp?cn=JDCGCC_2006_v14n6_50); a KSAE measurement study reporting that residual fraction rose with overlap duration and that **at idle residual fraction correlated well with COV of IMEP** (http://dbpia.co.kr/Journal/ArticleDetail/NODE00526577).
- SAE 972936 also found that moving the overlap centre 10° ATDC **increased burn duration and cyclic IMEP variation even though the residual fraction fell**, and that effective compression ratio was the single most important factor. In other words, lope is not just "overlap duration". Cam timing and compression ratio matter too.
- A 2024 review (Duan et al., Energy Science & Engineering, https://scijournals.onlinelibrary.wiley.com/doi/10.1002/ese3.1879) gives these numbers:
  - COV of IMEP is the standard measure of cycle-to-cycle variation (CCV).
  - Citing Heywood, it says COV of IMEP above **10%** means unstable running and jitter, and possibly misfire.
  - It summarises Hinze & Cheng's idle study, where **air, residual and fuel variations contributed 5.5%, 4.4% and 0.64%** of IMEP variation, with residuals about one third.
- Sztenderowicz & Heywood (SAE 1990, "Cycle-to-Cycle IMEP Fluctuations in a Stoichiometrically-Fueled S.I. Engine at Low Speed and Load", https://www.lanfanshu.com/paper/61e50ba81561fc1002f627e5) attribute low-load IMEP fluctuations mainly to cycle-to-cycle variation in the amount of fuel burned.
- **Consequence:** "lope" is what CCV at idle sounds like. Weaker cycles mean the crank slows briefly (timing jitter), and their exhaust pulses are weaker (amplitude variation). A microphone can't measure IMEP. It can measure the **cycle-to-cycle CV of pulse timing and amplitude**, which is a sound-domain stand-in for COV of IMEP. The lib's lope score is built this way. Mapping it to cam specs needs labelled data (plan: [RESEARCH_CAM_SPEC_ML.md](RESEARCH_CAM_SPEC_ML.md)), and the score will also respond to compression ratio, tune and vacuum leaks, not only the cam.

## 4. Exhaust and muffler transfer effects, and how to compensate

- A muffler is characterised by its **transmission loss**, which the two-load or two-source methods measure. Mean flow changes low-frequency TL substantially. Sources: SAE 2003-01-1653, "A Review of Current Techniques for Measuring Muffler Transmission Loss" (https://doi.org/10.4271/2003-01-1653); a PMC study on airflow and muffler performance (https://pmc.ncbi.nlm.nih.gov/articles/PMC12200716/).
- Industry tailpipe practice: near-field microphones about **50 cm from the tailpipe at 45° off-axis**, with results analysed against RPM and engine order. Source: GRAS exhaust-noise application note (https://www.grasacoustics.com/fileadmin-gras/Images/Industries/Automotive/Exhaust_Noise/APP-Exhaust_Noise_Testing_Bro_216x279_05-2021-6p_LOW.pdf).
- What this means: the tailpipe sound is the engine's pulse train **convolved with** the exhaust system response (pipes, resonators, muffler, tip). Aftermarket mufflers change that response a lot. The firing **timing** survives this filtering. The **spectral envelope** (timbre) does not.
- **Compensation options:**
  1. **Homomorphic (cepstral) deconvolution.** In the log spectrum a convolution becomes a sum. Low-quefrency "liftering" separates the slowly varying system envelope from the periodic excitation. See Oppenheim & Schafer, "From frequency to quefrency: a history of the cepstrum", IEEE SP Magazine 21(5) 2004 (https://doi.org/10.1109/msp.2004.1328092; PDF https://dsp-group.mit.edu/wp-content/uploads/2024/11/SPMhistory_Sep2k4.pdf). Noll's cepstrum pitch method rests on the same separation (https://doi.org/10.1121/1.1910339).
  2. **Two-position relative transfer function.** If the same idle is recorded at the hood and the tailpipe, simultaneously or back to back, the cross-spectral estimate H(f) = S_xy / S_xx with coherence γ² shows what the exhaust path adds. This is the standard frequency-response estimation in Bendat & Piersol, *Random Data*, 4th ed. (https://onlinelibrary.wiley.com/doi/book/10.1002/9781118032428). With one phone the two recordings are not simultaneous, so only magnitude ratios averaged over orders are meaningful **(derived)**.
  3. **Order-normalised features.** Compare energies **at engine orders relative to each other** (for example order 0.5 to 4 for a V8) rather than absolute spectra. This removes much of the fixed exhaust tilt (see §9).

## 5. Knock acoustics (Draper modes) and why knock is rare at idle

- C. S. Draper (MIT, 1930s) showed that detonation excites acoustic **standing-wave modes of the combustion chamber**. For a cylindrical chamber near TDC, where axial modes are negligible: **f_mn = a · B_mn / (π · D)**, with a the in-cylinder speed of sound, D the bore and B_mn the Bessel eigenvalue of the mode. Sources:
  - Draper, "The physical effects of detonation in a closed cylindrical chamber", NACA (http://hdl.handle.net/2060/19930091567).
  - Draper & Morse, JASA abstract (https://pubs.aip.org/asa/jasa/article-pdf/10/3_Supplement/259/18724580/259_2_online.pdf).
  - A 2018 Applied Energy analysis of in-cylinder pressure resonance (https://doi.org/10.1016/j.apenergy.2018.06.157), which gives the formula and notes that a = √(γpV/m).
  - Bessel values for the 1T, 2T and 1R modes are 1.841, 3.054 and 3.832 (DLR paper, https://elib.dlr.de/53462/1/6th_ISLT_Munich_paper.pdf).
- A knock-definition paper (Applied Thermal Engineering 2018, https://doi.org/10.1016/j.applthermaleng.2017.11.138) reports that the important resonances for its engine lie **between about 4 and 20 kHz**.
- **Worked example (derived):** bore 101.6 mm (4.00 in), assuming hot-gas a ≈ 850–1000 m/s (an **assumption** from a = √(γRT) with γ≈1.3, T≈2000–2500 K):
  - 1T is about 4.9–5.8 kHz.
  - 2T is about 8.1–9.6 kHz.
  - 1R is about 10.2–12.0 kHz.
  - A smaller 86 mm bore puts 1T at about 5.8–6.8 kHz.
- Production knock sensors are built for this band. The Bosch KS4-P piezo sensor is specified for 3–25 kHz, with a linear useful range of **5–15 kHz** and its own mechanical resonance at 30 kHz (https://www.bosch-motorsport.com/products/sensors/knock/knock-sensor-ks4-p/).
- **Why it's rare at idle:** knock is end-gas autoignition. It is most likely at **high load and low speed**, when end-gas pressure and temperature are highest and there is time for the chemistry. At idle the load and pressure are low. Sources: MIT OCW 2.61 lecture 10 (https://ocw.mit.edu/courses/2-61-internal-combustion-engines-spring-2017/35c1c5bbf304c0f41e1de0cec0b0ee85_MIT2_61S17_lec10.pdf); MIT thesis on knock physics (http://hdl.handle.net/1721.1/57889); a review of low-speed pre-ignition and super-knock in boosted engines (https://www.sciencedirect.com/science/article/pii/S0360128522000715).
- **Consequence:** at idle, "knock/ping" should be reported as **not testable** unless the user does a load test. Even then, airborne pickup of 5–15 kHz through the hood is weak. A block-mounted accelerometer or piezo in the 5–15 kHz band is the right sensor (see §11 and HARDWARE.md).

## 6. Lifter tick, rod knock and exhaust leak signatures

- The camshaft turns at half crank speed. A **lifter or valvetrain tick** from one valve therefore repeats at **order 0.5** (about 6.7 Hz at 800 rpm). Waveassist's guide puts **rod knock** at about order 1 (13.3 Hz at 800 rpm). Rod knock is also described as deeper, lower on the block, worse under load, and often quieter when that cylinder is disabled. Lifter tick is sharper, highest at the valve cover, often worst cold, and stays after cylinder cutout. Sources: https://www.waveassistpro.com/guides/engine-sound-diagnostics ; Speedway Motors (https://www.speedwaymotors.com/the-toolbox/how-to-diagnose-lifter-tick-vs-rod-knock-troubleshooting-tips/145810); ASE A8 study guide (https://open-exam-prep.com/study-guides/ase-a8/general-engine-diagnosis/engine-noise-vibration-diagnosis). These are trade and education sources, not peer-reviewed.
- **Exhaust manifold leak:** a tick or puff that follows engine speed, is loudest cold, and fades as the manifold expands. Look for soot or missing bolts. Sources: https://www.carparts.com/blog/how-to-tell-if-your-exhaust-manifold-is-leaking/ ; https://flasharkracing.com/blogs/news/exhaust-manifold-leak-vs-lifter-tick . A leak at one port puffs only when that cylinder exhausts, so it also lands at **order 0.5** **(derived)**. Telling it apart from a tick therefore depends on **where** it is loudest (§9–10), on cold vs warm behaviour, and on spectral character (broadband puff vs sharp click), not on its repetition rate.
- **Consequence:** fault detection is about **impulsive events locked to an order (0.5 or 1)** plus **position**. The lib exports order-locked energy and the app records position, cold/warm and hood state.

## 7. Phone microphone limits

- **iPhone low-frequency roll-off:** Faber Acoustical measured recent iPhone Pro bottom mics in an anechoic chamber against a PCB reference. Blog posts: iPhone 15 Pro Max https://www.faberacoustical.com/blog/2024/ios/iphone/measured-iphone-15-pro-max-microphone-frequency-response-and-directivity/ , 16 Pro https://www.faberacoustical.com/blog/2024/ios/iphone/measured-iphone-16-pro-microphone-frequency-response-and-directivity/ , 17 Pro https://www.faberacoustical.com/blog/2025/ios/iphone/measured-iphone-17-pro-microphone-frequency-response-and-directivity/ . In the Faber forum (https://www.faberacoustical.com/forum/d/403-frequency-correction-for-13-octave), Faber states:
  - The low-end roll-off has been consistent for at least the last three generations.
  - Response is **−3 dB at about 50 Hz** and **−12 to −15 dB at 20 Hz**.
  - 1/3-octave correction is too coarse for the steep slope.

  A forum user reported larger roll-off on an iPhone 14 (about −4.9 dB at 100 Hz and −7.1 dB at 50 Hz), so unit-to-unit and method variation is real. The same posts show the mic is **directional at high frequencies** because the phone body shadows it.
- **Consequence:** a V8 idling at 600 rpm fires at 40 Hz with a cam order of 5 Hz **(derived)**, which sits on or below the roll-off. We should **not** rely on the fundamental's level. Instead we use (a) harmonic methods such as HPS and cepstrum that infer the fundamental from 2f, 3f and above, and (b) **timing from the broadband pulse envelope**, which stays sharp even when the low end is attenuated.
- **AGC / noise suppression / echo cancellation:** the W3C defaults are true for all three in Chrome, Firefox and Safari (https://github.com/w3c/mediacapture-main/issues/777). `getSupportedConstraints()` lists only the constraints the browser understands (https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getSupportedConstraints). On **iOS Safari:**
  - The 2026 WebKit bug 311451 (https://bugs.webkit.org/show_bug.cgi?id=311451) reports that "echo cancellation is currently the only constraint used by Safari".
  - Can I Use / MDN data lists `autoGainControl` as unsupported on Safari iOS (https://caniuse.com/mdn-api_mediastreamtrack_applyconstraints_autogaincontrol_constraint).
  - An older WebKit bug notes `echoCancellation` in getUserMedia was not applied and suggested `applyConstraints` on the track as a workaround (https://bugs.webkit.org/show_bug.cgi?id=179411).
  - addpipe's survey shows browser support has historically been patchy (https://blog.addpipe.com/getusermedia-audio-constraints/).
- **Consequence:** we request all three as `false`, then call `applyConstraints` again, then **log `track.getSettings()` into every payload**, so the backend knows what processing was really active. Features must tolerate an unknown slow gain: we use **timing-based** lope and **within-cycle amplitude ratios**, not absolute level. **Unverified until tested on Tyler's iPhone.**

## 8. Ambient noise and wind

- **Spectral subtraction** (Boll 1979, IEEE TASSP 27(2):113–120, https://doi.org/10.1109/TASSP.1979.1163209; PDF https://course.ece.cmu.edu/~ece491/homework/Boll79.pdf):
  1. Estimate the stationary noise magnitude spectrum during "non-signal" time.
  2. Subtract it.
  3. Clamp negative results to zero.
  4. Reduce the remaining "musical" noise.

  For us, "non-signal" time means a few seconds recorded **with the engine off** at the same spot. This only works for stationary noise such as HVAC or road hum. It does not remove other engines or voices.
- A second, engine-specific defence: almost all of the engine's useful idle energy is **order-locked**. Measuring only at order bins (comb or order analysis) rejects broadband noise naturally **(derived)**.
- **Wind** is low-frequency turbulent pressure on the mic. Larger windscreens and lower mic heights help, and a ground-based screen worked best in a 2020 POMA study (https://doi.org/10.1121/2.0001413). See also JASA work on low-frequency wind noise in measurement microphones (https://doi.org/10.1121/1.2832329) and Knowles' application note on protecting MEMS mics from wind (https://www.knowles.com/docs/default-source/default-document-library/an29-protecting-microphones-from-wind-noise-pickup.pdf?sfvrsn=39dc73b1_4).
- **Consequence:** the app should flag wind with a cheap test: high, non-stationary energy below about 100 Hz that is not locked to engine orders **(assumption: threshold to tune)**. It should ask the user to shield the phone or move to the lee side. Hardware should use foam or fur windscreens.

## 9. Sound vs. distance and microphone position

> We are **not** measuring loudness or dB SPL. What matters is how position and distance change **spectral shape** and **timing**.

**9.1 Spreading (inverse square).** In the far field of a compact source, pressure falls as 1/r, which is 6 dB per doubling of distance. This affects **all frequencies equally**, so it changes level but not spectral shape. Sources: ETH course notes on outdoor propagation (https://people.ee.ethz.ch/~isistaff/courses/ak1/acoustics-sound-propagation-outdoors.pdf); Kinsler-style definition of the far field as where direct pressure goes as 1/r (https://doi.org/10.1121/1.4895701). For us, **normalised spectra and ratios cancel spreading**.

**9.2 Air absorption is negligible at our distances.** ISO 9613-1 (https://www.iso.org/standard/17426.html) gives atmospheric absorption at 20 °C and 70% RH of about 0.33 dB/km at 125 Hz, 4.98 dB/km at 1 kHz, 23.09 dB/km at 4 kHz and 77.63 dB/km at 8 kHz (table reproduced at https://avitect.de/wissen/formeln/luftabsorption-iso-9613/ and https://people.ee.ethz.ch/~isistaff/courses/ak1/acoustics-sound-propagation-outdoors.pdf). Over 3 m that is about **0.23 dB at 8 kHz** **(derived)**, which is irrelevant. When high frequencies "disappear" as you step back, the causes are **directivity and shielding** (hood, body, the phone's own body per §7), **ambient noise masking**, and **reflections**, not air.

**9.3 Near field vs far field.** Close to a source, pressure and particle velocity fall out of phase. Level shows local maxima and minima and depends strongly on exact position. A practical far-field criterion for a source of radius a is R ≳ 2a²/λ, together with kr ≫ 1. Sources: COMSOL acoustics guide (https://doc.comsol.com/6.4/doc/com.comsol.help.aco/aco_ug_pressure.05.144.html); Microflown calibration notes on kr (https://www.microflown.com/assets/uploads/Publications/ebook_4_calibration.pdf). An engine bay is a large distributed source with many radiators (block, covers, intake, belts), and at idle-order frequencies λ is several metres (50 Hz → 6.9 m, **derived**). At 0.2–1 m we are therefore in the **near field** of the engine as a whole. Small moves change the spectrum, but they also isolate the **local** source (a valve cover, one manifold). That is ideal for finding faults and poor for repeatable "timbre" features. The tailpipe at 0.5 m and 45° (GRAS practice, §4) is a smaller, better-defined source, which is why industry uses it for order measurements.

**9.4 Ground and body reflections cause comb filtering.** A reflection with path-length difference ΔL produces notches at f = c(2n−1)/(2ΔL), with c ≈ 343 m/s. Moving the mic closer to the reflecting plane pushes notches higher. A mic **on** the ground plane essentially removes the comb. Sources: https://wiki.audio/En/0050 ; https://www.audiotechnology.com/tutorials/microphones-comb-filtering-2 ; ProSoundWeb ground-plane example, where 1 m height over a hard floor produced notches at multiples of 192 Hz (https://www.prosoundweb.com/working-in-tandem-combining-near-and-far-field-measurements/2/). Concrete driveways and garage walls are strong reflectors. **Consequences:**
- Keep a **fixed, recorded height** for each position, because changing it moves the notches.
- Prefer **close** placement, where direct sound dominates.
- Use features that average over many orders, so one notch can't dominate.
- Never infer anything from a single narrow-band level.

**9.5 Front vs rear: what each position hears.**

| Position | Dominant path | Spectral character | Best for |
|---|---|---|---|
| Tailpipe (0.5 m, 45°) | Exhaust pulses through the pipe and muffler transfer (§4) | Strong firing order and half-orders; timbre set by the muffler; high frequencies cut by the muffler | Firing timing, RPM, **lope**, cross-plane bank pattern (one pipe), misfire |
| Engine bay, hood open (over intake/valve covers, 20–40 cm) | Block, valvetrain and intake radiation; manifold near field | More mid/high content (valvetrain clicks, injector tick, belts); firing pulses weaker | **Lifter/valvetrain tick**, exhaust-manifold leak (near the head joint), belt/pulley noise, rod knock (low on block, ideally contact) |
| Grille, hood closed | Engine bay sound through the grille opening; hood shields the top | Low-pass-ish, fan noise can mask | Quick screen only |
| Side, front wheel well | Lower block, manifold, downpipe | Mixes block and early exhaust | Manifold leaks on that bank, bank comparison (L vs R) |
| Side, rear wheel / mid | Exhaust pipe radiation, body | Mostly exhaust | Backup to tailpipe |
| Cabin | Structure-borne plus airborne through firewall | Heavily low-passed; HVAC noise | Not recommended |

Sources for the table are §4–§6 (GRAS practice, trade diagnostic guides). The table is our synthesis and should be **validated with Tyler's labelled clips**.

**9.6 Propagation delay between front and rear mics.** At about 343 m/s (https://wiki.audio/En/0050), a 5.5 m path from the bay to the tailpipe takes about **16 ms** **(derived)**. Exhaust pulses actually travel inside the pipe in hot gas, where the speed of sound is higher and depends on temperature, so the acoustic delay through the pipe differs from the delay through air **(assumption, to be measured)**. For multi-mic hardware:
- Estimate the delay by **cross-correlation of the pulse envelopes** (Bendat & Piersol, §4).
- 1 ms of timing is only 4.5° of crank at 750 rpm **(derived: 750 rpm = 4.5°/ms)**, so un-synced mics can misattribute events between cylinders. Hardware channels must share **one sample clock** (see HARDWARE.md).
- Also, given the 720° cycle, the front-to-rear delay is a useful feature in itself: exhaust gas temperature and flow change it.

**9.7 Features robust to distance and position:**
- Firing **timing**: inter-pulse intervals and their CV. Spreading, absorption and most filtering don't change *when* pulses arrive.
- **Order ratios**: energy at order k relative to the firing order, in dB. Fixed gain and spreading cancel.
- **Normalised band shares**: band energy divided by total energy.
- Spectral centroid and flatness, used **only within one position class**.
- Cepstral, low-order-liftered envelope, used **only within one position class**, to separate excitation from path.

Avoid absolute level, single-bin levels and anything measured across different positions without a position label.

**9.8 Recommended guided capture (website):**
1. **Ambient, 5 s, engine off**, phone where the next clip will be (noise profile for §8).
2. **Tailpipe, 30 s:** about 0.5 m from the outlet at 45° off-axis (GRAS practice), phone about pipe height and still. Use the driver-side pipe on dual exhausts, and note which side.
3. **Engine bay, hood open, 30 s:** phone 20–40 cm above the valve cover or intake, mic end toward the engine, not touching hot parts.
4. *(Optional)* **front wheel well, each side, 15 s** at about 30 cm, for bank comparison.
5. *(Optional)* **blip test** from the tailpipe position, idle → about 2000 rpm → idle, to check RPM tracking and order lock.

Record a "warm or cold" flag for every capture, because leaks and ticks change as parts expand (§6).

## 10. Exterior standing position and noise environment (website picker)

The website shows a top-down outline of the car (nose up) with a **ring of tappable spots around the outside**. The user taps where they are standing. The engine bay (hood open) is a separate, optional spot inside the outline. An arrow shows which way they face. The guide (§9.8) *recommends* a spot for each step: tailpipe first, then the engine bay, then optional front corners. The user can still pick **any** ring spot, and the payload records both the pick and the recommendation.

**Side convention.** `side` is in the **vehicle frame**: LEFT/RIGHT as seen from the driver's seat facing forward. This is physical, so it stays tied to the exhaust bank and pipe (§2) regardless of market. The UI labels spots Driver/Passenger, and `driveSide` (`LHD` = driver on the left, `RHD` = driver on the right) maps between the two. The payload stores both `side` and `seatSide` (`DRIVER`/`PASSENGER`/`CENTER`).

Payload (`cam-i-hear-it/upload@3`, `capture` block; top-level `sampleId`, `consent {version, acceptedAt}` and `audio` metadata are described in web/README.md):

```json
{
  "driveSide": "LHD",
  "sideConvention": "vehicle-frame",
  "recommendedPosition": "TAILPIPE",
  "followedRecommendation": true,
  "display_units": "imperial",
  "position": {
    "position_id": "TAILPIPE",
    "ring": true,
    "side": "LEFT",
    "seatSide": "DRIVER",
    "tailpipe": "LEFT",
    "facing": { "target": "TAILPIPE_OUTLET", "bearingDeg": 18 },
    "distanceTo": "PIPE_OUTLET",
    "distanceBand": "MID",
    "distanceRangeM": [0.3, 1],
    "heightBand": "LOW",
    "heightRangeM": [0, 0.5],
    "hood": "CLOSED",
    "phoneOrientation": "MIC_TOWARD_SOURCE",
    "notes": null
  },
  "environment": {
    "setting": "OUTDOOR_OPEN_LOT",
    "wallSide": "RIGHT",
    "wallSeatSide": "PASSENGER",
    "wind": "LIGHT",
    "noise": { "direction": "REAR", "seatSide": null, "kind": "TRAFFIC" }
  }
}
```

`facing.bearingDeg` is the direction the user faces, in the vehicle frame: 0° = toward the nose, 90° = toward vehicle RIGHT. It is null for the engine bay, where the user looks down. `tailpipe` is the outlet the user stands at: `LEFT`, `RIGHT`, `CENTER`, or `DUAL` (standing between two outlets). All environment fields are optional (null = not given). Lengths are always in SI. `distanceRangeM`/`heightRangeM` give the band as `[min, max]` metres (`null` max = open-ended). `display_units` (`metric`/`imperial`) only records which units the user saw; it does not change any value. `display_units` and the `*RangeM` fields were additive (still `upload@2`). `upload@3` changed the distance bands (below, §10.2), which is not additive.

**10.1 What each exterior position is good and bad for.** This is our synthesis of §4, §7 and §9.2–9.5 and should be validated with Tyler's labelled clips.

| `position_id` | Near which source | Body shadowing / path | Good for | Bad for |
|---|---|---|---|---|
| `TAILPIPE` (0.5 m, 45°, §4 GRAS practice) | Exhaust outlet (closest to the exhaust) | Direct line to the outlet; nothing in the way | **RPM, lope, misfire, bank pattern** (one pipe hears one bank on a cross-plane V8, §2) | Valvetrain tick, intake; muffler sets the timbre (§4) |
| `REAR_CENTER` (trunk) | Between outlets / behind the muffler | Bumper and fascia partly shield the pipes | Backup timing when you can't reach a pipe; `DUAL` cars | Per-bank attribution; the engine is ~body-length away and shadowed |
| `REAR_LEFT_CORNER` / `REAR_RIGHT_CORNER` | That side's pipe/muffler shell | The rear wheel and quarter panel shadow the far side | Backup exhaust timing, side-specific muffler noise | Engine-bay faults; timbre varies strongly with exact spot (near field, §9.3) |
| `LEFT_REAR_DOOR` / `RIGHT_REAR_DOOR` | Mid-pipe under the floor | Floor pan and body block most direct paths; ground reflections dominate (§9.4) | Mid-pipe leaks on that side | Almost everything else: neither near the engine nor the outlet |
| `LEFT_FRONT_DOOR` / `RIGHT_FRONT_DOOR` | Behind the front wheel: downpipe, rear of that bank | Fender and front wheel partly shadow the bay | That bank's downpipe/collector leaks; bank comparison | Firing-pulse timing (weaker than tailpipe), timbre comparisons with other spots |
| `FRONT_LEFT_CORNER` / `FRONT_RIGHT_CORNER` | That bank's manifold and lower block (front wheel well, §9.5) | Bumper and wheel shield the top of the engine; the far bank is shadowed by the block | **Manifold leaks per bank, L/R bank comparison** (recommended optional step) | RPM if the hood is closed and fan is loud |
| `FRONT_CENTER` (grille) | Fan, belts, front of block | Hood (if closed) shields the top; fan noise masks | Quick screen, belt/pulley noise | Exhaust timing and lope; detailed fault work (§9.5: screening only) |
| `ENGINE_BAY` (hood open, 20–30 cm, not on the ring) | Valve covers, intake, injectors (closest to the engine) | Direct, near field (§9.3) | **Lifter/valvetrain tick, intake, injector tick**, manifold-to-head leak | Repeatable timbre (small moves change spectrum, §9.3); exhaust lope |

The phone's own body also shadows high frequencies (§7). `phoneOrientation` = `MIC_TOWARD_SOURCE` remains the default, and `facing` lets us check that the user faced the source the position implies.

**10.2 Bands.**
- **Distance** (`upload@3`): phone mic to the car at the chosen spot. `distanceTo` says what it is measured to: `PIPE_OUTLET` at the tailpipe spot, `ENGINE` at the engine bay, otherwise `BODY_PANEL` (nearest body panel). Bands: `TOUCHING` < 0.15 m, `CLOSE` 0.15–0.3 m (§9.3 near field), `MID` 0.3–1 m, `FAR` 1–3 m, `VERY_FAR` > 3 m (reflections and ambient dominate, §9.2/9.4). Shown as < 6 in, 6–12 in, 1–3 ft, 3–10 ft, > 10 ft in imperial. The guide recommends a distance per step (tailpipe 0.5 m, engine bay 0.2–0.3 m, front corners ~0.3 m) and preselects the band that contains it. `upload@2` used `NEAR` ≤ 0.3 m / `MID` / `FAR` / `VERY_FAR`, measured to "the source"; map old `NEAR` to `TOUCHING` or `CLOSE` only with care.
- **Height:** `GROUND`, `LOW` < 0.5 m, `MID` 0.5–1.2 m, `HIGH` > 1.2 m. Height sets the ground-reflection comb (§9.4).
- **Hood:** `OPEN`, `CLOSED`, `NA`. Choosing the engine-bay spot sets `OPEN`.
- **Phone orientation:** `MIC_TOWARD_SOURCE` (default), `MIC_AWAY`, `FLAT_FACE_UP`, `UNKNOWN`.

**10.3 Noise environment fields.** `setting`: `INDOOR_GARAGE`, `COVERED_CARPORT`, `OUTDOOR_OPEN_LOT`, `OUTDOOR_DRIVEWAY_STREET`, `OTHER`. `wallSide` (nearby wall/building) and `noise.direction` (traffic or other noise) are `FRONT`, `REAR`, `LEFT`, `RIGHT` (vehicle frame, shown as Driver/Passenger) or, for noise, `ALL_AROUND`. `noise.kind`: `TRAFFIC`, `OTHER_ENGINE`, `PEOPLE`, `MACHINERY_HVAC`, `OTHER`. `wind`: `NONE`, `LIGHT`, `STRONG`.

**10.4 How position + environment will drive noise compensation (plan, not yet implemented in lib/).**
1. **Group by position class.** Timbre features (centroid, flatness, cepstral envelope, band shares) are compared only within the same `position_id` (or front/rear class) and distance band, because shadowing and path change spectral shape (§9.5, §9.7). Timing features (RPM, lope, inter-pulse CV) may be pooled across positions, as now.
2. **Engine-off noise profile at the same spot.** When the user adds an engine-off clip at the same position, subtract its stationary spectrum (Boll 1979 spectral subtraction, §8). This helps HVAC/road hum; it cannot remove other engines or voices, so `noise.kind` = `OTHER_ENGINE`/`PEOPLE` lowers confidence instead.
3. **Order-locked measurement first.** Measure only at engine-order bins (§8), which rejects broadband traffic and wind. Where the user reports noise, keep order-locked features and down-weight broadband ones (band shares, flatness).
4. **Wind.** `wind` = `LIGHT`/`STRONG` turns on the low-frequency wind check (§8: non-stationary energy below ~100 Hz not locked to engine orders; POMA 2020, JASA 10.1121/1.2832329, Knowles AN29). Strong wind marks low-band features unreliable and the app asks the user to shield the phone or move to the lee side. `facing` and the reported side tell us which side the lee is.
5. **Noise direction vs where the user stands.** Using `noise.direction` and `facing.bearingDeg`, we know whether the noise is in front of the mic, behind the user, or on the far side of the car. Noise from the far side is partly shadowed by the body (§9.2: directivity and shielding dominate over air absorption); noise in the mic's look direction is not. Clips with noise on the mic's side and in front of it get lower confidence, and the app can suggest the ring spot on the opposite side (for example, traffic behind → use a front corner or the engine bay rather than the tailpipe).
6. **Walls and garages.** `wallSide` or `INDOOR_GARAGE` predicts strong reflections and comb notches (§9.4: concrete and garage walls are strong reflectors). We rely on features averaged across many orders, never single narrow-band levels, and flag clips where the user stands between the car and a wall. Open-lot clips are the cleaner reference for timbre baselines.
7. **Shadowing check.** If the measured high-band share is far below the class median for that `position_id`, suspect the phone or body is shadowing the mic (§7, §9.2), and ask to re-record with `MIC_TOWARD_SOURCE`.

All thresholds here are **assumptions to tune** on labelled data. No new external sources were added for this section; it reuses §2, §4, §7, §8 and §9.

## 11. Multi-mic, contact mic and accelerometer approaches; band choices

- **MEMS I²S mics:** TDK ICS-43434 is specified for 60 Hz–20 kHz (datasheet https://cdn.sparkfun.com/assets/a/9/c/9/1/DS-000069-ICS-43434-v1.2.pdf). InvenSense INMP441 is specified flat from 60 Hz to 15 kHz, with −3 dB points at 60 Hz and 15 kHz (https://www.mouser.com/datasheet/2/400/INMP441-1112508.pdf). Both roll off below 60 Hz, like the phone, so they are a mid/high-band mic, not a firing-fundamental mic.
- **Accelerometer:** ADI ADXL1002 has an 11 kHz 3 dB bandwidth and a 21 kHz resonance (https://www.analog.com/media/en/technical-documentation/data-sheets/ADXL1001-1002.pdf). It covers the lower Draper knock modes and is excellent for ticks and knocks on the block. It needs rigid mounting, and its output must be sampled fast with an anti-alias filter.
- **Piezo knock sensor:** Bosch KS4-P, 5–15 kHz useful range (§5). It is a proven, cheap, rugged block-mount option. Its low-frequency response also captures firing impulses through the structure (see the sensor datasheet's 3 kHz lower limit; below that, response is not specified).
- **Acoustic vs vibration in prior work:** misfire detection has a long history in vibration and crank-speed analysis, as well as in acoustics (survey in Terwilliger & Siegel 2022, §12).
- **Band plan (grounded above):**
  - Band A, 5–400 Hz: firing pulses and orders. A low-frequency electret or measurement-mic capsule, or the piezo's low end; needs a mic **without** a 60 Hz roll-off.
  - Band B, 0.2–8 kHz: valvetrain, leaks, timbre (MEMS mic).
  - Band C, 4–16 kHz: knock modes (accelerometer or piezo on the block, §5).

  Details are in docs/HARDWARE.md.

## 12. Prior work: papers, apps and datasets

**Papers**
- Siegel, Kumar, Ehrenberg, Sarma, "Engine Misfire Detection with Pervasive Mobile Audio", ECML-PKDD 2016, https://doi.org/10.1007/978-3-319-46131-1_26 (abstract: https://mlanthology.org/ecmlpkdd/2016/siegel2016ecmlpkdd-engine/). Smartphone audio with FFT, wavelet and MFCC features plus feature ranking reached **>99% accuracy with a linear SVM on out-of-sample data**. Per the 2022 follow-up, this was across only three vehicle types.
- Terwilliger & Siegel, "Improving Misfire Fault Diagnosis with Cascading Architectures via Acoustic Vehicle Characterization", Sensors 22(20):7736, 2022, https://pmc.ncbi.nlm.nih.gov/articles/PMC9612320/ . Phone audio at 48 kHz, 286 raw samples augmented to about 42 h. The model predicts fuel type, configuration, cylinder count and aspiration, then misfire.
  - MFCC cascade CNN results: **misfire 87.0%, cylinder count 72.8%**.
  - On **YouTube clips**, cylinder-count accuracy fell to **18.4%** and misfire to 64.4%.
  - YouTube audio was cut off around 16 kHz.
- Fosalau & Maties (IMEKO TC4 2022), "Engine rotational speed estimation using audio recordings and machine learning algorithms", https://doi.org/10.21014/tc4-2022.16 . Phone at 1 m, hood open vs closed, 3-cyl Opel. RPM classes were synchronised with an **ELM OBD-II** logger at 10 samples/s. A sound plus acceleration KNN reached 98% class accuracy over 200 rpm bins. This is close to our Macchina plan.
- Ground-truth sync caveat from the same paper: OBD RPM accuracy is quoted as within 2% and the dash tach about 5%.

**Datasets**
- Procedural Engine Sounds Dataset (Doerfler):
  - Paper: arXiv 2603.07584, https://doi.org/10.48550/arxiv.2603.07584. Data: Zenodo https://doi.org/10.5281/zenodo.16883336.
  - Size: 5,935 synthetic 48 kHz four-channel WAVs, 19 h. **RPM and torque embedded as audio channels**.
  - License: **CC BY-NC 4.0**, so not for commercial use.
  - Useful for pretraining and testing RPM estimators.
- Sounds of Vehicle Internal Combustion Engines (Ćirić & Milivojčević, Zenodo 2024), https://zenodo.org/records/18777405 : 320 usable real idle recordings from a garage entrance. **No RPM labels**.
- AudioSet "Idling" class: 6,241 clips with class labels only, https://research.google.com/audioset/dataset/idling.html
- Kaggle:
  - Revix engine-knock set: 1,199 clips at 16 kHz, and the knocking class is **partly synthetic overlays**. https://www.kaggle.com/datasets/arindaemmanuel/revix-engine-knock-complete-dataset
  - Car Diagnostics dataset (idle faults such as low oil, power steering, serpentine belt): https://www.kaggle.com/datasets/malakragaie/car-diagnostics-dataset
  - AI Mechanic, 41 clips of one BMW M54 engine: https://www.kaggle.com/datasets/eoinedge/ai-mechanic-engine-condition-audio-fault-finding
- IEEE DataPort acoustic fault dataset (Ford Fiesta 1.6, mic 1 m from the exhaust at 45°, 44.1 kHz, induced misfires and belt faults): https://doi.org/10.21227/1nyq-gb28

**Pitch / fundamental estimation methods used in lib/**
- Noll, "Cepstrum Pitch Determination", JASA 41(2), 1967, https://doi.org/10.1121/1.1910339
- Noll, harmonic product spectrum / harmonic sum spectrum (1969 symposium, published 1970), https://cir.nii.ac.jp/crid/1570572699087005312 ; tutorial: http://musicweb.ucsd.edu/~trsmyth/analysis/Harmonic_Product_Spectrum.html
- de Cheveigné & Kawahara, "YIN, a fundamental frequency estimator for speech and music", JASA 111(4), 2002, https://doi.org/10.1121/1.1458024 . Its autocorrelation and difference ideas back our autocorrelation estimator.

## 13. What this means for Cam_I_hear_it

> **Follow-up:** estimating actual cam specs (duration, LSA, ICL, lift) from sound with ML, including crank-angle and cyclostationary features beyond human hearing, is researched in [RESEARCH_CAM_SPEC_ML.md](RESEARCH_CAM_SPEC_ML.md).

1. **Estimate RPM from timing and harmonics, not from the fundamental's level.** iPhone mics are about −3 dB at 50 Hz and worse below (§7), right where V8 idle firing sits. Use HPS, cepstrum and autocorrelation across harmonics, plus the pulse-envelope timing.
2. **Treat cylinder count as a hypothesis.** f_fire alone is ambiguous (§1). Score (N, RPM) pairs using firing harmonics, **half-order (cycle-rate) evidence** and an idle-RPM prior, and let the user's form input override.
3. **Build lope as a sound-domain COV.** Use cycle-to-cycle CV of pulse timing and amplitude (§3). Call it a *score*, not a cam spec. It also responds to compression, tune and vacuum leaks.
4. **Assume AGC may be on (Safari).** Request processing off, log `getSettings()`, and prefer timing and ratio features (§7).
5. **Use position-aware, distance-robust features.** Timing and order ratios work from anywhere. Timbre and fault features are only compared within a position class (§9–10). A standard tailpipe position (0.5 m, 45°) and a standard hood-open position make the dataset consistent.
6. **Record an engine-off noise profile** for spectral subtraction, and flag wind (§8).
7. **Report knock as not testable at idle.** Real knock detection needs a block sensor at 5–15 kHz and a load test (§5).
8. **Collect our own data at 48 kHz with OBD ground truth (Macchina M2).** Public and YouTube data generalise badly, with cylinder-count accuracy collapsing from 72.8% to 18.4% on YouTube (§12). Synthetic data with RPM labels (CC BY-NC) is fine for development only.
9. **Send ML features plus raw audio (with consent) to the backend.** Exhaust and muffler variation is large (§4), so models need the vehicle form, the exhaust/cam/tune mods text and the position label to condition on, as the cascading-attribute paper did (§12).
10. **Hardware later:** three bands (low-frequency mic or piezo for firing, MEMS for mid/high, accelerometer for knock and ticks), all on **one sample clock**, because 1 ms is 4.5° of crank at idle (§9.6, §11).
