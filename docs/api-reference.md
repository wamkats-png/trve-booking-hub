# API Reference

Base URL: `http://localhost:8000` (local) or `https://trve-booking-hub-1.onrender.com` (production)

All endpoints return JSON unless noted. All request bodies are JSON (`Content-Type: application/json`).

---

## Health & System

### GET /api/health

Returns system health status.

**Response**
```json
{
  "status": "ok",
  "version": "2.0.0",
  "db": "connected"
}
```

---

## Configuration

### GET /api/config

Returns current system configuration values.

**Response**
```json
{
  "fx_rate": 3575,
  "fx_buffer_pct": 3,
  "service_fee_pct": 15,
  "commission_rates": {
    "standard": 0,
    "b2b": 5.6,
    "hornbill": 0
  },
  "vehicle_rate_per_day": 120,
  "insurance_rate_per_person_per_day": 10,
  "fuel_buffer_pct": 10,
  "quotation_validity_days": 7,
  "coordinators": ["Desire", "Belinda", "Robert"]
}
```

### PATCH /api/config

Update one or more config values.

**Request body** (partial update supported)
```json
{
  "fx_rate": 3600,
  "fuel_buffer_pct": 12
}
```

### POST /api/config/update

Alias for PATCH /api/config.

---

## Email

### GET /api/email/status

Returns whether email notifications are configured and active.

**Response**
```json
{
  "enabled": true,
  "smtp_host": "smtp.gmail.com",
  "from_addr": "info@trve.co.ug"
}
```

---

## Enquiries

### GET /api/enquiries

List all enquiries.

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `status` | string | Filter by status |
| `coordinator` | string | Filter by coordinator |
| `channel` | string | Filter by channel |
| `search` | string | Search by name or ref |

**Response**
```json
[
  {
    "id": "uuid",
    "booking_ref": "TRVE-20260313-0001",
    "client_name": "Jane Smith",
    "status": "Active_Quote",
    "pax": 2,
    "travel_start_date": "2026-06-15",
    ...
  }
]
```

### POST /api/enquiries

Create a new enquiry.

**Request body**: `EnquiryCreate` schema (see [Data Models](data-models.md))

**Response**: Created enquiry object with generated `id` and `booking_ref`.

If email notifications are enabled, a confirmation email is sent to the client.

### PATCH /api/enquiries/{id}

Update an existing enquiry.

**Path parameter**: `id` — enquiry UUID

**Request body**: `EnquiryUpdate` schema (partial — only provided fields updated)

**Response**: Updated enquiry object.

### GET /api/enquiries.csv

Export all enquiries as CSV.

**Response**: CSV file download (`text/csv`)

### GET /api/enquiries/export.csv

Alias for `/api/enquiries.csv`.

---

## Itineraries

### GET /api/itineraries

List all 18 pre-catalogued itineraries.

**Response**
```json
[
  {
    "id": "uuid",
    "name": "7d Gorilla & Tree Climbing Lion Explorer",
    "duration_days": 7,
    "vehicle_days": 6,
    "budget_tier": "premium",
    "interests": ["gorilla_trekking", "wildlife_safari", "chimp_trekking"],
    "parks": ["Kibale", "QENP", "Bwindi"],
    ...
  }
]
```

---

## Itinerary Curation (AI Matching)

### POST /api/curate-itinerary

Score all itineraries against an enquiry's preferences.

**Request body**
```json
{
  "enquiry_id": "uuid"
}
```

**Response**
```json
{
  "suggestions": [
    {
      "itinerary": { ... },
      "score": 87,
      "match_reasons": ["Duration match", "Gorilla trekking interest"]
    }
  ]
}
```

Returns top 5 matches ordered by score descending.

### POST /api/curate-itinerary/{id}/approve

Approve a selected itinerary and advance the enquiry to `Active_Quote`.

**Path parameter**: `id` — itinerary ID

**Request body**
```json
{
  "enquiry_id": "uuid"
}
```

**Response**: Updated enquiry object with `status: "Active_Quote"`.

---

## Pricing

### POST /api/calculate-price

Calculate full trip cost from components.

**Request body**: `PricingRequest` schema

**Example**
```json
{
  "enquiry_id": "uuid",
  "nationality_tier": "FNR",
  "pax": 2,
  "travel_start_date": "2026-06-15",
  "accommodation": [
    {
      "lodge_name": "Pakuba Safari Lodge",
      "room_type": "Banda Double",
      "nights": 2
    }
  ],
  "permits": [
    {
      "permit_type": "gorilla_tracking",
      "quantity": 2,
      "country": "uganda"
    },
    {
      "permit_type": "park_entry_a",
      "quantity": 2
    }
  ],
  "vehicle_days": 3,
  "include_insurance": true,
  "extra_costs": [],
  "channel": "standard"
}
```

**Response**
```json
{
  "line_items": [
    {
      "description": "Pakuba Safari Lodge — Banda Double (2 nights)",
      "amount": 1000.00,
      "category": "accommodation"
    },
    {
      "description": "Gorilla Tracking Permit × 2 (FNR)",
      "amount": 1600.00,
      "category": "permit"
    },
    {
      "description": "4x4 Safari Vehicle (3 days @ $120/day + 10.0% fuel buffer)",
      "amount": 396.00,
      "category": "vehicle"
    },
    {
      "description": "Travel Insurance (2 pax × 3 days × $10)",
      "amount": 60.00,
      "category": "insurance"
    }
  ],
  "subtotal": 3056.00,
  "service_fee": 458.40,
  "service_fee_pct": 15,
  "commission": 0,
  "fx_buffer": 0,
  "total_usd": 3514.40,
  "total_ugx": 12563960
}
```

---

## Quotations

### POST /api/generate-quotation

Generate a PDF quotation.

**Request body**: `QuotationRequest` schema

**Response**
```json
{
  "quotation_id": "QUO-20260313-001",
  "id": "uuid",
  "status": "draft",
  "created_at": "2026-03-13T10:00:00"
}
```

### GET /api/quotations

List all quotations.

**Response**: Array of quotation objects.

### GET /api/quotations/{id}/pdf

Download a quotation as PDF.

**Path parameter**: `id` — quotation UUID

**Response**: PDF binary (`application/pdf`)

### POST /api/quotations/{id}/email

Send quotation PDF to client by email.

**Path parameter**: `id` — quotation UUID

**Response**
```json
{ "sent": true }
```

### GET /api/quotations/{id}/status

Get current status of a quotation.

**Response**
```json
{
  "id": "uuid",
  "quotation_id": "QUO-20260313-001",
  "status": "sent",
  "valid_until": "2026-03-27"
}
```

### GET /api/quotations/check-expiry

Check and update status of all expired quotations.

**Response**
```json
{ "expired_count": 2 }
```

---

## Lodges

### GET /api/lodges

List all lodges.

**Query parameters**

| Parameter | Description |
|---|---|
| `country` | Filter by country |
| `location` | Filter by park/region |
| `search` | Search by lodge name |

### POST /api/lodges

Create a new lodge record.

**Request body**: `LodgeCreate` schema

### GET /api/lodges/{id}

Get a single lodge by UUID.

### PATCH /api/lodges/{id}

Update a lodge record. Partial update supported.

### DELETE /api/lodges/{id}

Delete a lodge record.

### GET /api/lodge-rates/lodges

Get lodge names list for dropdown autocomplete.

**Response**
```json
["Pakuba Safari Lodge", "Paraa Safari Lodge", ...]
```

---

## Activities

### GET /api/activities

List all permit/activity types and their rates by nationality tier.

**Response**
```json
[
  {
    "type": "gorilla_tracking",
    "label": "Gorilla Tracking Permit",
    "rates": {
      "FNR": 800,
      "FR": 700,
      "EAC": 83.92
    },
    "country": "uganda"
  }
]
```

---

## Sync (Google Sheets)

### GET /api/sync/unsynced

Count of enquiries not yet pushed to Sheets.

**Response**
```json
{ "count": 5 }
```

### GET /api/sync/queue

List all sync queue items.

**Response**: Array of sync queue objects.

### GET /api/sync/status

Dashboard summary.

**Response**
```json
{
  "unsynced_enquiries": 5,
  "total_enquiries": 42,
  "queue_pending": 2
}
```

### POST /api/sync/push-all

Mark all unsynced enquiries as synced (`synced = 1`).

**Response**
```json
{ "pushed": 5 }
```

### POST /api/sync/queue/push-quotation

Add a quotation to the sync queue.

**Request body**
```json
{
  "quotation_id": "QUO-20260313-001",
  "booking_ref": "TRVE-20260313-0001"
}
```

### POST /api/sync/queue/{id}/complete

Mark a sync queue item as completed.

### POST /api/sync/queue/{id}/fail

Mark a sync queue item as failed.

### POST /api/sync/import

Bulk import/upsert enquiries from Google Sheets export.

**Request body**: `BulkImportRequest` — array of row objects keyed by `booking_ref`

**Response**
```json
{ "upserted": 12 }
```

### GET /api/sync/export

Export all unsynced enquiries as CSV for manual Sheets import.

**Response**: CSV file download.
