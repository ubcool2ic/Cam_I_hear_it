<!-- File: backend/README.md | Placeholder and quick-start plan for the Cam_I_hear_it ML backend service -->
# backend/: ML service (planned, no code yet)

The full design is in **[docs/ML_BACKEND.md](../docs/ML_BACKEND.md)**.

- **Stack:** Python 3.11, FastAPI, Uvicorn, SQLite, scikit-learn / PyTorch (offline training). No paid services.
- **Input:** the `cam-i-hear-it/upload@1` JSON from `web/`, plus an optional WAV and an optional Macchina M2 RPM log.
- **Output:** cam class, layout and fault predictions with confidences.

Planned layout:
```
backend/
  app/main.py        # FastAPI routes: /api/v1/clips, /audio, /obd, /predict
  app/schema.py      # Pydantic models mirroring docs/ML_BACKEND.md §2
  app/store.py       # SQLite + file storage
  train/             # offline training scripts (baseline GBM on lib features first)
  tools/align_obd.py # blip cross-correlation alignment with Macchina logs
```

Run (once written): `pip install fastapi uvicorn pydantic && uvicorn app.main:app --port 8000`. Then open the web page with `?post=http://<host>:8000/api/v1/clips` and tick **Enable upload**.
