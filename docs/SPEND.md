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

### Round 3: units setting, then consent gate, policies, distance bands, auto-save (2026-10-23)

No OpenRouter calls. Everything was written by hand. The key's account-wide usage at 15:22 EDT read 140.682119, up from 137.775719, but that key is shared with other work and this round made no requests, so the repo delta is **$0.00**. Cumulative for this repo stays at **$0.148175** (4.9% of the $3.00 cap).

### Round 4: cam-spec-from-sound ML research doc (2026-10-23)

**Task:** research doc [RESEARCH_CAM_SPEC_ML.md](RESEARCH_CAM_SPEC_ML.md), docs only. **Hard cap:** $1.00. **Model:** `google/gemini-3.8-flash` (fallbacks `meta/muse-spark-1.3`, then `openai/gpt-6-sol`; neither was needed).

**Key usage** (`GET /api/v1/key`, USD, cumulative, shared key):
- Before: **140.682119**
- After (22:50 EDT): **140.736618**. That delta of 0.054499 covers call 1 only; call 2 had not yet appeared in the key total, because usage reporting lags.

| # | Time (EDT) | Model | Purpose | Prompt tok | Completion tok | Cost (USD) | Notes |
|---|---|---|---|---|---|---|---|
| 1 | 2026-10-23 22:42 | google/gemini-3.8-flash | Literature synthesis + first draft from a hand-collected source pack | 7,670 | 12,999 | 0.054499 | Heavily hand-edited. Every citation was re-checked against Crossref / publisher / patent records, and wrong metadata and misattributions were fixed |
| 2 | 2026-10-23 22:49 | google/gemini-3.8-flash | Review pass: untagged claims, cam arithmetic | 12,826 | 425 | 0.011213 | No substantive errors found. Added a conventions note |
| | | | **Round total** | | | **0.065712** | **6.6% of the $1.00 cap** |

Cumulative for this repo: 0.148175 + 0.065712 = **$0.213887**.
