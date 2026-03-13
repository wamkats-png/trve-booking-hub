# Architecture

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Vanilla JavaScript, HTML5, CSS3 | No framework dependencies |
| Backend | FastAPI (Python 3.11+) | Async REST API |
| Server | Uvicorn | ASGI server |
| Database | SQLite 3 | WAL mode, foreign keys enabled |
| PDF | Custom minimal writer | No external PDF library |
| Email | SMTP + Python `smtplib` | Background daemon threads |
| Deployment | Render.com | Persistent disk for SQLite |
| Testing | pytest | Fixtures in `conftest.py` |

---

## Directory Structure

```
trve-booking-hub/
├── api_server.py          # FastAPI backend (~3,360 lines)
├── app.js                 # Frontend application (~4,000 lines)
├── index.html             # Single-page HTML shell
├── styles.css             # All application styles
├── render.yaml            # Render deployment config
├── requirements.txt       # Python package dependencies
├── data/
│   └── trve_hub.db        # SQLite database (persistent)
├── tests/
│   ├── conftest.py        # pytest fixtures
│   └── test_api.py        # API test suite
└── docs/                  # This documentation
```

---

## Frontend Architecture

The entire UI is a single-page application served by FastAPI as a static file.

### View Navigation

Views are switched by number keys `1`–`6`:

| Key | View | Description |
|---|---|---|
| `1` | Enquiries | New enquiry form and search |
| `2` | Pipeline Board | Kanban status board |
| `3` | Itinerary Matching | AI curation and selection |
| `4` | Pricing Calculator | Real-time cost breakdown |
| `5` | Quotations | PDF generation and email |
| `6` | Sheets Sync | Google Sheets integration |

### Additional Sidebar Items

| Item | Description |
|---|---|
| Finance Tools | Commission and fee utilities |
| Lodge Rates | Full lodge database management |

### State Management

All application state is held in JavaScript module-level variables. There is no external state library. DOM is manipulated directly.

---

## Backend Architecture

### Request Flow

```
Browser → FastAPI → Route Handler → SQLite → Response
                        │
                        └── Background: Email (SMTP thread)
```

### CORS

All origins, methods, and headers are allowed (`CORSMiddleware` with `allow_all=True`). This is intentional for development and Render.com deployment.

### Database Connection

- One SQLite connection per request (via `get_db()` generator)
- WAL journal mode for concurrent read/write
- Foreign keys enabled
- Tables created at startup via `init_db()`

---

## Database

### Engine

SQLite 3 with:
```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
```

### Tables

- `enquiries` — all client bookings
- `lodges` — accommodation rates database
- `itineraries` — 18 pre-catalogued safari packages
- `quotations` — generated PDF quotations
- `sync_queue` — Google Sheets sync job queue

Full schema details: [Data Models](data-models.md)

---

## Deployment

### render.yaml

```yaml
services:
  - type: web
    runtime: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn api_server:app --host 0.0.0.0 --port $PORT
    disk:
      mountPath: /opt/render/project/src/data
      sizeGB: 1
```

### Environment Variables (Render Dashboard)

| Variable | Required | Default |
|---|---|---|
| `EMAIL_NOTIFICATIONS_ENABLED` | No | `false` |
| `SMTP_HOST` | No | `smtp.gmail.com` |
| `SMTP_PORT` | No | `587` |
| `SMTP_USER` | For email | — |
| `SMTP_PASS` | For email | — |
| `EMAIL_FROM_NAME` | No | `TRVE Booking Hub` |
| `EMAIL_FROM_ADDR` | No | `noreply@trve.co.ug` |

---

## Security Notes

- Login protected by SHA-256 password hash in `app.js`
- No JWT or server-side sessions — auth state held in `_trveAuth` JS variable
- SQLite file is not exposed via any API endpoint
- CORS is fully open — restrict in production if needed
- No rate limiting on endpoints
