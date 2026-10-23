<!-- File: README.md | Project overview for Cam_I_hear_it -->
# Cam_I_hear_it

Listen to an idling vehicle and estimate as much as possible from sound alone:

- **Idle RPM** (from the firing frequency)
- **Cylinder count / engine layout** (inline-4, V6, cross-plane V8, etc.)
- **Cam character**: stock, mild, or big/lopey, plus a rough lope or "chop" score
- **Engine family guess** (e.g. GM LS vs. Ford Coyote vs. Honda K), with a confidence score
- **Faults**: knock, ping, lifter/valvetrain tick, exhaust leak tick, belt/pulley chirp

See [docs/PLAN.md](docs/PLAN.md) for the roadmap, feasibility notes, and the hardware vs. web decision.

Docs and code: [research](docs/RESEARCH_ACOUSTICS.md) · [DSP lib](lib/README.md) · [capture page](web/README.md) · [ML backend design](docs/ML_BACKEND.md) · [hardware design](docs/HARDWARE.md)

Status: research, DSP lib (tested on synthetic signals) and web capture page are in place. Real-vehicle and iPhone testing are pending (2026-10-22).
