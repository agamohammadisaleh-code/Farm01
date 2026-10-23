"""منحنی‌های مرجع نژادهای گوشتی.

همان نقاط مرجعی که `packages/domain/src/breeds.ts` دارد؛ دو نسخه بودن عمدی
است: سرویس پایتون بدون Node اجرا می‌شود و باید مستقل کار کند، و آزمون
`test_breeds_parity` در هر دو طرف تضمین می‌کند اعداد از هم جدا نیفتند.

اگر یک نژاد در فهرست نباشد، منحنی پیش‌فرض (راس ۳۰۸) استفاده می‌شود و این
موضوع در یادداشت پاسخ گفته می‌شود — نه اینکه بی‌صدا نژاد دیگری فرض شود.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

Point = tuple[int, float]


@dataclass(frozen=True)
class Breed:
    key: str
    name_fa: str
    name_en: str
    target_age_days: int
    weights: list[Point] = field(default_factory=list)
    feed: list[Point] = field(default_factory=list)
    aliases: tuple[str, ...] = ()
    note: str = ""


BREEDS: dict[str, Breed] = {
    "ross308": Breed(
        key="ross308",
        name_fa="راس ۳۰۸",
        name_en="Ross 308",
        target_age_days=42,
        weights=[(1, 45), (7, 185), (14, 470), (21, 940), (28, 1530), (35, 2210), (42, 2880), (49, 3450)],
        feed=[(1, 13), (7, 155), (14, 580), (21, 1340), (28, 2320), (35, 3500), (42, 4900), (49, 6400)],
        aliases=("راس", "ross", "ross 308"),
        note="منحنی رسمی راس ۳۰۸؛ پیش‌فرض سیستم.",
    ),
    "cobb500": Breed(
        key="cobb500",
        name_fa="کاب ۵۰۰",
        name_en="Cobb 500",
        target_age_days=42,
        weights=[(1, 42), (7, 180), (14, 465), (21, 930), (28, 1520), (35, 2160), (42, 2820), (49, 3400)],
        feed=[(1, 13), (7, 150), (14, 570), (21, 1330), (28, 2290), (35, 3410), (42, 4800), (49, 6250)],
        aliases=("کاب", "cobb", "cobb 500"),
        note="کاب ۵۰۰ کمی دیرتر به وزن هدف می‌رسد.",
    ),
    "hubbard": Breed(
        key="hubbard",
        name_fa="هابارد",
        name_en="Hubbard",
        target_age_days=42,
        weights=[(1, 44), (7, 178), (14, 458), (21, 918), (28, 1500), (35, 2140), (42, 2800), (49, 3370)],
        feed=[(1, 13), (7, 152), (14, 565), (21, 1320), (28, 2280), (35, 3390), (42, 4760), (49, 6200)],
        aliases=("هابارد", "hubbard", "hubbard flex"),
        note="هابارد رشد آغازین کندتر و رشد پایانی پایدارتر دارد.",
    ),
    "arboracres": Breed(
        key="arboracres",
        name_fa="آربور ایکرز",
        name_en="Arbor Acres",
        target_age_days=42,
        weights=[(1, 43), (7, 184), (14, 474), (21, 948), (28, 1545), (35, 2195), (42, 2855), (49, 3430)],
        feed=[(1, 13), (7, 154), (14, 578), (21, 1338), (28, 2315), (35, 3480), (42, 4870), (49, 6370)],
        aliases=("آربور", "arbor", "arbor acres"),
        note="آربور ایکرز تقریباً هم‌تراز راس است.",
    ),
}

DEFAULT_BREED = "ross308"
MAX_DAY = 49


FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"


def fa_digits(text: str) -> str:
    """ارقام لاتین → فارسی برای متن‌هایی که کاربر می‌خواند"""
    return "".join(FA_DIGITS[ord(ch) - 48] if "0" <= ch <= "9" else ch for ch in str(text))


def _norm(value: str) -> str:
    """ارقام فارسی/عربی → لاتین، حروف عربی → فارسی، بدون نیم‌فاصله"""
    out = []
    for ch in value or "":
        if "۰" <= ch <= "۹":
            out.append(str(ord(ch) - ord("۰")))
        elif "٠" <= ch <= "٩":
            out.append(str(ord(ch) - ord("٠")))
        else:
            out.append(ch)
    text = "".join(out).replace("ي", "ی").replace("ى", "ی").replace("ك", "ک")
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[_.\-]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip().lower()


def resolve_breed(name: str | None) -> tuple[Breed, bool, str]:
    """نام آزاد نژاد → (نژاد، آیا شناخته شد، یادداشت)"""
    raw = (name or "").strip()
    if not raw:
        breed = BREEDS[DEFAULT_BREED]
        return breed, True, f"نژادی ثبت نشده؛ منحنی پیش‌فرض {breed.name_fa} استفاده شد."

    n = _norm(raw)
    for breed in BREEDS.values():
        if n in {_norm(breed.key), _norm(breed.name_fa), _norm(breed.name_en)}:
            return breed, True, f"منحنی {breed.name_fa} به کار رفت."
    for breed in BREEDS.values():
        if any(n == _norm(a) for a in breed.aliases):
            return breed, True, f"منحنی {breed.name_fa} به کار رفت."
    # نگاشت آزاد: «کاب» داخل «گله کاب ۵۰۰» هم پیدا شود
    for breed in BREEDS.values():
        if _norm(breed.name_en) in n or any(t in n for t in _norm(breed.name_fa).split() if len(t) > 2):
            return breed, True, f"نزدیک‌ترین منحنی شناخته‌شده: {breed.name_fa}."

    breed = BREEDS[DEFAULT_BREED]
    return breed, False, f"نژاد «{raw}» شناخته نشد؛ منحنی {breed.name_fa} به‌عنوان پیش‌فرض به کار رفت."


def _interp(points: list[Point], day: float) -> float:
    """درون‌یابی خطی مونوتون روی نقاط مرجع"""
    d = max(points[0][0], min(points[-1][0], float(day)))
    for i in range(len(points) - 1):
        d0, v0 = points[i]
        d1, v1 = points[i + 1]
        if d0 <= d <= d1:
            t = (d - d0) / (d1 - d0) if d1 > d0 else 0.0
            return v0 + t * (v1 - v0)
    return points[-1][1]


def standard_weight(day: int | float, breed: Breed | str | None = None) -> float:
    """وزن استاندارد نژاد (گرم) در سن مشخص"""
    b = breed if isinstance(breed, Breed) else resolve_breed(breed if isinstance(breed, str) else None)[0]
    return _interp(b.weights, max(1, min(MAX_DAY, float(day))))


def standard_cum_feed(day: int | float, breed: Breed | str | None = None) -> float:
    """دان مصرفی تجمعی استاندارد نژاد (گرم) در سن مشخص"""
    b = breed if isinstance(breed, Breed) else resolve_breed(breed if isinstance(breed, str) else None)[0]
    return _interp(b.feed, max(1, min(MAX_DAY, float(day))))


def marginal_feed_gr(day: int | float, breed: Breed | str | None = None) -> float:
    """دان اضافه‌شده در همان روز (گرم) — مبنای هزینه حاشیه‌ای رشد"""
    return max(0.0, standard_cum_feed(day, breed) - standard_cum_feed(float(day) - 1, breed))


def marginal_fcr(day: int | float, breed: Breed | str | None = None) -> float:
    """ضریب تبدیل حاشیه‌ای در همان روز = دان روز ÷ رشد همان روز"""
    gain = standard_weight(float(day), breed) - standard_weight(float(day) - 1, breed)
    if gain <= 0:
        return 9.9
    return marginal_feed_gr(day, breed) / gain


def age_for_weight(target_weight_gr: float, breed: Breed | str | None = None) -> tuple[int, float, bool]:
    """سن رسیدن به وزن هدف روی منحنی نژاد → (روز، وزن همان روز، رسید؟)"""
    b = breed if isinstance(breed, Breed) else resolve_breed(breed if isinstance(breed, str) else None)[0]
    for day in range(1, MAX_DAY + 1):
        w = standard_weight(day, b)
        if w >= target_weight_gr:
            return day, w, True
    return MAX_DAY, standard_weight(MAX_DAY, b), False
