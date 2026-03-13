# Itinerary Matching

## Overview

The curation engine scores all 18 pre-catalogued safari packages against a client enquiry's preferences and returns the top 5 matches. This is the "AI Itinerary" feature.

---

## Scoring Algorithm

Total score: **0–100 points**

| Factor | Max Points | How Scored |
|---|---|---|
| Duration match | 30 | Full if within ±1 day; scaled down to ±4 days |
| Interest overlap | 30 | (matching tags ÷ enquiry tags) × 30 |
| Budget tier match | 20 | Full if exact match; 10 if adjacent tier |
| Destination match | 15 | Partial — per destination matched |
| Nationality tier availability | 5 | Full if tier available on package |
| Profile depth bonus | up to 5 | Bonus for strong alignment across all factors |

### Duration Scoring Detail

```
delta = abs(enquiry.duration_days - itinerary.duration_days)
if delta == 0:  30 points
if delta <= 1:  25 points
if delta <= 2:  18 points
if delta <= 4:  10 points
if delta  > 4:  0  points
```

### Budget Tier Adjacency

```
luxury > premium > mid_range > budget
```

Exact match = 20 points. One tier away = 10 points. Two or more away = 0 points.

### Interest Tag Overlap

```
score = (len(enquiry_interests ∩ itinerary_interests) / len(enquiry_interests)) × 30
```

If enquiry has no interests specified, full 30 points awarded to all packages.

---

## The 18 Pre-Catalogued Safaris

| # | Name | Days | Budget Tier | Key Parks | Key Interests |
|---|---|---|---|---|---|
| 1 | 7d Gorilla & Tree Climbing Lion Explorer | 7 | premium | Kibale, QENP (Ishasha), Bwindi | gorilla_trekking, chimp_trekking, wildlife_safari |
| 2 | 7d Gorilla Kingdom Explorer | 7 | premium | Lake Mburo, Bwindi (×2) | gorilla_trekking, wildlife_safari, luxury |
| 3 | 7d Exclusive Singita & Elewana | 7 | luxury | Kidepo, Bwindi | gorilla_trekking, luxury, wildlife_safari |
| 4 | 10d Primates & Wildlife Safari | 10 | premium | Kibale, QENP, Bwindi | gorilla_trekking, chimp_trekking, wildlife_safari |
| 5 | 14d Ultimate Uganda Safari | 14 | luxury | All major parks + Rhino | gorilla_trekking, chimp_trekking, wildlife_safari, birding |
| 6 | 4d Murchison Falls Adventure | 4 | mid_range | Ziwa (Rhino), Murchison | wildlife_safari, adventure |
| 7 | 5d Chimp & Wildlife Safari | 5 | mid_range | Kibale, QENP | chimp_trekking, wildlife_safari |
| 8 | 3d Rwanda Gorilla Express | 3 | luxury | Volcanoes NP | gorilla_trekking, luxury |
| 9 | 5d Kidepo Wilderness | 5 | premium | Kidepo Valley | wildlife_safari, adventure, birding |
| 10 | 3d Jinja Adventure | 3 | budget | Jinja / Source of Nile | adventure |
| 11 | 5d Gorilla & Chimp Combo | 5 | premium | Kibale, Bwindi | gorilla_trekking, chimp_trekking |
| 12 | 10d Uganda & Rwanda Combined | 10 | luxury | Bwindi, Volcanoes NP, QENP | gorilla_trekking, wildlife_safari, luxury |
| 13 | 10d Photography Safari | 10 | luxury | Kidepo, Bwindi, QENP | photography, wildlife_safari, gorilla_trekking |
| 14 | 8d Honeymoon & Romance | 8 | luxury | Kibale, QENP, Lake Bunyonyi | romance, luxury, wildlife_safari |
| 15 | 8d Family Safari Adventure | 8 | mid_range | Murchison, QENP, Lake Mburo | family, wildlife_safari, adventure |
| 16 | 12d Ultimate Birding Safari | 12 | premium | Multiple parks | birding, gorilla_trekking, chimp_trekking |
| 17 | 4d Gorilla Habituation | 4 | premium | Bwindi (Nkuringo/Rushaga) | gorilla_trekking, luxury |
| 18 | 6d Cultural & Community Safari | 6 | mid_range | Kibale, Bwindi (community) | cultural, gorilla_trekking, chimp_trekking |

### Notes

- **Package #15 (Family Safari)** does not include gorilla trekking — minimum age for gorilla permits is 15 years.
- **Package #9 (Kidepo)** is flagged `dry_season` only — recommend October–February or June–August.
- **Package #3 (Singita & Elewana)** uses luxury lodges only — Singita Kwitonda (Rwanda) and Elewana Kidepo.
- **Package #8 (Rwanda Express)** is a short add-on designed to be combined with a Uganda itinerary.

---

## Approval Flow

When a coordinator approves a matched itinerary:

1. `POST /api/curate-itinerary/{itinerary_id}/approve` called with `enquiry_id`
2. Enquiry `status` updated to `Active_Quote`
3. Itinerary defaults loaded into Pricing Calculator:
   - `vehicle_days` from itinerary record
   - Recommended permits from `permits_included`
   - Duration from `duration_days`
4. Frontend shows "Itinerary loaded" notification
5. Pricing Calculator pre-populated and ready for adjustment

---

## Interest Tags Reference

Tags used across enquiries and itineraries for matching:

| Tag | Description |
|---|---|
| `gorilla_trekking` | Bwindi or Volcanoes NP gorilla permits |
| `chimp_trekking` | Kibale or Budongo chimps |
| `wildlife_safari` | Big-game game drives |
| `birding` | Dedicated bird watching |
| `cultural` | Community visits, Batwa Trail, crafts |
| `luxury` | 5-star lodges, private drives, butler service |
| `adventure` | Rafting, bungee, hiking, quad biking |
| `photography` | Pop-top vehicle, golden hour drives |
| `family` | Age-appropriate, no gorilla permits |
| `romance` | Private dinners, sunset cruises, honeymoon suites |
| `budget` | Value lodges, shared drives |
