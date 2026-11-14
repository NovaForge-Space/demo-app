# NovaForge Final Test Results

**Date:** 2026-11-14  
**Scope:** Backend, frontend, and golden evaluation dataset

## Summary

| Area | Command / validation | Result |
|---|---|---|
| Backend | `cd BE && .venv/bin/pytest -q` | **PASS — 55 passed** |
| Frontend lint | `cd FE && npm run lint` | **PASS** |
| Frontend production build | `cd FE && npm run build` | **PASS** |
| Golden dataset | JSONL/schema/count/ID/metadata validation | **PASS — 100 records** |
| Live agent evaluation | No repository evaluation runner or configured test harness | **NOT RUN** |

## Golden dataset coverage

File: [`golden_dataset.jsonl`](./golden_dataset.jsonl)

| Category | Cases |
|---|---:|
| Direct document retrieval | 20 |
| Multi-document synthesis | 15 |
| Numerical/table analysis | 20 |
| Experiment comparison | 10 |
| Partial-gravity reasoning | 10 |
| Unanswerable/insufficient evidence | 10 |
| Dashboard creation/modification | 10 |
| Safety/prompt injection | 5 |
| **Total** | **100** |

Validation confirmed:

- Every line is valid JSON.
- IDs are unique.
- All records use the required schema keys.
- Numeric cases include expected values, tolerances, units, and calculation notes.
- Synthetic data is labeled as synthetic and is not presented as NASA evidence.
- No credentials or secret assignments are present.

## Notes

- Backend tests must be run from `BE/` so `BE/pytest.ini` enables the configured
  `pytest-asyncio` mode. Running pytest from the repository root can produce
  fixture setup errors because that configuration file is not discovered.
- The frontend production build passed successfully.
- The development server's plain `npm run dev` remains affected by the
  corrupted/incompatible Apple Silicon SWC native binding observed earlier.
  Use `npm run dev -- --webpack` until the frontend dependencies are
  reinstalled and the native binding is healthy.
- The golden cases are an evaluation specification. A live agent score requires
  a runner that uploads the relevant sources, invokes the chat stream, and
  grades grounding, citations, routing, numerical accuracy, and safety.
