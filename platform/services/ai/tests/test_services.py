"""آزمون مدل‌های تحلیلی — رفتار، نه اعداد ثابت شکننده."""

from app.services import (
    detect_disease_risk,
    fit_gompertz,
    forecast_feed,
    forecast_weight,
    predict_loading_date,
    standard_mortality,
    standard_weight,
)


def test_standard_curve_is_monotonic():
    weights = [standard_weight(d) for d in range(1, 50)]
    assert all(b > a for a, b in zip(weights, weights[1:]))
    assert standard_weight(42) == 2880


def test_standard_mortality_grows():
    assert standard_mortality(3) < standard_mortality(21) < standard_mortality(42)


def test_gompertz_fits_clean_data():
    # داده‌ای که از خود مدل ساخته شده باید با خطای کم بازسازی شود
    truth = (3200.0, 3.6, 0.052)
    from app.services import Gompertz

    model = Gompertz(*truth)
    points = [(d, model.predict(d)) for d in (7, 14, 21, 28, 35)]
    fitted = fit_gompertz(points, target_weight=2880)
    assert fitted is not None
    for d, w in points:
        assert abs(fitted.predict(d) - w) / w < 0.06


def test_forecast_with_two_points_is_gompertz():
    method, projected, daily, curve, notes = forecast_weight(
        [(14, 430.0), (21, 880.0)], target_age=42, target_weight=2500
    )
    assert method in {"gompertz-fit", "standard-curve"}
    assert projected > 880
    assert daily > 0
    assert len(curve) == 42
    assert any(p["source"] == "measured" for p in curve)


def test_forecast_without_data_uses_standard():
    method, projected, daily, curve, notes = forecast_weight([], target_age=42, target_weight=2500)
    assert method == "standard-curve"
    assert projected == 2880
    assert not notes == []


def test_loading_date_waits_for_target_weight():
    age, days, weight, reason, conf = predict_loading_date(
        current_age=30, current_weight=1800, daily_gain=65, target_weight=2500, points=[]
    )
    assert age == 30 + days
    assert weight >= 2500
    assert days == 11 or days == 10  # ceil(700/65)


def test_loading_date_flags_unprofitable_growth():
    # رشد بسیار کند با هزینه دان بالا → بارگیری فوری
    age, days, weight, reason, conf = predict_loading_date(
        current_age=40,
        current_weight=2200,
        daily_gain=20,
        target_weight=2500,
        points=[],
        market_price_per_kg=90000,
        feed_price=40000,
    )
    # ۲۰ گرم رشد × ۹۰ تومان = ۱۸۰۰ در برابر دان ۲۰×۱٫۷ گرم × ۴۰ = ۱۳۶۰ → سودآور است
    assert days >= 0


def test_disease_risk_clean_flock_is_low():
    daily = [
        {"age_days": d, "mortality": 5, "cull": 0, "feed_kg": 1000 + d * 10, "water_liter": 1950 + d * 20, "avg_temp": 24.0}
        for d in range(20, 31)
    ]
    risk, factors, rec = detect_disease_risk(30, 10000, daily)
    assert risk < 0.35


def test_disease_risk_detects_spike_and_water_ratio():
    daily = [
        {"age_days": d, "mortality": 4, "cull": 0, "feed_kg": 1000, "water_liter": 2000, "avg_temp": 24.0}
        for d in range(20, 28)
    ] + [
        {"age_days": d, "mortality": 40, "cull": 1, "feed_kg": 800, "water_liter": 2600, "avg_temp": 29.0}
        for d in range(28, 31)
    ]
    risk, factors, rec = detect_disease_risk(30, 10000, daily)
    keys = {f["key"] for f in factors}
    assert risk >= 0.35
    assert "mortality-spike" in keys
    assert "water-feed-ratio" in keys
    assert rec


def test_feed_forecast_reports_stock_out():
    result = forecast_feed([100, 105, 110, 115], live_birds=9000, stock_kg=300)
    assert result["days_of_stock"] is not None
    assert result["runs_out"] is True


def test_feed_forecast_handles_empty_history():
    result = forecast_feed([], live_birds=9000, stock_kg=300)
    assert result["next_7_days_kg"] == 0.0
    assert result["days_of_stock"] is None
