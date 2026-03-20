# TRVE Booking Hub — Inspector Report
**Generated:** 2026-03-20 | **Agent:** Inspector | **Branch:** claude/review-reference-docs-j0bPB

---

## A. ROUTES (101 total)

### Core Operations
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/health | Health check + DB status |
| GET | /api/config | Hub configuration |
| PATCH | /api/config | Update config values |
| GET | /api/reports/summary | Booking pipeline summary |

### Enquiry Management
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/enquiries | List all enquiries |
| POST | /api/enquiries | Create new enquiry |
| PATCH | /api/enquiries/{id} | Update enquiry |
| GET | /api/enquiries/{id}/itinerary/versions | Itinerary version history |
| POST | /api/enquiries/{id}/itinerary/versions/{v}/restore | Restore itinerary version |
| POST | /api/enquiries/{id}/create-invoice | Create invoice from enquiry |
| GET | /api/enquiries/{id}/manifest | Driver/ops manifest |
| GET | /api/enquiries/{id}/manifest/pdf | Manifest PDF |
| GET | /api/enquiries/{id}/driver-briefing/pdf | Driver briefing PDF |
| GET | /api/enquiries/{id}/guest-info | Guest submitted info |
| POST | /api/enquiries/{id}/guest-form | Create guest form token |
| GET | /api/enquiries.csv | CSV export |
| GET | /api/enquiries/export.csv | CSV export (alt) |

### Lodges & Rates
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/lodges | List lodges |
| POST | /api/lodges | Add lodge |
| GET | /api/lodges/{id} | Get lodge |
| PATCH | /api/lodges/{id} | Update lodge |
| DELETE | /api/lodges/{id} | Remove lodge |
| GET | /api/lodge-rates/lodges | Lodge rates data |
| POST | /api/lodge-rates/from-email | Parse lodge rate from email |
| GET | /api/activities | List activities |
| GET | /api/cost-presets | Cost presets |

### Itinerary & Pricing
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/itineraries | List itineraries |
| POST | /api/curate-itinerary | AI itinerary curation (existing) |
| POST | /api/curate-itinerary/{id}/approve | Approve curated itinerary |
| POST | /api/calculate-price | Calculate trip pricing |
| POST | /api/generate-quotation | Generate quotation record |

### Quotations
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/quotations | List quotations |
| GET | /api/quotations/{id}/pdf | Download quotation PDF |
| POST | /api/quotations/{id}/email | Email quotation to client |
| GET | /api/quotations/{id}/status | Quotation status |
| GET | /api/quotations/check-expiry | Check all quotation expiries |
| GET | /api/quotations/{id}/check-expiry | Check specific expiry |

### Invoices, Payments, Vouchers
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/invoices | Create invoice |
| GET | /api/invoices | List invoices |
| GET | /api/invoices/{id}/pdf | Invoice PDF |
| PATCH | /api/invoices/{id} | Update invoice |
| POST | /api/payments | Record payment |
| GET | /api/payments | List payments |
| DELETE | /api/payments/{id} | Delete payment |
| POST | /api/vouchers/generate | Generate vouchers |
| GET | /api/vouchers | List vouchers |
| GET | /api/vouchers/{id}/pdf | Voucher PDF |
| PATCH | /api/vouchers/{id}/status | Update voucher status |

### Sharing & Guest Forms
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/share/{booking_ref} | Create shareable link |
| GET | /api/share/{token} | Get share data |
| PATCH | /api/share/{token}/revoke | Revoke share link |
| GET | /api/share-links/{booking_ref} | List share links |
| GET | /api/guest-form/{token} | Get guest form |
| POST | /api/guest-form/{token} | Submit guest form |

### Clients, Tasks, Fleet
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/clients | List clients |
| GET | /api/clients/{id} | Get client |
| PATCH | /api/clients/{id} | Update client |
| POST | /api/tasks | Create task |
| PATCH | /api/tasks/{id} | Update task |
| GET | /api/tasks | List tasks |
| GET | /api/drivers | List drivers |
| GET | /api/vehicles | List vehicles |
| GET | /api/fleet/availability | Fleet availability |
| GET | /api/manifests | List manifests |
| GET | /api/market-data/fx | FX rates |
| GET | /api/market-data/bank-fees | Bank fee data |
| GET | /api/market-data/fuel | Fuel prices |
| POST | /api/market-data/override | Override market data |
| DELETE | /api/market-data/override/{key} | Remove override |

### Google Auth & Sync
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/auth/google/status | OAuth status |
| GET | /api/auth/google/start | Start OAuth flow |
| GET | /api/auth/google/callback | OAuth callback (GET) |
| POST | /api/auth/google/callback | OAuth callback (POST) |
| DELETE | /api/auth/google | Revoke Google auth |
| POST | /api/sync/refresh-from-sheets | Sync from Google Sheets |
| POST | /api/sync/import | Import data |
| GET | /api/sync/export | Export data |
| GET | /api/sync/unsynced | List unsynced items |
| GET | /api/sync/queue | Sync queue |
| GET | /api/sync/status | Sync status |
| POST | /api/sync/push-all | Push all to sync |
| POST | /api/sync/queue/push-quotation | Queue quotation for sync |
| POST | /api/sync/queue/{id}/complete | Mark sync complete |
| POST | /api/sync/queue/{id}/fail | Mark sync failed |

### NEW: AI Endpoints (added this audit)
| Method | Path | Purpose |
|--------|------|---------|
| POST | /intake/parse | Raw text → structured booking brief (Claude) |
| GET | /advisory | Season + permit advisory (Claude, cached 24h) |
| POST | /itinerary/generate | Full day-by-day itinerary JSON (Claude) |
| POST | /itinerary/regenerate-day | Single day description regeneration (Claude) |
| POST | /pricing/calculate | AI-assisted itemised pricing breakdown |
| POST | /quote/narrative | Proposal narrative copy (Claude) |
| POST | /quote/upsells | 3 contextual add-on suggestions (Claude) |
| GET | /quote-machine | 2-Hour Quote Machine reference guide |

### Static / Frontend
| Method | Path | Purpose |
|--------|------|---------|
| GET | / | Main hub (index.html) |
| GET | /styles.css | Stylesheet |
| GET | /app.js | Frontend JS |
| GET | /share/{token} | Public share view |
| GET | /guest-form/{token} | Guest information form |

---

## B. SQLITE TABLES (32 defined, unique)

| Table | Key Columns | Notes |
|-------|------------|-------|
| enquiries | id, guest_name, email, phone, status, source, parsed_brief_json | Core booking pipeline |
| lodges | id, name, location, rack_rate_usd, net_rate_usd, meal_plan, child_policy, b2b_rate | Rate card with B2B flag |
| itineraries | id, enquiry_id, days_json, status | Day-by-day itinerary store |
| itinerary_versions | id, enquiry_id, version_json, created_at | Version history |
| quotations | id, enquiry_id, total_usd, status, valid_days, pdf_path | Quote records |
| invoices | id, enquiry_id, amount_usd, amount_ugx, status | Invoice management |
| payments | id, invoice_id, amount_usd, method, created_at | Payment tracking |
| vouchers | id, booking_ref, type, status | Service vouchers |
| clients | id, name, email, phone, passport_no (encrypted) | Guest CRM |
| tasks | id, booking_ref, title, due_date, status | Ops task list |
| vehicles | id, reg_number, type, capacity, status | Fleet |
| drivers | id, name, phone, licence_no | Driver registry |
| shared_itineraries | id, booking_ref, token, expires_at | Share link tokens |
| guest_form_tokens | id, enquiry_id, token, expires_at | Guest form tokens |
| guest_info | id, enquiry_id, token, data_json | Guest submitted data |
| google_oauth_tokens | id, access_token, refresh_token, expires_at | Google OAuth |
| config | key, value | Hub configuration |
| sync_queue | id, type, payload_json, status | Sync queue |
| market_data_cache | key, value, updated_at | FX/fuel/bank fee cache |
| transfer_fee_audit | id, booking_ref, fee_usd, created_at | Transfer fee log |
| bookings | id, enquiry_id, status, itinerary_json, pricing_json | Core booking (added) |
| quote_views | id, booking_id, ip_hash, viewed_at | Quote view tracking (added) |
| ai_call_log | id, endpoint, prompt_hash, response_time_ms, tokens_used, created_at | AI call audit (added) |
| ai_cache | key, value, created_at | Advisory/deterministic AI cache (added) |

---

## C. HTML TEMPLATES

| File | Purpose | Data consumed |
|------|---------|---------------|
| index.html | Main hub SPA | All API endpoints via app.js |
| share.html | Public shareable itinerary view | /api/share/{token} |
| guest-form.html | Guest information collection form | /api/guest-form/{token} |
| quote-machine-guide.html | 2-Hour Quote Machine reference doc | Static — no API calls |

---

## D. EXTERNAL API CALLS

| Service | Usage | Status |
|---------|-------|--------|
| Anthropic (claude-sonnet-4-6) | All AI features | Requires ANTHROPIC_API_KEY env var |
| Google Calendar API | Booking confirmation → calendar event | OAuth partially implemented |
| Google Sheets API | Data sync | OAuth partially implemented |
| SMTP (configurable) | Email delivery | Disabled (EMAIL_NOTIFICATIONS_ENABLED=false) |
| ExchangeRate-API | FX rates for multi-currency | Implemented in /api/market-data/fx |

---

## E. WORKFLOW COVERAGE

| Phase | Time Target | Endpoint(s) | Status |
|-------|------------|-------------|--------|
| 1. Intake parse | 0-20 min | POST /intake/parse | **EXISTS** (new) |
| 1. Season advisory | 0-20 min | GET /advisory | **EXISTS** (new) |
| 2. Itinerary generate | 20-55 min | POST /itinerary/generate + POST /api/curate-itinerary | **EXISTS** |
| 2. Day description regen | 20-55 min | POST /itinerary/regenerate-day | **EXISTS** (new) |
| 3. Pricing calculation | 55-90 min | POST /pricing/calculate + POST /api/calculate-price | **EXISTS** |
| 4. Quote narrative | 90-110 min | POST /quote/narrative | **EXISTS** (new) |
| 4. Quote HTML/PDF | 90-110 min | POST /api/generate-quotation + GET /api/quotations/{id}/pdf | **EXISTS** |
| 4. Upsell suggestions | 90-110 min | POST /quote/upsells | **EXISTS** (new) |
| 5. Email delivery | 110-120 min | POST /api/quotations/{id}/email | **EXISTS** (disabled) |
| 5. WhatsApp share | 110-120 min | wa.me link generation | **PARTIAL** (link gen in frontend) |
| 5. Public share link | 110-120 min | GET /api/share/{token} | **EXISTS** |
| 5. View tracking | 110-120 min | quote_views table | **EXISTS** (partial — table created, logging TBC) |
| 5. Calendar sync | On confirm | Google Calendar API | **PARTIAL** (OAuth exists, event creation pending) |

---

## F. FEATURE STATUS MATRIX

| Feature | Status | Severity if Missing |
|---------|--------|-------------------|
| AI intake parser | **EXISTS** ✓ | CRITICAL |
| Season/permit advisory | **EXISTS** ✓ | MAJOR |
| AI itinerary generator | **EXISTS** ✓ | CRITICAL |
| Single-day description regenerator | **EXISTS** ✓ | MAJOR |
| Itinerary autosave | **PARTIAL** — version history exists, debounced autosave TBC | MINOR |
| Pricing engine (AI-assisted) | **EXISTS** ✓ | CRITICAL |
| Child age banding (4 bands) | **PARTIAL** — `child_policy` JSON in lodges table; TRVE uses 3 bands not 4 | MAJOR |
| Single supplement (solo traveller) | **PARTIAL** — net_rate exists; supplement calculation in AI pricing | MAJOR |
| Family room logic | **PARTIAL** — no room inventory tracking | MAJOR |
| Gorilla permit line items | **PARTIAL** — AI pricing will include but no dedicated DB field | MINOR |
| Overbooking guard | **MISSING** — no room inventory per date | MAJOR |
| B2B vs B2C rate separation | **PARTIAL** — b2b_rate flag exists on lodges, net/rack rates stored; PDF separation TBC | MAJOR |
| AI proposal narrative writer | **EXISTS** ✓ | CRITICAL |
| HTML quotation template | **EXISTS** ✓ — pure-Python PDF generator | MAJOR |
| PDF export | **EXISTS** ✓ — custom pure-Python (limited fonts) | MAJOR |
| WhatsApp share button | **PARTIAL** — wa.me link; no auto-send | MINOR |
| Email delivery | **EXISTS** but disabled (SMTP not configured) | MAJOR |
| Public shareable quote link | **EXISTS** ✓ — /api/share/{token} | EXISTS |
| Quote view tracking | **PARTIAL** — table created; logging implementation TBC | MINOR |
| Multi-currency display | **PARTIAL** — USD/UGX in PDF; KES/RWF/GBP/EUR panel not in quote | MINOR |
| Upsell engine | **EXISTS** ✓ | ENHANCEMENT |
| Google Calendar sync on confirm | **PARTIAL** — OAuth implemented, event creation not wired to confirm | MAJOR |
| Conversion tracker/dashboard | **PARTIAL** — /api/reports/summary exists | MINOR |
| Quote machine reference guide | **EXISTS** ✓ | ENHANCEMENT |

---

## G. SEVERITY SUMMARY

| Severity | Count | Items |
|----------|-------|-------|
| CRITICAL (fixed this audit) | 4 | Intake parser, itinerary generator, pricing engine, narrative writer — all added |
| MAJOR | 8 | Email (SMTP config), overbooking guard, child banding precision, room inventory, B2B PDF separation, Calendar event wiring, family room logic, WeasyPrint PDF quality |
| MINOR | 6 | Autosave debounce, multi-currency panel, view tracking logging, WhatsApp auto-send, upsell wiring to quote UI, rate limiting |
| ENHANCEMENT | 3 | Conversion dashboard polish, WeasyPrint upgrade, WhatsApp Business API |

---

*See DECISIONS_NEEDED.md for items requiring Henry's input.*
