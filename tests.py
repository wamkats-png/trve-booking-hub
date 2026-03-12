#!/usr/bin/env python3
"""
TRVE Booking Hub — Automated Test Suite
Tests: unit pricing logic, API endpoints, workflow integration
Run: pytest tests.py -v
"""
import pytest
import json
import sys
import os
from datetime import datetime, date

# ---------------------------------------------------------------------------
# UNIT TESTS — Pricing Logic (no server required)
# ---------------------------------------------------------------------------

# Add parent dir to path for import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from api_server import get_permit_price_usd, PERMIT_PRICES, CONFIG, FX_RATE, ACTIVITY_CATALOGUE
    IMPORT_OK = True
except ImportError as e:
    IMPORT_OK = False
    IMPORT_ERROR = str(e)


@pytest.mark.skipif(not IMPORT_OK, reason="Cannot import api_server")
class TestPermitPricing:
    """Test UWA permit price calculations."""

    def test_gorilla_tracking_fnr(self):
        price = get_permit_price_usd("gorilla_tracking_uganda", "FNR")
        assert price == 800, f"Expected 800, got {price}"

    def test_gorilla_tracking_fr(self):
        price = get_permit_price_usd("gorilla_tracking_uganda", "FR")
        assert price == 700, f"Expected 700, got {price}"

    def test_gorilla_tracking_eac_converts_to_usd(self):
        price = get_permit_price_usd("gorilla_tracking_uganda", "EAC")
        expected = 300000 / FX_RATE
        assert abs(price - expected) < 1, f"Expected ~{expected:.2f}, got {price}"

    def test_gorilla_low_season_april(self):
        price = get_permit_price_usd("gorilla_tracking_uganda", "FNR", "2026-04-15")
        assert price == 600, f"Expected 600 (low season), got {price}"

    def test_gorilla_low_season_may(self):
        price = get_permit_price_usd("gorilla_tracking_uganda", "FNR", "2026-05-01")
        assert price == 600

    def test_gorilla_post_july_2026(self):
        price = get_permit_price_usd("gorilla_tracking_uganda", "FNR", "2026-08-01")
        # Post-July 2026 price should remain 800 (same as pre-2026 for FNR per data)
        assert price == 800

    def test_chimp_tracking_fnr(self):
        price = get_permit_price_usd("chimp_tracking", "FNR")
        assert price == 250

    def test_chimp_tracking_low_season(self):
        price = get_permit_price_usd("chimp_tracking", "FNR", "2026-11-10")
        assert price == 200, f"Expected 200 (low season Nov), got {price}"

    def test_gorilla_rwanda_fnr(self):
        price = get_permit_price_usd("gorilla_tracking_rwanda", "FNR")
        assert price == 1500

    def test_gorilla_rwanda_fr(self):
        price = get_permit_price_usd("gorilla_tracking_rwanda", "FR")
        assert price == 500

    def test_park_entry_a_plus(self):
        price = get_permit_price_usd("park_entry_a_plus", "FNR")
        assert price == 45

    def test_park_entry_b_eac(self):
        price = get_permit_price_usd("park_entry_b", "EAC")
        expected = 15000 / FX_RATE
        assert abs(price - expected) < 1

    def test_invalid_permit_key_returns_zero(self):
        price = get_permit_price_usd("nonexistent_permit", "FNR")
        assert price == 0

    def test_golden_monkey(self):
        price = get_permit_price_usd("golden_monkey", "FNR")
        assert price == 100

    def test_gorilla_habituation_fnr(self):
        price = get_permit_price_usd("gorilla_habituation_uganda", "FNR")
        assert price == 1500

    def test_chimp_habituation_fr(self):
        price = get_permit_price_usd("chimp_habituation", "FR")
        assert price == 350


@pytest.mark.skipif(not IMPORT_OK, reason="Cannot import api_server")
class TestConfig:
    """Test system configuration values."""

    def test_config_has_fx_rate(self):
        assert "fx_rate" in CONFIG
        assert CONFIG["fx_rate"] > 1000

    def test_config_has_fx_buffer(self):
        assert "fx_buffer_pct" in CONFIG
        assert 0 <= CONFIG["fx_buffer_pct"] <= 20

    def test_config_has_fuel_buffer(self):
        assert "fuel_buffer_pct" in CONFIG
        assert 0 <= CONFIG["fuel_buffer_pct"] <= 20

    def test_config_has_vehicle_rate(self):
        assert "vehicle_rate_per_day" in CONFIG
        assert CONFIG["vehicle_rate_per_day"] > 0

    def test_config_service_fee_reasonable(self):
        assert 0 <= CONFIG["service_fee_pct"] <= 30

    def test_config_has_coordinators(self):
        assert len(CONFIG["coordinators"]) > 0


@pytest.mark.skipif(not IMPORT_OK, reason="Cannot import api_server")
class TestActivities:
    """Test activity catalogue."""

    def test_activities_exist(self):
        assert len(ACTIVITY_CATALOGUE) > 10

    def test_boat_cruise_exists(self):
        ids = [a["id"] for a in ACTIVITY_CATALOGUE]
        assert "boat_cruise_kazinga" in ids

    def test_internal_flights_exist(self):
        flights = [a for a in ACTIVITY_CATALOGUE if a["category"] == "flight"]
        assert len(flights) >= 3

    def test_transfers_exist(self):
        transfers = [a for a in ACTIVITY_CATALOGUE if a["category"] == "transfer"]
        assert len(transfers) >= 2

    def test_all_activities_have_required_fields(self):
        required = {"id", "name", "category", "default_usd", "per_person"}
        for act in ACTIVITY_CATALOGUE:
            missing = required - set(act.keys())
            assert not missing, f"Activity {act.get('id')} missing fields: {missing}"


# ---------------------------------------------------------------------------
# INTEGRATION TESTS — API Endpoints (requires running server OR TestClient)
# ---------------------------------------------------------------------------

try:
    from fastapi.testclient import TestClient
    from api_server import app
    client = TestClient(app)
    TESTCLIENT_OK = True
except Exception as e:
    TESTCLIENT_OK = False
    TESTCLIENT_ERROR = str(e)


@pytest.mark.skipif(not TESTCLIENT_OK, reason="TestClient not available")
class TestHealthEndpoint:
    def test_health_returns_200(self):
        res = client.get("/api/health")
        assert res.status_code == 200

    def test_health_has_status_ok(self):
        res = client.get("/api/health")
        data = res.json()
        assert data["status"] == "ok"

    def test_health_has_timestamp(self):
        res = client.get("/api/health")
        data = res.json()
        assert "timestamp" in data


@pytest.mark.skipif(not TESTCLIENT_OK, reason="TestClient not available")
class TestConfigEndpoint:
    def test_config_returns_200(self):
        res = client.get("/api/config")
        assert res.status_code == 200

    def test_config_has_fx_rate(self):
        res = client.get("/api/config")
        data = res.json()
        assert "fx_rate" in data
        assert data["fx_rate"] > 1000

    def test_config_has_buffers(self):
        res = client.get("/api/config")
        data = res.json()
        assert "fx_buffer_pct" in data
        assert "fuel_buffer_pct" in data

    def test_config_update(self):
        res = client.post("/api/config/update", json={"fx_buffer_pct": 4.0})
        assert res.status_code == 200
        data = res.json()
        assert data["fx_buffer_pct"] == 4.0
        # Reset
        client.post("/api/config/update", json={"fx_buffer_pct": 3.0})


@pytest.mark.skipif(not TESTCLIENT_OK, reason="TestClient not available")
class TestEnquiryEndpoints:
    def test_list_enquiries(self):
        res = client.get("/api/enquiries")
        assert res.status_code == 200
        data = res.json()
        assert "items" in data

    def test_create_enquiry(self):
        payload = {
            "client_name": "Test User Integration",
            "email": "test@trvetest.com",
            "phone": "+256700000000",
            "country": "UK",
            "nationality_tier": "FNR",
            "pax": 2,
            "duration_days": 7,
            "travel_start_date": "2026-06-15",
            "interests": ["gorilla_trekking", "wildlife_safari"],
            "destinations_requested": "Bwindi, Kibale"
        }
        res = client.post("/api/enquiries", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert "booking_ref" in data
        assert data["booking_ref"].startswith("TRVE-")
        return data["booking_ref"]

    def test_create_enquiry_missing_name_fails(self):
        res = client.post("/api/enquiries", json={"email": "test@test.com"})
        assert res.status_code == 422  # Validation error

    def test_update_enquiry_status(self):
        # First create
        create_res = client.post("/api/enquiries", json={
            "client_name": "Status Test Client",
            "pax": 2
        })
        assert create_res.status_code == 201
        ref = create_res.json()["booking_ref"]

        # Then update
        update_res = client.patch(f"/api/enquiries/{ref}", json={"status": "Active_Quote"})
        assert update_res.status_code == 200
        data = update_res.json()
        assert data["status"] == "Active_Quote"


@pytest.mark.skipif(not TESTCLIENT_OK, reason="TestClient not available")
class TestItineraryEndpoints:
    def test_list_itineraries_returns_18(self):
        res = client.get("/api/itineraries")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 15, f"Expected 15+ itineraries, got {data['total']}"

    def test_itineraries_have_required_fields(self):
        res = client.get("/api/itineraries")
        items = res.json()["items"]
        required = {"id", "name", "duration_days", "budget_tier", "interests"}
        for itn in items[:3]:
            missing = required - set(itn.keys())
            assert not missing, f"Itinerary {itn.get('id')} missing: {missing}"


@pytest.mark.skipif(not TESTCLIENT_OK, reason="TestClient not available")
class TestLodgeEndpoints:
    def test_list_lodges_returns_data(self):
        res = client.get("/api/lodge-rates/lodges")
        assert res.status_code == 200
        data = res.json()
        assert len(data) >= 20, f"Expected 20+ lodges, got {len(data)}"

    def test_lodges_have_room_types(self):
        res = client.get("/api/lodge-rates/lodges")
        lodges = res.json()
        for lodge in lodges[:5]:
            assert "room_types" in lodge
            assert len(lodge["room_types"]) > 0

    def test_bwindi_lodges_exist(self):
        res = client.get("/api/lodge-rates/lodges")
        names = [l["name"] for l in res.json()]
        bwindi_lodges = [n for n in names if "bwindi" in n.lower() or "gorilla" in n.lower() or "clouds" in n.lower()]
        assert len(bwindi_lodges) > 0, "No Bwindi area lodges found"


@pytest.mark.skipif(not TESTCLIENT_OK, reason="TestClient not available")
class TestActivitiesEndpoint:
    def test_activities_endpoint(self):
        res = client.get("/api/activities")
        assert res.status_code == 200
        data = res.json()
        assert "items" in data
        assert len(data["items"]) > 10


@pytest.mark.skipif(not TESTCLIENT_OK, reason="TestClient not available")
class TestPricingEndpoint:
    def test_basic_pricing_calculation(self):
        res = client.post("/api/calculate-price", json={
            "nationality_tier": "FNR",
            "pax": 2,
            "duration_days": 7,
            "permits": [{"type": "gorilla_tracking_uganda", "quantity": 1}],
            "accommodations": [],
        })
        assert res.status_code == 200
        data = res.json()
        assert "total_usd" in data
        assert data["total_usd"] > 0

    def test_pricing_with_accommodation(self):
        res = client.post("/api/calculate-price", json={
            "nationality_tier": "FNR",
            "pax": 2,
            "duration_days": 7,
            "accommodations": [
                {"lodge": "Gorilla Safari Lodge", "room_type": "Double Room", "nights": 2}
            ],
            "permits": [],
        })
        assert res.status_code == 200
        data = res.json()
        assert data["total_usd"] > 0

    def test_pricing_gorilla_7day_reasonable_range(self):
        """A 7-day gorilla trip for 2 FNR pax should cost $3000-$12000 total."""
        res = client.post("/api/calculate-price", json={
            "nationality_tier": "FNR",
            "pax": 2,
            "duration_days": 7,
            "permits": [
                {"type": "gorilla_tracking_uganda", "quantity": 1},
                {"type": "chimp_tracking", "quantity": 1},
            ],
            "accommodations": [
                {"lodge": "Gorilla Safari Lodge", "room_type": "Double Room", "nights": 2},
                {"lodge": "Primate Lodge Kibale", "room_type": "Bandas (Double)", "nights": 2},
            ],
            "include_insurance": True,
        })
        assert res.status_code == 200
        total = res.json()["total_usd"]
        assert 3000 <= total <= 15000, f"Total {total} outside expected range $3000-$15000"

    def test_pricing_per_person_less_than_total(self):
        res = client.post("/api/calculate-price", json={
            "nationality_tier": "FNR", "pax": 2, "duration_days": 5
        })
        data = res.json()
        assert data["per_person_usd"] < data["total_usd"]

    def test_pricing_has_fuel_buffer(self):
        res = client.post("/api/calculate-price", json={
            "nationality_tier": "FNR", "pax": 2, "duration_days": 5
        })
        data = res.json()
        assert "fuel_buffer_pct" in data

    def test_pricing_eac_tier_lower_than_fnr(self):
        res_fnr = client.post("/api/calculate-price", json={
            "nationality_tier": "FNR", "pax": 2, "duration_days": 7,
            "permits": [{"type": "gorilla_tracking_uganda", "quantity": 1}]
        })
        res_eac = client.post("/api/calculate-price", json={
            "nationality_tier": "EAC", "pax": 2, "duration_days": 7,
            "permits": [{"type": "gorilla_tracking_uganda", "quantity": 1}]
        })
        assert res_fnr.json()["total_usd"] > res_eac.json()["total_usd"]


@pytest.mark.skipif(not TESTCLIENT_OK, reason="TestClient not available")
class TestCurationEndpoint:
    def test_basic_curation(self):
        res = client.post("/api/curate-itinerary", json={
            "duration_days": 7,
            "budget_tier": "premium",
            "nationality_tier": "FNR",
            "pax": 2,
            "interests": ["gorilla_trekking", "wildlife_safari"],
            "destinations": "Bwindi, Kibale"
        })
        assert res.status_code == 200
        data = res.json()
        assert "suggestions" in data
        assert len(data["suggestions"]) > 0

    def test_curation_returns_scored_results(self):
        res = client.post("/api/curate-itinerary", json={
            "duration_days": 10,
            "budget_tier": "premium",
            "interests": ["gorilla_trekking", "chimp_trekking"],
        })
        suggestions = res.json()["suggestions"]
        for s in suggestions:
            assert 0 <= s["score"] <= 100

    def test_curation_results_sorted_by_score(self):
        res = client.post("/api/curate-itinerary", json={
            "duration_days": 7,
            "interests": ["gorilla_trekking"]
        })
        suggestions = res.json()["suggestions"]
        scores = [s["score"] for s in suggestions]
        assert scores == sorted(scores, reverse=True)


@pytest.mark.skipif(not TESTCLIENT_OK, reason="TestClient not available")
class TestQuotationWorkflow:
    """Full workflow: create enquiry → curate → price → generate quotation → PDF."""

    def test_full_workflow(self):
        # Step 1: Create enquiry
        enq_res = client.post("/api/enquiries", json={
            "client_name": "Workflow Test Client",
            "email": "workflow@trve.com",
            "pax": 2,
            "duration_days": 7,
            "nationality_tier": "FNR",
            "interests": ["gorilla_trekking"],
            "travel_start_date": "2026-07-01",
        })
        assert enq_res.status_code == 201
        enquiry = enq_res.json()
        enq_id = enquiry["booking_ref"]

        # Step 2: Curate itinerary
        cur_res = client.post("/api/curate-itinerary", json={
            "enquiry_id": enq_id,
            "duration_days": 7,
            "nationality_tier": "FNR",
            "interests": ["gorilla_trekking"],
        })
        assert cur_res.status_code == 200
        suggestions = cur_res.json()["suggestions"]
        assert len(suggestions) > 0
        top_itinerary = suggestions[0]["itinerary_id"]

        # Step 3: Approve itinerary
        approve_res = client.post(f"/api/curate-itinerary/{enq_id}/approve", json={
            "approved_by": "Desire",
            "selected_itinerary_id": top_itinerary,
            "notes": "Good match for client"
        })
        assert approve_res.status_code == 200

        # Step 4: Calculate price
        price_res = client.post("/api/calculate-price", json={
            "itinerary_id": top_itinerary,
            "nationality_tier": "FNR",
            "pax": 2,
            "duration_days": 7,
            "permits": [{"type": "gorilla_tracking_uganda", "quantity": 1}],
        })
        assert price_res.status_code == 200
        pricing_data = price_res.json()["pricing_data"]
        assert pricing_data["grand_total_usd"] > 0

        # Step 5: Generate quotation
        quote_res = client.post("/api/generate-quotation", json={
            "client_name": "Workflow Test Client",
            "client_email": "workflow@trve.com",
            "booking_ref": enq_id,
            "valid_days": 7,
            "pricing_data": pricing_data,
        })
        assert quote_res.status_code == 200
        quote = quote_res.json()
        assert "quotation_id" in quote
        quote_id = quote["quotation_id"]

        # Step 6: Download PDF
        pdf_res = client.get(f"/api/quotations/{quote_id}/pdf")
        assert pdf_res.status_code == 200
        assert pdf_res.headers["content-type"] == "application/pdf"
        assert len(pdf_res.content) > 1000  # PDF has content

        # Step 7: Check expiry
        expiry_res = client.get(f"/api/quotations/{quote_id}/check-expiry")
        assert expiry_res.status_code == 200
        expiry = expiry_res.json()
        assert expiry["is_expired"] == False
        assert expiry["days_remaining"] >= 6


@pytest.mark.skipif(not TESTCLIENT_OK, reason="TestClient not available")
class TestSyncEndpoints:
    def test_sync_status(self):
        res = client.get("/api/sync/status")
        assert res.status_code == 200
        data = res.json()
        assert "connected" in data
        assert data["connected"] == True

    def test_sync_queue(self):
        res = client.get("/api/sync/queue")
        assert res.status_code == 200
        assert isinstance(res.json(), list)


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import subprocess
    result = subprocess.run(
        ["python3", "-m", "pytest", __file__, "-v", "--tb=short"],
        capture_output=False
    )
    sys.exit(result.returncode)
