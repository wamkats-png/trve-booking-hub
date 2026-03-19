# TRVE Booking Hub — Codebase Audit

**Date:** 2026-03-19
**Stack:** FastAPI 0.104+ (Python) · SQLite WAL · Vanilla JS SPA · pytest
**Scope:** `api_server.py` (7,370 lines, 93 routes) · `app.js` (10,531 lines) · `tests/test_api.py` (130 tests)
**Updated:** additional findings from deeper business-logic and schema audit added below

---

## Executive Summary

The TRVE Booking Hub is a well-featured internal ops tool with clear code structure and good basic CRUD test coverage. However it was built without a threat model: **every API endpoint is publicly accessible with no authentication**, wildcard CORS is enabled, and passport numbers are protected only by reversible XOR obfuscation with a key committed to source. These issues alone mean the system should not be exposed to a network where untrusted parties can reach it. Beyond security, several business-logic gaps can cause silent mispricing: UGX-denominated permit costs bypass the FX buffer, multi-lodge night counts can be overridden by frontend values, and permits with group-size limits are never validated. The database enables `foreign_keys=ON` but declares no actual FK constraints, so orphaned records are possible. Roughly half of all endpoints have no test coverage. Fixing the critical security issues should be the first priority; business-logic correctness second.

---

## Security

### S1 — Critical: No Authentication on Any Endpoint
**File:** `api_server.py` (all 93 `@app.*` routes)

No middleware or dependency guards any route. Any HTTP client that can reach the server can read all booking data, modify enquiries, create invoices, override FX rates, and bulk-import lodge rates without credentials.

**Risk:** Complete data confidentiality and integrity loss.

**Fix:** Add an API-key or session-cookie guard as a FastAPI dependency applied globally or per-router:
```python
from fastapi.security import APIKeyHeader
API_KEY = os.environ["TRVE_API_KEY"]
api_key_header = APIKeyHeader(name="X-API-Key")

async def require_api_key(key: str = Security(api_key_header)):
    if key != API_KEY:
        raise HTTPException(status_code=401)
```
Apply via `dependencies=[Depends(require_api_key)]` on the `FastAPI()` constructor or per-router.

---

### S2 — Critical: Wildcard CORS
**File:** `api_server.py:2628`

```python
allow_origins=["*"],
allow_methods=["*"],
allow_headers=["*"],
```

Combined with no authentication, any webpage the user visits can issue requests to the API in their browser session.

**Fix:** Restrict to the actual production origin:
```python
allow_origins=["https://trve-booking-hub-1.onrender.com"],
```

---

### S3 — High: XOR Obfuscation Used for Passport Numbers
**File:** `api_server.py:86-100`

```python
def _obfuscate(plaintext: str) -> str:
    kb = (_ENC_KEY.encode() * ...)[: len(plaintext)]
    return base64.urlsafe_b64encode(bytes(a ^ b for a, b in zip(plaintext.encode(), kb))).decode()
```

XOR with a repeating key is not encryption. A known-plaintext attack (passport numbers follow a predictable format, e.g. `AB1234567`) recovers the key from a single value. The function is also deterministic — identical passports produce identical ciphertext, enabling correlation.

**Fix:** Replace with `cryptography.Fernet` (AES-128-CBC + HMAC) or `cryptography.hazmat` AES-GCM. Each value needs a random IV stored alongside it.

---

### S4 — High: Encryption Key Hardcoded in Source
**File:** `api_server.py:86`

```python
_ENC_KEY = os.environ.get("ENCRYPTION_KEY", "trve-hub-default-key-change-in-prod")
```

The default key is committed to version history and will be used in any deployment where the env var is not set.

**Fix:** Remove the default and fail on startup if unset:
```python
_ENC_KEY = os.environ["ENCRYPTION_KEY"]  # KeyError = intentional, fail loud
```

---

### S5 — High: Weak Tokens for Share Links and Guest Forms
**File:** `api_server.py:1394, 3756`

```python
str(uuid.uuid4())[:8]   # 8 hex chars = 2^32 ≈ 4 billion possibilities
str(uuid.uuid4())       # full UUID — UUID4 is not a CSPRNG on all platforms
```

8-character UUID fragments are brute-forceable. Full UUID4 is acceptable entropy but `secrets.token_urlsafe` is the correct API for security tokens.

**Fix:**
```python
import secrets
token = secrets.token_urlsafe(32)   # 256 bits of CSPRNG output
```

---

### S6 — Medium: Dynamic SQL Column Names from Pydantic Field Dicts
**File:** `api_server.py:3399, 3836, 6433`

```python
# Example at 3399 (enquiry PATCH):
set_clauses.append(f"{key} = ?")   # key comes from body.model_dump()
```

Column names come from `model_dump()` key names — not direct user strings — so this is not trivially injectable today. However it bypasses an explicit allowlist: any future Pydantic field name that does not correspond to the intended column would silently write to an unintended column.

**Fix:** Add an explicit allowlist for each endpoint:
```python
ENQUIRY_PATCHABLE = {"status", "coordinator", "working_itinerary", ...}
updates = {k: v for k, v in body.model_dump(exclude_none=True).items() if k in ENQUIRY_PATCHABLE}
```

---

### S7 — Medium: No Rate Limiting
**File:** `api_server.py` (global)

No `slowapi` or similar middleware. Any caller can spam `POST /api/enquiries` or `POST /api/market-data/override` without throttling.

**Fix:** Add `slowapi` with per-IP limits on write endpoints, or place a reverse proxy (Nginx/Caddy) rate limit in front.

---

### S8 — Low: No Audit Log
No record is kept of which request modified which record or when (beyond `last_updated` on enquiries). Investigations after data corruption or accidental deletion have no trail.

**Fix:** A lightweight `audit_log` table (`timestamp`, `action`, `table_name`, `record_id`, `diff_json`) populated by FastAPI middleware or endpoint-level hooks.

---

## Frontend — app.js

### F1 — High: Event Listener Memory Leak in Day Panel
**File:** `app.js:6603-6659` (`bindPanelEvents`)

On every edit/save/cancel cycle the panel DOM is fully replaced (`panel.innerHTML = buildPanelHTML(...)`) and `bindPanelEvents()` re-runs, attaching new listeners to new elements. However the function also re-attaches listeners to elements outside the panel (parent containers) that persist across re-renders, accumulating duplicate listeners for each edit cycle.

**Fix:** Use event delegation on a stable ancestor instead of attaching individual listeners to panel children, or call `removeEventListener` before re-binding.

---

### F2 — High: Silent Error Catches Hide Save/Sync Failures
**File:** `app.js:6516, 8487` (and ~8 more `catch (_) {}` blocks)

```javascript
try {
  await apiFetch(`/api/enquiries/${enquiryId}`, { method: 'PATCH', ... });
} catch (_) {}  // auto-save failure is invisible
```

When the backend is unreachable or returns an error, the user receives no feedback. Itinerary edits can be silently lost.

**Fix:** At minimum log to console and surface a toast notification:
```javascript
} catch (err) {
  console.error('[AutoSave] failed:', err);
  showToast('Auto-save failed — changes may not be saved', 'error');
}
```

---

### F3 — Medium: Unbounded Undo/Redo Stacks
**File:** `app.js:195-196`

```javascript
accomHistory: [],   // grows forever
accomFuture:  [],
```

Every accommodation change pushes a snapshot. In a long session these arrays can consume significant memory with no cap or eviction.

**Fix:** Cap at a reasonable depth (e.g. 50 entries):
```javascript
if (state.accomHistory.length > 50) state.accomHistory.shift();
```

---

### F4 — Medium: Inconsistent XSS Protection in innerHTML
**File:** `app.js:523-527`

```javascript
// openSlideover() — bodyHtml is inserted raw:
document.getElementById('slideoverBody').innerHTML = bodyHtml;
```

Most dynamic HTML uses `escapeHtml()` correctly. The slideover entry point accepts pre-built HTML and trusts it entirely. If any code path passes user-controlled data as `bodyHtml` without escaping, it's an XSS vector.

**Fix:** Audit all `openSlideover()` call sites to confirm `bodyHtml` is never derived from unsanitized user data, or replace `.innerHTML` with DOM construction + `.textContent` for user-controlled text.

---

### F5 — Medium: Room Type Dropdown Shows Wrong Rate When Multiple Meal Plans Exist
**File:** `app.js:6076-6088`

`populateRoomTypes` deduplicates room types by returning the first matching rate row regardless of meal plan. If the DB has rows for the same room type at different meal plans (e.g. `Double/BB` at $200 and `Double/FB` at $280), the dropdown always shows the first one.

This was partially addressed in a recent commit (`_findBestRate`) but only for the rate chip display. The dropdown option label (`$${rt.net_rate_usd}/night`) still shows the first-matched rate.

**Fix:** Pass the selected meal plan into `populateRoomTypes` and use `_findBestRate` for the label too.

---

### F6 — Minor: NaN Propagates Silently from Optional Chaining + parseFloat
**File:** `app.js:2166, 4233`

```javascript
const amt = parseFloat(document.getElementById('payAmt')?.value);
// If element missing: parseFloat(undefined) → NaN
// NaN then silently invalidates downstream arithmetic
```

**Fix:** Add an explicit fallback: `parseFloat(...) || 0` or guard with `isNaN`.

---

### F7 — Minor: Hard-Coded Stale FX Fallback
**File:** `app.js:181`

```javascript
liveFx: 3575,  // UGX per USD — hard-coded, no staleness indicator
```

If the FX API fails, calculations use a silent stale rate with no warning shown.

**Fix:** Store a `fxFetchedAt` timestamp in state and render a "rate may be stale (fetched X days ago)" label when older than 24 h.

---

### F8 — Minor: Production Console Output
**File:** `app.js:4029, 4541`

`console.info('[RoomOverride]', ...)` and `console.error('[AutoAssign] ...')` are present in production code, leaking internal field values.

**Fix:** Remove or gate behind a `DEBUG` flag.

---

### F9 — Minor: 10,531-Line Monolith
**File:** `app.js`

All features live in a single IIFE with no module boundaries. This makes dead-code detection, unit testing, and onboarding harder over time.

**Fix:** No immediate action required; note for future refactor. When a bundler (Vite/esbuild) is added, split into feature modules.

---

## Database

### D1 — Medium: Missing Composite Index on (lodge_name, room_type)
**File:** `api_server.py:300`

```sql
CREATE INDEX IF NOT EXISTS idx_lodges_name ON lodges(lodge_name);
```

The most frequent query pattern is `WHERE lodge_name = ? AND room_type = ?`. The single-column index on `lodge_name` means SQLite scans all rows for that lodge to filter by room type.

**Fix:**
```sql
CREATE INDEX IF NOT EXISTS idx_lodges_name_room ON lodges(lodge_name, room_type);
```

---

### D2 — Low: No UNIQUE Constraint on (lodge_name, room_type, meal_plan)
**File:** `api_server.py:165`

Duplicate rate rows for the same lodge/room/meal combination can be inserted without error, causing non-deterministic rate lookups.

**Fix:**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_lodges_unique_rate
  ON lodges(lodge_name, room_type, meal_plan, valid_from);
```
(Include `valid_from` since the same room/plan can have different rates in different validity windows.)

---

### D3 — Low: Schema Migrations Have No Version Tracking
**File:** `api_server.py:1473-1510`

Migrations are `try/except pass` blocks that re-run on every startup. If a migration fails for a reason other than "column already exists", the error is silently swallowed.

**Fix:** Add a `schema_version` table and only run pending migrations, logging failures explicitly.

---

### D4 — Info: Good Baseline ✓
**File:** `api_server.py:57-58`

`PRAGMA foreign_keys=ON` and WAL journal mode are both set correctly. Key tables have appropriate indexes.

---

## Test Coverage

### T1 — High: No Pricing Edge-Case Tests
**File:** `tests/test_api.py`

The 130 existing tests cover CRUD paths well. Missing:
- Child pricing tiers (free-under, 50% rate, adult-from thresholds)
- Meal plan surcharge delta calculation (BB→FB upgrade cost)
- Multi-lodge itinerary totals
- FX buffer application and rounding

---

### T2 — Medium: No Security Boundary Tests
No tests for:
- Oversized payloads (e.g. 10 MB `working_itinerary`)
- Invalid field names in PATCH body
- Duplicate booking_ref collision handling

---

### T3 — Medium: No Share/Voucher Flow Tests
The share-itinerary and guest-form-token endpoints (`/api/share`, `/api/guest-form-tokens`) have no test coverage.

---

### T4 — Low: No Frontend Tests
`app.js` has no test runner configured. Key pure functions (`_findBestRate`, pricing calculations, date arithmetic) could be unit-tested with Vitest or Jest.

---

## Business Logic

### B1 — High: Night Count Ambiguity for Single-Lodge vs Multi-Lodge Trips
**File:** `api_server.py:4141-4173`

For single-lodge trips, nights are auto-derived as `days − 1`. For multi-lodge trips the frontend-supplied `nights` field is used directly. There is no validation that frontend-supplied nights match the actual date range, and if a single-lodge request includes `nights` in the accommodation object it will be silently ignored (multi-lodge branch only).

```python
if "nights" in acc and num_accs > 1:
    nights = max(1, int(acc["nights"]))   # trusts frontend
else:
    nights = max(1, trip_nights)          # ignores frontend
```

Related: PDF generation at line 2095 uses yet a third derivation: `summary.get('nights', summary.get('days', 1) - 1)`.

**Fix:** Validate that `sum(acc.nights for each lodge) == duration_days - 1` and reject with 422 if they disagree.

---

### B2 — High: FX Buffer Not Applied to UGX-Denominated Permit Conversions
**File:** `api_server.py:520-561` vs `api_server.py:4397-4398`

`get_permit_price_usd()` converts UGX permit prices to USD using the **base** FX rate:
```python
fx = CONFIG.get("fx_rate", FX_RATE) or FX_RATE
return val / fx   # no buffer
```

But the final `grand_total_ugx` is computed with the **buffered** rate:
```python
fx_rate = CONFIG["fx_rate"] * (1 + fx_buffer_pct / 100)
grand_total_ugx = grand_total * fx_rate
```

Result: gorilla permits (300,000 UGX) are underquoted in USD by the buffer percentage (e.g. 2% buffer → permit quoted ~$6 too cheap per person at 3,575 UGX/USD).

**Fix:** Pass the buffered FX rate into `get_permit_price_usd()` or apply the buffer inside it.

---

### B3 — Medium: No Permit Group-Size Validation
**File:** `api_server.py:434, 4288-4309`

`PERMIT_PRICES` defines `max_per_group` for gorilla/chimp tracking permits (e.g. `"max_per_group": 8`) but the calculation never checks it. Booking 10 guests for an 8-person permit group is silently accepted, producing an incorrect cost and impossible logistics.

**Fix:** During pricing calculation, raise an error if `pax > permit["max_per_group"]` for applicable permit types.

---

### B4 — Medium: Lodge Validity Dates Not Checked During Pricing
**File:** `api_server.py:4180-4198`

Rate lookup:
```python
"SELECT net_rate_usd, meal_plan FROM lodges WHERE lodge_name = ? AND room_type = ?
 ORDER BY net_rate_usd ASC LIMIT 1"
```

`valid_from` and `valid_to` are stored per rate row but ignored. A rate that expired in 2025 will be returned for a 2026 booking with no warning.

**Fix:** Add `AND (valid_to = '' OR valid_to >= ?)` with `travel_start_date` as the parameter, and fall back with a warning if no valid rate is found.

---

### B5 — Medium: Child Pricing Accepts Internally Inconsistent Input
**File:** `api_server.py:4223-4238`

If `children_free + children_half + children_full != acc_children`, the backend silently falls back to 50% for all children. No error is raised and no indication is given that the frontend-supplied age breakdown was discarded.

**Fix:** Validate that the sum equals `acc_children` and return a 422 if not.

---

### B6 — Low: Commission and Service Fee Both Applied to Same Subtotal
**File:** `api_server.py:4381-4394`

Both fees are applied as additive percentages of `subtotal`. Whether commission should be calculated before or after the service fee is undocumented. Tests only verify totals ≥ 0, not the exact math.

**Fix:** Document the intended formula explicitly and add a test that verifies the exact arithmetic for a known input.

---

## Database (additional)

### D5 — High: Foreign Key Constraints Declared Nowhere
**File:** `api_server.py:57-58, 200-262`

`PRAGMA foreign_keys=ON` is set, which enforces FK constraints — but **no `FOREIGN KEY` clauses exist in any `CREATE TABLE` statement**. The pragma has no effect without declared constraints.

Orphaned records are therefore possible: deleting an enquiry does not cascade-delete its quotations, invoices, payments, vouchers, or shared itinerary links.

**Fix:** Add FK clauses to all child tables, e.g.:
```sql
CREATE TABLE IF NOT EXISTS invoices (
    ...
    booking_ref TEXT NOT NULL REFERENCES enquiries(booking_ref) ON DELETE CASCADE,
    ...
);
```

---

### D6 — Medium: Tests Share a Single Session-Scoped Database
**File:** `tests/conftest.py:26-38`

`scope="session"` means all 130 tests run against one in-memory database. Tests that create records leave state visible to later tests, and test ordering determines whether assertions pass. A comment on line 85 explicitly accepts this: `"accept config state carry-over"`.

**Fix:** Use `scope="function"` with a per-test database fixture, or at minimum wrap each test class in a transaction that is rolled back on teardown.

---

## Configuration & Deployment

### C1 — Medium: Documentation Contradicts Implementation
**File:** `docs/configuration.md:5-6` vs `api_server.py:1612-1625`

`configuration.md` states config changes are *not* persisted across restarts. The code actually seeds defaults into SQLite on first run and loads them back on every subsequent start — so config **is** persistent. The docs are wrong.

---

### C2 — Medium: Two Separate Email Configurations That Can Drift
**File:** `api_server.py:861-870` vs `api_server.py:1012-1020`

`EMAIL_CFG` (used by synchronous `send_email()`) and `EMAIL_CONFIG` (used by async `send_email_async()`) are configured independently. One checks `EMAIL_NOTIFICATIONS_ENABLED`; the other checks `bool(os.environ.get("SMTP_USER", ""))`. If SMTP credentials are set but the env var is missing, one code path sends and the other doesn't.

**Fix:** Consolidate to one config dict and one send function.

---

### C3 — Low: Bank Account Details Hardcoded in PDF Generator
**File:** `api_server.py:2503-2510`

Bank name, account name, and partial account number are embedded in `generate_quotation_pdf()` with no config override. Any change requires a code deploy.

**Fix:** Move to the `config` table so it can be updated via `PATCH /api/config` without redeployment.

---

### C4 — Low: PDF Generation Failure Is Silent
**File:** `api_server.py:4543-4546`

```python
try:
    pdf_bytes = generate_quotation_pdf(q_doc)
    attachments = [(...)]
except (ModuleNotFoundError, Exception):
    attachments = None  # email sent without PDF; no user notification
```

If PDF generation crashes, the quotation email is sent without an attachment. No error is surfaced.

**Fix:** Re-raise after logging, or return a 500 to the caller so the coordinator knows the PDF failed.

---

## Test Coverage (additional gaps)

### T5 — High: ~50% of Endpoints Have Zero Test Coverage
Completely untested:
- Guest information form (`POST /api/enquiries/{id}/guest-form`, `GET/POST /api/guest-form/{token}`)
- Shared itineraries (`POST /api/share/{booking_ref}`, `GET /api/share/{token}`)
- Task management (`POST /api/tasks`, `PATCH /api/tasks/{id}`)
- Fleet / driver management (`GET /api/vehicles`, `GET /api/drivers`, `GET /api/fleet/availability`)
- Manifests and driver-briefing PDFs
- Invoice creation and payment recording

### T6 — Medium: Pricing Tests Verify Structure, Not Correctness
**File:** `tests/test_api.py:354`

```python
assert data["total_usd"] >= 0   # verifies structure, not math
```

No test constructs a known pricing scenario (e.g. 2 adults × 3 nights × $350 FB rate + 2 gorilla permits × $800 = $X) and asserts the exact result.

---

## Prioritised Action List

| Priority | ID | Action |
|----------|----|--------|
| 1 | S1 | Add API-key authentication dependency to all routes |
| 2 | S2 | Restrict CORS to production origin |
| 3 | S3/S4 | Replace XOR obfuscation with Fernet; remove hardcoded key default |
| 4 | S5 | Use `secrets.token_urlsafe(32)` for share and guest-form tokens |
| 5 | D5 | Add `FOREIGN KEY … ON DELETE CASCADE` to all child tables |
| 6 | B2 | Apply FX buffer inside `get_permit_price_usd()` |
| 7 | B1 | Validate multi-lodge night sums match trip duration |
| 8 | B3 | Enforce permit `max_per_group` during pricing |
| 9 | B4 | Filter rate lookup by `valid_to >= travel_start_date` |
| 10 | F2 | Surface auto-save failures to the user via toast |
| 11 | S6 | Add explicit field allowlists to PATCH endpoints |
| 12 | D1 | Add composite index `(lodge_name, room_type)` |
| 13 | S7 | Add rate limiting (slowapi or reverse proxy) |
| 14 | C2 | Consolidate duplicate email configs into one code path |
| 15 | F1 | Fix event listener accumulation in day-panel |
| 16 | T5/T6 | Add pricing correctness tests and cover untested endpoints |
| 17 | D2 | Add UNIQUE constraint on lodge rates |
| 18 | F3 | Cap undo/redo history at 50 entries |
| 19 | C1 | Fix `docs/configuration.md` to reflect actual persistence behaviour |
| 20 | S8 | Add audit log table |
