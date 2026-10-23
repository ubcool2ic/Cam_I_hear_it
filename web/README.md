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

To try it **on an iPhone**, the page must be served over HTTPS; plain http on a LAN IP will not get mic access. Use any HTTPS tunnel or a local HTTPS server with a trusted certificate, or the live copy at https://ubcool2ic.github.io/Cam_I_hear_it/. GitHub Pages serves the `gh-pages` branch, whose root is a plain copy of `web/` plus `.nojekyll`. It is republished by hand, because the token can't push Actions workflows.

`web/lib/` is the compiled DSP library. Regenerate it after changing `lib/src` with `cd lib && npm run web`.

## Files

| File | What it does |
|---|---|
| `index.html` | Markup: first-visit consent modal, units toggle (Metric / Imperial) in the header, guided capture card, live dashboard, vehicle form, LHD/RHD + exterior position picker + bands, optional noise-environment form, mic-settings table, sample-saving status, payload viewer, Terms/Privacy footer links, sticky record bar |
| `style.css` | Dark, mobile-first styles (safe-area insets, 44 px tap targets) |
| `app.js` | Consent-gated mic capture (voice processing off), live spectrogram, live and final analysis, payload, automatic sample save, downloads |
| `consent.js` | Consent gate: `CONSENT_VERSION`, localStorage `camihear.consent` = `{version, acceptedAt}`, modal wiring |
| `sample-store.js` | Automatic sample saving: IndexedDB `camihear` / `pendingSamples` queue and the `UPLOAD_URL` constant (empty = keep on device) |
| `privacy.html`, `terms.html`, `legal.css` | Privacy Policy and Terms of Use (**drafts, not legal advice**; contact details are TODO) |
| `vehicle-picker.js` | Top-down SVG car outline (nose up) with a ring of 11 exterior standing spots (front centre, front corners, driver/passenger front and rear doors, rear corners, trunk, tailpipe with driver/passenger/centre/dual outlet) plus a separate engine-bay (hood open) spot. Draws a facing arrow and the noise-environment overlay. Returns `{position_id, ring, side, seatSide, tailpipe, facing, label}` (docs/RESEARCH_ACOUSTICS.md §10) |
| `capture-guide.js` | Guided steps: tailpipe 0.5 m (~20 in) from the pipe outlet at 45°, then hood-open 20–30 cm (~8–12 in) over the engine, then an optional walk-around. Each step *recommends* a position and presets it; any ring spot can still be tapped |
| `units.js` | Display-units setting (metric m/cm or imperial ft/in): localStorage persistence, locale default, and the `{0.5}` / `{0.2-0.4}` length templates (written in metres) that every shown distance goes through |
| `recorder-worklet.js` | AudioWorklet that forwards raw mic samples to the main thread |

## Behaviour notes

- **Readout:** RPM, cylinder guess with confidence, lope score (0–100; the words smooth/mild/noticeable/heavy are provisional and uncalibrated), and a Knock card that always reads "Not testable at idle". Spark knock needs load (docs/PLAN.md §1).
- **Live analysis:** every 2 s on the last 8 s of audio. The first 1 s after Start is skipped (startup transient). The final analysis on Stop uses the whole clip minus that first second.
- **Mic processing:** `echoCancellation`, `noiseSuppression` and `autoGainControl` are requested `false`. The page shows what `track.getSettings()` reports was actually applied, and stores that in the payload as `device.trackSettings`, minus `deviceId`/`groupId`. iOS Safari may ignore some of these (docs/RESEARCH_ACOUSTICS.md §7).
- **Position and environment:** `side` is vehicle-frame (LEFT/RIGHT from the driver's seat); `seatSide` gives DRIVER/PASSENGER from the LHD/RHD setting. The payload (`cam-i-hear-it/upload@3`) stores `capture.position` (position_id, side, seatSide, tailpipe outlet, facing, distanceTo + distance band, height, hood, phone orientation), `capture.environment` (setting, wall side, wind, noise direction and kind) and the guide's recommended position. Analysis does not use the environment yet (plan: docs/RESEARCH_ACOUSTICS.md §10.4).
- **Units:** the header toggle switches every shown length (distance and height bands, guide instructions, notes placeholder) between metric and imperial. The choice is saved in localStorage as `camihear.displayUnits`. With no saved choice, the default is imperial when `navigator.language` is `en-US` and metric otherwise. Imperial values are rounded for readability (e.g. 0.5 m → 20 in, 0.3–1 m → 1–3 ft, 20–30 cm → 8–12 in), so they are approximate. The payload stays in SI. It adds `capture.display_units` (`"metric"`/`"imperial"`) and the band ranges in metres, `capture.position.distanceRangeM` and `heightRangeM` (`[min, max]`, `null` max = open-ended). These were additive (`upload@2`).
- **Distance:** the mic-to-car distance at the chosen spot. The label reads "Distance from the pipe outlet" at the tailpipe, "from the engine" at the engine bay and "from the car" (nearest body panel) elsewhere; `capture.position.distanceTo` records which (`PIPE_OUTLET` / `ENGINE` / `BODY_PANEL`). Bands: `TOUCHING` < 15 cm (< 6 in), `CLOSE` 15–30 cm (6–12 in), `MID` 0.3–1 m (1–3 ft), `FAR` 1–3 m (3–10 ft), `VERY_FAR` > 3 m (> 10 ft). Each guide step preselects the band containing its recommendation (tailpipe 0.5 m → `MID`, engine bay 0.2–0.3 m → `CLOSE`, front corners ~0.3 m → `CLOSE`). The new codes are not backward compatible, so the schema is now **`upload@3`**.
- **Consent gate:** on first visit a full-screen modal summarises the policy and links to `terms.html` and `privacy.html`. Continue is disabled until "I agree to the Terms of Use and Privacy Policy" is ticked, and Record stays disabled (and `startCapture` refuses) until then. Acceptance is stored in localStorage `camihear.consent` as `{version, acceptedAt}` and copied into the payload as `consent`. Changing `CONSENT_VERSION` in `consent.js` re-prompts everyone; update the "Version" line in both documents at the same time.
- **Automatic saving:** using the tool saves the sample; there is no opt-in POST any more (the old URL field, checkbox and `?post=` parameter are gone). After each analysed recording, `sample-store.js` stores `{sampleId, savedAt, payload, audio: WAV Blob}` in IndexedDB (`camihear` → `pendingSamples`). If `UPLOAD_URL` is set it then POSTs `multipart/form-data` (parts `payload` = JSON, `audio` = WAV) and removes the sample on a 2xx reply; the queue is retried on each page load. `UPLOAD_URL` is **empty**: there is no server yet, so samples stay on the device and the page shows "Saved on this device; will upload when the server is ready". The page shows the random `sampleId` so a user can ask for deletion. JSON and WAV downloads still work.
- **Payload `upload@3` top level:** `sampleId`, `consent {version, acceptedAt}`, `audio {format, encoding, channels, sampleRate, durationS}` (the WAV is sent beside the JSON, not inside it), plus everything from `upload@2`.
