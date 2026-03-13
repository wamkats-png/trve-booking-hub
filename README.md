# TRVE Booking Hub — The Rift Valley Explorer

> **v2.0.0** — Bucket List Adventures Into The Heart Of Africa

A full-stack safari operations dashboard for managing enquiries, itinerary matching, pricing calculations, quotation generation, and Google Sheets synchronisation.

---

## Quick Links

| Document | Description |
|---|---|
| [Architecture](docs/architecture.md) | Tech stack, directory layout, deployment |
| [Features Guide](docs/features.md) | All modules — Pipeline, Pricing, Quotations, etc. |
| [Data Models](docs/data-models.md) | Database schema and Pydantic schemas |
| [API Reference](docs/api-reference.md) | All REST endpoints with parameters |
| [Pricing Logic](docs/pricing-logic.md) | UWA tariffs, vehicle, accommodation, buffers |
| [Itinerary Matching](docs/itinerary-matching.md) | 18 catalogued safaris + scoring algorithm |
| [Configuration](docs/configuration.md) | System config, environment variables |
| [Integrations](docs/integrations.md) | Google Sheets sync, email notifications |
| [Booking Workflow](docs/booking-workflow.md) | End-to-end process from enquiry to invoice |
| [Known Issues & Fixes](docs/known-issues.md) | Logged bugs, validation gaps, and resolutions |

---

## System Overview

```
Browser (Vanilla JS + HTML/CSS)
        │
        ▼
FastAPI (Python 3.11+)  ──▶  SQLite (WAL mode)
        │
        ├── /api/enquiries        Enquiry management
        ├── /api/itineraries      Pre-catalogued safaris
        ├── /api/curate-itinerary AI matching
        ├── /api/calculate-price  Real-time pricing
        ├── /api/quotations       PDF generation & email
        ├── /api/lodges           Lodge rates database
        ├── /api/sync             Google Sheets sync
        └── /api/config           System configuration
```

---

## Running Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Start server (defaults to port 8000)
uvicorn api_server:app --reload --host 0.0.0.0 --port 8000

# Run tests
pytest tests/ -v
```

Open `http://localhost:8000` in your browser.

---

## Deployed Environment

- **Platform**: Render.com
- **URL**: https://trve-booking-hub-1.onrender.com
- **Runtime**: Python 3.11
- **Database**: SQLite at `/opt/render/project/src/data/trve_hub.db` (1 GB persistent disk)
- **Build**: `pip install -r requirements.txt`
- **Start**: `uvicorn api_server:app --host 0.0.0.0 --port $PORT`

---

## Dashboard Login

The dashboard is protected by a password gate. Credentials are set at the frontend level (SHA-256 hash stored in `app.js`). All six views require authentication.

---

## Coordinators

- Desire
- Belinda
- Robert
