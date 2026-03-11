# TRVE Booking Hub — Claude Code Reference

## Project Overview

**The Rift Valley Explorer (TRVE)** — Safari Operations Dashboard.
A single-page booking management system for an East Africa safari operator.
Originally created with Perplexity Computer, migrated to Claude Code.

---

## Architecture

| Layer | Technology | File(s) |
|-------|-----------|---------|
| Backend API | Python / FastAPI | `api_server.py` |
| Frontend | Vanilla JS (no frameworks) | `app.js`, `index.html`, `styles.css` |
| Database | SQLite (WAL mode) | `data/trve_hub.db` |
| Dependencies | pip | `requirements.txt` |

---

## Running the Project

```bash
# Install dependencies
pip install -r requirements.txt

# Start the API server (port 8000)
uvicorn api_server:app --reload --port 8000
```

The frontend is served as a static site by FastAPI from the project root.
Open `http://localhost:8000` in the browser.

**API URL override:** Set `window.TRVE_API_URL` in `config.js` (not committed) or the
environment. When hosted on Perplexity Computer the app auto-detects `port/8000` proxy.

---

## File Layout

```
trve-booking-hub/
├── api_server.py      # FastAPI backend — all routes, SQLite schema, PDF engine
├── app.js             # Vanilla JS SPA — all UI logic, state, permit pricing
├── index.html         # Single HTML shell (login gate + app skeleton)
├── styles.css         # All CSS
├── requirements.txt   # fastapi, uvicorn[standard], python-multipart
└── data/              # Created at runtime
    └── trve_hub.db    # SQLite database (WAL mode, FK enforcement)
```

---

## Database Schema

### `enquiries` — booking pipeline
Key columns: `id`, `booking_ref` (unique), `channel`, `client_name`, `email`, `phone`,
`country`, `nationality_tier`, `status`, `coordinator`, `pax`, `quoted_usd`,
`travel_start_date`, `travel_end_date`, `duration_days`, `destinations_requested`,
`tour_type`, `budget_range`, `interests`, `special_requests`, `agent_name`,
`permits`, `accommodation`, `vehicle`, `insurance`, `revenue_usd`, `balance_usd`,
`payment_status`, `internal_flags`, `last_updated`, `synced`, `created_at`.

### `lodges` — lodge rate sheet
Key columns: `id`, `lodge_name`, `room_type`, `country`, `location`,
`rack_rate_usd`, `net_rate_usd`, `meal_plan`, `valid_from`, `valid_to`,
`source_file`, `notes`.

### `itineraries` — 18-itinerary library
Key columns: `id`, `name`, `duration_days`, `vehicle_days`, `destinations` (JSON),
`countries` (JSON), `budget_tier`, `interests` (JSON), `permits_included` (JSON),
`parks` (JSON), `season`, `description`, `highlights`, `nationality_tiers` (JSON).

### `quotations` — PDF quotation records
Key columns: `id`, `quotation_id`, `client_name`, `client_email`, `booking_ref`,
`valid_days`, `created_at`, `pricing_data` (JSON), `status`.

### `sync_queue` — async task queue
Key columns: `id`, `type`, `reference`, `description`, `status`,
`created_at`, `completed_at`.

---

## Domain Concepts

### Nationality Tiers
Determines permit and park-entry pricing:

| Code | Meaning |
|------|---------|
| `FNR` | Foreign Non-Resident (default, highest rate) |
| `FR` | Foreign Resident (Uganda-based expats) |
| `ROA` | Rest of Africa |
| `EAC` | East African Community (pay in UGX) |
| `Ugandan` | Ugandan nationals (pay in UGX) |

### Booking Statuses (Kanban columns)
`New_Inquiry` → `Active_Quote` → `Confirmed` → `In_Progress` → `Completed`
Side states: `Cancelled`, `Unconfirmed`

### Booking Channels
`whatsapp` | `email` | `b2b` | `hornbill` | `direct` | `website`

### Permit Types (UWA Tariff 2024-2026)
- `gorilla_tracking_uganda` — FNR $800, FR $700; low season (Apr/May/Nov) FNR $600
- `gorilla_habituation_uganda` — FNR $1,500; from July 2026: FNR $1,800
- `gorilla_tracking_rwanda` — FNR $1,500, FR $500; low season FNR $1,050
- `chimp_tracking` — FNR $250; from July 2026: FNR $300
- `chimp_habituation` — FNR $400
- `golden_monkey` — FNR $100
- `park_entry_a_plus` — Murchison Falls, FNR $45/day
- `park_entry_a` — QENP/Kibale/Bwindi/Kidepo/L.Mburo, FNR $40/day
- `park_entry_b` — Semuliki/Rwenzori/Mt Elgon, FNR $35/day

Low-season months: **April (4), May (5), November (11)**
FX rate: **3,575 UGX/USD** (2026 average, also fetched live from open.er-api.com)

### Interests / Activity Tags
`gorilla_trekking`, `chimp_trekking`, `wildlife_safari`, `primate`, `birding`,
`cultural`, `adventure`, `luxury`, `scenic`, `boat_cruise`, `tree_climbing_lions`,
`off_beaten_path`, `community`, `beach`, `big_five`, `cross_border`, `history`

---

## Authentication

Client-side login gate using SHA-256 of the employee password.
Hash stored in `app.js` (`PASSWORD_HASH`). Auth is in-memory per page session (not persisted).
Do **not** store the plaintext password in any file.

---

## Key Implementation Notes

- The backend seeds the SQLite DB from `ITINERARY_LIBRARY` (18 itineraries) on first run.
- Legacy JSON files (`data/pipeline.json`, `data/lodges.json`, etc.) are supported for
  one-time migration only; SQLite is the source of truth.
- `db_session()` context manager handles commit/rollback automatically.
- All JSON array columns (`destinations`, `interests`, etc.) are stored as JSON strings
  and must be parsed/serialised explicitly.
- PDF quotation generation is handled entirely server-side in `api_server.py`.
- The frontend state object (`state`) is the single source of truth for the UI;
  all views re-render from it after API calls.
- `coordinator` defaults to `'Desire'` in the JS state.

---

## Development Notes

- No build step — edit files directly.
- No test suite yet — add tests under `tests/` using `pytest`.
- Linting: `ruff check .` for Python, no JS linter configured.
- The `data/` directory is git-ignored (runtime artefacts).
