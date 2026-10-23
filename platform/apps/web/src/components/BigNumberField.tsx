import { fa, toNumber } from "../lib/format";

/**
 * ورودی عدد بزرگ و ساده برای کارگر سالن.
 *
 * چرا این‌طور ساخته شده:
 * - دکمه‌های ± با گام مشخص: نیازی به تایپ نیست، خطای انگشت کم می‌شود.
 * - ورودی، ارقام فارسی و لاتین را هر دو می‌پذیرد (کاربر هرچه دید تایپ می‌کند).
 * - برچسب واحد همیشه کنار عدد است؛ «۱۸۰» بدون «لیتر» گمراه‌کننده است.
 */
export function BigNumberField({
  id,
  label,
  icon,
  unit,
  value,
  onChange,
  step,
  decimals = false,
  hint,
}: {
  id: string;
  label: string;
  icon: string;
  unit: string;
  value: string;
  onChange: (next: string) => void;
  step: number;
  decimals?: boolean;
  hint?: string;
}) {
  const numeric = toNumber(value) ?? 0;

  const bump = (direction: 1 | -1) => {
    const next = Math.max(0, numeric + direction * step);
    onChange(decimals ? String(Number(next.toFixed(1))) : String(Math.round(next)));
  };

  const handleInput = (raw: string) => {
    // فقط ارقام و جداکننده اعشار؛ هر چیز دیگر نادیده گرفته می‌شود
    const cleaned = raw.replace(/[^\d۰-۹٠-٩٫.,]/g, "");
    onChange(cleaned);
  };

  return (
    <div className="rounded-xl2 border border-line bg-white p-3">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-bold text-muted">
        <span aria-hidden className="text-lg">
          {icon}
        </span>
        {label}
      </label>

      <div className="mt-2 flex items-stretch gap-2">
        <button
          type="button"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-paper text-2xl font-black text-ink hover:bg-brand-50"
          onClick={() => bump(-1)}
          aria-label={`کم کردن ${label}`}
        >
          −
        </button>

        <div className="relative flex-1">
          <input
            id={id}
            className="field h-14 !py-0 text-center !text-2xl font-extrabold"
            inputMode={decimals ? "decimal" : "numeric"}
            value={value}
            onChange={(event) => handleInput(event.target.value)}
            placeholder="۰"
            aria-label={label}
            aria-describedby={hint ? `${id}-hint` : undefined}
          />
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted">
            {unit}
          </span>
        </div>

        <button
          type="button"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-brand-50 text-2xl font-black text-brand-700 hover:bg-brand-100"
          onClick={() => bump(1)}
          aria-label={`زیاد کردن ${label}`}
        >
          +
        </button>
      </div>

      {hint ? (
        <p id={`${id}-hint`} className="mt-2 text-xs text-muted">
          {hint} — مقدار فعلی: {fa(numeric, decimals ? 1 : 0)} {unit}
        </p>
      ) : null}
    </div>
  );
}
