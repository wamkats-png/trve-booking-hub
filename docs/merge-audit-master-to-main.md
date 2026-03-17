# Merge Audit: `master` → `main`

**Generated:** 2026-03-17
**Auditor:** Claude Code
**Scope:** All differences between the `master` branch and `origin/main`

---

## Executive Summary

`master` is a **strict ancestor** of `main` — every commit on `master` already exists in `main`'s history. There are **no divergent commits** and **no data unique to `master`** that would be overwritten by a merge. A fast-forward merge of `master` to `main` is safe and lossless.

`main` contains **87 additional commits** representing a major transformation: from a basic quotation tool into a full booking-management platform.

```
master tip:  a68ffb7  (Create styles.css)
main tip:    3de6d80  (ci: auto-merge claude/confirm-working-4yYw8 → main)
Merge base:  a68ffb7  (= master tip — no divergence)
```

---

## Files Changed

| File | master → main |
|------|--------------|
| `api_server.py` | 2 032 → 5 633 lines (+4 007 net) |
| `app.js` | 3 224 → 9 200 lines (+6 282 net) |
| `index.html` | grown by +549 lines |
| `styles.css` | grown by +1 750 lines |
| `.gitignore` | added (+23 lines) |
| `README.md` | added (+84 lines) |
| `render.yaml` | added (deployment config) |
| `requirements-dev.txt` | added (pytest) |
| `docs/` (10 files) | all new |
| `tests/` (2 files) | all new |
| `.github/workflows/auto-merge.yml` | new CI workflow |

**Files deleted:** none.
**Files unique to `master`:** none (master only has the 5 original source files, all present in `main`).

---

## New Database Tables (6)

| Table | Purpose |
|-------|---------|
| `invoices` | Invoice generation; line items, tax, status lifecycle |
| `payments` | Dual-currency ledger (USD + UGX); method, reference, audit trail |
| `vouchers` | Supplier vouchers: service dates, pax, meal plan, status |
| `config` | Runtime key/value store (FX rate, rate-effective date — no restart needed) |
| `market_data_cache` | Live/manual FX rates, fuel costs, bank fees with override support |
| `itinerary_versions` | Save/restore versioning for editable itineraries |

New indices added on `booking_ref` / `enquiry_id` for all new tables.

---

## New API Endpoints (40+)

### Configuration
- `GET /api/config` — read runtime config
- `PATCH /api/config` — update FX rate, rate-effective date, etc.

### Invoices & Payments
- `POST /api/invoices` — create invoice from quotation
- `GET /api/invoices` — list with filters
- `GET /api/invoices/{id}/pdf` — PDF export
- `PATCH /api/invoices/{id}` — status update
- `POST /api/payments` — record payment
- `GET /api/payments` — list by booking_ref

### Vouchers
- `POST /api/vouchers/generate` — generate supplier voucher
- `GET /api/vouchers` — list
- `GET/PATCH /api/vouchers/{id}` — get / update status

### Lodge Management (full CRUD)
- `POST /api/lodges` — create lodge record
- `GET /api/lodges` — list with search/filter
- `PATCH /api/lodges/{id}` — update
- `DELETE /api/lodges/{id}` — delete
- `POST /api/lodge-rates/from-email` — bulk import rates from email

### Itinerary Versioning
- `GET /api/enquiries/{id}/itinerary/versions` — list saved versions
- `POST /api/enquiries/{id}/itinerary/versions/{vid}/restore` — restore version

### Transfer Fee Calculator
- `POST /api/calculate-transfer-fees` — gross-up bank charge
- `GET /api/transfer-fee-audit` — audit log

### Reports
- `GET /api/reports/summary` — pipeline KPIs by status/channel

### Other
- `GET /api/enquiries/export.csv` — CSV export of pipeline
- Email delivery endpoints (async SMTP with PDF attachments)

---

## New Frontend Features

### New Sidebar Views (3)
- **Invoices & Vouchers** — keyboard shortcut `5` (quotations moved accordingly)
- **Reports & Analytics** — keyboard shortcut `7`
- **Lodge Rates** — lodge database browser/editor

### Pricing Form Overhaul
| Field | master | main |
|-------|--------|------|
| Guests | single "Pax" number | Adults + Children split |
| Children | not tracked | count + per-child age matrix |
| Travel dates | start only | start + end |
| Nationality tier | optional (silently defaults FNR) | **required** — blocks submit if missing |
| Guest roster | none | drag-drop named guest assignment to rooms |
| Staff rooms | none | separate staff accommodation section |
| Accommodation cost | read-only preview | fully editable with undo/redo |
| Buffers | none | Fuel % and FX % sliders |

### Accommodation / Lodge Row Changes
- Multi-lodge support with cascading date ranges and auto-distribution of nights
- Room types with per-type count (replaces single room-type field)
- Soft-warning override for capacity mismatches (was hard block)
- Undo/redo stack for full accommodation config

### Guest Management
- Guest roster derived from Basic Details pax
- Named guests with drag-drop assignment to specific lodge rooms
- Child age tracking with UWA-aware pricing rules (sharing discount, age tiers)
- Staff rooms tracked separately with own meal plan and pricing option

### Pipeline View
- Payment progress bar on each Kanban card (% paid, colour-coded)
- Export CSV button

### State Object (16 new properties)
`activities`, `guestRecords`, `staffRooms`, `childAges`, `childSharingConfirmed`,
`guestPool`, `roomAssignments`, `roomExtras`, `accomHistory`, `accomFuture`,
`roomOverrides`, `overrideLog`, `accommodation` (with `adjustmentLog`, `adjustmentHistory`, `adjustmentFuture`)

---

## Key Architectural Changes

1. **Runtime configuration** — FX rates and permit rate-effective dates stored in `config` table; no code change needed to update rates.
2. **Invoice workflow** — Quotation → Invoice conversion with PDF generation, versioning, and payment matching.
3. **Email notifications** — Async SMTP module added (quotes, invoices, vouchers with PDF attachments).
4. **Testing** — `pytest` infrastructure: `tests/conftest.py` with fixtures, `tests/test_api.py` with 1 037 lines of API tests.
5. **CI/CD** — `.github/workflows/auto-merge.yml` auto-merges feature branches into `main`.
6. **Documentation** — 10 structured docs covering architecture, API reference, pricing logic, known issues, etc.

---

## Merge Risk Assessment

| Risk | Severity | Notes |
|------|----------|-------|
| Data loss from merge | **None** | `master` is ancestor of `main`; fast-forward only |
| Feature regression | **None** | All `master` features are present in `main` |
| Schema migration needed | **Low** | New tables created with `CREATE TABLE IF NOT EXISTS`; additive only |
| Breaking changes to `master` callers | **Low** | `master` branch itself has no downstream dependents |

**Verdict: safe to fast-forward `master` to `main`.**
No manual reconciliation required. Run `git checkout master && git merge --ff-only origin/main`.

---

## Features Present in `master` — Verified in `main`

- ✅ T2b FX exposure panel
- ✅ Fuel cost automation
- ✅ Bank charges calculator
- ✅ Login form security fixes (click handler, no GET leak)
- ✅ All original API endpoints (enquiries, quotations, lodges, permits, itineraries, sync)
