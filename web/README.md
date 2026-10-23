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
| `index.html` | Markup: guided capture card, live dashboard, vehicle form, position picker + bands, mic-settings table, opt-in upload, payload viewer, sticky record bar |
| `style.css` | Dark, mobile-first styles (safe-area insets, 44 px tap targets) |
| `app.js` | Mic capture (voice processing off), live spectrogram, live and final analysis, payload, downloads, opt-in POST |
| `vehicle-picker.js` | Top-down 360° SVG outline. Tap a zone (docs/RESEARCH_ACOUSTICS.md §10 codes) to get `{zone, side, tapXY}`; RHD relabels driver/passenger |
| `capture-guide.js` | Guided steps: tailpipe 0.5 m at 45°, then hood-open 20–40 cm over the engine, then free capture. Each step presets the position fields |
| `recorder-worklet.js` | AudioWorklet that forwards raw mic samples to the main thread |

## Behaviour notes

- **Readout:** RPM, cylinder guess with confidence, lope score (0–100; the words smooth/mild/noticeable/heavy are provisional and uncalibrated), and a Knock card that always reads "Not testable at idle". Spark knock needs load (docs/PLAN.md §1).
- **Live analysis:** every 2 s on the last 8 s of audio. The first 1 s after Start is skipped (startup transient). The final analysis on Stop uses the whole clip minus that first second.
- **Mic processing:** `echoCancellation`, `noiseSuppression` and `autoGainControl` are requested `false`. The page shows what `track.getSettings()` reports was actually applied, and stores that in the payload as `device.trackSettings`, minus `deviceId`/`groupId`. iOS Safari may ignore some of these (docs/RESEARCH_ACOUSTICS.md §7).
- **Upload:** off by default. The POST button only enables after a clip is analysed, an http(s) URL is entered (or passed as `?post=https://…`), **and** the opt-in box is ticked. Only JSON goes up (features, vehicle, capture position, device settings); **audio is never uploaded**. Use **WAV** to keep raw audio locally.
