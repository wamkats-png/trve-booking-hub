# Features Guide

## 1. Enquiries

### Purpose
Capture and manage incoming safari enquiries from all channels.

### Creating an Enquiry

Fields collected:

| Field | Type | Options / Notes |
|---|---|---|
| Client Name | Text | Required |
| Email | Email | Used for confirmations |
| Phone | Text | WhatsApp-friendly |
| Country | Text | Country of residence |
| Nationality | Select | FNR / FR / EAC — drives permit pricing |
| Channel | Select | WhatsApp, Email, B2B, Hornbill, Direct, Website |
| Coordinator | Select | Desire, Belinda, Robert |
| Tour Type | Select | Safari types |
| No. of Guests | Number | PAX count |
| Duration (days) | Number | Drives vehicle day calculation |
| Destinations | Text | Free-text requested parks |
| Travel Start | Date | Used for season / rate tier detection |
| Travel End | Date | Used for duration validation |
| Budget Range | Text | High-level budget category |
| Interests | Multi-select | Tags used in itinerary matching |
| Special Requests | Text | Free-form notes |
| Agent Name | Text | B2B agent, if applicable |

### Booking Reference Format

Auto-generated: `TRVE-YYYYMMDD-XXXX` (e.g. `TRVE-20260313-0042`)

### Enquiry Statuses

```
New_Inquiry → Active_Quote → Confirmed → In_Progress → Completed
                                                  ↘ Cancelled
                                        Unconfirmed (holding state)
```

### Search & Filter

- Free-text search by client name or booking reference
- Filter by coordinator
- Filter by channel
- Sort by inquiry date

---

## 2. Pipeline Board

### Purpose
Kanban-style view of all enquiries across their lifecycle statuses.

### Columns

| Column | Description |
|---|---|
| New Inquiry | Just received, not yet quoted |
| Active Quote | Quotation in progress |
| Confirmed | Booking confirmed, deposit taken |
| In Progress | Currently travelling |
| Completed | Trip completed |
| Cancelled | Cancelled by client or operator |
| Unconfirmed | Awaiting confirmation |

### Features

- Drag enquiry cards between columns to update status
- Visual channel badge on each card (WhatsApp, Email, B2B, etc.)
- Coordinator colour-coding
- Real-time status update via `PATCH /api/enquiries/{id}`
- Summary statistics at top: Total, Active Quotes, Confirmed, Conversion %

---

## 3. Itinerary Matching (AI Curation)

### Purpose
Match client preferences to the 18 pre-catalogued safari packages using a weighted scoring algorithm.

### How It Works

1. Select an enquiry from the dropdown
2. System sends enquiry profile to `/api/curate-itinerary`
3. Algorithm scores all 18 packages (see [Itinerary Matching](itinerary-matching.md))
4. Top 5 matches returned with 0–100 scores
5. Coordinator reviews and selects best fit
6. Click **Approve** → enquiry moves to `Active_Quote`

### What Approval Does

- Sets `enquiry.status = Active_Quote`
- Links selected itinerary to the enquiry
- Auto-populates pricing calculator with itinerary defaults:
  - Vehicle days
  - Park permits
  - Duration
- Triggers "Itinerary loaded" notification

---

## 4. Pricing Calculator

### Purpose
Build a full cost breakdown for a safari quote in real time.

### Input Sections

#### Enquiry Link
Select an existing enquiry to pre-fill nationality tier, duration, pax count.

#### Accommodation
- Add one or more lodge stays
- Each entry: lodge name + room type → auto-lookup from database
- Nights per entry
- Rate auto-filled from lodge database (net rate)
- Multiple entries supported (lodge-per-night-block)

#### Permits & Activities
- Select permit type from dropdown (gorilla, chimp, park entry, habituation)
- Quantity (number of guests)
- Rate auto-calculated from nationality tier + travel date (season + post-July-2026 rules)
- Multiple permits supported

#### Vehicle & Transport
- Vehicle days (auto-filled from itinerary or manual)
- Rate: $120/day (configurable)
- Fuel buffer: 10% (configurable)

#### Insurance
- Toggle on/off
- Rate: $10 per person per day

#### Extra Costs
- Free-form additional line items
- Per-person or flat rate

### Output

- Itemised line items list
- Subtotal
- Service fee (15%)
- Commission deduction (B2B 5.6%, Hornbill 0%)
- FX buffer (3% on UGX-priced items)
- **Grand Total in USD**
- **Grand Total in UGX**

See [Pricing Logic](pricing-logic.md) for full calculation details.

---

## 5. Quotations

### Purpose
Generate a branded PDF quotation and deliver it to the client.

### Generating a Quotation

1. Complete Pricing Calculator
2. Switch to Quotations tab
3. Select linked enquiry
4. Set validity period (default 14 days)
5. Click **Generate Quotation**
6. System calls `POST /api/generate-quotation`
7. PDF created and stored
8. Quotation ID assigned (e.g. `QUO-20260313-001`)

### PDF Contents

- TRVE branding header
- Client name, booking reference, quotation ID
- Travel date range and PAX count
- **Accommodation table**: lodge, room type, nights, rate, total
- **Vehicle section**: days, rate, fuel buffer
- **Permits schedule**: type, nationality tier, quantity, rate, total
- **Insurance** (if included)
- **Extra costs**
- Subtotal
- Service fee line
- Commission note (B2B only)
- **Grand Total (USD and UGX)**
- Payment instructions (Stanbic Bank)
- Price validity notice
- Terms and contact details

### Email Delivery

- Click **Send to Client** → `POST /api/quotations/{id}/email`
- Sends multipart MIME email with PDF attached
- Requires SMTP configuration (see [Configuration](configuration.md))

### Quotation Statuses

| Status | Meaning |
|---|---|
| draft | Generated, not yet sent |
| sent | Emailed to client |
| accepted | Client confirmed |
| expired | Past validity date |

---

## 6. Sheets Sync

### Purpose
Keep the booking hub data in sync with a master Google Sheet used by the operations team.

### Linked Sheet

- **Name**: TRVE_Operations_Hub_Branded
- **Sheet ID**: `1U7aRziHcFPEaOqiSTLYnYFVsKgmdMhIMR8R2lTJtax4`

### Sync Operations

| Action | Direction | Endpoint |
|---|---|---|
| Export unsynced | Local → CSV download | `GET /api/sync/export` |
| Push all | Mark all as synced | `POST /api/sync/push-all` |
| Import from Sheets | Sheets → Local (upsert) | `POST /api/sync/import` |
| Queue status | View pending jobs | `GET /api/sync/queue` |

### Sync Status Dashboard

Shows:
- Unsynced enquiry count
- Total enquiries
- Pending queue items

### Sync Flag

Each enquiry has a `synced` column (0 / 1). Export selects `WHERE synced = 0` and marks rows as synced after push.

---

## 7. Finance Tools

Utility panel for quick financial calculations:

- Commission calculator (B2B 5.6% / Hornbill 0%)
- FX conversion (UGX ↔ USD at configured rate)
- Service fee calculator
- Margin analysis

---

## 8. Lodge Rates

### Purpose
Manage the full accommodation rate database used by the Pricing Calculator.

### Lodge Record Fields

| Field | Description |
|---|---|
| Lodge Name | Property name |
| Room Type | Double, Single, Family, Suite, Tent, Cottage, etc. |
| Country | Uganda / Rwanda / Kenya |
| Location | Park / region |
| Rack Rate (USD) | Published rate |
| Net Rate (USD) | Operator booking rate (used in pricing) |
| Meal Plan | Full Board, Half Board, B&B |
| Valid From / To | Rate season dates |
| Notes | Special conditions |

### Seeded Data

100+ partner lodges pre-loaded covering:

- **Bwindi**: Gorilla Safari Lodge, Clouds Mountain, Mahogany Springs, Nkuringo, Silverback, Engagi, Sanctuary Gorilla Camp
- **Kibale**: Kyaninga Lodge, Kibale Forest Camp, Primate Lodge, Papaya Lake, Chimpundu
- **QENP**: Mweya Safari Lodge, Kyambura Gorge, Jacana Safari Lodge, Ishasha Wilderness, Kazinga Channel, Anyadwe
- **Murchison**: Baker's Lodge, Paraa Safari Lodge, Pakuba Safari Lodge, Chobe Safari Lodge, Nile Safari Lodge, Pabidi Budongo
- **Kidepo**: Apoka Safari Lodge, Kidepo Wilderness Camp, Adere Safari Lodge, Enjojo Lodge
- **Lake Mburo**: Mihingo Lodge, Mantana Tented Camp, Arcadia Cottages
- **Entebbe/Kampala**: Boma Guest House, Serena, Lake Victoria Hotel
- **Rwanda**: Singita Kwitonda, Wilderness Bisate, Sabyinyo Silverback

### Rate Lookup Priority

When the pricing calculator searches for a lodge rate, it applies this fallback chain:

```
1. Exact match: lodge_name = X AND room_type = Y
2. LIKE match:  lodge_name = X AND room_type LIKE %Y%
3. Lodge only:  lodge_name = X, prefer Double/Twin, ORDER BY net_rate ASC
4. Fuzzy name:  lodge_name LIKE %X%
5. Manual:      Use rate_per_night provided in request
```
