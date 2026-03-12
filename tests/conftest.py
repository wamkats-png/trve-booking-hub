"""
conftest.py — pytest fixtures for TRVE Booking Hub API tests.
Provides an isolated in-memory test database and a test HTTP client.
"""
import json
import os
import sys
import sqlite3
import tempfile
from pathlib import Path

import pytest

# Ensure project root is on the path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture(scope="session")
def test_db_path(tmp_path_factory):
    """Return a temp DB path used for the whole test session."""
    tmp_dir = tmp_path_factory.mktemp("trve_test_data")
    return tmp_dir / "trve_test.db"


@pytest.fixture(scope="session", autouse=True)
def patch_db(test_db_path):
    """
    Patch api_server to use an isolated test database for the entire test session.
    Must be autouse so that it runs before app import completes.
    """
    import api_server
    # Point module-level DB_PATH to the temp file
    api_server.DB_PATH = test_db_path
    # Re-initialise the database with the test path
    api_server.init_db()
    yield
    # Cleanup is automatic via tmp_path_factory


@pytest.fixture(scope="session")
def client(patch_db):
    """
    Synchronous TestClient using httpx.
    We use the HTTPX transport to avoid needing a live server.
    """
    from fastapi.testclient import TestClient
    import api_server
    with TestClient(api_server.app) as c:
        yield c


@pytest.fixture()
def sample_enquiry(client):
    """Create and return a sample enquiry for use in tests."""
    resp = client.post("/api/enquiries", json={
        "client_name": "Test Client",
        "email": "test@example.com",
        "phone": "+256700000000",
        "country": "UK",
        "nationality_tier": "FNR",
        "pax": 2,
        "duration_days": 7,
        "interests": ["gorilla_trekking"],
        "tour_type": "gorilla_safari",
    })
    assert resp.status_code == 201
    return resp.json()


@pytest.fixture()
def sample_quotation(client):
    """Create and return a sample quotation for use in tests."""
    resp = client.post("/api/generate-quotation", json={
        "client_name": "Quote Client",
        "client_email": "quote@example.com",
        "valid_days": 7,
        "pricing_data": {
            "summary": {"pax": 2, "days": 7, "nationality_tier": "FNR"},
            "accommodation": {"lines": [], "total": 0},
            "vehicle": {"days": 6, "rate_per_day": 120, "total": 720},
            "permits": {"lines": [], "total": 0},
            "insurance": {"included": False, "rate_per_person_per_day": 0, "total": 0},
            "extra_costs": {"lines": [], "total": 0},
            "subtotal": 720,
            "service_fee": {"label": "Service Fee (15%)", "pct": 15, "total": 108},
            "commission": {"label": "", "pct": 0, "total": 0},
            "grand_total_usd": 828,
            "per_person_usd": 414,
            "fx_rate": 3575,
            "grand_total_ugx": 2959050,
        },
    })
    assert resp.status_code == 200
    return resp.json()
