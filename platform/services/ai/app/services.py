"""مدل‌های تحلیلی سرویس هوش مصنوعی.

طراحی عمدی: هیچ مدل یادگیری عمیقی اینجا نیست. با حجم داده یک مزرعه (چند
گله، چند ده وزن‌گیری) مدل پارامتری رشد (گومپرتز) و قواعد آماری تلفات،
دقیق‌تر و قابل‌توضیح‌تر از شبکه عصبی است — و مالک می‌تواند بفهمد چرا سیستم
چنین عددی داده است. هر خروجی همراه `reason`/`notes` برمی‌گردد.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# منحنی مرجع راس ۳۰۸ (همان نقاط مرجعی که بسته دامنه TypeScript استفاده می‌کند)
STANDARD_ANCHORS: list[tuple[int, float]] = [
    (1, 45.0),
    (7, 185.0),
    (14, 470.0),
    (21, 940.0),
    (28, 1530.0),
    (35, 2210.0),
    (42, 2880.0),
    (49, 3450.0),
]

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


def standard_weight(day: int) -> float:
    """وزن استاندارد (گرم) در روز مشخص با درون‌یابی خطی"""
    day = max(1, min(49, int(day)))
    for i in range(len(STANDARD_ANCHORS) - 1):
        d0, w0 = STANDARD_ANCHORS[i]
        d1, w1 = STANDARD_ANCHORS[i + 1]
        if d0 <= day <= d1:
            t = (day - d0) / (d1 - d0)
            return w0 + t * (w1 - w0)
    return STANDARD_ANCHORS[-1][1]


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

    # dامنه‌ها: A وزن نهایی (گرم)، b شکل، k سرعت بلوغ
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
    points: list[tuple[int, float]], target_age: int, target_weight: float
) -> tuple[str, float, float, list[dict], list[str]]:
    """پیش‌بینی وزن پایان دوره.

    خروجی: (روش، وزن پایان دوره، رشد روزانه، منحنی، یادداشت‌ها)
    """
    notes: list[str] = []
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
                return "gompertz-fit", round(projected), round(daily, 1), curve, notes
            notes.append("برازش گومپرتز خارج از بازه معقول بود؛ منحنی استاندارد استفاده شد.")

    if len(points) == 1:
        day, weight = points[0]
        gain = max(10.0, (standard_weight(day + 7) - standard_weight(day)) / 7)
        projected = weight + gain * max(0, target_age - day)
        curve = [
            {"age_days": d, "weight_gr": int(round(weight + gain * (d - day))), "source": "measured" if d == day else "standard"}
            for d in range(1, target_age + 1)
        ]
        notes.append("تنها یک وزن‌گیری ثبت شده؛ پیش‌بینی با شیب استاندارد همان سن انجام شد.")
        return "standard-curve", round(projected), round(gain, 1), curve, notes

    # بدون هیچ وزن‌گیری: منحنی استاندارد
    curve = [{"age_days": d, "weight_gr": int(round(standard_weight(d))), "source": "standard"} for d in range(1, target_age + 1)]
    notes.append("هیچ وزن‌گیری ثبت نشده؛ منحنی استاندارد نژاد مبنا قرار گرفت.")
    return "standard-curve", round(standard_weight(target_age)), 0.0, curve, notes


def predict_loading_date(
    current_age: int,
    current_weight: float | None,
    daily_gain: float | None,
    target_weight: float,
    points: list[tuple[int, float]],
    market_price_per_kg: float | None = None,
    feed_price: float | None = None,
) -> tuple[int, int, int, str, float]:
    """تاریخ بهینه بارگیری.

    مبنای اول: رسیدن به وزن هدف.
    مبنای دوم (اگر قیمت‌ها داده شود): روزی که حاشیه سود روزانه به صفر می‌رسد؛
    بعد از آن، هر روز نگه‌داشتن گله پول می‌خورد (هزینه دان > رشد وزنی).
    """
    if current_weight is None and points:
        current_weight = points[-1][1]
    if current_weight is None:
        current_weight = standard_weight(current_age)

    if daily_gain is None:
        if len(points) >= 2:
            (d0, w0), (d1, w1) = points[-2], points[-1]
            daily_gain = max(5.0, (w1 - w0) / max(1, d1 - d0))
        else:
            daily_gain = max(10.0, (standard_weight(current_age) - standard_weight(max(1, current_age - 7))) / 7)

    reason = "تا رسیدن به وزن هدف"
    remaining = target_weight - current_weight

    if market_price_per_kg and feed_price:
        # ارزش رشد روزانه در برابر هزینه دان روزانه
        gain_kg = daily_gain / 1000
        marginal_revenue = gain_kg * market_price_per_kg
        marginal_feed = (daily_gain * 1.7 / 1000) * feed_price  # FCR حاشیه‌ای ≈ ۱٫۷
        net = marginal_revenue - marginal_feed
        if net <= 0:
            reason = "رشد روزانه دیگر هزینه دان را پوشش نمی‌دهد؛ بارگیری فوری توصیه می‌شود."
            return current_age, 0, round(current_weight), reason, 0.7
        # روزی که افت راندمان رشد آن را بی‌سود می‌کند (تقریب: شیب ۲٪ افت روزانه)
        days_affordable = 1
        while days_affordable < 30:
            decay = 0.98 ** days_affordable
            if (gain_kg * decay * market_price_per_kg) - marginal_feed <= 0:
                break
            days_affordable += 1
        days_to_target = max(0, math.ceil(remaining / daily_gain))
        days = min(days_to_target, days_affordable)
        reason = "کمینه بین رسیدن به وزن هدف و پایان صرفه اقتصادی رشد"
    else:
        days = max(0, math.ceil(remaining / daily_gain))

    optimal_age = current_age + days
    confidence = 0.85 if len(points) >= 3 else 0.6 if points else 0.4
    return optimal_age, days, round(current_weight + daily_gain * days), reason, confidence


def detect_disease_risk(
    age_days: int,
    initial_count: int,
    daily: list[dict],
    expected_mortality_pct: float | None = None,
) -> tuple[float, list[dict], str]:
    """امتیاز ریسک بیماری با قواعد قابل‌توضیح.

    ورودی: سری روزانه (سن، تلفات، دان، آب، دما).
    خروجی: امتیاز ۰..۱، عوامل مؤثر، توصیه.
    """
    factors: list[dict] = []
    if not daily:
        return 0.0, factors, "داده کافی برای تحلیل وجود ندارد."

    daily = sorted(daily, key=lambda r: r["age_days"])
    total_deaths = sum(r.get("mortality", 0) + r.get("cull", 0) for r in daily)
    cum_pct = (total_deaths / initial_count) * 100 if initial_count else 0
    std = expected_mortality_pct if expected_mortality_pct is not None else standard_mortality(age_days)

    # ۱) تلفات تجمعی بالاتر از استاندارد
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

    # ۲) جهش تلفات در سه روز اخیر
    recent = daily[-3:]
    baseline_rows = daily[:-3] or daily
    recent_avg = sum(r.get("mortality", 0) for r in recent) / len(recent)
    baseline_avg = sum(r.get("mortality", 0) for r in baseline_rows) / len(baseline_rows)
    if baseline_avg > 0 and recent_avg > baseline_avg * 1.8 + 2:
        score = min(1.0, (recent_avg / baseline_avg) / 4)
        factors.append(
            {
                "key": "mortality-spike",
                "title": "جهش تلفات در سه روز اخیر",
                "severity": "critical" if recent_avg > baseline_avg * 2.5 else "warning",
                "detail": f"میانگین تلفات سه روز اخیر {recent_avg:.1f} قطعه در برابر {baseline_avg:.1f} قطعه پیش‌تر.",
                "score": round(score, 2),
            }
        )

    # ۳) نسبت آب به دان: در سلامت حدود ۱٫۸ تا ۲٫۲ لیتر بر کیلوگرم است
    ratios = [
        r["water_liter"] / r["feed_kg"]
        for r in daily[-5:]
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

    # ۴) افت ناگهانی مصرف دان
    if len(daily) >= 4:
        last = daily[-1].get("feed_kg", 0)
        prev_avg = sum(r.get("feed_kg", 0) for r in daily[-4:-1]) / 3
        if prev_avg > 0 and last < prev_avg * 0.9:
            drop = (prev_avg - last) / prev_avg
            factors.append(
                {
                    "key": "feed-drop",
                    "title": "افت مصرف دان",
                    "severity": "warning" if drop < 0.2 else "critical",
                    "detail": f"مصرف آخرین روز {drop * 100:.0f}٪ کمتر از میانگین سه روز قبل است.",
                    "score": round(min(1.0, drop * 2), 2),
                }
            )

    # ۵) دمای سالن دور از محدوده رفاه
    temps = [r.get("avg_temp") for r in daily[-5:] if r.get("avg_temp") is not None]
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

    if not factors:
        return 0.05, factors, "نشانه‌ای از ریسک دیده نشد؛ روند تلفات، مصرف و دما در محدوده طبیعی است."

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

    return round(risk, 2), factors, recommendation


def forecast_feed(recent_daily_feed: list[float], live_birds: int, stock_kg: float, days_ahead: int = 7) -> dict:
    """پیش‌بینی مصرف دان و روزهای باقی‌مانده انبار"""
    if not recent_daily_feed:
        return {"next_7_days_kg": 0.0, "remaining_to_target_kg": 0.0, "days_of_stock": None, "runs_out": False}

    # میانگین وزنی: روزهای اخیر وزن بیشتری دارند (روند رشد)
    weights = [i + 1 for i in range(len(recent_daily_feed))]
    weighted = sum(f * w for f, w in zip(recent_daily_feed, weights)) / sum(weights)
    growth = 1.035  # رشد تقریبی مصرف روزانه در هفته پایانی

    next_7 = sum(weighted * (growth ** i) for i in range(days_ahead))
    daily_now = weighted
    days_of_stock = stock_kg / daily_now if daily_now > 0 else None
    return {
        "next_7_days_kg": round(next_7, 1),
        "remaining_to_target_kg": round(next_7, 1),
        "days_of_stock": round(days_of_stock, 1) if days_of_stock is not None else None,
        "runs_out": days_of_stock is not None and days_of_stock < days_ahead,
    }
