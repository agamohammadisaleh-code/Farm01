"""تبدیل گفتار به متن (اختیاری).

اصل طراحی: **تبدیل صدا به متن، قابلیت حاشیه‌ای است، نه پایه.** ثبت داده با
صدا نباید به نصب یک مدل سنگین یا به اینترنت وابسته باشد. سه مسیر پشتیبانی
می‌شود و هر سه اختیاری‌اند:

۱. `AI_STT_URL` — یک سرویس HTTP خارجی که همان قرارداد را دارد (ساده‌ترین راه
   برای مزرعه‌ای که سرور قوی دارد).
۲. `faster-whisper` اگر نصب باشد (`pip install faster-whisper`).
۳. `vosk` اگر نصب باشد و `AI_VOSK_MODEL` به پوشه مدل اشاره کند.

اگر هیچ‌کدام نبود، `SttUnavailable` پرتاب می‌شود و API هم ۵۰۳ با پیام روشن
برمی‌گرداند؛ کلاینت در این حالت از موتور گفتار خود دستگاه (Web Speech API در
وب، Expo Speech در موبایل) استفاده می‌کند و همان متن را به `/assistant/message`
می‌فرستد. یعنی **هیچ کاربری به‌خاطر نبود مدل، از ثبت با صدا محروم نمی‌شود.**
"""

from __future__ import annotations

import base64
import io
import os
import tempfile
from functools import lru_cache


class SttUnavailable(RuntimeError):
    """هیچ موتور تبدیل گفتاری نصب/تنظیم نشده است."""


def _engine() -> str:
    """کدام موتور در دسترس است: http | faster-whisper | vosk | none"""
    if os.getenv("AI_STT_URL"):
        return "http"
    try:  # pragma: no cover - به محیط نصب وابسته است
        import faster_whisper  # noqa: F401

        return "faster-whisper"
    except Exception:
        pass
    try:  # pragma: no cover
        import vosk  # noqa: F401

        if os.getenv("AI_VOSK_MODEL"):
            return "vosk"
    except Exception:
        pass
    return "none"


def engine_status() -> dict:
    name = _engine()
    return {
        "available": name != "none",
        "engine": name,
        "hint": None
        if name != "none"
        else "برای تبدیل گفتار روی سرور، AI_STT_URL را تنظیم کنید یا faster-whisper را نصب کنید. "
        "در غیر این صورت متنِ موتور گفتار دستگاه را به /assistant/message بفرستید.",
    }


@lru_cache(maxsize=1)
def _whisper_model():
    """بارگذاری تنبل مدل — تا وقتی درخواستی نیاید، حافظه مصرف نمی‌شود."""
    from faster_whisper import WhisperModel  # type: ignore

    size = os.getenv("AI_WHISPER_MODEL", "small")
    device = os.getenv("AI_WHISPER_DEVICE", "cpu")
    return WhisperModel(size, device=device, compute_type="int8")


def transcribe(audio: bytes, language: str = "fa") -> tuple[str, str, float | None]:
    """صدا → (متن، نام موتور، مدت صدا)"""
    engine = _engine()

    if engine == "http":
        import json
        import urllib.request

        url = os.environ["AI_STT_URL"]
        payload = json.dumps(
            {"audio_base64": base64.b64encode(audio).decode(), "language": language}
        ).encode()
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as res:  # noqa: S310 - آدرس از تنظیمات سرور است
            body = json.loads(res.read().decode())
        return str(body.get("text", "")).strip(), "http", body.get("duration_s")

    if engine == "faster-whisper":  # pragma: no cover
        model = _whisper_model()
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
            tmp.write(audio)
            tmp.flush()
            segments, info = model.transcribe(tmp.name, language="fa", vad_filter=True)
            text = " ".join(seg.text.strip() for seg in segments).strip()
            return text, f"faster-whisper/{os.getenv('AI_WHISPER_MODEL', 'small')}", float(getattr(info, "duration", 0)) or None

    if engine == "vosk":  # pragma: no cover
        import json

        import vosk  # type: ignore

        model = vosk.Model(os.environ["AI_VOSK_MODEL"])
        rec = vosk.KaldiRecognizer(model, 16000)
        rec.AcceptWaveform(audio)
        return json.loads(rec.FinalResult()).get("text", "").strip(), "vosk", None

    raise SttUnavailable("هیچ موتور تبدیل گفتاری روی سرور تنظیم نشده است.")


def wav_duration_s(audio: bytes) -> float | None:
    """مدت فایل WAV بدون کتابخانه بیرونی (برای گزارش‌های ساده)"""
    try:
        if audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
            return None
        channels = int.from_bytes(audio[22:24], "little") or 1
        rate = int.from_bytes(audio[24:28], "little") or 1
        bits = int.from_bytes(audio[34:36], "little") or 16
        data_size = len(audio) - 44
        return round(data_size / (rate * channels * (bits // 8)), 2)
    except Exception:
        return None


def decode_base64(value: str) -> bytes:
    """پذیرش base64 با یا بدون پیشوند data URL"""
    if "," in value[:100] and value.strip().startswith("data:"):
        value = value.split(",", 1)[1]
    try:
        return base64.b64decode(value, validate=False)
    except Exception as exc:  # pragma: no cover
        raise ValueError("صدای ارسال‌شده base64 معتبر نیست.") from exc


def _unused(_: io.BufferedIOBase) -> None:  # pragma: no cover - نگه‌داشتن import برای خوانایی
    return None
