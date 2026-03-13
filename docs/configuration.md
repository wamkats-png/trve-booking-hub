# Configuration

## System Configuration

All pricing parameters are held in memory and patchable at runtime via `PATCH /api/config`. Changes take effect immediately for new calculations but are **not persisted** across server restarts — defaults are restored on restart.

### Default Values

| Parameter | Default | Description |
|---|---|---|
| `fx_rate` | `3575` | UGX per 1 USD exchange rate |
| `fx_buffer_pct` | `3` | FX volatility buffer applied to UGX-priced items |
| `service_fee_pct` | `15` | TRVE service/management fee (%) |
| `commission_rates.standard` | `0` | Standard channel commission |
| `commission_rates.b2b` | `5.6` | B2B agent commission (%) |
| `commission_rates.hornbill` | `0` | Hornbill channel commission |
| `vehicle_rate_per_day` | `120` | 4x4 safari vehicle rate (USD/day) |
| `insurance_rate_per_person_per_day` | `10` | Travel insurance (USD/pax/day) |
| `fuel_buffer_pct` | `10` | Fuel surcharge on vehicle total (%) |
| `quotation_validity_days` | `7` | Days before quotation expires |
| `coordinators` | `["Desire","Belinda","Robert"]` | Assignable coordinators |

### Updating Config at Runtime

```bash
curl -X PATCH https://trve-booking-hub-1.onrender.com/api/config \
  -H "Content-Type: application/json" \
  -d '{"fx_rate": 3600, "fuel_buffer_pct": 12}'
```

---

## Environment Variables

Set these in the Render.com dashboard (Environment tab) or in a local `.env` file.

### Email (SMTP)

| Variable | Required | Default | Description |
|---|---|---|---|
| `EMAIL_NOTIFICATIONS_ENABLED` | No | `false` | Enable email sending |
| `SMTP_HOST` | No | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP port (587 = STARTTLS) |
| `SMTP_USER` | For email | — | SMTP login username |
| `SMTP_PASS` | For email | — | SMTP login password / app password |
| `EMAIL_FROM_NAME` | No | `TRVE Booking Hub` | Sender display name |
| `EMAIL_FROM_ADDR` | No | `noreply@trve.co.ug` | Sender address |

### Gmail Setup (Recommended)

1. Enable 2-Factor Authentication on the Google account
2. Generate an **App Password** (Google Account → Security → App Passwords)
3. Set `SMTP_USER` = Gmail address, `SMTP_PASS` = App Password
4. Set `EMAIL_NOTIFICATIONS_ENABLED=true`

### Database Path

SQLite database is stored at:
- **Local**: `./data/trve_hub.db`
- **Render**: `/opt/render/project/src/data/trve_hub.db`

The `data/` directory must exist before first run. On Render this is the persistent disk mount point.

---

## Google Sheets Integration

The sync feature is pre-configured for a specific sheet:

| Setting | Value |
|---|---|
| Sheet Name | TRVE_Operations_Hub_Branded |
| Sheet ID | `1U7aRziHcFPEaOqiSTLYnYFVsKgmdMhIMR8R2lTJtax4` |

To use full two-way sync, a **Google Sheets API key** must be configured (currently the sync operates as CSV export/import without an API key).

---

## Frontend Login

The dashboard is password-protected at the frontend layer.

- Password is verified against a SHA-256 hash stored in `app.js`
- Hash: `4879a4eb47de72fb5a3c33d7385b17c48eb91237936741b394fb286ed22afa58`
- Auth state is stored in a JS variable `_trveAuth` (session-scoped, cleared on page refresh)
- All six dashboard views require authentication

To change the password:
1. Generate new SHA-256 hash: `echo -n "newpassword" | sha256sum`
2. Replace the hash value in `app.js`
3. Redeploy

---

## UWA Permit Rate Updates

Permit rates are hardcoded in `api_server.py`. To update rates:

1. Open `api_server.py`
2. Locate the `UWA_RATES` or `PERMIT_RATES` dictionary
3. Update the relevant values
4. Redeploy

Key rate change events to monitor:
- **Uganda Wildlife Authority** annual tariff review (usually January)
- **Rwanda Development Board** gorilla permit adjustments
- **Low-season** months are April, May, November — these are configurable
- **Post-July 2026** rate tier is hardcoded as `date(2026, 7, 1)` — update as needed
