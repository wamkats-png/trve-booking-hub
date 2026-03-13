# Known Issues & Fixes Log

This document records identified bugs, validation gaps, and incomplete logic discovered during system review. Items are tracked with status.

---

## Issue #1 — Yellow Warning Icon After Itinerary Selection

**Status**: Under investigation
**Severity**: Medium
**Location**: Itinerary Matching view → Pricing Calculator

### Symptom
A yellow warning icon (`!`) appears after selecting and approving an itinerary. The expected behaviour is that the pricing calculator loads cleanly with the itinerary defaults.

### Expected Behaviour After Approval
1. Enquiry status → `Active_Quote`
2. Pricing Calculator receives:
   - `vehicle_days` from itinerary record
   - Permit list from `permits_included`
   - Duration and destination context
3. "Itinerary loaded" notification appears (blue info icon)
4. No warning icon unless a genuine validation error exists

### Likely Causes
- Missing `nationality_tier` on the enquiry — permit rate lookup fails silently
- Enquiry has no `travel_start_date` — season detection falls back to today's date
- A permit type in `permits_included` has no matching rate for the guest's tier
- Lodge name from itinerary defaults does not match any record in the lodge database

### Resolution Steps
1. Confirm `nationality_tier` is set before approving the itinerary
2. Confirm `travel_start_date` is set on the enquiry
3. Check that permit types in the approved itinerary exist in the UWA rate table
4. Review warning message text for specific field causing the alert

---

## Issue #2 — Notification Boxes Too Transparent

**Status**: Identified
**Severity**: Low — UX
**Location**: All views — notification toast system

### Symptom
Notification boxes (info, success, warning) appear with low opacity and low contrast. Text is difficult to read, especially on light backgrounds. Closed notification boxes leave a ghost element on the interface.

### Expected Behaviour
- Notification boxes should be fully opaque with high contrast text
- Background: solid colour (not semi-transparent)
- After clicking `×` close button, the element must be fully removed from the DOM (not hidden with `opacity: 0` or `display: none`)

### Affected Files
- `styles.css` — notification/toast CSS classes
- `app.js` — close button handler (check for `element.remove()` vs `element.style.display = 'none'`)

### Fix Required
```css
/* Example fix */
.notification {
  opacity: 1 !important;
  background-color: #ffffff;
  border: 1px solid #ccc;
  color: #1a1a1a;
}
.notification.warning {
  background-color: #fff8e1;
  border-color: #f9a825;
  color: #5d4037;
}
.notification.success {
  background-color: #e8f5e9;
  border-color: #2e7d32;
  color: #1b5e20;
}
```

Close handler must call `element.remove()` — not `classList.add('hidden')`.

---

## Issue #3 — Accommodation Section — Nights Per Lodge Not Clearly Visible

**Status**: Identified
**Severity**: Medium — UX
**Location**: Pricing Calculator → Accommodation section

### Symptom
The number of nights for each lodge entry is displayed in a plain input box with no clear label. When multiple lodges are stacked, it is not visually clear which night count belongs to which lodge, and there is no summary of total nights.

### Expected Behaviour
- Each lodge entry should display: **"N nights"** with a labelled field
- A total nights count should appear at the bottom of the accommodation section
- If total nights differs from the enquiry's `duration_days`, a warning should appear

### Fix Required
Add a visible `Nights` label to each accommodation row and a nights-total footer line.

---

## Issue #4 — Accommodation Section — No Guest-to-Room-Type Assignment

**Status**: Identified
**Severity**: Medium — functional gap
**Location**: Pricing Calculator → Accommodation section

### Symptom
The current interface allows selecting a lodge and room type but does not allow distributing different guests across different room types at the same lodge. For example: 2 guests in a Double banda + 1 guest in a Single tent at the same property cannot be expressed cleanly.

### Expected Behaviour
- Each lodge entry should support multiple room-type lines
- Each room-type line specifies: room type, number of rooms, nights, rate
- Guest assignment: link specific guest names / PAX numbers to room types

### Fix Required
The accommodation section needs a nested structure:
```
Lodge: Pakuba Safari Lodge
  ├── Banda (Double) × 1 room × 2 nights = $500
  └── Single Tent    × 1 room × 2 nights = $190
```

---

## Issue #5 — AI Itinerary Is Static (Not Interactive)

**Status**: Identified
**Severity**: High — feature gap
**Location**: Itinerary Matching view

### Symptom
The AI-matched itinerary is displayed as read-only text. There is no way to:
- Edit the itinerary content
- Save an edited version for use in the quote
- Convert the AI itinerary directly to an invoice with one action

### Expected Behaviour

#### Fast Create Invoice
A **"Create Invoice"** button on the matched itinerary card that:
1. Pre-fills the pricing calculator from the itinerary's component list
2. Automatically generates a quotation draft
3. Presents the draft for review and send

#### Edit & Save Itinerary
An **"Edit Itinerary"** action that:
1. Opens the itinerary text in an editable form
2. Allows coordinator to modify day-by-day plan, lodge suggestions, activities
3. Saves the edited version as the **working itinerary** linked to the enquiry
4. The saved version appears in the enquiry detail and quotation

### Fix Required
- Add `working_itinerary` field to enquiries table (TEXT, JSON or markdown)
- Add edit UI to the curation view
- Add "Convert to Invoice" shortcut button on approved itinerary card

---

## Issue #6 — Nationality Field Not Enforced Before Pricing

**Status**: Identified
**Severity**: High — data integrity
**Location**: Enquiry form + Pricing Calculator

### Symptom
The system allows proceeding to the pricing calculator without a `nationality_tier` set on the enquiry. UWA permit rates differ significantly between FNR, FR, and EAC tiers. Calculating without a tier produces incorrect prices.

**Example impact**:
- Gorilla permit: FNR $800 vs EAC $83 — a 9× difference
- A quote built without nationality selected defaults to one tier silently

### Expected Behaviour
- `nationality_tier` should be **required** on the enquiry form
- If missing when the Pricing Calculator loads, show a blocking warning: "Please set the guest nationality tier before calculating"
- Permit rate labels should always display which tier was used (e.g. "Gorilla Tracking × 2 — FNR @ $800")

### Fix Required
1. Add `required` validation to `nationality_tier` in `EnquiryCreate`
2. Pricing Calculator: if `nationality_tier` is null/empty, show error and block calculation
3. Add tier label to all permit line items in the output

---

## Issue #7 — Vehicle Cost Line Item Source

**Status**: Clarified (not a bug)
**Severity**: None
**Location**: Pricing Calculator → line items

### Question
> Why does "4x4 Safari Vehicle (7 days @ $120/day + 10.0% fuel buffer)" appear in pricing?

### Answer
This line item is **automatically generated** by the pricing engine every time `vehicle_days > 0`. It is not manually entered and is not pulled from the transport database. The formula is:

```
vehicle_days × $120 × 1.10 (fuel buffer)
```

Parameters ($120/day, 10% buffer) come from `CONFIG` and are configurable via `PATCH /api/config`.

The `vehicle_days` value comes from:
1. The approved itinerary's `vehicle_days` field (auto-filled on approval), or
2. Manual entry in the Pricing Calculator

This is correct behaviour. The label format is intentional to show full transparency of the calculation in the quotation PDF.

---

## Issue #8 — Post-July 2026 Rate Date Is Hardcoded

**Status**: Known limitation
**Severity**: Low
**Location**: `api_server.py` — permit rate logic

### Description
The rate increase threshold (`date(2026, 7, 1)`) is a hardcoded literal in the pricing function. If UWA announces a different effective date, the code must be updated manually.

### Recommended Fix
Move to config:
```python
CONFIG["rate_increase_date"] = "2026-07-01"
```
And reference `date.fromisoformat(CONFIG["rate_increase_date"])` in the rate lookup.

---

## Issue #9 — Config Not Persisted Across Restarts

**Status**: Known limitation
**Severity**: Low
**Location**: `api_server.py` — CONFIG dict

### Description
All config changes made via `PATCH /api/config` are in-memory only. After a server restart (e.g. Render.com re-deploy), all values reset to defaults. If the FX rate has been updated, it must be re-applied after each restart.

### Recommended Fix
Store config in a `config` table in SQLite:
```sql
CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT);
```
Load from DB at startup, persist changes on PATCH.

---

## Testing

Run the test suite to verify all endpoints:

```bash
pytest tests/ -v
```

Test coverage:
- Health endpoint
- Config get/patch
- Enquiry create, list, update
- Pricing calculation
- Quotation generation
- Sync operations
