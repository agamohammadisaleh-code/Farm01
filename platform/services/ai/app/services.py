"""مدل‌های تحلیلی سرویس هوش مصنوعی.

طراحی عمدی: هیچ مدل یادگیری عمیقی اینجا نیست. با حجم داده یک مزرعه (چند
گله، چند ده وزن‌گیری) مدل پارامتری رشد (گومپرتز) و قواعد آماری تلفات،
دقیق‌تر و قابل‌توضیح‌تر از شبکه عصبی است — و مالک می‌تواند بفهمد چرا سیستم
چنین عددی داده است. هر خروجی همراه `reason`/`notes` برمی‌گردد.

منحنی نژادها در `breeds.py` است؛ اینجا فقط ریاضیات برازش و قواعد ریسک.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .breeds import (
    Breed,
    age_for_weight,
    fa_digits,
    marginal_fcr,
    marginal_feed_gr,
    resolve_breed,
    standard_cum_feed,
    standard_weight,
)

# مرجع تلفات تجمعی (درصد) بر پایه تجربه مزارع گوشتی
MORTALITY_ANCHORS: list[tuple[int, float]] = [
    (3, 0.3),
    (7, 0.8),
    (14, 1.5),
    (21, 2.0),
    (28, 2.6),
    (35, 3.2),
    (42, 3.9),
    (49, 4.7),
]


def standard_mortality(day: int) -> float:
    day = max(1, min(49, int(day)))
    for i in range(len(MORTALITY_ANCHORS) - 1):
        d0, m0 = MORTALITY_ANCHORS[i]
        d1, m1 = MORTALITY_ANCHORS[i + 1]
        if d0 <= day <= d1:
            t = (day - d0) / (d1 - d0)
            return m0 + t * (m1 - m0)
    return MORTALITY_ANCHORS[-1][1]


@dataclass
class Gompertz:
    """W(t) = A · exp(−b · exp(−k·t))"""

    a: float
    b: float
    k: float

    def predict(self, day: float) -> float:
        return self.a * math.exp(-self.b * math.exp(-self.k * day))


def fit_gompertz(points: list[tuple[int, float]], target_weight: float = 2880.0) -> Gompertz | None:
    """برازش گومپرتز با جست‌وجوی شبکه‌ای + پالایش محلی.

    نقاط کم است (۳ تا ۱۰ نمونه)، پس کمترین مربعات خطی پایدار نیست؛ جست‌وجوی
    محدود روی سه پارامتر با دامنه‌های بیولوژیک نتیجه قابل‌اتکا می‌دهد.
    """
    if len(points) < 2:
        return None

    best: tuple[float, Gompertz] | None = None

    # دامنه‌ها: A وزن نهایی (گرم)، b شکل، k سرعت بلوغ
    a_values = [target_weight * f for f in (0.95, 1.0, 1.05, 1.1, 1.15, 1.25, 1.35)]
    b_values = [x / 10 for x in range(10, 45)]      # 1.0 تا 4.4
    k_values = [x / 1000 for x in range(20, 91, 2)]  # 0.020 تا 0.090

    for a in a_values:
        for b in b_values:
            for k in k_values:
                model = Gompertz(a, b, k)
                sse = 0.0
                for day, weight in points:
                    err = model.predict(day) - weight
                    sse += err * err
                if best is None or sse < best[0]:
                    best = (sse, model)

    if best is None:
        return None

    # پالایش محلی: هر پارامتر را کمی جابه‌جا کن و اگر بهتر شد بپذیر
    _, model = best
    step = {"a": 50.0, "b": 0.08, "k": 0.004}
    for _ in range(60):
        improved = False
        for name in ("a", "b", "k"):
            for sign in (1, -1):
                candidate = Gompertz(
                    max(500.0, model.a + sign * step[name]) if name == "a" else model.a,
                    max(0.2, model.b + sign * step[name]) if name == "b" else model.b,
                    max(0.005, model.k + sign * step[name]) if name == "k" else model.k,
                )
                sse = sum((candidate.predict(d) - w) ** 2 for d, w in points)
                current = sum((model.predict(d) - w) ** 2 for d, w in points)
                if sse < current - 0.5:
                    model = candidate
                    improved = True
        if not improved:
            step = {key: value / 2 for key, value in step.items()}
            if step["k"] < 0.0005:
                break
    return model


def confidence_for(points: list[tuple[int, float]], days_span: int) -> float:
    """اعتماد: تعداد نمونه، پراکندگی سن نمونه‌ها و طول دوره پوشش‌داده‌شده"""
    n = len(points)
    if n == 0:
        return 0.25
    base = min(0.55, 0.18 * n)
    span_bonus = min(0.3, days_span / 40 * 0.3)
    spread = 0.05 * len({d for d, _ in points})
    return round(min(0.95, max(0.2, base + span_bonus + spread)), 2)


def forecast_weight(
    points: list[tuple[int, float]],
    target_age: int,
    target_weight: float,
    breed_name: str | None = None,
) -> tuple[str, float, float, list[dict], list[str], str]:
    """پیش‌بینی وزن پایان دوره.

    خروجی: (روش، وزن پایان دوره، رشد روزانه، منحنی، یادداشت‌ها، نام نژاد)
    """
    breed, _matched, breed_note = resolve_breed(breed_name)
    notes: list[str] = [breed_note]
    points = sorted(points)

    if len(points) >= 2:
        model = fit_gompertz(points, target_weight)
        if model is not None:
            projected = model.predict(target_age)
            # اگر گومپرتز عدد غیرواقعی داد، به منحنی استاندارد برگرد
            if 0.5 * target_weight <= projected <= 1.8 * target_weight:
                last_day, last_weight = points[-1]
                daily = (projected - last_weight) / max(1, target_age - last_day)
                curve = []
                for day in range(1, target_age + 1):
                    measured = next((w for d, w in points if d == day), None)
                    if measured is not None:
                        curve.append({"age_days": day, "weight_gr": int(round(measured)), "source": "measured"})
                    else:
                        curve.append({"age_days": day, "weight_gr": int(round(model.predict(day))), "source": "fitted"})
                notes.append("برازش منحنی گومپرتز روی وزن‌گیری‌های ثبت‌شده انجام شد.")
                return "gompertz-fit", round(projected), round(daily, 1), curve, notes, breed.name_fa
            notes.append("برازش گومپرتز خارج از بازه معقول بود؛ منحنی استاندارد نژاد استفاده شد.")

    if len(points) == 1:
        day, weight = points[0]
        gain = max(10.0, (standard_weight(day + 7, breed) - standard_weight(day, breed)) / 7)
        projected = weight + gain * max(0, target_age - day)
        curve = [
            {"age_days": d, "weight_gr": int(round(weight + gain * (d - day))), "source": "measured" if d == day else "standard"}
            for d in range(1, target_age + 1)
        ]
        notes.append("تنها یک وزن‌گیری ثبت شده؛ پیش‌بینی با شیب استاندارد همان سن انجام شد.")
        return "standard-curve", round(projected), round(gain, 1), curve, notes, breed.name_fa

    # بدون هیچ وزن‌گیری: منحنی همان نژاد
    curve = [
        {"age_days": d, "weight_gr": int(round(standard_weight(d, breed))), "source": "standard"}
        for d in range(1, target_age + 1)
    ]
    notes.append(f"هیچ وزن‌گیری ثبت نشده؛ منحنی استاندارد {breed.name_fa} مبنا قرار گرفت.")
    return "standard-curve", round(standard_weight(target_age, breed)), 0.0, curve, notes, breed.name_fa


def predict_loading_date(
    current_age: int,
    current_weight: float | None,
    daily_gain: float | None,
    target_weight: float,
    points: list[tuple[int, float]],
    market_price_per_kg: float | None = None,
    feed_price: float | None = None,
    breed_name: str | None = None,
    live_birds: int | None = None,
    daily_mortality_pct: float = 0.0,
    horizon_days: int = 28,
) -> dict:
    """تاریخ بهینه بارگیری — با جدول تصمیم روزانه.

    منطق: برای هر روز آینده، «درآمد رشد آن روز» را با «هزینه دان آن روز» و
    «هزینه تلفات احتمالی» مقایسه می‌کنیم. تا وقتی سود حاشیه‌ای مثبت است
    نگه‌داشتن گله به‌صرفه است؛ اولین روزی که منفی شد، نقطه بارگیری است.

    چرا جدول؟ چون «بارگیری در روز ۳۹» بدون توضیح قابل اعتماد نیست. خروجی
    `breakdown` نشان می‌دهد هر روز چه درآمد و چه هزینه‌ای داشت.
    """
    breed, _matched, breed_note = resolve_breed(breed_name)
    points = sorted(points)

    if current_weight is None:
        current_weight = points[-1][1] if points else standard_weight(current_age, breed)
    if daily_gain is None:
        if len(points) >= 2:
            (d0, w0), (d1, w1) = points[-2], points[-1]
            daily_gain = max(5.0, (w1 - w0) / max(1, d1 - d0))
        else:
            daily_gain = max(10.0, (standard_weight(current_age, breed) - standard_weight(max(1, current_age - 7), breed)) / 7)

    model = fit_gompertz(points, target_weight) if len(points) >= 2 else None

    def weight_at(age: int) -> float:
        if model is not None:
            projected = model.predict(age)
            if 0.5 * target_weight <= projected <= 1.8 * target_weight:
                return projected
        return max(50.0, current_weight + daily_gain * (age - current_age))

    # جدول روزانه: از امروز تا افق تصمیم
    rows: list[dict] = []
    cumulative = 0.0
    prev_weight = current_weight
    for offset in range(0, horizon_days + 1):
        age = current_age + offset
        weight = weight_at(age) if offset > 0 else current_weight
        gain = weight - prev_weight
        feed_gr = marginal_feed_gr(age, breed)
        row = {
            "age_days": age,
            "days_from_now": offset,
            "weight_gr": int(round(weight)),
            "daily_gain_gr": int(round(gain)),
            "marginal_fcr": round(marginal_fcr(age, breed), 2),
            "feed_kg": round(feed_gr / 1000, 3),
        }
        if market_price_per_kg and feed_price:
            # همه اعداد یا «کل گله» هستند یا «هر پرنده»؛ قاطی‌کردنشان باعث
            # می‌شود هزینه تلفات صدها برابر درآمد رشد دیده شود.
            birds = live_birds if live_birds else 1
            revenue = (gain / 1000) * market_price_per_kg * birds
            feed_cost = (feed_gr / 1000) * feed_price * birds
            # هزینه فرصت تلفات: پرنده‌ای که امروز می‌میرد، ارزش وزنش را از دست می‌دهد
            mortality_cost = 0.0
            if daily_mortality_pct:
                mortality_cost = birds * (daily_mortality_pct / 100) * (weight / 1000) * market_price_per_kg
            net = revenue - feed_cost - mortality_cost
            cumulative += net
            row.update(
                {
                    "revenue_rial": round(revenue),
                    "feed_cost_rial": round(feed_cost),
                    "mortality_cost_rial": round(mortality_cost),
                    "net_rial": round(net),
                    "cumulative_rial": round(cumulative),
                }
            )
            row["profitable"] = net > 0
        prev_weight = weight
        rows.append(row)

    if market_price_per_kg and feed_price:
        stop_index = None
        for row in rows[1:]:
            if not row.get("profitable", True):
                stop_index = row["days_from_now"]
                break
        cap_by_weight = next((r["days_from_now"] for r in rows if r["weight_gr"] >= target_weight * 1.15), horizon_days)
        days = min(stop_index if stop_index is not None else cap_by_weight, cap_by_weight)
        if stop_index is not None and stop_index == 1 and current_weight >= target_weight * 0.8:
            reason = (
                "رشد روزانه دیگر هزینه دان و ریسک تلفات را پوشش نمی‌دهد؛ "
                "همین امروز بارگیری به‌صرفه‌تر است."
            )
        elif stop_index is not None:
            reason = fa_digits(
                f"تا روز {current_age + days} ارزش رشد روزانه از هزینه دان بیشتر است؛ "
                f"از فردای آن روز هزینه دان (با ضریب تبدیل حاشیه‌ای "
                f"{marginal_fcr(current_age + days + 1, breed):.2f}) از ارزش رشد پیشی می‌گیرد."
            )
        else:
            reason = fa_digits(
                f"در افق {horizon_days} روزه هنوز رشد سودآور است؛ "
                f"سقف منطقی وزن (۱٫۱۵ برابر وزن هدف) مبنای توقف قرار گرفت."
            )
    else:
        remaining = max(0.0, target_weight - current_weight)
        days = min(horizon_days, max(0, math.ceil(remaining / max(1.0, daily_gain))))
        reason = fa_digits(f"تا رسیدن به وزن هدف {int(target_weight)} گرم (قیمت بازار یا دان ثبت نشده).")

    optimal_row = next((r for r in rows if r["days_from_now"] == days), rows[-1])
    confidence = 0.85 if len(points) >= 3 else 0.6 if points else 0.45
    if market_price_per_kg and feed_price:
        confidence = min(0.95, confidence + 0.05)

    return {
        "optimal_age_days": current_age + days,
        "days_from_now": days,
        "expected_weight_gr": optimal_row["weight_gr"],
        "reason": f"{reason} ({breed_note})",
        "confidence": round(confidence, 2),
        "breed": breed.name_fa,
        "economics": {
            key: optimal_row.get(key)
            for key in ("daily_gain_gr", "marginal_fcr", "feed_cost_rial", "revenue_rial", "mortality_cost_rial", "net_rial")
        },
        "breakdown": rows,
    }


def _trend(values: list[float]) -> dict:
    """شیب روند (واحد در روز) و درصد تغییر کل بازه"""
    clean = [v for v in values if v is not None]
    if len(clean) < 2:
        return {"slope_per_day": 0.0, "change_pct": 0.0, "direction": "flat", "samples": len(clean)}
    n = len(clean)
    xs = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(clean) / n
    denom = sum((x - mean_x) ** 2 for x in xs) or 1.0
    slope = sum((xs[i] - mean_x) * (clean[i] - mean_y) for i in range(n)) / denom
    change = ((clean[-1] - clean[0]) / clean[0] * 100) if clean[0] else 0.0
    direction = "up" if change > 3 else "down" if change < -3 else "flat"
    return {"slope_per_day": round(slope, 2), "change_pct": round(change, 1), "direction": direction, "samples": n}


def detect_disease_risk(
    age_days: int,
    initial_count: int,
    daily: list[dict],
    expected_mortality_pct: float | None = None,
    breed_name: str | None = None,
    water_drop_alert_pct: float = 10.0,
    daily_mortality_alert_pct: float = 0.5,
) -> dict:
    """هشدار زودهنگام بیماری بر پایه روند آب، دان و تلفات.

    خروجی: امتیاز ۰..۱، عوامل مؤثر با شدت، روند هر سیگنال، و توصیه.

    چرا روند و نه فقط آستانه؟ بیماری معمولاً با «افت مصرف آب» شروع می‌شود،
    یکی دو روز بعد «افت دان» و بعد «تلفات». اگر فقط تلفات را بسنجیم، هشدار
    زمانی می‌رسد که گله درگیر شده است. پس روند هر سه سیگنال جدا گزارش
    می‌شود و هم‌زمانی آن‌ها امتیاز را تقویت می‌کند.
    """
    factors: list[dict] = []
    empty_trends = {
        "water": _trend([]),
        "feed": _trend([]),
        "mortality": _trend([]),
    }
    if not daily:
        return {
            "risk_score": 0.0,
            "factors": factors,
            "trends": empty_trends,
            "recommendation": "داده کافی برای تحلیل وجود ندارد.",
            "breed": resolve_breed(breed_name)[0].name_fa,
        }

    breed, _matched, _note = resolve_breed(breed_name)
    rows = sorted(daily, key=lambda r: r["age_days"])
    total_deaths = sum(r.get("mortality", 0) for r in rows)
    total_removed = sum(r.get("mortality", 0) + r.get("cull", 0) for r in rows)
    cum_pct = (total_deaths / initial_count) * 100 if initial_count else 0
    std = expected_mortality_pct if expected_mortality_pct is not None else standard_mortality(age_days)
    live = max(1, initial_count - total_removed)

    # ۱) تلفات تجمعی (بدون حذف) بالاتر از استاندارد نژاد/سن
    if cum_pct > std + 0.5:
        score = min(1.0, (cum_pct - std) / max(1.0, std))
        factors.append(
            {
                "key": "mortality-cumulative",
                "title": "تلفات تجمعی بالاتر از استاندارد",
                "severity": "critical" if score > 0.6 else "warning",
                "detail": f"تلفات تجمعی {cum_pct:.2f}٪ در برابر استاندارد {std:.2f}٪ برای سن {age_days} روز.",
                "score": round(score, 2),
            }
        )

    # ۲) جهش تلفات: سه روز اخیر در برابر هفت روز پیش از آن
    recent3 = rows[-3:]
    baseline = rows[-10:-3] or rows[:-3]
    recent_avg = sum(r.get("mortality", 0) for r in recent3) / len(recent3)
    base_avg = (sum(r.get("mortality", 0) for r in baseline) / len(baseline)) if baseline else 0.0
    if base_avg > 0 and recent_avg > base_avg * 1.8 + 2:
        score = min(1.0, (recent_avg / base_avg) / 4)
        factors.append(
            {
                "key": "mortality-spike",
                "title": "جهش تلفات در سه روز اخیر",
                "severity": "critical" if recent_avg > base_avg * 2.5 else "warning",
                "detail": f"میانگین تلفات سه روز اخیر {recent_avg:.1f} قطعه در برابر {base_avg:.1f} قطعه پیش‌تر.",
                "score": round(score, 2),
            }
        )

    # ۳) نرخ تلفات روزانه (قاعده ۵ سامانه) نسبت به پرندگان زنده همان روز
    last = rows[-1]
    last_mortality = last.get("mortality", 0)
    daily_pct = (last_mortality / max(1, live + last_mortality + last.get("cull", 0))) * 100
    if daily_pct > daily_mortality_alert_pct:
        ratio = daily_pct / max(0.01, daily_mortality_alert_pct)
        factors.append(
            {
                "key": "mortality-daily",
                "title": "نرخ تلفات امروز از آستانه گذشت",
                "severity": "critical" if ratio > 2 else "warning",
                "detail": f"تلفات آخرین روز {last_mortality} قطعه از حدود {live + last_mortality} پرنده زنده ({daily_pct:.2f}٪)؛ آستانه {daily_mortality_alert_pct:.2f}٪.",
                "score": round(min(1.0, 0.4 + (daily_pct - daily_mortality_alert_pct) / max(0.1, daily_mortality_alert_pct)), 2),
            }
        )

    # ۴) افت مصرف آب نسبت به میانگین سه روز قبل (قاعده ۴ سامانه)
    water_rows = [r for r in rows[-4:] if r.get("water_liter")]
    water_drop_pct = 0.0
    if len(water_rows) >= 2:
        baseline_water = sum(r["water_liter"] for r in water_rows[:-1]) / len(water_rows[:-1])
        last_water = water_rows[-1]["water_liter"]
        water_drop_pct = ((last_water - baseline_water) / baseline_water * 100) if baseline_water else 0.0
        if water_drop_pct <= -water_drop_alert_pct:
            severity = "critical" if water_drop_pct <= -water_drop_alert_pct * 2 else "warning"
            factors.append(
                {
                    "key": "water-drop",
                    "title": "افت مصرف آب",
                    "severity": severity,
                    "detail": f"مصرف آب آخرین روز {last_water:.0f} لیتر در برابر میانگین سه روز قبل {baseline_water:.0f} لیتر ({water_drop_pct:.1f}٪).",
                    "score": round(min(1.0, abs(water_drop_pct) / (water_drop_alert_pct * 3)), 2),
                }
            )

    # ۵) نسبت آب به دان: در سلامت حدود ۱٫۸ تا ۲٫۲ لیتر بر کیلوگرم
    ratios = [
        r["water_liter"] / r["feed_kg"]
        for r in rows[-5:]
        if r.get("feed_kg", 0) > 0 and r.get("water_liter", 0) > 0
    ]
    if ratios:
        avg_ratio = sum(ratios) / len(ratios)
        if avg_ratio > 2.4:
            score = min(1.0, (avg_ratio - 2.4) / 1.2)
            factors.append(
                {
                    "key": "water-feed-ratio",
                    "title": "نسبت آب به دان بالاست",
                    "severity": "warning",
                    "detail": f"میانگین {avg_ratio:.2f} لیتر بر کیلوگرم؛ نشانه احتمالی اسهال، تب یا گرمای سالن.",
                    "score": round(max(0.2, score), 2),
                }
            )

    # ۶) افت ناگهانی مصرف دان
    if len(rows) >= 4:
        last_feed = rows[-1].get("feed_kg", 0)
        prev_avg = sum(r.get("feed_kg", 0) for r in rows[-4:-1]) / 3
        if prev_avg > 0 and last_feed < prev_avg * 0.9:
            drop = (prev_avg - last_feed) / prev_avg
            factors.append(
                {
                    "key": "feed-drop",
                    "title": "افت مصرف دان",
                    "severity": "warning" if drop < 0.2 else "critical",
                    "detail": f"مصرف آخرین روز {drop * 100:.0f}٪ کمتر از میانگین سه روز قبل است.",
                    "score": round(min(1.0, drop * 2), 2),
                }
            )

    # ۷) دمای سالن دور از محدوده رفاه
    temps = [r.get("avg_temp") for r in rows[-5:] if r.get("avg_temp") is not None]
    if temps:
        avg_temp = sum(temps) / len(temps)
        ideal = 33.0 - min(10.0, age_days * 0.36)  # شیب کاهش دمای مطلوب با سن
        deviation = abs(avg_temp - ideal)
        if deviation > 3:
            factors.append(
                {
                    "key": "temperature",
                    "title": "دمای سالن خارج از محدوده مطلوب",
                    "severity": "warning",
                    "detail": f"میانگین {avg_temp:.1f}°C در برابر مطلوب حدود {ideal:.1f}°C برای این سن.",
                    "score": round(min(1.0, deviation / 10), 2),
                }
            )

    trends = {
        "water": _trend([r.get("water_liter", 0) for r in rows[-7:]]),
        "feed": _trend([r.get("feed_kg", 0) for r in rows[-7:]]),
        "mortality": _trend([r.get("mortality", 0) for r in rows[-7:]]),
    }

    # ۸) الگوی کلاسیک شروع بیماری: آب↓ و دان↓ هم‌زمان (حتی پیش از جهش تلفات)
    water_down = trends["water"]["direction"] == "down"
    feed_down = trends["feed"]["direction"] == "down"
    mortality_up = trends["mortality"]["direction"] == "up"
    if water_down and feed_down:
        factors.append(
            {
                "key": "multi-signal",
                "title": "افت هم‌زمان آب و دان" + (" با افزایش تلفات" if mortality_up else ""),
                "severity": "critical" if mortality_up else "warning",
                "detail": (
                    f"مصرف آب {trends['water']['change_pct']:.1f}٪ و مصرف دان {trends['feed']['change_pct']:.1f}٪ "
                    f"در هفت روز اخیر تغییر کرده‌اند؛ این الگو معمولاً پیش از بروز علائم بالینی دیده می‌شود."
                ),
                "score": 0.8 if mortality_up else 0.55,
            }
        )

    # عددهای داخل توضیح‌ها برای کاربر فارسی‌زبان با ارقام فارسی نوشته می‌شوند
    for factor in factors:
        factor["detail"] = fa_digits(factor["detail"])

    if not factors:
        return {
            "risk_score": 0.05,
            "factors": factors,
            "trends": trends,
            "recommendation": "نشانه‌ای از ریسک دیده نشد؛ روند تلفات، مصرف آب و دان و دما در محدوده طبیعی است.",
            "breed": breed.name_fa,
        }

    weights = {"critical": 1.0, "warning": 0.6, "info": 0.3}
    raw = sum(f["score"] * weights[f["severity"]] for f in factors) / sum(weights[f["severity"]] for f in factors)
    # چند عامل هم‌زمان بدتر از جمع ساده‌شان است
    risk = min(1.0, raw * (1 + 0.12 * (len(factors) - 1)))

    if risk >= 0.65:
        recommendation = (
            "ریسک بالا: امروز با دامپزشک تماس بگیرید، نمونه برای کالبدشکافی و آزمایش بفرستید، "
            "و آب و دان را از نظر آلودگی بررسی کنید."
        )
    elif risk >= 0.35:
        recommendation = "ریسک متوسط: روند تلفات و مصرف آب/دان را روزانه پایش کنید و دمای سالن را بازبینی کنید."
    else:
        recommendation = "ریسک پایین: پایش معمول کافی است."

    return {
        "risk_score": round(risk, 2),
        "factors": factors,
        "trends": trends,
        "recommendation": recommendation,
        "breed": breed.name_fa,
        "water_drop_pct": round(water_drop_pct, 1),
        "daily_mortality_pct": round(daily_pct, 2),
    }


def forecast_feed(recent_daily_feed: list[float], live_birds: int, stock_kg: float, days_ahead: int = 7) -> dict:
    """پیش‌بینی مصرف دان و روزهای باقی‌مانده انبار"""
    if not recent_daily_feed:
        return {"next_7_days_kg": 0.0, "remaining_to_target_kg": 0.0, "days_of_stock": None, "runs_out": False}

    # میانگین وزنی: روزهای اخیر وزن بیشتری دارند (روند رشد)
    weights = [i + 1 for i in range(len(recent_daily_feed))]
    weighted = sum(f * w for f, w in zip(recent_daily_feed, weights)) / sum(weights)
    growth = 1.035  # رشد تقریبی مصرف روزانه در هفته پایانی

    total = sum(weighted * (growth ** i) for i in range(days_ahead))
    daily_now = weighted
    days_of_stock = stock_kg / daily_now if daily_now > 0 else None
    return {
        "next_7_days_kg": round(total, 1),
        "remaining_to_target_kg": round(total, 1),
        "days_of_stock": round(days_of_stock, 1) if days_of_stock is not None else None,
        "runs_out": days_of_stock is not None and days_of_stock < days_ahead,
    }
