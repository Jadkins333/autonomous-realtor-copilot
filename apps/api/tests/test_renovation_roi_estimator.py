from app.services.insights import build_renovation_project_estimates


def test_build_renovation_project_estimates_returns_category_ranges() -> None:
    estimates = build_renovation_project_estimates(
        roi_band="medium",
        property_type="single_family",
        permit_mix={"kitchen remodel": 4, "bath remodel": 2, "paint": 1},
    )

    assert [item["project"] for item in estimates] == [
        "Kitchen",
        "Bath",
        "Paint",
        "Curb appeal",
        "Flooring",
    ]
    assert all("%" in item["roi_range"] for item in estimates)
    assert all(item["confidence"] in {"low", "medium", "high"} for item in estimates)
    assert any("permit mix" in item["rationale"].lower() for item in estimates)
