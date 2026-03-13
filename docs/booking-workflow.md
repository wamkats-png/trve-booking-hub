# Booking Workflow

End-to-end process from first contact to completed trip.

---

## Stage 1 — New Enquiry

**Trigger**: Client contacts via WhatsApp, email, website, B2B agent, or Hornbill.

**Action**:
1. Coordinator opens **Enquiries** view (key `1`)
2. Clicks **New Enquiry**
3. Fills in client details:
   - Name, email, phone, country
   - **Nationality** (FNR / FR / EAC) — critical for permit pricing
   - Channel (WhatsApp / Email / B2B / etc.)
   - Travel dates, PAX, destinations, interests, budget
4. Submits → system assigns `booking_ref` (e.g. `TRVE-20260313-0001`)
5. Status set to `New_Inquiry`
6. Confirmation email sent to client (if SMTP configured)

---

## Stage 2 — Itinerary Matching

**Trigger**: Enquiry received, coordinator ready to suggest a package.

**Action**:
1. Open **Itinerary Matching** view (key `3`)
2. Select enquiry from dropdown
3. Click **Find Matches**
4. Review top 5 scored itineraries
5. Select best-fit package
6. Click **Approve**
7. Status advances to `Active_Quote`
8. Pricing Calculator auto-populated with itinerary defaults

---

## Stage 3 — Pricing

**Trigger**: Itinerary approved and loaded into Pricing Calculator.

**Action**:
1. Open **Pricing Calculator** (key `4`)
2. Verify pre-filled vehicle days and permits
3. Add / adjust accommodation:
   - Select lodge + room type per night block
   - System auto-fills net rate from database
4. Review permits (nationality tier applied automatically)
5. Confirm vehicle days and fuel buffer
6. Toggle insurance on/off
7. Add any extra costs
8. Review line-item breakdown and total
9. Adjust as needed (seasonal discounts, room upgrades, etc.)

---

## Stage 4 — Quotation Generation

**Trigger**: Pricing finalised, ready to send to client.

**Action**:
1. Open **Quotations** view (key `5`)
2. Select linked enquiry
3. Set validity days (default 14)
4. Click **Generate Quotation**
5. System creates PDF with:
   - Full itemised breakdown
   - TRVE branding
   - Payment instructions
6. Quotation ID assigned (e.g. `QUO-20260313-001`)
7. Status: `draft`

**Send to client**:
1. Click **Send to Client**
2. Email dispatched with PDF attached
3. Status: `sent`
4. Update `quoted_usd` on the enquiry

---

## Stage 5 — Confirmation

**Trigger**: Client accepts quotation and pays deposit.

**Action**:
1. Open **Pipeline Board** (key `2`)
2. Drag enquiry card from `Active Quote` → `Confirmed`
   - Or: `PATCH /api/enquiries/{id}` with `status: "Confirmed"`
3. Update `revenue_usd` and `balance_usd` on enquiry
4. Update `payment_status`
5. Mark quotation status as `accepted`
6. Begin permit and accommodation bookings

---

## Stage 6 — In Progress

**Trigger**: Trip begins (travel_start_date reached).

**Action**:
1. Move enquiry to `In Progress` on Pipeline Board
2. Coordinators monitor the active trip
3. Handle any field changes (vehicle swaps, permit issues)

---

## Stage 7 — Completed

**Trigger**: Trip ends (travel_end_date reached).

**Action**:
1. Move enquiry to `Completed`
2. Update final `revenue_usd` and clear `balance_usd`
3. Export to Google Sheets if not already synced
4. File for reporting

---

## Stage 8 — Sync & Reporting

**Action**:
1. Open **Sheets Sync** view (key `6`)
2. Check unsynced count
3. Click **Export CSV** to download unsynced enquiries
4. Import into Google Sheets
5. Click **Mark All Synced**

---

## Status Transition Summary

```
                    ┌─────────────┐
    Enquiry In  ──▶ │ New_Inquiry │
                    └──────┬──────┘
                           │ Itinerary approved
                    ┌──────▼──────┐
                    │Active_Quote │
                    └──────┬──────┘
                           │ Client confirms + deposit
                    ┌──────▼──────┐
                    │  Confirmed  │
                    └──────┬──────┘
                           │ Trip starts
                    ┌──────▼──────┐
                    │ In_Progress │
                    └──────┬──────┘
                           │ Trip ends
                    ┌──────▼──────┐
                    │  Completed  │
                    └─────────────┘

Any stage can move to ──▶ Cancelled
Holding state:          ──▶ Unconfirmed
```

---

## Quick Reference — Keyboard Shortcuts

| Key | View |
|---|---|
| `1` | Enquiries |
| `2` | Pipeline Board |
| `3` | Itinerary Matching |
| `4` | Pricing Calculator |
| `5` | Quotations |
| `6` | Sheets Sync |
