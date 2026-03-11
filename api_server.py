#!/usr/bin/env python3
"""
TRVE Booking Hub — FastAPI Backend v2.0
SQLite-backed, full 18-itinerary library, branded PDF quotation engine.
Runs on port 8000.
"""

import json
import os
import re
import smtplib
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, date
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from io import BytesIO
from pathlib import Path
from typing import Optional, List, Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

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
    notes TEXT DEFAULT ''
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

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    enquiry_id TEXT DEFAULT '',
    booking_ref TEXT DEFAULT '',
    description TEXT NOT NULL,
    due_date TEXT DEFAULT '',
    assigned_to TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permit_slots (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    permit_type TEXT NOT NULL,
    habitat TEXT DEFAULT '',
    total_slots INTEGER DEFAULT 8,
    booked INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_enquiries_booking_ref ON enquiries(booking_ref);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
CREATE INDEX IF NOT EXISTS idx_lodges_name ON lodges(lodge_name);
CREATE INDEX IF NOT EXISTS idx_lodges_country ON lodges(country);
CREATE INDEX IF NOT EXISTS idx_quotations_booking_ref ON quotations(booking_ref);
CREATE INDEX IF NOT EXISTS idx_tasks_enquiry_id ON tasks(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
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
FX_RATE = 3575  # UGX/USD 2026 average


def get_permit_price_usd(permit_key, tier, travel_date_str=None):
    p = PERMIT_PRICES.get(permit_key)
    if not p:
        return 0
    tier_key = tier or "FNR"

    # Post July 2026
    if travel_date_str and "post_july_2026" in p:
        try:
            d = datetime.strptime(travel_date_str, "%Y-%m-%d").date()
            if d >= date(2026, 7, 1) and tier_key in p["post_july_2026"]:
                val = p["post_july_2026"][tier_key]
                return val if p.get("currency_eac") == "USD" or tier_key not in ("EAC", "Ugandan") else val / FX_RATE
        except ValueError:
            pass

    # Low season
    if travel_date_str and "low_season" in p:
        try:
            d = datetime.strptime(travel_date_str, "%Y-%m-%d").date()
            if d.month in LOW_SEASON_MONTHS and tier_key in p["low_season"]:
                val = p["low_season"][tier_key]
                return val if p.get("currency_eac") == "USD" or tier_key not in ("EAC", "Ugandan") else val / FX_RATE
        except ValueError:
            pass

    val = p.get(tier_key, p.get("FNR", 0))
    if tier_key in ("EAC", "Ugandan") and p.get("currency_eac") == "UGX":
        return val / FX_RATE
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
    "last_updated": datetime.now().isoformat(),
}

# ---------------------------------------------------------------------------
# Database initialization + migration from JSON
# ---------------------------------------------------------------------------
def init_db():
    """Create tables and migrate data from JSON files if DB is fresh."""
    conn = get_db()
    conn.executescript(SCHEMA)

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
    """Generate a branded TRVE quotation PDF."""
    from fpdf import FPDF

    class TRVEQuotationPDF(FPDF):
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
    if acc.get("lines"):
        section_header("Accommodation")
        cols = [(80, "Lodge / Room"), (20, "Nights"), (25, "Rate/Night"), (20, "Pax"), (45, "Total USD")]
        table_header(cols)
        for line in acc["lines"]:
            table_row(cols, [
                line.get("description", ""),
                line.get("nights", ""),
                f"${line.get('rate_per_night', 0):,.0f}",
                line.get("pax", ""),
                f"${line.get('total', 0):,.2f}",
            ])
        section_total("Accommodation Subtotal", acc.get("total", 0))
        pdf.ln(3)

    # --- Permits ---
    prm = pricing.get("permits", {})
    if prm.get("lines"):
        section_header("Permits & Activities")
        cols = [(80, "Permit / Activity"), (20, "Qty"), (25, "Unit Price"), (20, "Pax"), (45, "Total USD")]
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

    # --- Vehicle ---
    veh = pricing.get("vehicle", {})
    if veh.get("total"):
        section_header("Vehicle & Transport")
        pdf.set_font('Helvetica', '', 9)
        pdf.cell(0, 6, f"4x4 Safari Vehicle: {veh.get('days', 0)} days x ${veh.get('rate_per_day', 0)}/day = ${veh.get('total', 0):,.2f}", ln=True)
        pdf.ln(3)

    # --- Insurance ---
    ins = pricing.get("insurance", {})
    if ins.get("included") and ins.get("total", 0) > 0:
        section_header("Travel Insurance")
        pdf.set_font('Helvetica', '', 9)
        pdf.cell(0, 6, f"${ins.get('rate_per_person_per_day', 0)}/person/day x {summary.get('pax', 0)} pax x {summary.get('days', 0)} days = ${ins.get('total', 0):,.2f}", ln=True)
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

    # --- Terms ---
    pdf.ln(8)
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_text_color(13, 94, 79)
    pdf.cell(0, 8, "Terms & Conditions", ln=True)
    pdf.set_font('Helvetica', '', 8)
    pdf.set_text_color(80, 80, 80)
    terms = [
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
    nationality_tier: Optional[str] = "FNR"
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


class PricingRequest(BaseModel):
    itinerary_id: Optional[str] = None
    nationality_tier: str = "FNR"
    pax: int = 2
    duration_days: Optional[int] = 7
    extra_vehicle_days: Optional[int] = 0
    travel_start_date: Optional[str] = None
    include_insurance: bool = False
    commission_type: Optional[str] = None
    accommodations: Optional[List[dict]] = []
    permits: Optional[List[dict]] = []
    extra_costs: Optional[List[dict]] = []


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


# --- Config ---
@app.get("/api/config")
def get_config():
    CONFIG["last_updated"] = datetime.now().isoformat()
    return CONFIG


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
            body.nationality_tier or "FNR", now_str, body.tour_type or "",
            body.pax or 2, "", dest_str, body.travel_start_date or "",
            body.travel_end_date or "", body.duration_days, "New_Inquiry", "",
            body.budget_range or "", interests_str, body.special_requests or "",
            body.agent_name or "", "", "", "", "", "", "", "", "", now_str, 0
        ))

        entry = dict(conn.execute(
            "SELECT * FROM enquiries WHERE id = ?", (booking_ref,)
        ).fetchone())
        entry["synced"] = bool(entry["synced"])

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

        actual_id = dict(row)["id"]
        values.append(actual_id)
        conn.execute(
            f"UPDATE enquiries SET {', '.join(set_clauses)} WHERE id = ?",
            values
        )
        updated = dict(conn.execute("SELECT * FROM enquiries WHERE id = ?", (actual_id,)).fetchone())
        updated["synced"] = bool(updated["synced"])
    return updated


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
        })
    return list(lodge_map.values())


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

        # If we have selected_itinerary_id but no name, look it up
        if not itn_name and body.selected_itinerary_id:
            itn_row = conn.execute(
                "SELECT name FROM itineraries WHERE id = ?",
                (body.selected_itinerary_id,)
            ).fetchone()
            if itn_row:
                itn_name = dict(itn_row)["name"]

        actual_id = dict(row)["id"]
        conn.execute("""
            UPDATE enquiries SET status = 'Active_Quote', coordinator = ?,
                internal_flags = ?, last_updated = ?, synced = 0
            WHERE id = ?
        """, (
            approver,
            f"Itinerary approved: {itn_name}. {notes}",
            datetime.now().strftime("%d-%b-%Y"),
            actual_id,
        ))
    return {"status": "approved", "enquiry_id": enquiry_id}


# --- Pricing Calculator ---
@app.post("/api/calculate-price")
def calculate_price(body: PricingRequest):
    pax = body.pax or 2
    days = body.duration_days or 7
    tier = body.nationality_tier or "FNR"
    travel_date = body.travel_start_date

    # 1. Accommodation
    accommodation_total = 0.0
    accommodation_lines = []
    if body.accommodations:
        with db_session() as conn:
            for acc in body.accommodations:
                lodge_name = acc.get("lodge") or acc.get("lodge_name", "")
                room = acc.get("room_type", "standard")
                nights = acc.get("nights", 1)
                # FIX: Try exact room_type match first (UI now sends exact DB values)
                # ORDER BY net_rate_usd ASC → returns base/low-season rate as default
                # Separate single supplement logic prevents double rate being returned for singles
                row = conn.execute(
                    "SELECT net_rate_usd FROM lodges WHERE lodge_name = ? AND room_type = ? ORDER BY net_rate_usd ASC LIMIT 1",
                    (lodge_name, room)
                ).fetchone()
                if not row:
                    # Fallback 1: LIKE match (handles partial values / legacy data)
                    row = conn.execute(
                        "SELECT net_rate_usd FROM lodges WHERE lodge_name = ? AND room_type LIKE ? ORDER BY net_rate_usd ASC LIMIT 1",
                        (lodge_name, f"%{room}%")
                    ).fetchone()
                if not row:
                    # Fallback 2: lodge name only — prefer double/twin as base occupancy
                    # Do NOT silently return single room data for double selections or vice versa
                    row = conn.execute(
                        "SELECT net_rate_usd FROM lodges WHERE lodge_name = ? "
                        "ORDER BY CASE WHEN lower(room_type) LIKE '%double%' OR lower(room_type) LIKE '%twin%' THEN 0 ELSE 1 END, net_rate_usd ASC LIMIT 1",
                        (lodge_name,)
                    ).fetchone()
                if not row:
                    # Fallback 3: fuzzy lodge name match
                    row = conn.execute(
                        "SELECT net_rate_usd FROM lodges WHERE lodge_name LIKE ? ORDER BY net_rate_usd ASC LIMIT 1",
                        (f"%{lodge_name}%",)
                    ).fetchone()
                if row:
                    rate = dict(row)["net_rate_usd"]
                else:
                    rate = acc.get("rate_per_night", 0)
                name = lodge_name or "Lodge"
                line_total = nights * rate * pax
                accommodation_total += line_total
                accommodation_lines.append({
                    "description": f"{name} — {room}",
                    "nights": nights,
                    "rate_per_night": rate,
                    "pax": pax,
                    "total": round(line_total, 2),
                })

    # 2. Vehicle
    v_days = (body.extra_vehicle_days or 0) + (days - 1 if days > 1 else days)
    vehicle_rate = CONFIG["vehicle_rate_per_day"]
    vehicle_total = v_days * vehicle_rate

    # 3. Permits
    permit_total = 0.0
    permit_lines = []
    if body.permits:
        for pm in body.permits:
            pkey = pm.get("permit_key") or pm.get("type", "")
            qty = pm.get("quantity", 1)
            price = get_permit_price_usd(pkey, tier, travel_date)
            line_total = price * qty * pax
            permit_lines.append({
                "description": PERMIT_PRICES.get(pkey, {}).get("label", pkey),
                "qty": qty,
                "price_per_unit": round(price, 2),
                "pax": pax,
                "total": round(line_total, 2),
            })
            permit_total += line_total

    # 4. Insurance
    insurance_total = 0.0
    if body.include_insurance:
        insurance_rate = CONFIG["insurance_rate_per_person_per_day"]
        insurance_total = insurance_rate * pax * days

    # 5. Extra costs
    extras_total = 0.0
    extra_lines = []
    if body.extra_costs:
        for ex in body.extra_costs:
            desc = ex.get("description", "Extra")
            amount = ex.get("amount", 0)
            per_person = ex.get("per_person", False)
            line_total = amount * pax if per_person else amount
            extras_total += line_total
            extra_lines.append({
                "description": desc,
                "amount": amount,
                "per_person": per_person,
                "total": round(line_total, 2),
            })

    # Subtotals
    subtotal = accommodation_total + vehicle_total + permit_total + insurance_total + extras_total

    # 6. Commission / Service fee
    commission_pct = 0.0
    commission_label = ""
    if body.commission_type:
        rate = CONFIG["commission_rates"].get(body.commission_type, 0)
        commission_pct = rate
        commission_label = f"{body.commission_type.title()} ({rate}%)"

    service_fee_pct = CONFIG["service_fee_pct"]
    service_fee = subtotal * (service_fee_pct / 100)
    commission_amount = subtotal * (commission_pct / 100) if commission_pct else 0
    grand_total = subtotal + service_fee + commission_amount
    per_person = grand_total / pax if pax else grand_total
    fx_rate = CONFIG["fx_rate"]
    grand_total_ugx = grand_total * fx_rate

    # Build flat line_items array
    line_items = []
    for line in accommodation_lines:
        line_items.append({"item": line["description"] + f" ({line['nights']} nights)", "total_usd": line["total"]})
    if vehicle_total > 0:
        line_items.append({"item": f"4x4 Safari Vehicle ({v_days} days @ ${vehicle_rate}/day)", "total_usd": round(vehicle_total, 2)})
    for line in permit_lines:
        line_items.append({"item": line["description"] + f" (x{line['qty']})", "total_usd": line["total"]})
    if insurance_total > 0:
        line_items.append({"item": f"Travel Insurance ({pax} pax x {days} days)", "total_usd": round(insurance_total, 2)})
    for line in extra_lines:
        line_items.append({"item": line["description"], "total_usd": line["total"]})

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
        "per_person_usd": round(per_person, 2),
        "subtotal_usd": round(subtotal, 2),
        "line_items": line_items,
        "service_fee_label": f"TRVE Service Fee ({service_fee_pct}%)",
        "service_fee_pct": service_fee_pct,
        "tmsf_usd": round(service_fee, 2),
        "fx_rate": fx_rate,
        "fx_timestamp": "2026 avg",
        "duration_days": days,
        "pax": pax,
        "nationality_tier": tier,
        "itinerary": itn_name,
        # Keep structured data for PDF generation
        "pricing_data": {
            "summary": {"pax": pax, "days": days, "nationality_tier": tier, "travel_start_date": travel_date},
            "accommodation": {"lines": accommodation_lines, "total": round(accommodation_total, 2)},
            "vehicle": {"days": v_days, "rate_per_day": vehicle_rate, "total": round(vehicle_total, 2)},
            "permits": {"lines": permit_lines, "total": round(permit_total, 2)},
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
            "per_person_usd": round(per_person, 2),
            "fx_rate": fx_rate,
            "grand_total_ugx": round(grand_total_ugx, 0),
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
    return {
        "connected": True,
        "spreadsheet_name": "TRVE_Operations_Hub_Branded",
        "spreadsheet_id": "1U7aRziHcFPEaOqiSTLYnYFVsKgmdMhIMR8R2lTJtax4",
        "last_sync": datetime.now().isoformat(),
        "unsynced_count": unsynced,
        "total_enquiries": total,
        "queue_pending": queue_pending,
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


# ---------------------------------------------------------------------------
# ANALYTICS
# ---------------------------------------------------------------------------
@app.get("/api/analytics")
def get_analytics():
    today = date.today().isoformat()
    with db_session() as conn:
        total = conn.execute("SELECT COUNT(*) FROM enquiries").fetchone()[0]
        new_count = conn.execute("SELECT COUNT(*) FROM enquiries WHERE status='New_Inquiry'").fetchone()[0]
        active_quote_count = conn.execute("SELECT COUNT(*) FROM enquiries WHERE status='Active_Quote'").fetchone()[0]
        confirmed_count = conn.execute("SELECT COUNT(*) FROM enquiries WHERE status='Confirmed'").fetchone()[0]
        total_pipeline = conn.execute(
            "SELECT COALESCE(SUM(CAST(NULLIF(quoted_usd,'') AS REAL)),0) FROM enquiries "
            "WHERE status NOT IN ('Cancelled','Completed')"
        ).fetchone()[0] or 0

        status_rows = conn.execute(
            "SELECT status, COUNT(*) as count FROM enquiries GROUP BY status ORDER BY count DESC"
        ).fetchall()
        revenue_rows = conn.execute(
            "SELECT status, COALESCE(SUM(CAST(NULLIF(quoted_usd,'') AS REAL)),0) as total "
            "FROM enquiries WHERE quoted_usd!='' GROUP BY status"
        ).fetchall()
        channel_rows = conn.execute(
            "SELECT channel, COUNT(*) as count FROM enquiries GROUP BY channel ORDER BY count DESC"
        ).fetchall()
        tier_rows = conn.execute(
            "SELECT nationality_tier, COUNT(*) as count FROM enquiries GROUP BY nationality_tier ORDER BY count DESC"
        ).fetchall()
        monthly_rows = conn.execute(
            "SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count "
            "FROM enquiries GROUP BY month ORDER BY month DESC LIMIT 6"
        ).fetchall()
        dest_rows = conn.execute(
            "SELECT destinations_requested FROM enquiries WHERE destinations_requested!=''"
        ).fetchall()
        overdue_tasks = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE status!='done' AND due_date!='' AND due_date<?",
            (today,)
        ).fetchone()[0]
        pending_tasks = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE status='pending'"
        ).fetchone()[0]

    dest_count: dict = {}
    for row in dest_rows:
        for d in [x.strip() for x in row[0].split(',') if x.strip()]:
            dest_count[d] = dest_count.get(d, 0) + 1
    top_dests = sorted(dest_count.items(), key=lambda x: -x[1])[:8]

    return {
        "kpis": {
            "total_enquiries": total,
            "new_inquiries": new_count,
            "active_quotes": active_quote_count,
            "confirmed": confirmed_count,
            "pipeline_value_usd": round(float(total_pipeline), 2),
            "overdue_tasks": overdue_tasks,
            "pending_tasks": pending_tasks,
        },
        "by_status": [dict(r) for r in status_rows],
        "revenue_by_status": [{"status": r["status"], "total": round(float(r["total"]), 2)} for r in revenue_rows],
        "by_channel": [dict(r) for r in channel_rows],
        "by_nationality": [dict(r) for r in tier_rows],
        "monthly_trend": list(reversed([dict(r) for r in monthly_rows])),
        "top_destinations": [{"destination": d, "count": c} for d, c in top_dests],
    }


# ---------------------------------------------------------------------------
# TASKS
# ---------------------------------------------------------------------------
class TaskCreate(BaseModel):
    enquiry_id: Optional[str] = ''
    booking_ref: Optional[str] = ''
    description: str
    due_date: Optional[str] = ''
    assigned_to: Optional[str] = ''


class TaskUpdate(BaseModel):
    description: Optional[str] = None
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None
    status: Optional[str] = None


@app.get("/api/tasks")
def list_tasks(enquiry_id: Optional[str] = Query(None), status: Optional[str] = Query(None)):
    with db_session() as conn:
        if enquiry_id:
            rows = conn.execute(
                "SELECT * FROM tasks WHERE enquiry_id=? ORDER BY due_date ASC, created_at DESC",
                (enquiry_id,)
            ).fetchall()
        elif status:
            rows = conn.execute(
                "SELECT * FROM tasks WHERE status=? ORDER BY due_date ASC, created_at DESC",
                (status,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM tasks ORDER BY due_date ASC, created_at DESC"
            ).fetchall()
    today = date.today().isoformat()
    items = []
    for r in rows:
        d = dict(r)
        d["overdue"] = bool(d["due_date"] and d["status"] != "done" and d["due_date"] < today)
        items.append(d)
    return items


@app.post("/api/tasks", status_code=201)
def create_task(body: TaskCreate):
    task_id = str(uuid.uuid4())[:8]
    with db_session() as conn:
        conn.execute(
            "INSERT INTO tasks (id, enquiry_id, booking_ref, description, due_date, assigned_to, status, created_at) "
            "VALUES (?,?,?,?,?,?,'pending',?)",
            (task_id, body.enquiry_id or '', body.booking_ref or '',
             body.description, body.due_date or '', body.assigned_to or '',
             datetime.now().isoformat())
        )
    return {"id": task_id, "status": "pending", "description": body.description}


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: str, body: TaskUpdate):
    with db_session() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")
        t = dict(row)
        if body.description is not None:
            t["description"] = body.description
        if body.due_date is not None:
            t["due_date"] = body.due_date
        if body.assigned_to is not None:
            t["assigned_to"] = body.assigned_to
        if body.status is not None:
            t["status"] = body.status
        conn.execute(
            "UPDATE tasks SET description=?, due_date=?, assigned_to=?, status=? WHERE id=?",
            (t["description"], t["due_date"], t["assigned_to"], t["status"], task_id)
        )
    today = date.today().isoformat()
    t["overdue"] = bool(t["due_date"] and t["status"] != "done" and t["due_date"] < today)
    return t


@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: str):
    with db_session() as conn:
        result = conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task not found")
    return None


# ---------------------------------------------------------------------------
# EMAIL — Send quotation PDF to client
# ---------------------------------------------------------------------------
class SendEmailRequest(BaseModel):
    to_email: str
    subject: Optional[str] = None
    message: Optional[str] = None


@app.post("/api/quotations/{quotation_id}/send-email")
def send_quotation_email(quotation_id: str, body: SendEmailRequest):
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")
    smtp_from = os.environ.get("SMTP_FROM", smtp_user)

    if not smtp_user or not smtp_pass:
        raise HTTPException(
            status_code=503,
            detail="SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS environment variables."
        )

    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM quotations WHERE id=? OR quotation_id=?",
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

    subject = body.subject or f"Safari Quotation {q['quotation_id']} — The Rift Valley Explorer"
    message_body = body.message or (
        f"Dear {q['client_name']},\n\n"
        "Thank you for your interest in a safari with The Rift Valley Explorer.\n\n"
        "Please find your personalised quotation attached. "
        f"This quotation is valid for {q.get('valid_days', 14)} days.\n\n"
        "To confirm your booking please reply to this email or contact your coordinator directly.\n\n"
        "Warm regards,\nThe TRVE Team\nThe Rift Valley Explorer\n"
        "Bucket List Adventures Into The Heart Of Africa"
    )

    msg = MIMEMultipart()
    msg["From"] = smtp_from
    msg["To"] = body.to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(message_body, "plain"))

    attachment = MIMEBase("application", "pdf")
    attachment.set_payload(pdf_bytes)
    encoders.encode_base64(attachment)
    filename = f"TRVE_Quotation_{q['quotation_id']}.pdf"
    attachment.add_header("Content-Disposition", "attachment", filename=filename)
    msg.attach(attachment)

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to send email: {str(e)}")

    # Log in sync queue
    with db_session() as conn:
        conn.execute(
            "INSERT INTO sync_queue (id, type, reference, description, status, created_at) "
            "VALUES (?, 'email', ?, ?, 'completed', ?)",
            (str(uuid.uuid4())[:8], q["quotation_id"],
             f"Quotation emailed to {body.to_email}", datetime.now().isoformat())
        )

    return {"status": "sent", "to": body.to_email, "quotation_id": q["quotation_id"]}


# ---------------------------------------------------------------------------
# CALENDAR — enquiries within a date range for the calendar view
# ---------------------------------------------------------------------------
@app.get("/api/calendar")
def get_calendar(year: int = Query(...), month: int = Query(...)):
    """Return enquiries whose travel window overlaps the given year/month."""
    import calendar as _cal
    last_day = _cal.monthrange(year, month)[1]
    month_start = f"{year}-{month:02d}-01"
    month_end = f"{year}-{month:02d}-{last_day:02d}"
    with db_session() as conn:
        rows = conn.execute(
            "SELECT id, booking_ref, client_name, status, coordinator, pax, "
            "travel_start_date, travel_end_date, destinations_requested "
            "FROM enquiries "
            "WHERE travel_start_date != '' AND travel_start_date <= ? "
            "AND (travel_end_date >= ? OR (travel_end_date = '' AND travel_start_date >= ?)) "
            "ORDER BY travel_start_date",
            (month_end, month_start, month_start)
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# ITINERARY PDF — day-by-day branded itinerary document
# ---------------------------------------------------------------------------
def generate_itinerary_pdf(itinerary: dict) -> bytes:
    """Generate a branded day-by-day TRVE itinerary PDF."""
    from fpdf import FPDF

    class TRVEItineraryPDF(FPDF):
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

    pdf = TRVEItineraryPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=25)
    pdf.add_page()
    pdf.set_text_color(40, 40, 40)

    name = itinerary.get("name", "Safari Itinerary")
    duration = itinerary.get("duration_days", 7)
    countries = itinerary.get("countries", [])
    if isinstance(countries, str):
        try: countries = json.loads(countries)
        except: countries = [countries]
    destinations = itinerary.get("destinations", [])
    if isinstance(destinations, str):
        try: destinations = json.loads(destinations)
        except: destinations = [destinations]
    interests = itinerary.get("interests", [])
    if isinstance(interests, str):
        try: interests = json.loads(interests)
        except: interests = [interests]
    parks = itinerary.get("parks", [])
    if isinstance(parks, str):
        try: parks = json.loads(parks)
        except: parks = [parks]
    permits = itinerary.get("permits_included", [])
    if isinstance(permits, str):
        try: permits = json.loads(permits)
        except: permits = [permits]
    budget = itinerary.get("budget_tier", "").replace("_", " ").title()
    season = itinerary.get("season", "").replace("_", " ").title()
    description = itinerary.get("description", "")
    highlights = itinerary.get("highlights", "")

    # Title
    pdf.set_font('Helvetica', 'B', 16)
    pdf.set_text_color(13, 94, 79)
    pdf.multi_cell(0, 9, name)
    pdf.set_draw_color(200, 150, 62)
    pdf.set_line_width(0.6)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(5)

    # Overview block
    pdf.set_font('Helvetica', '', 10)
    pdf.set_text_color(40, 40, 40)
    overview = [
        ("Duration:", f"{duration} days"),
        ("Countries:", ", ".join(countries) if countries else "—"),
        ("Budget Tier:", budget or "—"),
        ("Best Season:", season or "Year Round"),
    ]
    for label, val in overview:
        pdf.set_font('Helvetica', 'B', 10)
        pdf.cell(42, 7, label)
        pdf.set_font('Helvetica', '', 10)
        pdf.cell(0, 7, val, ln=True)
    pdf.ln(3)

    # Description
    if description:
        pdf.set_font('Helvetica', 'B', 11)
        pdf.set_text_color(13, 94, 79)
        pdf.cell(0, 8, 'Overview', ln=True)
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(60, 60, 60)
        pdf.multi_cell(0, 6, description)
        pdf.ln(3)

    # Highlights
    if highlights:
        pdf.set_font('Helvetica', 'B', 11)
        pdf.set_text_color(13, 94, 79)
        pdf.cell(0, 8, 'Highlights', ln=True)
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(60, 60, 60)
        for hl in highlights.split(','):
            hl = hl.strip()
            if hl:
                pdf.cell(6, 6, '-')
                pdf.multi_cell(0, 6, hl)
        pdf.ln(3)

    # Day-by-day itinerary
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(13, 94, 79)
    pdf.cell(0, 9, 'Day-by-Day Itinerary', ln=True)
    pdf.set_draw_color(200, 150, 62)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)

    # Distribute destinations across days
    num_dests = len(destinations) if destinations else 1
    days_per_dest = max(1, duration // num_dests) if num_dests else 1
    day = 1
    for i, dest in enumerate(destinations or ["Safari"]):
        days = days_per_dest if i < num_dests - 1 else (duration - day + 1)
        day_label = f"Day {day}" if days == 1 else f"Days {day}–{day + days - 1}"
        pdf.set_font('Helvetica', 'B', 10)
        pdf.set_text_color(200, 150, 62)
        pdf.cell(0, 7, f"{day_label}: {dest}", ln=True)
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(60, 60, 60)
        # Find relevant park/activity for this destination
        dest_lower = dest.lower()
        activities = []
        for p in parks:
            if p.lower() in dest_lower or dest_lower in p.lower():
                activities.append(f"Activities in {p}")
        for permit_key in permits:
            label = PERMIT_PRICES.get(permit_key, {}).get("label", "")
            if label and any(d.lower() in dest_lower or dest_lower in d.lower() for d in [dest]):
                activities.append(label)
        if not activities:
            activities = [f"Arrive {dest}, check in and settle", f"Explore {dest} and surroundings"]
        for act in activities[:2]:
            pdf.cell(6, 5, chr(149))
            pdf.multi_cell(0, 5, act)
        pdf.ln(3)
        day += days
        if day > duration:
            break

    # Parks & Permits section
    if parks or permits:
        pdf.add_page()
        pdf.set_font('Helvetica', 'B', 12)
        pdf.set_text_color(13, 94, 79)
        pdf.cell(0, 9, 'Parks & Activities', ln=True)
        pdf.set_draw_color(200, 150, 62)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(4)
        if parks:
            pdf.set_font('Helvetica', 'B', 10)
            pdf.set_text_color(40, 40, 40)
            pdf.cell(0, 7, 'Parks & Conservancies:', ln=True)
            pdf.set_font('Helvetica', '', 10)
            pdf.set_text_color(60, 60, 60)
            for p in parks:
                pdf.cell(6, 5, '-')
                pdf.cell(0, 5, p, ln=True)
            pdf.ln(3)
        if permits:
            pdf.set_font('Helvetica', 'B', 10)
            pdf.set_text_color(40, 40, 40)
            pdf.cell(0, 7, 'Permits Included:', ln=True)
            pdf.set_font('Helvetica', '', 10)
            pdf.set_text_color(60, 60, 60)
            for pk in permits:
                label = PERMIT_PRICES.get(pk, {}).get("label", pk.replace("_", " ").title())
                pdf.cell(6, 5, '-')
                pdf.cell(0, 5, label, ln=True)
        pdf.ln(3)

    # Interests
    if interests:
        pdf.set_font('Helvetica', 'B', 10)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(0, 7, 'Ideal for:', ln=True)
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(60, 60, 60)
        interest_labels = [i.replace("_", " ").title() for i in interests]
        pdf.multi_cell(0, 6, ", ".join(interest_labels))

    out = pdf.output(dest='S')
    return out if isinstance(out, bytes) else out.encode('latin-1')


@app.get("/api/itineraries/{itinerary_id}/pdf")
def get_itinerary_pdf(itinerary_id: str):
    with db_session() as conn:
        row = conn.execute("SELECT * FROM itineraries WHERE id=?", (itinerary_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Itinerary not found")
    itn = dict(row)
    pdf_bytes = generate_itinerary_pdf(itn)
    filename = f"TRVE_Itinerary_{itinerary_id}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )


@app.get("/api/itineraries/{itinerary_id}")
def get_itinerary(itinerary_id: str):
    with db_session() as conn:
        row = conn.execute("SELECT * FROM itineraries WHERE id=?", (itinerary_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Itinerary not found")
    itn = dict(row)
    for field in ["destinations", "countries", "interests", "permits_included", "parks", "nationality_tiers"]:
        if isinstance(itn.get(field), str):
            try: itn[field] = json.loads(itn[field])
            except: pass
    return itn


# ---------------------------------------------------------------------------
# PERMIT SLOT TRACKER
# ---------------------------------------------------------------------------
PERMIT_HABITATS = {
    "gorilla_tracking_uganda": ["Bwindi - Buhoma", "Bwindi - Ruhija", "Bwindi - Nkuringo", "Bwindi - Rushaga", "Mgahinga"],
    "gorilla_habituation_uganda": ["Bwindi - Nkuringo", "Bwindi - Rushaga"],
    "gorilla_tracking_rwanda": ["Volcanoes NP - Susa", "Volcanoes NP - Amahoro", "Volcanoes NP - Umubano"],
    "chimp_tracking": ["Kibale - Kanyanchu", "Kibale - Sebitoli", "Budongo Forest", "Kyambura Gorge"],
    "chimp_habituation": ["Kibale - Kanyanchu"],
}
PERMIT_DEFAULT_MAX = {
    "gorilla_tracking_uganda": 8, "gorilla_habituation_uganda": 4,
    "gorilla_tracking_rwanda": 8, "chimp_tracking": 6, "chimp_habituation": 4,
}


class PermitSlotCreate(BaseModel):
    date: str
    permit_type: str
    habitat: Optional[str] = ''
    total_slots: Optional[int] = None
    booked: Optional[int] = 0
    notes: Optional[str] = ''


class PermitSlotUpdate(BaseModel):
    total_slots: Optional[int] = None
    booked: Optional[int] = None
    notes: Optional[str] = None


@app.get("/api/permit-slots")
def list_permit_slots(
    date: Optional[str] = Query(None),
    month: Optional[str] = Query(None),  # YYYY-MM
    permit_type: Optional[str] = Query(None)
):
    with db_session() as conn:
        clauses, params = [], []
        if date:
            clauses.append("date=?"); params.append(date)
        if month:
            clauses.append("date LIKE ?"); params.append(f"{month}%")
        if permit_type:
            clauses.append("permit_type=?"); params.append(permit_type)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        rows = conn.execute(
            f"SELECT *, (total_slots - booked) AS available FROM permit_slots {where} ORDER BY date, permit_type",
            params
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/permit-slots", status_code=201)
def create_permit_slot(body: PermitSlotCreate):
    slot_id = str(uuid.uuid4())[:8]
    total = body.total_slots or PERMIT_DEFAULT_MAX.get(body.permit_type, 8)
    with db_session() as conn:
        conn.execute(
            "INSERT INTO permit_slots (id, date, permit_type, habitat, total_slots, booked, notes, created_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (slot_id, body.date, body.permit_type, body.habitat or '',
             total, body.booked or 0, body.notes or '', datetime.now().isoformat())
        )
    return {"id": slot_id, "date": body.date, "permit_type": body.permit_type,
            "total_slots": total, "booked": body.booked or 0,
            "available": total - (body.booked or 0)}


@app.patch("/api/permit-slots/{slot_id}")
def update_permit_slot(slot_id: str, body: PermitSlotUpdate):
    with db_session() as conn:
        row = conn.execute("SELECT * FROM permit_slots WHERE id=?", (slot_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Slot not found")
        s = dict(row)
        if body.total_slots is not None: s["total_slots"] = body.total_slots
        if body.booked is not None: s["booked"] = body.booked
        if body.notes is not None: s["notes"] = body.notes
        conn.execute(
            "UPDATE permit_slots SET total_slots=?, booked=?, notes=? WHERE id=?",
            (s["total_slots"], s["booked"], s["notes"], slot_id)
        )
        s["available"] = s["total_slots"] - s["booked"]
    return s


@app.delete("/api/permit-slots/{slot_id}", status_code=204)
def delete_permit_slot(slot_id: str):
    with db_session() as conn:
        result = conn.execute("DELETE FROM permit_slots WHERE id=?", (slot_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Slot not found")
    return None


@app.get("/api/permit-slots/check")
def check_permit_availability(date: str = Query(...), permit_type: str = Query(...), pax: int = Query(1)):
    """Check if enough slots are available for a given permit, date, and pax count."""
    with db_session() as conn:
        rows = conn.execute(
            "SELECT *, (total_slots - booked) AS available FROM permit_slots "
            "WHERE date=? AND permit_type=?",
            (date, permit_type)
        ).fetchall()
    slots = [dict(r) for r in rows]
    total_available = sum(s["available"] for s in slots)
    max_single = max((s["available"] for s in slots), default=0)
    return {
        "date": date,
        "permit_type": permit_type,
        "pax_requested": pax,
        "total_available": total_available,
        "max_single_habitat": max_single,
        "slots": slots,
        "sufficient": max_single >= pax,
        "warning": max_single < pax and len(slots) > 0,
        "no_data": len(slots) == 0,
    }


# ---------------------------------------------------------------------------
# Static Frontend Serving
# ---------------------------------------------------------------------------
# Serve static assets (CSS, JS) — must come after all /api routes
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
