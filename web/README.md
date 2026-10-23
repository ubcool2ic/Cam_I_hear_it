<!-- File: web/README.md | How to run the Cam_I_hear_it static capture page locally, and what each file does -->
# web/: static capture page

Plain HTML/CSS and vanilla ES modules with no build step, designed mobile-first for iPhone Safari.

## Run it locally

Mic access needs a secure context: `localhost` or HTTPS.

```sh
npx serve web                         # then open the printed http://localhost:3000
# or, without Node:
python3 -m http.server -d web 8080    # then open http://localhost:8080
```

To try it **on an iPhone**, the page must be served over HTTPS; plain http on a LAN IP will not get mic access. Use any HTTPS tunnel or a local HTTPS server with a trusted certificate. GitHub Pages is **not** set up, because Pages on a private repo needs a paid plan.

`web/lib/` is the compiled DSP library. Regenerate it after changing `lib/src` with `cd lib && npm run web`.

## Files

| File | What it does |
|---|---|
| `index.html` | Markup: units toggle (Metric / Imperial) in the header, guided capture card, live dashboard, vehicle form, LHD/RHD + exterior position picker + bands, optional noise-environment form, mic-settings table, opt-in upload, payload viewer, sticky record bar |
| `style.css` | Dark, mobile-first styles (safe-area insets, 44 px tap targets) |
| `app.js` | Mic capture (voice processing off), live spectrogram, live and final analysis, payload, downloads, opt-in POST |
| `vehicle-picker.js` | Top-down SVG car outline (nose up) with a ring of 11 exterior standing spots (front centre, front corners, driver/passenger front and rear doors, rear corners, trunk, tailpipe with driver/passenger/centre/dual outlet) plus a separate engine-bay (hood open) spot. Draws a facing arrow and the noise-environment overlay. Returns `{position_id, ring, side, seatSide, tailpipe, facing, label}` (docs/RESEARCH_ACOUSTICS.md §10) |
| `capture-guide.js` | Guided steps: tailpipe 0.5 m (~20 in) at 45°, then hood-open 20–40 cm (~8–16 in) over the engine, then an optional walk-around. Each step *recommends* a position and presets it; any ring spot can still be tapped |
| `units.js` | Display-units setting (metric m/cm or imperial ft/in): localStorage persistence, locale default, and the `{0.5}` / `{0.2-0.4}` length templates (written in metres) that every shown distance goes through |
| `recorder-worklet.js` | AudioWorklet that forwards raw mic samples to the main thread |

## Behaviour notes

- **Readout:** RPM, cylinder guess with confidence, lope score (0–100; the words smooth/mild/noticeable/heavy are provisional and uncalibrated), and a Knock card that always reads "Not testable at idle". Spark knock needs load (docs/PLAN.md §1).
- **Live analysis:** every 2 s on the last 8 s of audio. The first 1 s after Start is skipped (startup transient). The final analysis on Stop uses the whole clip minus that first second.
- **Mic processing:** `echoCancellation`, `noiseSuppression` and `autoGainControl` are requested `false`. The page shows what `track.getSettings()` reports was actually applied, and stores that in the payload as `device.trackSettings`, minus `deviceId`/`groupId`. iOS Safari may ignore some of these (docs/RESEARCH_ACOUSTICS.md §7).
- **Position and environment:** `side` is vehicle-frame (LEFT/RIGHT from the driver's seat); `seatSide` gives DRIVER/PASSENGER from the LHD/RHD setting. The payload (`cam-i-hear-it/upload@2`) stores `capture.position` (position_id, side, seatSide, tailpipe outlet, facing, distance, height, hood, phone orientation), `capture.environment` (setting, wall side, wind, noise direction and kind) and the guide's recommended position. Analysis does not use the environment yet (plan: docs/RESEARCH_ACOUSTICS.md §10.4).
- **Units:** the header toggle switches every shown length (distance and height bands, guide instructions, notes placeholder) between metric and imperial. The choice is saved in localStorage as `camihear.displayUnits`. With no saved choice, the default is imperial when `navigator.language` is `en-US` and metric otherwise. Imperial values are rounded for readability (e.g. 0.5 m → 20 in, 0.3–1 m → 1–3 ft, 20–40 cm → 8–16 in), so they are approximate. The payload stays in SI. It adds `capture.display_units` (`"metric"`/`"imperial"`) and the band ranges in metres, `capture.position.distanceRangeM` and `heightRangeM` (`[min, max]`, `null` max = open-ended). All of these are additive, so the schema stays `upload@2`.
- **Upload:** off by default. The POST button only enables after a clip is analysed, an http(s) URL is entered (or passed as `?post=https://…`), **and** the opt-in box is ticked. Only JSON goes up (features, vehicle, capture position and environment, device settings); **audio is never uploaded**. Use **WAV** to keep raw audio locally.
