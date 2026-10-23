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

from .breeds import BREEDS, resolve_breed, standard_weight
from .models import (
    DiseaseAlertRequest,
    DiseaseAlertResponse,
    FeedForecastRequest,
    FeedForecastResponse,
    HealthResponse,
    LoadingDateRequest,
    LoadingDateResponse,
    TranscribeRequest,
    TranscribeResponse,
    WeightForecastRequest,
    WeightForecastResponse,
)
from .services import (
    confidence_for,
    detect_disease_risk,
    forecast_feed,
    forecast_weight,
    predict_loading_date,
)
from .speech import SttUnavailable, decode_base64, engine_status, transcribe, wav_duration_s

VERSION = "0.2.0"
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
        models=[
            "gompertz-growth",
            "breed-curves",
            "disease-rules",
            "early-warning-trends",
            "loading-optimizer",
            "feed-forecast",
            "speech-to-text" if engine_status()["available"] else "speech-to-text(off)",
        ],
    )


@app.get("/standards/weight")
def standards(day: int = 42, breed: str | None = None) -> dict:
    """وزن استاندارد نژاد در روز مشخص — برای هم‌ترازی با کلاینت"""
    if not 1 <= day <= 70:
        raise HTTPException(status_code=400, detail="روز باید بین ۱ و ۷۰ باشد.")
    curve, matched, note = resolve_breed(breed)
    return {
        "day": day,
        "breed": curve.name_fa,
        "matched": matched,
        "standard_weight_gr": round(standard_weight(day, curve), 1),
        "note": note,
    }


@app.get("/standards/breeds")
def breeds() -> dict:
    """فهرست منحنی‌های نژاد موجود — برای پر کردن فرم‌های کلاینت"""
    return {
        "breeds": [
            {
                "key": b.key,
                "name_fa": b.name_fa,
                "name_en": b.name_en,
                "target_age_days": b.target_age_days,
                "day42_weight_gr": round(standard_weight(42, b)),
                "note": b.note,
            }
            for b in BREEDS.values()
        ],
        "default": resolve_breed(None)[0].key,
    }


@app.post("/predict/weight", response_model=WeightForecastResponse, dependencies=[Depends(require_key)])
def predict_weight(req: WeightForecastRequest) -> WeightForecastResponse:
    points = [(p.age_days, p.weight_gr) for p in req.weights]
    method, projected, daily, curve, notes, breed_name = forecast_weight(
        points, req.target_age_days, req.target_weight_gr, req.breed
    )
    span = (max(d for d, _ in points) - min(d for d, _ in points)) if len(points) >= 2 else 0
    return WeightForecastResponse(
        target_age_days=req.target_age_days,
        breed=breed_name,
        projected_weight_gr=int(projected),
        projected_daily_gain_gr=float(daily),
        confidence=confidence_for(points, span),
        method=method,  # type: ignore[arg-type]
        curve=curve,  # type: ignore[arg-type]
        notes=notes,
    )


@app.post("/predict/loading-date", response_model=LoadingDateResponse, dependencies=[Depends(require_key)])
def predict_loading(req: LoadingDateRequest) -> LoadingDateResponse:
    """تاریخ بهینه بارگیری با جدول تصمیم روزانه (درآمد رشد در برابر هزینه دان و تلفات)"""
    points = [(p.age_days, p.weight_gr) for p in req.weights]
    plan = predict_loading_date(
        current_age=req.current_age_days,
        current_weight=req.current_weight_gr,
        daily_gain=req.daily_gain_gr,
        target_weight=req.target_weight_gr,
        points=points,
        market_price_per_kg=req.market_price_per_kg,
        feed_price=req.projected_feed_price,
        breed_name=req.breed,
        live_birds=req.live_birds,
        daily_mortality_pct=req.daily_mortality_pct,
    )

    biomass = None
    revenue = None
    if req.live_birds and req.market_price_per_kg:
        biomass = round(req.live_birds * plan["expected_weight_gr"] / 1000, 1)
        revenue = round(biomass * req.market_price_per_kg)
    elif req.market_price_per_kg:
        revenue = round((plan["expected_weight_gr"] / 1000) * req.market_price_per_kg)

    return LoadingDateResponse(
        optimal_age_days=plan["optimal_age_days"],
        days_from_now=plan["days_from_now"],
        expected_weight_gr=plan["expected_weight_gr"],
        expected_live_biomass_kg=biomass,
        expected_revenue=revenue,
        reason=plan["reason"],
        confidence=plan["confidence"],
        breed=plan["breed"],
        economics=plan["economics"],
        breakdown=plan["breakdown"],
    )


@app.post("/alerts/disease", response_model=DiseaseAlertResponse, dependencies=[Depends(require_key)])
def disease_alerts(req: DiseaseAlertRequest) -> DiseaseAlertResponse:
    """هشدار زودهنگام بیماری: روند آب، دان، تلفات و دما با آستانه‌های مزرعه"""
    result = detect_disease_risk(
        age_days=req.age_days,
        initial_count=req.initial_count,
        daily=[d.model_dump() for d in req.daily],
        expected_mortality_pct=req.expected_mortality_pct,
        breed_name=req.breed,
        water_drop_alert_pct=req.water_drop_alert_pct,
        daily_mortality_alert_pct=req.daily_mortality_alert_pct,
    )
    risk = result["risk_score"]
    level = "high" if risk >= 0.65 else "medium" if risk >= 0.35 else "low"
    return DiseaseAlertResponse(
        risk_score=risk,
        level=level,  # type: ignore[arg-type]
        factors=result["factors"],  # type: ignore[arg-type]
        recommendation=result["recommendation"],
        breed=result["breed"],
        trends=result["trends"],  # type: ignore[arg-type]
        water_drop_pct=result.get("water_drop_pct", 0.0),
        daily_mortality_pct=result.get("daily_mortality_pct", 0.0),
    )


@app.post("/forecast/feed", response_model=FeedForecastResponse, dependencies=[Depends(require_key)])
def feed_forecast(req: FeedForecastRequest) -> FeedForecastResponse:
    result = forecast_feed(req.recent_daily_feed_kg, req.live_birds, req.stock_kg)
    return FeedForecastResponse(**result)


@app.get("/assistant/stt/status")
def stt_status() -> dict:
    """وضعیت موتور تبدیل گفتار — کلاینت از این‌جا می‌فهمد میکروفن را روشن کند یا نه"""
    return engine_status()


@app.post("/assistant/transcribe", response_model=TranscribeResponse, dependencies=[Depends(require_key)])
def assistant_transcribe(req: TranscribeRequest) -> TranscribeResponse:
    """صدا → متن. اگر موتوری نصب نباشد ۵۰۳ برمی‌گردد تا کلاینت به موتور دستگاه برگردد."""
    try:
        audio = decode_base64(req.audio_base64)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if len(audio) < 100:
        raise HTTPException(status_code=400, detail="فایل صوتی خیلی کوتاه است.")

    try:
        text, engine, duration = transcribe(audio, req.language)
    except SttUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - وابسته به نصب موتور
        raise HTTPException(status_code=502, detail=f"تبدیل گفتار ناموفق بود: {exc}") from exc

    if not text.strip():
        raise HTTPException(status_code=422, detail="در صدا جمله‌ای شنیده نشد؛ دوباره بگویید.")

    return TranscribeResponse(
        text=text.strip(),
        engine=engine,
        language=req.language,
        duration_s=duration if duration is not None else wav_duration_s(audio),
    )
