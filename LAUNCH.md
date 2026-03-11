# TRVE Booking Hub — Agent Launch Guide

**The Rift Valley Explorer · Safari Operations Dashboard v2.0**
*For internal use by TRVE booking agents only.*

---

## Quick Start (2 minutes)

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Start the server
```bash
uvicorn api_server:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Open in browser
```
http://localhost:8000
```

Enter the team password when prompted. The dashboard loads immediately.

---

## System Requirements

| Item | Requirement |
|------|-------------|
| Python | 3.11 or higher |
| OS | Linux, macOS, or Windows |
| Browser | Chrome, Firefox, Edge (modern versions) |
| Network | Local LAN is sufficient; internet only needed for live FX rates |
| Disk | ~50 MB (dependencies) + database growth |

---

## First-Time Setup

### Password
The login password is set as a SHA-256 hash in `app.js` (line 14). The current hash corresponds to the team password shared internally. **Never store the plaintext password in any file.**

To change the password:
1. Generate a SHA-256 hash of your new password:
   ```bash
   echo -n "yournewpassword" | sha256sum
   ```
2. Replace the `PASSWORD_HASH` value at line 14 of `app.js`.

### Database
The SQLite database is created automatically at `data/trve_hub.db` on first run. It is seeded with the 18-itinerary library. No manual setup required.

### FX Rate
The default FX rate is **3,575 UGX/USD** (2026 average). The pricing calculator can fetch a live rate from open.er-api.com using the "Fetch Live" button. The base rate can be changed at line 271 of `api_server.py`:
```python
FX_RATE = 3575  # UGX/USD
```

---

## Email Quotations (Optional)

To enable sending quotation PDFs by email, set these environment variables before starting the server:

```bash
export SMTP_HOST=smtp.gmail.com      # or your SMTP server
export SMTP_PORT=587
export SMTP_USER=your@email.com
export SMTP_PASS=your-app-password   # Gmail: use an App Password
export SMTP_FROM=your@email.com
```

Or create a `.env`-style shell script and `source` it before starting.

> **Gmail users:** Enable 2-factor auth and create an [App Password](https://myaccount.google.com/apppasswords). Use that as `SMTP_PASS`, not your main password.

If SMTP is not configured, all other features work normally — only the "Send Email" button will return an error.

---

## Running on a Shared Server (Team Access)

To let multiple agents access the hub from their own computers on the same network:

```bash
uvicorn api_server:app --host 0.0.0.0 --port 8000
```

Agents open `http://<server-ip>:8000` in their browser. Replace `<server-ip>` with the LAN IP of the machine running the server (e.g. `192.168.1.50`).

To keep the server running after closing the terminal:
```bash
nohup uvicorn api_server:app --host 0.0.0.0 --port 8000 > trve.log 2>&1 &
```

---

## Agent Workflow Guide

### Taking a New Enquiry

1. Click **New Enquiry** in the sidebar (or press `1`)
2. Fill in client details: name, email, phone, country, nationality tier
3. Set travel dates, destinations, pax count, interests, budget range
4. Select the channel (WhatsApp, email, B2B, etc.)
5. Submit — a booking reference is auto-generated (e.g. `TRVE-2026-001`)

### Building a Quote

1. Go to **Pricing** (press `5`)
2. Select an itinerary from the library
3. Choose nationality tier and pax count
4. Set travel start date (low-season months Apr/May/Nov are auto-detected)
5. Add lodge nights — select lodge then room type
6. Permit prices and park entries are calculated automatically
7. Click **Generate PDF Quotation** — a branded PDF is created and stored
8. Send by email directly from the quotation, or download and share manually

### Curating an Itinerary Match

1. Go to **Curation** (press `4`)
2. Select an enquiry from the list
3. The system scores all 18 itineraries against the client's interests, destinations, budget, and nationality tier
4. Review the top suggestions — scores and match reasons are shown
5. Click **Approve** to link the itinerary to the enquiry and move it to `Active_Quote`

### Managing the Pipeline

- **Pipeline** view (press `3`) shows the full Kanban board
- Drag or click to move enquiries through statuses:
  `New Inquiry` → `Active Quote` → `Confirmed` → `In Progress` → `Completed`
- Click any card to open the full detail panel and edit fields
- Revenue, payment status, and balance can be updated directly in the detail panel

### Tracking Gorilla Permits

1. Go to **Permit Slots** (press `9`)
2. Add a slot entry for each permit date: type, habitat, total slots, booked count
3. Use the availability checker to verify slot count before confirming a booking
4. Update booked count as permits are secured

### Follow-Up Tasks

- Go to **Tasks** (press `t` or `6` on keyboard)
- Create tasks linked to specific enquiries
- Filter by: All / Due Today / Overdue
- The sidebar badge shows overdue task count at a glance

### Booking Calendar

- Go to **Calendar** (press `8`)
- Shows all confirmed and in-progress bookings by travel date in a month grid
- Navigate months with the arrow buttons

---

## Keyboard Shortcuts

| Key | View |
|-----|------|
| `0` | Analytics |
| `1` | New Enquiry |
| `2` | Pipeline |
| `3` | Tasks |
| `4` | Curation |
| `5` | Pricing |
| `6` | Quotations |
| `7` | Sync |
| `8` | Calendar |
| `9` | Permit Slots |

---

## Permit Pricing Reference (UWA Tariff 2024–2026)

| Permit | FNR | FR | Low Season (Apr/May/Nov) | From July 2026 |
|--------|-----|----|--------------------------|----------------|
| Gorilla Tracking — Uganda | $800 | $700 | $600 (FNR) | $800 |
| Gorilla Habituation — Uganda | $1,500 | — | — | $1,800 |
| Gorilla Tracking — Rwanda | $1,500 | $500 | $1,050 (FNR) | — |
| Chimp Tracking | $250 | — | — | $300 |
| Chimp Habituation | $400 | — | — | — |
| Golden Monkey | $100 | — | — | — |
| Park Entry A+ (Murchison) | $45/day | — | — | — |
| Park Entry A (QENP/Kibale/Bwindi/Kidepo/L.Mburo) | $40/day | — | — | — |
| Park Entry B (Semuliki/Rwenzori/Elgon) | $35/day | — | — | — |

EAC and Ugandan nationals pay in UGX at the current FX rate.

---

## Nationality Tiers

| Code | Who | Currency |
|------|-----|----------|
| `FNR` | Foreign Non-Resident (default) | USD |
| `FR` | Foreign Resident (Uganda-based expats) | USD |
| `ROA` | Rest of Africa | USD |
| `EAC` | East African Community | UGX |
| `Ugandan` | Ugandan nationals | UGX |

---

## Booking Statuses

| Status | Meaning |
|--------|---------|
| `New Inquiry` | Initial contact received, not yet quoted |
| `Active Quote` | Quotation sent, awaiting client response |
| `Confirmed` | Deposit received, booking locked in |
| `In Progress` | Safari underway |
| `Completed` | Safari finished, balance collected |
| `Cancelled` | Booking cancelled |
| `Unconfirmed` | Quotation accepted but deposit pending |

---

## Google Sheets Sync

The **Sync** view (press `7`) allows pushing pipeline data to Google Sheets for reporting.

- **Push All** exports all unsynced enquiries to the sync queue
- Queue items can be marked complete after manual upload to Sheets
- Full import/export is available for one-time data migration

This feature is designed to work alongside a Google Sheets add-on. If not using Sheets, this view can be ignored — it has no effect on other features.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Address already in use" on port 8000 | Run `lsof -ti:8000 \| xargs kill` then restart |
| Login not working | Verify the password hash in `app.js` line 14 |
| "SMTP not configured" error | Set `SMTP_USER` and `SMTP_PASS` environment variables |
| Live FX fetch fails | Network issue or API limit — the default 3,575 rate is used automatically |
| Database reset needed | Delete `data/trve_hub.db` — it will be recreated fresh on next start |
| PDF download blank | Ensure `fpdf2` is installed: `pip install fpdf2` |

---

## Running Tests

```bash
pytest tests/ -v
```

Expected: **50 tests, all passing.** Tests use an in-memory database and do not affect production data.

---

## File Layout

```
trve-booking-hub/
├── api_server.py      # FastAPI backend — all routes, PDF engine, permit pricing
├── app.js             # Frontend SPA — all UI, state, permit calculator
├── index.html         # HTML shell
├── styles.css         # All CSS
├── requirements.txt   # Python dependencies
├── tests/
│   └── test_api.py    # 50-test pytest suite
└── data/              # Created at runtime (git-ignored)
    └── trve_hub.db    # SQLite database
```

---

*TRVE Booking Hub v2.0 · The Rift Valley Explorer Ltd · Entebbe, Uganda*
