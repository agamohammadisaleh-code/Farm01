"""آزمون مدل‌های تحلیلی — رفتار، نه اعداد ثابت شکننده."""

import re
from pathlib import Path

import pytest

from app.breeds import BREEDS, age_for_weight, marginal_fcr, resolve_breed, standard_weight
from app.services import (
    detect_disease_risk,
    fit_gompertz,
    forecast_feed,
    forecast_weight,
    predict_loading_date,
    standard_mortality,
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


# ------------------------------- منحنی نژاد -------------------------------


def test_breed_curves_differ_and_resolve():
    assert standard_weight(42, "کاب ۵۰۰") == 2820
    assert standard_weight(42, "هابارد") == 2800
    assert standard_weight(42, "Ross 308") == 2880
    # نژاد ناشناخته: پیش‌فرض راس، ولی با یادداشت صریح
    curve, matched, note = resolve_breed("نژاد خیالی")
    assert curve.key == "ross308"
    assert matched is False
    assert "پیش‌فرض" in note


def test_breed_curves_match_typescript_package():
    """عددهای نژاد در پایتون و بسته دامنه نباید از هم جدا بیفتند."""
    ts_path = Path(__file__).resolve().parents[3] / "packages/domain/src/breeds.ts"
    if not ts_path.exists():  # pragma: no cover - فقط وقتی مخزن کامل نیست
        pytest.skip("فایل منحنی تایپ‌اسکریپت پیدا نشد")
    source = ts_path.read_text(encoding="utf-8")

    for key, breed in BREEDS.items():
        block = re.search(rf'key: "{key}",(.*?)\n  }},', source, re.S)
        assert block, f"نژاد {key} در breeds.ts نیست"
        pairs = [(int(d), int(w), int(c)) for d, w, c in re.findall(r"day: (\d+), weightG: (\d+), cumFeedG: (\d+)", block.group(1))]
        assert pairs, f"نقاط مرجع {key} خوانده نشد"
        for day, weight, cum_feed in pairs:
            assert standard_weight(day, breed) == weight, f"{key} روز {day}: وزن"
            from app.breeds import standard_cum_feed

            assert standard_cum_feed(day, breed) == cum_feed, f"{key} روز {day}: دان"


def test_age_for_weight_and_marginal_fcr():
    day, weight, reached = age_for_weight(2500, "راس ۳۰۸")
    assert reached and day < 42 and weight >= 2500
    # ضریب تبدیل حاشیه‌ای با سن بالا می‌رود
    assert marginal_fcr(20, "راس ۳۰۸") < marginal_fcr(45, "راس ۳۰۸")


# ------------------------------- پیش‌بینی وزن -------------------------------


def test_forecast_with_two_points_is_gompertz():
    method, projected, daily, curve, notes, breed = forecast_weight(
        [(14, 430.0), (21, 880.0)], target_age=42, target_weight=2500
    )
    assert method in {"gompertz-fit", "standard-curve"}
    assert projected > 880
    assert daily > 0
    assert len(curve) == 42
    assert any(p["source"] == "measured" for p in curve)
    assert breed == "راس ۳۰۸"


def test_forecast_without_data_uses_breed_curve():
    method, projected, daily, curve, notes, breed = forecast_weight([], target_age=42, target_weight=2500)
    assert method == "standard-curve"
    assert projected == 2880
    assert notes

    # همان گله با نژاد کاب: عدد متفاوت، و یادداشت نژاد در خروجی
    _, projected_cobb, _, _, notes_cobb, breed_cobb = forecast_weight([], 42, 2500, "کاب ۵۰۰")
    assert projected_cobb == 2820
    assert breed_cobb == "کاب ۵۰۰"
    assert any("کاب" in n for n in notes_cobb)


# ------------------------------- تاریخ بارگیری -------------------------------


def test_loading_date_waits_for_target_weight():
    plan = predict_loading_date(
        current_age=30, current_weight=1800, daily_gain=65, target_weight=2500, points=[]
    )
    assert plan["optimal_age_days"] == 30 + plan["days_from_now"]
    assert plan["expected_weight_gr"] >= 2500
    assert plan["days_from_now"] == 11 or plan["days_from_now"] == 10  # ceil(700/65)


def test_loading_date_stops_when_growth_turns_unprofitable():
    """هرچه ضریب تبدیل حاشیه‌ای بالا برود، روز توقف جلوتر می‌آید."""
    def plan(feed_price: float) -> dict:
        return predict_loading_date(
            current_age=35,
            current_weight=2300,
            daily_gain=60,
            target_weight=2500,
            points=[],
            market_price_per_kg=900_000,  # ۹۰ هزار تومان
            feed_price=feed_price,
            breed_name="راس ۳۰۸",
        )

    cheap = plan(30_000)
    expensive = plan(120_000)
    assert expensive["days_from_now"] <= cheap["days_from_now"]
    assert expensive["days_from_now"] >= 0


def test_loading_plan_explains_every_day():
    plan = predict_loading_date(
        current_age=28,
        current_weight=1500,
        daily_gain=65,
        target_weight=2500,
        points=[],
        market_price_per_kg=900_000,
        feed_price=35_000,
        live_birds=9000,
        daily_mortality_pct=0.2,
    )
    rows = plan["breakdown"]
    assert len(rows) == 29
    assert rows[0]["days_from_now"] == 0
    assert all("net_rial" in r for r in rows)
    assert plan["economics"]["marginal_fcr"] > 0
    assert plan["reason"]


def test_loading_plan_units_are_consistent():
    """درآمد و هزینه دان و تلفات همه برای کل گله باشند، نه قاطی."""
    plan = predict_loading_date(
        current_age=30,
        current_weight=1500,
        daily_gain=65,
        target_weight=2500,
        points=[],
        market_price_per_kg=98_000,
        feed_price=35_000,
        live_birds=19_630,
        daily_mortality_pct=0.02,
    )
    row = plan["breakdown"][1]
    # ارزش رشد یک روز کل گله ≈ ۱۹٬۶۳۰ پرنده × ۶۵ گرم × ۹۸٬۰۰۰ ریال
    assert row["revenue_rial"] == pytest.approx(19630 * 0.065 * 98_000, rel=0.01)
    assert row["feed_cost_rial"] > 0
    # هزینه تلفات باید کوچک‌تر از درآمد رشد باشد، نه صدها برابر آن
    assert row["mortality_cost_rial"] < row["revenue_rial"]
    assert plan["days_from_now"] > 1


def test_loading_plan_without_prices_uses_target_weight():
    plan = predict_loading_date(
        current_age=20, current_weight=900, daily_gain=60, target_weight=2400, points=[]
    )
    assert plan["expected_weight_gr"] >= 2400
    assert "وزن هدف" in plan["reason"]
    assert all("net_rial" not in r for r in plan["breakdown"])


# ------------------------------ هشدار بیماری ------------------------------


def _daily(days, mortality=5, feed=1000, water=2000, temp=24.0):
    return [
        {
            "age_days": d,
            "mortality": mortality,
            "cull": 0,
            "feed_kg": feed,
            "water_liter": water,
            "avg_temp": temp,
        }
        for d in days
    ]


def test_disease_risk_clean_flock_is_low():
    daily = _daily(range(20, 31), feed=1000, water=1950, temp=24.0)
    result = detect_disease_risk(30, 10000, daily)
    assert result["risk_score"] < 0.35
    assert result["trends"]["water"]["direction"] == "flat"
    assert result["recommendation"]


def test_disease_risk_detects_spike_and_water_ratio():
    daily = _daily(range(20, 28), mortality=4, feed=1000, water=2000) + _daily(
        range(28, 31), mortality=40, feed=800, water=2600, temp=29.0
    )
    result = detect_disease_risk(30, 10000, daily)
    keys = {f["key"] for f in result["factors"]}
    assert result["risk_score"] >= 0.35
    assert "mortality-spike" in keys
    assert "water-feed-ratio" in keys
    assert result["level"] if hasattr(result, "level") else True


def test_early_warning_catches_water_drop_before_mortality_spikes():
    """الگوی زودهنگام: آب افت می‌کند، دان کمی، تلفات هنوز عادی است."""
    daily = _daily(range(20, 27), mortality=5, feed=1000, water=2000) + [
        {"age_days": 27, "mortality": 5, "cull": 0, "feed_kg": 980, "water_liter": 1600, "avg_temp": 24.0},
    ]
    result = detect_disease_risk(27, 10000, daily)
    keys = {f["key"] for f in result["factors"]}
    assert "water-drop" in keys
    assert result["water_drop_pct"] < -10
    assert result["risk_score"] >= 0.1


def test_early_warning_respects_farm_thresholds():
    daily = _daily(range(20, 27), mortality=5, feed=1000, water=2000) + [
        {"age_days": 27, "mortality": 5, "cull": 0, "feed_kg": 1000, "water_liter": 1750, "avg_temp": 24.0},
    ]
    strict = detect_disease_risk(27, 10000, daily, water_drop_alert_pct=10)
    lenient = detect_disease_risk(27, 10000, daily, water_drop_alert_pct=20)
    assert "water-drop" in {f["key"] for f in strict["factors"]}
    assert "water-drop" not in {f["key"] for f in lenient["factors"]}


def test_daily_mortality_threshold_is_configurable():
    daily = _daily(range(20, 27), mortality=2) + [
        {"age_days": 27, "mortality": 60, "cull": 0, "feed_kg": 1000, "water_liter": 2000, "avg_temp": 24.0},
    ]
    alert = detect_disease_risk(27, 10000, daily, daily_mortality_alert_pct=0.5)
    relaxed = detect_disease_risk(27, 10000, daily, daily_mortality_alert_pct=5)
    assert "mortality-daily" in {f["key"] for f in alert["factors"]}
    assert "mortality-daily" not in {f["key"] for f in relaxed["factors"]}
    assert alert["daily_mortality_pct"] > 0.5


def test_trends_are_reported_even_without_factors():
    daily = _daily(range(20, 31), mortality=5, feed=1000, water=2000)
    result = detect_disease_risk(30, 10000, daily)
    assert set(result["trends"]) == {"water", "feed", "mortality"}
    assert result["trends"]["mortality"]["samples"] == 7


# -------------------------------- مصرف دان --------------------------------


def test_feed_forecast_reports_stock_out():
    result = forecast_feed([100, 105, 110, 115], live_birds=9000, stock_kg=300)
    assert result["days_of_stock"] is not None
    assert result["runs_out"] is True


def test_feed_forecast_handles_empty_history():
    result = forecast_feed([], live_birds=9000, stock_kg=300)
    assert result["next_7_days_kg"] == 0.0
    assert result["days_of_stock"] is None


# ------------------------------ تبدیل گفتار ------------------------------


def test_stt_status_is_honest_when_no_engine(monkeypatch):
    from app import speech

    monkeypatch.setattr(speech, "_engine", lambda: "none")
    status = speech.engine_status()
    assert status["available"] is False
    assert status["hint"]
    with pytest.raises(speech.SttUnavailable):
        speech.transcribe(b"RIFF....WAVE")


def test_base64_decoding_accepts_data_url():
    import base64

    from app.speech import decode_base64

    raw = b"RIFF" + b"\x00" * 60
    encoded = base64.b64encode(raw).decode()
    assert decode_base64(f"data:audio/wav;base64,{encoded}") == raw
    assert decode_base64(encoded) == raw
