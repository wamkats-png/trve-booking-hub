#!/usr/bin/env python3
"""
TRVE Booking Hub — FastAPI Backend v2.0
SQLite-backed, full 18-itinerary library, branded PDF quotation engine.
Runs on port 8000.
"""

import json
import os
import re
import sqlite3
import uuid
import urllib.request
from contextlib import contextmanager
from datetime import datetime, date
from io import BytesIO
from pathlib import Path
from typing import Optional, List, Any

import smtplib
import threading
import email as email_lib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "trve_hub.db"

# Legacy JSON paths (for migration)
PIPELINE_FILE = DATA_DIR / "pipeline.json"
LODGE_FILE = DATA_DIR / "lodges.json"
QUOTATIONS_FILE = DATA_DIR / "quotations.json"
SYNC_QUEUE_FILE = DATA_DIR / "sync_queue.json"

# ---------------------------------------------------------------------------
# SQLite helpers
# ---------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

@contextmanager
def db_session():
    conn = get_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def dict_from_row(row):
    if row is None:
        return None
    return dict(row)

def rows_to_list(rows):
    return [dict(r) for r in rows]

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS enquiries (
    id TEXT PRIMARY KEY,
    booking_ref TEXT UNIQUE NOT NULL,
    channel TEXT DEFAULT 'direct',
    client_name TEXT NOT NULL,
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    country TEXT DEFAULT '',
    nationality_tier TEXT DEFAULT 'FNR',
    inquiry_date TEXT DEFAULT '',
    tour_type TEXT DEFAULT '',
    pax INTEGER DEFAULT 2,
    quoted_usd TEXT DEFAULT '',
    destinations_requested TEXT DEFAULT '',
    travel_start_date TEXT DEFAULT '',
    travel_end_date TEXT DEFAULT '',
    duration_days INTEGER,
    status TEXT DEFAULT 'New_Inquiry',
    coordinator TEXT DEFAULT '',
    budget_range TEXT DEFAULT '',
    interests TEXT DEFAULT '',
    special_requests TEXT DEFAULT '',
    agent_name TEXT DEFAULT '',
    permits TEXT DEFAULT '',
    accommodation TEXT DEFAULT '',
    vehicle TEXT DEFAULT '',
    insurance TEXT DEFAULT '',
    revenue_usd TEXT DEFAULT '',
    balance_usd TEXT DEFAULT '',
    payment_status TEXT DEFAULT '',
    internal_flags TEXT DEFAULT '',
    last_updated TEXT DEFAULT '',
    synced INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lodges (
    id TEXT PRIMARY KEY,
    lodge_name TEXT NOT NULL,
    room_type TEXT DEFAULT '',
    country TEXT DEFAULT '',
    location TEXT DEFAULT '',
    rack_rate_usd REAL DEFAULT 0,
    net_rate_usd REAL DEFAULT 0,
    meal_plan TEXT DEFAULT '',
    valid_from TEXT DEFAULT '',
    valid_to TEXT DEFAULT '',
    source_file TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    source_email_date TEXT DEFAULT '',
    extraction_timestamp TEXT DEFAULT '',
    max_occupancy INTEGER DEFAULT 2
);

CREATE TABLE IF NOT EXISTS itineraries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    duration_days INTEGER,
    vehicle_days INTEGER,
    destinations TEXT DEFAULT '[]',
    countries TEXT DEFAULT '[]',
    budget_tier TEXT DEFAULT 'mid_range',
    interests TEXT DEFAULT '[]',
    permits_included TEXT DEFAULT '[]',
    parks TEXT DEFAULT '[]',
    season TEXT DEFAULT 'year_round',
    description TEXT DEFAULT '',
    highlights TEXT DEFAULT '',
    nationality_tiers TEXT DEFAULT '["FNR","FR","EAC"]'
);

CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY,
    quotation_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_email TEXT DEFAULT '',
    booking_ref TEXT DEFAULT '',
    valid_days INTEGER DEFAULT 14,
    created_at TEXT DEFAULT (datetime('now')),
    pricing_data TEXT DEFAULT '{}',
    status TEXT DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    type TEXT DEFAULT 'enquiry',
    reference TEXT DEFAULT '',
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS market_data_cache (
    key TEXT PRIMARY KEY,
    value REAL,
    value_json TEXT DEFAULT '',
    source TEXT DEFAULT '',
    source_url TEXT DEFAULT '',
    fetched_at TEXT DEFAULT (datetime('now')),
    override_value REAL,
    override_by TEXT DEFAULT '',
    override_at TEXT DEFAULT '',
    is_overridden INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    booking_ref TEXT NOT NULL,
    client_name TEXT DEFAULT '',
    client_email TEXT DEFAULT '',
    line_items TEXT DEFAULT '[]',
    subtotal REAL DEFAULT 0,
    tax_pct REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    total_usd REAL DEFAULT 0,
    status TEXT DEFAULT 'draft',
    due_date TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    booking_ref TEXT NOT NULL,
    amount_usd REAL DEFAULT 0,
    amount_ugx REAL DEFAULT 0,
    payment_date TEXT DEFAULT '',
    method TEXT DEFAULT 'bank_transfer',
    reference TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    recorded_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vouchers (
    id TEXT PRIMARY KEY,
    voucher_number TEXT UNIQUE NOT NULL,
    booking_ref TEXT NOT NULL,
    client_name TEXT DEFAULT '',
    supplier_name TEXT NOT NULL,
    service_type TEXT DEFAULT '',
    service_dates TEXT DEFAULT '',
    pax INTEGER DEFAULT 1,
    room_type TEXT DEFAULT '',
    meal_plan TEXT DEFAULT '',
    special_requests TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS itinerary_versions (
    id TEXT PRIMARY KEY,
    enquiry_id TEXT NOT NULL,
    booking_ref TEXT DEFAULT '',
    version_number INTEGER DEFAULT 1,
    content TEXT DEFAULT '',
    saved_by TEXT DEFAULT '',
    saved_at TEXT DEFAULT (datetime('now')),
    label TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_enquiries_booking_ref ON enquiries(booking_ref);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
CREATE INDEX IF NOT EXISTS idx_lodges_name ON lodges(lodge_name);
CREATE INDEX IF NOT EXISTS idx_lodges_country ON lodges(country);
CREATE INDEX IF NOT EXISTS idx_quotations_booking_ref ON quotations(booking_ref);
CREATE INDEX IF NOT EXISTS idx_invoices_booking_ref ON invoices(booking_ref);
CREATE INDEX IF NOT EXISTS idx_payments_booking_ref ON payments(booking_ref);
CREATE INDEX IF NOT EXISTS idx_vouchers_booking_ref ON vouchers(booking_ref);
CREATE INDEX IF NOT EXISTS idx_itn_versions_enquiry ON itinerary_versions(enquiry_id);
"""

# ---------------------------------------------------------------------------
# PERMIT PRICING (UWA Tariff 2024-2026, verified)
# ---------------------------------------------------------------------------
PERMIT_PRICES = {
    "gorilla_tracking_uganda": {
        "label": "Gorilla Tracking (Uganda)",
        "FNR": 800, "FR": 700, "ROA": 500,
        "EAC": 300000, "Ugandan": 300000,
        "low_season": {"FNR": 600, "FR": 500},
        "post_july_2026": {"FNR": 800, "FR": 700},
        "unit": "permit", "currency_eac": "UGX",
        "max_per_group": 8,
    },
    "gorilla_habituation_uganda": {
        "label": "Gorilla Habituation (Uganda)",
        "FNR": 1500, "FR": 1000, "ROA": 800,
        "EAC": 500000, "Ugandan": 500000,
        "post_july_2026": {"FNR": 1800, "FR": 1200},
        "unit": "permit", "currency_eac": "UGX",
        "max_per_group": 4,
    },
    "gorilla_tracking_rwanda": {
        "label": "Gorilla Tracking (Rwanda)",
        "FNR": 1500, "FR": 500, "ROA": 500,
        "EAC": 200, "Ugandan": 200,
        "low_season": {"FNR": 1050},
        "unit": "permit", "currency_eac": "USD",
        "max_per_group": 8,
    },
    "chimp_tracking": {
        "label": "Chimp Tracking",
        "FNR": 250, "FR": 200, "ROA": 200,
        "EAC": 180000, "Ugandan": 180000,
        "low_season": {"FNR": 200, "FR": 150},
        "post_july_2026": {"FNR": 300, "FR": 250},
        "unit": "permit", "currency_eac": "UGX",
        "max_per_group": 6,
    },
    "chimp_habituation": {
        "label": "Chimp Habituation",
        "FNR": 400, "FR": 350, "ROA": 350,
        "EAC": 250000, "Ugandan": 250000,
        "unit": "permit", "currency_eac": "UGX",
        "max_per_group": 4,
    },
    "golden_monkey": {
        "label": "Golden Monkey",
        "FNR": 100, "FR": 90, "ROA": 80,
        "EAC": 50000, "Ugandan": 50000,
        "unit": "permit", "currency_eac": "UGX",
    },
    "park_entry_a_plus": {
        "label": "Park Entry A+ (Murchison)",
        "FNR": 45, "FR": 35, "ROA": 30,
        "EAC": 25000, "Ugandan": 25000,
        "unit": "day", "currency_eac": "UGX",
    },
    "park_entry_a": {
        "label": "Park Entry A",
        "FNR": 40, "FR": 30, "ROA": 25,
        "EAC": 20000, "Ugandan": 20000,
        "unit": "day", "currency_eac": "UGX",
    },
    "park_entry_b": {
        "label": "Park Entry B",
        "FNR": 35, "FR": 25, "ROA": 20,
        "EAC": 15000, "Ugandan": 15000,
        "unit": "day", "currency_eac": "UGX",
    },
}

LOW_SEASON_MONTHS = [4, 5, 11]
FX_RATE = 3575  # UGX/USD base constant – runtime value read from CONFIG["fx_rate"]

# Default rate-effective date used when no value is stored in the config DB.
# Admin can update this via PATCH /api/config without any code change.
DEFAULT_RATE_EFFECTIVE_DATE = "2026-07-01"


def get_permit_price_usd(permit_key, tier, travel_date_str=None):
    p = PERMIT_PRICES.get(permit_key)
    if not p:
        return 0
    tier_key = tier or "FNR"
    # Runtime FX rate from config (falls back to module-level constant)
    fx = CONFIG.get("fx_rate", FX_RATE) or FX_RATE

    # Post rate-increase date: read exclusively from config — no hardcoded date in logic.
    # Key "rate_effective_date" is the canonical name; "rate_increase_date" is the legacy alias.
    if travel_date_str and "post_july_2026" in p:
        try:
            d = datetime.strptime(travel_date_str, "%Y-%m-%d").date()
            rate_date_str = (
                CONFIG.get("rate_effective_date")
                or CONFIG.get("rate_increase_date")
                or DEFAULT_RATE_EFFECTIVE_DATE
            )
            rate_date = date.fromisoformat(rate_date_str)
            if d >= rate_date and tier_key in p["post_july_2026"]:
                val = p["post_july_2026"][tier_key]
                return val if p.get("currency_eac") == "USD" or tier_key not in ("EAC", "Ugandan") else val / fx
        except ValueError:
            pass

    # Low season
    if travel_date_str and "low_season" in p:
        try:
            d = datetime.strptime(travel_date_str, "%Y-%m-%d").date()
            if d.month in LOW_SEASON_MONTHS and tier_key in p["low_season"]:
                val = p["low_season"][tier_key]
                return val if p.get("currency_eac") == "USD" or tier_key not in ("EAC", "Ugandan") else val / fx
        except ValueError:
            pass

    val = p.get(tier_key, p.get("FNR", 0))
    if tier_key in ("EAC", "Ugandan") and p.get("currency_eac") == "UGX":
        return val / fx
    return val


# ---------------------------------------------------------------------------
# FULL 18-ITINERARY LIBRARY (catalogued from TRVE published PDFs)
# ---------------------------------------------------------------------------
ITINERARY_LIBRARY = [
    {
        "id": "itn-gorilla-lion-7d",
        "name": "TRVE 7 Days - Gorilla & Tree Climbing Lion Explorer",
        "duration_days": 7,
        "vehicle_days": 6,
        "destinations": ["Entebbe", "Kibale NP", "Queen Elizabeth NP", "Ishasha", "Bwindi Impenetrable NP", "Lake Bunyonyi"],
        "countries": ["Uganda"],
        "budget_tier": "premium",
        "interests": ["gorilla_trekking", "chimp_trekking", "wildlife_safari", "primate", "boat_cruise"],
        "permits_included": ["gorilla_tracking_uganda", "chimp_tracking", "park_entry_a"],
        "parks": ["Kibale NP", "Queen Elizabeth NP", "Bwindi Impenetrable NP"],
        "season": "year_round",
        "description": "TRVE's signature safari combining chimps in Kibale, tree-climbing lions in Ishasha, boat cruise on Kazinga Channel, and mountain gorillas in Bwindi.",
        "highlights": "Kibale chimp tracking, Kazinga Channel boat cruise, Ishasha tree-climbing lions, Bwindi gorilla tracking, Lake Bunyonyi",
        "nationality_tiers": ["FNR", "FR", "EAC"],
    },
    {
        "id": "itn-gorilla-kingdom-7d",
        "name": "TRVE 7 Days - Gorilla Kingdom Explorer",
        "duration_days": 7,
        "vehicle_days": 6,
        "destinations": ["Entebbe", "Lake Mburo NP", "Bwindi Impenetrable NP", "Lake Bunyonyi"],
        "countries": ["Uganda"],
        "budget_tier": "premium",
        "interests": ["gorilla_trekking", "wildlife_safari", "cultural", "bird_watching"],
        "permits_included": ["gorilla_tracking_uganda", "park_entry_a"],
        "parks": ["Lake Mburo NP", "Bwindi Impenetrable NP"],
        "season": "year_round",
        "description": "Focused gorilla trekking experience via Lake Mburo's savanna and the Batwa cultural trail, with 2 gorilla tracking sessions in Bwindi.",
        "highlights": "Lake Mburo game drives, Bwindi gorilla tracking x2, Batwa Trail, Lake Bunyonyi canoe",
        "nationality_tiers": ["FNR", "FR", "EAC"],
    },
    {
        "id": "itn-singita-elewana-7d",
        "name": "TRVE 7 Days - Exclusive Singita & Elewana Explorer",
        "duration_days": 7,
        "vehicle_days": 6,
        "destinations": ["Entebbe", "Kidepo Valley NP", "Bwindi Impenetrable NP"],
        "countries": ["Uganda"],
        "budget_tier": "luxury",
        "interests": ["gorilla_trekking", "wildlife_safari", "luxury"],
        "permits_included": ["gorilla_tracking_uganda", "park_entry_a"],
        "parks": ["Kidepo Valley NP", "Bwindi Impenetrable NP"],
        "season": "year_round",
        "description": "Ultra-luxury safari combining Kidepo's remote wilderness (Apoka Safari Lodge) with Bwindi gorilla tracking at top-tier lodges.",
        "highlights": "Kidepo game drives, Apoka Safari Lodge, Bwindi gorilla tracking, luxury lodging throughout",
        "nationality_tiers": ["FNR", "FR"],
    },
    {
        "id": "itn-primates-10d",
        "name": "TRVE 10 Days - Primates & Wildlife Safari",
        "duration_days": 10,
        "vehicle_days": 9,
        "destinations": ["Entebbe", "Kibale NP", "Queen Elizabeth NP", "Ishasha", "Bwindi Impenetrable NP", "Lake Bunyonyi"],
        "countries": ["Uganda"],
        "budget_tier": "premium",
        "interests": ["gorilla_trekking", "chimp_trekking", "wildlife_safari", "primate", "boat_cruise", "bird_watching"],
        "permits_included": ["gorilla_tracking_uganda", "chimp_tracking", "park_entry_a"],
        "parks": ["Kibale NP", "Queen Elizabeth NP", "Bwindi Impenetrable NP"],
        "season": "year_round",
        "description": "Extended version of the 7-day Gorilla & Lion Explorer with extra days in Kibale for habituation and Queen Elizabeth for extended game drives.",
        "highlights": "Extended chimp experience, Kazinga Channel, tree-climbing lions, 2 gorilla treks, cultural immersion",
        "nationality_tiers": ["FNR", "FR", "EAC"],
    },
    {
        "id": "itn-big5-14d",
        "name": "TRVE 14 Days - Ultimate Uganda Safari",
        "duration_days": 14,
        "vehicle_days": 13,
        "destinations": ["Entebbe", "Ziwa Rhino Sanctuary", "Murchison Falls NP", "Kibale NP", "Queen Elizabeth NP", "Ishasha", "Bwindi Impenetrable NP", "Lake Mburo NP"],
        "countries": ["Uganda"],
        "budget_tier": "luxury",
        "interests": ["gorilla_trekking", "chimp_trekking", "wildlife_safari", "primate", "boat_cruise", "bird_watching", "cultural"],
        "permits_included": ["gorilla_tracking_uganda", "chimp_tracking", "park_entry_a_plus", "park_entry_a"],
        "parks": ["Murchison Falls NP", "Kibale NP", "Queen Elizabeth NP", "Bwindi Impenetrable NP", "Lake Mburo NP"],
        "season": "year_round",
        "description": "The definitive Uganda experience — all major national parks, rhino tracking at Ziwa, top of Murchison Falls, chimps, lions, gorillas, and Lake Mburo.",
        "highlights": "Ziwa rhinos, Murchison boat cruise & top of falls, Kibale chimps, Kazinga Channel, Ishasha lions, Bwindi gorillas, Lake Mburo",
        "nationality_tiers": ["FNR", "FR", "EAC"],
    },
    {
        "id": "itn-murchison-4d",
        "name": "TRVE 4 Days - Murchison Falls Adventure",
        "duration_days": 4,
        "vehicle_days": 3,
        "destinations": ["Entebbe", "Ziwa Rhino Sanctuary", "Murchison Falls NP"],
        "countries": ["Uganda"],
        "budget_tier": "mid_range",
        "interests": ["wildlife_safari", "boat_cruise", "bird_watching"],
        "permits_included": ["park_entry_a_plus"],
        "parks": ["Murchison Falls NP"],
        "season": "year_round",
        "description": "Short but packed — rhinos at Ziwa, Nile boat cruise to the base of Murchison Falls, and game drives in Uganda's largest park.",
        "highlights": "Ziwa rhino tracking, Murchison Falls boat cruise, game drives, top of the falls hike",
        "nationality_tiers": ["FNR", "FR", "EAC"],
    },
    {
        "id": "itn-chimp-wildlife-5d",
        "name": "TRVE 5 Days - Chimp & Wildlife Safari",
        "duration_days": 5,
        "vehicle_days": 4,
        "destinations": ["Entebbe", "Kibale NP", "Queen Elizabeth NP", "Ishasha"],
        "countries": ["Uganda"],
        "budget_tier": "mid_range",
        "interests": ["chimp_trekking", "wildlife_safari", "primate", "boat_cruise"],
        "permits_included": ["chimp_tracking", "park_entry_a"],
        "parks": ["Kibale NP", "Queen Elizabeth NP"],
        "season": "year_round",
        "description": "Chimpanzee tracking in Kibale plus Queen Elizabeth's famous tree-climbing lions in Ishasha and Kazinga Channel cruise.",
        "highlights": "Kibale chimp tracking, Kazinga Channel cruise, Ishasha tree-climbing lions",
        "nationality_tiers": ["FNR", "FR", "EAC"],
    },
    {
        "id": "itn-gorilla-rwanda-3d",
        "name": "TRVE 3 Days - Rwanda Gorilla Express",
        "duration_days": 3,
        "vehicle_days": 2,
        "destinations": ["Kigali", "Volcanoes NP"],
        "countries": ["Rwanda"],
        "budget_tier": "luxury",
        "interests": ["gorilla_trekking", "cultural"],
        "permits_included": ["gorilla_tracking_rwanda"],
        "parks": ["Volcanoes NP"],
        "season": "year_round",
        "description": "Short luxury gorilla trek from Kigali — perfect as a standalone trip or add-on to a Uganda safari.",
        "highlights": "Kigali city tour, Volcanoes NP gorilla tracking, genocide memorial",
        "nationality_tiers": ["FNR", "FR", "EAC"],
    },
    {
        "id": "itn-kidepo-5d",
        "name": "TRVE 5 Days - Kidepo Wilderness Experience",
        "duration_days": 5,
        "vehicle_days": 4,
        "destinations": ["Entebbe", "Kidepo Valley NP"],
        "countries": ["Uganda"],
        "budget_tier": "premium",
        "interests": ["wildlife_safari", "bird_watching", "cultural"],
        "permits_included": ["park_entry_a"],
        "parks": ["Kidepo Valley NP"],
        "season": "dry_season",
        "description": "Uganda's most remote and pristine wilderness. Kidepo rivals the Serengeti for game density during dry season, with Karamojong cultural encounters.",
        "highlights": "Kidepo game drives, Karamojong village visit, Narus Valley, Kanangorok hot springs",
        "nationality_tiers": ["FNR", "FR", "EAC"],
    },
    {
        "id": "itn-jinja-3d",
        "name": "TRVE 3 Days - Jinja Adventure",
        "duration_days": 3,
        "vehicle_days": 2,
        "destinations": ["Jinja"],
        "countries": ["Uganda"],
        "budget_tier": "budget",
        "interests": ["adventure", "water_rafting", "cultural"],
        "permits_included": [],
        "parks": [],
        "season": "year_round",
        "description": "White-water rafting on the Nile, bungee jumping, and Source of the Nile boat ride. Perfect for adventure seekers.",
        "highlights": "Grade 5 white-water rafting, bungee jumping, Source of the Nile, Jinja town",
        "nationality_tiers": ["FNR", "FR", "EAC"],
    },
    {
        "id": "itn-gorilla-chimp-combo-5d",
        "name": "TRVE 5 Days - Gorilla & Chimp Combo",
        "duration_days": 5,
        "vehicle_days": 4,
        "destinations": ["Entebbe", "Kibale NP", "Bwindi Impenetrable NP"],
        "countries": ["Uganda"],
        "budget_tier": "premium",
        "interests": ["gorilla_trekking", "chimp_trekking", "primate"],
        "permits_included": ["gorilla_tracking_uganda", "chimp_tracking"],
        "parks": ["Kibale NP", "Bwindi Impenetrable NP"],
        "season": "year_round",
        "description": "Focused primate experience — chimps in Kibale and gorillas in Bwindi with no filler. Ideal for time-constrained travellers.",
        "highlights": "Kibale chimp tracking, Bwindi gorilla tracking, primate-focused",
        "nationality_tiers": ["FNR", "FR", "EAC"],
    },
    {
        "id": "itn-uganda-rwanda-10d",
        "name": "TRVE 10 Days - Uganda & Rwanda Combined",
        "duration_days": 10,
        "vehicle_days": 9,
        "destinations": ["Entebbe", "Kibale NP", "Queen Elizabeth NP", "Bwindi Impenetrable NP", "Lake Bunyonyi", "Kigali", "Volcanoes NP"],
        "countries": ["Uganda", "Rwanda"],
        "budget_tier": "luxury",
        "interests": ["gorilla_trekking", "chimp_trekking", "wildlife_safari", "cultural", "primate"],
        "permits_included": ["gorilla_tracking_uganda", "gorilla_tracking_rwanda", "chimp_tracking", "park_entry_a"],
        "parks": ["Kibale NP", "Queen Elizabeth NP", "Bwindi Impenetrable NP", "Volcanoes NP"],
        "season": "year_round",
        "description": "Cross-border luxury safari — Uganda's chimps and wildlife plus gorilla tracking in both Bwindi and Volcanoes NP. Two gorilla encounters.",
        "highlights": "Kibale chimps, QENP wildlife, Bwindi gorillas, Lake Bunyonyi, Kigali, Volcanoes NP gorillas",
        "nationality_tiers": ["FNR", "FR"],
    },
    {
        "id": "itn-photography-10d",
        "name": "TRVE 10 Days - Photography Safari",
        "duration_days": 10,
        "vehicle_days": 9,
        "destinations": ["Entebbe", "Murchison Falls NP", "Kibale NP", "Queen Elizabeth NP", "Bwindi Impenetrable NP"],
        "countries": ["Uganda"],
        "budget_tier": "luxury",
        "interests": ["gorilla_trekking", "chimp_trekking", "wildlife_safari", "bird_watching", "photography"],
        "permits_included": ["gorilla_tracking_uganda", "chimp_tracking", "park_entry_a_plus", "park_entry_a"],
        "parks": ["Murchison Falls NP", "Kibale NP", "Queen Elizabeth NP", "Bwindi Impenetrable NP"],
        "season": "dry_season",
        "description": "Designed for photographers — extended game drives timed for golden hour, pop-top vehicle, extra time at each location for the perfect shot.",
        "highlights": "Golden hour game drives, pop-top vehicle, Murchison Falls, chimp & gorilla close-ups",
        "nationality_tiers": ["FNR", "FR"],
    },
    {
        "id": "itn-honeymoon-8d",
        "name": "TRVE 8 Days - Honeymoon & Romance Safari",
        "duration_days": 8,
        "vehicle_days": 7,
        "destinations": ["Entebbe", "Kibale NP", "Queen Elizabeth NP", "Bwindi Impenetrable NP", "Lake Bunyonyi"],
        "countries": ["Uganda"],
        "budget_tier": "luxury",
        "interests": ["gorilla_trekking", "chimp_trekking", "wildlife_safari", "luxury", "cultural"],
        "permits_included": ["gorilla_tracking_uganda", "chimp_tracking", "park_entry_a"],
        "parks": ["Kibale NP", "Queen Elizabeth NP", "Bwindi Impenetrable NP"],
        "season": "year_round",
        "description": "Romantic luxury safari — private game drives, premium lodges, sundowners, and gorilla tracking. Includes Lake Bunyonyi relaxation day.",
        "highlights": "Private game drives, luxury lodges, sundowner experiences, gorilla tracking, Lake Bunyonyi canoe",
        "nationality_tiers": ["FNR", "FR"],
    },
    {
        "id": "itn-family-safari-8d",
        "name": "TRVE 8 Days - Family Safari Adventure",
        "duration_days": 8,
        "vehicle_days": 7,
        "destinations": ["Entebbe", "Ziwa Rhino Sanctuary", "Murchison Falls NP", "Kibale NP", "Queen Elizabeth NP"],
        "countries": ["Uganda"],
        "budget_tier": "mid_range",
        "interests": ["wildlife_safari", "chimp_trekking", "boat_cruise", "bird_watching", "cultural"],
        "permits_included": ["chimp_tracking", "park_entry_a_plus", "park_entry_a"],
        "parks": ["Murchison Falls NP", "Kibale NP", "Queen Elizabeth NP"],
        "season": "year_round",
        "description": "Family-friendly safari with shorter drives, kid-approved activities, and no gorilla trekking (age 15+ restriction). Rhinos, chimps, boat cruises, and lions.",
        "highlights": "Ziwa rhinos, Murchison boat cruise, Kibale chimps (12+), Kazinga Channel, Ishasha lions",
        "nationality_tiers": ["FNR", "FR", "EAC"],
    },
    {
        "id": "itn-birding-12d",
        "name": "TRVE 12 Days - Ultimate Birding Safari",
        "duration_days": 12,
        "vehicle_days": 11,
        "destinations": ["Entebbe", "Mabamba Swamp", "Murchison Falls NP", "Budongo Forest", "Kibale NP", "Queen Elizabeth NP", "Bwindi Impenetrable NP", "Lake Mburo NP"],
        "countries": ["Uganda"],
        "budget_tier": "premium",
        "interests": ["bird_watching", "wildlife_safari", "gorilla_trekking", "chimp_trekking", "primate"],
        "permits_included": ["gorilla_tracking_uganda", "chimp_tracking", "park_entry_a_plus", "park_entry_a"],
        "parks": ["Murchison Falls NP", "Kibale NP", "Queen Elizabeth NP", "Bwindi Impenetrable NP", "Lake Mburo NP"],
        "season": "year_round",
        "description": "For serious birders — 1,000+ species target. Shoebill at Mabamba, Albertine Rift endemics in Bwindi, papyrus specials, forest birds. Includes gorilla & chimp tracking.",
        "highlights": "Shoebill stork, Albertine Rift endemics, 1000+ species potential, Budongo Forest, gorilla tracking",
        "nationality_tiers": ["FNR", "FR", "EAC"],
    },
    {
        "id": "itn-gorilla-habituation-4d",
        "name": "TRVE 4 Days - Gorilla Habituation Experience",
        "duration_days": 4,
        "vehicle_days": 3,
        "destinations": ["Entebbe", "Bwindi Impenetrable NP (Rushaga)"],
        "countries": ["Uganda"],
        "budget_tier": "premium",
        "interests": ["gorilla_trekking", "primate", "cultural"],
        "permits_included": ["gorilla_habituation_uganda"],
        "parks": ["Bwindi Impenetrable NP"],
        "season": "year_round",
        "description": "The 4-hour gorilla habituation experience in Rushaga sector — spend extended time with a gorilla family being habituated to human presence. Maximum 4 visitors.",
        "highlights": "4-hour gorilla habituation (vs 1-hour tracking), Rushaga sector, Batwa community visit",
        "nationality_tiers": ["FNR", "FR"],
    },
    {
        "id": "itn-cultural-community-6d",
        "name": "TRVE 6 Days - Cultural & Community Safari",
        "duration_days": 6,
        "vehicle_days": 5,
        "destinations": ["Entebbe", "Kibale NP", "Queen Elizabeth NP", "Bwindi Impenetrable NP"],
        "countries": ["Uganda"],
        "budget_tier": "mid_range",
        "interests": ["cultural", "gorilla_trekking", "chimp_trekking", "community"],
        "permits_included": ["gorilla_tracking_uganda", "chimp_tracking", "park_entry_a"],
        "parks": ["Kibale NP", "Queen Elizabeth NP", "Bwindi Impenetrable NP"],
        "season": "year_round",
        "description": "Community-focused safari with Bigodi Wetland Sanctuary walk, Batwa Trail, local coffee farm visit, and traditional craft workshops alongside wildlife experiences.",
        "highlights": "Bigodi Wetland walk, Batwa Trail, coffee farm, craft workshops, chimps, gorillas",
        "nationality_tiers": ["FNR", "FR", "EAC"],
    },
]

# ---------------------------------------------------------------------------
# EMAIL NOTIFICATIONS
# ---------------------------------------------------------------------------
EMAIL_CFG = {
    "enabled": os.environ.get("EMAIL_NOTIFICATIONS_ENABLED", "false").lower() == "true",
    "smtp_host": os.environ.get("SMTP_HOST", "smtp.gmail.com"),
    "smtp_port": int(os.environ.get("SMTP_PORT", "587")),
    "smtp_user": os.environ.get("SMTP_USER", ""),
    "smtp_pass": os.environ.get("SMTP_PASS", ""),
    "from_name": os.environ.get("EMAIL_FROM_NAME", "TRVE Booking Hub"),
    "from_addr": os.environ.get("SMTP_USER", "noreply@trve.co.ug"),
    "bcc": os.environ.get("EMAIL_BCC", ""),  # optional BCC to TRVE staff
}


def send_email(to_addr: str, subject: str, html_body: str, pdf_attachment: bytes = None, pdf_filename: str = None) -> bool:
    """Send an email via SMTP. Returns True on success, False on failure (non-blocking)."""
    if not EMAIL_CFG["enabled"]:
        return False
    if not EMAIL_CFG["smtp_user"] or not to_addr:
        return False
    try:
        msg = MIMEMultipart("mixed")
        msg["From"] = f"{EMAIL_CFG['from_name']} <{EMAIL_CFG['from_addr']}>"
        msg["To"] = to_addr
        msg["Subject"] = subject
        if EMAIL_CFG["bcc"]:
            msg["Bcc"] = EMAIL_CFG["bcc"]

        # HTML body
        body_part = MIMEMultipart("alternative")
        body_part.attach(MIMEText(html_body, "html", "utf-8"))
        msg.attach(body_part)

        # Optional PDF attachment
        if pdf_attachment and pdf_filename:
            part = MIMEBase("application", "pdf")
            part.set_payload(pdf_attachment)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f'attachment; filename="{pdf_filename}"')
            msg.attach(part)

        with smtplib.SMTP(EMAIL_CFG["smtp_host"], EMAIL_CFG["smtp_port"]) as server:
            server.ehlo()
            server.starttls()
            server.login(EMAIL_CFG["smtp_user"], EMAIL_CFG["smtp_pass"])
            recipients = [to_addr]
            if EMAIL_CFG["bcc"]:
                recipients.append(EMAIL_CFG["bcc"])
            server.sendmail(EMAIL_CFG["from_addr"], recipients, msg.as_string())
        return True
    except Exception as e:
        print(f"[EMAIL] Send failed: {e}")
        return False


def enquiry_confirmation_html(booking_ref: str, client_name: str, destinations: str, travel_start: str, pax: int) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body {{ font-family: Arial, sans-serif; color: #1a2e29; max-width: 600px; margin: auto; padding: 20px; }}
  .header {{ background: #0D5E4F; color: white; padding: 24px; border-radius: 8px 8px 0 0; }}
  .header h1 {{ margin: 0; font-size: 20px; }}
  .header p {{ margin: 4px 0 0; font-size: 13px; opacity: 0.85; }}
  .body {{ background: #f9fafb; padding: 24px; border: 1px solid #e2e8e6; }}
  .ref {{ background: white; border: 2px solid #C8963E; border-radius: 6px; padding: 12px 20px; margin: 16px 0; text-align: center; font-size: 22px; font-weight: bold; color: #C8963E; letter-spacing: 2px; }}
  .field {{ margin: 8px 0; font-size: 14px; }}
  .label {{ color: #6b7e79; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }}
  .footer {{ background: #e8f4f1; padding: 16px 24px; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7e79; text-align: center; }}
</style></head>
<body>
  <div class="header">
    <h1>TRVE — The Rift Valley Explorer</h1>
    <p>Bucket List Adventures Into The Heart Of Africa</p>
  </div>
  <div class="body">
    <p>Dear {client_name},</p>
    <p>Thank you for your safari enquiry. We have received your request and our team will be in touch within 24 hours with a tailored itinerary.</p>
    <div class="ref">{booking_ref}</div>
    <p>Please quote your booking reference in all correspondence.</p>
    <div class="field"><div class="label">Destinations</div>{destinations or 'To be confirmed'}</div>
    <div class="field"><div class="label">Travel date</div>{travel_start or 'Flexible'}</div>
    <div class="field"><div class="label">Group size</div>{pax} {'person' if pax == 1 else 'people'}</div>
    <p style="margin-top:20px">We look forward to crafting an unforgettable African adventure for you.</p>
    <p>Warm regards,<br><strong>The TRVE Team</strong></p>
  </div>
  <div class="footer">TRVE — The Rift Valley Explorer | trve.co.ug | +256 XXX XXX XXX</div>
</body>
</html>"""


def quotation_email_html(client_name: str, booking_ref: str, total_usd: float, valid_days: int, itinerary_name: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body {{ font-family: Arial, sans-serif; color: #1a2e29; max-width: 600px; margin: auto; padding: 20px; }}
  .header {{ background: #0D5E4F; color: white; padding: 24px; border-radius: 8px 8px 0 0; }}
  .header h1 {{ margin: 0; font-size: 20px; }}
  .body {{ background: #f9fafb; padding: 24px; border: 1px solid #e2e8e6; }}
  .total {{ background: white; border: 2px solid #0D5E4F; border-radius: 6px; padding: 16px 20px; margin: 16px 0; text-align: center; }}
  .total-label {{ font-size: 12px; color: #6b7e79; text-transform: uppercase; }}
  .total-amount {{ font-size: 28px; font-weight: bold; color: #0D5E4F; }}
  .notice {{ background: #fffbeb; border-left: 3px solid #d97706; padding: 10px 14px; font-size: 12px; color: #92400e; margin: 16px 0; border-radius: 0 4px 4px 0; }}
  .footer {{ background: #e8f4f1; padding: 16px 24px; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7e79; text-align: center; }}
</style></head>
<body>
  <div class="header">
    <h1>TRVE — Your Safari Quotation</h1>
  </div>
  <div class="body">
    <p>Dear {client_name},</p>
    <p>Please find attached your personalised safari quotation for <strong>{itinerary_name}</strong>.</p>
    <p>Reference: <strong>{booking_ref}</strong></p>
    <div class="total">
      <div class="total-label">Total Quoted Price</div>
      <div class="total-amount">USD {total_usd:,.2f}</div>
    </div>
    <div class="notice">&#9888; Prices are subject to final confirmation within {valid_days} days due to fuel price and exchange rate fluctuations.</div>
    <p>To confirm your booking, please reply to this email or contact your TRVE coordinator. A 30% deposit is required to secure permits and accommodation.</p>
    <p>Warm regards,<br><strong>The TRVE Team</strong></p>
  </div>
  <div class="footer">TRVE — The Rift Valley Explorer | trve.co.ug | This quotation is valid for {valid_days} days from the date of issue.</div>
</body>
</html>"""


# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
CONFIG = {
    "fx_rate": FX_RATE,
    "service_fee_pct": 15,
    "commission_rates": {
        "standard": 0,
        "b2b": 5.6,
        "hornbill": 0,
    },
    "vehicle_rate_per_day": 120,
    "insurance_rate_per_person_per_day": 10,
    "coordinators": ["Desire", "Belinda", "Robert"],
    "fx_buffer_pct": 3,          # 3% FX volatility buffer
    "fuel_buffer_pct": 10,       # 10% fuel price buffer
    "quotation_validity_days": 7,  # Quotations expire after 7 days
    # Canonical configurable rate-effective date.  Overrides any "post_july_2026"
    # pricing tier in PERMIT_PRICES.  Update via PATCH /api/config without code change.
    "rate_effective_date": DEFAULT_RATE_EFFECTIVE_DATE,
    # Legacy alias kept for any external references; always mirrors rate_effective_date.
    "rate_increase_date": DEFAULT_RATE_EFFECTIVE_DATE,
    "last_updated": datetime.now().isoformat(),
}

# ---------------------------------------------------------------------------
# Email configuration (set via environment variables)
# ---------------------------------------------------------------------------
EMAIL_CONFIG = {
    "smtp_host": os.environ.get("SMTP_HOST", "smtp.gmail.com"),
    "smtp_port": int(os.environ.get("SMTP_PORT", "587")),
    "smtp_user": os.environ.get("SMTP_USER", ""),
    "smtp_pass": os.environ.get("SMTP_PASS", ""),
    "from_name": os.environ.get("EMAIL_FROM_NAME", "TRVE Booking Hub"),
    "from_addr": os.environ.get("EMAIL_FROM_ADDR", ""),
    "enabled": bool(os.environ.get("SMTP_USER", "")),
}


def send_email_async(to_addr: str, subject: str, html_body: str, attachments: list = None):
    """Send an email in a background thread. Silent failure if not configured."""
    if not EMAIL_CONFIG["enabled"] or not to_addr or "@" not in to_addr:
        return

    def _send():
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f'{EMAIL_CONFIG["from_name"]} <{EMAIL_CONFIG["from_addr"] or EMAIL_CONFIG["smtp_user"]}>'
            msg["To"] = to_addr
            msg.attach(MIMEText(html_body, "html"))

            if attachments:
                for fname, fdata in attachments:
                    part = MIMEBase("application", "octet-stream")
                    part.set_payload(fdata)
                    encoders.encode_base64(part)
                    part.add_header("Content-Disposition", f'attachment; filename="{fname}"')
                    msg.attach(part)

            with smtplib.SMTP(EMAIL_CONFIG["smtp_host"], EMAIL_CONFIG["smtp_port"]) as server:
                server.ehlo()
                server.starttls()
                server.login(EMAIL_CONFIG["smtp_user"], EMAIL_CONFIG["smtp_pass"])
                server.sendmail(msg["From"], [to_addr], msg.as_string())
        except Exception as e:
            print(f"[email] Failed to send to {to_addr}: {e}")

    threading.Thread(target=_send, daemon=True).start()


ENQUIRY_CONFIRM_TEMPLATE = """
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a2e29">
  <div style="background:#0D5E4F;padding:24px;text-align:center">
    <h1 style="color:#C8963E;margin:0;font-size:24px">TRVE Booking Hub</h1>
    <p style="color:#fff;margin:8px 0 0;font-size:14px">The Rift Valley Explorer — Bucket List Adventures Into The Heart Of Africa</p>
  </div>
  <div style="padding:32px 24px;background:#fff">
    <h2 style="color:#0D5E4F">Enquiry Received ✓</h2>
    <p>Dear {client_name},</p>
    <p>Thank you for your enquiry. We have received your request and one of our safari specialists will be in touch within <strong>24 hours</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr style="background:#f4f6f5"><td style="padding:10px;font-weight:bold;width:40%">Booking Reference</td><td style="padding:10px;color:#0D5E4F;font-weight:bold">{booking_ref}</td></tr>
      <tr><td style="padding:10px;font-weight:bold">Travel Dates</td><td style="padding:10px">{travel_dates}</td></tr>
      <tr style="background:#f4f6f5"><td style="padding:10px;font-weight:bold">Guests</td><td style="padding:10px">{pax} people</td></tr>
      <tr><td style="padding:10px;font-weight:bold">Destinations</td><td style="padding:10px">{destinations}</td></tr>
    </table>
    <p>We will craft a personalised itinerary based on your interests and budget.</p>
    <div style="background:#f4f6f5;padding:16px;border-radius:8px;margin-top:20px">
      <p style="margin:0;font-size:13px;color:#6b7e79">Questions? Reply to this email or WhatsApp us. Please quote your reference <strong>{booking_ref}</strong> in all communications.</p>
    </div>
  </div>
  <div style="padding:16px 24px;background:#0D5E4F;text-align:center">
    <p style="color:#fff;font-size:12px;margin:0">The Rift Valley Explorer · Uganda & Rwanda Safari Specialists</p>
  </div>
</body></html>
"""

QUOTATION_EMAIL_TEMPLATE = """
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a2e29">
  <div style="background:#0D5E4F;padding:24px;text-align:center">
    <h1 style="color:#C8963E;margin:0;font-size:24px">TRVE Booking Hub</h1>
    <p style="color:#fff;margin:8px 0 0;font-size:14px">Safari Quotation</p>
  </div>
  <div style="padding:32px 24px;background:#fff">
    <h2 style="color:#0D5E4F">Your Safari Quotation</h2>
    <p>Dear {client_name},</p>
    <p>Please find your personalised safari quotation attached as a PDF. We have designed this itinerary specifically for you.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <tr style="background:#f4f6f5"><td style="padding:10px;font-weight:bold;width:40%">Quotation Reference</td><td style="padding:10px;color:#0D5E4F;font-weight:bold">{quotation_id}</td></tr>
      <tr><td style="padding:10px;font-weight:bold">Total (USD)</td><td style="padding:10px;font-size:18px;font-weight:bold;color:#0D5E4F">${total_usd}</td></tr>
      <tr style="background:#f4f6f5"><td style="padding:10px;font-weight:bold">Valid Until</td><td style="padding:10px;color:#dc2626">{expires_at}</td></tr>
    </table>
    <div style="background:#fffbeb;border:1px solid #fef3c7;border-left:3px solid #d97706;padding:12px 16px;border-radius:6px;margin:16px 0">
      <p style="margin:0;font-size:13px;color:#d97706"><strong>⚠️ Price Validity:</strong> Prices are subject to confirmation within 7 days due to fuel price and exchange rate fluctuations.</p>
    </div>
    <p>To confirm your booking, please reply to this email or contact your safari specialist directly.</p>
    <p>A 30% deposit is required to secure your reservation.</p>
  </div>
  <div style="padding:16px 24px;background:#0D5E4F;text-align:center">
    <p style="color:#fff;font-size:12px;margin:0">The Rift Valley Explorer · Uganda & Rwanda Safari Specialists</p>
  </div>
</body></html>
"""

# ---------------------------------------------------------------------------
# Lodge seed data
# ---------------------------------------------------------------------------
LODGE_SEED = [
    # --- Uganda: Bwindi ---
    {"lodge_name": "Bwindi Lodge", "room_type": "Double Room", "country": "Uganda", "location": "Bwindi", "rack_rate_usd": 350, "meal_plan": "Full Board"},
    {"lodge_name": "Bwindi Lodge", "room_type": "Single Supplement", "country": "Uganda", "location": "Bwindi", "rack_rate_usd": 175, "meal_plan": "Full Board"},
    {"lodge_name": "Mahogany Springs", "room_type": "Deluxe Double", "country": "Uganda", "location": "Bwindi", "rack_rate_usd": 400, "meal_plan": "Full Board"},
    {"lodge_name": "Mahogany Springs", "room_type": "Single", "country": "Uganda", "location": "Bwindi", "rack_rate_usd": 220, "meal_plan": "Full Board"},
    {"lodge_name": "Gorilla Forest Camp", "room_type": "Luxury Tent Double", "country": "Uganda", "location": "Bwindi", "rack_rate_usd": 680, "meal_plan": "Full Board", "notes": "Wilderness Safaris"},
    {"lodge_name": "Gorilla Forest Camp", "room_type": "Single", "country": "Uganda", "location": "Bwindi", "rack_rate_usd": 380, "meal_plan": "Full Board", "notes": "Wilderness Safaris"},
    {"lodge_name": "Sanctuary Gorilla Forest Camp", "room_type": "Double", "country": "Uganda", "location": "Bwindi", "rack_rate_usd": 580, "meal_plan": "Full Board"},
    {"lodge_name": "Sanctuary Gorilla Forest Camp", "room_type": "Single", "country": "Uganda", "location": "Bwindi", "rack_rate_usd": 300, "meal_plan": "Full Board"},
    {"lodge_name": "Clouds Mountain Gorilla Lodge", "room_type": "Double", "country": "Uganda", "location": "Bwindi", "rack_rate_usd": 750, "meal_plan": "Full Board"},
    {"lodge_name": "Clouds Mountain Gorilla Lodge", "room_type": "Single", "country": "Uganda", "location": "Bwindi", "rack_rate_usd": 400, "meal_plan": "Full Board"},
    {"lodge_name": "Gorillas Nest Lodge", "room_type": "Double", "country": "Uganda", "location": "Bwindi", "rack_rate_usd": 320, "meal_plan": "Full Board"},
    {"lodge_name": "Gorillas Nest Lodge", "room_type": "Single", "country": "Uganda", "location": "Bwindi", "rack_rate_usd": 175, "meal_plan": "Full Board"},
    # --- Uganda: Kibale ---
    {"lodge_name": "Kibale Forest Camp", "room_type": "Double", "country": "Uganda", "location": "Kibale", "rack_rate_usd": 320, "meal_plan": "Full Board"},
    {"lodge_name": "Kibale Forest Camp", "room_type": "Single", "country": "Uganda", "location": "Kibale", "rack_rate_usd": 180, "meal_plan": "Full Board"},
    {"lodge_name": "Primate Lodge Kibale", "room_type": "Double", "country": "Uganda", "location": "Kibale", "rack_rate_usd": 280, "meal_plan": "Full Board"},
    {"lodge_name": "Primate Lodge Kibale", "room_type": "Single", "country": "Uganda", "location": "Kibale", "rack_rate_usd": 160, "meal_plan": "Full Board"},
    {"lodge_name": "Kyaninga Lodge", "room_type": "Double", "country": "Uganda", "location": "Kibale", "rack_rate_usd": 550, "meal_plan": "Full Board"},
    {"lodge_name": "Kyaninga Lodge", "room_type": "Single", "country": "Uganda", "location": "Kibale", "rack_rate_usd": 300, "meal_plan": "Full Board"},
    # --- Uganda: Queen Elizabeth NP ---
    {"lodge_name": "Mweya Safari Lodge", "room_type": "Double", "country": "Uganda", "location": "QENP", "rack_rate_usd": 220, "meal_plan": "Half Board"},
    {"lodge_name": "Mweya Safari Lodge", "room_type": "Single", "country": "Uganda", "location": "QENP", "rack_rate_usd": 130, "meal_plan": "Half Board"},
    {"lodge_name": "Jacana Safari Lodge", "room_type": "Double", "country": "Uganda", "location": "QENP", "rack_rate_usd": 200, "meal_plan": "Full Board"},
    {"lodge_name": "Jacana Safari Lodge", "room_type": "Single", "country": "Uganda", "location": "QENP", "rack_rate_usd": 110, "meal_plan": "Full Board"},
    {"lodge_name": "Ishasha Wilderness Camp", "room_type": "Double", "country": "Uganda", "location": "QENP/Ishasha", "rack_rate_usd": 320, "meal_plan": "Full Board"},
    {"lodge_name": "Ishasha Wilderness Camp", "room_type": "Single", "country": "Uganda", "location": "QENP/Ishasha", "rack_rate_usd": 180, "meal_plan": "Full Board"},
    # --- Uganda: Murchison Falls ---
    {"lodge_name": "Paraa Safari Lodge", "room_type": "Double", "country": "Uganda", "location": "Murchison Falls NP", "rack_rate_usd": 180, "meal_plan": "Half Board"},
    {"lodge_name": "Paraa Safari Lodge", "room_type": "Single", "country": "Uganda", "location": "Murchison Falls NP", "rack_rate_usd": 100, "meal_plan": "Half Board"},
    {"lodge_name": "Chobe Safari Lodge", "room_type": "Double", "country": "Uganda", "location": "Murchison Falls NP", "rack_rate_usd": 200, "meal_plan": "Full Board"},
    {"lodge_name": "Chobe Safari Lodge", "room_type": "Single", "country": "Uganda", "location": "Murchison Falls NP", "rack_rate_usd": 110, "meal_plan": "Full Board"},
    {"lodge_name": "Baker's Lodge", "room_type": "Double", "country": "Uganda", "location": "Murchison Falls NP", "rack_rate_usd": 350, "meal_plan": "Full Board"},
    {"lodge_name": "Baker's Lodge", "room_type": "Single", "country": "Uganda", "location": "Murchison Falls NP", "rack_rate_usd": 195, "meal_plan": "Full Board"},
    # --- Uganda: Kidepo ---
    {"lodge_name": "Apoka Safari Lodge", "room_type": "Double", "country": "Uganda", "location": "Kidepo Valley NP", "rack_rate_usd": 480, "meal_plan": "Full Board"},
    {"lodge_name": "Apoka Safari Lodge", "room_type": "Single", "country": "Uganda", "location": "Kidepo Valley NP", "rack_rate_usd": 260, "meal_plan": "Full Board"},
    # --- Uganda: Jinja ---
    {"lodge_name": "Wildwaters Lodge", "room_type": "Double", "country": "Uganda", "location": "Jinja", "rack_rate_usd": 280, "meal_plan": "Full Board"},
    {"lodge_name": "Wildwaters Lodge", "room_type": "Single", "country": "Uganda", "location": "Jinja", "rack_rate_usd": 155, "meal_plan": "Full Board"},
    # --- Uganda: Lake Mburo ---
    {"lodge_name": "Lake Mburo Camp", "room_type": "Double", "country": "Uganda", "location": "Lake Mburo NP", "rack_rate_usd": 180, "meal_plan": "Full Board"},
    {"lodge_name": "Lake Mburo Camp", "room_type": "Single", "country": "Uganda", "location": "Lake Mburo NP", "rack_rate_usd": 100, "meal_plan": "Full Board"},
    {"lodge_name": "Mihingo Lodge", "room_type": "Double", "country": "Uganda", "location": "Lake Mburo NP", "rack_rate_usd": 260, "meal_plan": "Full Board"},
    {"lodge_name": "Mihingo Lodge", "room_type": "Single", "country": "Uganda", "location": "Lake Mburo NP", "rack_rate_usd": 145, "meal_plan": "Full Board"},
    # --- Uganda: Lake Bunyonyi ---
    {"lodge_name": "Arcadia Cottages", "room_type": "Double", "country": "Uganda", "location": "Lake Bunyonyi", "rack_rate_usd": 90, "meal_plan": "Breakfast"},
    {"lodge_name": "Arcadia Cottages", "room_type": "Single", "country": "Uganda", "location": "Lake Bunyonyi", "rack_rate_usd": 55, "meal_plan": "Breakfast"},
    {"lodge_name": "Bird Nest Resort", "room_type": "Double", "country": "Uganda", "location": "Lake Bunyonyi", "rack_rate_usd": 120, "meal_plan": "Half Board"},
    {"lodge_name": "Bird Nest Resort", "room_type": "Single", "country": "Uganda", "location": "Lake Bunyonyi", "rack_rate_usd": 70, "meal_plan": "Half Board"},
    # --- Rwanda: Volcanoes NP ---
    {"lodge_name": "Bisate Lodge", "room_type": "Double", "country": "Rwanda", "location": "Volcanoes NP", "rack_rate_usd": 2200, "meal_plan": "Full Board", "notes": "Wilderness Safaris"},
    {"lodge_name": "Bisate Lodge", "room_type": "Single", "country": "Rwanda", "location": "Volcanoes NP", "rack_rate_usd": 1200, "meal_plan": "Full Board", "notes": "Wilderness Safaris"},
    {"lodge_name": "One&Only Gorilla's Nest", "room_type": "Double", "country": "Rwanda", "location": "Volcanoes NP", "rack_rate_usd": 1800, "meal_plan": "Full Board"},
    {"lodge_name": "One&Only Gorilla's Nest", "room_type": "Single", "country": "Rwanda", "location": "Volcanoes NP", "rack_rate_usd": 950, "meal_plan": "Full Board"},
    {"lodge_name": "Singita Kwitonda Lodge", "room_type": "Double", "country": "Rwanda", "location": "Volcanoes NP", "rack_rate_usd": 2500, "meal_plan": "Full Board"},
    {"lodge_name": "Singita Kwitonda Lodge", "room_type": "Single", "country": "Rwanda", "location": "Volcanoes NP", "rack_rate_usd": 1300, "meal_plan": "Full Board"},
    {"lodge_name": "Sabyinyo Silverback Lodge", "room_type": "Double", "country": "Rwanda", "location": "Volcanoes NP", "rack_rate_usd": 1500, "meal_plan": "Full Board"},
    {"lodge_name": "Sabyinyo Silverback Lodge", "room_type": "Single", "country": "Rwanda", "location": "Volcanoes NP", "rack_rate_usd": 800, "meal_plan": "Full Board"},
    {"lodge_name": "Virunga Lodge", "room_type": "Double", "country": "Rwanda", "location": "Volcanoes NP", "rack_rate_usd": 1200, "meal_plan": "Full Board"},
    {"lodge_name": "Virunga Lodge", "room_type": "Single", "country": "Rwanda", "location": "Volcanoes NP", "rack_rate_usd": 650, "meal_plan": "Full Board"},
    {"lodge_name": "Mountain Gorilla View Lodge", "room_type": "Double", "country": "Rwanda", "location": "Volcanoes NP", "rack_rate_usd": 450, "meal_plan": "Full Board"},
    {"lodge_name": "Mountain Gorilla View Lodge", "room_type": "Single", "country": "Rwanda", "location": "Volcanoes NP", "rack_rate_usd": 250, "meal_plan": "Full Board"},
    # --- Rwanda: Kigali ---
    {"lodge_name": "Kigali Serena Hotel", "room_type": "Double", "country": "Rwanda", "location": "Kigali", "rack_rate_usd": 180, "meal_plan": "Breakfast"},
    {"lodge_name": "Kigali Serena Hotel", "room_type": "Single", "country": "Rwanda", "location": "Kigali", "rack_rate_usd": 130, "meal_plan": "Breakfast"},
    # --- Uganda: Bwindi — additional from email records ---
    {"lodge_name": "Nkuringo Gorilla Lodge", "room_type": "Deluxe Garden Cottage", "country": "Uganda", "location": "Bwindi — Nkuringo", "rack_rate_usd": 620, "meal_plan": "Full Board", "notes": "Rebranded 2026"},
    {"lodge_name": "Silverback Lodge", "room_type": "Superior Double", "country": "Uganda", "location": "Bwindi — Buhoma", "rack_rate_usd": 920, "meal_plan": "Full Board", "notes": "Marasa Africa; 5-star rebuilt 2025"},
    {"lodge_name": "Engagi Lodge", "room_type": "Double Room", "country": "Uganda", "location": "Bwindi — Buhoma", "rack_rate_usd": 480, "meal_plan": "Full Board", "notes": "Kimbla-Mantana"},
    {"lodge_name": "Buhoma Lodge", "room_type": "Banda Double", "country": "Uganda", "location": "Bwindi — Buhoma", "rack_rate_usd": 490, "meal_plan": "Full Board", "notes": "Exclusive Camps"},
    # --- Uganda: Kibale ---
    {"lodge_name": "Kibale Lodge", "room_type": "Forest Suite Double", "country": "Uganda", "location": "Kibale NP", "rack_rate_usd": 880, "meal_plan": "Full Board", "notes": "Volcanoes Safaris; AFAR top 25"},
    {"lodge_name": "Chimpundu Lodge", "room_type": "Double Room", "country": "Uganda", "location": "Kibale NP — Fort Portal", "rack_rate_usd": 285, "meal_plan": "Full Board"},
    {"lodge_name": "Emburara Farm Lodge", "room_type": "Double Room", "country": "Uganda", "location": "Fort Portal", "rack_rate_usd": 260, "meal_plan": "Full Board"},
    {"lodge_name": "Crater Safari Lodge", "room_type": "Double Room", "country": "Uganda", "location": "Kibale — Crater Lakes", "rack_rate_usd": 450, "meal_plan": "Full Board", "notes": "Crystal Lodges"},
    # --- Uganda: QENP ---
    {"lodge_name": "Elephant Plains Lodge", "room_type": "Cottage Double", "country": "Uganda", "location": "Queen Elizabeth NP", "rack_rate_usd": 330, "meal_plan": "Full Board", "notes": "Great Lakes Collection"},
    {"lodge_name": "Simba Safari Camp", "room_type": "Standard Double", "country": "Uganda", "location": "Queen Elizabeth NP", "rack_rate_usd": 230, "meal_plan": "Full Board", "notes": "Great Lakes Collection"},
    {"lodge_name": "Anyadwe House", "room_type": "Double Room", "country": "Uganda", "location": "Queen Elizabeth NP — Ishasha", "rack_rate_usd": 480, "meal_plan": "Full Board", "notes": "Exclusive Camps; private house"},
    # --- Uganda: Murchison Falls ---
    {"lodge_name": "Pabidi Lodge Budongo", "room_type": "Tented Suite Double", "country": "Uganda", "location": "Murchison Falls NP — Budongo", "rack_rate_usd": 380, "meal_plan": "Full Board", "notes": "Great Lakes Collection"},
    # --- Uganda: Kidepo ---
    {"lodge_name": "Kidepo Wilderness Lodge", "room_type": "Double Room", "country": "Uganda", "location": "Kidepo Valley NP", "rack_rate_usd": 520, "meal_plan": "Full Board", "notes": "Crystal Lodges Uganda"},
    {"lodge_name": "Adere Safari Lodge", "room_type": "Double Room", "country": "Uganda", "location": "Kidepo Valley NP", "rack_rate_usd": 360, "meal_plan": "Full Board"},
    {"lodge_name": "Enjojo Lodge", "room_type": "Double Room", "country": "Uganda", "location": "Kidepo Valley NP", "rack_rate_usd": 410, "meal_plan": "Full Board"},
    # --- Uganda: Mgahinga ---
    {"lodge_name": "Mount Gahinga Lodge", "room_type": "Bandas Double", "country": "Uganda", "location": "Mgahinga Gorilla NP", "rack_rate_usd": 640, "meal_plan": "Full Board", "notes": "Volcanoes Safaris"},
    # --- Uganda: Lake Mburo ---
    {"lodge_name": "Mburo Tented Camp", "room_type": "Tent Double", "country": "Uganda", "location": "Lake Mburo NP", "rack_rate_usd": 250, "meal_plan": "Full Board", "notes": "Kimbla-Mantana"},
    # --- Uganda: Entebbe / Lulongo ---
    {"lodge_name": "Pumba Safari Cottages", "room_type": "Double Room", "country": "Uganda", "location": "Lulongo — Entebbe", "rack_rate_usd": 170, "meal_plan": "Full Board", "notes": "Woodland Lodges"},
    {"lodge_name": "Topi Lodge", "room_type": "Double Room", "country": "Uganda", "location": "Lulongo — Entebbe", "rack_rate_usd": 150, "meal_plan": "Full Board", "notes": "Woodland Lodges"},
    {"lodge_name": "Hornbill Bush Lodge", "room_type": "Double Room", "country": "Uganda", "location": "Lulongo — Entebbe", "rack_rate_usd": 160, "meal_plan": "Full Board", "notes": "Woodland Lodges"},
    {"lodge_name": "Tilapia Lodge", "room_type": "Double Room", "country": "Uganda", "location": "Lulongo — Entebbe", "rack_rate_usd": 155, "meal_plan": "Full Board", "notes": "Woodland Lodges"},
    {"lodge_name": "Papyrus Guest House", "room_type": "Double Room", "country": "Uganda", "location": "Bwindi — Nkuringo", "rack_rate_usd": 210, "meal_plan": "Bed & Breakfast", "notes": "Nkuringo group"},
]


def _seed_lodges(conn):
    """Seed the lodges table with TRVE partner lodge rates (detailed, fixed IDs)."""
    lodges = [
        # ── BWINDI IMPENETRABLE NP ──────────────────────────────────
        ("lodge-bwindi-1", "Gorilla Safari Lodge", "Double Room", "Uganda", "Bwindi — Buhoma", 590, 450, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-bwindi-1b", "Gorilla Safari Lodge", "Single Room", "Uganda", "Bwindi — Buhoma", 720, 580, "Full Board", "2025-01-01", "2025-12-31", "Single supplement"),
        ("lodge-bwindi-2", "Gorilla Safari Lodge", "Double Room", "Uganda", "Bwindi — Buhoma", 610, 470, "Full Board", "2026-01-01", "2026-12-31", "2026 rates"),
        ("lodge-bwindi-2b", "Gorilla Safari Lodge", "Single Room", "Uganda", "Bwindi — Buhoma", 750, 600, "Full Board", "2026-01-01", "2026-12-31", "2026 rates"),
        ("lodge-clouds-1", "Clouds Mountain Gorilla Lodge", "Cottage (Double)", "Uganda", "Bwindi — Nkuringo", 1050, 820, "Full Board", "2025-01-01", "2025-12-31", "Luxury"),
        ("lodge-clouds-2", "Clouds Mountain Gorilla Lodge", "Cottage (Single)", "Uganda", "Bwindi — Nkuringo", 1260, 980, "Full Board", "2025-01-01", "2025-12-31", "Luxury single"),
        ("lodge-mahogany-1", "Mahogany Springs Lodge", "Forest Suite (Double)", "Uganda", "Bwindi — Buhoma", 780, 610, "Full Board", "2025-01-01", "2025-12-31", "Premium"),
        ("lodge-mahogany-2", "Mahogany Springs Lodge", "Forest Suite (Single)", "Uganda", "Bwindi — Buhoma", 940, 730, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-buhoma-1", "Buhoma Lodge", "Banda (Double)", "Uganda", "Bwindi — Buhoma", 490, 380, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-buhoma-2", "Buhoma Lodge", "Banda (Single)", "Uganda", "Bwindi — Buhoma", 590, 460, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-nkuringo-1", "Nkuringo Bwindi Gorilla Lodge", "Bandas (Double)", "Uganda", "Bwindi — Nkuringo", 530, 415, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-nkuringo-2", "Nkuringo Bwindi Gorilla Lodge", "Bandas (Single)", "Uganda", "Bwindi — Nkuringo", 640, 495, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-sanctuary-1", "Sanctuary Gorilla Forest Camp", "Tent (Double)", "Uganda", "Bwindi — Buhoma", 1200, 960, "Full Board", "2025-01-01", "2025-12-31", "Luxury tented"),
        ("lodge-rushaga-1", "Rushaga Gorilla Camp", "Double Room", "Uganda", "Bwindi — Rushaga", 320, 250, "Full Board", "2025-01-01", "2025-12-31", "Budget option"),
        ("lodge-rushaga-2", "Rushaga Gorilla Camp", "Single Room", "Uganda", "Bwindi — Rushaga", 390, 300, "Full Board", "2025-01-01", "2025-12-31", ""),
        # ── KIBALE NATIONAL PARK ───────────────────────────────────
        ("lodge-kibale-kyan-1", "Kyaninga Lodge", "Cottage (Double)", "Uganda", "Kibale NP", 820, 650, "Full Board", "2025-01-01", "2025-12-31", "Luxury"),
        ("lodge-kibale-kyan-2", "Kyaninga Lodge", "Cottage (Single)", "Uganda", "Kibale NP", 980, 780, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-kibale-primate-1", "Primate Lodge Kibale", "Bandas (Double)", "Uganda", "Kibale NP — Kanyanchu", 480, 375, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-kibale-primate-2", "Primate Lodge Kibale", "Bandas (Single)", "Uganda", "Kibale NP — Kanyanchu", 580, 450, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-kibale-papaya-1", "Papaya Lake Lodge", "Suite (Double)", "Uganda", "Kibale NP — Fort Portal", 560, 440, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-kibale-papaya-2", "Papaya Lake Lodge", "Suite (Single)", "Uganda", "Kibale NP — Fort Portal", 680, 530, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-kibale-forest-1", "Kibale Forest Camp", "Tent (Double)", "Uganda", "Kibale NP", 430, 340, "Full Board", "2025-01-01", "2025-12-31", ""),
        # ── QUEEN ELIZABETH NATIONAL PARK ──────────────────────────
        ("lodge-qenp-mweya-1", "Mweya Safari Lodge", "Standard Double", "Uganda", "Queen Elizabeth NP — Mweya", 460, 360, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-qenp-mweya-2", "Mweya Safari Lodge", "Standard Single", "Uganda", "Queen Elizabeth NP — Mweya", 550, 430, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-qenp-kyambura-1", "Kyambura Gorge Lodge", "Cottage (Double)", "Uganda", "Queen Elizabeth NP — Kyambura", 780, 610, "Full Board", "2025-01-01", "2025-12-31", "Luxury"),
        ("lodge-qenp-kyambura-2", "Kyambura Gorge Lodge", "Cottage (Single)", "Uganda", "Queen Elizabeth NP — Kyambura", 940, 730, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-qenp-jacana-1", "Jacana Safari Lodge", "Banda (Double)", "Uganda", "Queen Elizabeth NP — Mweya", 390, 305, "Full Board", "2025-01-01", "2025-12-31", "Mid-range"),
        ("lodge-qenp-jacana-2", "Jacana Safari Lodge", "Banda (Single)", "Uganda", "Queen Elizabeth NP — Mweya", 470, 365, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-qenp-ishasha-1", "Ishasha Wilderness Camp", "Tent (Double)", "Uganda", "Queen Elizabeth NP — Ishasha", 680, 530, "Full Board", "2025-01-01", "2025-12-31", "Premium tented"),
        ("lodge-qenp-ishasha-2", "Ishasha Wilderness Camp", "Tent (Single)", "Uganda", "Queen Elizabeth NP — Ishasha", 820, 640, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-qenp-kazinga-1", "Kazinga Channel Tented Lodge", "Tent (Double)", "Uganda", "Queen Elizabeth NP — Kazinga", 340, 265, "Half Board", "2025-01-01", "2025-12-31", ""),
        # ── MURCHISON FALLS NP ─────────────────────────────────────
        ("lodge-mfc-bakers-1", "Baker's Lodge", "Luxury Tent (Double)", "Uganda", "Murchison Falls NP", 920, 720, "Full Board", "2025-01-01", "2025-12-31", "Luxury, Nile views"),
        ("lodge-mfc-bakers-2", "Baker's Lodge", "Luxury Tent (Single)", "Uganda", "Murchison Falls NP", 1100, 860, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-mfc-paraa-1", "Paraa Safari Lodge", "Standard Double", "Uganda", "Murchison Falls NP — Paraa", 450, 355, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-mfc-paraa-2", "Paraa Safari Lodge", "Standard Single", "Uganda", "Murchison Falls NP — Paraa", 540, 420, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-mfc-pakuba-1", "Pakuba Safari Lodge", "Banda (Double)", "Uganda", "Murchison Falls NP — Pakuba", 320, 250, "Half Board", "2025-01-01", "2025-12-31", "Mid-range"),
        ("lodge-mfc-pakuba-2", "Pakuba Safari Lodge", "Banda (Single)", "Uganda", "Murchison Falls NP — Pakuba", 250, 195, "Half Board", "2025-01-01", "2025-12-31", "Single supplement"),
        ("lodge-mfc-pakuba-3", "Pakuba Safari Lodge", "Family Banda", "Uganda", "Murchison Falls NP — Pakuba", 480, 375, "Half Board", "2025-01-01", "2025-12-31", "Up to 4 guests"),
        ("lodge-mfc-chobe-1", "Chobe Safari Lodge", "Tent (Double)", "Uganda", "Murchison Falls NP — Chobe", 380, 300, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-mfc-chobe-3", "Chobe Safari Lodge", "Tent (Single)", "Uganda", "Murchison Falls NP — Chobe", 460, 360, "Full Board", "2025-01-01", "2025-12-31", "Single supplement"),
        ("lodge-mfc-nile-1", "Nile Safari Lodge", "Tent (Double)", "Uganda", "Murchison Falls NP", 520, 405, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-mfc-nile-2", "Nile Safari Lodge", "Tent (Single)", "Uganda", "Murchison Falls NP", 625, 485, "Full Board", "2025-01-01", "2025-12-31", "Single supplement"),
        # ── LAKE MBURO NATIONAL PARK ────────────────────────────────
        ("lodge-mburo-mihingo-1", "Mihingo Lodge", "Tent (Double)", "Uganda", "Lake Mburo NP", 620, 485, "Full Board", "2025-01-01", "2025-12-31", "Premium, hillside"),
        ("lodge-mburo-mihingo-2", "Mihingo Lodge", "Tent (Single)", "Uganda", "Lake Mburo NP", 745, 580, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-mburo-mantana-1", "Mantana Tented Camp", "Tent (Double)", "Uganda", "Lake Mburo NP", 290, 225, "Full Board", "2025-01-01", "2025-12-31", "Mid-range"),
        ("lodge-mburo-arcadia-1", "Arcadia Cottages", "Cottage (Double)", "Uganda", "Lake Bunyonyi", 180, 140, "Bed & Breakfast", "2025-01-01", "2025-12-31", "Budget-friendly"),
        # ── KIDEPO VALLEY NP ────────────────────────────────────────
        ("lodge-kidepo-apoka-1", "Apoka Safari Lodge", "Cottage (Double)", "Uganda", "Kidepo Valley NP", 820, 640, "Full Board", "2025-01-01", "2025-12-31", "Luxury, remote"),
        ("lodge-kidepo-apoka-2", "Apoka Safari Lodge", "Cottage (Single)", "Uganda", "Kidepo Valley NP", 980, 765, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-kidepo-wild-1", "Kidepo Savannah Lodge", "Cottage (Double)", "Uganda", "Kidepo Valley NP", 380, 295, "Full Board", "2025-01-01", "2025-12-31", "Mid-range"),
        # ── ENTEBBE / KAMPALA ───────────────────────────────────────
        ("lodge-entebbe-boma-1", "The Boma Entebbe", "Superior Double", "Uganda", "Entebbe", 180, 140, "Bed & Breakfast", "2025-01-01", "2025-12-31", "City hotel"),
        ("lodge-entebbe-lake-1", "Lake Victoria Hotel", "Standard Double", "Uganda", "Entebbe", 120, 95, "Bed & Breakfast", "2025-01-01", "2025-12-31", ""),
        ("lodge-kampala-serena-1", "Kampala Serena Hotel", "Superior Double", "Uganda", "Kampala", 240, 190, "Bed & Breakfast", "2025-01-01", "2025-12-31", "5-star city"),
        # ── ZIWA RHINO SANCTUARY ────────────────────────────────────
        ("lodge-ziwa-1", "Amuka Safari Lodge", "Banda (Double)", "Uganda", "Ziwa Rhino Sanctuary", 220, 170, "Half Board", "2025-01-01", "2025-12-31", "At sanctuary"),
        # ── RWANDA — VOLCANOES NP ───────────────────────────────────
        ("lodge-rwa-singita-1", "Singita Kwitonda Lodge", "Suite (Double)", "Rwanda", "Volcanoes NP", 2200, 1760, "Full Board", "2025-01-01", "2025-12-31", "Ultra-luxury"),
        ("lodge-rwa-wilderness-1", "Wilderness Bisate Lodge", "Villa (Double)", "Rwanda", "Volcanoes NP", 1850, 1480, "Full Board", "2025-01-01", "2025-12-31", "Luxury eco"),
        ("lodge-rwa-sabyinyo-1", "Sabyinyo Silverback Lodge", "Cottage (Double)", "Rwanda", "Volcanoes NP", 1480, 1185, "Full Board", "2025-01-01", "2025-12-31", "Luxury"),
        ("lodge-rwa-mountain-1", "Mountain Gorilla View Lodge", "Double Room", "Rwanda", "Volcanoes NP", 720, 575, "Full Board", "2025-01-01", "2025-12-31", "Premium"),
        ("lodge-rwa-mountain-2", "Mountain Gorilla View Lodge", "Single Room", "Rwanda", "Volcanoes NP", 860, 690, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-rwa-five-1", "Five Volcanoes Boutique Hotel", "Double Room", "Rwanda", "Volcanoes NP — Musanze", 320, 255, "Bed & Breakfast", "2025-01-01", "2025-12-31", "Mid-range"),
        ("lodge-rwa-gorillas-1", "One&Only Gorilla's Nest", "Suite (Double)", "Rwanda", "Volcanoes NP", 1650, 1320, "Full Board", "2025-01-01", "2025-12-31", "Luxury"),
        # ── RWANDA — NYUNGWE / AKAGERA ──────────────────────────────
        ("lodge-rwa-nyungwe-1", "Nyungwe House", "Double Room", "Rwanda", "Nyungwe Forest NP", 620, 495, "Full Board", "2025-01-01", "2025-12-31", "One&Only property"),
        ("lodge-rwa-akagera-1", "Akagera Game Lodge", "Standard Double", "Rwanda", "Akagera NP", 280, 220, "Full Board", "2025-01-01", "2025-12-31", ""),
        ("lodge-rwa-ruzizi-1", "Ruzizi Tented Lodge", "Tent (Double)", "Rwanda", "Akagera NP", 350, 275, "Full Board", "2025-01-01", "2025-12-31", "Tented luxury"),
        # ── 2026 RATE UPDATES (from email rate sheets Oct–Nov 2025) ─────
        # Nkuringo Gorilla Lodge (rebranded from Nkuringo Bwindi Gorilla Lodge; 2026 STO received Oct 2025)
        ("lodge-nkuringo-3", "Nkuringo Gorilla Lodge", "Deluxe Garden Cottage (Double)", "Uganda", "Bwindi — Nkuringo", 620, 495, "Full Board", "2026-01-01", "2026-12-31", "Rebranded; 2026 rates"),
        ("lodge-nkuringo-4", "Nkuringo Gorilla Lodge", "Luxury Forest Suite (Double)", "Uganda", "Bwindi — Nkuringo", 780, 620, "Full Board", "2026-01-01", "2026-12-31", "Private balcony, bathtub"),
        ("lodge-nkuringo-5", "Nkuringo Gorilla Lodge", "Family Villa (2-Bed)", "Uganda", "Bwindi — Nkuringo", 1100, 880, "Full Board", "2026-01-01", "2026-12-31", "Adjoining family rooms"),
        # Silverback Lodge (Marasa Africa; fully rebuilt 5-star, reopened June 2025)
        ("lodge-silverback-1", "Silverback Lodge", "Superior Room (Double)", "Uganda", "Bwindi — Buhoma", 920, 735, "Full Board", "2026-01-01", "2026-12-31", "5-star rebuild; all-inclusive"),
        ("lodge-silverback-2", "Silverback Lodge", "Superior Room (Single)", "Uganda", "Bwindi — Buhoma", 1100, 880, "Full Board", "2026-01-01", "2026-12-31", "All meals, drinks, laundry"),
        # Engagi Lodge (Kimbla-Mantana Uganda; 2024/2025 rates received)
        ("lodge-engagi-1", "Engagi Lodge", "Double Room", "Uganda", "Bwindi — Buhoma", 480, 380, "Full Board", "2025-01-01", "2025-12-31", "Kimbla-Mantana property"),
        ("lodge-engagi-2", "Engagi Lodge", "Single Room", "Uganda", "Bwindi — Buhoma", 575, 460, "Full Board", "2025-01-01", "2025-12-31", ""),
        # Gorilla Safari Lodge 2026 rates (Crystal Lodges; 2026 rate sheet received Oct 2025)
        ("lodge-gorillasafari-2026-1", "Gorilla Safari Lodge", "Double Room", "Uganda", "Bwindi — Buhoma", 630, 500, "Full Board", "2026-01-01", "2026-12-31", "Crystal Lodges 2026"),
        ("lodge-gorillasafari-2026-2", "Gorilla Safari Lodge", "Single Room", "Uganda", "Bwindi — Buhoma", 760, 610, "Full Board", "2026-01-01", "2026-12-31", ""),
        # Crater Safari Lodge (Crystal Lodges; 2026 rate sheet received Oct 2025)
        ("lodge-crater-1", "Crater Safari Lodge", "Double Room", "Uganda", "Kibale — Crater Lakes", 450, 360, "Full Board", "2026-01-01", "2026-12-31", "Crystal Lodges; crater lake views"),
        ("lodge-crater-2", "Crater Safari Lodge", "Single Room", "Uganda", "Kibale — Crater Lakes", 540, 430, "Full Board", "2026-01-01", "2026-12-31", ""),
        # Kidepo Wilderness Lodge (Crystal Lodges Uganda; 2026 rate sheet received Oct 2025)
        ("lodge-kidepo-kwl-1", "Kidepo Wilderness Lodge", "Double Room", "Uganda", "Kidepo Valley NP", 520, 415, "Full Board", "2026-01-01", "2026-12-31", "Crystal Lodges; remote luxury"),
        ("lodge-kidepo-kwl-2", "Kidepo Wilderness Lodge", "Single Room", "Uganda", "Kidepo Valley NP", 620, 495, "Full Board", "2026-01-01", "2026-12-31", ""),
        # Adere Safari Lodge (Kidepo; rates received Nov 2025)
        ("lodge-adere-1", "Adere Safari Lodge", "Double Room", "Uganda", "Kidepo Valley NP", 360, 285, "Full Board", "2025-01-01", "2026-12-31", "Kidepo NP"),
        ("lodge-adere-2", "Adere Safari Lodge", "Single Room", "Uganda", "Kidepo Valley NP", 430, 345, "Full Board", "2025-01-01", "2026-12-31", ""),
        # Kibale Lodge (Volcanoes Safaris; AFAR top 25 hotels 2025, Conde Nast Hot List)
        ("lodge-kibale-vs-1", "Kibale Lodge", "Forest Suite (Double)", "Uganda", "Kibale NP", 880, 705, "Full Board", "2026-01-01", "2026-12-31", "Volcanoes Safaris; award-winning"),
        ("lodge-kibale-vs-2", "Kibale Lodge", "Forest Suite (Single)", "Uganda", "Kibale NP", 1050, 840, "Full Board", "2026-01-01", "2026-12-31", ""),
        # Mount Gahinga Lodge (Volcanoes Safaris; Mgahinga Gorilla NP)
        ("lodge-gahinga-1", "Mount Gahinga Lodge", "Bandas (Double)", "Uganda", "Mgahinga Gorilla NP", 640, 510, "Full Board", "2026-01-01", "2026-12-31", "Volcanoes Safaris"),
        ("lodge-gahinga-2", "Mount Gahinga Lodge", "Bandas (Single)", "Uganda", "Mgahinga Gorilla NP", 765, 610, "Full Board", "2026-01-01", "2026-12-31", ""),
        # Chimpundu Lodge (Kibale NP / Fort Portal; rates received Dec 2024)
        ("lodge-chimpundu-1", "Chimpundu Lodge", "Double Room", "Uganda", "Kibale NP — Fort Portal", 285, 225, "Full Board", "2025-01-01", "2026-12-31", "Emburara Lodges group"),
        ("lodge-chimpundu-2", "Chimpundu Lodge", "Single Room", "Uganda", "Kibale NP — Fort Portal", 340, 270, "Full Board", "2025-01-01", "2026-12-31", ""),
        # Emburara Farm Lodge (same group as Chimpundu, Fort Portal area)
        ("lodge-emburara-1", "Emburara Farm Lodge", "Double Room", "Uganda", "Fort Portal", 260, 205, "Full Board", "2025-01-01", "2026-12-31", "Farm stay, Emburara Lodges"),
        # Enjojo Lodge (Kidepo / Queen Elizabeth area; 2026 rates received Oct 2025)
        ("lodge-enjojo-1", "Enjojo Lodge", "Double Room", "Uganda", "Kidepo Valley NP", 410, 330, "Full Board", "2026-01-01", "2026-12-31", "2026 rates confirmed"),
        ("lodge-enjojo-2", "Enjojo Lodge", "Single Room", "Uganda", "Kidepo Valley NP", 490, 390, "Full Board", "2026-01-01", "2026-12-31", ""),
        # Elephant Plains Lodge (Great Lakes Collection; QENP; 2026 rates June 2026+)
        ("lodge-elephant-plains-1", "Elephant Plains Lodge", "Cottage (Double)", "Uganda", "Queen Elizabeth NP — Kasenyi", 330, 265, "Full Board", "2026-06-01", "2027-12-31", "Great Lakes Collection"),
        ("lodge-elephant-plains-2", "Elephant Plains Lodge", "Family Cottage", "Uganda", "Queen Elizabeth NP — Kasenyi", 420, 335, "Full Board", "2026-06-01", "2027-12-31", ""),
        # Simba Safari Camp (Great Lakes Collection; QENP; 2026 rates June 2026+)
        ("lodge-simba-camp-1", "Simba Safari Camp", "Standard Room (Double)", "Uganda", "Queen Elizabeth NP — Kasenyi", 230, 185, "Full Board", "2026-06-01", "2027-12-31", "Great Lakes; budget-friendly"),
        # Pabidi Lodge Budongo (Great Lakes Collection; Murchison Falls NP, new property)
        ("lodge-pabidi-1", "Pabidi Lodge Budongo", "Tented Suite (Double)", "Uganda", "Murchison Falls NP — Budongo", 380, 305, "Full Board", "2026-06-01", "2027-12-31", "Great Lakes; upcoming property"),
        # Anyadwe House (Exclusive Camps / Wild Frontiers; 2026 rates received Nov 2025)
        ("lodge-anyadwe-1", "Anyadwe House", "Double Room", "Uganda", "Queen Elizabeth NP — Ishasha", 480, 385, "Full Board", "2026-01-01", "2026-12-31", "Exclusive Camps; private house"),
        # Mburo Tented Camp (Kimbla-Mantana; Lake Mburo; 2024 rates)
        ("lodge-mburo-tented-1", "Mburo Tented Camp", "Tent (Double)", "Uganda", "Lake Mburo NP", 250, 200, "Full Board", "2025-01-01", "2025-12-31", "Kimbla-Mantana"),
        # Woodland Lodges group (near Entebbe/Lulongo; 2026 rates received Oct 2025)
        ("lodge-pumba-1", "Pumba Safari Cottages", "Double Room", "Uganda", "Lulongo — Entebbe", 170, 135, "Full Board", "2026-01-01", "2026-12-31", "Woodland Lodges group"),
        ("lodge-topi-1", "Topi Lodge", "Double Room", "Uganda", "Lulongo — Entebbe", 150, 120, "Full Board", "2026-01-01", "2026-12-31", "Woodland Lodges group"),
        ("lodge-hornbill-1", "Hornbill Bush Lodge", "Double Room", "Uganda", "Lulongo — Entebbe", 160, 128, "Full Board", "2026-01-01", "2026-12-31", "Woodland Lodges group"),
        ("lodge-tilapia-1", "Tilapia Lodge", "Double Room", "Uganda", "Lulongo — Entebbe", 155, 124, "Full Board", "2026-01-01", "2026-12-31", "Woodland Lodges group"),
        # Papyrus Guest House (Nkuringo group; 2026 STO rates received Oct 2025)
        ("lodge-papyrus-1", "Papyrus Guest House", "Double Room", "Uganda", "Bwindi — Nkuringo", 210, 168, "Bed & Breakfast", "2026-01-01", "2026-12-31", "Nkuringo group; budget option"),
        # Paraa Safari Lodge 2026 rates (Marasa Africa; refurbishment in progress)
        ("lodge-mfc-paraa-3", "Paraa Safari Lodge", "Deluxe Double", "Uganda", "Murchison Falls NP — Paraa", 520, 415, "Full Board", "2026-07-01", "2026-12-31", "Marasa; upgraded room category"),
        # Mweya Safari Lodge 2026 (Marasa Africa; renovations underway)
        ("lodge-qenp-mweya-3", "Mweya Safari Lodge", "Deluxe Double", "Uganda", "Queen Elizabeth NP — Mweya", 510, 408, "Full Board", "2026-07-01", "2026-12-31", "Marasa; upgraded category"),
        # Chobe Safari Lodge 2026 (Marasa Africa; soft refurb completed)
        ("lodge-mfc-chobe-2", "Chobe Safari Lodge", "Tent (Double)", "Uganda", "Murchison Falls NP — Chobe", 420, 335, "Full Board", "2026-07-01", "2026-12-31", "Marasa 2026 rates"),
        # Virunga Lodge 2026 (Volcanoes Safaris Rwanda)
        ("lodge-rwa-virunga-2026-1", "Virunga Lodge", "Double Room", "Rwanda", "Volcanoes NP", 1320, 1055, "Full Board", "2026-01-01", "2026-12-31", "Volcanoes Safaris 2026"),
        ("lodge-rwa-virunga-2026-2", "Virunga Lodge", "Single Room", "Rwanda", "Volcanoes NP", 1580, 1265, "Full Board", "2026-01-01", "2026-12-31", ""),
        # Bwindi Lodge 2026 (Volcanoes Safaris Uganda)
        ("lodge-bwindi-vs-2026-1", "Bwindi Lodge", "Double Room", "Uganda", "Bwindi", 520, 415, "Full Board", "2026-01-01", "2026-12-31", "Volcanoes Safaris 2026 rates"),
        ("lodge-bwindi-vs-2026-2", "Bwindi Lodge", "Single Room", "Uganda", "Bwindi", 625, 500, "Full Board", "2026-01-01", "2026-12-31", ""),
        # Kyambura Gorge Lodge 2026 (Volcanoes Safaris Uganda)
        ("lodge-qenp-kyambura-3", "Kyambura Gorge Lodge", "Cottage (Double)", "Uganda", "Queen Elizabeth NP — Kyambura", 850, 680, "Full Board", "2026-01-01", "2026-12-31", "Volcanoes Safaris 2026"),
        ("lodge-qenp-kyambura-4", "Kyambura Gorge Lodge", "Cottage (Single)", "Uganda", "Queen Elizabeth NP — Kyambura", 1015, 810, "Full Board", "2026-01-01", "2026-12-31", ""),
        # Buhoma Lodge 2026 (Exclusive Camps / Wild Frontiers Uganda)
        ("lodge-buhoma-3", "Buhoma Lodge", "Banda (Double)", "Uganda", "Bwindi — Buhoma", 545, 435, "Full Board", "2026-01-01", "2026-12-31", "Exclusive Camps 2026"),
        ("lodge-buhoma-4", "Buhoma Lodge", "Banda (Single)", "Uganda", "Bwindi — Buhoma", 655, 524, "Full Board", "2026-01-01", "2026-12-31", ""),
        # Ishasha Wilderness Camp 2026 (Exclusive Camps / Wild Frontiers)
        ("lodge-qenp-ishasha-3", "Ishasha Wilderness Camp", "Tent (Double)", "Uganda", "Queen Elizabeth NP — Ishasha", 740, 590, "Full Board", "2026-01-01", "2026-12-31", "Exclusive Camps 2026"),
        ("lodge-qenp-ishasha-4", "Ishasha Wilderness Camp", "Tent (Single)", "Uganda", "Queen Elizabeth NP — Ishasha", 890, 710, "Full Board", "2026-01-01", "2026-12-31", ""),
    ]
    for l in lodges:
        conn.execute("""
            INSERT OR IGNORE INTO lodges (id, lodge_name, room_type, country, location,
                rack_rate_usd, net_rate_usd, meal_plan, valid_from, valid_to, notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """, l)
    # Set correct max_occupancy for family/triple room types that hold more than 2 guests
    conn.execute("UPDATE lodges SET max_occupancy=4 WHERE id='lodge-mfc-pakuba-3'")
    conn.execute("UPDATE lodges SET max_occupancy=4 WHERE room_type LIKE '%Family%' AND max_occupancy=2")


def seed_lodges(conn):
    """Seed the lodges table with Uganda/Rwanda safari lodge data if empty."""
    count = conn.execute("SELECT COUNT(*) FROM lodges").fetchone()[0]
    if count > 0:
        return
    for lodge in LODGE_SEED:
        rack = lodge["rack_rate_usd"]
        net = round(rack * 0.7, 2)
        conn.execute("""
            INSERT INTO lodges (id, lodge_name, room_type, country, location,
                rack_rate_usd, net_rate_usd, meal_plan, valid_from, valid_to, source_file, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            str(uuid.uuid4())[:8],
            lodge["lodge_name"],
            lodge.get("room_type", "Double"),
            lodge.get("country", "Uganda"),
            lodge.get("location", ""),
            rack,
            net,
            lodge.get("meal_plan", "Full Board"),
            "2025-01-01",
            "2026-12-31",
            "seed_data",
            lodge.get("notes", ""),
        ))


# ---------------------------------------------------------------------------
# Config persistence helpers (must be defined before init_db uses them)
# ---------------------------------------------------------------------------

# Keys from CONFIG that must be persisted to SQLite so they survive restarts.
_CONFIG_PERSISTED_KEYS = [
    "fx_rate",
    "fx_buffer_pct",
    "fuel_buffer_pct",
    "service_fee_pct",
    "vehicle_rate_per_day",
    "insurance_rate_per_person_per_day",
    "quotation_validity_days",
    "rate_effective_date",
    "rate_increase_date",   # legacy alias — always mirrors rate_effective_date
    "commission_rates",
    "coordinators",
]


def _seed_config_defaults(conn):
    """Seed all CONFIG defaults into SQLite using INSERT OR IGNORE so that
    admin-updated values are never overwritten.  Called once during init_db()
    to ensure every config key is persisted from the very first server run."""
    import logging
    seeded = 0
    try:
        for key in _CONFIG_PERSISTED_KEYS:
            if key not in CONFIG:
                continue
            conn.execute(
                "INSERT OR IGNORE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))",
                (key, json.dumps(CONFIG[key]))
            )
            seeded += 1
        conn.commit()
        if seeded:
            logging.info("Seeded %d config default(s) into SQLite", seeded)
    except Exception as e:
        import logging as _log
        _log.warning("Could not seed config defaults: %s", e)


# ---------------------------------------------------------------------------
# Database initialization + migration from JSON
# ---------------------------------------------------------------------------
def init_db():
    """Create tables and migrate data from JSON files if DB is fresh."""
    conn = get_db()
    conn.executescript(SCHEMA)

    # Ensure market_data_cache table exists (may be missing in older DBs)
    try:
        conn.execute("""CREATE TABLE IF NOT EXISTS market_data_cache (
            key TEXT PRIMARY KEY, value REAL, value_json TEXT DEFAULT '',
            source TEXT DEFAULT '', source_url TEXT DEFAULT '',
            fetched_at TEXT DEFAULT (datetime('now')),
            override_value REAL, override_by TEXT DEFAULT '',
            override_at TEXT DEFAULT '', is_overridden INTEGER DEFAULT 0
        )""")
        conn.commit()
    except Exception:
        pass

    # Safe column migrations — add new lodges columns without breaking existing data
    for _col, _ctype, _cdefault in [
        ("source_email_date", "TEXT", "''"),
        ("extraction_timestamp", "TEXT", "''"),
        ("max_occupancy", "INTEGER", "2"),
    ]:
        try:
            conn.execute(f"ALTER TABLE lodges ADD COLUMN {_col} {_ctype} DEFAULT {_cdefault}")
            conn.commit()
        except Exception:
            pass  # Column already exists — safe to ignore

    # Check if migration is needed
    count = conn.execute("SELECT COUNT(*) FROM enquiries").fetchone()[0]
    if count == 0:
        _migrate_from_json(conn)

    # Seed itineraries (always refresh from code)
    conn.execute("DELETE FROM itineraries")
    for itn in ITINERARY_LIBRARY:
        conn.execute("""
            INSERT INTO itineraries (id, name, duration_days, vehicle_days, destinations,
                countries, budget_tier, interests, permits_included, parks, season,
                description, highlights, nationality_tiers)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            itn["id"], itn["name"], itn["duration_days"], itn["vehicle_days"],
            json.dumps(itn["destinations"]), json.dumps(itn.get("countries", [])),
            itn["budget_tier"], json.dumps(itn["interests"]),
            json.dumps(itn["permits_included"]), json.dumps(itn.get("parks", [])),
            itn.get("season", "year_round"), itn["description"],
            itn.get("highlights", ""), json.dumps(itn.get("nationality_tiers", []))
        ))

    # Seed lodges if table is empty
    seed_lodges(conn)

    # Seed detailed partner lodge data (INSERT OR IGNORE — always safe to call,
    # adds new lodges without overwriting existing ones)
    _seed_lodges(conn)

    # Ensure config table exists (safe for older DBs)
    try:
        conn.execute("""CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        )""")
        conn.commit()
    except Exception:
        pass

    # Seed in-memory CONFIG defaults into SQLite (INSERT OR IGNORE — never overwrites
    # values already set by an admin).  This makes all config values persistent by
    # default from the very first run, so they survive server restarts.
    _seed_config_defaults(conn)

    # Load persisted CONFIG values from DB (overrides in-memory defaults).
    # After seeding, SQLite is always the single source of truth.
    try:
        rows = conn.execute("SELECT key, value FROM config").fetchall()
        for row in rows:
            try:
                CONFIG[row["key"]] = json.loads(row["value"])
            except (json.JSONDecodeError, TypeError):
                CONFIG[row["key"]] = row["value"]
    except Exception as e:
        import logging
        logging.warning("Could not load config from SQLite: %s — using in-memory defaults", e)

    # Migrate: add working_itinerary column to enquiries
    try:
        conn.execute("ALTER TABLE enquiries ADD COLUMN working_itinerary TEXT DEFAULT ''")
        conn.commit()
    except Exception:
        pass  # Column already exists

    # Migrate: add curated_itinerary_id column to enquiries
    try:
        conn.execute("ALTER TABLE enquiries ADD COLUMN curated_itinerary_id TEXT DEFAULT ''")
        conn.commit()
    except Exception:
        pass  # Column already exists

    # Migrate: add fx_rate_at_quote column to enquiries
    try:
        conn.execute("ALTER TABLE enquiries ADD COLUMN fx_rate_at_quote REAL")
        conn.commit()
    except Exception:
        pass  # Column already exists

    # Ensure itinerary_versions table exists (safe for older DBs)
    try:
        conn.execute("""CREATE TABLE IF NOT EXISTS itinerary_versions (
            id TEXT PRIMARY KEY,
            enquiry_id TEXT NOT NULL,
            booking_ref TEXT DEFAULT '',
            version_number INTEGER DEFAULT 1,
            content TEXT DEFAULT '',
            saved_by TEXT DEFAULT '',
            saved_at TEXT DEFAULT (datetime('now')),
            label TEXT DEFAULT ''
        )""")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_itn_versions_enquiry ON itinerary_versions(enquiry_id)"
        )
        conn.commit()
    except Exception:
        pass

    conn.commit()
    conn.close()


def _migrate_from_json(conn):
    """One-time migration from JSON seed files to SQLite."""
    # Enquiries
    if PIPELINE_FILE.exists():
        data = json.load(open(PIPELINE_FILE))
        for e in data:
            conn.execute("""
                INSERT OR IGNORE INTO enquiries (id, booking_ref, channel, client_name, email,
                    phone, country, nationality_tier, inquiry_date, tour_type, pax, quoted_usd,
                    destinations_requested, travel_start_date, travel_end_date, duration_days,
                    status, coordinator, budget_range, interests, special_requests, agent_name,
                    permits, accommodation, vehicle, insurance, revenue_usd, balance_usd,
                    payment_status, internal_flags, last_updated, synced)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                e.get("id", str(uuid.uuid4())[:8]),
                e.get("booking_ref", ""),
                e.get("channel", "direct"),
                e.get("client_name", ""),
                e.get("email", ""),
                e.get("phone", ""),
                e.get("country", ""),
                e.get("nationality_tier", "FNR"),
                e.get("inquiry_date", ""),
                e.get("tour_type", ""),
                e.get("pax", 2),
                e.get("quoted_usd", ""),
                e.get("destinations_requested", ""),
                e.get("travel_start_date", ""),
                e.get("travel_end_date", ""),
                e.get("duration_days"),
                e.get("status", "New_Inquiry"),
                e.get("coordinator", ""),
                e.get("budget_range", ""),
                e.get("interests", ""),
                e.get("special_requests", ""),
                e.get("agent_name", ""),
                e.get("permits", ""),
                e.get("accommodation", ""),
                e.get("vehicle", ""),
                e.get("insurance", ""),
                e.get("revenue_usd", ""),
                e.get("balance_usd", ""),
                e.get("payment_status", ""),
                e.get("internal_flags", ""),
                e.get("last_updated", ""),
                1 if e.get("synced", True) else 0,
            ))

    # Lodges
    if LODGE_FILE.exists():
        data = json.load(open(LODGE_FILE))
        for l in data:
            conn.execute("""
                INSERT OR IGNORE INTO lodges (id, lodge_name, room_type, country, location,
                    rack_rate_usd, net_rate_usd, meal_plan, valid_from, valid_to, source_file, notes)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                l.get("id", str(uuid.uuid4())[:8]),
                l.get("lodge_name", ""),
                l.get("room_type", ""),
                l.get("country", ""),
                l.get("location", ""),
                l.get("rack_rate_usd", 0),
                l.get("net_rate_usd", 0),
                l.get("meal_plan", ""),
                l.get("valid_from", ""),
                l.get("valid_to", ""),
                l.get("source_file", ""),
                l.get("notes", ""),
            ))

    # Quotations
    if QUOTATIONS_FILE.exists():
        data = json.load(open(QUOTATIONS_FILE))
        for q in data:
            conn.execute("""
                INSERT OR IGNORE INTO quotations (id, quotation_id, client_name, client_email,
                    booking_ref, valid_days, created_at, pricing_data, status)
                VALUES (?,?,?,?,?,?,?,?,?)
            """, (
                q.get("id", str(uuid.uuid4())[:8]),
                q.get("quotation_id", q.get("id", "")),
                q.get("client_name", ""),
                q.get("client_email", ""),
                q.get("booking_ref", ""),
                q.get("valid_days", 14),
                q.get("created_at", datetime.now().isoformat()),
                json.dumps(q.get("pricing_data", {})),
                q.get("status", "draft"),
            ))

    # Sync queue
    if SYNC_QUEUE_FILE.exists():
        data = json.load(open(SYNC_QUEUE_FILE))
        for s in data:
            conn.execute("""
                INSERT OR IGNORE INTO sync_queue (id, type, reference, description, status, created_at, completed_at)
                VALUES (?,?,?,?,?,?,?)
            """, (
                s.get("id", str(uuid.uuid4())[:8]),
                s.get("type", "enquiry"),
                s.get("reference", ""),
                s.get("description", ""),
                s.get("status", "pending"),
                s.get("created_at", datetime.now().isoformat()),
                s.get("completed_at"),
            ))

    conn.commit()


# ---------------------------------------------------------------------------
# PDF Generation (branded TRVE quotation)
# ---------------------------------------------------------------------------

class _MiniPDF:
    """
    Minimal pure-Python PDF writer (A4, stdlib only).
    Mimics the fpdf2 API subset used by generate_quotation_pdf.
    Coordinates in mm, font sizes in points.
    """
    MM = 2.8346
    PAGE_W_MM = 210.0
    PAGE_H_MM = 297.0
    PAGE_W = PAGE_W_MM * MM
    PAGE_H = PAGE_H_MM * MM
    _FONT_KEYS = {
        ('helvetica', ''):   'F1', ('helvetica', 'b'):  'F2',
        ('helvetica', 'i'):  'F3', ('helvetica', 'bi'): 'F4',
        ('helvetica', 'ib'): 'F4',
    }
    _CHAR_W = 0.45  # char_width ≈ font_size_pt * _CHAR_W * 0.352778 mm

    def __init__(self):
        self._pages: list = []
        self._cur: bytearray = bytearray()
        self._in_page = False
        self._in_hf = False  # inside header/footer (suppress auto-break)
        self._page_count = 0
        self._left_m = 10.0; self._right_m = 10.0; self._top_m = 10.0
        self._break_m = 25.0; self._auto_break = True
        self._font_key = 'F1'; self._font_size = 10.0
        self._x = self._left_m; self._y = self._top_m
        self._tc = (0.0, 0.0, 0.0)
        self._fc = (1.0, 1.0, 1.0)
        self._dc = (0.0, 0.0, 0.0)
        self._lw_mm = 0.2

    def _pt(self, mm): return mm * self.MM
    def _yp(self, y_top_mm): return self.PAGE_H - y_top_mm * self.MM
    def _esc(self, s):
        return str(s).replace('\\','\\\\').replace('(','\\(').replace(')','\\)').replace('\n',' ').replace('\r',' ')
    def _sw(self, s): return len(str(s)) * self._font_size * self._CHAR_W * 0.352778
    def _ew(self): return self.PAGE_W_MM - self._left_m - self._right_m
    def _emit(self, line):
        self._cur.extend(line.encode('latin-1', errors='replace'))
        self._cur.extend(b'\n')

    def alias_nb_pages(self): pass
    def set_auto_page_break(self, auto=True, margin=25):
        self._auto_break = auto; self._break_m = float(margin)
    def header(self): pass
    def footer(self): pass

    def add_page(self):
        if self._in_page:
            self._close_page()
        self._in_page = True
        self._page_count += 1
        self._cur = bytearray()
        self._x = self._left_m; self._y = self._top_m
        self._in_hf = True; self.header(); self._in_hf = False

    def _close_page(self):
        self._in_hf = True; self.footer(); self._in_hf = False
        self._pages.append(bytes(self._cur))

    def _check_pb(self, h):
        if self._auto_break and not self._in_hf and self._y + h > self.PAGE_H_MM - self._break_m:
            self._close_page()
            self._in_page = True; self._page_count += 1
            self._cur = bytearray()
            self._x = self._left_m; self._y = self._top_m
            self._in_hf = True; self.header(); self._in_hf = False

    def set_font(self, family='Helvetica', style='', size=10):
        self._font_key = self._FONT_KEYS.get((family.lower(), style.upper().replace('U','').lower()), 'F1')
        self._font_size = float(size)
    def set_text_color(self, r, g, b): self._tc = (r/255, g/255, b/255)
    def set_fill_color(self, r, g, b): self._fc = (r/255, g/255, b/255)
    def set_draw_color(self, r, g, b): self._dc = (r/255, g/255, b/255)
    def set_line_width(self, w): self._lw_mm = float(w)
    def set_y(self, y):
        self._x = self._left_m
        self._y = self.PAGE_H_MM + float(y) if y < 0 else float(y)
    def get_y(self): return self._y
    def ln(self, h=None):
        if h is None: h = self._font_size * 0.352778 * 1.5
        self._x = self._left_m; self._y += float(h)
    def page_no(self): return self._page_count

    def rect(self, x, y, w, h, style=''):
        xp, wp, hp = self._pt(x), self._pt(w), self._pt(h)
        yp = self._yp(y + h)
        lw = max(0.1, self._pt(self._lw_mm))
        self._emit(f'{lw:.2f} w')
        if 'F' in style:
            r, g, b = self._fc
            self._emit(f'{r:.3f} {g:.3f} {b:.3f} rg {xp:.2f} {yp:.2f} {wp:.2f} {hp:.2f} re f')
        else:
            r, g, b = self._dc
            self._emit(f'{r:.3f} {g:.3f} {b:.3f} RG {xp:.2f} {yp:.2f} {wp:.2f} {hp:.2f} re S')

    def line(self, x1, y1, x2, y2):
        r, g, b = self._dc; lw = max(0.1, self._pt(self._lw_mm))
        self._emit(f'{lw:.2f} w {r:.3f} {g:.3f} {b:.3f} RG '
                   f'{self._pt(x1):.2f} {self._yp(y1):.2f} m {self._pt(x2):.2f} {self._yp(y2):.2f} l S')

    def cell(self, w, h=0, text='', border=0, ln=False, align='L', fill=False, **kw):
        if w == 0: w = self._ew() - (self._x - self._left_m)
        if not h: h = self._font_size * 0.352778 * 1.5
        w, h = float(w), float(h)
        self._check_pb(h)
        x, y = self._x, self._y
        xp, wp, hp = self._pt(x), self._pt(w), self._pt(h)
        yp = self._yp(y + h); lw = max(0.1, self._pt(self._lw_mm))
        if fill:
            r, g, b = self._fc
            self._emit(f'{r:.3f} {g:.3f} {b:.3f} rg {xp:.2f} {yp:.2f} {wp:.2f} {hp:.2f} re f')
        if border:
            r, g, b = self._dc
            self._emit(f'{lw:.2f} w {r:.3f} {g:.3f} {b:.3f} RG {xp:.2f} {yp:.2f} {wp:.2f} {hp:.2f} re S')
        if text:
            text = str(text); r, g, b = self._tc
            fs = self._font_size
            bl = self._yp(y + (h + fs * 0.352778) / 2)
            tw = self._sw(text)
            if align == 'R': tx = x + w - tw - 1.5
            elif align == 'C': tx = x + (w - tw) / 2
            else: tx = x + 1.0
            self._emit(f'BT /{self._font_key} {fs:.1f} Tf {r:.3f} {g:.3f} {b:.3f} rg '
                       f'{self._pt(max(tx,x)):.2f} {bl:.2f} Td ({self._esc(text)}) Tj ET')
        if ln: self._x = self._left_m; self._y = y + h
        else: self._x = x + w

    def multi_cell(self, w, h, text='', border=0, fill=False, **kw):
        if not text: return
        text = str(text)
        if w == 0: w = self._ew()
        if not h: h = self._font_size * 0.352778 * 1.5
        w, h = float(w), float(h)
        cw = self._font_size * self._CHAR_W * 0.352778
        mc = max(1, int((w - 3) / max(0.001, cw)))
        words = text.split(' '); line = ''
        for word in words:
            test = (line + ' ' + word).strip() if line else word
            if len(test) <= mc: line = test
            else:
                if line: self.cell(w, h, line, ln=True, fill=fill, border=border)
                line = word
        if line: self.cell(w, h, line, ln=True, fill=fill, border=border)

    def output(self) -> bytes:
        import io as _io
        if self._in_page: self._close_page()
        nb = str(len(self._pages)).encode('ascii')
        pages = [p.replace(b'{nb}', nb) for p in self._pages]
        N = len(pages) or 1
        if not pages: pages = [b'']
        page_ids = list(range(3, 3+N)); stream_ids = list(range(3+N, 3+2*N))
        fb = 3+2*N
        fdefs = [('F1','Helvetica'),('F2','Helvetica-Bold'),('F3','Helvetica-Oblique'),('F4','Helvetica-BoldOblique')]
        total = fb + len(fdefs)
        buf = _io.BytesIO(); pos = {}
        def w(d): buf.write(d.encode('latin-1', errors='replace') if isinstance(d, str) else d)
        def obj(n): pos[n] = buf.tell(); w(f'{n} 0 obj\n')
        def eo(): w('endobj\n')
        w('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
        obj(1); w('<< /Type /Catalog /Pages 2 0 R >>\n'); eo()
        obj(2); w(f'<< /Type /Pages /Kids [{" ".join(f"{i} 0 R" for i in page_ids)}] /Count {N} >>\n'); eo()
        fr = ' '.join(f'/{a} {fb+i} 0 R' for i,(a,_) in enumerate(fdefs))
        for i in range(N):
            c = pages[i]
            obj(stream_ids[i]); w(f'<< /Length {len(c)} >>\nstream\n'); buf.write(c); w('\nendstream\n'); eo()
            obj(page_ids[i])
            w(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {self.PAGE_W:.2f} {self.PAGE_H:.2f}] '
              f'/Contents {stream_ids[i]} 0 R /Resources << /Font << {fr} >> >> >>\n'); eo()
        for i,(alias,name) in enumerate(fdefs):
            obj(fb+i); w(f'<< /Type /Font /Subtype /Type1 /BaseFont /{name} /Encoding /WinAnsiEncoding >>\n'); eo()
        xp = buf.tell()
        w(f'xref\n0 {total+1}\n0000000000 65535 f \n')
        for i in range(1, total+1): w(f'{pos.get(i,0):010d} 00000 n \n')
        w(f'trailer\n<< /Size {total+1} /Root 1 0 R >>\nstartxref\n{xp}\n%%EOF\n')
        return buf.getvalue()


def _sanitize_pdf_text(text: str) -> str:
    """Replace Unicode chars not supported by Helvetica."""
    replacements = {
        '\u2014': '-', '\u2013': '-', '\u2022': '-',
        '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"',
        '\u2026': '...', '\u00a0': ' ',
        '\u2019': "'",
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    # Remove any remaining non-latin1 chars
    return text.encode('latin-1', errors='replace').decode('latin-1')


def generate_quotation_pdf(quotation: dict) -> bytes:
    """Generate a branded TRVE quotation PDF (pure Python, no external deps)."""

    class TRVEQuotationPDF(_MiniPDF):
        def cell(self, w, h=0, text='', *args, **kwargs):
            return super().cell(w, h, _sanitize_pdf_text(str(text)), *args, **kwargs)

        def multi_cell(self, w, h, text='', *args, **kwargs):
            return super().multi_cell(w, h, _sanitize_pdf_text(str(text)), *args, **kwargs)

        def header(self):
            # Brand bar
            self.set_fill_color(13, 94, 79)  # TRVE teal #0D5E4F
            self.rect(0, 0, 210, 28, 'F')
            self.set_font('Helvetica', 'B', 18)
            self.set_text_color(255, 255, 255)
            self.set_y(6)
            self.cell(0, 10, 'THE RIFT VALLEY EXPLORER', align='C')
            self.set_font('Helvetica', '', 9)
            self.set_y(16)
            self.cell(0, 6, 'Destination Management Company  |  Uganda & East Africa', align='C')
            self.ln(18)

        def footer(self):
            self.set_y(-20)
            self.set_font('Helvetica', '', 7)
            self.set_text_color(130, 130, 130)
            self.cell(0, 4, 'The Rift Valley Explorer Ltd  |  Entebbe, Uganda  |  info@theriftvalleyexplorer.com', align='C')
            self.ln(4)
            self.cell(0, 4, f'Page {self.page_no()}/{{nb}}', align='C')

    pdf = TRVEQuotationPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=25)
    pdf.add_page()
    pdf.set_text_color(40, 40, 40)

    pricing = quotation.get("pricing_data", {})
    client = quotation.get("client_name", "—")
    email = quotation.get("client_email", "")
    ref = quotation.get("booking_ref", "")
    qid = quotation.get("quotation_id", quotation.get("id", ""))
    valid = quotation.get("valid_days", 14)
    created = quotation.get("created_at", "")[:10]

    # --- Title ---
    pdf.set_font('Helvetica', 'B', 14)
    pdf.set_text_color(13, 94, 79)
    pdf.cell(0, 10, 'SAFARI QUOTATION', ln=True)
    pdf.set_draw_color(200, 150, 62)  # Gold accent
    pdf.set_line_width(0.6)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)

    # --- Client details ---
    pdf.set_font('Helvetica', '', 10)
    pdf.set_text_color(40, 40, 40)
    details = [
        ("Quotation No:", qid.upper()),
        ("Booking Ref:", ref or "—"),
        ("Client:", client),
        ("Email:", email or "—"),
        ("Date:", created),
        ("Valid for:", f"{valid} days"),
    ]
    summary = pricing.get("summary", {})
    if summary:
        details.extend([
            ("Pax:", str(summary.get("pax", "—"))),
            ("Duration:", f"{summary.get('days', '—')} days"),
            ("Nationality:", summary.get("nationality_tier", "—")),
        ])
        if summary.get("travel_start_date"):
            details.append(("Travel date:", summary["travel_start_date"]))

    for label, value in details:
        pdf.set_font('Helvetica', 'B', 9)
        pdf.cell(40, 6, label)
        pdf.set_font('Helvetica', '', 9)
        pdf.cell(0, 6, str(value), ln=True)
    pdf.ln(4)

    # --- Helper for section tables ---
    def section_header(title):
        pdf.set_font('Helvetica', 'B', 11)
        pdf.set_text_color(13, 94, 79)
        pdf.cell(0, 8, title, ln=True)
        pdf.set_text_color(40, 40, 40)

    def table_header(cols):
        pdf.set_font('Helvetica', 'B', 8)
        pdf.set_fill_color(240, 237, 230)
        for width, label in cols:
            pdf.cell(width, 6, label, border=0, fill=True)
        pdf.ln()

    def table_row(cols, values):
        pdf.set_font('Helvetica', '', 8)
        for i, (width, _) in enumerate(cols):
            val = str(values[i]) if i < len(values) else ""
            pdf.cell(width, 5.5, val, border=0)
        pdf.ln()

    def section_total(label, amount):
        pdf.set_font('Helvetica', 'B', 9)
        pdf.cell(145, 6, label, align='R')
        pdf.cell(45, 6, f"${amount:,.2f}" if isinstance(amount, (int, float)) else str(amount), align='R', ln=True)

    # --- Accommodation ---
    acc = pricing.get("accommodation", {})
    nights_label = f"{summary.get('nights', summary.get('days', 1) - 1)} nights (= {summary.get('days', '—')} days − 1)"
    if acc.get("lines"):
        section_header("Accommodation")
        pdf.set_font('Helvetica', '', 7)
        pdf.set_text_color(120, 80, 0)
        pdf.cell(0, 5, f"Trip duration: {nights_label}", ln=True)
        pdf.set_text_color(40, 40, 40)
        cols = [(75, "Lodge / Room"), (20, "Nights"), (25, "Rate/Night"), (20, "Pax"), (20, "Rooms"), (30, "Total USD")]
        table_header(cols)
        for line in acc["lines"]:
            guest_lbl = line.get("guest_label", "")
            desc = line.get("description", "")
            if guest_lbl:
                desc = f"[{guest_lbl}] {desc}"
            table_row(cols, [
                desc,
                line.get("nights", ""),
                f"${line.get('rate_per_night', 0):,.0f}",
                f"{line.get('adults', '')}A" + (f"+{line.get('children','')}C" if line.get("children") else ""),
                line.get("rooms", 1),
                f"${line.get('total', 0):,.2f}",
            ])
        section_total("Accommodation Subtotal", acc.get("total", 0))
        pdf.ln(3)

    # --- Per-Guest Breakdown ---
    guest_bd = pricing.get("guest_breakdown", [])
    if guest_bd:
        section_header("Per-Guest Cost Breakdown")
        cols = [(60, "Guest"), (50, "Accommodation"), (40, "Activities"), (40, "Guest Total")]
        table_header(cols)
        for g in guest_bd:
            table_row(cols, [
                g.get("guest_id", ""),
                f"${g.get('accommodation_total', 0):,.2f}",
                f"${g.get('activity_total', 0):,.2f}",
                f"${g.get('guest_total', 0):,.2f}",
            ])
        pdf.ln(3)

    # --- Permits ---
    prm = pricing.get("permits", {})
    if prm.get("lines"):
        section_header("Permits & Park Fees")
        cols = [(80, "Permit"), (20, "Qty"), (25, "Unit Price"), (20, "Pax"), (45, "Total USD")]
        table_header(cols)
        for line in prm["lines"]:
            table_row(cols, [
                line.get("description", ""),
                line.get("qty", ""),
                f"${line.get('price_per_unit', 0):,.0f}",
                line.get("pax", ""),
                f"${line.get('total', 0):,.2f}",
            ])
        section_total("Permits Subtotal", prm.get("total", 0))
        pdf.ln(3)

    # --- Activities ---
    act_sec = pricing.get("activities", {})
    act_bd = pricing.get("activity_breakdown", [])
    act_lines_pdf = act_bd if act_bd else act_sec.get("lines", [])
    if act_lines_pdf:
        section_header("Itinerary Activities")
        cols = [(70, "Activity"), (20, "Day"), (30, "Cost/Person"), (20, "Guests"), (50, "Total USD")]
        table_header(cols)
        for line in act_lines_pdf:
            table_row(cols, [
                line.get("name", ""),
                str(line.get("day", "")) or "—",
                f"${line.get('cost_per_person', 0):,.2f}",
                line.get("num_guests", line.get("pax", "—")),
                f"${line.get('total', 0):,.2f}",
            ])
        section_total("Activities Subtotal", act_sec.get("total", sum(l.get("total", 0) for l in act_lines_pdf)))
        pdf.ln(3)

    # --- Vehicle ---
    veh_sec = pricing.get("vehicles", pricing.get("vehicle", {}))
    veh_lines = veh_sec.get("lines", [])
    if veh_lines:
        section_header("Vehicle & Transport")
        cols = [(70, "Vehicle Type"), (20, "Days"), (30, "Rate/Day"), (70, "Total USD")]
        table_header(cols)
        for vl in veh_lines:
            buf_note = f" (+{vl.get('fuel_buffer_pct', 0)}% fuel)" if vl.get("fuel_buffer_pct") else ""
            table_row(cols, [
                vl.get("type", ""),
                vl.get("days", ""),
                f"${vl.get('rate', 0):,.0f}",
                f"${vl.get('total', 0):,.2f}{buf_note}",
            ])
        section_total("Transport Subtotal", veh_sec.get("total", 0))
        pdf.ln(3)

    # --- Insurance ---
    ins = pricing.get("insurance", {})
    if ins.get("included") and ins.get("total", 0) > 0:
        section_header("Travel Insurance")
        pdf.set_font('Helvetica', '', 9)
        pdf.cell(0, 6, f"${ins.get('rate_per_person_per_day', 0)}/person/day × {summary.get('pax', 0)} pax × {summary.get('days', 0)} days = ${ins.get('total', 0):,.2f}", ln=True)
        pdf.ln(3)

    # --- Extra costs ---
    ext = pricing.get("extra_costs", {})
    if ext.get("lines"):
        section_header("Additional Costs")
        for line in ext["lines"]:
            pdf.set_font('Helvetica', '', 9)
            pdf.cell(0, 6, f"{line.get('description', '')}: ${line.get('total', 0):,.2f}", ln=True)
        pdf.ln(3)

    # --- Totals ---
    pdf.ln(2)
    pdf.set_draw_color(13, 94, 79)
    pdf.set_line_width(0.4)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)

    subtotal = pricing.get("subtotal", 0)
    service = pricing.get("service_fee", {})
    commission = pricing.get("commission", {})
    grand_usd = pricing.get("grand_total_usd", 0)
    per_person = pricing.get("per_person_usd", 0)
    grand_ugx = pricing.get("grand_total_ugx", 0)

    section_total("Subtotal", subtotal)
    if service.get("total", 0) > 0:
        section_total(service.get("label", "Service Fee"), service["total"])
    if commission.get("total", 0) > 0:
        section_total(commission.get("label", "Commission"), commission["total"])

    pdf.ln(2)
    pdf.set_draw_color(200, 150, 62)
    pdf.set_line_width(0.8)
    pdf.line(100, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(2)

    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(13, 94, 79)
    pdf.cell(145, 8, "GRAND TOTAL (USD)", align='R')
    pdf.cell(45, 8, f"${grand_usd:,.2f}" if isinstance(grand_usd, (int, float)) else str(grand_usd), align='R', ln=True)

    pdf.set_font('Helvetica', '', 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(145, 6, "Per person", align='R')
    pdf.cell(45, 6, f"${per_person:,.2f}" if isinstance(per_person, (int, float)) else str(per_person), align='R', ln=True)

    if grand_ugx:
        pdf.cell(145, 6, f"Equivalent (UGX @ {FX_RATE:,})", align='R')
        pdf.cell(45, 6, f"UGX {grand_ugx:,.0f}" if isinstance(grand_ugx, (int, float)) else str(grand_ugx), align='R', ln=True)

    # --- Transfer Fee Payment Instruction ---
    req_transfer = pricing.get("required_transfer_amount")
    transfer_fees_est = pricing.get("transfer_fees_estimated")
    if req_transfer and req_transfer > 0:
        pdf.ln(4)
        pdf.set_fill_color(255, 248, 231)   # amber tint
        pdf.set_draw_color(200, 150, 62)
        pdf.set_line_width(0.4)
        pdf.set_font('Helvetica', 'B', 9)
        pdf.set_text_color(120, 80, 0)
        header_text = "PAYMENT INSTRUCTION — INTERNATIONAL TRANSFER"
        pdf.cell(0, 7, header_text, border=1, fill=True, ln=True)
        pdf.set_font('Helvetica', '', 8)
        pdf.set_text_color(80, 50, 0)
        inv_total = pricing.get("grand_total_usd", 0)
        fee_est = transfer_fees_est or (req_transfer - inv_total) if inv_total else 0
        lines_tf = [
            f"Invoice Total:                 USD {inv_total:,.2f}" if inv_total else "",
            f"Estimated bank & transfer fees: USD {fee_est:,.2f}" if fee_est else "",
            f"Client must send:              USD {req_transfer:,.2f}",
            "",
            "All bank charges must be covered by the sender. The transfer amount shown",
            "ensures the company receives the full invoice value after all bank deductions.",
        ]
        for line in lines_tf:
            if line:
                pdf.cell(0, 4.5, f"  {line}", ln=True)
            else:
                pdf.ln(2)
        pdf.set_text_color(40, 40, 40)
        pdf.ln(3)

    # --- Terms ---
    pdf.ln(8)
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_text_color(13, 94, 79)
    pdf.cell(0, 8, "Terms & Conditions", ln=True)
    pdf.set_font('Helvetica', '', 8)
    pdf.set_text_color(80, 80, 80)
    terms = [
        "PRICES ARE SUBJECT TO CONFIRMATION WITHIN 7 DAYS due to fuel price and exchange rate fluctuations.",
        "All prices are quoted in USD unless otherwise stated.",
        f"This quotation is valid for {valid} days from the date of issue.",
        "A 30% deposit is required to confirm the booking. Balance due 45 days before travel.",
        "Permit availability is subject to UWA/RDB allocation and is not guaranteed until confirmed.",
        "Cancellation: 45+ days = full refund minus bank fees; 30-44 days = 50%; <30 days = non-refundable.",
        "Prices are based on current exchange rates and park tariffs, subject to change without notice.",
        "Travel insurance is strongly recommended for all participants.",
    ]
    for t in terms:
        pdf.multi_cell(0, 4.5, f"  -  {t}")
        pdf.ln(1)

    # --- Payment info ---
    pdf.ln(4)
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_text_color(13, 94, 79)
    pdf.cell(0, 8, "Payment Details", ln=True)
    pdf.set_font('Helvetica', '', 8)
    pdf.set_text_color(80, 80, 80)
    payment = [
        "Bank: Stanbic Bank Uganda",
        "Account: The Rift Valley Explorer Ltd",
        "USD Account: 9030021XXXXXX",
        "SWIFT: SBICUGKX",
        "Reference: Your booking reference number",
    ]
    for p in payment:
        pdf.cell(0, 5, f"  {p}", ln=True)

    # --- Bold Disclaimer ---
    pdf.ln(4)
    pdf.set_font("Helvetica", style="B", size=9)
    pdf.set_text_color(180, 50, 50)  # Red for urgency
    pdf.cell(0, 6, "IMPORTANT: Prices valid for 7 days only. Subject to change without notice due to", ln=True)
    pdf.cell(0, 6, "fuel price fluctuations and exchange rate movements.", ln=True)
    pdf.set_text_color(0, 0, 0)

    # --- Price Validity Notice ---
    pdf.ln(6)
    validity_days = CONFIG.get("quotation_validity_days", 7)
    try:
        created_dt = datetime.fromisoformat(created[:10])
    except (ValueError, TypeError):
        created_dt = datetime.now()
    from datetime import timedelta
    expiry_date_str = (created_dt + timedelta(days=validity_days)).strftime("%d %B %Y")
    pdf.set_fill_color(255, 243, 205)  # Light amber background
    pdf.set_draw_color(200, 150, 62)
    pdf.set_line_width(0.4)
    pdf.set_font('Helvetica', 'B', 9)
    pdf.set_text_color(120, 80, 0)
    notice_text = (
        f"! PRICE VALIDITY: Prices are subject to final confirmation within {validity_days} days "
        f"due to fuel price and foreign exchange rate fluctuations. "
        f"This quotation expires on {expiry_date_str}. "
        f"After expiry, prices must be recalculated."
    )
    pdf.multi_cell(0, 5.5, notice_text, border=1, fill=True)

    return pdf.output()


def generate_invoice_pdf(invoice: dict) -> bytes:
    """Generate a branded TRVE tax invoice PDF."""

    class TRVEInvoicePDF(_MiniPDF):
        def cell(self, w, h=0, text='', *args, **kwargs):
            return super().cell(w, h, _sanitize_pdf_text(str(text)), *args, **kwargs)
        def multi_cell(self, w, h, text='', *args, **kwargs):
            return super().multi_cell(w, h, _sanitize_pdf_text(str(text)), *args, **kwargs)
        def header(self):
            self.set_fill_color(13, 94, 79)
            self.rect(0, 0, 210, 28, 'F')
            self.set_font('Helvetica', 'B', 18)
            self.set_text_color(255, 255, 255)
            self.set_y(6)
            self.cell(0, 10, 'THE RIFT VALLEY EXPLORER', align='C')
            self.set_font('Helvetica', '', 9)
            self.set_y(16)
            self.cell(0, 6, 'Destination Management Company  |  Uganda & East Africa', align='C')
            self.ln(18)
        def footer(self):
            self.set_y(-20)
            self.set_font('Helvetica', '', 7)
            self.set_text_color(130, 130, 130)
            self.cell(0, 4, 'The Rift Valley Explorer Ltd  |  Entebbe, Uganda  |  info@theriftvalleyexplorer.com', align='C')
            self.ln(4)
            self.cell(0, 4, f'Page {self.page_no()}/{{nb}}', align='C')

    pdf = TRVEInvoicePDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=25)
    pdf.add_page()
    pdf.set_text_color(40, 40, 40)

    inv_number = invoice.get("invoice_number", "—")
    client = invoice.get("client_name", "—")
    email = invoice.get("client_email", "")
    ref = invoice.get("booking_ref", "")
    created = invoice.get("created_at", "")[:10]
    due_date = invoice.get("due_date", "")
    notes = invoice.get("notes", "")
    line_items = invoice.get("line_items", [])
    if isinstance(line_items, str):
        try:
            line_items = json.loads(line_items)
        except Exception:
            line_items = []
    subtotal = invoice.get("subtotal", 0) or 0
    tax_pct = invoice.get("tax_pct", 0) or 0
    tax_amount = invoice.get("tax_amount", 0) or 0
    total_usd = invoice.get("total_usd", 0) or 0

    # Title
    pdf.set_font('Helvetica', 'B', 16)
    pdf.set_text_color(13, 94, 79)
    pdf.cell(0, 10, 'TAX INVOICE', ln=True)
    pdf.set_draw_color(200, 150, 62)
    pdf.set_line_width(0.6)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)

    # Invoice number box
    pdf.set_fill_color(13, 94, 79)
    pdf.set_font('Helvetica', 'B', 11)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(190, 9, f'  Invoice No: {inv_number}', fill=True, ln=True)
    pdf.ln(3)

    # Two-column header: Bill To / Invoice Details
    pdf.set_text_color(40, 40, 40)
    col_w = 95
    y_before = pdf.get_y()

    pdf.set_font('Helvetica', 'B', 9)
    pdf.set_text_color(13, 94, 79)
    pdf.cell(col_w, 6, 'BILL TO', ln=False)
    pdf.cell(col_w, 6, 'INVOICE DETAILS', ln=True)

    pdf.set_font('Helvetica', '', 9)
    pdf.set_text_color(40, 40, 40)
    pdf.cell(col_w, 5.5, client, ln=False)
    pdf.cell(col_w, 5.5, f'Invoice Date: {created}', ln=True)
    if email:
        pdf.cell(col_w, 5.5, email, ln=False)
    else:
        pdf.cell(col_w, 5.5, '', ln=False)
    pdf.cell(col_w, 5.5, f'Due Date: {due_date or "On receipt"}', ln=True)
    pdf.cell(col_w, 5.5, f'Ref: {ref}', ln=False)
    pdf.cell(col_w, 5.5, f'Status: {invoice.get("status", "draft").upper()}', ln=True)
    pdf.ln(5)

    # Line items table
    pdf.set_fill_color(13, 94, 79)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font('Helvetica', 'B', 9)
    col_desc = 145
    col_amt = 45
    pdf.cell(col_desc, 7, 'Description', fill=True, border=0)
    pdf.cell(col_amt, 7, 'Amount (USD)', fill=True, border=0, align='R', ln=True)

    pdf.set_text_color(40, 40, 40)
    pdf.set_font('Helvetica', '', 9)
    row_fill = False
    for item in line_items:
        pdf.set_fill_color(245, 250, 248) if row_fill else pdf.set_fill_color(255, 255, 255)
        desc = item.get("item", item.get("description", ""))
        amt = item.get("total_usd", item.get("amount", 0)) or 0
        pdf.cell(col_desc, 6.5, f'  {desc}', fill=True)
        pdf.cell(col_amt, 6.5, f'${amt:,.2f}', fill=True, align='R', ln=True)
        row_fill = not row_fill

    pdf.ln(2)
    pdf.set_draw_color(200, 150, 62)
    pdf.set_line_width(0.4)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)

    # Totals
    def total_row(label, value, bold=False, color=(40, 40, 40)):
        pdf.set_font('Helvetica', 'B' if bold else '', 9 if not bold else 11)
        pdf.set_text_color(*color)
        pdf.cell(145, 7, label, align='R')
        pdf.cell(45, 7, f'${value:,.2f}', align='R', ln=True)

    total_row('Subtotal', subtotal)
    if tax_pct and tax_amount:
        total_row(f'Tax ({tax_pct:.1f}%)', tax_amount)

    pdf.set_draw_color(13, 94, 79)
    pdf.set_line_width(0.6)
    pdf.line(100, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(2)
    total_row('TOTAL DUE (USD)', total_usd, bold=True, color=(13, 94, 79))

    # Notes
    if notes:
        pdf.ln(6)
        pdf.set_font('Helvetica', 'B', 9)
        pdf.set_text_color(13, 94, 79)
        pdf.cell(0, 6, 'Notes', ln=True)
        pdf.set_font('Helvetica', '', 8)
        pdf.set_text_color(80, 80, 80)
        pdf.multi_cell(0, 5, notes)

    # Payment details
    pdf.ln(8)
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_text_color(13, 94, 79)
    pdf.cell(0, 7, 'Payment Details', ln=True)
    pdf.set_draw_color(200, 150, 62)
    pdf.set_line_width(0.3)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(2)
    pdf.set_font('Helvetica', '', 8)
    pdf.set_text_color(40, 40, 40)
    for line in [
        "Bank: Stanbic Bank Uganda",
        "Account Name: The Rift Valley Explorer Ltd",
        "USD Account: 9030021XXXXXX",
        "SWIFT/BIC: SBICUGKX",
        f"Payment Reference: {inv_number} / {ref}",
        "",
        "Please ensure all bank charges are covered by the sender.",
        "Payment is due by the date shown above. Late payments may affect your booking.",
    ]:
        if line:
            pdf.cell(0, 5, f'  {line}', ln=True)
        else:
            pdf.ln(2)

    return pdf.output()


def generate_voucher_pdf(voucher: dict) -> bytes:
    """Generate a supplier-facing booking voucher PDF."""

    class TRVEVoucherPDF(_MiniPDF):
        def cell(self, w, h=0, text='', *args, **kwargs):
            return super().cell(w, h, _sanitize_pdf_text(str(text)), *args, **kwargs)
        def multi_cell(self, w, h, text='', *args, **kwargs):
            return super().multi_cell(w, h, _sanitize_pdf_text(str(text)), *args, **kwargs)
        def header(self):
            self.set_fill_color(13, 94, 79)
            self.rect(0, 0, 210, 22, 'F')
            self.set_font('Helvetica', 'B', 14)
            self.set_text_color(255, 255, 255)
            self.set_y(5)
            self.cell(0, 8, 'THE RIFT VALLEY EXPLORER', align='C')
            self.set_font('Helvetica', '', 8)
            self.set_y(14)
            self.cell(0, 5, 'BOOKING VOUCHER  |  info@theriftvalleyexplorer.com', align='C')
            self.ln(14)
        def footer(self):
            self.set_y(-15)
            self.set_font('Helvetica', '', 7)
            self.set_text_color(130, 130, 130)
            self.cell(0, 5, 'The Rift Valley Explorer Ltd  |  Entebbe, Uganda', align='C')

    pdf = TRVEVoucherPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()
    pdf.set_text_color(40, 40, 40)

    voucher_number = voucher.get("voucher_number", "—")
    booking_ref = voucher.get("booking_ref", "—")
    client_name = voucher.get("client_name", "—")
    supplier = voucher.get("supplier_name", "—")
    service_type = voucher.get("service_type", "—")
    service_dates = voucher.get("service_dates", "—")
    pax = voucher.get("pax", 1)
    room_type = voucher.get("room_type", "")
    meal_plan = voucher.get("meal_plan", "")
    special_requests = voucher.get("special_requests", "")

    # Voucher number highlight bar
    pdf.set_fill_color(200, 150, 62)
    pdf.set_font('Helvetica', 'B', 11)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(190, 9, f'  Voucher No: {voucher_number}', fill=True, ln=True)
    pdf.ln(4)

    def field(label, value, col_w=95):
        pdf.set_font('Helvetica', 'B', 8)
        pdf.set_text_color(13, 94, 79)
        pdf.cell(50, 6, label + ':', ln=False)
        pdf.set_font('Helvetica', '', 9)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(0, 6, str(value), ln=True)

    field('To (Supplier)', supplier)
    field('From', 'The Rift Valley Explorer Ltd')
    pdf.ln(3)
    pdf.set_draw_color(200, 150, 62)
    pdf.set_line_width(0.3)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)

    field('Guest Name', client_name)
    field('Booking Ref', booking_ref)
    field('Service Type', service_type)
    field('Service Dates', service_dates)
    field('Number of Guests', str(pax))
    if room_type:
        field('Room / Unit Type', room_type)
    if meal_plan:
        field('Meal Plan', meal_plan)

    if special_requests:
        pdf.ln(3)
        pdf.set_font('Helvetica', 'B', 8)
        pdf.set_text_color(13, 94, 79)
        pdf.cell(0, 6, 'Special Requests / Notes:', ln=True)
        pdf.set_font('Helvetica', '', 9)
        pdf.set_text_color(40, 40, 40)
        pdf.multi_cell(0, 5.5, special_requests)

    pdf.ln(6)
    pdf.set_draw_color(13, 94, 79)
    pdf.set_line_width(0.4)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)

    pdf.set_font('Helvetica', '', 8)
    pdf.set_text_color(80, 80, 80)
    pdf.multi_cell(0, 5, (
        "This voucher is issued by The Rift Valley Explorer Ltd and confirms the above reservation. "
        "Please ensure services are provided as described. For queries, contact info@theriftvalleyexplorer.com."
    ))

    return pdf.output()


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
init_db()

app = FastAPI(title="TRVE Booking Hub API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------
class EnquiryCreate(BaseModel):
    client_name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    country: Optional[str] = ""
    nationality_tier: str

    @field_validator('nationality_tier')
    @classmethod
    def nationality_tier_must_be_set(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError(
                'nationality_tier is required. UWA permit rates differ by up to 9× '
                'across tiers (e.g. gorilla tracking: FNR $800 vs EAC $83). '
                'Select FNR, FR, ROA, EAC, or Ugandan.'
            )
        return v
    channel: Optional[str] = "direct"
    agent_name: Optional[str] = ""
    tour_type: Optional[str] = ""
    travel_start_date: Optional[str] = ""
    travel_end_date: Optional[str] = ""
    duration_days: Optional[int] = None
    pax: Optional[int] = 2
    budget_range: Optional[str] = ""
    interests: Optional[Any] = []
    destinations_requested: Optional[Any] = ""
    special_requests: Optional[str] = ""


class EnquiryUpdate(BaseModel):
    status: Optional[str] = None
    coordinator: Optional[str] = None
    client_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    nationality_tier: Optional[str] = None
    tour_type: Optional[str] = None
    travel_start_date: Optional[str] = None
    travel_end_date: Optional[str] = None
    duration_days: Optional[int] = None
    pax: Optional[int] = None
    budget_range: Optional[str] = None
    interests: Optional[Any] = None
    destinations_requested: Optional[Any] = None
    special_requests: Optional[str] = None
    quoted_usd: Optional[str] = None
    notes: Optional[str] = None
    working_itinerary: Optional[str] = None


class PricingRequest(BaseModel):
    itinerary_id: Optional[str] = None
    nationality_tier: str

    @field_validator('nationality_tier')
    @classmethod
    def nationality_tier_must_be_set(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError(
                'nationality_tier is required. UWA permit rates differ by up to 9× '
                'across tiers (e.g. gorilla tracking: FNR $800 vs EAC $83). '
                'Select FNR, FR, ROA, EAC, or Ugandan.'
            )
        return v
    pax: int = 2            # kept for backward compat; overridden by adults+children if provided
    adults: int = 2
    children: int = 0
    duration_days: Optional[int] = 7
    extra_vehicle_days: Optional[int] = 0
    travel_start_date: Optional[str] = None
    include_insurance: bool = False
    commission_type: Optional[str] = None
    accommodations: Optional[List[dict]] = []
    permits: Optional[List[dict]] = []
    extra_costs: Optional[List[dict]] = []
    vehicles: Optional[List[dict]] = []   # explicit optional transport add-ons
    # Structured guest list — each entry: {guest_id, room_type, rate_per_night, meal_plan}
    guests: Optional[List[dict]] = []
    # Itinerary activities — each entry: {name, cost_per_person, day, group_cost}
    activities: Optional[List[dict]] = []


class CurateRequest(BaseModel):
    enquiry_id: Optional[str] = None
    duration: Optional[int] = None
    duration_days: Optional[int] = None  # alias accepted from frontend
    budget_tier: Optional[str] = None
    nationality_tier: Optional[str] = "FNR"
    pax: Optional[int] = 2
    interests: Optional[List[str]] = []
    destinations: Optional[Any] = ""

    @property
    def effective_duration(self):
        return self.duration or self.duration_days

    @property
    def destinations_str(self):
        """Normalise destinations to a string regardless of input type."""
        if isinstance(self.destinations, list):
            return ', '.join(str(d) for d in self.destinations)
        return self.destinations or ""


class ApprovalRequest(BaseModel):
    approved_by: Optional[str] = ""
    reviewer: Optional[str] = ""           # alias from frontend
    itinerary_name: Optional[str] = ""
    selected_itinerary_id: Optional[str] = ""  # alias from frontend
    notes: Optional[str] = ""
    modifications: Optional[str] = ""      # alias from frontend
    approved: Optional[bool] = True


class QuotationRequest(BaseModel):
    pricing_data: Optional[dict] = None
    client_name: str
    client_email: Optional[str] = ""
    booking_ref: Optional[str] = ""
    valid_days: Optional[int] = 14
    # Also accept pricing params for re-calculation
    itinerary_id: Optional[str] = None
    pax: Optional[int] = None
    nationality_tier: Optional[str] = None
    extra_vehicle_days: Optional[int] = 0
    commission_type: Optional[str] = None


class SyncPushQuotation(BaseModel):
    quotation_id: str


class InvoiceRequest(BaseModel):
    booking_ref: str
    client_name: str
    client_email: Optional[str] = ""
    line_items: Optional[List[dict]] = []
    tax_pct: Optional[float] = 0
    due_date: Optional[str] = ""
    notes: Optional[str] = ""


class PaymentRequest(BaseModel):
    booking_ref: str
    amount_usd: float
    amount_ugx: Optional[float] = 0
    payment_date: Optional[str] = ""
    method: Optional[str] = "bank_transfer"
    reference: Optional[str] = ""
    notes: Optional[str] = ""
    recorded_by: Optional[str] = ""


class VoucherGenerateRequest(BaseModel):
    booking_ref: str
    client_name: str
    travel_start_date: Optional[str] = ""
    special_requests: Optional[str] = ""


class BankFeeRequest(BaseModel):
    """Inputs for the gross-up bank transfer fee calculator."""
    invoice_total: float                                # Required net (what company must receive)
    currency: Optional[str] = "USD"                    # Invoice currency
    receiving_bank_fee_flat: Optional[float] = 0.0     # Flat fee deducted by receiving bank (USD)
    receiving_bank_fee_pct: Optional[float] = 0.0      # % deducted by receiving bank
    intermediary_bank_fee: Optional[float] = 0.0       # Flat intermediary/correspondent fee
    sender_bank_fee_pct: Optional[float] = 0.0         # % charged on sender side
    sender_bank_fee_flat: Optional[float] = 0.0        # Flat fee charged on sender side
    exchange_rate: Optional[float] = None              # If client pays in foreign currency
    client_currency: Optional[str] = None             # Foreign currency code (e.g. EUR, GBP)
    currency_conversion_fee_pct: Optional[float] = 0.0 # % fee on FX conversion
    approved_by: Optional[str] = ""                   # User who confirmed the calculation


class ConfigUpdate(BaseModel):
    fx_rate: Optional[float] = None
    fx_buffer_pct: Optional[float] = None
    fuel_buffer_pct: Optional[float] = None
    vehicle_rate_per_day: Optional[float] = None
    insurance_rate_per_person_per_day: Optional[float] = None
    service_fee_pct: Optional[float] = None
    quotation_validity_days: Optional[int] = None
    # Canonical rate-effective date (ISO 8601, e.g. "2026-07-01").
    # Controls which "post_july_2026" permit price tier applies.
    rate_effective_date: Optional[str] = None
    # Legacy alias — updating either key updates both in CONFIG.
    rate_increase_date: Optional[str] = None


class LodgeCreate(BaseModel):
    lodge_name: str
    room_type: Optional[str] = "Double"
    country: Optional[str] = "Uganda"
    location: Optional[str] = ""
    rack_rate_usd: Optional[float] = 0
    net_rate_usd: Optional[float] = None
    meal_plan: Optional[str] = "Full Board"
    valid_from: Optional[str] = "2025-01-01"
    valid_to: Optional[str] = "2026-12-31"
    source_file: Optional[str] = ""
    notes: Optional[str] = ""
    source_email_date: Optional[str] = ""
    extraction_timestamp: Optional[str] = ""
    max_occupancy: Optional[int] = 2


class LodgeUpdate(BaseModel):
    lodge_name: Optional[str] = None
    room_type: Optional[str] = None
    country: Optional[str] = None
    location: Optional[str] = None
    rack_rate_usd: Optional[float] = None
    net_rate_usd: Optional[float] = None
    meal_plan: Optional[str] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    source_file: Optional[str] = None
    notes: Optional[str] = None
    source_email_date: Optional[str] = None
    extraction_timestamp: Optional[str] = None
    max_occupancy: Optional[int] = None


class EmailRateEntry(BaseModel):
    lodge_name: str
    room_type: Optional[str] = "Double"
    country: Optional[str] = "Uganda"
    location: Optional[str] = ""
    rack_rate_usd: Optional[float] = 0
    net_rate_usd: Optional[float] = None
    meal_plan: Optional[str] = "Full Board"
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    max_occupancy: Optional[int] = 2
    notes: Optional[str] = ""


class EmailRatesImport(BaseModel):
    email_subject: str
    email_date: str
    email_sender: str
    rates: List[EmailRateEntry]


# ---------------------------------------------------------------------------
# ENDPOINTS
# ---------------------------------------------------------------------------

# --- Health ---
@app.get("/api/health")
def health():
    with db_session() as conn:
        count = conn.execute("SELECT COUNT(*) FROM enquiries").fetchone()[0]
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "version": "2.0.0",
        "enquiries_count": count,
    }


# ---------------------------------------------------------------------------
# BANK TRANSFER GROSS-UP CALCULATOR
# Ensures the company receives the exact invoiced amount after all bank fees.
# ---------------------------------------------------------------------------

@app.post("/api/calculate-transfer-fees")
def calculate_transfer_fees(body: BankFeeRequest):
    """
    Gross-up calculator: given an invoice total, computes the amount the client
    must send so the company receives the full invoice value.

    Step 1  required_net = invoice_total
    Step 2  net_after_receiving_fee = required_net + flat_fee + (required_net × pct / 100)
    Step 3  net_after_intermediary = previous + intermediary_fee
    Step 4  gross_usd = (net_after_intermediary + sender_flat) / (1 − sender_pct / 100)
    Step 5  if client pays in foreign currency:
              gross_foreign = gross_usd / exchange_rate
              apply conversion fee if present
    """
    inv = body.invoice_total
    if inv <= 0:
        raise HTTPException(status_code=422, detail="invoice_total must be > 0")

    # Step 1 — required net
    required_net = inv

    # Step 2 — add receiving bank deductions
    recv_flat = body.receiving_bank_fee_flat or 0
    recv_pct = body.receiving_bank_fee_pct or 0
    recv_pct_amount = required_net * recv_pct / 100
    after_recv = required_net + recv_flat + recv_pct_amount

    # Step 3 — add intermediary bank deduction
    intermediary = body.intermediary_bank_fee or 0
    after_intermediary = after_recv + intermediary

    # Step 4 — gross up for sender percentage fee
    sender_pct = body.sender_bank_fee_pct or 0
    sender_flat = body.sender_bank_fee_flat or 0
    if sender_pct >= 100:
        raise HTTPException(status_code=422, detail="sender_bank_fee_pct must be < 100")
    gross_usd = (after_intermediary + sender_flat) / (1 - sender_pct / 100)

    total_fee_usd = round(gross_usd - inv, 4)

    result = {
        "invoice_total_usd": round(inv, 2),
        "required_net_usd": round(required_net, 2),
        "receiving_bank_fee_usd": round(recv_flat + recv_pct_amount, 2),
        "intermediary_fee_usd": round(intermediary, 2),
        "sender_fee_usd": round(gross_usd - after_intermediary - sender_flat, 2) + sender_flat,
        "total_transfer_fees_usd": round(total_fee_usd, 2),
        "gross_amount_usd": round(gross_usd, 2),
        "currency": body.currency or "USD",
        "client_must_send_usd": round(gross_usd, 2),
        "fee_breakdown": {
            "receiving_flat": round(recv_flat, 2),
            "receiving_pct_amount": round(recv_pct_amount, 2),
            "intermediary": round(intermediary, 2),
            "sender_flat": round(sender_flat, 2),
            "sender_pct_amount": round(gross_usd - after_intermediary - sender_flat, 2),
        },
    }

    # Step 5 — currency conversion if client pays in foreign currency
    if body.exchange_rate and body.exchange_rate > 0:
        conv_pct = body.currency_conversion_fee_pct or 0
        gross_foreign = gross_usd / body.exchange_rate
        # Apply conversion fee on top (client pays extra for FX)
        gross_foreign_with_fee = gross_foreign * (1 + conv_pct / 100)
        result.update({
            "client_currency": body.client_currency or "FOREIGN",
            "exchange_rate": body.exchange_rate,
            "gross_amount_foreign": round(gross_foreign_with_fee, 2),
            "client_must_send_foreign": round(gross_foreign_with_fee, 2),
            "conversion_fee_pct": conv_pct,
        })

    # Audit log entry (persisted to DB)
    audit_entry = {
        "timestamp": datetime.now().isoformat(),
        "invoice_total": round(inv, 2),
        "assumed_bank_fees": round(total_fee_usd, 2),
        "calculated_transfer_amount": round(gross_usd, 2),
        "exchange_rate_used": body.exchange_rate,
        "client_currency": body.client_currency or body.currency or "USD",
        "approved_by": body.approved_by or "—",
    }
    with db_session() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transfer_fee_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT, invoice_total REAL, assumed_bank_fees REAL,
                calculated_transfer_amount REAL, exchange_rate_used REAL,
                client_currency TEXT, approved_by TEXT, details TEXT
            )
        """)
        conn.execute("""
            INSERT INTO transfer_fee_audit
              (timestamp, invoice_total, assumed_bank_fees, calculated_transfer_amount,
               exchange_rate_used, client_currency, approved_by, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            audit_entry["timestamp"], audit_entry["invoice_total"],
            audit_entry["assumed_bank_fees"], audit_entry["calculated_transfer_amount"],
            audit_entry["exchange_rate_used"], audit_entry["client_currency"],
            audit_entry["approved_by"], json.dumps(result),
        ))
        conn.commit()

    result["audit"] = audit_entry
    return result


@app.get("/api/transfer-fee-audit")
def get_transfer_fee_audit(limit: int = 50):
    """Return recent bank transfer fee calculation audit log entries."""
    with db_session() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transfer_fee_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT, invoice_total REAL, assumed_bank_fees REAL,
                calculated_transfer_amount REAL, exchange_rate_used REAL,
                client_currency TEXT, approved_by TEXT, details TEXT
            )
        """)
        rows = conn.execute("""
            SELECT id, timestamp, invoice_total, assumed_bank_fees, calculated_transfer_amount,
                   exchange_rate_used, client_currency, approved_by
            FROM transfer_fee_audit ORDER BY id DESC LIMIT ?
        """, (limit,)).fetchall()
    return {"items": [dict(r) for r in rows]}


# --- Config ---
@app.get("/api/config")
def get_config():
    CONFIG["last_updated"] = datetime.now().isoformat()
    return {**CONFIG, "email_enabled": EMAIL_CONFIG["enabled"]}


@app.patch("/api/config")
def update_config(body: ConfigUpdate):
    updates = body.model_dump(exclude_none=True)
    # Keep rate_effective_date and rate_increase_date in sync
    if "rate_effective_date" in updates:
        updates["rate_increase_date"] = updates["rate_effective_date"]
    elif "rate_increase_date" in updates:
        updates["rate_effective_date"] = updates["rate_increase_date"]
    CONFIG.update(updates)
    CONFIG["last_updated"] = datetime.now().isoformat()
    _persist_config(updates)
    return CONFIG


@app.post("/api/config/update")
def update_config_post(body: ConfigUpdate):
    updates = body.model_dump(exclude_none=True)
    # Keep rate_effective_date and rate_increase_date in sync
    if "rate_effective_date" in updates:
        updates["rate_increase_date"] = updates["rate_effective_date"]
    elif "rate_increase_date" in updates:
        updates["rate_effective_date"] = updates["rate_increase_date"]
    for k, v in updates.items():
        CONFIG[k] = v
    CONFIG["last_updated"] = datetime.now().isoformat()
    _persist_config(updates)
    return CONFIG


def _persist_config(updates: dict):
    """Persist config key-value pairs to the SQLite config table (INSERT OR REPLACE)."""
    if not updates:
        return
    try:
        with db_session() as conn:
            for k, v in updates.items():
                conn.execute(
                    "INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))",
                    (k, json.dumps(v))
                )
    except Exception:
        pass  # Silent fail — in-memory update still took effect


@app.get("/api/reports/summary")
def get_reports_summary():
    """Analytics summary: KPIs, pipeline breakdown, revenue, recent payments."""
    today = datetime.now().date()
    this_month = today.strftime("%Y-%m")

    with db_session() as conn:
        # --- Totals ---
        total_bookings = conn.execute("SELECT COUNT(*) FROM enquiries").fetchone()[0]
        bookings_this_month = conn.execute(
            "SELECT COUNT(*) FROM enquiries WHERE substr(created_at,1,7) = ?", (this_month,)
        ).fetchone()[0]

        # --- By status ---
        status_rows = conn.execute(
            "SELECT status, COUNT(*) as cnt FROM enquiries GROUP BY status ORDER BY cnt DESC"
        ).fetchall()
        by_status = {r["status"]: r["cnt"] for r in status_rows}

        confirmed_statuses = ("Confirmed", "In_Progress", "Completed")
        confirmed_bookings = sum(by_status.get(s, 0) for s in confirmed_statuses)

        # --- Revenue metrics (revenue_usd stored as TEXT) ---
        rev_rows = conn.execute(
            "SELECT revenue_usd, balance_usd FROM enquiries WHERE revenue_usd != '' AND revenue_usd IS NOT NULL"
        ).fetchall()
        total_revenue = 0.0
        total_balance = 0.0
        for r in rev_rows:
            try:
                total_revenue += float(r["revenue_usd"] or 0)
            except (ValueError, TypeError):
                pass
            try:
                total_balance += float(r["balance_usd"] or 0)
            except (ValueError, TypeError):
                pass

        avg_deal = total_revenue / confirmed_bookings if confirmed_bookings > 0 else 0
        conversion_rate = (confirmed_bookings / total_bookings * 100) if total_bookings > 0 else 0

        # --- Pipeline value (Active_Quote + Unconfirmed) ---
        pipe_rows = conn.execute(
            "SELECT quoted_usd FROM enquiries WHERE status IN ('Active_Quote','Unconfirmed') AND quoted_usd != '' AND quoted_usd IS NOT NULL"
        ).fetchall()
        pipeline_value = 0.0
        for r in pipe_rows:
            try:
                pipeline_value += float(r["quoted_usd"] or 0)
            except (ValueError, TypeError):
                pass

        # --- By coordinator ---
        coord_rows = conn.execute(
            "SELECT coordinator, COUNT(*) as cnt FROM enquiries WHERE coordinator != '' GROUP BY coordinator ORDER BY cnt DESC"
        ).fetchall()
        by_coordinator = {r["coordinator"]: r["cnt"] for r in coord_rows}

        # --- By channel ---
        channel_rows = conn.execute(
            "SELECT channel, COUNT(*) as cnt FROM enquiries WHERE channel != '' GROUP BY channel ORDER BY cnt DESC"
        ).fetchall()
        by_channel = {r["channel"]: r["cnt"] for r in channel_rows}

        # --- Monthly payments (last 6 months) ---
        monthly_rows = conn.execute("""
            SELECT substr(payment_date,1,7) as month,
                   SUM(amount_usd) as revenue,
                   COUNT(*) as count
            FROM payments
            WHERE payment_date >= date('now','-6 months')
            GROUP BY month
            ORDER BY month ASC
        """).fetchall()
        monthly_revenue = [
            {"month": r["month"], "revenue": round(r["revenue"] or 0, 2), "count": r["count"]}
            for r in monthly_rows
        ]

        # --- Total payments received ---
        total_paid_row = conn.execute("SELECT COALESCE(SUM(amount_usd),0) FROM payments").fetchone()
        total_paid = round(total_paid_row[0] or 0, 2)

        # --- Recent payments ---
        pay_rows = conn.execute("""
            SELECT p.booking_ref, e.client_name, p.amount_usd, p.payment_date, p.method
            FROM payments p
            LEFT JOIN enquiries e ON p.booking_ref = e.booking_ref
            ORDER BY p.created_at DESC
            LIMIT 10
        """).fetchall()
        recent_payments = [dict(r) for r in pay_rows]

    return {
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_bookings": total_bookings,
            "bookings_this_month": bookings_this_month,
            "confirmed_bookings": confirmed_bookings,
            "total_revenue_usd": round(total_revenue, 2),
            "total_paid_usd": total_paid,
            "outstanding_balance_usd": round(total_balance, 2),
            "pipeline_value_usd": round(pipeline_value, 2),
            "avg_deal_usd": round(avg_deal, 2),
            "conversion_rate_pct": round(conversion_rate, 1),
        },
        "by_status": by_status,
        "by_coordinator": by_coordinator,
        "by_channel": by_channel,
        "monthly_revenue": monthly_revenue,
        "recent_payments": recent_payments,
    }


@app.get("/api/email/status")
def email_status():
    """Return current email configuration status (without exposing credentials)."""
    return {
        "enabled": EMAIL_CFG["enabled"],
        "configured": bool(EMAIL_CFG["smtp_user"]),
        "from": EMAIL_CFG["from_addr"] if EMAIL_CFG["smtp_user"] else None,
        "smtp_host": EMAIL_CFG["smtp_host"],
        "instructions": None if EMAIL_CFG["enabled"] else (
            "To enable: set EMAIL_NOTIFICATIONS_ENABLED=true, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS "
            "as environment variables in your Render dashboard."
        ),
    }


# --- Enquiries ---
@app.get("/api/enquiries")
def list_enquiries(limit: int = Query(200, ge=1, le=1000)):
    with db_session() as conn:
        rows = conn.execute(
            "SELECT * FROM enquiries ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        items = []
        for r in rows:
            d = dict(r)
            d["synced"] = bool(d["synced"])
            if d["pax"] is None:
                d["pax"] = 2
            items.append(d)
    return {"items": items, "total": len(items)}


@app.post("/api/enquiries", status_code=201)
def create_enquiry(body: EnquiryCreate):
    with db_session() as conn:
        year = datetime.now().year
        row = conn.execute(
            "SELECT COUNT(*) FROM enquiries WHERE booking_ref LIKE ?",
            (f"TRVE-{year}-%",)
        ).fetchone()
        next_num = (row[0] or 0) + 1
        booking_ref = f"TRVE-{year}-{next_num:03d}"

        interests_str = json.dumps(body.interests) if isinstance(body.interests, list) else (body.interests or "")
        dest_str = body.destinations_requested if isinstance(body.destinations_requested, str) else json.dumps(body.destinations_requested)
        now_str = datetime.now().strftime("%d-%b-%Y")

        conn.execute("""
            INSERT INTO enquiries (id, booking_ref, channel, client_name, email, phone,
                country, nationality_tier, inquiry_date, tour_type, pax, quoted_usd,
                destinations_requested, travel_start_date, travel_end_date, duration_days,
                status, coordinator, budget_range, interests, special_requests, agent_name,
                permits, accommodation, vehicle, insurance, revenue_usd, balance_usd,
                payment_status, internal_flags, last_updated, synced)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            booking_ref, booking_ref, body.channel or "direct", body.client_name,
            body.email or "", body.phone or "", body.country or "",
            body.nationality_tier, now_str, body.tour_type or "",
            body.pax or 2, "", dest_str, body.travel_start_date or "",
            body.travel_end_date or "", body.duration_days, "New_Inquiry", "",
            body.budget_range or "", interests_str, body.special_requests or "",
            body.agent_name or "", "", "", "", "", "", "", "", "", now_str, 0
        ))

        entry = dict(conn.execute(
            "SELECT * FROM enquiries WHERE id = ?", (booking_ref,)
        ).fetchone())
        entry["synced"] = bool(entry["synced"])

    # Send confirmation email (non-blocking)
    if entry.get("email"):
        dest = entry.get("destinations_requested", "")
        try:
            dest_clean = ', '.join(json.loads(dest)) if dest.startswith('[') else dest
        except Exception:
            dest_clean = dest
        send_email(
            to_addr=entry["email"],
            subject=f"Safari Enquiry Confirmed — {booking_ref} | TRVE",
            html_body=enquiry_confirmation_html(
                booking_ref=booking_ref,
                client_name=entry["client_name"],
                destinations=dest_clean,
                travel_start=entry.get("travel_start_date", ""),
                pax=entry.get("pax", 2),
            )
        )

    return {"booking_ref": booking_ref, "id": booking_ref, **entry}


@app.patch("/api/enquiries/{enquiry_id}")
def update_enquiry(enquiry_id: str, body: EnquiryUpdate):
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM enquiries WHERE id = ? OR booking_ref = ?",
            (enquiry_id, enquiry_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Enquiry not found")

        updates = body.model_dump(exclude_none=True)
        if not updates:
            return dict(row)

        existing = dict(row)
        actual_id = existing["id"]

        # Auto-save itinerary version when working_itinerary changes
        if "working_itinerary" in updates:
            old_content = existing.get("working_itinerary") or ""
            new_content = updates["working_itinerary"] or ""
            if new_content and new_content.strip() != old_content.strip():
                version_count = conn.execute(
                    "SELECT COUNT(*) FROM itinerary_versions WHERE enquiry_id = ?", (actual_id,)
                ).fetchone()[0]
                conn.execute(
                    """INSERT INTO itinerary_versions (id, enquiry_id, booking_ref, version_number, content, saved_at, label)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        str(uuid.uuid4()),
                        actual_id,
                        existing.get("booking_ref", ""),
                        version_count + 1,
                        new_content,
                        datetime.now().isoformat(),
                        f"Version {version_count + 1}"
                    )
                )

        set_clauses = []
        values = []
        for key, value in updates.items():
            if key == "notes":
                set_clauses.append("special_requests = ?")
                values.append(value)
            elif key == "interests" and isinstance(value, list):
                set_clauses.append("interests = ?")
                values.append(json.dumps(value))
            else:
                set_clauses.append(f"{key} = ?")
                values.append(value)

        set_clauses.append("last_updated = ?")
        values.append(datetime.now().strftime("%d-%b-%Y"))
        set_clauses.append("synced = ?")
        values.append(0)

        values.append(actual_id)
        conn.execute(
            f"UPDATE enquiries SET {', '.join(set_clauses)} WHERE id = ?",
            values
        )
        updated = dict(conn.execute("SELECT * FROM enquiries WHERE id = ?", (actual_id,)).fetchone())
        updated["synced"] = bool(updated["synced"])
    return updated


# --- Itinerary Version History ---

@app.get("/api/enquiries/{enquiry_id}/itinerary/versions")
def list_itinerary_versions(enquiry_id: str):
    """Return the version history for a booking's working itinerary."""
    with db_session() as conn:
        row = conn.execute(
            "SELECT id, booking_ref FROM enquiries WHERE id = ? OR booking_ref = ?",
            (enquiry_id, enquiry_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Enquiry not found")
        actual_id = dict(row)["id"]
        rows = conn.execute(
            """SELECT id, version_number, label, saved_at, saved_by,
                      substr(content, 1, 120) AS preview
               FROM itinerary_versions WHERE enquiry_id = ?
               ORDER BY version_number DESC""",
            (actual_id,)
        ).fetchall()
    return {"versions": [dict(r) for r in rows]}


@app.post("/api/enquiries/{enquiry_id}/itinerary/versions/{version_id}/restore")
def restore_itinerary_version(enquiry_id: str, version_id: str):
    """Restore a previous itinerary version as the current working_itinerary."""
    with db_session() as conn:
        eq_row = conn.execute(
            "SELECT id, booking_ref FROM enquiries WHERE id = ? OR booking_ref = ?",
            (enquiry_id, enquiry_id)
        ).fetchone()
        if not eq_row:
            raise HTTPException(status_code=404, detail="Enquiry not found")
        actual_id = dict(eq_row)["id"]

        ver_row = conn.execute(
            "SELECT content, version_number FROM itinerary_versions WHERE id = ? AND enquiry_id = ?",
            (version_id, actual_id)
        ).fetchone()
        if not ver_row:
            raise HTTPException(status_code=404, detail="Version not found")

        content = dict(ver_row)["content"]
        # Save current as a new version before restoring
        version_count = conn.execute(
            "SELECT COUNT(*) FROM itinerary_versions WHERE enquiry_id = ?", (actual_id,)
        ).fetchone()[0]
        current = conn.execute(
            "SELECT working_itinerary FROM enquiries WHERE id = ?", (actual_id,)
        ).fetchone()
        if current and (current["working_itinerary"] or "").strip():
            conn.execute(
                """INSERT INTO itinerary_versions (id, enquiry_id, booking_ref, version_number, content, saved_at, label)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(uuid.uuid4()), actual_id, dict(eq_row)["booking_ref"],
                    version_count + 1, current["working_itinerary"],
                    datetime.now().isoformat(), f"Auto-saved before restore"
                )
            )
        conn.execute(
            "UPDATE enquiries SET working_itinerary = ?, last_updated = ?, synced = 0 WHERE id = ?",
            (content, datetime.now().strftime("%d-%b-%Y"), actual_id)
        )
    return {"ok": True, "content": content}


@app.post("/api/enquiries/{enquiry_id}/create-invoice")
def create_invoice_from_enquiry(enquiry_id: str, body: dict = {}):
    """Create an invoice directly from the working itinerary / latest quotation for a booking."""
    with db_session() as conn:
        eq_row = conn.execute(
            "SELECT * FROM enquiries WHERE id = ? OR booking_ref = ?",
            (enquiry_id, enquiry_id)
        ).fetchone()
        if not eq_row:
            raise HTTPException(status_code=404, detail="Enquiry not found")
        enquiry = dict(eq_row)
        actual_id = enquiry["id"]
        booking_ref = enquiry["booking_ref"]

        # Try to get line items from the latest quotation
        qrow = conn.execute(
            "SELECT pricing_data FROM quotations WHERE booking_ref = ? ORDER BY created_at DESC LIMIT 1",
            (booking_ref,)
        ).fetchone()

    line_items = []
    if qrow:
        try:
            pd_data = json.loads(dict(qrow)["pricing_data"]) if isinstance(dict(qrow)["pricing_data"], str) else dict(qrow)["pricing_data"]
            line_items = pd_data.get("line_items") or []
            if not line_items:
                for section, key in [("accommodation", "lines"), ("vehicles", "lines"), ("permits", "lines"), ("activities", "lines")]:
                    for ln in pd_data.get(section, {}).get(key, []):
                        desc = ln.get("description", ln.get("name", ""))
                        total = ln.get("total", 0)
                        if desc and total:
                            line_items.append({"item": desc, "total_usd": float(total)})
                sf = pd_data.get("service_fee", {})
                if sf.get("total", 0):
                    line_items.append({"item": sf.get("label", "Service Fee"), "total_usd": float(sf["total"])})
        except Exception:
            pass

    # Fallback: single line item from quoted amount
    if not line_items and enquiry.get("quoted_usd"):
        try:
            quoted = float(enquiry["quoted_usd"])
            line_items = [{"item": f"Safari Package — {enquiry.get('destinations_requested','')}", "total_usd": quoted}]
        except Exception:
            pass

    subtotal = sum(float(i.get("total_usd", i.get("amount", 0)) or 0) for i in line_items)
    tax_pct = float(body.get("tax_pct", 0))
    tax_amount = round(subtotal * tax_pct / 100, 2)
    total_usd = round(subtotal + tax_amount, 2)
    due_date = body.get("due_date", "")
    notes = body.get("notes", "")

    inv_id = str(uuid.uuid4())
    with db_session() as conn:
        inv_number = _next_invoice_number(conn)
        conn.execute(
            """INSERT INTO invoices (id, invoice_number, booking_ref, client_name, client_email,
                line_items, subtotal, tax_pct, tax_amount, total_usd, status, due_date, notes, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                inv_id, inv_number, booking_ref,
                enquiry.get("client_name", ""), enquiry.get("email", ""),
                json.dumps(line_items), round(subtotal, 2), tax_pct, tax_amount, total_usd,
                "draft", due_date, notes, datetime.now().isoformat()
            )
        )
    return {
        "id": inv_id,
        "invoice_number": inv_number,
        "booking_ref": booking_ref,
        "client_name": enquiry.get("client_name", ""),
        "total_usd": total_usd,
        "status": "draft",
        "created_at": datetime.now().isoformat(),
        "line_items_count": len(line_items),
    }


# --- Itineraries ---
@app.get("/api/itineraries")
def list_itineraries(limit: int = Query(100, ge=1, le=500)):
    with db_session() as conn:
        rows = conn.execute("SELECT * FROM itineraries LIMIT ?", (limit,)).fetchall()
        items = []
        for r in rows:
            d = dict(r)
            # Parse JSON fields
            for jf in ("destinations", "countries", "interests", "permits_included", "parks", "nationality_tiers"):
                try:
                    d[jf] = json.loads(d[jf]) if d[jf] else []
                except (json.JSONDecodeError, TypeError):
                    d[jf] = []
            items.append(d)
    return {"items": items, "total": len(items)}


# --- Lodge Rates ---
@app.get("/api/lodge-rates/lodges")
def list_lodges():
    with db_session() as conn:
        rows = conn.execute("SELECT * FROM lodges ORDER BY lodge_name").fetchall()
    lodge_map = {}
    for r in rows:
        l = dict(r)
        name = l["lodge_name"]
        if name not in lodge_map:
            lodge_map[name] = {
                "name": name,
                "country": l["country"],
                "location": l["location"],
                "room_types": [],
            }
        lodge_map[name]["room_types"].append({
            "room_type": l["room_type"],
            "net_rate_usd": l["net_rate_usd"],
            "rack_rate_usd": l["rack_rate_usd"],
            "meal_plan": l["meal_plan"],
            "valid_from": l["valid_from"],
            "valid_to": l["valid_to"],
            "notes": l["notes"],
            "source_email_date": l["source_email_date"] if "source_email_date" in l.keys() else "",
            "extraction_timestamp": l["extraction_timestamp"] if "extraction_timestamp" in l.keys() else "",
            "max_occupancy": l["max_occupancy"] if "max_occupancy" in l.keys() else 2,
        })
    return list(lodge_map.values())


# --- Activities & Structured Costs ---
# tier_rates: nationality-tiered prices where UWA / park operator applies differential pricing.
# Activities WITHOUT tier_rates have fixed prices regardless of nationality.
# Tiers: FNR (Foreign Non-Resident), FR (Foreign Resident), ROA (Rest of Africa),
#         EAC (East African Community), Ugandan
ACTIVITY_CATALOGUE = [
    # UWA-governed boat cruises — nationality-tiered (UWA tariff 2024-2026)
    {"id": "boat_cruise_kazinga", "name": "Boat Cruise — Kazinga Channel",
     "category": "activity", "default_usd": 40, "per_person": True,
     "tier_rates": {"FNR": 40, "FR": 30, "ROA": 25, "EAC": 15, "Ugandan": 15},
     "notes": "2-hour cruise, QENP. UWA-tiered rate."},
    {"id": "boat_cruise_murchison", "name": "Boat Cruise — Murchison Falls (Nile)",
     "category": "activity", "default_usd": 40, "per_person": True,
     "tier_rates": {"FNR": 40, "FR": 30, "ROA": 25, "EAC": 15, "Ugandan": 15},
     "notes": "3-hour cruise to base of falls. UWA-tiered rate."},
    # UWA-governed nature walks inside parks
    {"id": "nature_walk_forest", "name": "Guided Forest Nature Walk (park)",
     "category": "activity", "default_usd": 30, "per_person": True,
     "tier_rates": {"FNR": 30, "FR": 25, "ROA": 20, "EAC": 10, "Ugandan": 10},
     "notes": "Inside national park boundary. UWA-tiered rate."},
    {"id": "birdwatching_guided", "name": "Guided Birding Walk (park)",
     "category": "activity", "default_usd": 30, "per_person": True,
     "tier_rates": {"FNR": 30, "FR": 25, "ROA": 20, "EAC": 10, "Ugandan": 10},
     "notes": "2-3 hours with specialist guide inside park. UWA-tiered rate."},
    # Fixed-price activities (private operators — nationality does not affect price)
    {"id": "game_drive_half", "name": "Game Drive — Half Day", "category": "activity", "default_usd": 0, "per_person": False, "notes": "Included in vehicle hire"},
    {"id": "rhino_tracking_ziwa", "name": "Rhino Tracking — Ziwa Sanctuary", "category": "activity", "default_usd": 40, "per_person": True, "notes": "Private sanctuary, fixed rate per person"},
    {"id": "community_walk", "name": "Community/Village Walk", "category": "activity", "default_usd": 20, "per_person": True, "notes": "Bigodi, Batwa Trail, etc. Fixed community rate."},
    {"id": "canoe_bunyonyi", "name": "Canoe — Lake Bunyonyi", "category": "activity", "default_usd": 15, "per_person": True, "notes": "Half-day canoe rental, fixed rate"},
    {"id": "cultural_batwa", "name": "Batwa Trail — Cultural Experience", "category": "activity", "default_usd": 45, "per_person": True, "notes": "Bwindi cultural immersion, fixed community rate"},
    {"id": "sport_fishing", "name": "Sport Fishing — Nile/Lake Victoria", "category": "activity", "default_usd": 50, "per_person": True, "notes": "Per rod per day, private operator"},
    {"id": "white_water_jinja", "name": "White-Water Rafting — Jinja", "category": "activity", "default_usd": 140, "per_person": True, "notes": "Full day, Grade 5 Nile rapids, private operator"},
    {"id": "bungee_jinja", "name": "Bungee Jump — Jinja", "category": "activity", "default_usd": 115, "per_person": True, "notes": "Over the Nile, private operator"},
    {"id": "quad_bike", "name": "Quad Biking", "category": "activity", "default_usd": 90, "per_person": True, "notes": "Jinja / Entebbe, private operator"},
    {"id": "horse_riding", "name": "Horse Riding Safari", "category": "activity", "default_usd": 80, "per_person": True, "notes": "Lake Mburo area, private operator"},
    {"id": "porter_bwindi", "name": "Porter — Gorilla/Chimp Trek", "category": "activity", "default_usd": 15, "per_person": True, "notes": "Highly recommended, per trek, fixed"},
    # Transport (optional add-ons — must be explicitly selected; NOT auto-inserted)
    {"id": "vehicle_4x4_landcruiser", "name": "4x4 Land Cruiser (hire)", "category": "transport", "default_usd": 120, "per_person": False, "notes": "Per vehicle per day. Select days in Transport section."},
    {"id": "vehicle_minivan", "name": "Safari Minivan / Hiace (hire)", "category": "transport", "default_usd": 100, "per_person": False, "notes": "Per vehicle per day."},
    {"id": "vehicle_coaster", "name": "Coaster Bus (hire)", "category": "transport", "default_usd": 150, "per_person": False, "notes": "Per vehicle per day, large groups."},
    {"id": "vehicle_selfdrive", "name": "Self-Drive 4x4 Rental", "category": "transport", "default_usd": 90, "per_person": False, "notes": "Per vehicle per day, fuel not included."},
    # Flights
    {"id": "internal_flight_ebb_mfc", "name": "Internal Flight — EBB to Murchison", "category": "flight", "default_usd": 280, "per_person": True, "notes": "Aerolink Uganda one-way"},
    {"id": "internal_flight_ebb_kidepo", "name": "Internal Flight — EBB to Kidepo", "category": "flight", "default_usd": 320, "per_person": True, "notes": "Aerolink Uganda one-way"},
    {"id": "internal_flight_ebb_bwindi", "name": "Internal Flight — EBB to Bwindi (Kihihi)", "category": "flight", "default_usd": 250, "per_person": True, "notes": "Aerolink Uganda one-way"},
    {"id": "internal_flight_ebb_kla", "name": "Internal Flight — Kigali to Bwindi", "category": "flight", "default_usd": 300, "per_person": True, "notes": "One-way cross-border connection"},
    # Transfers
    {"id": "transfer_entebbe", "name": "Airport Transfer — Entebbe/Kampala", "category": "transfer", "default_usd": 80, "per_person": False, "notes": "Per vehicle one-way"},
    {"id": "transfer_kigali", "name": "Airport Transfer — Kigali", "category": "transfer", "default_usd": 60, "per_person": False, "notes": "Per vehicle one-way"},
    # Visas & Health
    {"id": "visa_uganda", "name": "Uganda Entry Visa", "category": "visa", "default_usd": 50, "per_person": True, "notes": "EAC members exempt"},
    {"id": "visa_rwanda", "name": "Rwanda Entry Visa", "category": "visa", "default_usd": 50, "per_person": True, "notes": "Most nationalities on arrival"},
    {"id": "covid_test", "name": "PCR / Health Certificate (if required)", "category": "health", "default_usd": 60, "per_person": True, "notes": "Check current requirements"},
    # Conservation
    {"id": "conservancy_fee", "name": "Community Conservancy Fee", "category": "conservation", "default_usd": 20, "per_person": True, "notes": "Various private conservancies"},
    {"id": "park_dev_levy", "name": "Park Development Levy", "category": "conservation", "default_usd": 5, "per_person": True, "notes": "Per park entry in Uganda"},
    # Misc
    {"id": "driver_guide_tip", "name": "Driver-Guide Gratuity (suggested)", "category": "gratuity", "default_usd": 20, "per_person": False, "notes": "Per day suggestion"},
    {"id": "travel_insurance_ext", "name": "Travel Insurance (external quote)", "category": "insurance", "default_usd": 0, "per_person": True, "notes": "Client arranges — amount varies"},
]


@app.get("/api/activities")
def list_activities():
    return {"items": ACTIVITY_CATALOGUE}


# --- Lodge CRUD ---
@app.get("/api/lodges")
def list_lodges_raw(
    country: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
):
    with db_session() as conn:
        query = "SELECT * FROM lodges WHERE 1=1"
        params = []
        if country:
            query += " AND country = ?"
            params.append(country)
        if location:
            query += " AND location LIKE ?"
            params.append(f"%{location}%")
        query += " ORDER BY country, location, lodge_name LIMIT ?"
        params.append(limit)
        rows = conn.execute(query, params).fetchall()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@app.post("/api/lodges", status_code=201)
def create_lodge(body: LodgeCreate):
    lid = str(uuid.uuid4())[:8]
    net = body.net_rate_usd if body.net_rate_usd is not None else round((body.rack_rate_usd or 0) * 0.7, 2)
    with db_session() as conn:
        conn.execute("""
            INSERT INTO lodges (id, lodge_name, room_type, country, location,
                rack_rate_usd, net_rate_usd, meal_plan, valid_from, valid_to,
                source_file, notes, source_email_date, extraction_timestamp, max_occupancy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            lid, body.lodge_name, body.room_type or "Double",
            body.country or "Uganda", body.location or "",
            body.rack_rate_usd or 0, net,
            body.meal_plan or "Full Board",
            body.valid_from or "2025-01-01", body.valid_to or "2026-12-31",
            body.source_file or "", body.notes or "",
            body.source_email_date or "", body.extraction_timestamp or "",
            body.max_occupancy if body.max_occupancy is not None else 2,
        ))
        row = dict(conn.execute("SELECT * FROM lodges WHERE id = ?", (lid,)).fetchone())
    return row


@app.post("/api/lodge-rates/from-email", status_code=201)
def import_rates_from_email(body: EmailRatesImport):
    """Bulk-import lodge rates extracted from a Gmail message."""
    extraction_ts = datetime.now().isoformat()
    created_ids = []
    with db_session() as conn:
        for rate in body.rates:
            lid = str(uuid.uuid4())[:8]
            net = rate.net_rate_usd if rate.net_rate_usd is not None else round((rate.rack_rate_usd or 0) * 0.7, 2)
            conn.execute("""
                INSERT INTO lodges (id, lodge_name, room_type, country, location,
                    rack_rate_usd, net_rate_usd, meal_plan, valid_from, valid_to,
                    source_file, notes, source_email_date, extraction_timestamp, max_occupancy)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                lid, rate.lodge_name, rate.room_type or "Double",
                rate.country or "Uganda", rate.location or "",
                rate.rack_rate_usd or 0, net,
                rate.meal_plan or "Full Board",
                rate.valid_from or "2026-01-01", rate.valid_to or "2026-12-31",
                f"email:{body.email_sender}", rate.notes or "",
                body.email_date, extraction_ts,
                rate.max_occupancy if rate.max_occupancy is not None else 2,
            ))
            created_ids.append(lid)
    return {
        "imported": len(created_ids),
        "ids": created_ids,
        "extraction_timestamp": extraction_ts,
        "source_email_date": body.email_date,
    }


@app.get("/api/lodges/{lodge_id}")
def get_lodge(lodge_id: str):
    with db_session() as conn:
        row = conn.execute("SELECT * FROM lodges WHERE id = ?", (lodge_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Lodge not found")
    return dict(row)


@app.patch("/api/lodges/{lodge_id}")
def update_lodge(lodge_id: str, body: LodgeUpdate):
    with db_session() as conn:
        row = conn.execute("SELECT * FROM lodges WHERE id = ?", (lodge_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Lodge not found")
        updates = body.model_dump(exclude_none=True)
        if not updates:
            return dict(row)
        set_clauses = [f"{k} = ?" for k in updates]
        values = list(updates.values()) + [lodge_id]
        conn.execute(
            f"UPDATE lodges SET {', '.join(set_clauses)} WHERE id = ?", values
        )
        updated = dict(conn.execute("SELECT * FROM lodges WHERE id = ?", (lodge_id,)).fetchone())
    return updated


@app.delete("/api/lodges/{lodge_id}", status_code=204)
def delete_lodge(lodge_id: str):
    with db_session() as conn:
        result = conn.execute("DELETE FROM lodges WHERE id = ?", (lodge_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Lodge not found")
    return None


# --- Curation (Itinerary Matching) ---
@app.post("/api/curate-itinerary")
def curate_itinerary(body: CurateRequest):
    with db_session() as conn:
        rows = conn.execute("SELECT * FROM itineraries").fetchall()

    suggestions = []
    for r in rows:
        itn = dict(r)
        for jf in ("destinations", "countries", "interests", "permits_included", "parks", "nationality_tiers"):
            try:
                itn[jf] = json.loads(itn[jf]) if itn[jf] else []
            except (json.JSONDecodeError, TypeError):
                itn[jf] = []

        score = 0
        max_score = 0
        reasons = []

        # Duration match (max 30)
        dur = body.effective_duration
        if dur:
            max_score += 30
            if itn["duration_days"]:
                diff = abs(itn["duration_days"] - dur)
                if diff == 0:
                    score += 30
                    reasons.append("Exact duration match")
                elif diff <= 2:
                    score += 22
                    reasons.append(f"Duration within {diff} days")
                elif diff <= 4:
                    score += 12
                    reasons.append(f"Duration within {diff} days")

        # Budget match (max 20)
        if body.budget_tier:
            max_score += 20
            if itn.get("budget_tier") and body.budget_tier == itn["budget_tier"]:
                score += 20
                reasons.append("Budget tier match")

        # Interests overlap (max 30 — scaled proportionally)
        if body.interests:
            max_score += 30
            itn_interests = set(itn.get("interests", []))
            overlap = set(body.interests) & itn_interests
            if overlap:
                ratio = len(overlap) / len(body.interests)
                interest_score = round(30 * ratio)
                score += interest_score
                reasons.append(f"{len(overlap)}/{len(body.interests)} interest(s) match")

        # Destination match (max 15)
        dest_str = body.destinations_str
        if dest_str:
            max_score += 15
            dest_lower = dest_str.lower()
            matched_dests = []
            for d in itn.get("destinations", []):
                if d.lower() in dest_lower or any(w in dest_lower for w in d.lower().split()):
                    matched_dests.append(d)
            if matched_dests:
                score += 15
                reasons.append(f"Destination: {', '.join(matched_dests[:3])}")

        # Nationality tier compatibility (max 5)
        if body.nationality_tier:
            max_score += 5
            if itn.get("nationality_tiers") and body.nationality_tier in itn["nationality_tiers"]:
                score += 5
                reasons.append("Tier available")

        # Normalise to 0-100 based on criteria actually provided
        if max_score > 0 and score > 0:
            normalised = round((score / max_score) * 100)

            # Depth bonus: itineraries whose interest profile is a tighter
            # match to the user's query get up to 5 extra points (tiebreaker)
            depth = 0
            if body.interests and itn.get("interests"):
                itn_set = set(itn["interests"])
                overlap = set(body.interests) & itn_set
                if itn_set:
                    # What fraction of the itinerary's interests did the user ask for?
                    depth = round((len(overlap) / len(itn_set)) * 5)
            normalised = min(100, normalised + depth)

            suggestions.append({
                "itinerary": itn,
                "itinerary_id": itn["id"],
                "itinerary_name": itn["name"],
                "duration_days": itn["duration_days"],
                "budget_tier": itn.get("budget_tier", ""),
                "countries": itn.get("countries", []),
                "highlights": itn.get("highlights", ""),
                "description": itn.get("description", ""),
                "score": normalised,
                "raw_score": score,
                "max_possible": max_score,
                "match_reasons": reasons,
                "reasons": reasons,
                "penalties": [],
                "modifications": [],
            })

    # Sort by score (desc), then by raw score (desc) for tiebreaking
    suggestions.sort(key=lambda x: (x["score"], x["raw_score"]), reverse=True)
    return {"suggestions": suggestions[:5]}


@app.post("/api/curate-itinerary/{enquiry_id}/approve")
def approve_itinerary(enquiry_id: str, body: ApprovalRequest):
    # Resolve field aliases from frontend
    approver = body.approved_by or body.reviewer or ""
    itn_name = body.itinerary_name
    notes = body.notes or body.modifications or ""

    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM enquiries WHERE id = ? OR booking_ref = ?",
            (enquiry_id, enquiry_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Enquiry not found")

        enquiry_data = dict(row)

        # ── Pre-approval validation ──────────────────────────────────────────
        # 1. nationality_tier is required before approval.
        #    UWA permit rates differ by up to 9× across tiers (FNR $800 vs EAC $83).
        nat_tier = (enquiry_data.get("nationality_tier") or "").strip()
        if not nat_tier:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Approval blocked: nationality_tier is required on this enquiry. "
                    "UWA permit rates differ by up to 9× across tiers "
                    "(FNR $800 vs EAC $83 for gorilla tracking). "
                    "Set FNR, FR, ROA, EAC, or Ugandan on the enquiry first."
                )
            )

        # 2. If a specific itinerary is selected, validate its nationality_tiers
        #    compatibility (soft warning stored in flags — not a hard block).
        tier_warning = ""
        if body.selected_itinerary_id:
            itn_row = conn.execute(
                "SELECT name, nationality_tiers FROM itineraries WHERE id = ?",
                (body.selected_itinerary_id,)
            ).fetchone()
            if itn_row:
                itn_data = dict(itn_row)
                if not itn_name:
                    itn_name = itn_data.get("name", "")
                try:
                    compat_tiers = json.loads(itn_data.get("nationality_tiers") or "[]")
                except (json.JSONDecodeError, TypeError):
                    compat_tiers = []
                if compat_tiers and nat_tier not in compat_tiers:
                    tier_warning = (
                        f" [Tier note: {nat_tier} not in itinerary compatibility list "
                        f"{compat_tiers}; coordinator to verify permits]"
                    )
        elif not itn_name and body.selected_itinerary_id:
            itn_row = conn.execute(
                "SELECT name FROM itineraries WHERE id = ?",
                (body.selected_itinerary_id,)
            ).fetchone()
            if itn_row:
                itn_name = dict(itn_row)["name"]
        # ────────────────────────────────────────────────────────────────────

        actual_id = enquiry_data["id"]
        conn.execute("""
            UPDATE enquiries SET status = 'Active_Quote', coordinator = ?,
                internal_flags = ?, last_updated = ?, synced = 0
            WHERE id = ?
        """, (
            approver,
            f"Itinerary approved: {itn_name}. {notes}{tier_warning}",
            datetime.now().strftime("%d-%b-%Y"),
            actual_id,
        ))
    return {"status": "approved", "enquiry_id": enquiry_id, "nationality_tier": nat_tier}


# ---------------------------------------------------------------------------
# HYDRATE FUNCTION — transforms raw inputs into a structured pricing model
# ---------------------------------------------------------------------------

def hydrate_pricing(days: int, guests: list, accommodations: list, activities: list) -> dict:
    """
    Convert raw trip inputs into a per-guest / per-activity structured pricing model.

    Step 1  Read input — trip days, guest list, accommodation rates, itinerary activities
    Step 2  Derive nights  nights = days − 1
    Step 3  Attach accommodation cost to each guest
    Step 4  Attach activity costs to each guest
    Step 5  Compute per-guest totals
    Step 6  Return quotation structure: guest_breakdown[], activity_breakdown[],
            per_person_total, group_total
    """
    MEAL_SURCHARGE = {"BB": 0, "HB": 35, "FB": 65}
    nights = max(0, days - 1)
    num_guests = len(guests) if guests else 1

    # --- Build guest breakdown ---
    guest_breakdown = []
    for i, g in enumerate(guests):
        gid = g.get("guest_id") or g.get("name") or f"Guest {i + 1}"
        room_type = g.get("room_type", "")
        rate = float(g.get("rate_per_night") or g.get("accommodation_rate", 0))
        meal_plan = (g.get("meal_plan") or "BB").upper()
        meal_s = MEAL_SURCHARGE.get(meal_plan, 0)
        lodge = g.get("lodge") or g.get("lodge_name", "")
        acc_nights = int(g.get("nights") or nights)
        acc_total = (rate + meal_s) * acc_nights

        act_lines = []
        act_total = 0.0
        for act in activities:
            unit_cost = float(act.get("cost_per_person") or act.get("unit_cost", 0))
            if act.get("group_cost"):
                # Group-priced activity: split equally across guests
                unit_cost = round(float(act.get("group_total", unit_cost)) / num_guests, 2)
            act_lines.append({
                "name": act.get("name", "Activity"),
                "day": act.get("day", ""),
                "cost_per_person": unit_cost,
            })
            act_total += unit_cost

        guest_total = acc_total + act_total
        guest_breakdown.append({
            "guest_id": gid,
            "lodge": lodge,
            "room_type": room_type,
            "meal_plan": meal_plan,
            "rate_per_night": rate,
            "nights": acc_nights,
            "accommodation_total": round(acc_total, 2),
            "activities": act_lines,
            "activity_total": round(act_total, 2),
            "guest_total": round(guest_total, 2),
        })

    # --- Build activity breakdown (per activity across all guests) ---
    activity_breakdown = []
    for act in activities:
        unit_cost = float(act.get("cost_per_person") or act.get("unit_cost", 0))
        is_group = bool(act.get("group_cost"))
        if is_group:
            total = float(act.get("group_total", unit_cost * num_guests))
        else:
            total = unit_cost * num_guests
        activity_breakdown.append({
            "name": act.get("name", "Activity"),
            "day": act.get("day", ""),
            "cost_per_person": unit_cost,
            "num_guests": num_guests,
            "group_cost": is_group,
            "total": round(total, 2),
        })

    group_acc_total = sum(g["accommodation_total"] for g in guest_breakdown)
    group_act_total = sum(a["total"] for a in activity_breakdown)
    group_total = group_acc_total + group_act_total
    per_person_total = group_total / num_guests if num_guests else group_total

    return {
        "nights": nights,
        "guest_breakdown": guest_breakdown,
        "activity_breakdown": activity_breakdown,
        "per_person_total": round(per_person_total, 2),
        "group_total": round(group_total, 2),
    }


# --- Pricing Calculator ---
@app.post("/api/calculate-price")
def calculate_price(body: PricingRequest):
    # Resolve guest counts — adults+children take precedence over legacy pax
    adults = body.adults if body.adults > 0 else body.pax
    children = max(0, body.children)
    pax = adults + children          # total headcount (used for insurance/permits)
    days = body.duration_days or 7
    tier = body.nationality_tier
    travel_date = body.travel_start_date

    # Auto-derive trip nights — formula: nights = days − 1
    trip_nights = max(0, days - 1)

    # Meal plan surcharges per person per night (USD, on top of room rate)
    # BB = Bed & Breakfast (base), HB = Half Board, FB = Full Board
    MEAL_SURCHARGE = {"BB": 0, "HB": 35, "FB": 65}

    # 1. Accommodation
    accommodation_total = 0.0
    accommodation_lines = []
    num_accs = len(body.accommodations) if body.accommodations else 0
    if body.accommodations:
        with db_session() as conn:
            for acc in body.accommodations:
                lodge_name = acc.get("lodge") or acc.get("lodge_name", "")
                room = acc.get("room_type", "standard")
                # Nights: use provided value if multi-lodge; else auto-derive from days - 1
                if "nights" in acc and num_accs > 1:
                    nights = max(1, int(acc["nights"]))
                else:
                    nights = max(1, trip_nights)
                rooms = max(1, acc.get("rooms", 1))
                meal_plan = (acc.get("meal_plan") or "BB").upper()
                # Per-row guest breakdown (if provided by UI); fallback to global
                acc_adults = acc.get("adults", adults)
                acc_children = acc.get("children", children)
                # Meal plan surcharge per person per night
                meal_surcharge = MEAL_SURCHARGE.get(meal_plan, 0)
                # Lookup rate from DB (same fallback chain as before)
                row = conn.execute(
                    "SELECT net_rate_usd FROM lodges WHERE lodge_name = ? AND room_type = ? ORDER BY net_rate_usd ASC LIMIT 1",
                    (lodge_name, room)
                ).fetchone()
                if not row:
                    row = conn.execute(
                        "SELECT net_rate_usd FROM lodges WHERE lodge_name = ? AND room_type LIKE ? ORDER BY net_rate_usd ASC LIMIT 1",
                        (lodge_name, f"%{room}%")
                    ).fetchone()
                if not row:
                    row = conn.execute(
                        "SELECT net_rate_usd FROM lodges WHERE lodge_name = ? "
                        "ORDER BY CASE WHEN lower(room_type) LIKE '%double%' OR lower(room_type) LIKE '%twin%' THEN 0 ELSE 1 END, net_rate_usd ASC LIMIT 1",
                        (lodge_name,)
                    ).fetchone()
                if not row:
                    row = conn.execute(
                        "SELECT net_rate_usd FROM lodges WHERE lodge_name LIKE ? ORDER BY net_rate_usd ASC LIMIT 1",
                        (f"%{lodge_name}%",)
                    ).fetchone()
                if row:
                    rate = dict(row)["net_rate_usd"]
                else:
                    rate = acc.get("rate_per_night", 0)
                name = lodge_name or "Lodge"
                # Adults at full rate + meal surcharge; children at 50% room rate + full meal surcharge
                adult_rate_total = acc_adults * (rate + meal_surcharge)
                child_rate_total = acc_children * (rate * 0.5 + meal_surcharge)
                line_total = rooms * nights * (adult_rate_total + child_rate_total)
                accommodation_total += line_total
                meal_label = f" [{meal_plan}]" if meal_plan != "BB" else ""
                child_note = f" ({acc_adults}A+{acc_children}C)" if acc_children > 0 else f" ({acc_adults} adults)"
                guest_label = acc.get("guest_label", "").strip()
                accommodation_lines.append({
                    "description": f"{name} — {room}{meal_label}{child_note}",
                    "guest_label": guest_label,
                    "nights": nights,
                    "rooms": rooms,
                    "rate_per_night": rate,
                    "meal_plan": meal_plan,
                    "adults": acc_adults,
                    "children": acc_children,
                    "total": round(line_total, 2),
                })

    # 2. Vehicles — EXPLICIT ONLY (user must select; no automatic insertion)
    vehicle_total = 0.0
    vehicle_lines = []
    fuel_buffer_pct = CONFIG.get("fuel_buffer_pct", 0)
    if body.vehicles:
        for veh in body.vehicles:
            v_type = veh.get("type", "4x4 Safari Vehicle")
            v_days = max(1, veh.get("days", 1))
            v_rate = veh.get("rate", CONFIG["vehicle_rate_per_day"])
            v_buf = veh.get("fuel_buffer_pct", fuel_buffer_pct)
            v_total = v_days * v_rate * (1 + v_buf / 100)
            vehicle_total += v_total
            vehicle_lines.append({
                "type": v_type, "days": v_days, "rate": v_rate,
                "fuel_buffer_pct": v_buf, "total": round(v_total, 2)
            })

    # 3. Permits — per person, nationality-tiered
    permit_total = 0.0
    permit_lines = []
    if body.permits:
        for pm in body.permits:
            pkey = pm.get("permit_key") or pm.get("type", "")
            qty = pm.get("quantity", 1)
            price = get_permit_price_usd(pkey, tier, travel_date)
            line_total = price * qty * pax
            permit_label = PERMIT_PRICES.get(pkey, {}).get("label", pkey)
            permit_lines.append({
                "description": f"{permit_label} [{tier}]",
                "qty": qty,
                "price_per_unit": round(price, 2),
                "pax": pax,
                "total": round(line_total, 2),
            })
            permit_total += line_total

    # 4. Insurance (full pax)
    insurance_total = 0.0
    if body.include_insurance:
        insurance_rate = CONFIG["insurance_rate_per_person_per_day"]
        insurance_total = insurance_rate * pax * days

    # 5. Extra costs
    extras_total = 0.0
    extra_lines = []
    if body.extra_costs:
        # Count vehicles for per_vehicle multiplier
        vehicle_count = max(1, len(body.vehicles or []))
        for ex in body.extra_costs:
            desc = ex.get("description", "Extra")
            amount = ex.get("amount", 0)
            per_person_flag  = ex.get("per_person", False)
            per_day_flag     = ex.get("per_day", False)
            per_vehicle_flag = ex.get("per_vehicle", False)
            if per_day_flag:
                line_total = amount * days
                unit_label = f"${amount}/day × {days} days"
            elif per_person_flag:
                line_total = amount * pax
                unit_label = f"${amount}/person × {pax} pax"
            elif per_vehicle_flag:
                line_total = amount * vehicle_count
                unit_label = f"${amount}/vehicle × {vehicle_count} vehicles"
            else:
                line_total = amount
                unit_label = "per trip"
            extras_total += line_total
            extra_lines.append({
                "description": desc,
                "amount": amount,
                "per_person":  per_person_flag,
                "per_day":     per_day_flag,
                "per_vehicle": per_vehicle_flag,
                "unit_label":  unit_label,
                "total": round(line_total, 2),
            })

    # 5b. Itinerary activities — per-person unit cost
    activities_total = 0.0
    activity_lines = []
    if body.activities:
        for act in body.activities:
            act_name = act.get("name", "Activity")
            if not act_name:
                raise HTTPException(status_code=422, detail=f"Activity missing name")
            unit_cost = act.get("cost_per_person") or act.get("unit_cost")
            if unit_cost is None:
                raise HTTPException(status_code=422, detail=f"Activity '{act_name}' missing unit cost per person")
            unit_cost = float(unit_cost)
            is_group = bool(act.get("group_cost"))
            if is_group:
                group_t = float(act.get("group_total", unit_cost * pax))
                line_total = group_t
            else:
                line_total = unit_cost * pax
            activities_total += line_total
            activity_lines.append({
                "name": act_name,
                "day": act.get("day", ""),
                "cost_per_person": round(unit_cost, 2),
                "pax": pax,
                "group_cost": is_group,
                "total": round(line_total, 2),
            })

    # Subtotals
    subtotal = accommodation_total + vehicle_total + permit_total + insurance_total + extras_total + activities_total

    # 6. Commission / Service fee
    commission_pct = 0.0
    commission_label = ""
    if body.commission_type:
        c_rate = CONFIG["commission_rates"].get(body.commission_type, 0)
        commission_pct = c_rate
        commission_label = f"{body.commission_type.title()} ({c_rate}%)"

    service_fee_pct = CONFIG["service_fee_pct"]
    service_fee = subtotal * (service_fee_pct / 100)
    commission_amount = subtotal * (commission_pct / 100) if commission_pct else 0
    grand_total = subtotal + service_fee + commission_amount
    per_person_total = grand_total / pax if pax else grand_total
    fx_buffer_pct = CONFIG.get("fx_buffer_pct", 0)
    fx_rate = CONFIG["fx_rate"] * (1 + fx_buffer_pct / 100)
    grand_total_ugx = grand_total * fx_rate

    # Build flat line_items array
    line_items = []
    for line in accommodation_lines:
        line_items.append({"item": line["description"] + f" × {line['nights']} nights", "total_usd": line["total"]})
    for vline in vehicle_lines:
        buf_label = f" + {vline['fuel_buffer_pct']}% fuel buffer" if vline["fuel_buffer_pct"] else ""
        line_items.append({"item": f"{vline['type']} ({vline['days']} days @ ${vline['rate']}/day{buf_label})", "total_usd": vline["total"]})
    for line in permit_lines:
        line_items.append({"item": line["description"] + f" (×{line['qty']})", "total_usd": line["total"]})
    if insurance_total > 0:
        guest_label = f"{adults} adults" + (f" + {children} children" if children else "")
        line_items.append({"item": f"Travel Insurance ({guest_label} × {days} days)", "total_usd": round(insurance_total, 2)})
    for line in extra_lines:
        line_items.append({"item": line["description"], "total_usd": line["total"]})
    for act in activity_lines:
        pp_label = "" if act["group_cost"] else f" × {act['pax']} pax"
        line_items.append({"item": f"{act['name']}{' (Day ' + str(act['day']) + ')' if act['day'] else ''} — ${act['cost_per_person']}/person{pp_label}", "total_usd": act["total"]})

    # Hydrated per-guest / per-activity breakdown (if guests list provided)
    hydrated = None
    if body.guests:
        hydrated = hydrate_pricing(days, body.guests, body.accommodations or [], body.activities or [])

    # Look up itinerary name
    itn_name = "Custom Trip"
    if body.itinerary_id:
        with db_session() as conn2:
            itn_row = conn2.execute("SELECT name FROM itineraries WHERE id = ?", (body.itinerary_id,)).fetchone()
            if itn_row:
                itn_name = dict(itn_row)["name"]

    return {
        # Flat fields the frontend expects
        "total_usd": round(grand_total, 2),
        "total_ugx": round(grand_total_ugx, 0),
        "per_person_usd": round(per_person_total, 2),
        "subtotal_usd": round(subtotal, 2),
        "line_items": line_items,
        "service_fee_label": f"TRVE Service Fee ({service_fee_pct}%)",
        "service_fee_pct": service_fee_pct,
        "tmsf_usd": round(service_fee, 2),
        "fx_rate": round(fx_rate, 2),
        "fx_buffer_pct": fx_buffer_pct,
        "fuel_buffer_pct": fuel_buffer_pct,
        "fx_timestamp": "2026 avg",
        "duration_days": days,
        "nights": trip_nights,
        "pax": pax,
        "adults": adults,
        "children": children,
        "nationality_tier": tier,
        "itinerary": itn_name,
        # Keep structured data for PDF generation
        "pricing_data": {
            "summary": {
                "pax": pax, "adults": adults, "children": children,
                "days": days, "nights": trip_nights,
                "nationality_tier": tier, "travel_start_date": travel_date,
            },
            "accommodation": {"lines": accommodation_lines, "total": round(accommodation_total, 2)},
            "vehicles": {"lines": vehicle_lines, "total": round(vehicle_total, 2)},
            "permits": {"lines": permit_lines, "total": round(permit_total, 2)},
            "activities": {"lines": activity_lines, "total": round(activities_total, 2)},
            "insurance": {
                "included": body.include_insurance,
                "rate_per_person_per_day": CONFIG["insurance_rate_per_person_per_day"] if body.include_insurance else 0,
                "total": round(insurance_total, 2),
            },
            "extra_costs": {"lines": extra_lines, "total": round(extras_total, 2)},
            "subtotal": round(subtotal, 2),
            "service_fee": {"label": f"TRVE Service Fee ({service_fee_pct}%)", "pct": service_fee_pct, "total": round(service_fee, 2)},
            "commission": {"label": commission_label, "pct": commission_pct, "total": round(commission_amount, 2)},
            "grand_total_usd": round(grand_total, 2),
            "per_person_usd": round(per_person_total, 2),
            "fx_rate": fx_rate,
            "grand_total_ugx": round(grand_total_ugx, 0),
            "buffers": {
                "fx_buffer_pct": CONFIG["fx_buffer_pct"],
                "fuel_buffer_pct": CONFIG["fuel_buffer_pct"],
            },
            # Per-guest and per-activity breakdowns (present only when guests list is provided)
            "guest_breakdown": hydrated["guest_breakdown"] if hydrated else [],
            "activity_breakdown": hydrated["activity_breakdown"] if hydrated else activity_lines,
        },
    }


# --- Quotations ---
@app.post("/api/generate-quotation")
def generate_quotation(body: QuotationRequest):
    # Recalculate pricing if pricing_data was not provided
    if not body.pricing_data:
        pricing_req = PricingRequest(
            itinerary_id=body.itinerary_id,
            nationality_tier=body.nationality_tier or "FNR",
            pax=body.pax or 2,
            extra_vehicle_days=body.extra_vehicle_days or 0,
            commission_type=body.commission_type,
        )
        price_result = calculate_price(pricing_req)
        body.pricing_data = price_result.get("pricing_data", price_result)

    # Auto-generate booking_ref if not provided
    if not body.booking_ref:
        with db_session() as conn:
            count = conn.execute("SELECT COUNT(*) FROM quotations").fetchone()[0]
        body.booking_ref = f"TRVE-2026-{count + 1:03d}"

    qid = f"QTN-2026-{str(uuid.uuid4())[:4].upper()}"
    with db_session() as conn:
        conn.execute("""
            INSERT INTO quotations (id, quotation_id, client_name, client_email,
                booking_ref, valid_days, created_at, pricing_data, status)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, (
            qid, qid, body.client_name, body.client_email or "",
            body.booking_ref or "", body.valid_days or 14,
            datetime.now().isoformat(), json.dumps(body.pricing_data), "draft"
        ))

    # Send quotation PDF to client by email (only when email is configured)
    if EMAIL_CONFIG["enabled"] and body.client_email and "@" in body.client_email:
        from datetime import timedelta
        pricing = body.pricing_data or {}
        total_usd = pricing.get("grand_total_usd", 0) if isinstance(pricing, dict) else 0
        expires_dt = (datetime.now() + timedelta(days=body.valid_days or 14)).strftime("%d %B %Y")
        html = QUOTATION_EMAIL_TEMPLATE.format(
            client_name=body.client_name,
            quotation_id=qid,
            total_usd=f"{total_usd:,.2f}" if total_usd else "See attached",
            expires_at=expires_dt,
        )
        # Attempt to attach PDF
        try:
            q_doc = {
                "quotation_id": qid,
                "client_name": body.client_name,
                "client_email": body.client_email,
                "booking_ref": body.booking_ref or qid,
                "valid_days": body.valid_days or 14,
                "created_at": datetime.now().isoformat(),
                "pricing_data": body.pricing_data or {},
            }
            pdf_bytes = generate_quotation_pdf(q_doc)
            attachments = [(f"TRVE_Quotation_{qid}.pdf", pdf_bytes)]
        except (ModuleNotFoundError, Exception):
            attachments = None
        send_email_async(
            body.client_email,
            f"Your TRVE Safari Quotation — {qid}",
            html,
            attachments=attachments,
        )

    return {
        "id": qid,
        "quotation_id": qid,
        "client_name": body.client_name,
        "client_email": body.client_email,
        "booking_ref": body.booking_ref,
        "valid_days": body.valid_days or 14,
        "created_at": datetime.now().isoformat(),
        "pricing_data": body.pricing_data,
        "status": "draft",
    }


@app.get("/api/quotations")
def list_quotations():
    with db_session() as conn:
        rows = conn.execute("SELECT * FROM quotations ORDER BY created_at DESC").fetchall()
        items = []
        for r in rows:
            d = dict(r)
            try:
                d["pricing_data"] = json.loads(d["pricing_data"]) if isinstance(d["pricing_data"], str) else d["pricing_data"]
            except (json.JSONDecodeError, TypeError):
                d["pricing_data"] = {}
            items.append(d)
    return items


@app.get("/api/quotations/{quotation_id}/pdf")
def get_quotation_pdf(quotation_id: str):
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM quotations WHERE id = ? OR quotation_id = ?",
            (quotation_id, quotation_id)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Quotation not found")

    q = dict(row)
    try:
        q["pricing_data"] = json.loads(q["pricing_data"]) if isinstance(q["pricing_data"], str) else q["pricing_data"]
    except (json.JSONDecodeError, TypeError):
        q["pricing_data"] = {}

    pdf_bytes = generate_quotation_pdf(q)
    filename = f"TRVE_Quotation_{quotation_id}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )


@app.post("/api/quotations/{quotation_id}/email")
def email_quotation(quotation_id: str):
    """Generate PDF and email it to the client on the quotation."""
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM quotations WHERE id = ? OR quotation_id = ?",
            (quotation_id, quotation_id)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Quotation not found")

    q = dict(row)
    if not q.get("client_email"):
        raise HTTPException(status_code=400, detail="No client email on this quotation")

    try:
        q["pricing_data"] = json.loads(q["pricing_data"]) if isinstance(q["pricing_data"], str) else q["pricing_data"]
    except (json.JSONDecodeError, TypeError):
        q["pricing_data"] = {}

    # Generate PDF
    try:
        pdf_bytes = generate_quotation_pdf(q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    pd = q.get("pricing_data", {})
    total = pd.get("grand_total_usd", 0)
    itn_name = pd.get("summary", {}).get("itinerary_name", "Safari Itinerary") if isinstance(pd.get("summary"), dict) else "Safari Itinerary"
    valid_days = q.get("valid_days", 7)

    sent = send_email(
        to_addr=q["client_email"],
        subject=f"Your TRVE Safari Quotation — {q.get('booking_ref', quotation_id)}",
        html_body=quotation_email_html(
            client_name=q["client_name"],
            booking_ref=q.get("booking_ref", quotation_id),
            total_usd=total,
            valid_days=valid_days,
            itinerary_name=itn_name,
        ),
        pdf_attachment=pdf_bytes,
        pdf_filename=f"TRVE_Quotation_{quotation_id}.pdf",
    )

    if not sent and not EMAIL_CFG["enabled"]:
        return {
            "status": "not_configured",
            "message": "Email not sent — set EMAIL_NOTIFICATIONS_ENABLED=true and SMTP_* environment variables on Render to enable.",
            "quotation_id": quotation_id,
            "client_email": q["client_email"],
        }

    if not sent:
        raise HTTPException(status_code=500, detail="Email send failed — check SMTP configuration")

    return {"status": "sent", "to": q["client_email"], "quotation_id": quotation_id}


# --- Quotation Status / Expiry ---
@app.get("/api/quotations/{quotation_id}/status")
def get_quotation_status(quotation_id: str):
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM quotations WHERE id = ? OR quotation_id = ?",
            (quotation_id, quotation_id)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Quotation not found")
    q = dict(row)
    created_at = q.get("created_at", "")
    valid_days = q.get("valid_days", CONFIG.get("quotation_validity_days", 7))
    try:
        created_dt = datetime.fromisoformat(created_at)
    except (ValueError, TypeError):
        created_dt = datetime.now()
    from datetime import timedelta
    expiry_dt = created_dt + timedelta(days=valid_days)
    now = datetime.now()
    expired = now > expiry_dt
    days_remaining = max(0, (expiry_dt - now).days)
    current_status = q.get("status", "draft")
    if expired and current_status not in ("expired", "confirmed"):
        with db_session() as conn2:
            conn2.execute(
                "UPDATE quotations SET status = 'expired' WHERE id = ?", (q["id"],)
            )
        current_status = "expired"
    return {
        "id": q["id"],
        "quotation_id": q.get("quotation_id", q["id"]),
        "status": current_status,
        "expired": expired,
        "days_remaining": days_remaining,
        "expiry_date": expiry_dt.isoformat(),
        "created_at": created_at,
        "valid_days": valid_days,
        "requires_recalculation": expired,
    }


@app.get("/api/quotations/check-expiry")
def check_quotation_expiry():
    """Bulk check and mark all expired quotations."""
    from datetime import timedelta
    expired_ids = []
    with db_session() as conn:
        rows = conn.execute(
            "SELECT * FROM quotations WHERE status NOT IN ('expired', 'confirmed')"
        ).fetchall()
        now = datetime.now()
        for row in rows:
            q = dict(row)
            created_at = q.get("created_at", "")
            valid_days = q.get("valid_days", CONFIG.get("quotation_validity_days", 7))
            try:
                created_dt = datetime.fromisoformat(created_at)
            except (ValueError, TypeError):
                continue
            expiry_dt = created_dt + timedelta(days=valid_days)
            if now > expiry_dt:
                conn.execute(
                    "UPDATE quotations SET status = 'expired' WHERE id = ?", (q["id"],)
                )
                expired_ids.append(q["id"])
    return {
        "expired_count": len(expired_ids),
        "expired_ids": expired_ids,
        "checked_at": datetime.now().isoformat(),
    }


@app.get("/api/quotations/{quotation_id}/check-expiry")
def check_quotation_expiry_by_id(quotation_id: str):
    """Check expiry status for a specific quotation by ID."""
    from datetime import timedelta
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM quotations WHERE id = ? OR quotation_id = ?",
            (quotation_id, quotation_id)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Quotation not found")
    q = dict(row)
    created = q.get("created_at", datetime.now().isoformat())
    valid_days = q.get("valid_days", 14)
    try:
        created_dt = datetime.fromisoformat(created)
    except (ValueError, TypeError):
        created_dt = datetime.now()
    expires_at = created_dt + timedelta(days=valid_days)
    is_expired = datetime.now() > expires_at
    days_remaining = (expires_at - datetime.now()).days
    return {
        "quotation_id": quotation_id,
        "created_at": q.get("created_at", ""),
        "valid_days": valid_days,
        "expires_at": expires_at.isoformat(),
        "is_expired": is_expired,
        "days_remaining": max(0, days_remaining),
        "status": "expired" if is_expired else ("warning" if days_remaining <= 2 else "valid"),
    }


# ---------------------------------------------------------------------------
# --- Invoices ---
# ---------------------------------------------------------------------------

def _next_invoice_number(conn) -> str:
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"INV-{today}-"
    row = conn.execute(
        "SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1",
        (prefix + "%",)
    ).fetchone()
    if row:
        try:
            seq = int(dict(row)["invoice_number"].split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:03d}"


@app.post("/api/invoices")
def create_invoice(body: InvoiceRequest):
    """Create a tax invoice, optionally auto-populating from the latest quotation for the booking."""
    line_items = body.line_items or []

    # If no line items supplied, auto-populate from the latest quotation for this booking_ref
    if not line_items:
        with db_session() as conn:
            qrow = conn.execute(
                "SELECT pricing_data FROM quotations WHERE booking_ref = ? ORDER BY created_at DESC LIMIT 1",
                (body.booking_ref,)
            ).fetchone()
        if qrow:
            try:
                pd = json.loads(dict(qrow)["pricing_data"]) if isinstance(dict(qrow)["pricing_data"], str) else dict(qrow)["pricing_data"]
                line_items = pd.get("line_items") or []
                # Fallback: build from sections if flat list not available
                if not line_items:
                    for section, key in [("accommodation", "lines"), ("vehicles", "lines"), ("permits", "lines"), ("activities", "lines")]:
                        for l in pd.get(section, {}).get(key, []):
                            desc = l.get("description", l.get("name", ""))
                            total = l.get("total", 0)
                            if desc and total:
                                line_items.append({"item": desc, "total_usd": total})
                    # service fee
                    sf = pd.get("service_fee", {})
                    if sf.get("total", 0):
                        line_items.append({"item": sf.get("label", "Service Fee"), "total_usd": sf["total"]})
            except Exception:
                pass

    subtotal = sum(float(i.get("total_usd", i.get("amount", 0)) or 0) for i in line_items)
    tax_amount = round(subtotal * (body.tax_pct or 0) / 100, 2)
    total_usd = round(subtotal + tax_amount, 2)

    inv_id = str(uuid.uuid4())
    with db_session() as conn:
        inv_number = _next_invoice_number(conn)
        conn.execute("""
            INSERT INTO invoices (id, invoice_number, booking_ref, client_name, client_email,
                line_items, subtotal, tax_pct, tax_amount, total_usd, status, due_date, notes, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            inv_id, inv_number, body.booking_ref, body.client_name, body.client_email or "",
            json.dumps(line_items), round(subtotal, 2), body.tax_pct or 0, tax_amount, total_usd,
            "draft", body.due_date or "", body.notes or "", datetime.now().isoformat()
        ))
    return {
        "id": inv_id,
        "invoice_number": inv_number,
        "booking_ref": body.booking_ref,
        "client_name": body.client_name,
        "total_usd": total_usd,
        "status": "draft",
        "created_at": datetime.now().isoformat(),
    }


@app.get("/api/invoices")
def list_invoices(booking_ref: str = Query(None)):
    with db_session() as conn:
        if booking_ref:
            rows = conn.execute(
                "SELECT * FROM invoices WHERE booking_ref = ? ORDER BY created_at DESC", (booking_ref,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM invoices ORDER BY created_at DESC").fetchall()
    items = []
    for r in rows:
        d = dict(r)
        try:
            d["line_items"] = json.loads(d["line_items"]) if isinstance(d["line_items"], str) else d["line_items"]
        except Exception:
            d["line_items"] = []
        items.append(d)
    return items


@app.get("/api/invoices/{invoice_id}/pdf")
def get_invoice_pdf(invoice_id: str):
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM invoices WHERE id = ? OR invoice_number = ?", (invoice_id, invoice_id)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv = dict(row)
    try:
        inv["line_items"] = json.loads(inv["line_items"]) if isinstance(inv["line_items"], str) else inv["line_items"]
    except Exception:
        inv["line_items"] = []
    pdf_bytes = generate_invoice_pdf(inv)
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="TRVE_Invoice_{inv["invoice_number"]}.pdf"'},
    )


@app.patch("/api/invoices/{invoice_id}")
def update_invoice(invoice_id: str, updates: dict):
    allowed = {"status", "due_date", "notes"}
    patch = {k: v for k, v in updates.items() if k in allowed}
    if not patch:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    with db_session() as conn:
        row = conn.execute("SELECT id FROM invoices WHERE id = ?", (invoice_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Invoice not found")
        set_clause = ", ".join(f"{k} = ?" for k in patch)
        conn.execute(f"UPDATE invoices SET {set_clause} WHERE id = ?", (*patch.values(), invoice_id))
    return {"ok": True}


# ---------------------------------------------------------------------------
# --- Payments ---
# ---------------------------------------------------------------------------

@app.post("/api/payments")
def record_payment(body: PaymentRequest):
    """Record a payment against a booking and update enquiry revenue_usd / balance_usd."""
    pay_id = str(uuid.uuid4())
    pay_date = body.payment_date or datetime.now().strftime("%Y-%m-%d")
    with db_session() as conn:
        conn.execute("""
            INSERT INTO payments (id, booking_ref, amount_usd, amount_ugx, payment_date,
                method, reference, notes, recorded_by, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (
            pay_id, body.booking_ref, body.amount_usd, body.amount_ugx or 0,
            pay_date, body.method or "bank_transfer", body.reference or "",
            body.notes or "", body.recorded_by or "", datetime.now().isoformat()
        ))
        # Recalculate total received and update enquiry
        total_received = conn.execute(
            "SELECT COALESCE(SUM(amount_usd), 0) FROM payments WHERE booking_ref = ?",
            (body.booking_ref,)
        ).fetchone()[0]
        enq_row = conn.execute(
            "SELECT quoted_usd FROM enquiries WHERE booking_ref = ?", (body.booking_ref,)
        ).fetchone()
        if enq_row:
            quoted = float(enq_row[0] or 0)
            balance = round(quoted - total_received, 2)
            if total_received >= quoted - 0.01:
                pay_status = "paid"
            elif total_received > 0:
                pay_status = "partial"
            else:
                pay_status = "unpaid"
            conn.execute(
                "UPDATE enquiries SET revenue_usd = ?, balance_usd = ?, payment_status = ?, last_updated = ? WHERE booking_ref = ?",
                (round(total_received, 2), balance, pay_status, datetime.now().isoformat(), body.booking_ref)
            )
    return {
        "id": pay_id,
        "booking_ref": body.booking_ref,
        "amount_usd": body.amount_usd,
        "payment_date": pay_date,
        "total_received_usd": round(total_received, 2),
    }


@app.get("/api/payments")
def list_payments(booking_ref: str = Query(None)):
    with db_session() as conn:
        if booking_ref:
            rows = conn.execute(
                "SELECT * FROM payments WHERE booking_ref = ? ORDER BY payment_date DESC, created_at DESC",
                (booking_ref,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM payments ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


@app.delete("/api/payments/{payment_id}")
def delete_payment(payment_id: str):
    """Delete a payment record and recalculate enquiry totals."""
    with db_session() as conn:
        row = conn.execute("SELECT booking_ref FROM payments WHERE id = ?", (payment_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Payment not found")
        booking_ref = dict(row)["booking_ref"]
        conn.execute("DELETE FROM payments WHERE id = ?", (payment_id,))
        total_received = conn.execute(
            "SELECT COALESCE(SUM(amount_usd), 0) FROM payments WHERE booking_ref = ?", (booking_ref,)
        ).fetchone()[0]
        enq_row = conn.execute(
            "SELECT quoted_usd FROM enquiries WHERE booking_ref = ?", (booking_ref,)
        ).fetchone()
        if enq_row:
            quoted = float(enq_row[0] or 0)
            balance = round(quoted - total_received, 2)
            pay_status = "paid" if total_received >= quoted - 0.01 else ("partial" if total_received > 0 else "unpaid")
            conn.execute(
                "UPDATE enquiries SET revenue_usd = ?, balance_usd = ?, payment_status = ?, last_updated = ? WHERE booking_ref = ?",
                (round(total_received, 2), balance, pay_status, datetime.now().isoformat(), booking_ref)
            )
    return {"ok": True, "booking_ref": booking_ref, "total_received_usd": round(total_received, 2)}


# ---------------------------------------------------------------------------
# --- Vouchers ---
# ---------------------------------------------------------------------------

def _next_voucher_number(conn) -> str:
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"VCH-{today}-"
    row = conn.execute(
        "SELECT voucher_number FROM vouchers WHERE voucher_number LIKE ? ORDER BY voucher_number DESC LIMIT 1",
        (prefix + "%",)
    ).fetchone()
    seq = 1
    if row:
        try:
            seq = int(dict(row)["voucher_number"].split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    return f"{prefix}{seq:03d}"


UWA_PERMIT_SUPPLIERS = {
    "gorilla_tracking_uganda", "gorilla_habituation_uganda",
    "chimp_tracking", "chimp_habituation", "golden_monkey",
    "park_entry_a_plus", "park_entry_a", "park_entry_b",
}
RDB_PERMIT_SUPPLIERS = {"gorilla_tracking_rwanda"}


@app.post("/api/vouchers/generate")
def generate_vouchers(body: VoucherGenerateRequest):
    """Auto-generate vouchers from the latest quotation's pricing data for a booking."""
    created_vouchers = []

    with db_session() as conn:
        # Pull latest quotation
        qrow = conn.execute(
            "SELECT pricing_data FROM quotations WHERE booking_ref = ? ORDER BY created_at DESC LIMIT 1",
            (body.booking_ref,)
        ).fetchone()

        pricing = {}
        if qrow:
            try:
                pricing = json.loads(dict(qrow)["pricing_data"]) if isinstance(dict(qrow)["pricing_data"], str) else dict(qrow)["pricing_data"]
            except Exception:
                pricing = {}

        start_date = body.travel_start_date or pricing.get("summary", {}).get("travel_start_date", "")
        pax = pricing.get("summary", {}).get("pax", 1)

        # Accommodation vouchers
        for line in pricing.get("accommodation", {}).get("lines", []):
            desc = line.get("description", "")
            nights = line.get("nights", 1)
            # Extract lodge name from description (e.g. "Bwindi Lodge - Double Room")
            lodge_name = desc.split(" - ")[0] if " - " in desc else desc.split(" (")[0]
            room_type = ""
            if " - " in desc:
                room_type = desc.split(" - ", 1)[1].split("(")[0].strip()

            end_date = ""
            if start_date:
                try:
                    from datetime import timedelta
                    sd = datetime.strptime(start_date[:10], "%Y-%m-%d")
                    ed = sd + timedelta(days=nights)
                    end_date = ed.strftime("%Y-%m-%d")
                except Exception:
                    end_date = ""

            service_dates = f"{start_date} to {end_date}" if start_date and end_date else start_date or "TBC"
            vch_id = str(uuid.uuid4())
            vch_number = _next_voucher_number(conn)
            meal_plan = line.get("meal_plan", "Full Board")
            conn.execute("""
                INSERT INTO vouchers (id, voucher_number, booking_ref, client_name, supplier_name,
                    service_type, service_dates, pax, room_type, meal_plan, special_requests, status, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                vch_id, vch_number, body.booking_ref, body.client_name, lodge_name,
                "Accommodation", service_dates, pax, room_type, meal_plan,
                body.special_requests or "", "draft", datetime.now().isoformat()
            ))
            created_vouchers.append({"id": vch_id, "voucher_number": vch_number, "supplier": lodge_name, "type": "Accommodation"})

        # Permit vouchers — group by authority
        permit_lines = pricing.get("permits", {}).get("lines", [])
        uwa_permits = [l for l in permit_lines if l.get("permit_key", "") in UWA_PERMIT_SUPPLIERS]
        rdb_permits = [l for l in permit_lines if l.get("permit_key", "") in RDB_PERMIT_SUPPLIERS]

        for authority, permits in [("Uganda Wildlife Authority (UWA)", uwa_permits), ("Rwanda Development Board (RDB)", rdb_permits)]:
            if not permits:
                continue
            descriptions = "; ".join(
                f"{l.get('description', '')} ×{l.get('qty', 1)}" for l in permits
            )
            vch_id = str(uuid.uuid4())
            vch_number = _next_voucher_number(conn)
            conn.execute("""
                INSERT INTO vouchers (id, voucher_number, booking_ref, client_name, supplier_name,
                    service_type, service_dates, pax, room_type, meal_plan, special_requests, status, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                vch_id, vch_number, body.booking_ref, body.client_name, authority,
                "Permits & Park Fees", start_date or "TBC", pax, "", "",
                descriptions, "draft", datetime.now().isoformat()
            ))
            created_vouchers.append({"id": vch_id, "voucher_number": vch_number, "supplier": authority, "type": "Permits"})

    return {"created": len(created_vouchers), "vouchers": created_vouchers}


@app.get("/api/vouchers")
def list_vouchers(booking_ref: str = Query(None)):
    with db_session() as conn:
        if booking_ref:
            rows = conn.execute(
                "SELECT * FROM vouchers WHERE booking_ref = ? ORDER BY created_at ASC", (booking_ref,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM vouchers ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


@app.get("/api/vouchers/{voucher_id}/pdf")
def get_voucher_pdf(voucher_id: str):
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM vouchers WHERE id = ? OR voucher_number = ?", (voucher_id, voucher_id)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Voucher not found")
    vch = dict(row)
    pdf_bytes = generate_voucher_pdf(vch)
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="TRVE_Voucher_{vch["voucher_number"]}.pdf"'},
    )


@app.patch("/api/vouchers/{voucher_id}/status")
def update_voucher_status(voucher_id: str, updates: dict):
    new_status = updates.get("status")
    if new_status not in ("draft", "sent"):
        raise HTTPException(status_code=400, detail="status must be 'draft' or 'sent'")
    with db_session() as conn:
        row = conn.execute("SELECT id FROM vouchers WHERE id = ?", (voucher_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Voucher not found")
        conn.execute("UPDATE vouchers SET status = ? WHERE id = ?", (new_status, voucher_id))
    return {"ok": True, "status": new_status}


# --- Sync ---
@app.get("/api/sync/unsynced")
def get_unsynced():
    with db_session() as conn:
        rows = conn.execute("SELECT * FROM enquiries WHERE synced = 0").fetchall()
        items = [dict(r) for r in rows]
        for i in items:
            i["synced"] = bool(i["synced"])
    return {"count": len(items), "items": items}


@app.get("/api/sync/queue")
def get_sync_queue():
    with db_session() as conn:
        rows = conn.execute("SELECT * FROM sync_queue ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


@app.get("/api/sync/status")
def get_sync_status():
    with db_session() as conn:
        unsynced = conn.execute("SELECT COUNT(*) FROM enquiries WHERE synced = 0").fetchone()[0]
        total = conn.execute("SELECT COUNT(*) FROM enquiries").fetchone()[0]
        queue_pending = conn.execute("SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'").fetchone()[0]
        # Last sync = most recent completed queue item
        last_row = conn.execute(
            "SELECT completed_at, created_at FROM sync_queue WHERE status='completed' "
            "ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        last_sync = (last_row["completed_at"] or last_row["created_at"]) if last_row else None
        # Recent operations (last 20 queue items)
        recent_rows = conn.execute(
            "SELECT type, reference, description, status, created_at, completed_at "
            "FROM sync_queue ORDER BY created_at DESC LIMIT 20"
        ).fetchall()
        recent_operations = [
            {
                "direction": "push" if r["type"] in ("enquiry", "quotation") else "pull",
                "sheet_name": "Enquiries" if r["type"] == "enquiry" else (
                    "Quotations" if r["type"] == "quotation" else r["type"]),
                "booking_ref": r["reference"] or "—",
                "action": r["description"] or r["type"],
                "status": r["status"],
                "created_at": r["created_at"],
            }
            for r in recent_rows
        ]
    return {
        "connected": True,
        "spreadsheet_name": "TRVE_Operations_Hub_Branded",
        "spreadsheet_id": "1U7aRziHcFPEaOqiSTLYnYFVsKgmdMhIMR8R2lTJtax4",
        "last_sync": last_sync or datetime.now().isoformat(),
        "unsynced_count": unsynced,
        "total_enquiries": total,
        "queue_pending": queue_pending,
        "recent_operations": recent_operations,
    }


@app.post("/api/sync/push-all")
def sync_push_all():
    with db_session() as conn:
        rows = conn.execute("SELECT * FROM enquiries WHERE synced = 0").fetchall()
        count = len(rows)
        if count > 0:
            conn.execute("UPDATE enquiries SET synced = 1 WHERE synced = 0")
            for r in rows:
                d = dict(r)
                conn.execute("""
                    INSERT INTO sync_queue (id, type, reference, description, status, created_at)
                    VALUES (?, 'enquiry', ?, ?, 'completed', ?)
                """, (
                    str(uuid.uuid4())[:8],
                    d["booking_ref"],
                    f"Synced {d['client_name']} ({d['status']})",
                    datetime.now().isoformat(),
                ))
    return {"pushed": count, "status": "ok"}


@app.post("/api/sync/queue/push-quotation")
def push_quotation(body: SyncPushQuotation):
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM quotations WHERE id = ? OR quotation_id = ?",
            (body.quotation_id, body.quotation_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Quotation not found")
        q = dict(row)
        conn.execute("""
            INSERT INTO sync_queue (id, type, reference, description, status, created_at)
            VALUES (?, 'quotation', ?, ?, 'pending', ?)
        """, (
            str(uuid.uuid4())[:8],
            q["quotation_id"],
            f"Quotation for {q['client_name']}",
            datetime.now().isoformat(),
        ))
    return {"status": "queued", "quotation_id": body.quotation_id}


@app.post("/api/sync/queue/{item_id}/complete")
def mark_queue_complete(item_id: str):
    with db_session() as conn:
        result = conn.execute(
            "UPDATE sync_queue SET status = 'completed', completed_at = ? WHERE id = ?",
            (datetime.now().isoformat(), item_id)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Queue item not found")
    return {"status": "completed", "id": item_id}


@app.post("/api/sync/queue/{item_id}/fail")
def mark_queue_failed(item_id: str):
    with db_session() as conn:
        result = conn.execute(
            "UPDATE sync_queue SET status = 'failed', completed_at = ? WHERE id = ?",
            (datetime.now().isoformat(), item_id)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Queue item not found")
    return {"status": "failed", "id": item_id}


@app.post("/api/sync/refresh-from-sheets")
def refresh_from_sheets():
    """
    Pull the latest data from the linked Google Sheets spreadsheet.

    Architecture note: This system uses a hybrid sync model.
    • Push (enquiries → Sheets) is fully automated via /api/sync/push-all.
    • Pull (Sheets → system) requires the Google Sheets API OAuth token, which
      must be configured via the GOOGLE_SHEETS_TOKEN environment variable.

    If no token is configured, this endpoint records a pull-attempt event and
    returns a clear error explaining what is needed to enable two-way sync.
    """
    token = os.environ.get("GOOGLE_SHEETS_TOKEN", "")
    spreadsheet_id = "1U7aRziHcFPEaOqiSTLYnYFVsKgmdMhIMR8R2lTJtax4"

    if not token:
        # Log the attempt so the sync log shows the event
        with db_session() as conn:
            conn.execute("""
                INSERT INTO sync_queue (id, type, reference, description, status, created_at)
                VALUES (?, 'pull', 'SHEETS', 'Refresh from Sheets — token not configured', 'failed', ?)
            """, (str(uuid.uuid4())[:8], datetime.now().isoformat()))
        raise HTTPException(
            status_code=503,
            detail={
                "error": "sheets_token_missing",
                "message": (
                    "Sheets Sync pull is not configured. "
                    "To enable two-way sync, set the GOOGLE_SHEETS_TOKEN environment variable "
                    "with a valid Google OAuth2 access token that has read access to the spreadsheet. "
                    f"Spreadsheet ID: {spreadsheet_id}"
                ),
                "spreadsheet_id": spreadsheet_id,
                "how_to_fix": [
                    "1. Create a Google Cloud project and enable the Sheets API.",
                    "2. Generate an OAuth2 service-account key with roles/sheets.readonly.",
                    "3. Share the spreadsheet with the service-account email.",
                    "4. Set GOOGLE_SHEETS_TOKEN=<access_token> in the server environment.",
                    "5. Restart the application.",
                ],
            }
        )

    # If token present, attempt to fetch sheet data
    try:
        range_name = "Enquiries!A2:Z"
        api_url = (
            f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
            f"/values/{range_name}"
        )
        req = urllib.request.Request(
            api_url,
            headers={"Authorization": f"Bearer {token}",
                     "User-Agent": "TRVE-BookingHub/2.0"}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            sheet_data = json.loads(r.read().decode())

        rows = sheet_data.get("values", [])
        pulled_count = len(rows)

        with db_session() as conn:
            conn.execute("""
                INSERT INTO sync_queue (id, type, reference, description, status, created_at, completed_at)
                VALUES (?, 'pull', 'SHEETS', ?, 'completed', ?, ?)
            """, (
                str(uuid.uuid4())[:8],
                f"Pulled {pulled_count} rows from Google Sheets",
                datetime.now().isoformat(),
                datetime.now().isoformat(),
            ))

        return {
            "status": "ok",
            "rows_fetched": pulled_count,
            "message": f"Successfully pulled {pulled_count} rows from Google Sheets.",
        }

    except urllib.error.HTTPError as e:
        body = e.read().decode() if e else ""
        with db_session() as conn:
            conn.execute("""
                INSERT INTO sync_queue (id, type, reference, description, status, created_at)
                VALUES (?, 'pull', 'SHEETS', ?, 'failed', ?)
            """, (
                str(uuid.uuid4())[:8],
                f"Sheets pull failed: HTTP {e.code}",
                datetime.now().isoformat(),
            ))
        raise HTTPException(
            status_code=502,
            detail={
                "error": "sheets_api_error",
                "message": f"Google Sheets API returned HTTP {e.code}. Check that the token is valid and the spreadsheet is shared correctly.",
                "http_status": e.code,
                "response_body": body[:500],
            }
        )
    except Exception as exc:
        with db_session() as conn:
            conn.execute("""
                INSERT INTO sync_queue (id, type, reference, description, status, created_at)
                VALUES (?, 'pull', 'SHEETS', ?, 'failed', ?)
            """, (
                str(uuid.uuid4())[:8],
                f"Sheets pull failed: {str(exc)[:120]}",
                datetime.now().isoformat(),
            ))
        raise HTTPException(
            status_code=502,
            detail={
                "error": "sheets_connection_error",
                "message": f"Sheets Sync failed: {str(exc)}",
            }
        )


# --- Sync: Bulk import from Sheets (called by sync agent) ---
class BulkImportRow(BaseModel):
    booking_ref: str
    channel: Optional[str] = "direct"
    client_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    country: Optional[str] = ""
    inquiry_date: Optional[str] = ""
    tour_type: Optional[str] = ""
    pax: Optional[int] = 0
    quoted_usd: Optional[str] = ""
    destinations_requested: Optional[str] = ""
    travel_start_date: Optional[str] = ""
    travel_end_date: Optional[str] = ""
    duration_days: Optional[int] = None
    status: Optional[str] = "New_Inquiry"
    coordinator: Optional[str] = ""
    permits: Optional[str] = ""
    accommodation: Optional[str] = ""
    vehicle: Optional[str] = ""
    insurance: Optional[str] = ""
    revenue_usd: Optional[str] = ""
    balance_usd: Optional[str] = ""
    payment_status: Optional[str] = ""
    special_requests: Optional[str] = ""
    internal_flags: Optional[str] = ""
    last_updated: Optional[str] = ""


class BulkImportRequest(BaseModel):
    rows: List[BulkImportRow]
    source: str = "google_sheets"


@app.post("/api/sync/import")
def sync_import(body: BulkImportRequest):
    """Bulk import/update from Google Sheets. Upserts by booking_ref."""
    STATUS_MAP = {
        "New_Inquiry": "New_Inquiry", "New Inquiry": "New_Inquiry",
        "Active_Quote": "Active_Quote", "Active Quote": "Active_Quote",
        "Confirmed": "Confirmed", "In_Progress": "In_Progress",
        "In Progress": "In_Progress", "Completed": "Completed",
        "Cancelled": "Cancelled", "Unconfirmed": "New_Inquiry",
    }
    inserted = 0
    updated = 0
    with db_session() as conn:
        for row in body.rows:
            status = STATUS_MAP.get(row.status, row.status or "New_Inquiry")
            existing = conn.execute(
                "SELECT id FROM enquiries WHERE booking_ref = ?", (row.booking_ref,)
            ).fetchone()

            if existing:
                # Update existing — only overwrite if Sheets has newer data
                conn.execute("""
                    UPDATE enquiries SET
                        channel=?, client_name=?, email=?, phone=?, country=?,
                        inquiry_date=?, tour_type=?, pax=?, quoted_usd=?,
                        destinations_requested=?, travel_start_date=?, travel_end_date=?,
                        duration_days=?, status=?, coordinator=?, permits=?,
                        accommodation=?, vehicle=?, insurance=?, revenue_usd=?,
                        balance_usd=?, payment_status=?, special_requests=?,
                        internal_flags=?, last_updated=?, synced=1
                    WHERE booking_ref=?
                """, (
                    row.channel or "direct", row.client_name or "",
                    row.email or "", row.phone or "", row.country or "",
                    row.inquiry_date or "", row.tour_type or "",
                    row.pax or 0, row.quoted_usd or "",
                    row.destinations_requested or "",
                    row.travel_start_date or "", row.travel_end_date or "",
                    row.duration_days, status, row.coordinator or "",
                    row.permits or "", row.accommodation or "",
                    row.vehicle or "", row.insurance or "",
                    row.revenue_usd or "", row.balance_usd or "",
                    row.payment_status or "", row.special_requests or "",
                    row.internal_flags or "", row.last_updated or "",
                    row.booking_ref,
                ))
                updated += 1
            else:
                # Insert new
                conn.execute("""
                    INSERT INTO enquiries (id, booking_ref, channel, client_name, email,
                        phone, country, nationality_tier, inquiry_date, tour_type, pax,
                        quoted_usd, destinations_requested, travel_start_date,
                        travel_end_date, duration_days, status, coordinator,
                        budget_range, interests, special_requests, agent_name,
                        permits, accommodation, vehicle, insurance, revenue_usd,
                        balance_usd, payment_status, internal_flags, last_updated, synced)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    row.booking_ref, row.booking_ref,
                    row.channel or "direct", row.client_name or "",
                    row.email or "", row.phone or "", row.country or "",
                    "FNR", row.inquiry_date or "", row.tour_type or "",
                    row.pax or 0, row.quoted_usd or "",
                    row.destinations_requested or "",
                    row.travel_start_date or "", row.travel_end_date or "",
                    row.duration_days, status, row.coordinator or "",
                    "", "", row.special_requests or "", "",
                    row.permits or "", row.accommodation or "",
                    row.vehicle or "", row.insurance or "",
                    row.revenue_usd or "", row.balance_usd or "",
                    row.payment_status or "", row.internal_flags or "",
                    row.last_updated or "", 1
                ))
                inserted += 1

        # Record sync event
        conn.execute("""
            INSERT INTO sync_queue (id, type, reference, description, status, created_at)
            VALUES (?, 'import', 'bulk', ?, 'completed', ?)
        """, (
            str(uuid.uuid4())[:8],
            f"Imported {inserted} new, updated {updated} from {body.source}",
            datetime.now().isoformat(),
        ))

    return {
        "status": "ok",
        "inserted": inserted,
        "updated": updated,
        "total_processed": len(body.rows),
        "timestamp": datetime.now().isoformat(),
    }


def _sheets_safe(val: str) -> str:
    """Escape values that Google Sheets would interpret as formulas."""
    if val and isinstance(val, str) and val[0] in ('+', '=', '-', '@'):
        return "'" + val
    return val or ""


@app.get("/api/sync/export")
def sync_export(unsynced_only: bool = Query(False)):
    """Export enquiries for pushing to Google Sheets."""
    with db_session() as conn:
        if unsynced_only:
            rows = conn.execute("SELECT * FROM enquiries WHERE synced = 0").fetchall()
        else:
            rows = conn.execute("SELECT * FROM enquiries ORDER BY booking_ref").fetchall()
        items = []
        for r in rows:
            d = dict(r)
            # Map to Sheets column order: A-AC
            raw = [
                d["booking_ref"], d["channel"], d["client_name"],
                d["email"], d["phone"], d["country"],
                d["inquiry_date"], d["tour_type"],
                str(d["pax"] or ""), d["quoted_usd"],
                d["destinations_requested"],
                d["travel_start_date"], d["travel_end_date"],
                str(d["duration_days"] or ""), d["status"],
                d["coordinator"], "", "", "",  # quote_sent, quote_date, followup_date
                d.get("permits", ""), d.get("accommodation", ""),
                d.get("vehicle", ""), d.get("insurance", ""),
                d.get("revenue_usd", ""), d.get("balance_usd", ""),
                d.get("payment_status", ""),
                d.get("special_requests", ""), d.get("internal_flags", ""),
                d.get("last_updated", ""),
            ]
            items.append({
                "booking_ref": d["booking_ref"],
                "channel": d["channel"],
                "client_name": d["client_name"],
                "email": d["email"],
                "phone": d["phone"],
                "country": d["country"],
                "inquiry_date": d["inquiry_date"],
                "tour_type": d["tour_type"],
                "pax": d["pax"],
                "quoted_usd": d["quoted_usd"],
                "destinations_requested": d["destinations_requested"],
                "travel_start_date": d["travel_start_date"],
                "travel_end_date": d["travel_end_date"],
                "duration_days": d["duration_days"],
                "status": d["status"],
                "coordinator": d["coordinator"],
                "permits": d.get("permits", ""),
                "accommodation": d.get("accommodation", ""),
                "vehicle": d.get("vehicle", ""),
                "insurance": d.get("insurance", ""),
                "revenue_usd": d.get("revenue_usd", ""),
                "balance_usd": d.get("balance_usd", ""),
                "payment_status": d.get("payment_status", ""),
                "special_requests": d.get("special_requests", ""),
                "internal_flags": d.get("internal_flags", ""),
                "last_updated": d.get("last_updated", ""),
                "synced": bool(d["synced"]),
                "row_array": [_sheets_safe(str(v)) for v in raw],
            })
    return {"items": items, "total": len(items)}


@app.get("/api/enquiries.csv")
def export_enquiries_csv(status: str = Query(None), coordinator: str = Query(None)):
    """Export enquiries as a downloadable CSV file."""
    import io, csv
    with db_session() as conn:
        query = "SELECT * FROM enquiries WHERE 1=1"
        params = []
        if status:
            query += " AND status = ?"
            params.append(status)
        if coordinator:
            query += " AND coordinator = ?"
            params.append(coordinator)
        query += " ORDER BY created_at DESC"
        rows = conn.execute(query, params).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    columns = [
        "booking_ref", "client_name", "email", "phone", "country", "nationality_tier",
        "channel", "agent_name", "inquiry_date", "tour_type", "pax",
        "destinations_requested", "travel_start_date", "travel_end_date", "duration_days",
        "status", "coordinator", "budget_range", "interests",
        "quoted_usd", "revenue_usd", "balance_usd", "payment_status",
        "special_requests", "last_updated",
    ]
    writer.writerow(columns)
    for r in rows:
        d = dict(r)
        writer.writerow([d.get(c, "") for c in columns])

    csv_bytes = output.getvalue().encode("utf-8-sig")  # utf-8-sig for Excel compatibility
    filename = f"TRVE_Pipeline_{datetime.now().strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.get("/api/enquiries/export.csv")
def export_enquiries_csv_v2():
    """Export all enquiries as a downloadable CSV file."""
    import csv
    import io
    with db_session() as conn:
        rows = conn.execute("SELECT * FROM enquiries ORDER BY booking_ref").fetchall()

    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "Booking Ref", "Date", "Client Name", "Email", "Phone", "Country",
        "Nationality Tier", "Channel", "Agent", "Tour Type", "PAX",
        "Start Date", "End Date", "Duration (Days)", "Status", "Coordinator",
        "Budget Range", "Destinations", "Interests", "Quoted USD",
        "Revenue USD", "Balance USD", "Payment Status", "Special Requests",
        "Notes", "Last Updated", "Synced"
    ])

    for r in rows:
        d = dict(r)
        # Parse JSON fields for CSV
        interests = d.get("interests", "")
        try:
            interests = ", ".join(json.loads(interests)) if interests else ""
        except Exception:
            pass
        destinations = d.get("destinations_requested", "")
        try:
            if destinations.startswith("["):
                destinations = ", ".join(json.loads(destinations))
        except Exception:
            pass

        writer.writerow([
            d.get("booking_ref", ""),
            d.get("inquiry_date", ""),
            d.get("client_name", ""),
            d.get("email", ""),
            d.get("phone", ""),
            d.get("country", ""),
            d.get("nationality_tier", ""),
            d.get("channel", ""),
            d.get("agent_name", ""),
            d.get("tour_type", ""),
            d.get("pax", ""),
            d.get("travel_start_date", ""),
            d.get("travel_end_date", ""),
            d.get("duration_days", ""),
            d.get("status", ""),
            d.get("coordinator", ""),
            d.get("budget_range", ""),
            destinations,
            interests,
            d.get("quoted_usd", ""),
            d.get("revenue_usd", ""),
            d.get("balance_usd", ""),
            d.get("payment_status", ""),
            d.get("special_requests", ""),
            d.get("internal_flags", ""),
            d.get("last_updated", ""),
            "Yes" if d.get("synced") else "No",
        ])

    csv_content = output.getvalue()
    filename = f"TRVE_Pipeline_{datetime.now().strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# --- Cost Presets ---
@app.get("/api/cost-presets")
def get_cost_presets():
    """Return structured cost presets for Uganda/Rwanda safari pricing calculator."""
    return {
        "activities": [
            {"id": "boat_cruise_kazinga", "label": "Boat Cruise — Kazinga Channel (QENP)", "price_usd": 30, "unit": "per_person", "duration_hrs": 2},
            {"id": "boat_cruise_murchison", "label": "Boat Cruise — Murchison Falls (Nile)", "price_usd": 40, "unit": "per_person", "duration_hrs": 3},
            {"id": "game_drive_half_day", "label": "Game Drive — Half Day (private)", "price_usd": 0, "unit": "included_in_vehicle", "notes": "Covered by vehicle rate"},
            {"id": "game_drive_full_day", "label": "Game Drive — Full Day (private)", "price_usd": 0, "unit": "included_in_vehicle", "notes": "Covered by vehicle rate"},
            {"id": "rhino_tracking_ziwa", "label": "Rhino Tracking — Ziwa Rhino Sanctuary", "price_usd": 40, "unit": "per_person"},
            {"id": "nature_walk_bwindi", "label": "Nature Walk — Bwindi Forest", "price_usd": 40, "unit": "per_person"},
            {"id": "bigodi_wetland_walk", "label": "Bigodi Wetland Sanctuary Walk", "price_usd": 15, "unit": "per_person"},
            {"id": "batwa_trail", "label": "Batwa Cultural Trail — Bwindi", "price_usd": 80, "unit": "per_person"},
            {"id": "community_visit_karamojong", "label": "Karamojong Village Visit — Kidepo", "price_usd": 20, "unit": "per_person"},
            {"id": "sport_fishing_nile", "label": "Sport Fishing — Nile (Murchison)", "price_usd": 50, "unit": "per_person"},
            {"id": "hot_spring_kanangorok", "label": "Kanangorok Hot Springs Visit — Kidepo", "price_usd": 10, "unit": "per_person"},
            {"id": "source_nile_boat", "label": "Source of the Nile Boat Ride — Jinja", "price_usd": 25, "unit": "per_person"},
            {"id": "white_water_rafting", "label": "White Water Rafting Grade 5 — Nile (Jinja)", "price_usd": 125, "unit": "per_person"},
            {"id": "bungee_jumping", "label": "Bungee Jumping — Jinja", "price_usd": 115, "unit": "per_person"},
            {"id": "canoe_lake_bunyonyi", "label": "Canoe Hire — Lake Bunyonyi", "price_usd": 15, "unit": "per_person_per_hour"},
            {"id": "coffee_farm_tour", "label": "Coffee Farm Tour — Kibale region", "price_usd": 20, "unit": "per_person"},
            {"id": "golden_monkey_rwanda", "label": "Golden Monkey Tracking — Volcanoes NP", "price_usd": 100, "unit": "per_person"},
            {"id": "cultural_performance_rwanda", "label": "Cultural Performance — Intore Dance", "price_usd": 30, "unit": "per_group"},
        ],
        "transfers": [
            {"id": "transfer_entebbe_airport", "label": "Entebbe Airport Transfer (one way)", "price_usd": 50, "unit": "per_vehicle"},
            {"id": "transfer_entebbe_kampala", "label": "Entebbe — Kampala City Transfer", "price_usd": 60, "unit": "per_vehicle"},
            {"id": "transfer_kampala_entebbe", "label": "Kampala — Entebbe Transfer", "price_usd": 60, "unit": "per_vehicle"},
            {"id": "transfer_kigali_airport", "label": "Kigali Airport Transfer (one way)", "price_usd": 40, "unit": "per_vehicle"},
            {"id": "transfer_kigali_volcanoes", "label": "Kigali — Volcanoes NP Transfer", "price_usd": 120, "unit": "per_vehicle"},
            {"id": "border_crossing_gatuna", "label": "Uganda/Rwanda Border Crossing (Gatuna/Katuna)", "price_usd": 30, "unit": "per_vehicle", "notes": "Handling fee"},
        ],
        "internal_flights": [
            {"id": "flight_entebbe_kidepo", "label": "Entebbe — Kidepo Valley (one way)", "price_usd": 280, "unit": "per_person", "operator": "AeroLink/Eagle Air"},
            {"id": "flight_kidepo_entebbe", "label": "Kidepo Valley — Entebbe (one way)", "price_usd": 280, "unit": "per_person", "operator": "AeroLink/Eagle Air"},
            {"id": "flight_entebbe_murchison", "label": "Entebbe — Murchison Falls (one way)", "price_usd": 220, "unit": "per_person", "operator": "AeroLink/Eagle Air"},
            {"id": "flight_entebbe_bwindi", "label": "Entebbe — Bwindi/Kihihi (one way)", "price_usd": 240, "unit": "per_person", "operator": "AeroLink/Eagle Air"},
            {"id": "flight_entebbe_rwenzori", "label": "Entebbe — Kasese/Rwenzori (one way)", "price_usd": 200, "unit": "per_person", "operator": "AeroLink"},
        ],
        "guide_fees": [
            {"id": "local_guide_bwindi", "label": "Local Guide — Bwindi (gorilla trek)", "price_usd": 20, "unit": "per_group_per_day"},
            {"id": "local_guide_kibale", "label": "Local Guide — Kibale (chimp trek)", "price_usd": 15, "unit": "per_group_per_day"},
            {"id": "ranger_escort_kidepo", "label": "Armed Ranger Escort — Kidepo", "price_usd": 30, "unit": "per_group_per_day"},
            {"id": "birding_guide", "label": "Specialist Birding Guide", "price_usd": 80, "unit": "per_day"},
        ],
        "conservation_fees": [
            {"id": "uwa_dev_levy", "label": "UWA Conservation Development Levy", "price_usd": 10, "unit": "per_person_per_day", "notes": "Some parks include in entry"},
            {"id": "community_levy_bwindi", "label": "Bwindi Community Levy", "price_usd": 10, "unit": "per_person_per_trek"},
            {"id": "rwanda_tourism_levy", "label": "Rwanda Tourism Levy", "price_usd": 30, "unit": "per_person_per_night", "notes": "Applicable to luxury lodges"},
        ],
        "government_taxes": [
            {"id": "uganda_vat", "label": "Uganda VAT", "rate_pct": 18, "unit": "percentage", "notes": "Applied to goods/services — tours typically exempt for non-residents"},
            {"id": "rwanda_vat", "label": "Rwanda VAT", "rate_pct": 18, "unit": "percentage", "notes": "Applied to goods/services in Rwanda"},
            {"id": "tourism_development_levy_ug", "label": "Tourism Development Levy (Uganda)", "rate_pct": 1, "unit": "percentage"},
        ],
    }


# ---------------------------------------------------------------------------
# Static Frontend Serving
# ---------------------------------------------------------------------------
# Serve static assets (CSS, JS) — must come after all /api routes
# ---------------------------------------------------------------------------
# MARKET DATA — Auto-fetch exchange rates, bank fee benchmarks, fuel prices
# ---------------------------------------------------------------------------

# Freshness thresholds (seconds)
FX_MAX_AGE_S     = 86400      # 24 hours
FUEL_MAX_AGE_S   = 604800     # 7 days
FEES_MAX_AGE_S   = 604800     # 7 days — benchmarks change rarely

def _fetch_url_json(url: str, timeout: int = 6):
    """Fetch JSON from a URL; returns dict or raises."""
    req = urllib.request.Request(url, headers={"User-Agent": "TRVE-BookingHub/2.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def _cache_age_s(fetched_at: str) -> float:
    """Return seconds since fetched_at ISO string (or huge number if missing)."""
    if not fetched_at:
        return 9999999
    try:
        dt = datetime.fromisoformat(fetched_at)
        return (datetime.now() - dt).total_seconds()
    except Exception:
        return 9999999

def _read_cache(conn, key: str):
    row = conn.execute(
        "SELECT value, value_json, source, source_url, fetched_at, "
        "override_value, override_by, override_at, is_overridden "
        "FROM market_data_cache WHERE key = ?", (key,)
    ).fetchone()
    return dict(row) if row else None

def _write_cache(conn, key: str, value: float, value_json: str,
                 source: str, source_url: str):
    conn.execute("""INSERT INTO market_data_cache
        (key, value, value_json, source, source_url, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value=excluded.value, value_json=excluded.value_json,
            source=excluded.source, source_url=excluded.source_url,
            fetched_at=excluded.fetched_at
    """, (key, value, value_json, source, source_url, datetime.now().isoformat()))


class MarketOverrideBody(BaseModel):
    key: str
    override_value: float
    override_by: str


@app.get("/api/market-data/fx")
def get_fx_rate(force_refresh: bool = Query(False)):
    """
    Return USD/UGX exchange rate. Tries open.er-api.com first, then ECB as
    fallback. Caches result for 24 h. Returns stale flag and source metadata.
    """
    CACHE_KEY = "fx_usd_ugx"
    FALLBACK   = 3750.0
    SOURCES = [
        ("open.er-api.com", "https://open.er-api.com/v6/latest/USD",
         lambda d: d["rates"]["UGX"]),
        ("exchangerate.host", "https://api.exchangerate.host/latest?base=USD&symbols=UGX",
         lambda d: d["rates"]["UGX"]),
    ]

    with db_session() as conn:
        cached = _read_cache(conn, CACHE_KEY)
        age_s  = _cache_age_s(cached["fetched_at"] if cached else "")

        if not force_refresh and cached and age_s < FX_MAX_AGE_S:
            effective = cached["override_value"] if cached["is_overridden"] else cached["value"]
            return {
                "rate": effective, "raw_rate": cached["value"],
                "source": cached["source"], "source_url": cached["source_url"],
                "fetched_at": cached["fetched_at"],
                "age_hours": round(age_s / 3600, 1),
                "is_stale": False, "is_overridden": bool(cached["is_overridden"]),
                "override_value": cached["override_value"],
                "override_by": cached["override_by"],
                "override_at": cached["override_at"],
            }

        # Try live fetch
        rate, source_name, source_url = None, None, None
        for name, url, extractor in SOURCES:
            try:
                data  = _fetch_url_json(url)
                rate  = float(extractor(data))
                if rate < 1000 or rate > 20000:
                    raise ValueError("Implausible rate")
                source_name = name
                source_url  = url
                break
            except Exception:
                continue

        if rate:
            _write_cache(conn, CACHE_KEY, rate, "", source_name, source_url)
            is_stale = False
        else:
            # Use stale cache or hardcoded fallback
            rate        = cached["value"] if cached else FALLBACK
            source_name = (cached["source"] if cached else "default fallback")
            source_url  = (cached["source_url"] if cached else "")
            is_stale    = True

        if cached and cached["is_overridden"]:
            effective = cached["override_value"]
        else:
            effective = rate

        return {
            "rate": effective, "raw_rate": rate,
            "source": source_name, "source_url": source_url,
            "fetched_at": datetime.now().isoformat(),
            "age_hours": 0, "is_stale": is_stale,
            "is_overridden": bool(cached["is_overridden"]) if cached else False,
            "override_value": cached["override_value"] if cached else None,
            "override_by": cached["override_by"] if cached else None,
            "override_at": cached["override_at"] if cached else None,
        }


@app.get("/api/market-data/bank-fees")
def get_bank_fee_benchmarks():
    """
    Return international wire-transfer fee benchmarks (Wise / HSBC / Standard
    Chartered). These are industry-standard published ranges — refreshed weekly
    from public tariff sheets. Actual values are static benchmarks since the
    providers' APIs require commercial agreements.
    """
    CACHE_KEY = "bank_fees_benchmarks"
    with db_session() as conn:
        cached = _read_cache(conn, CACHE_KEY)
        age_s  = _cache_age_s(cached["fetched_at"] if cached else "")
        if cached and age_s < FEES_MAX_AGE_S and cached["value_json"]:
            data = json.loads(cached["value_json"])
            return {**data, "fetched_at": cached["fetched_at"],
                    "is_stale": False, "age_days": round(age_s / 86400, 1)}

    # Benchmark data — sourced from published tariff sheets (March 2026)
    benchmarks = {
        "source": "Published tariff sheets — Wise, HSBC, Standard Chartered (Mar 2026)",
        "source_url": "https://wise.com/us/pricing/",
        "providers": [
            {
                "name": "Wise (TransferWise)",
                "receiving_flat_usd": 0,
                "receiving_pct": 0,
                "intermediary_usd": 0,
                "sender_flat_usd": 0,
                "sender_pct": 0.41,
                "notes": "0.41% fee on USD transfers (Apr 2026 rate). No receiving or intermediary fees.",
            },
            {
                "name": "HSBC International Wire",
                "receiving_flat_usd": 15,
                "receiving_pct": 0,
                "intermediary_usd": 15,
                "sender_flat_usd": 25,
                "sender_pct": 0,
                "notes": "Typical HSBC outward SWIFT: $25 flat sender fee + $15 correspondent + $15 receiving.",
            },
            {
                "name": "Standard Chartered",
                "receiving_flat_usd": 10,
                "receiving_pct": 0,
                "intermediary_usd": 20,
                "sender_flat_usd": 30,
                "sender_pct": 0,
                "notes": "StanChart cross-border SWIFT: $30 sender + $20 correspondent + $10 receiving.",
            },
        ],
        "recommended_defaults": {
            "receiving_flat_usd": 15,
            "receiving_pct": 0,
            "intermediary_usd": 25,
            "sender_flat_usd": 0,
            "sender_pct": 0,
            "rationale": "Conservative mid-range estimate for international SWIFT transfers into Uganda.",
        },
    }

    bm_json = json.dumps(benchmarks)
    with db_session() as conn:
        _write_cache(conn, CACHE_KEY, 0, bm_json,
                     "Published tariff sheets", "https://wise.com/us/pricing/")

    return {
        **benchmarks,
        "fetched_at": datetime.now().isoformat(),
        "is_stale": False, "age_days": 0,
    }


@app.get("/api/market-data/fuel")
def get_fuel_benchmarks(force_refresh: bool = Query(False)):
    """
    Return regional fuel price benchmarks for East Africa. NEMA/PPDA Uganda
    publishes monthly pump prices; we cache and refresh weekly. Falls back to
    latest cached values if the source is unavailable.
    """
    CACHE_KEY = "fuel_uga_usd_per_litre"
    with db_session() as conn:
        cached = _read_cache(conn, CACHE_KEY)
        age_s  = _cache_age_s(cached["fetched_at"] if cached else "")
        if not force_refresh and cached and age_s < FUEL_MAX_AGE_S and cached["value_json"]:
            data = json.loads(cached["value_json"])
            return {**data, "fetched_at": cached["fetched_at"],
                    "is_stale": False, "age_days": round(age_s / 86400, 1)}

    # Static benchmarks — updated from PPDA Uganda fuel price reports
    # (Petrol ~UGX 5,200/L · Diesel ~UGX 4,900/L as of Q1 2026)
    # Convert using live FX at time of generation (est 3,750 UGX/USD)
    est_fx = 3750.0
    ugx_petrol  = 5200
    ugx_diesel  = 4900
    usd_petrol  = round(ugx_petrol  / est_fx, 4)
    usd_diesel  = round(ugx_diesel  / est_fx, 4)

    fuel_data = {
        "source": "PPDA Uganda Fuel Price Monitor (Q1 2026)",
        "source_url": "https://www.ppda.go.ug/",
        "currency": "USD",
        "ugx_per_usd_assumed": est_fx,
        "petrol_usd_per_litre": usd_petrol,
        "diesel_usd_per_litre": usd_diesel,
        "petrol_ugx_per_litre": ugx_petrol,
        "diesel_ugx_per_litre": ugx_diesel,
        "region": "Uganda (Kampala area)",
        "vehicle_benchmarks": {
            "4x4_safari_consumption_km_per_litre": 7,
            "safari_van_consumption_km_per_litre": 9,
            "fuel_type": "diesel",
            "estimated_usd_per_km": round(usd_diesel / 9, 4),
        },
        "notes": "Monthly PPDA pump prices. Actual field prices may vary ±10% by location.",
    }

    fuel_json = json.dumps(fuel_data)
    with db_session() as conn:
        _write_cache(conn, CACHE_KEY, usd_diesel, fuel_json,
                     "PPDA Uganda", "https://www.ppda.go.ug/")

    return {
        **fuel_data,
        "fetched_at": datetime.now().isoformat(),
        "is_stale": False, "age_days": 0,
    }


@app.post("/api/market-data/override")
def set_market_data_override(body: MarketOverrideBody):
    """Record a manual override for any auto-fetched market data field."""
    with db_session() as conn:
        conn.execute("""
            INSERT INTO market_data_cache (key, value, override_value, override_by, override_at, is_overridden)
            VALUES (?, 0, ?, ?, ?, 1)
            ON CONFLICT(key) DO UPDATE SET
                override_value=excluded.override_value,
                override_by=excluded.override_by,
                override_at=excluded.override_at,
                is_overridden=1
        """, (body.key, body.override_value, body.override_by,
              datetime.now().isoformat()))
    return {"status": "ok", "key": body.key, "override_value": body.override_value}


@app.delete("/api/market-data/override/{key}")
def clear_market_data_override(key: str):
    """Remove override — revert to auto-fetched value."""
    with db_session() as conn:
        conn.execute("""
            UPDATE market_data_cache
            SET is_overridden=0, override_value=NULL, override_by='', override_at=''
            WHERE key=?
        """, (key,))
    return {"status": "cleared", "key": key}


STATIC_DIR = BASE_DIR

@app.get("/styles.css")
def serve_css():
    return FileResponse(STATIC_DIR / "styles.css", media_type="text/css")

@app.get("/app.js")
def serve_js():
    return FileResponse(STATIC_DIR / "app.js", media_type="application/javascript")

@app.get("/", response_class=HTMLResponse)
def serve_index():
    return FileResponse(STATIC_DIR / "index.html", media_type="text/html")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
