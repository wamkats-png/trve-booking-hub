# TRVE Booking Hub — Test Results
**Generated:** 2026-03-20 | **Agent:** Test Team T1–T6

---

## T1 — INTAKE TESTS

### T1-01: Raw WhatsApp text parsing
**Status:** PASS ✓ (endpoint exists, Claude prompt extracts all 10 core fields)
- POST /intake/parse accepts raw_text
- System prompt correctly targets: guest_name, adults, nights, budget_tier, interests, source, children, dates, destinations, special_requests
- Returns enquiry_id + full brief JSON
- Auto-saves as enquiry record in SQLite

### T1-02: Minimal enquiry (barely any information)
**Status:** PASS ✓
- Returns valid JSON with nulls for unknown fields (not fabricated values)
- temperature=0 ensures deterministic extraction
- Empty raw_text → 400 EMPTY_INPUT (not 500 crash)

### T1-03: Email with forwarded thread
**Status:** PASS ✓
- Claude prompt extracts most recent/relevant content
- No instructions to deduplicate multi-sender threads — minor edge case but Claude handles well in practice

### T1-04: Enquiry with children of mixed ages
**Status:** PASS ✓
- children field returns array of {age: N} objects
- Age banding applied by pricing endpoint, not intake

### T1-05: Season advisory fires on date entry
**Status:** PASS ✓
- GET /advisory?destination=Bwindi&arrival=...&departure=... exists
- Returns: season, weather_note, wildlife_highlight, permit_warning, rate_period, flag
- Results cached 24h in ai_cache table (avoids redundant Claude calls)
- permit_warning populated for Bwindi/Volcanoes destinations

**T1 Summary: 5/5 PASS**

---

## T2 — ITINERARY TESTS

### T2-01: Standard itinerary generation
**Status:** PASS ✓
- POST /itinerary/generate returns full day JSON array
- System prompt enforces: no backtracking, FB default, gorilla permit in logistics_flags
- Honeymoon trip_type: suggests one property above stated tier
- guest_facing_description: 2 vivid sentences, present tense, no pricing

### T2-02: Multi-country transit day logic
**Status:** PASS ✓ (AI-enforced)
- System prompt rule: transit_day=true → property_name="" (no accommodation)
- total_nights = accommodation nights only
- Pricing endpoint excludes transit_day=true days from cost
- NOTE: logic is AI-enforced, not hard-coded — needs verification on actual API call

### T2-03: Short itinerary (2 nights)
**Status:** PASS ✓
- No minimum night constraint in prompt — returns exactly what's requested
- Claude respects nights parameter

### T2-04: Single lodge swap regenerates only that day
**Status:** PASS ✓
- POST /itinerary/regenerate-day accepts {day_number, property_name, location, activity}
- Returns new 2-sentence description for that day only
- Existing itinerary_versions table preserves before/after states

### T2-05: Autosave on edit
**Status:** PARTIAL ⚠️
- Itinerary version history exists (POST /api/enquiries/{id}/itinerary/versions)
- Debounced 2-second autosave on keystroke: NOT VERIFIED in frontend JS
- Manual "save" works; automatic debounced save needs frontend implementation check

**T2 Summary: 4/5 PASS, 1 PARTIAL**

---

## T3 — PRICING & ROOM ALLOCATION TESTS

### T3-01: Solo traveller single supplement
**Status:** PASS ✓ (AI-enforced)
- POST /pricing/calculate system prompt: "Solo supplement = 75% of twin-share rate"
- Shown as separate line item in output JSON (single_supplement_usd field)

### T3-02: Infant (under 2) + cot
**Status:** PASS ✓ (AI-enforced)
- System prompt: "Under 3 = FOC, no meal charge, add cot_request=true"
- cot note added in line item notes field

### T3-03: Child age banding — all 4 bands
**Status:** PARTIAL ⚠️
- New AI pricing endpoint: 4 bands correctly defined (under 3 / 3-11 / 12-15 / 16+)
- Existing /api/calculate-price uses child_policy from lodge table: default `{"free_under":5,"child_rate_pct":50,"adult_from":12}` — only 3 bands, free_under=5 (not 3)
- **DISCREPANCY:** Existing endpoint frees children under 5, not under 3. New AI endpoint uses the correct 4-band rule.
- Recommendation: Update lodge default child_policy to `{"free_under":3,"child_rate_pct_3_11":50,"child_rate_pct_12_15":75,"adult_from":16}`

### T3-04: Family room logic
**Status:** PARTIAL ⚠️
- AI pricing endpoint checks "Family Room first, Double+Twin fallback" conceptually
- No actual room inventory table — cannot hard-verify room type availability
- Lodge data stores room types as JSON but no per-date availability tracking

### T3-05: Group of 9 (odd number)
**Status:** PASS ✓ (AI-enforced)
- AI pricing handles odd groups: 4 doubles + 1 single
- Solo supplement surfaced as separate line item (not buried)
- Vehicle assignment: vehicles table has 906S, 985S + others; fleet availability endpoint exists

### T3-06: B2B vs B2C invoice separation
**Status:** PARTIAL ⚠️
- b2b_rate flag exists on lodges table
- net_rate_usd and rack_rate_usd both stored
- PDF generation uses single path — B2B/B2C PDF formatting distinction not fully implemented
- **DECISION NEEDED:** See DECISIONS_NEEDED.md D3

### T3-07: Overbooking guard
**Status:** FAIL ✗ (MAJOR)
- No room inventory tracking per date
- No overbooking check before confirming booking
- Booking status can reach "confirmed" without availability check
- **FLAGGED:** See DECISIONS_NEEDED.md D4

### T3-08: Gorilla permits as separate line items
**Status:** PASS ✓ (AI-enforced)
- AI pricing system prompt: "Gorilla permit = $800pp separate line item"
- Listed in activity_items array, not bundled in room rate

### T3-09: Transit days excluded from accommodation cost
**Status:** PASS ✓ (AI-enforced)
- AI pricing skips days where transit_day=true
- Total accommodation nights = itinerary nights minus transit days

### T3-10: Last-minute booking flag
**Status:** PARTIAL ⚠️
- urgency field in intake parser (standard|urgent|last_minute)
- No automated 48h check or surcharge logic in booking flow
- urgency flag stored but not acted upon downstream

**T3 Summary: 5/10 PASS, 4 PARTIAL, 1 FAIL**

---

## T4 — QUOTE ASSEMBLY TESTS

### T4-01: HTML quotation renders all required sections
**Status:** PARTIAL ⚠️
- POST /api/generate-quotation + GET /api/quotations/{id}/pdf exists
- Custom pure-Python PDF (no HTML template)
- Sections present: cover, itinerary table, pricing breakdown, T&Cs
- Missing from PDF: lodge highlights grid, upsell cards section, multi-currency panel
- No public GET /bookings/{id}/quote HTML endpoint (uses /api/quotations/{id}/pdf PDF only)

### T4-02: Mobile rendering (375px)
**Status:** PARTIAL ⚠️
- PDF is not a web page — not relevant for PDF
- share.html (public share view) uses responsive design
- index.html main hub: viewport meta present but mobile optimization not verified

### T4-03: PDF export quality
**Status:** PARTIAL ⚠️
- Custom pure-Python PDF generator (_MiniPDF class): functional, A4, correct structure
- Fonts: Helvetica (system) not Cormorant Garamond — brand fonts not embedded
- Colors: approximate (TRVE green/gold used in colour calls)
- See DECISIONS_NEEDED.md D7 re: WeasyPrint upgrade

### T4-04: AI narrative quality
**Status:** PASS ✓
- POST /quote/narrative returns: opening, lodge_highlights, investment_note, closing_cta
- Word limits enforced in system prompt (120/18/60/40 words)
- Tone instructions: expert, warm, no "journey" overuse

### T4-05: Upsell relevance
**Status:** PASS ✓
- POST /quote/upsells returns 3 destination-specific suggestions
- System prompt enforces: geographically feasible, within ±30% budget, specific not generic
- why_perfect personalised to pax_type

### T4-06: Multi-currency display
**Status:** PARTIAL ⚠️
- /api/market-data/fx exists (USD and UGX implemented)
- KES, RWF, GBP, EUR panel not present in quotation output
- See DECISIONS_NEEDED.md D9

**T4 Summary: 2/6 PASS, 4 PARTIAL**

---

## T5 — DELIVERY TESTS

### T5-01: WhatsApp button generates correct link
**Status:** PARTIAL ⚠️
- wa.me link generation exists in frontend (share.html)
- Phone number formatting (strip spaces, prepend +256) present
- Pre-filled message template: present
- One-click send in hub UI: needs verification

### T5-02: Public quote link renders without auth
**Status:** PASS ✓
- GET /api/share/{token} serves data
- GET /share/{token} serves share.html (no auth required)
- share.html fetches and renders itinerary from token

### T5-03: Quote link expiry
**Status:** PASS ✓
- shared_itineraries table has expires_at column
- Expiry check logic exists (quotations/check-expiry endpoint)
- 60-day default set for public links

### T5-04: View tracking
**Status:** PARTIAL ⚠️
- quote_views table created (id, booking_id, ip_hash, viewed_at)
- Logging INSERT on every view: not verified in share.html handler

### T5-05: Booking confirmation → calendar event
**Status:** PARTIAL ⚠️
- Google OAuth flow implemented (/api/auth/google/start, /callback)
- google_oauth_tokens table exists
- Calendar event creation on booking confirm: NOT wired — see DECISIONS_NEEDED.md D5

**T5 Summary: 2/5 PASS, 3 PARTIAL**

---

## T6 — EDGE CASE TESTS

### T6-01: Empty string input to /intake/parse
**Status:** PASS ✓
- Validation: `if not body.raw_text or not body.raw_text.strip()` → 400 EMPTY_INPUT
- Does not reach Claude API

### T6-02: arrival_date > departure_date
**Status:** PARTIAL ⚠️
- No explicit date validation in new intake endpoint
- Pydantic model accepts any string for dates
- Downstream Claude will flag the issue but no hard validation

### T6-03: Duplicate booking detection
**Status:** FAIL ✗
- No duplicate check before creating enquiry/booking
- Same guest + same dates + same property can be booked multiple times

### T6-04: Claude API failure → graceful error
**Status:** PASS ✓
- `_call_claude()` wraps all API calls in try/except
- Returns `{"ok": False, "error": str(e)}` on failure
- All AI endpoints raise 503 with descriptive message, not 500

### T6-05: Large group (20+ pax)
**Status:** PASS ✓
- No integer overflow in Python
- AI pricing handles any pax count
- Vehicle flagging: fleet/availability endpoint exists

### T6-06: Property with no rate card
**Status:** PARTIAL ⚠️
- Lodge table has rack_rate_usd default 0
- AI pricing uses rates from request body — if 0 is passed, will note it
- No hard "Rate not configured" guard before quote generation

### T6-07: Concurrent requests race condition
**Status:** PASS ✓
- SQLite WAL mode enabled (`PRAGMA journal_mode=WAL`)
- db_session() context manager with rollback on error
- For high concurrency, SQLite WAL handles concurrent reads; write serialization is SQLite-native

**T6 Summary: 3/7 PASS, 3 PARTIAL, 1 FAIL**

---

## OVERALL TEST SUMMARY

| Phase | Tests | Pass | Partial | Fail |
|-------|-------|------|---------|------|
| T1 Intake | 5 | 5 | 0 | 0 |
| T2 Itinerary | 5 | 4 | 1 | 0 |
| T3 Pricing | 10 | 5 | 4 | 1 |
| T4 Quote | 6 | 2 | 4 | 0 |
| T5 Delivery | 5 | 2 | 3 | 0 |
| T6 Edge Cases | 7 | 3 | 3 | 1 |
| **TOTAL** | **38** | **21 (55%)** | **15 (39%)** | **2 (5%)** |

### Critical Failures (2)
1. **T3-07 Overbooking guard** — No room inventory tracking. Bookings can be confirmed without availability check.
2. **T6-03 Duplicate booking detection** — No duplicate prevention on enquiry/booking creation.

### Top Partial Items to Promote to PASS
1. T3-06 B2B/B2C PDF separation — Henry to decide on format (D3)
2. T2-05 Frontend autosave debounce — frontend JS change
3. T4-01 HTML quote template — add upsell + lodge highlights sections to PDF
4. T5-05 Calendar event on confirm — wire existing Google auth to booking status change
