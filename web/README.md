<!-- File: web/README.md | How to run and deploy the Cam_I_hear_it static capture page -->
# web/: static capture page

This is plain HTML and vanilla ES modules with no build step. `web/lib/` holds the compiled DSP library; regenerate it with `cd lib && npm run web`.

- **Run locally:** `python3 -m http.server -d web 8080`, then open http://localhost:8080. Mic access needs `localhost` or HTTPS.
- **GitHub Pages:** in Settings → Pages, serve from the `main` branch. Pages can only serve the repo root or `/docs`, so either move this folder there or add a Pages Actions workflow that publishes `web/`. GitHub Pages on a **private** repo needs a paid plan.
- **Upload:** off by default. Enter a backend URL (or pass `?post=https://…`) and tick **Enable upload**. Only features and vehicle info are sent, never audio. Use **Download WAV** to keep raw audio for the dataset.
- **Mic processing:** `echoCancellation`, `noiseSuppression` and `autoGainControl` are requested `false`. The actual `track.getSettings()` result goes into every payload, because iOS Safari may ignore some of them (docs/RESEARCH_ACOUSTICS.md §7).
