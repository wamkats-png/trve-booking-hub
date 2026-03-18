# TRVE Booking Hub — Master Reference

> **Bucket List Adventures Into The Heart Of Africa**
> Full-stack safari operations dashboard for TRVE Expeditions
> Last updated: 2026-03-18 | Build branch: `claude/confirm-working-4yYw8`

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Build & Deployment](#3-build--deployment)
4. [Configuration](#4-configuration)
5. [Database Schema](#5-database-schema)
6. [Feature Reference](#6-feature-reference)
7. [Pricing Logic](#7-pricing-logic)
8. [Booking Workflow](#8-booking-workflow)
9. [Integrations](#9-integrations)
10. [API Reference](#10-api-reference)
11. [All Changes (Consolidated)](#11-all-changes-consolidated)
12. [Known Issues & Backlog](#12-known-issues--backlog)

---

## 1. System Overview

| Property | Value |
|----------|-------|
| App name | TRVE Booking Hub |
| Version | 2.0.0 |
| Production URL | https://trve-booking-hub-1.onrender.com |
| Coordinators | Desire, Belinda, Robert |
| Backend | FastAPI (Python 3.11+) |
| Frontend | Vanilla JS / HTML5 / CSS3 |
| Database | SQLite 3 (WAL mode) |
| Hosting | Render.com (1 GB persistent disk) |
| Auto-deploy | Push to `main` → Render rebuilds |

### Purpose

End-to-end safari booking operations platform covering: enquiry intake, AI itinerary matching, real-time pricing, PDF quotation generation, client profiles, trip manifests, fleet management, payment ledger, supplier vouchers, and Google Sheets synchronisation.

---

## 2. Architecture

```
Browser (Vanilla JS SPA)
       │
       ▼
  FastAPI (Python)   ──────────────────────────────────────────┐
       │                                                        │
       ├── /api/enquiries          Enquiry CRUD                │
       ├── /api/itineraries         18 packages                │
       ├── /api/curate-itinerary    AI match scoring           │
       ├── /api/calculate-price     Real-time pricing          │
       ├── /api/quotations          PDF generation             │
       ├── /api/lodges              Lodge rate database        │
       ├── /api/sync                Google Sheets sync         │
       └── /api/config              Runtime config             │
                                                               │
       ▼                                                        │
  SQLite (WAL)  ◄──────────────────────────────────────────────┘
  data/trve_hub.db

  Background threads → SMTP email (non-blocking)
```

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JavaScript, HTML5, CSS3 — no framework |
| Backend | FastAPI (Python 3.11+) |
| ASGI Server | Uvicorn |
| Database | SQLite 3, WAL journal mode, foreign keys ON |
| PDF generation | Custom minimal writer (zero dependencies) |
| Email | `smtplib` in background daemon threads |
| Deployment | Render.com, persistent disk for SQLite |
| Testing | pytest + httpx + pytest-asyncio |

### Frontend SPA

Single-page application. Navigation by keyboard shortcut (keys 1–6). State held in JS module-level variables. DOM manipulated directly — no virtual DOM or state management library.

| Key | View |
|-----|------|
| `1` | Enquiries |
| `2` | Pipeline Board (Kanban) |
| `3` | Itinerary Matching |
| `4` | Pricing Calculator |
| `5` | Quotations |
| `6` | Sheets Sync |

Additional panels: Finance Tools, Lodge Rates (sidebar).
New modules (Phase 1–3): Invoices, Payment Ledger, Supplier Vouchers, Client Profiles, Reports & Analytics, Tasks, Manifests, Fleet, Driver/Vehicle Assignment.

### Security Notes

- Login: SHA-256 password hash stored in `app.js`, checked client-side
- No JWT or server-side sessions
- SQLite file not exposed via API
- CORS fully open — restrict in production
- No rate limiting currently

---

## 3. Build & Deployment

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt   # for tests

# Run server
uvicorn api_server:app --reload --host 0.0.0.0 --port 8000

# Run tests
pytest tests/ -v
```

Database is created automatically at `./data/trve_hub.db` on first run.

### render.yaml

```yaml
services:
  - type: web
    name: trve-booking-hub
    runtime: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn api_server:app --host 0.0.0.0 --port $PORT
    disk:
      name: data
      mountPath: /opt/render/project/src/data
      sizeGB: 1
```

### CI/CD Pipeline (GitHub Actions)

File: `.github/workflows/auto-merge.yml`

Trigger: Push to `claude/confirm-working-4yYw8`
Steps:
1. Checkout
2. Setup Python 3.11
3. `pip install -r requirements.txt -r requirements-dev.txt`
4. `pytest tests/ -v`
5. Merge to `main` (auto-deploy triggers on Render)
6. Sync `master` → `main`

### Dependencies

**requirements.txt**
```
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
python-multipart>=0.0.6
```

**requirements-dev.txt**
```
pytest>=7.4.0
httpx>=0.25.0
pytest-asyncio>=0.23.0
pytest-cov>=4.1.0
```

### Changing the Login Password

```bash
echo -n "newpassword" | sha256sum
# Copy the hash and replace it in app.js
```

Current hash (in `app.js`):
```
4879a4eb47de72fb5a3c33d7385b17c48eb91237936741b394fb286ed22afa58
```

---

## 4. Configuration

### Runtime Config (PATCH /api/config)

Config is now **persisted to SQLite** (no longer lost on restart).

| Parameter | Default | Notes |
|-----------|---------|-------|
| `fx_rate` | 3,575 | UGX per USD |
| `fx_buffer_pct` | 3 | % on UGX-priced items |
| `service_fee_pct` | 15 | % on subtotal |
| `commission_rates.standard` | 0 | % |
| `commission_rates.b2b` | 5.6 | % |
| `commission_rates.hornbill` | 0 | % |
| `vehicle_rate_per_day` | 120 | USD |
| `fuel_buffer_pct` | 10 | % on vehicle cost |
| `insurance_rate_per_person_per_day` | 10 | USD |
| `quotation_validity_days` | 7 | Days |
| `coordinators` | ["Desire","Belinda","Robert"] | |

### Environment Variables

| Variable | Default | Required |
|----------|---------|----------|
| `EMAIL_NOTIFICATIONS_ENABLED` | false | No |
| `SMTP_HOST` | smtp.gmail.com | If email on |
| `SMTP_PORT` | 587 | If email on |
| `SMTP_USER` | — | If email on |
| `SMTP_PASS` | — | If email on (Gmail App Password) |
| `EMAIL_FROM_NAME` | TRVE Booking Hub | No |
| `EMAIL_FROM_ADDR` | noreply@trve.co.ug | No |

**Gmail setup:** Enable 2FA → Google Account → Security → App Passwords → generate → paste as `SMTP_PASS`.

### Database Paths

| Environment | Path |
|-------------|------|
| Local | `./data/trve_hub.db` |
| Render.com | `/opt/render/project/src/data/trve_hub.db` |

### UWA Permit Rate Updates

Rates are defined in `api_server.py` in `UWA_RATES` / `PERMIT_RATES` dicts. Update and redeploy.
Monitor: Uganda Wildlife Authority (annual — usually January), Rwanda Development Board, low-season windows (April, May, November).

---

## 5. Database Schema

**Engine:** SQLite 3
```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
```

### enquiries

Primary booking record.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| booking_ref | TEXT UNIQUE | TRVE-YYYYMMDD-XXXX |
| channel | TEXT | WhatsApp/Email/B2B/Hornbill/Direct/Website |
| client_name | TEXT | |
| email | TEXT | |
| phone | TEXT | |
| country | TEXT | |
| nationality_tier | TEXT | FNR / FR / EAC — **required** for pricing |
| inquiry_date | TEXT | |
| tour_type | TEXT | |
| pax | INTEGER | |
| duration_days | INTEGER | |
| destinations_requested | TEXT | |
| travel_start_date | TEXT | |
| travel_end_date | TEXT | |
| status | TEXT | See workflow states below |
| coordinator | TEXT | Desire / Belinda / Robert |
| budget_range | TEXT | |
| interests | TEXT | JSON array |
| special_requests | TEXT | |
| agent_name | TEXT | B2B agent if applicable |
| permits | TEXT | JSON |
| accommodation | TEXT | JSON |
| vehicle | TEXT | JSON |
| insurance | TEXT | JSON |
| quoted_usd | REAL | |
| revenue_usd | REAL | |
| balance_usd | REAL | |
| payment_status | TEXT | |
| internal_flags | TEXT | JSON |
| last_updated | TEXT | |
| synced | INTEGER | 0 = unsynced, 1 = synced to Sheets |
| created_at | TEXT | |

**Status values:** `New_Inquiry` → `Active_Quote` → `Confirmed` → `In_Progress` → `Completed` | `Cancelled` | `Unconfirmed`

### lodges

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| lodge_name | TEXT | |
| room_type | TEXT | |
| country | TEXT | |
| location | TEXT | |
| rack_rate_usd | REAL | Display only |
| net_rate_usd | REAL | **Used in pricing** |
| meal_plan | TEXT | BB / HB / FB / AI |
| valid_from | TEXT | |
| valid_to | TEXT | |
| source_file | TEXT | |
| notes | TEXT | |

100+ partner lodges pre-loaded. Rate lookup priority: exact match → LIKE match → lodge name only → fuzzy → manual entry.

### itineraries

18 pre-catalogued safari packages.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| name | TEXT | |
| duration_days | INTEGER | |
| vehicle_days | INTEGER | |
| destinations | TEXT | JSON array |
| countries | TEXT | JSON array |
| budget_tier | TEXT | budget / mid_range / premium / luxury |
| interests | TEXT | JSON array |
| permits_included | TEXT | JSON |
| parks | TEXT | JSON array |
| season | TEXT | all_year / dry_season / etc. |
| description | TEXT | |
| highlights | TEXT | |
| nationality_tiers | TEXT | JSON |

### quotations

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| quotation_id | TEXT UNIQUE | QUO-YYYYMMDD-NNN |
| client_name | TEXT | |
| client_email | TEXT | |
| booking_ref | TEXT | |
| valid_days | INTEGER | Default 14 |
| pricing_data | TEXT | JSON — full line-item breakdown |
| status | TEXT | draft / sent / accepted / expired |
| created_at | TEXT | |

### sync_queue

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| type | TEXT | enquiry / quotation |
| reference | TEXT | booking_ref or quotation_id |
| description | TEXT | |
| status | TEXT | pending / completed / failed |
| created_at | TEXT | |
| completed_at | TEXT | |

---

## 6. Feature Reference

### Enquiries

- Capture from: WhatsApp, Email, B2B, Hornbill, Direct, Website
- Auto-generate booking reference: `TRVE-YYYYMMDD-XXXX`
- **`nationality_tier` is required** — enforced before pricing (9× permit price difference)
- Confirmation email sent on creation (if SMTP configured)

### Pipeline Board

- Kanban with 7 columns: New Inquiry, Active Quote, Confirmed, In Progress, Completed, Cancelled, Unconfirmed
- Drag-and-drop status transitions
- Coordinator colour-coding
- Stats bar: Total, Active Quotes, Confirmed, Conversion %

### Itinerary Matching (AI Scoring)

Scores 18 packages 0–100:

| Factor | Max pts |
|--------|---------|
| Duration match (±1 day = full, scales to ±4 = 10 pts) | 30 |
| Interest overlap (matched_tags / enquiry_tags × 30) | 30 |
| Budget tier (exact = 20, adjacent = 10) | 20 |
| Destination match (partial per destination) | 15 |
| Nationality availability | 5 |
| Profile bonus | 5 |

Returns top 5 matches. Approving a match:
- Sets status → `Active_Quote`
- Pre-fills Pricing Calculator with itinerary defaults
- Itinerary is now **editable and persisted**
- Can be linked directly to an invoice

**18 Pre-catalogued Packages:**

| # | Name | Duration | Budget tier |
|---|------|----------|-------------|
| 1 | Gorilla & Tree Climbing Lion | 7d | premium |
| 2 | Gorilla Kingdom Explorer | 7d | premium |
| 3 | Exclusive Singita & Elewana | 7d | luxury |
| 4 | Primates & Wildlife Safari | 10d | premium |
| 5 | Ultimate Uganda Safari | 14d | luxury |
| 6 | Murchison Falls Adventure | 4d | mid_range |
| 7 | Chimp & Wildlife Safari | 5d | mid_range |
| 8 | Rwanda Gorilla Express | 3d | luxury |
| 9 | Kidepo Wilderness | 5d | premium (dry season) |
| 10 | Jinja Adventure | 3d | budget |
| 11 | Gorilla & Chimp Combo | 5d | premium |
| 12 | Uganda & Rwanda Combined | 10d | luxury |
| 13 | Photography Safari | 10d | luxury |
| 14 | Honeymoon & Romance | 8d | luxury |
| 15 | Family Safari Adventure | 8d | mid_range (no gorilla <15yr) |
| 16 | Ultimate Birding Safari | 12d | premium |
| 17 | Gorilla Habituation | 4d | premium |
| 18 | Cultural & Community Safari | 6d | mid_range |

### Pricing Calculator

Sections:
1. **Enquiry Link** — attach to a booking
2. **Accommodation** — lodge + room type, auto-filled net rate, nights, rooms; multi-lodge timeline with cascading dates; editable cost preview; child sharing logic; meal plan surcharge auto-removed if rate already includes board
3. **Permits & Park Entry** — nationality-tier auto-applied; vehicle entry fee; low-season discounts; post-July 2026 rate tier
4. **Vehicle & Transport** — days × $120 + 10% fuel buffer; configurable
5. **Insurance** — toggle on/off; $10/person/day
6. **Extra Costs** — per-person, flat-rate, `per_day`, or `per_vehicle` types

**Output:** Line-item breakdown → Subtotal → Service Fee (15%) → FX Buffer (3% on UGX items) → Commission deduction → **Grand Total USD + UGX**

### Quotations

- Generate branded PDF from Pricing Calculator output
- Quotation ID: `QUO-YYYYMMDD-NNN`
- Validity: default 7 days (configurable)
- PDF contains: TRVE header, client details, accommodation table, permits schedule, vehicle section, insurance, extra costs, totals, payment instructions
- Statuses: `draft` → `sent` → `accepted` / `expired`
- Email delivery: PDF attached, includes bank payment instructions

### Invoices & Payment Ledger *(Phase 1)*

- Generate client-facing invoices from confirmed bookings
- Payment Ledger: track deposits, balances, and payment milestones per booking
- Supplier Vouchers: generate lodge and activity operator vouchers

### Client Profiles & Shareable Itineraries *(Phase 2)*

- **Client Profiles:** persistent guest records linkable across multiple bookings
- **Shareable Itineraries:** public-facing itinerary link for client review (`share.html`)
- **Guest Info Forms:** collect passport, dietary, emergency contact details (`guest-form.html`)
- **Reports & Analytics:** booking volume, revenue trends, conversion rate charts

### Tasks, Manifests & Fleet *(Phase 3)*

- **Task Management:** create, assign, track operational tasks per booking
- **Trip Manifests:** packing lists, guest manifests, driver briefing sheets
- **Fleet Management:** register vehicles (make, model, plate, capacity)
- **Driver/Vehicle Assignment:** link driver + vehicle to a specific booking leg

### Finance Tools

Utility panel:
- Commission calculator (B2B 5.6% / Hornbill 0%)
- FX conversion (UGX ↔ USD at configured rate)
- Service fee calculator
- Margin analysis

### Lodge Rates

- 100+ partner lodges pre-loaded
- CRUD interface for rates management
- Auto-lookup in Pricing Calculator

### Sheets Sync

- Linked sheet: `TRVE_Operations_Hub_Branded`
- Sheet ID: `1U7aRziHcFPEaOqiSTLYnYFVsKgmdMhIMR8R2lTJtax4`
- Modes: Export CSV, Push All (mark synced), Import from Sheets (upsert by `booking_ref`)
- Auth: **Google OAuth2 flow** (replaces manual token)

---

## 7. Pricing Logic

### Formula

```
subtotal      = accommodation + permits + vehicle + insurance + extras
service_fee   = subtotal × 0.15
fx_buffer     = ugx_denominated_items_in_usd × 0.03
gross         = subtotal + service_fee + fx_buffer
commission    = gross × rate  (B2B: 5.6% | Hornbill: 0% | standard: 0%)
total_usd     = gross − commission
total_ugx     = total_usd × fx_rate  (default 3,575)
```

### Nationality Tiers

| Tier | Who |
|------|-----|
| **FNR** | Foreign Non-Resident — visitors from outside East Africa |
| **FR** | Foreign Resident — expats living in Uganda/EAC |
| **EAC** | East African Community citizens + Ugandan nationals |

> **Critical:** FNR Gorilla permit = $800. EAC ≈ $84. Always confirm tier before pricing.

### UWA Permit Rates (2024–2026)

| Permit | FNR | FR | EAC (UGX) | EAC (USD equiv.) |
|--------|-----|----|-----------|-----------------|
| Gorilla Tracking — Uganda | $800 | $700 | 300,000 | ~$84 |
| Gorilla Habituation — Uganda | $1,500 | $1,000 | 500,000 | ~$140 |
| Chimp Tracking | $250 | $200 | 180,000 | ~$50 |
| Park Entry A+ (Murchison Falls) | $45/day | $35/day | 25,000/day | ~$7/day |
| Park Entry A (Kibale, QENP, Bwindi) | $40/day | $30/day | 20,000/day | ~$6/day |

### Vehicle Entry Fees (UWA 2024–2026 Tariff)

Added to Permits & Park Entry section. Rates match official UWA tariff. Apply per vehicle per entry.

### Low-Season Discounts (April, May, November)

| Permit | FNR discount | FR discount | EAC |
|--------|-------------|------------|-----|
| Gorilla Tracking | −$200 | −$200 | unchanged |
| Gorilla Habituation | −$200 | −$200 | unchanged |
| Chimp Tracking | −$50 | −$50 | unchanged |
| Park Entry A+ | −$10/day | −$10/day | unchanged |
| Park Entry A | −$10/day | −$10/day | unchanged |

### Post-July 2026 Rate Tier

| Permit | FNR | FR |
|--------|-----|----|
| Gorilla Habituation | $1,800 | $1,200 |
| Chimp Tracking | $300 | $250 |

### Accommodation

```
cost = nights × net_rate_usd × rooms
```

- Rate lookup: exact match → LIKE match → lodge name only → fuzzy → manual
- **Meal plan surcharge not added if lodge net rate already includes the board type**
- **Child sharing:** children sharing a room with an adult do not trigger an additional room charge
- Multi-lodge stays: timeline view, cascading date adjustments, auto-distributed nights

### Vehicle

```
vehicle_cost  = vehicle_days × vehicle_rate_per_day   (default $120/day)
fuel_buffer   = vehicle_cost × fuel_buffer_pct         (default 10%)
total_vehicle = vehicle_cost + fuel_buffer
```

### Insurance

```
insurance = pax × duration_days × insurance_rate_per_person_per_day  (default $10)
```

Toggle on/off per booking.

### Extra Costs

Supports cost types: `per_person`, `flat_rate`, `per_day`, `per_vehicle`.

---

## 8. Booking Workflow

```
Enquiry Received
      │
  Stage 1 ──► New Enquiry created (status: New_Inquiry)
      │        booking_ref assigned, confirmation email sent
      │
  Stage 2 ──► Itinerary Matching (AI scores → approve)
      │        status: Active_Quote
      │        Pricing Calculator pre-filled
      │
  Stage 3 ──► Pricing Calculator
      │        Accommodation + Permits + Vehicle + Insurance + Extras
      │        Review line-item breakdown
      │
  Stage 4 ──► Generate Quotation (PDF)
      │        QUO-YYYYMMDD-NNN assigned, status: draft
      │        Send to client → email + PDF, status: sent
      │        quoted_usd updated
      │
  Stage 5 ──► Client accepts / pays deposit
      │        Pipeline → Confirmed
      │        revenue_usd, balance_usd, payment_status updated
      │
  Stage 6 ──► Trip starts → In Progress
      │
  Stage 7 ──► Trip ends → Completed
      │        Final revenue, balance cleared
      │
  Stage 8 ──► Sheets Sync
               Export CSV → import to TRVE_Operations_Hub_Branded
               Mark All Synced
```

**Status transitions:**

```
New_Inquiry ──► Active_Quote ──► Confirmed ──► In_Progress ──► Completed
     │                │               │
     └────────────────┴───────────────┴──► Cancelled
                                           Unconfirmed (holding)
```

---

## 9. Integrations

### Google Sheets

- Sheet: `TRVE_Operations_Hub_Branded`
- ID: `1U7aRziHcFPEaOqiSTLYnYFVsKgmdMhIMR8R2lTJtax4`
- Auth: **Google OAuth2 full flow** (auto-initiated, no manual token)
- Operations:
  - Export to CSV
  - Push All (mark enquiries as synced)
  - Import from Sheets (upsert by `booking_ref`)
  - Queue status view

CSV sync columns: `booking_ref`, `client_name`, `email`, `phone`, `country`, `nationality_tier`, `channel`, `coordinator`, `status`, `pax`, `duration_days`, `destinations_requested`, `travel_start_date`, `travel_end_date`, `quoted_usd`, `revenue_usd`, `balance_usd`, `inquiry_date`, `created_at`

### Email Notifications

Trigger: enquiry created (confirmation), quotation sent (PDF attached)

**Enquiry email contains:** booking ref, travel dates, PAX, destinations, 24-hr response SLA
**Quotation email contains:** quotation ID, amount (USD), validity/expiry, PDF attachment, bank payment instructions

Architecture: background daemon threads — failures are silent if SMTP not configured.

### Render.com

- Free/starter tier — cold starts 30–60 seconds after idle
- Python 3.11
- 1 GB persistent disk
- Auto-deploy on push to `main`

---

## 10. API Reference

### Health & System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | `{status, version, db}` |
| GET | `/api/config` | All runtime pricing parameters |
| PATCH | `/api/config` | Update config (persisted to SQLite) |
| GET | `/api/email/status` | SMTP enabled status |

### Enquiries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/enquiries` | List — filters: status, coordinator, channel, search |
| POST | `/api/enquiries` | Create (sends confirmation email if enabled) |
| PATCH | `/api/enquiries/{id}` | Partial update |
| GET | `/api/enquiries.csv` | Export all as CSV |

### Itineraries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/itineraries` | List all 18 packages |
| POST | `/api/curate-itinerary` | AI scoring — returns top 5 matches |

### Pricing & Quotations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/calculate-price` | Real-time cost breakdown |
| POST | `/api/quotations` | Generate PDF quotation |
| POST | `/api/quotations/{id}/email` | Send quotation to client |

### Lodges

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/lodges` | List all lodge rates |
| POST | `/api/lodges` | Create lodge rate record |
| PATCH | `/api/lodges/{id}` | Update lodge rate |
| DELETE | `/api/lodges/{id}` | Delete lodge rate |

### Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sync/export` | Export unsynced enquiries as CSV |
| POST | `/api/sync/push-all` | Mark all enquiries as synced |
| POST | `/api/sync/import` | Import CSV from Sheets (upsert by booking_ref) |
| GET | `/api/sync/queue` | View pending sync jobs |

---

## 11. All Changes (Consolidated)

Changes are listed newest-first by commit date.

---

### 2026-03-18

#### `0f59936` — feat: Google OAuth2 Sheets integration
- Replaced manual token entry with full Google OAuth2 auth flow
- Auth is auto-initiated — no manual token pasting required
- Affects: Sheets Sync view (Key 6)

#### `8931ce0` — Allow proceeding to pricing despite accommodation warning
- Accommodation incomplete state is now a **soft warning** — coordinator can proceed to Pricing Calculator
- Removes hard block that prevented navigation when accommodation was unset

---

### 2026-03-17

#### Pricing & Cost Calculation

| Commit | Change |
|--------|--------|
| `fe021e1` | Removed room charge double-count from child sharing cost in accommodation preview |
| `7d7ceee` | Removed meal surcharge when lodge net rate already includes the meal plan (FB/HB) |
| `9a8ecda` | Accommodation cost preview is now **fully editable** — line items adjustable before finalising |
| `2ec276f` | Extended `extra_costs` backend to support `per_day` and `per_vehicle` cost types; added UI hints |
| `58d4e72` | Corrected nights calculation logic; fixed Pakuba Safari Lodge room type data |
| `2350d84` | Added missing Pakuba Safari Lodge room types: Single and Family Banda |

#### Accommodation & Room Assignment

| Commit | Change |
|--------|--------|
| `22c9c3f` | Status checker now counts **assigned guests** instead of `maxOccupancy` — accurate occupancy tracking |
| `a8c97ac` | Fixed auto-assign silently dropping guests when >2 are assigned to a room |
| `ac0e7fc` | Overcrowding validation skipped when coordinator has already confirmed a room override |
| `56195d8` | Fixed ghost guests appearing after room count decrease (stale assignment data cleared) |
| `4635829` | Fixed accommodation block after override; calc preview editable post-override |

#### New Features

| Commit | Feature |
|--------|---------|
| `65fcaf7` | **Phase 3:** Tasks, Manifests, Fleet management, Driver/Vehicle assignment |
| `279ebc5` | **Phase 2:** Client Profiles, Shareable Itineraries (`share.html`), Guest Info Forms (`guest-form.html`) |
| `9278815` | Multi-lodge stay: timeline view, cascading dates, auto-distributed nights |
| `c7e1244` | AI itinerary is now editable, persisted to DB, and linkable to invoices |
| `96bdcdf` | **Phase 2:** Reports & Analytics, Config Persistence (SQLite), Working Itinerary module |
| `958a53f` | **Phase 1:** Invoices, Payment Ledger, Supplier Vouchers |

#### Validation & UX

| Commit | Change |
|--------|--------|
| `e2854d7` | `nationality_tier` enforced as required — blocks silent FNR default |
| `5223dac` | Nationality validation, nights tracking display, nested room type support |
| `b5e5d1e` | Room allocation warnings → hard errors (must confirm) + soft overridable warnings |
| `338f82e` | Fixed notification opacity and DOM removal; config now persisted to SQLite; removed hardcoded rate date |
| `8a5f739` | Fixed modal scroll (card overflow override, scrollable overlay) |
| `0a5849f` | Fixed quotation modal scroll (removed fixed transform centering, `overflow-y: auto`) |

#### Vehicle Entry Fees

| Commit | Change |
|--------|--------|
| `8651f55` | Added vehicle entry fee line item to Permits & Park Entry section |
| `8a50681` | Corrected vehicle entry fee amounts to official UWA 2024–2026 tariff rates |

#### CI/CD & Testing

| Commit | Change |
|--------|--------|
| `a8651c0` | CI now syncs `master` → `main` after every auto-merge |
| `ab43614` | Fixed `fx_rate` not restored in test teardown — was leaking CONFIG state between test runs |

#### Earlier 2026-03-17 Commits

| Commit | Change |
|--------|--------|
| `f094067` | Trigger live deploy: hotel occupancy + null-ref fixes |
| `47758c3` | Fixed null-reference crash in itinerary auto-fill handler |
| `2ab946d` | Fixed hotel room occupancy: children must share a room with at least one adult |
| `e1433f2` | Full occupancy, meal plan, and child pricing logic (Sections 1–9) |
| `89d7859` | Drag-and-drop guest assignment with per-room manual occupancy control |
| `cd9c9a0` | Extracted `_getBasicPax` helper; fixed focus loss in child age inputs; memoised distribution |
| `9c7e5b7` | Redesigned accommodation module: computed occupancy, undo/redo, strict guest count |
| `79694df` | Enforced guest count integrity and child-sharing occupancy logic |
| `59e0c5e` | Fixed accommodation and guest allocation to follow hotel booking structure |

---

## 12. Known Issues & Backlog

| # | Severity | Area | Issue | Status |
|---|----------|------|-------|--------|
| 1 | Medium | UX | Yellow warning icon after itinerary selection — nationality_tier validation not fully complete in all paths | Open |
| 2 | Low | UX | Notification boxes: opacity/contrast issues in some edge cases | Partially fixed (`338f82e`) |
| 3 | Medium | UX | Accommodation nights count not always clearly visible in section header | Open |
| 4 | Medium | Functional | No full guest-to-room-type assignment UI for multi-room multi-type stays | Open |
| 5 | High | Functional | AI itinerary edit/invoice link not universally connected in all booking entry paths | Partially fixed (`c7e1244`) |
| 6 | High | Data integrity | Nationality tier bypass still possible in some direct pricing entry paths | Partially fixed (`e2854d7`) |
| 7 | Low | Config | Post-July 2026 rate trigger date was hardcoded — now removed, confirm config entry reflects this | Partially fixed (`338f82e`) |
| 8 | Low | Config | Runtime config previously lost on Render restart — now persisted to SQLite | Fixed (`338f82e`, `96bdcdf`) |
| 9 | Low | CORS | CORS fully open — should be restricted to production domain | Open |
| 10 | Low | Security | No rate limiting on API endpoints | Open |

---

*End of TRVE Booking Hub Master Reference — 2026-03-18*
