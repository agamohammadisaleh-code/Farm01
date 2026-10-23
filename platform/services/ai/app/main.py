"""سرویس هوش مصنوعی مرغ‌یار — FastAPI.

این سرویس مستقل از API اصلی اجرا می‌شود و فقط محاسبات تحلیلی انجام می‌دهد:
پیش‌بینی وزن، تاریخ بارگیری، ریسک بیماری و پیش‌بینی مصرف دان.

اصل طراحی: API اصلی هرگز به این سرویس وابسته نیست. اگر سرویس خواب باشد یا
دیر پاسخ دهد، NestJS همان محاسبات را با بسته دامنه انجام می‌دهد و پاسخ
`fallback: true` برمی‌گرداند. قطعی سرویس AI نباید ثبت داده را متوقف کند.

اجرا:
    uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import os

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    DiseaseAlertRequest,
    DiseaseAlertResponse,
    FeedForecastRequest,
    FeedForecastResponse,
    HealthResponse,
    LoadingDateRequest,
    LoadingDateResponse,
    WeightForecastRequest,
    WeightForecastResponse,
)
from .services import (
    confidence_for,
    detect_disease_risk,
    forecast_feed,
    forecast_weight,
    predict_loading_date,
    standard_weight,
)

VERSION = "0.1.0"
API_KEY = os.getenv("AI_API_KEY", "")


def require_key(x_ai_key: str | None = Header(default=None)) -> None:
    """اگر کلید تنظیم شده باشد، درخواست باید آن را در هدر داشته باشد."""
    if API_KEY and x_ai_key != API_KEY:
        raise HTTPException(status_code=401, detail="کلید سرویس نامعتبر است.")


app = FastAPI(
    title="مرغ‌یار — سرویس تحلیل",
    version=VERSION,
    description="پیش‌بینی وزن، تاریخ بارگیری، ریسک بیماری و مصرف دان",
)

origins = [o.strip() for o in os.getenv("AI_CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-AI-Key"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="farm-ai",
        version=VERSION,
        models=["gompertz-growth", "disease-rules", "loading-optimizer", "feed-forecast"],
    )


@app.get("/standards/weight")
def standards(day: int = 42) -> dict:
    """وزن استاندارد نژاد در روز مشخص — برای هم‌ترازی با کلاینت"""
    if not 1 <= day <= 70:
        raise HTTPException(status_code=400, detail="روز باید بین ۱ و ۷۰ باشد.")
    return {"day": day, "standard_weight_gr": round(standard_weight(day), 1)}


@app.post("/predict/weight", response_model=WeightForecastResponse, dependencies=[Depends(require_key)])
def predict_weight(req: WeightForecastRequest) -> WeightForecastResponse:
    points = [(p.age_days, p.weight_gr) for p in req.weights]
    method, projected, daily, curve, notes = forecast_weight(points, req.target_age_days, req.target_weight_gr)
    span = (max(d for d, _ in points) - min(d for d, _ in points)) if len(points) >= 2 else 0
    return WeightForecastResponse(
        target_age_days=req.target_age_days,
        projected_weight_gr=int(projected),
        projected_daily_gain_gr=float(daily),
        confidence=confidence_for(points, span),
        method=method,  # type: ignore[arg-type]
        curve=curve,  # type: ignore[arg-type]
        notes=notes,
    )


@app.post("/predict/loading-date", response_model=LoadingDateResponse, dependencies=[Depends(require_key)])
def predict_loading(req: LoadingDateRequest) -> LoadingDateResponse:
    points = [(p.age_days, p.weight_gr) for p in req.weights]
    age, days, weight, reason, confidence = predict_loading_date(
        current_age=req.current_age_days,
        current_weight=req.current_weight_gr,
        daily_gain=req.daily_gain_gr,
        target_weight=req.target_weight_gr,
        points=points,
        market_price_per_kg=req.market_price_per_kg,
        feed_price=req.projected_feed_price,
    )
    live_birds = None
    if req.mortality_pct is not None:
        live_birds = None  # شمارش زنده از API اصلی می‌آید، اینجا تکرار نمی‌شود
    biomass = None
    revenue = None
    if req.projected_feed_price is not None and req.market_price_per_kg is not None:
        # برآورد درآمد بر پایه وزن و قیمت بازار (بدون تعداد، فقط وزن هر قطعه)
        revenue = round((weight / 1000) * req.market_price_per_kg, 0)
    return LoadingDateResponse(
        optimal_age_days=age,
        days_from_now=days,
        expected_weight_gr=weight,
        expected_live_biomass_kg=biomass,
        expected_revenue=revenue,
        reason=reason,
        confidence=confidence,
    )


@app.post("/alerts/disease", response_model=DiseaseAlertResponse, dependencies=[Depends(require_key)])
def disease_alerts(req: DiseaseAlertRequest) -> DiseaseAlertResponse:
    risk, factors, recommendation = detect_disease_risk(
        age_days=req.age_days,
        initial_count=req.initial_count,
        daily=[d.model_dump() for d in req.daily],
        expected_mortality_pct=req.expected_mortality_pct,
    )
    level = "high" if risk >= 0.65 else "medium" if risk >= 0.35 else "low"
    return DiseaseAlertResponse(
        risk_score=risk,
        level=level,  # type: ignore[arg-type]
        factors=factors,  # type: ignore[arg-type]
        recommendation=recommendation,
    )


@app.post("/forecast/feed", response_model=FeedForecastResponse, dependencies=[Depends(require_key)])
def feed_forecast(req: FeedForecastRequest) -> FeedForecastResponse:
    result = forecast_feed(req.recent_daily_feed_kg, req.live_birds, req.stock_kg)
    return FeedForecastResponse(**result)
