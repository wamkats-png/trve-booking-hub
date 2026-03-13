# Data Models

## Database: SQLite (`data/trve_hub.db`)

WAL journal mode enabled. Foreign keys enforced.

---

## Table: enquiries

Primary record for all incoming booking enquiries.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `booking_ref` | TEXT UNIQUE | `TRVE-YYYYMMDD-XXXX` |
| `channel` | TEXT | whatsapp, email, b2b, hornbill, direct, website |
| `client_name` | TEXT | |
| `email` | TEXT | |
| `phone` | TEXT | |
| `country` | TEXT | Country of residence |
| `nationality_tier` | TEXT | FNR / FR / EAC — drives permit pricing |
| `inquiry_date` | TEXT | ISO date |
| `tour_type` | TEXT | Safari type label |
| `pax` | INTEGER | Number of guests |
| `duration_days` | INTEGER | Trip length |
| `destinations_requested` | TEXT | Free-text requested parks |
| `travel_start_date` | TEXT | ISO date |
| `travel_end_date` | TEXT | ISO date |
| `status` | TEXT | See status enum below |
| `coordinator` | TEXT | Desire / Belinda / Robert |
| `budget_range` | TEXT | |
| `interests` | TEXT | JSON array of interest tags |
| `special_requests` | TEXT | Free-form notes |
| `agent_name` | TEXT | B2B agent name if applicable |
| `permits` | TEXT | Notes on permit requirements |
| `accommodation` | TEXT | Notes on accommodation preferences |
| `vehicle` | TEXT | Vehicle requirements |
| `insurance` | TEXT | Insurance notes |
| `quoted_usd` | REAL | Last quoted amount |
| `revenue_usd` | REAL | Confirmed revenue |
| `balance_usd` | REAL | Outstanding balance |
| `payment_status` | TEXT | |
| `internal_flags` | TEXT | Internal notes / flags |
| `last_updated` | TEXT | ISO timestamp |
| `synced` | INTEGER | 0 = not synced, 1 = synced to Sheets |
| `created_at` | TEXT | ISO timestamp |

### Status Enum

```
New_Inquiry
Active_Quote
Confirmed
In_Progress
Completed
Cancelled
Unconfirmed
```

### Interest Tags (used in itinerary matching)

```
gorilla_trekking
chimp_trekking
wildlife_safari
birding
cultural
luxury
adventure
photography
family
romance
budget
```

---

## Table: lodges

Accommodation rate database.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `lodge_name` | TEXT | Property name |
| `room_type` | TEXT | Double, Single, Family, Suite, Tent, etc. |
| `country` | TEXT | Uganda / Rwanda / Kenya |
| `location` | TEXT | Park / region |
| `rack_rate_usd` | REAL | Published rate |
| `net_rate_usd` | REAL | Operator booking rate (used in pricing) |
| `meal_plan` | TEXT | Full Board / Half Board / B&B |
| `valid_from` | TEXT | ISO date — start of rate validity |
| `valid_to` | TEXT | ISO date — end of rate validity |
| `source_file` | TEXT | Rate sheet reference |
| `notes` | TEXT | Special conditions |

---

## Table: itineraries

Pre-catalogued safari packages. 18 records seeded at startup.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT | Package name |
| `duration_days` | INTEGER | Total trip days |
| `vehicle_days` | INTEGER | Number of 4x4 days |
| `destinations` | TEXT | JSON array of destination labels |
| `countries` | TEXT | JSON array: Uganda, Rwanda, Kenya |
| `budget_tier` | TEXT | luxury / premium / mid_range / budget |
| `interests` | TEXT | JSON array of interest tags |
| `permits_included` | TEXT | JSON array of permit types included |
| `parks` | TEXT | JSON array of parks visited |
| `season` | TEXT | year_round / dry_season |
| `description` | TEXT | Package description |
| `highlights` | TEXT | Bullet point highlights |
| `nationality_tiers` | TEXT | JSON array: FNR / FR / EAC |

---

## Table: quotations

Generated PDF quotations.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `quotation_id` | TEXT | `QUO-YYYYMMDD-NNN` |
| `client_name` | TEXT | |
| `client_email` | TEXT | |
| `booking_ref` | TEXT | Links to enquiry |
| `valid_days` | INTEGER | Default 14 |
| `pricing_data` | TEXT | Full JSON pricing breakdown |
| `status` | TEXT | draft / sent / accepted / expired |
| `created_at` | TEXT | ISO timestamp |

### pricing_data JSON Structure

```json
{
  "line_items": [
    {
      "description": "Pakuba Safari Lodge — Banda Double (2 nights)",
      "amount": 500.00,
      "category": "accommodation"
    }
  ],
  "subtotal": 2450.00,
  "service_fee": 367.50,
  "service_fee_pct": 15,
  "commission": 0,
  "commission_pct": 0,
  "fx_buffer": 12.50,
  "total_usd": 2830.00,
  "total_ugx": 10115250,
  "fx_rate": 3575,
  "fuel_buffer_pct": 10,
  "vehicle_days": 3,
  "pax": 2,
  "nationality_tier": "FNR"
}
```

---

## Table: sync_queue

Tracks jobs queued for Google Sheets synchronisation.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `type` | TEXT | enquiry / quotation |
| `reference` | TEXT | booking_ref or quotation_id |
| `description` | TEXT | Human-readable job description |
| `status` | TEXT | pending / completed / failed |
| `created_at` | TEXT | ISO timestamp |
| `completed_at` | TEXT | ISO timestamp (nullable) |

---

## Pydantic Request Schemas (API Layer)

### EnquiryCreate

```python
class EnquiryCreate(BaseModel):
    channel: str
    client_name: str
    email: Optional[str]
    phone: Optional[str]
    country: Optional[str]
    nationality_tier: Optional[str]  # FNR | FR | EAC
    tour_type: Optional[str]
    pax: Optional[int]
    duration_days: Optional[int]
    destinations_requested: Optional[str]
    travel_start_date: Optional[str]
    travel_end_date: Optional[str]
    coordinator: Optional[str]
    budget_range: Optional[str]
    interests: Optional[List[str]]
    special_requests: Optional[str]
    agent_name: Optional[str]
```

### EnquiryUpdate

```python
class EnquiryUpdate(BaseModel):
    status: Optional[str]
    coordinator: Optional[str]
    quoted_usd: Optional[float]
    revenue_usd: Optional[float]
    balance_usd: Optional[float]
    payment_status: Optional[str]
    internal_flags: Optional[str]
    synced: Optional[int]
    # ... all enquiry fields patchable
```

### PricingRequest

```python
class PricingRequest(BaseModel):
    enquiry_id: Optional[str]
    nationality_tier: str          # FNR | FR | EAC
    pax: int
    travel_start_date: str         # ISO date — used for season detection
    accommodation: List[AccommodationItem]
    permits: List[PermitItem]
    vehicle_days: int
    include_insurance: bool
    extra_costs: List[ExtraItem]
    channel: Optional[str]         # For commission calculation
    extra_vehicle_days: Optional[int]
```

### AccommodationItem

```python
class AccommodationItem(BaseModel):
    lodge_name: str
    room_type: str
    nights: int
    rate_per_night: Optional[float]  # Override if not in DB
```

### PermitItem

```python
class PermitItem(BaseModel):
    permit_type: str   # gorilla_tracking | chimp_tracking | park_entry_a | etc.
    quantity: int
    country: Optional[str]  # uganda | rwanda
```

### QuotationRequest

```python
class QuotationRequest(BaseModel):
    enquiry_id: Optional[str]
    client_name: str
    client_email: Optional[str]
    booking_ref: Optional[str]
    pricing_data: dict
    valid_days: Optional[int]  # default 14
```

### CurateRequest

```python
class CurateRequest(BaseModel):
    enquiry_id: str
    # Matching derived from enquiry record
```

### ConfigUpdate

```python
class ConfigUpdate(BaseModel):
    fx_rate: Optional[float]
    fx_buffer_pct: Optional[float]
    service_fee_pct: Optional[float]
    vehicle_rate_per_day: Optional[float]
    insurance_rate_per_person_per_day: Optional[float]
    fuel_buffer_pct: Optional[float]
    quotation_validity_days: Optional[int]
    commission_rates: Optional[dict]
```

### LodgeCreate / LodgeUpdate

```python
class LodgeCreate(BaseModel):
    lodge_name: str
    room_type: str
    country: Optional[str]
    location: Optional[str]
    rack_rate_usd: Optional[float]
    net_rate_usd: float
    meal_plan: Optional[str]
    valid_from: Optional[str]
    valid_to: Optional[str]
    notes: Optional[str]
```

### BulkImportRequest

```python
class BulkImportRequest(BaseModel):
    rows: List[dict]  # Each row keyed by booking_ref for upsert
```
