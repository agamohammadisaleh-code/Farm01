"""مدل‌های داده سرویس هوش مصنوعی.

همه ورودی‌ها از API اصلی می‌آیند و هیچ شناسه کاربری در این سرویس ذخیره
نمی‌شود؛ سرویس کاملاً بی‌حالت (stateless) است.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class WeightPoint(BaseModel):
    """یک وزن‌گیری نمونه‌ای"""

    age_days: int = Field(ge=1, le=120, description="سن گله در روز")
    weight_gr: float = Field(gt=0, le=7000, description="میانگین وزن نمونه (گرم)")


class DailyPoint(BaseModel):
    """یک روز از ثبت روزانه"""

    age_days: int = Field(ge=1, le=120)
    mortality: int = Field(default=0, ge=0)
    cull: int = Field(default=0, ge=0)
    feed_kg: float = Field(default=0, ge=0)
    water_liter: float = Field(default=0, ge=0)
    avg_temp: float | None = None
    live_birds: int | None = Field(default=None, ge=0)


class WeightForecastRequest(BaseModel):
    flock_id: str | None = None
    initial_count: int = Field(gt=0, le=1_000_000)
    weights: list[WeightPoint] = Field(default_factory=list)
    target_weight_gr: int = Field(default=2500, ge=1000, le=5000)
    target_age_days: int = Field(default=42, ge=21, le=70)
    breed: str = "راس ۳۰۸"


class ForecastPoint(BaseModel):
    age_days: int
    weight_gr: int
    source: Literal["measured", "fitted", "standard"]


class WeightForecastResponse(BaseModel):
    target_age_days: int
    breed: str = Field(default="راس ۳۰۸", description="نژادی که منحنی‌اش به کار رفت")
    projected_weight_gr: int
    projected_daily_gain_gr: float
    confidence: float = Field(ge=0, le=1, description="۰ تا ۱ بر پایه تعداد و کیفیت نمونه‌ها")
    method: Literal["gompertz-fit", "standard-curve", "linear-fit"]
    curve: list[ForecastPoint]
    notes: list[str]


class LoadingDateRequest(BaseModel):
    flock_id: str | None = None
    breed: str | None = None
    live_birds: int | None = Field(default=None, ge=0)
    daily_mortality_pct: float = Field(default=0, ge=0, le=100)
    current_age_days: int = Field(ge=1, le=120)
    current_weight_gr: float | None = Field(default=None, gt=0, le=7000)
    daily_gain_gr: float | None = Field(default=None, gt=0, le=200)
    target_weight_gr: int = Field(default=2500, ge=1000, le=5000)
    weights: list[WeightPoint] = Field(default_factory=list)
    mortality_pct: float = Field(default=0, ge=0, le=100)
    projected_feed_price: float | None = None
    market_price_per_kg: float | None = Field(default=None, gt=0)


class LoadingDay(BaseModel):
    """یک روز از جدول تصمیم بارگیری"""

    age_days: int
    days_from_now: int
    weight_gr: int
    daily_gain_gr: int
    marginal_fcr: float
    feed_kg: float
    revenue_rial: float | None = None
    feed_cost_rial: float | None = None
    mortality_cost_rial: float | None = None
    net_rial: float | None = None
    cumulative_rial: float | None = None
    profitable: bool | None = None


class LoadingDateResponse(BaseModel):
    optimal_age_days: int
    days_from_now: int
    expected_weight_gr: int
    expected_live_biomass_kg: float | None = None
    expected_revenue: float | None = None
    reason: str
    confidence: float = Field(ge=0, le=1)
    breed: str = Field(default="راس ۳۰۸")
    economics: dict = Field(default_factory=dict)
    breakdown: list[LoadingDay] = Field(default_factory=list)


class DiseaseAlertRequest(BaseModel):
    flock_id: str | None = None
    breed: str | None = None
    age_days: int = Field(ge=1, le=120)
    initial_count: int = Field(gt=0)
    daily: list[DailyPoint] = Field(default_factory=list)
    expected_mortality_pct: float | None = Field(default=None, ge=0, le=30)
    # آستانه‌های قواعد کسب‌وکار؛ از تنظیمات مزرعه می‌آیند
    water_drop_alert_pct: float = Field(default=10.0, ge=1, le=90)
    daily_mortality_alert_pct: float = Field(default=0.5, ge=0.05, le=20)


class RiskFactor(BaseModel):
    key: str
    title: str
    severity: Literal["info", "warning", "critical"]
    detail: str
    score: float = Field(ge=0, le=1)


class SignalTrend(BaseModel):
    slope_per_day: float
    change_pct: float
    direction: Literal["up", "down", "flat"]
    samples: int


class DiseaseAlertResponse(BaseModel):
    risk_score: float = Field(ge=0, le=1)
    level: Literal["low", "medium", "high"]
    factors: list[RiskFactor]
    recommendation: str
    breed: str = "راس ۳۰۸"
    trends: dict[str, SignalTrend] = Field(default_factory=dict)
    water_drop_pct: float = 0.0
    daily_mortality_pct: float = 0.0


class FeedForecastRequest(BaseModel):
    current_age_days: int = Field(ge=1, le=120)
    target_age_days: int = Field(default=42, ge=21, le=70)
    recent_daily_feed_kg: list[float] = Field(default_factory=list)
    live_birds: int = Field(gt=0)
    stock_kg: float = Field(default=0)


class FeedForecastResponse(BaseModel):
    next_7_days_kg: float
    remaining_to_target_kg: float
    days_of_stock: float | None
    runs_out: bool


class TranscribeRequest(BaseModel):
    """صدای ضبط‌شده برای تبدیل به متن (base64)"""

    audio_base64: str = Field(min_length=32, description="صدای خام بدون پیشوند data:")
    mime_type: str = Field(default="audio/wav", max_length=60)
    language: str = Field(default="fa", max_length=10)


class TranscribeResponse(BaseModel):
    text: str
    engine: str
    language: str
    duration_s: float | None = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    models: list[str]
