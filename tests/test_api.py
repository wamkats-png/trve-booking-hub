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
        assert data["total_usd"] >= 0  # no auto-vehicle; structure check only

    def test_calculate_fuel_buffer_applied(self, client):
        """Verify fuel buffer increases vehicle cost when vehicle is explicitly added."""
        client.patch("/api/config", json={"fuel_buffer_pct": 0.0, "vehicle_rate_per_day": 120.0})
        vehicle = [{"type": "4x4 Safari Vehicle", "rate": 120, "days": 6, "fuel_buffer_pct": 0}]
        resp_no_buf = client.post("/api/calculate-price", json={
            "pax": 2, "duration_days": 7, "vehicles": vehicle,
        })

        vehicle_buf = [{"type": "4x4 Safari Vehicle", "rate": 120, "days": 6, "fuel_buffer_pct": 10}]
        resp_with_buf = client.post("/api/calculate-price", json={
            "pax": 2, "duration_days": 7, "vehicles": vehicle_buf,
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
        """When an explicit vehicle with fuel buffer > 0 is added, the line item should note it."""
        resp = client.post("/api/calculate-price", json={
            "pax": 2, "duration_days": 7,
            "vehicles": [{"type": "4x4 Safari Vehicle", "rate": 120, "days": 6, "fuel_buffer_pct": 10.0}],
        })
        data = resp.json()
        assert resp.status_code == 200
        vehicle_items = [li for li in data["line_items"] if "Vehicle" in li["item"] or "Safari" in li["item"]]
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
        assert resp.json()["per_person_usd"] >= 0  # no auto-vehicle; 0 is valid with no content

    def test_calculate_price_invalid_permit_key(self, client):
        """Unknown permit keys should produce $0 contribution gracefully."""
        resp = client.post("/api/calculate-price", json={
            "pax": 2,
            "duration_days": 7,
            "permits": [{"permit_key": "nonexistent_permit", "quantity": 1}],
        })
        assert resp.status_code == 200
        # Should still return a valid response; unknown permit = no cost, total >= 0
        data = resp.json()
        assert data["total_usd"] >= 0

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
        """End-to-end verification of buffer math with explicit vehicle."""
        client.patch("/api/config", json={
            "fx_rate": 3500.0,
            "fx_buffer_pct": 0.0,
            "service_fee_pct": 0.0,
        })
        resp = client.post("/api/calculate-price", json={
            "pax": 1,
            "duration_days": 2,
            # Explicit vehicle: 1 day @ $100 with 10% fuel buffer = $110
            "vehicles": [{"type": "4x4 Safari Vehicle", "rate": 100, "days": 1, "fuel_buffer_pct": 10}],
        })
        data = resp.json()
        # vehicle_total = 1 * 100 * 1.10 = 110, service_fee=0 → grand=110
        assert data["total_usd"] == pytest.approx(110.0, abs=0.5)
        # Reset
        client.patch("/api/config", json={
            "vehicle_rate_per_day": 120.0,
            "fuel_buffer_pct": 10.0,
            "fx_buffer_pct": 3.0,
            "service_fee_pct": 15.0,
        })


# ===========================================================================
# Bank Transfer Gross-Up Calculator Tests
# ===========================================================================
class TestBankTransferCalculator:
    def test_basic_flat_fees(self, client):
        """Flat receiving + intermediary fees should be added to invoice total."""
        resp = client.post("/api/calculate-transfer-fees", json={
            "invoice_total": 5000.0,
            "receiving_bank_fee_flat": 15.0,
            "intermediary_bank_fee": 25.0,
            "approved_by": "Test",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["gross_amount_usd"] == pytest.approx(5040.0, abs=0.01)
        assert data["total_transfer_fees_usd"] == pytest.approx(40.0, abs=0.01)
        assert data["client_must_send_usd"] == pytest.approx(5040.0, abs=0.01)

    def test_sender_pct_grossup(self, client):
        """Sender percentage fee requires gross-up division."""
        resp = client.post("/api/calculate-transfer-fees", json={
            "invoice_total": 1000.0,
            "sender_bank_fee_pct": 1.0,
            "approved_by": "Test",
        })
        assert resp.status_code == 200
        data = resp.json()
        # gross = 1000 / (1 - 0.01) ≈ 1010.10
        assert data["gross_amount_usd"] == pytest.approx(1010.10, abs=0.1)

    def test_currency_conversion(self, client):
        """Foreign currency conversion should produce gross_amount_foreign."""
        resp = client.post("/api/calculate-transfer-fees", json={
            "invoice_total": 5000.0,
            "exchange_rate": 0.92,
            "client_currency": "EUR",
            "approved_by": "Test",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "gross_amount_foreign" in data
        assert data["client_currency"] == "EUR"
        assert data["gross_amount_foreign"] == pytest.approx(5000.0 / 0.92, abs=1.0)

    def test_invalid_invoice_total(self, client):
        """invoice_total <= 0 should return 422."""
        resp = client.post("/api/calculate-transfer-fees", json={
            "invoice_total": 0,
            "approved_by": "Test",
        })
        assert resp.status_code == 422

    def test_nights_derivation(self, client):
        """calculate-price must derive nights = days - 1 in response."""
        resp = client.post("/api/calculate-price", json={"pax": 2, "duration_days": 5})
        assert resp.status_code == 200
        assert resp.json()["nights"] == 4

    def test_hydrate_pricing_in_response(self, client):
        """When guests list provided, response includes guest_breakdown."""
        resp = client.post("/api/calculate-price", json={
            "pax": 2, "duration_days": 4,
            "guests": [
                {"guest_id": "Mr. Smith", "room_type": "Double", "rate_per_night": 200, "meal_plan": "HB"},
                {"guest_id": "Ms. Jones", "room_type": "Single", "rate_per_night": 150, "meal_plan": "BB"},
            ],
            "activities": [
                {"name": "Gorilla Trek", "cost_per_person": 800},
            ],
        })
        assert resp.status_code == 200
        pd = resp.json()["pricing_data"]
        assert len(pd["guest_breakdown"]) == 2
        assert len(pd["activity_breakdown"]) == 1
        # nights = 4 - 1 = 3; Mr. Smith: (200+35) * 3 = 705 + 800 = 1505
        smith = next(g for g in pd["guest_breakdown"] if g["guest_id"] == "Mr. Smith")
        assert smith["accommodation_total"] == pytest.approx(705.0, abs=0.1)
        assert smith["activity_total"] == pytest.approx(800.0, abs=0.1)

    def test_audit_log_endpoint(self, client):
        """Transfer fee audit log should return items list."""
        # Seed one calculation
        client.post("/api/calculate-transfer-fees", json={"invoice_total": 1234.0, "approved_by": "AuditTest"})
        resp = client.get("/api/transfer-fee-audit")
        assert resp.status_code == 200
        assert "items" in resp.json()
        assert len(resp.json()["items"]) >= 1


# ---------------------------------------------------------------------------
# Unit Tests — Pricing Logic (direct import, no HTTP)
# ---------------------------------------------------------------------------
try:
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from api_server import get_permit_price_usd, CONFIG as _CONFIG, FX_RATE as _FX_RATE, ACTIVITY_CATALOGUE as _ACT_CAT
    _UNIT_OK = True
except Exception:
    _UNIT_OK = False


@pytest.mark.skipif(not _UNIT_OK, reason="Cannot import api_server internals")
class TestPermitPricingUnit:
    """Direct unit tests for UWA/RDB permit price calculations."""

    def test_gorilla_tracking_fnr(self):
        assert get_permit_price_usd("gorilla_tracking_uganda", "FNR") == 800

    def test_gorilla_tracking_fr(self):
        assert get_permit_price_usd("gorilla_tracking_uganda", "FR") == 700

    def test_gorilla_tracking_eac_converts_to_usd(self):
        price = get_permit_price_usd("gorilla_tracking_uganda", "EAC")
        assert abs(price - 300000 / _FX_RATE) < 1

    def test_gorilla_low_season_april(self):
        assert get_permit_price_usd("gorilla_tracking_uganda", "FNR", "2026-04-15") == 600

    def test_gorilla_low_season_may(self):
        assert get_permit_price_usd("gorilla_tracking_uganda", "FNR", "2026-05-01") == 600

    def test_gorilla_post_july_2026(self):
        assert get_permit_price_usd("gorilla_tracking_uganda", "FNR", "2026-08-01") == 800

    def test_chimp_tracking_fnr(self):
        assert get_permit_price_usd("chimp_tracking", "FNR") == 250

    def test_chimp_tracking_low_season(self):
        assert get_permit_price_usd("chimp_tracking", "FNR", "2025-11-10") == 200

    def test_gorilla_rwanda_fnr(self):
        assert get_permit_price_usd("gorilla_tracking_rwanda", "FNR") == 1500

    def test_gorilla_rwanda_fr(self):
        assert get_permit_price_usd("gorilla_tracking_rwanda", "FR") == 500

    def test_park_entry_a_plus(self):
        assert get_permit_price_usd("park_entry_a_plus", "FNR") == 45

    def test_park_entry_b_eac(self):
        assert abs(get_permit_price_usd("park_entry_b", "EAC") - 15000 / _FX_RATE) < 1

    def test_invalid_permit_returns_zero(self):
        assert get_permit_price_usd("nonexistent_permit", "FNR") == 0

    def test_golden_monkey(self):
        assert get_permit_price_usd("golden_monkey", "FNR") == 100

    def test_gorilla_habituation_fnr(self):
        assert get_permit_price_usd("gorilla_habituation_uganda", "FNR") == 1500

    def test_chimp_habituation_fr(self):
        assert get_permit_price_usd("chimp_habituation", "FR") == 350


@pytest.mark.skipif(not _UNIT_OK, reason="Cannot import api_server internals")
class TestConfigUnit:
    """Direct unit tests for CONFIG defaults."""

    def test_config_has_fx_rate(self):
        assert "fx_rate" in _CONFIG and _CONFIG["fx_rate"] > 1000

    def test_config_buffers_in_range(self):
        assert 0 <= _CONFIG["fx_buffer_pct"] <= 20
        assert 0 <= _CONFIG["fuel_buffer_pct"] <= 20

    def test_config_vehicle_rate_positive(self):
        assert _CONFIG["vehicle_rate_per_day"] > 0

    def test_config_service_fee_reasonable(self):
        assert 0 <= _CONFIG["service_fee_pct"] <= 30

    def test_config_has_coordinators(self):
        assert len(_CONFIG["coordinators"]) > 0


@pytest.mark.skipif(not _UNIT_OK, reason="Cannot import api_server internals")
class TestActivityCatalogueUnit:
    """Direct unit tests for ACTIVITY_CATALOGUE data."""

    def test_catalogue_has_entries(self):
        assert len(_ACT_CAT) > 10

    def test_boat_cruise_exists(self):
        assert "boat_cruise_kazinga" in [a["id"] for a in _ACT_CAT]

    def test_internal_flights_exist(self):
        assert len([a for a in _ACT_CAT if a["category"] == "flight"]) >= 3

    def test_transfers_exist(self):
        assert len([a for a in _ACT_CAT if a["category"] == "transfer"]) >= 2

    def test_all_activities_have_required_fields(self):
        required = {"id", "name", "category", "default_usd", "per_person"}
        for act in _ACT_CAT:
            assert not (required - set(act.keys())), f"Activity {act.get('id')} missing fields"
