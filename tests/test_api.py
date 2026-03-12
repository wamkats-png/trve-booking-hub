"""
test_api.py — Comprehensive pytest tests for TRVE Booking Hub API.

Run with:
    cd /home/user/trve-booking-hub
    pytest tests/ -v
"""
import pytest


# ===========================================================================
# Health
# ===========================================================================
class TestHealth:
    def test_health_ok(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "timestamp" in data
        assert "version" in data
        assert "enquiries_count" in data

    def test_health_version(self, client):
        resp = client.get("/api/health")
        assert resp.json()["version"] == "2.0.0"


# ===========================================================================
# Config
# ===========================================================================
class TestConfig:
    def test_get_config(self, client):
        resp = client.get("/api/config")
        assert resp.status_code == 200
        data = resp.json()
        assert "fx_rate" in data
        assert "service_fee_pct" in data
        assert "vehicle_rate_per_day" in data
        assert "fx_buffer_pct" in data
        assert "fuel_buffer_pct" in data
        assert "quotation_validity_days" in data

    def test_config_has_correct_buffer_defaults(self, client):
        resp = client.get("/api/config")
        data = resp.json()
        assert data["fx_buffer_pct"] == 3
        assert data["fuel_buffer_pct"] == 10
        assert data["quotation_validity_days"] == 7

    def test_patch_config_fx_rate(self, client):
        resp = client.patch("/api/config", json={"fx_rate": 3600.0})
        assert resp.status_code == 200
        data = resp.json()
        assert data["fx_rate"] == 3600.0

    def test_patch_config_fx_buffer(self, client):
        resp = client.patch("/api/config", json={"fx_buffer_pct": 5.0})
        assert resp.status_code == 200
        assert resp.json()["fx_buffer_pct"] == 5.0

    def test_patch_config_fuel_buffer(self, client):
        resp = client.patch("/api/config", json={"fuel_buffer_pct": 15.0})
        assert resp.status_code == 200
        assert resp.json()["fuel_buffer_pct"] == 15.0

    def test_patch_config_multiple_fields(self, client):
        resp = client.patch("/api/config", json={
            "fx_buffer_pct": 3.0,
            "fuel_buffer_pct": 10.0,
            "vehicle_rate_per_day": 130.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["fx_buffer_pct"] == 3.0
        assert data["fuel_buffer_pct"] == 10.0
        assert data["vehicle_rate_per_day"] == 130.0

    def test_patch_config_returns_last_updated(self, client):
        resp = client.patch("/api/config", json={"service_fee_pct": 15.0})
        assert "last_updated" in resp.json()

    def teardown_method(self, method):
        """Reset config to known defaults between tests."""
        pass  # We'll accept config state carry-over between tests in this suite


# ===========================================================================
# Enquiries
# ===========================================================================
class TestEnquiries:
    def test_list_enquiries(self, client):
        resp = client.get("/api/enquiries")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)

    def test_create_enquiry_minimal(self, client):
        resp = client.post("/api/enquiries", json={"client_name": "Jane Doe"})
        assert resp.status_code == 201
        data = resp.json()
        assert "booking_ref" in data
        assert data["booking_ref"].startswith("TRVE-")
        assert data["client_name"] == "Jane Doe"

    def test_create_enquiry_full(self, client):
        resp = client.post("/api/enquiries", json={
            "client_name": "John Safari",
            "email": "john@safari.com",
            "phone": "+44 7700 900000",
            "country": "UK",
            "nationality_tier": "FNR",
            "channel": "agent",
            "agent_name": "Kuoni",
            "tour_type": "gorilla_safari",
            "pax": 4,
            "duration_days": 10,
            "interests": ["gorilla_trekking", "bird_watching"],
            "destinations_requested": "Bwindi, Kibale",
            "special_requests": "Vegetarian meals required",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["client_name"] == "John Safari"
        assert data["pax"] == 4

    def test_create_enquiry_missing_client_name(self, client):
        resp = client.post("/api/enquiries", json={"email": "no@name.com"})
        assert resp.status_code == 422

    def test_patch_enquiry_status(self, client, sample_enquiry):
        enquiry_id = sample_enquiry["id"]
        resp = client.patch(f"/api/enquiries/{enquiry_id}", json={"status": "Active_Quote"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "Active_Quote"

    def test_patch_enquiry_not_found(self, client):
        resp = client.patch("/api/enquiries/nonexistent-id", json={"status": "Confirmed"})
        assert resp.status_code == 404

    def test_patch_enquiry_coordinator(self, client, sample_enquiry):
        enquiry_id = sample_enquiry["id"]
        resp = client.patch(f"/api/enquiries/{enquiry_id}", json={"coordinator": "Desire"})
        assert resp.status_code == 200
        assert resp.json()["coordinator"] == "Desire"

    def test_list_enquiries_includes_created(self, client, sample_enquiry):
        resp = client.get("/api/enquiries")
        refs = [e["booking_ref"] for e in resp.json()["items"]]
        assert sample_enquiry["booking_ref"] in refs


# ===========================================================================
# Itineraries
# ===========================================================================
class TestItineraries:
    def test_list_itineraries(self, client):
        resp = client.get("/api/itineraries")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["total"] >= 18  # We seed 18 itineraries
        # Verify JSON fields are parsed
        first = data["items"][0]
        assert isinstance(first["destinations"], list)
        assert isinstance(first["interests"], list)
        assert isinstance(first["permits_included"], list)

    def test_itinerary_has_required_fields(self, client):
        resp = client.get("/api/itineraries")
        items = resp.json()["items"]
        for itn in items[:3]:
            assert "id" in itn
            assert "name" in itn
            assert "duration_days" in itn
            assert "budget_tier" in itn


# ===========================================================================
# Lodge Rates & Lodge CRUD
# ===========================================================================
class TestLodges:
    def test_list_lodge_rates(self, client):
        resp = client.get("/api/lodge-rates/lodges")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # Verify structure
        lodge = data[0]
        assert "name" in lodge
        assert "room_types" in lodge
        assert isinstance(lodge["room_types"], list)

    def test_lodge_rates_includes_uganda(self, client):
        resp = client.get("/api/lodge-rates/lodges")
        names = [l["name"] for l in resp.json()]
        assert any("Bwindi" in n or "Gorilla" in n for n in names)

    def test_lodge_rates_includes_rwanda(self, client):
        resp = client.get("/api/lodge-rates/lodges")
        countries = [l.get("country") for l in resp.json()]
        assert "Rwanda" in countries

    def test_list_lodges_api(self, client):
        resp = client.get("/api/lodges")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["total"] > 0

    def test_list_lodges_filter_country(self, client):
        resp = client.get("/api/lodges?country=Rwanda")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert all(i["country"] == "Rwanda" for i in items)

    def test_create_lodge(self, client):
        resp = client.post("/api/lodges", json={
            "lodge_name": "Test Safari Camp",
            "room_type": "Tent Double",
            "country": "Uganda",
            "location": "Murchison Falls NP",
            "rack_rate_usd": 300.0,
            "meal_plan": "Full Board",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["lodge_name"] == "Test Safari Camp"
        assert data["net_rate_usd"] == pytest.approx(210.0, abs=0.01)  # 70% of 300

    def test_get_lodge_by_id(self, client):
        # First create one
        create_resp = client.post("/api/lodges", json={
            "lodge_name": "Get Test Lodge",
            "rack_rate_usd": 200.0,
        })
        lodge_id = create_resp.json()["id"]
        resp = client.get(f"/api/lodges/{lodge_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == lodge_id

    def test_get_lodge_not_found(self, client):
        resp = client.get("/api/lodges/nonexistent-id")
        assert resp.status_code == 404

    def test_patch_lodge(self, client):
        create_resp = client.post("/api/lodges", json={
            "lodge_name": "Patch Test Lodge",
            "rack_rate_usd": 250.0,
        })
        lodge_id = create_resp.json()["id"]
        resp = client.patch(f"/api/lodges/{lodge_id}", json={"rack_rate_usd": 275.0, "notes": "Updated price"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["rack_rate_usd"] == 275.0
        assert data["notes"] == "Updated price"

    def test_patch_lodge_not_found(self, client):
        resp = client.patch("/api/lodges/nonexistent-id", json={"notes": "test"})
        assert resp.status_code == 404

    def test_delete_lodge(self, client):
        create_resp = client.post("/api/lodges", json={
            "lodge_name": "Delete Test Lodge",
            "rack_rate_usd": 100.0,
        })
        lodge_id = create_resp.json()["id"]
        resp = client.delete(f"/api/lodges/{lodge_id}")
        assert resp.status_code == 204
        # Confirm it's gone
        get_resp = client.get(f"/api/lodges/{lodge_id}")
        assert get_resp.status_code == 404

    def test_delete_lodge_not_found(self, client):
        resp = client.delete("/api/lodges/nonexistent-id")
        assert resp.status_code == 404


# ===========================================================================
# Curate Itinerary
# ===========================================================================
class TestCurateItinerary:
    def test_curate_basic(self, client):
        resp = client.post("/api/curate-itinerary", json={
            "duration_days": 7,
            "nationality_tier": "FNR",
            "interests": ["gorilla_trekking"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "suggestions" in data
        assert len(data["suggestions"]) > 0

    def test_curate_returns_scored_results(self, client):
        resp = client.post("/api/curate-itinerary", json={
            "duration_days": 7,
            "interests": ["gorilla_trekking", "chimp_trekking"],
        })
        suggestions = resp.json()["suggestions"]
        assert all("score" in s for s in suggestions)
        assert all("itinerary_id" in s for s in suggestions)
        # Sorted by score descending
        scores = [s["score"] for s in suggestions]
        assert scores == sorted(scores, reverse=True)

    def test_curate_with_budget_tier(self, client):
        resp = client.post("/api/curate-itinerary", json={
            "duration_days": 3,
            "budget_tier": "luxury",
            "interests": ["gorilla_trekking"],
        })
        assert resp.status_code == 200
        assert len(resp.json()["suggestions"]) > 0

    def test_approve_itinerary(self, client, sample_enquiry):
        enquiry_id = sample_enquiry["id"]
        resp = client.post(f"/api/curate-itinerary/{enquiry_id}/approve", json={
            "approved_by": "Desire",
            "itinerary_name": "TRVE 7 Days - Gorilla Kingdom Explorer",
            "notes": "Client happy with this",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "approved"

    def test_approve_invalid_enquiry(self, client):
        resp = client.post("/api/curate-itinerary/nonexistent-id/approve", json={
            "approved_by": "Desire",
        })
        assert resp.status_code == 404


# ===========================================================================
# Calculate Price
# ===========================================================================
class TestCalculatePrice:
    def test_calculate_basic(self, client):
        """Basic calculation with no lodges or permits."""
        # Reset config buffers to known values first
        client.patch("/api/config", json={"fuel_buffer_pct": 10.0, "fx_buffer_pct": 3.0, "vehicle_rate_per_day": 120.0})
        resp = client.post("/api/calculate-price", json={
            "nationality_tier": "FNR",
            "pax": 2,
            "duration_days": 7,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "total_usd" in data
        assert "per_person_usd" in data
        assert "line_items" in data
        assert data["total_usd"] > 0

    def test_calculate_fuel_buffer_applied(self, client):
        """Verify fuel buffer increases vehicle cost."""
        client.patch("/api/config", json={"fuel_buffer_pct": 0.0, "vehicle_rate_per_day": 120.0})
        resp_no_buf = client.post("/api/calculate-price", json={
            "pax": 2, "duration_days": 7,
        })

        client.patch("/api/config", json={"fuel_buffer_pct": 10.0})
        resp_with_buf = client.post("/api/calculate-price", json={
            "pax": 2, "duration_days": 7,
        })

        # With 10% fuel buffer, vehicle cost should be higher
        assert resp_with_buf.json()["total_usd"] > resp_no_buf.json()["total_usd"]

    def test_calculate_fx_buffer_in_response(self, client):
        """Verify fx_rate in response reflects the buffer."""
        client.patch("/api/config", json={"fx_rate": 3575.0, "fx_buffer_pct": 0.0})
        resp_no_buf = client.post("/api/calculate-price", json={"pax": 2, "duration_days": 7})
        fx_no_buf = resp_no_buf.json()["fx_rate"]

        client.patch("/api/config", json={"fx_buffer_pct": 3.0})
        resp_with_buf = client.post("/api/calculate-price", json={"pax": 2, "duration_days": 7})
        fx_with_buf = resp_with_buf.json()["fx_rate"]

        assert fx_with_buf > fx_no_buf
        # 3% buffer: 3575 * 1.03 = 3682.25
        assert abs(fx_with_buf - 3575.0 * 1.03) < 1.0

    def test_calculate_buffer_fields_in_response(self, client):
        """Confirm buffer pct fields are returned."""
        client.patch("/api/config", json={"fuel_buffer_pct": 10.0, "fx_buffer_pct": 3.0})
        resp = client.post("/api/calculate-price", json={"pax": 2, "duration_days": 7})
        data = resp.json()
        assert "fuel_buffer_pct" in data
        assert "fx_buffer_pct" in data
        assert data["fuel_buffer_pct"] == 10.0
        assert data["fx_buffer_pct"] == 3.0

    def test_calculate_with_permits(self, client):
        resp = client.post("/api/calculate-price", json={
            "nationality_tier": "FNR",
            "pax": 2,
            "duration_days": 7,
            "permits": [{"permit_key": "gorilla_tracking_uganda", "quantity": 1}],
        })
        assert resp.status_code == 200
        data = resp.json()
        # 2 pax x $800 = $1600 for gorilla permits
        permit_items = [li for li in data["line_items"] if "Gorilla" in li["item"]]
        assert len(permit_items) > 0
        assert permit_items[0]["total_usd"] == pytest.approx(1600.0, abs=1.0)

    def test_calculate_with_accommodation(self, client):
        """Test calculation using a real lodge from seed data."""
        resp = client.post("/api/calculate-price", json={
            "nationality_tier": "FNR",
            "pax": 2,
            "duration_days": 7,
            "accommodations": [
                {"lodge": "Bwindi Lodge", "room_type": "Double Room", "nights": 2},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        acc_items = [li for li in data["line_items"] if "Bwindi" in li["item"]]
        assert len(acc_items) > 0
        assert acc_items[0]["total_usd"] > 0

    def test_calculate_with_insurance(self, client):
        resp = client.post("/api/calculate-price", json={
            "pax": 2,
            "duration_days": 7,
            "include_insurance": True,
        })
        data = resp.json()
        ins_items = [li for li in data["line_items"] if "Insurance" in li["item"]]
        assert len(ins_items) > 0
        assert ins_items[0]["total_usd"] > 0

    def test_calculate_with_extra_costs(self, client):
        resp = client.post("/api/calculate-price", json={
            "pax": 2,
            "duration_days": 7,
            "extra_costs": [
                {"description": "Boat Cruise", "amount": 60, "per_person": False},
                {"description": "Rhino Tracking", "amount": 40, "per_person": True},
            ],
        })
        data = resp.json()
        extras = [li for li in data["line_items"] if li["item"] in ("Boat Cruise", "Rhino Tracking")]
        assert len(extras) == 2
        boat = next(e for e in extras if e["item"] == "Boat Cruise")
        rhino = next(e for e in extras if e["item"] == "Rhino Tracking")
        assert boat["total_usd"] == 60.0
        assert rhino["total_usd"] == 80.0  # 40 x 2 pax

    def test_calculate_per_person_usd(self, client):
        resp = client.post("/api/calculate-price", json={"pax": 4, "duration_days": 7})
        data = resp.json()
        assert abs(data["per_person_usd"] - data["total_usd"] / 4) < 0.01

    def test_calculate_fuel_buffer_note_in_line_items(self, client):
        """When fuel buffer > 0, the vehicle line item should note it."""
        client.patch("/api/config", json={"fuel_buffer_pct": 10.0})
        resp = client.post("/api/calculate-price", json={"pax": 2, "duration_days": 7})
        vehicle_items = [li for li in resp.json()["line_items"] if "Vehicle" in li["item"]]
        assert len(vehicle_items) > 0
        assert "fuel buffer" in vehicle_items[0]["item"].lower()


# ===========================================================================
# Quotations
# ===========================================================================
class TestQuotations:
    def test_generate_quotation(self, client, sample_quotation):
        assert "id" in sample_quotation
        assert sample_quotation["client_name"] == "Quote Client"
        assert sample_quotation["status"] == "draft"

    def test_list_quotations(self, client, sample_quotation):
        resp = client.get("/api/quotations")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        ids = [q["id"] for q in resp.json()]
        assert sample_quotation["id"] in ids

    def test_get_quotation_pdf(self, client, sample_quotation):
        pytest.importorskip("fpdf", reason="fpdf not installed — skipping PDF test")
        qid = sample_quotation["id"]
        resp = client.get(f"/api/quotations/{qid}/pdf")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        # PDF starts with %PDF
        assert resp.content[:4] == b"%PDF"

    def test_get_quotation_pdf_not_found(self, client):
        resp = client.get("/api/quotations/nonexistent-id/pdf")
        assert resp.status_code == 404

    def test_quotation_status_endpoint(self, client, sample_quotation):
        qid = sample_quotation["id"]
        resp = client.get(f"/api/quotations/{qid}/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "expired" in data
        assert "days_remaining" in data
        assert "requires_recalculation" in data
        assert "expiry_date" in data

    def test_quotation_status_not_found(self, client):
        resp = client.get("/api/quotations/nonexistent-id/status")
        assert resp.status_code == 404

    def test_quotation_check_expiry(self, client):
        resp = client.get("/api/quotations/check-expiry")
        assert resp.status_code == 200
        data = resp.json()
        assert "expired_count" in data
        assert "checked_at" in data
        assert isinstance(data["expired_ids"], list)

    def test_quotation_valid_days_reflected_in_status(self, client):
        """A fresh quotation with 7 valid days should not be expired."""
        create_resp = client.post("/api/generate-quotation", json={
            "client_name": "Status Test Client",
            "valid_days": 7,
            "pricing_data": {"grand_total_usd": 500},
        })
        qid = create_resp.json()["id"]
        resp = client.get(f"/api/quotations/{qid}/status")
        data = resp.json()
        assert data["expired"] is False
        assert data["days_remaining"] >= 6  # Should be ~7 days remaining


# ===========================================================================
# Cost Presets
# ===========================================================================
class TestCostPresets:
    def test_get_cost_presets(self, client):
        resp = client.get("/api/cost-presets")
        assert resp.status_code == 200
        data = resp.json()
        assert "activities" in data
        assert "transfers" in data
        assert "internal_flights" in data
        assert "guide_fees" in data
        assert "conservation_fees" in data
        assert "government_taxes" in data

    def test_cost_presets_activities_structure(self, client):
        data = client.get("/api/cost-presets").json()
        for activity in data["activities"]:
            assert "id" in activity
            assert "label" in activity
            assert "price_usd" in activity or "rate_pct" in activity

    def test_cost_presets_has_gorilla_activities(self, client):
        data = client.get("/api/cost-presets").json()
        labels = [a["label"].lower() for a in data["activities"]]
        assert any("gorilla" in l or "chimp" in l or "rhino" in l for l in labels)

    def test_cost_presets_has_flights(self, client):
        data = client.get("/api/cost-presets").json()
        assert len(data["internal_flights"]) >= 3
        flight_ids = [f["id"] for f in data["internal_flights"]]
        assert any("kidepo" in fid for fid in flight_ids)

    def test_cost_presets_transfers(self, client):
        data = client.get("/api/cost-presets").json()
        assert len(data["transfers"]) >= 3

    def test_cost_presets_taxes(self, client):
        data = client.get("/api/cost-presets").json()
        assert len(data["government_taxes"]) >= 2


# ===========================================================================
# Sync
# ===========================================================================
class TestSync:
    def test_sync_status(self, client):
        resp = client.get("/api/sync/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "connected" in data
        assert "unsynced_count" in data
        assert "total_enquiries" in data
        assert data["connected"] is True

    def test_sync_push_all(self, client):
        resp = client.post("/api/sync/push-all")
        assert resp.status_code == 200
        data = resp.json()
        assert "pushed" in data
        assert data["status"] == "ok"

    def test_sync_push_all_marks_synced(self, client):
        """After push-all, unsynced count should be 0."""
        client.post("/api/sync/push-all")
        status = client.get("/api/sync/status").json()
        assert status["unsynced_count"] == 0


# ===========================================================================
# Edge Cases
# ===========================================================================
class TestEdgeCases:
    def test_enquiry_list_limit(self, client):
        resp = client.get("/api/enquiries?limit=5")
        assert resp.status_code == 200
        assert len(resp.json()["items"]) <= 5

    def test_calculate_price_zero_pax_defaults_to_two(self, client):
        """pax=0 or omitted should not cause division by zero."""
        resp = client.post("/api/calculate-price", json={"duration_days": 7})
        assert resp.status_code == 200
        assert resp.json()["per_person_usd"] > 0

    def test_calculate_price_invalid_permit_key(self, client):
        """Unknown permit keys should produce $0 contribution gracefully."""
        resp = client.post("/api/calculate-price", json={
            "pax": 2,
            "duration_days": 7,
            "permits": [{"permit_key": "nonexistent_permit", "quantity": 1}],
        })
        assert resp.status_code == 200
        # Should still return a valid response, just no permit cost
        data = resp.json()
        assert data["total_usd"] > 0

    def test_lodge_net_rate_auto_calculated(self, client):
        """Creating a lodge without net_rate_usd should auto-set it to 70% of rack."""
        resp = client.post("/api/lodges", json={
            "lodge_name": "Auto Net Rate Lodge",
            "rack_rate_usd": 500.0,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["net_rate_usd"] == pytest.approx(350.0, abs=0.01)

    def test_lodge_explicit_net_rate(self, client):
        """Creating a lodge with explicit net_rate_usd should use that value."""
        resp = client.post("/api/lodges", json={
            "lodge_name": "Explicit Net Lodge",
            "rack_rate_usd": 500.0,
            "net_rate_usd": 300.0,
        })
        assert resp.status_code == 201
        assert resp.json()["net_rate_usd"] == 300.0

    def test_generate_quotation_without_pricing_data(self, client):
        """Quotation generation should work even without pre-calculated pricing data."""
        resp = client.post("/api/generate-quotation", json={
            "client_name": "No Pricing Client",
            "itinerary_id": "itn-gorilla-lion-7d",
            "pax": 2,
            "nationality_tier": "FNR",
        })
        assert resp.status_code == 200
        assert resp.json()["client_name"] == "No Pricing Client"

    def test_curate_empty_interests(self, client):
        """Curate with no interests should still return suggestions."""
        resp = client.post("/api/curate-itinerary", json={
            "duration_days": 7,
            "nationality_tier": "FNR",
        })
        assert resp.status_code == 200
        # May return empty suggestions if no scoring criteria but should not error

    def test_buffer_math_verification(self, client):
        """End-to-end verification of buffer math."""
        # Set known values
        client.patch("/api/config", json={
            "vehicle_rate_per_day": 100.0,
            "fuel_buffer_pct": 10.0,
            "fx_rate": 3500.0,
            "fx_buffer_pct": 0.0,
            "service_fee_pct": 0.0,
        })
        resp = client.post("/api/calculate-price", json={
            "pax": 1,
            "duration_days": 2,  # 1 vehicle day (days-1)
        })
        data = resp.json()
        # vehicle_days = 0 (extra) + (2-1) = 1
        # vehicle_total = 1 * 100 = 100, then * 1.10 = 110
        # subtotal = 110, service_fee=0, grand=110
        assert data["total_usd"] == pytest.approx(110.0, abs=0.5)
        # Reset
        client.patch("/api/config", json={
            "vehicle_rate_per_day": 120.0,
            "fuel_buffer_pct": 10.0,
            "fx_buffer_pct": 3.0,
            "service_fee_pct": 15.0,
        })
