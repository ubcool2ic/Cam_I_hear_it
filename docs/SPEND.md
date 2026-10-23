<!-- File: docs/SPEND.md | OpenRouter spend log for model-assisted coding on Cam_I_hear_it -->
# OpenRouter spend log

**Task:** build the capture website (branch `feature/website`). **Hard cap:** $3.00 of new spend.
**Model order:** `google/gemini-3.8-flash`, then `meta/muse-spark-1.3`, with `openai/gpt-6-sol` only as a last resort.

**Key usage** (`GET /api/v1/key`, USD, cumulative for the key):
- Before the task (2026-10-23 02:30 EDT): **137.627544**
- After the last call: **137.775719**
- Delta: **$0.148175**, which matches the sum of the per-call costs below.

| # | Time (EDT) | Model | Purpose | Prompt tok | Completion tok | Cost (USD) | Notes |
|---|---|---|---|---|---|---|---|
| 1 | 2026-10-23 02:32 | google/gemini-3.8-flash | Generate web UI: index.html, style.css, vehicle-picker.js, capture-guide.js, app.js | 8,579 | 22,418 | 0.090502 | Finished normally. Reviewed and edited by hand; see the PR description for what changed |
| 2 | 2026-10-23 02:36 | google/gemini-3.8-flash | Bug review of the integrated web files | 16,918 | 11,996 | 0.057674 | Hit max_tokens, mostly reasoning. One valid finding (WebKit zero getBBox) was fixed |
| | | | **Total** | | | **0.148175** | **4.9% of the $3.00 cap** |

Per-call cost is OpenRouter's `usage.cost` from each response. Neither fallback model was needed.
The DSP fix (the browser vs offline lope mismatch) was written by hand, without a model.

### Round 2: exterior position picker rework (2026-10-23)

No OpenRouter calls. The picker, environment form, guide, payload `upload@2` and the §10 note were written by hand. Key usage checked at 02:58 EDT: **137.775719**, unchanged, so the delta for this round is **$0.00**. Cumulative for this repo stays at **$0.148175** (4.9% of the $3.00 cap).
