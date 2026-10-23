<!-- File: docs/ML_BACKEND.md | Design of the off-device ML backend: where it runs, dataset schema, ground truth, and model plan -->
# ML backend design (design only, nothing deployed)

**Principle:** the phone or browser does cheap, explainable DSP (`lib/`) and sends a feature vector, plus raw audio when the user opts in. Training and heavier inference run **elsewhere**, on a small Python service. No paid services are needed: everything below runs on a home PC or a free-tier VM.

## 1. Where it runs

| Piece | Choice | Why |
|---|---|---|
| API | **Python 3.11 + FastAPI + Uvicorn** | Typed request models (Pydantic) map 1:1 to the JSON schema below |
| Storage | Local disk / SQLite at first (`data/clips/<uuid>.wav`, `data/clips.sqlite`), Postgres later | Zero cost; small at our scale |
| Training | Offline scripts with PyTorch + torchaudio and scikit-learn, on Tyler's PC (CPU is fine for baselines) | No GPU rental needed |
| Inference | Same FastAPI process loading a scikit-learn / ONNX model | Small models; ONNX can later run in the browser too |
| Hosting | Home server behind a tunnel, or any free-tier container host | The web page's POST target is configurable and off by default |

Endpoints (v1):
- `POST /api/v1/clips`: body is the `cam-i-hear-it/upload@1` JSON (below). Returns `{id}`.
- `PUT /api/v1/clips/{id}/audio`: optional WAV (48 kHz mono, 16-bit), only with consent.
- `POST /api/v1/clips/{id}/obd`: optional OBD/CAN log segment (CSV of `t_s,rpm[,map_kpa,ect_c,...]` or a raw `.m2l`).
- `GET /api/v1/clips/{id}/predict`: model outputs (cam class, layout, fault flags) with confidences.
- CORS is limited to the Pages origin. There are no accounts in v1, and access is protected by a shared secret header.

## 2. Dataset schema

One **clip** is one continuous recording at one position (see docs/RESEARCH_ACOUSTICS.md §9.8 guided flow). One **session** groups the clips of one vehicle visit: ambient, tailpipe, engine bay, and so on.

```jsonc
{
  "schema": "cam-i-hear-it/upload@1",
  "featureSchema": "cam-i-hear-it/features@1",
  "createdAt": "2026-10-22T18:00:00Z",
  "sessionId": "uuid (added by backend or app v2)",
  "vehicle": {
    "make": "Chevrolet", "model": "Silverado 1500", "year": 2011,
    "engine": "5.3L V8 LC9", "cylinders": 8,
    "mods": "free text as typed by the user"        // kept verbatim
  },
  "capture": {
    "position": { "zone": "TAILPIPE_LEFT", "distanceBand": "MID", "heightBand": "LOW",
                  "hood": "NA", "phoneOrientation": "MIC_TOWARD_SOURCE" },
    "engineTemp": "WARM", "durationS": 30.2
  },
  "device": { "userAgent": "...", "sampleRate": 48000,
              "trackSettings": { "autoGainControl": false, "...": "..." },
              "supportedConstraints": { "...": true } },
  "features": { "...": "lib/src/features.ts FeatureVector" },
  "audio": { "uri": "clips/<id>.wav", "consent": true },     // optional
  "groundTruth": {                                            // optional, see §3
    "source": "macchina-m2", "rpm": [[0.0, 702], [0.1, 698]], // [t_s relative to audio start, rpm]
    "alignment": { "method": "blip-xcorr", "offsetS": 1.23, "residualRpm": 8 },
    "ectC": 88, "mapKpa": 38
  },
  "labels": {                                                 // curated server-side
    "camClass": "STOCK | MILD | AGGRESSIVE | UNKNOWN",
    "camSpec": { "intDur050": 224, "exhDur050": 230, "lsa": 112 },  // when known
    "layout": "CROSSPLANE_V8 | FLATPLANE_V8 | I4 | I6 | V6_EVEN | V6_ODD | ...",
    "exhaust": "STOCK | AFTERMARKET_CATBACK | HEADERS | ...",
    "faults": ["LIFTER_TICK", "EXHAUST_LEAK", "MISFIRE", "ROD_KNOCK"],
    "labelSource": "owner | mechanic | inferred-from-mods"
  }
}
```

**Mods parsing.** Keep the free text verbatim. Offline, extract structured hints with regexes and keyword lists:
- cam specs like `224/230`, `.600 lift`, `112+4` or `112 LSA`;
- keywords such as "long tube", "X-pipe", "H-pipe", "cutout", "delete", "tune", "turbo".

These become *weak* labels, marked `labelSource: inferred-from-mods`.

**Privacy.** No GPS and no VIN in v1. Audio is uploaded only with an explicit checkbox. The user agent is stored for device-effect analysis only.

## 3. OBD ground truth from the Macchina M2 (ubcool2ic/macchina)

The macchina repo is a passive CAN sniffer for Tyler's 2011 Silverado (LC9 5.3L, E38 ECM). It writes `.m2l` binary logs. Its docs/DESIGN.md describes a header with an RTC start epoch, per-frame `dt_us`, and MARKER records from the session button. Its README lists `0x0C9` as an HS-CAN engine-RPM/status frame, and its OBD polling doc uses PID 0x0C (RPM). Its README says the firmware and PC tools are still scaffold/design.

Plan:
1. Record audio on the phone and an `.m2l` log on the M2 at the same time.
2. Export with the macchina PC tool (when it exists) to `t_s,rpm` CSV. Use the repo's own decoder for 0x0C9 or PID 0C scaling; it is **not re-derived here**.
3. **Align** with a throttle blip at the start of each clip: idle → about 2000 rpm → idle.
   - Track RPM from audio with `lib` on 0.5 s hops.
   - Find the time offset that maximises the correlation between the audio RPM track and the CAN RPM track.
   - Store `offsetS` and the residual error.
   - A session-button MARKER pressed together with a clap is the fallback.

   The research doc (§9.6) gives the timing budget: 1 ms is 4.5° of crank at 750 rpm. So OBD ground truth is for **RPM labels** (a 0.1 s scale), not for per-cylinder event alignment.
4. Ground truth fills the `groundTruth` block. It is used to (a) validate and tune `scoreCylinderHypotheses` weights and (b) train an RPM regressor as a check on the DSP. The IMEKO 2022 paper did exactly this with an ELM logger (docs/RESEARCH_ACOUSTICS.md §12).

## 4. Model plan

| Stage | Model | Input | Output | Data needed |
|---|---|---|---|---|
| 0 | **DSP baseline** (no ML) | lib features | RPM, cylinders, lope score | none |
| 1 | **Layout / attribute classifier** (cylinders, layout, exhaust type) | features + log-mel / MFCC of tailpipe clip | class probabilities | dozens of vehicles; public datasets for pretraining (§12) |
| 2 | **Cam class** (STOCK / MILD / AGGRESSIVE), later regression on duration and LSA | lope metrics (intervalCov, ampCov), order spectrum, `relDb` half-orders, conditioned on layout, exhaust and position zone | class + confidence | labelled cars with known cams; **the main data bottleneck** |
| 3 | **Fault detector** (tick, exhaust leak, misfire; knock only with load test plus contact sensor) | engine-bay and tailpipe clips, order-locked impulsive energy at orders 0.5 and 1 | per-fault flags | owner/mechanic-labelled faults; Kaggle / IEEE sets for pretraining |

Approach:
- Start with **gradient-boosted trees / logistic regression on lib features**, which are explainable and fine with small data.
- Move to a small CNN on log-mel spectrograms (Terwilliger & Siegel 2022 style) once there are more than a few hundred clips.
- Use a **cascade**: predict attributes first, then condition cam and fault models on them, as that paper did.
- Augment with pitch ±0.25 semitone, speed 0.92–1.08, gain and added noise, as in the same paper.

Evaluation:
- Split **by vehicle**, never by clip, to avoid leakage.
- Report per position zone.
- Check against a held-out device type (iPhone vs Android).

Known risks: device and AGC effects; muffler variation dominating timbre; tiny labelled set; YouTube-sourced data generalises poorly (cylinder accuracy dropped to 18.4% in Terwilliger & Siegel).
