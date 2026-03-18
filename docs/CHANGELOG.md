# TRVE Booking Hub — Consolidated Changelog

**Project:** Bucket List Adventures Into The Heart Of Africa
**Platform:** [https://trve-booking-hub-1.onrender.com](https://trve-booking-hub-1.onrender.com)
**Last Updated:** 2026-03-18

---

## Latest Changes (2026-03-17 → 2026-03-18)

---

### 2026-03-18

#### feat: Google OAuth2 Sheets Integration (`0f59936`)
- Replaced manual token entry with a full Google OAuth2 authentication flow for Google Sheets sync
- Users no longer need to paste tokens manually — the auth flow is initiated automatically
- Relevant to the **Sheets Sync** view (Key `6`)

#### fix: Allow Proceeding to Pricing Despite Accommodation Warning (`8931ce0`)
- Coordinators can now continue to the Pricing Calculator even when the accommodation section shows an incomplete warning
- Previously, the incomplete accommodation state would block navigation to pricing — this is now a soft warning only

---

### 2026-03-17

#### Pricing & Cost Calculation Fixes

| Commit | Fix |
|--------|-----|
| `fe021e1` | Removed room charge double-count from child sharing cost in the accommodation preview |
| `7d7ceee` | Removed meal surcharge when the lodge rate already includes the meal plan (e.g. Full Board, Half Board) |
| `58d4e72` | Corrected nights calculation logic; fixed Pakuba Safari Lodge room type definitions |
| `2350d84` | Added missing Pakuba Safari Lodge room types: **Single** and **Family Banda** |
| `2ec276f` | Extended `extra_costs` backend to handle `per_day` and `per_vehicle` cost types; added UI hints to clarify cost type selection |
| `9a8ecda` | Made the accommodation cost preview **fully editable** — coordinators can now manually adjust line items before finalising |

---

#### Accommodation / Room Assignment Fixes

| Commit | Fix |
|--------|-----|
| `22c9c3f` | Fixed accommodation status checker to count **assigned guests** instead of `maxOccupancy` — status now reflects actual occupancy |
| `a8c97ac` | Fixed auto-assign silently dropping guests when more than 2 guests are assigned to a single room |
| `ac0e7fc` | Skip overcrowding validation when a room override has already been confirmed by the coordinator |
| `56195d8` | Fixed ghost guests appearing due to stale room assignments after decreasing room count |
| `4635829` | Fixed accommodation block after override; calc preview made editable post-override |

---

#### New Features

##### Phase 3 — Tasks, Manifests, Fleet & Driver/Vehicle Assignment (`65fcaf7`)
- Added **Task Management** module: create, assign, and track operational tasks per booking
- Added **Trip Manifests**: generate packing lists, guest manifests, and driver briefing sheets
- Added **Fleet Management**: register and manage vehicles (make, model, plate, capacity)
- Added **Driver/Vehicle Assignment**: link a registered driver and vehicle to a specific booking leg

##### Phase 2 — Client Profiles, Shareable Itineraries, Guest Info Forms (`279ebc5`)
- Added **Client Profiles**: persistent guest records linkable across multiple bookings
- Added **Shareable Itineraries**: generate a public-facing itinerary link to share with clients
- Added **Guest Info Forms**: collect detailed guest information (passport, dietary, emergency contacts) via a dedicated form page (`guest-form.html`)

##### Multi-Lodge Stay Support (`9278815`)
- Added support for **multi-lodge itineraries** with a visual timeline
- Cascading date logic: adjusting one lodge segment automatically updates subsequent segments
- Auto-distribution of nights across lodges based on itinerary structure

##### Editable, Persistent, Invoice-Linked AI Itinerary (`c7e1244`)
- The AI-generated itinerary is now **editable** directly within the matching view
- Itinerary changes are **persisted** to the database
- Itineraries can be **linked to invoices** for end-to-end booking flow continuity

##### Phase 2 — Reports & Analytics, Config Persistence, Working Itinerary (`96bdcdf`)
- Added **Reports & Analytics** view: booking volume, revenue trends, conversion rates
- **Config Persistence**: pricing configuration (FX rate, service fee, etc.) now saved to SQLite — survives Render re-deploys
- Working Itinerary module expanded with full day-by-day editing

##### Phase 1 — Invoices, Payment Ledger, Supplier Vouchers (`958a53f`)
- Added **Invoice generation**: produce client-facing invoices directly from confirmed bookings
- Added **Payment Ledger**: track deposits, balances, and payment milestones per booking
- Added **Supplier Vouchers**: generate supplier-facing vouchers for lodges and activity operators

---

#### Validation & UX Improvements

| Commit | Change |
|--------|--------|
| `e2854d7` | `nationality_tier` is now **required** — system blocks silent default to FNR (prevents 9× permit pricing error) |
| `5223dac` | Implemented: nationality validation enforcement, nights tracking display, nested room type support |
| `b5e5d1e` | Room allocation warnings converted to **hard errors** (must confirm) and **soft overridable warnings** (can bypass) |
| `338f82e` | Fixed notification opacity and DOM removal; removed hardcoded rate expiry date; config now persisted to SQLite |
| `8a5f739` | Fixed modal scroll: overrode card overflow, made overlay scrollable |
| `0a5849f` | Fixed quotation modal scroll: removed fixed transform centering, added `overflow-y: auto` |

---

#### Vehicle Entry Fees

| Commit | Change |
|--------|--------|
| `8651f55` | Added **vehicle entry fee** line item to the Permits & Park Entry section of the Pricing Calculator |
| `8a50681` | Corrected vehicle entry fee amounts to match **official UWA 2024–2026 tariff rates** |

---

#### CI/CD

| Commit | Change |
|--------|--------|
| `a8651c0` | Added CI step to **sync `master` to `main`** after every auto-merge |
| `ab43614` | Fixed `fx_rate` not being restored in test teardown — prevented CONFIG state leak between test runs |

---

#### Documentation

| Commit | Change |
|--------|--------|
| `c4b75e1` | Added `docs/merge-audit-master-to-main.md` — audit confirming `master` is a strict ancestor of `main`, safe to merge |

---

## Current System State

### Architecture
- **Frontend:** Vanilla JavaScript, HTML5, CSS3 (no frameworks)
- **Backend:** FastAPI (Python 3.11+) with Uvicorn
- **Database:** SQLite 3 with WAL mode (304 KB, persisted on Render disk)
- **Deployment:** Render.com with 1 GB persistent disk, auto-deploy on push to `main`

### Active Views
| Key | View | Status |
|-----|------|--------|
| `1` | Enquiries | Active |
| `2` | Pipeline Board (Kanban) | Active |
| `3` | Itinerary Matching (AI scoring) | Active |
| `4` | Pricing Calculator | Active |
| `5` | Quotations (PDF + email) | Active |
| `6` | Sheets Sync (Google OAuth2) | Updated |
| — | Client Profiles | New (Phase 2) |
| — | Tasks & Manifests | New (Phase 3) |
| — | Fleet & Driver Assignment | New (Phase 3) |
| — | Invoices & Payment Ledger | New (Phase 1) |
| — | Supplier Vouchers | New (Phase 1) |
| — | Reports & Analytics | New (Phase 2) |

### Pricing Configuration (Current Defaults)
| Parameter | Value |
|-----------|-------|
| FX Rate (USD → UGX) | 3,575 |
| FX Buffer | 3% |
| Service Fee | 15% |
| B2B Commission | 5.6% |
| Vehicle Rate/Day | $120 |
| Fuel Buffer | 10% |
| Insurance (per person/day) | $10 |
| Quotation Validity | 7 days |

### UWA Permit Rates (2024–2026)
| Permit | FNR | FR | EAC (UGX) |
|--------|-----|----|-----------|
| Gorilla Tracking | $800 | $700 | 300,000 |
| Gorilla Habituation | $1,500 | $1,000 | 500,000 |
| Chimp Tracking | $250 | $200 | 180,000 |
| Park Entry A+ (Murchison) | $45/day | $35/day | 25,000/day |
| Park Entry A (Kibale, QENP, Bwindi) | $40/day | $30/day | 20,000/day |

> **Post-July 2026:** Gorilla Habituation → $1,800 FNR / $1,200 FR; Chimp → $300 FNR / $250 FR

### Known Open Issues
| Severity | Issue |
|----------|-------|
| High | Nationality field not enforced before pricing in all entry paths (partially fixed) |
| High | AI itinerary static in some flows — edit/convert-to-invoice not universally linked |
| Medium | Yellow warning icon after itinerary selection (nationality_tier validation incomplete) |
| Medium | Nights count not clearly visible in accommodation section (UX) |
| Low | Post-July 2026 rate date was hardcoded (now removed — confirm config entry) |

---

## Coordinators
- Desire
- Belinda
- Robert
