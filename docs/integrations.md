# Integrations

## Google Sheets Sync

### Purpose

Maintain a parallel operations view of all enquiries and quotations in a Google Sheet, accessible to the team without logging into the booking hub.

### Linked Sheet

| Property | Value |
|---|---|
| Sheet Name | TRVE_Operations_Hub_Branded |
| Sheet ID | `1U7aRziHcFPEaOqiSTLYnYFVsKgmdMhIMR8R2lTJtax4` |

---

### Sync Modes

#### Export to CSV (Manual → Sheets)

1. Go to **Sheets Sync** tab (sidebar item 6)
2. Click **Export CSV**
3. File downloads with all unsynced enquiries
4. Paste / import into Google Sheets manually
5. Click **Mark All Synced** to flip `synced = 1` in database

API: `GET /api/sync/export`

#### Push All (Mark Synced)

Marks all unsynced enquiries as synced without exporting a file. Use after confirming the data is already in Sheets.

API: `POST /api/sync/push-all`

#### Import from Sheets (Sheets → Local)

1. Export the Google Sheet as CSV
2. In Sheets Sync tab, use the import function
3. System upserts rows by `booking_ref`
4. New rows are created; existing rows are updated

API: `POST /api/sync/import`

#### Quotation Sync Queue

When a quotation is generated:
1. It is added to the sync queue with status `pending`
2. Coordinator manually triggers push from the queue view
3. Item marked `completed` or `failed`

API: `POST /api/sync/queue/push-quotation`

---

### Sync Status Dashboard

The Sheets Sync view shows:

| Metric | Source |
|---|---|
| Unsynced Enquiries | COUNT WHERE synced = 0 |
| Total Enquiries | COUNT all enquiries |
| Queue Pending | COUNT sync_queue WHERE status = 'pending' |

---

### CSV Export Columns

| Column | Maps to |
|---|---|
| booking_ref | enquiries.booking_ref |
| client_name | enquiries.client_name |
| email | enquiries.email |
| phone | enquiries.phone |
| country | enquiries.country |
| nationality_tier | enquiries.nationality_tier |
| channel | enquiries.channel |
| coordinator | enquiries.coordinator |
| status | enquiries.status |
| pax | enquiries.pax |
| duration_days | enquiries.duration_days |
| destinations_requested | enquiries.destinations_requested |
| travel_start_date | enquiries.travel_start_date |
| travel_end_date | enquiries.travel_end_date |
| quoted_usd | enquiries.quoted_usd |
| revenue_usd | enquiries.revenue_usd |
| balance_usd | enquiries.balance_usd |
| inquiry_date | enquiries.inquiry_date |
| created_at | enquiries.created_at |

---

## Email Notifications

### When Emails Are Sent

| Trigger | Recipient | Template |
|---|---|---|
| Enquiry created | Client | Enquiry confirmation |
| Quotation sent | Client | Quotation with PDF attachment |

### Enquiry Confirmation Email

Sent to the client's email address when a new enquiry is created.

**Contains:**
- Booking reference number
- Travel dates
- Number of guests
- Destinations requested
- 24-hour response SLA notice
- TRVE contact details

### Quotation Email

Sent when the coordinator clicks **Send to Client** on a quotation.

**Contains:**
- Quotation ID
- Total amount (USD)
- Validity / expiry date
- Price validity warning
- **PDF quotation attached**
- Bank payment instructions

### Email Sending Architecture

- Emails are sent in **background daemon threads** to avoid blocking the API response
- Failures are silent if SMTP is not configured (`EMAIL_NOTIFICATIONS_ENABLED=false`)
- MIME multipart format: text/plain + application/pdf attachment

### SMTP Configuration

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=info@trve.co.ug
SMTP_PASS=<app-password>
EMAIL_FROM_NAME=TRVE Booking Hub
EMAIL_FROM_ADDR=info@trve.co.ug
EMAIL_NOTIFICATIONS_ENABLED=true
```

For Gmail, use an **App Password** (not the account password). See [Configuration](configuration.md) for setup steps.

---

## Render.com Deployment

The booking hub runs on Render.com's free/starter tier.

### Service Settings

| Setting | Value |
|---|---|
| Runtime | Python 3.11 |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn api_server:app --host 0.0.0.0 --port $PORT` |
| Persistent disk | 1 GB at `/opt/render/project/src/data` |
| Auto-deploy | On push to main branch |

### Cold Starts

The free tier spins down after inactivity. First request after idle may take 30–60 seconds. Consider upgrading to a paid tier for production use.

### Environment Variables on Render

Set in: **Dashboard → Service → Environment → Add Environment Variable**
