# Pricing Logic

## Overview

The pricing engine calculates the total safari cost from five components:

```
Total = Accommodation + Permits + Vehicle + Insurance + Extras
      + Service Fee (15%)
      - Commission (B2B 5.6%)
      + FX Buffer (3% on UGX-priced items)
```

---

## Nationality Tiers

Every permit price depends on the guest's nationality tier. This must be set on the enquiry and is applied globally across all permit calculations.

| Tier | Who qualifies |
|---|---|
| **FNR** | Foreign Non-Resident — visitors from outside East Africa |
| **FR** | Foreign Resident — expats living in Uganda/EAC region |
| **EAC** | East African Community citizens + Ugandan nationals |

> **Critical**: The nationality tier must be recorded on the enquiry before generating a quotation. If missing, pricing will be incorrect.

---

## Uganda Wildlife Authority (UWA) Permit Rates

### Base Rates (2024–2026)

| Permit Type | FNR (USD) | FR (USD) | EAC (UGX → USD) |
|---|---|---|---|
| Gorilla Tracking — Uganda | $800 | $700 | 300,000 ≈ $83.92 |
| Gorilla Habituation — Uganda | $1,500 | $1,000 | 500,000 ≈ $139.86 |
| Gorilla Tracking — Rwanda | $1,500 | $500 | $200 |
| Chimp Tracking | $250 | $200 | 180,000 ≈ $50.35 |
| Park Entry A+ (Murchison) | $45/day | $35/day | 25,000 ≈ $6.99/day |
| Park Entry A (Kibale, QENP, Bwindi) | $40/day | $30/day | 20,000 ≈ $5.59/day |
| Park Entry B | $35/day | $25/day | 15,000 ≈ $4.20/day |
| Rhino Tracking (Ziwa) | $40 | $30 | 20,000 ≈ $5.59 |

UGX to USD conversion uses: `rate ÷ FX_RATE` where `FX_RATE = 3,575`.

---

### Low-Season Discounts

Applied when `travel_start_date` falls in months: **April (4), May (5), November (11)**

| Permit | FNR Low-Season | FR Low-Season |
|---|---|---|
| Gorilla Tracking — Uganda | $600 | $500 |
| Chimp Tracking | $200 | $150 |
| Park Entry A+ | $35 | $25 |
| Park Entry A | $30 | $20 |

EAC rates do not change in low season.

---

### Post-July 2026 Rate Increases

Applied when `travel_start_date ≥ 2026-07-01`:

| Permit | FNR (New) | FR (New) |
|---|---|---|
| Gorilla Tracking — Uganda | $800 | $700 (unchanged) |
| Gorilla Habituation | $1,800 | $1,200 |
| Chimp Tracking | $300 | $250 |

---

### Rate Selection Logic

```python
def get_permit_rate(permit_type, nationality_tier, travel_date, country):
    month = travel_date.month
    is_low_season = month in [4, 5, 11]
    is_post_july_2026 = travel_date >= date(2026, 7, 1)

    rate = BASE_RATES[permit_type][nationality_tier]

    if is_low_season and nationality_tier in ["FNR", "FR"]:
        rate = LOW_SEASON_RATES[permit_type][nationality_tier]

    if is_post_july_2026 and permit_type in POST_2026_RATES:
        rate = POST_2026_RATES[permit_type][nationality_tier]

    # EAC rates stored as UGX — convert to USD
    if nationality_tier == "EAC" and rate > 1000:
        rate = rate / CONFIG["fx_rate"]

    return rate
```

---

## Accommodation Pricing

### Rate Source

The system uses `net_rate_usd` (operator rate) — not the rack rate — for all calculations.

### Calculation

```
accommodation_cost = nights × net_rate_usd × rooms
```

Where `rooms` is typically 1 per entry (multiple entries used for multiple room types).

### Rate Lookup Fallback Chain

```
1. Exact:  lodge_name = X  AND  room_type = Y
2. LIKE:   lodge_name = X  AND  room_type LIKE %Y%
3. Lodge:  lodge_name = X  → prefer Double/Twin  → ORDER BY net_rate ASC
4. Fuzzy:  lodge_name LIKE %X%
5. Manual: use rate_per_night from request body
```

---

## Vehicle & Transport

### Formula

```
vehicle_days = extra_vehicle_days + (duration_days - 1 if duration > 1 else duration_days)
vehicle_total = vehicle_days × vehicle_rate_per_day
fuel_buffer   = vehicle_total × (fuel_buffer_pct / 100)
final_cost    = vehicle_total + fuel_buffer
```

### Defaults

| Parameter | Default | Configurable |
|---|---|---|
| `vehicle_rate_per_day` | $120 | Yes — via `/api/config` |
| `fuel_buffer_pct` | 10% | Yes — via `/api/config` |

### Line Item Description

```
4x4 Safari Vehicle (N days @ $120/day + 10.0% fuel buffer)
```

This line item is **automatically generated** from the vehicle_days and config values. It is not manually entered.

---

## Insurance

```
insurance_cost = pax × duration_days × insurance_rate_per_person_per_day
```

Default rate: **$10 per person per day**. Toggle on/off per quote.

---

## Extra Costs

Free-form additional charges. Each item can be:
- **Per person**: `amount × pax`
- **Flat rate**: `amount` (applied once)

---

## Service Fee

```
service_fee = subtotal × (service_fee_pct / 100)
```

Default: **15%**. Applied to the sum of all components before commission.

---

## Commission

Applied as a deduction from the total (added back as operator margin):

| Channel | Commission Rate |
|---|---|
| standard | 0% |
| b2b | 5.6% |
| hornbill | 0% |

```
commission_amount = (subtotal + service_fee) × (commission_pct / 100)
```

---

## FX Buffer

Applied to any items priced in UGX to cover exchange rate volatility:

```
fx_buffer = ugx_items_total_usd × (fx_buffer_pct / 100)
```

Default: **3%**

---

## Final Total Calculation

```
subtotal       = accommodation + permits + vehicle + insurance + extras
service_fee    = subtotal × 0.15
fx_buffer      = ugx_items × 0.03
gross          = subtotal + service_fee + fx_buffer
commission_amt = gross × commission_rate
total_usd      = gross - commission_amt   (net to TRVE after agent cut)
total_ugx      = total_usd × fx_rate
```

---

## Example Calculation

**Trip**: 2 FNR guests, 4 days Murchison Falls, June 2026

| Item | Calculation | Amount |
|---|---|---|
| Pakuba Safari Lodge — Banda Double, 3 nights | 3 × $500 | $1,500 |
| Park Entry A+ (Murchison) × 2 × 3 days | 2 × 3 × $45 | $270 |
| Chimp Tracking × 2 | 2 × $250 | $500 |
| 4x4 Vehicle (3 days × $120 + 10%) | 3 × $120 × 1.10 | $396 |
| Insurance (2 pax × 4 days × $10) | | $80 |
| **Subtotal** | | **$2,746** |
| Service Fee (15%) | | $411.90 |
| FX Buffer (3% on $0 UGX items) | | $0 |
| **Total USD** | | **$3,157.90** |
| **Total UGX** (÷ 3,575) | | **UGX 11,289,485** |
