import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  assistantExamples,
  faDigits,
  formatJalali,
  parseAssistantText,
  type AssistantParseResult,
  type AssistantIntent,
  type Flock,
} from "@farm/domain";
import { todayIso } from "../common/ids";
import { AnalyticsService } from "../analytics/analytics.service";
import { AiService } from "../ai/ai.service";
import { ExpensesService } from "../expenses/expenses.service";
import { FlocksService } from "../flocks/flocks.service";
import { LogsService } from "../logs/logs.service";
import { SalesService } from "../sales/sales.service";
import { WeightSamplesService } from "../weight-samples/weight-samples.service";
import type { AssistantConfirmDto, AssistantMessageDto } from "./assistant.dto";

export type AssistantReplyKind = "draft" | "answer" | "clarify" | "unknown" | "help" | "done";

export interface AssistantFlockRef {
  id: string;
  name: string;
  ageDays: number;
}

export interface AssistantReply {
  kind: AssistantReplyKind;
  intent: AssistantIntent;
  confidence: number;
  /** جمله‌ای که دستیار می‌گوید/می‌نویسد */
  reply: string;
  flock: AssistantFlockRef | null;
  entities: Record<string, unknown>;
  missing: string[];
  requiresConfirm: boolean;
  /** برای kind=answer: داده ساختاریافته‌ای که پاسخ از آن ساخته شد */
  data?: Record<string, unknown>;
  /** برای kind=done: رکوردی که ساخته/به‌روز شد */
  created?: Record<string, unknown>;
  normalized?: string;
}

/**
 * دستیار فارسی (متن و صدا).
 *
 * تقسیم کار عمدی است:
 * - **فهم جمله** در بسته دامنه (`parseAssistantText`) و بدون شبکه انجام می‌شود؛
 *   پس موبایل هم آفلاین می‌تواند جمله را بفهمد و فقط نتیجه را همگام کند.
 * - **تبدیل صدا به متن** در سرویس پایتون است (اختیاری)؛ اگر نبود، کلاینت
 *   می‌تواند متنِ موتور گفتاری دستگاه را بفرستد و همه‌چیز باز کار می‌کند.
 * - **ثبت داده** فقط از مسیر سرویس‌های موجود انجام می‌شود تا همه قواعد
 *   اعتبارسنجی، انبار دان و RBAC دقیقاً همان‌طور اجرا شوند که در فرم دستی.
 *
 * هیچ‌چیز بی‌تأیید ثبت نمی‌شود: `message` فقط پیشنهاد می‌سازد و `confirm`
 * با `confirm: true` آن را اجرا می‌کند.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly aiUrl: string;
  private readonly aiKey: string;

  constructor(
    @Inject(FlocksService) private readonly flocks: FlocksService,
    @Inject(LogsService) private readonly logs: LogsService,
    @Inject(ExpensesService) private readonly expenses: ExpensesService,
    @Inject(SalesService) private readonly sales: SalesService,
    @Inject(WeightSamplesService) private readonly weights: WeightSamplesService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
    @Inject(AiService) private readonly ai: AiService,
    config: ConfigService,
  ) {
    this.aiUrl = (config.get<string>("AI_URL") ?? "http://127.0.0.1:8000").replace(/\/$/, "");
    this.aiKey = config.get<string>("AI_API_KEY") ?? "";
  }

  /* ------------------------------- زمینه گله ------------------------------- */

  private async resolveFlock(farmId: string, flockId?: string): Promise<{ flock: Flock; ageDays: number } | null> {
    if (flockId) {
      const flock = await this.flocks.get(farmId, flockId);
      return { flock, ageDays: this.ageOf(flock.start_date) };
    }
    const all = await this.flocks.list(farmId);
    const active = all.filter((f) => f.status === "active");
    const chosen = active[0] ?? all[0];
    return chosen ? { flock: chosen, ageDays: this.ageOf(chosen.start_date) } : null;
  }

  private ageOf(startDate: string): number {
    return Math.max(1, Math.round((Date.parse(todayIso()) - Date.parse(startDate)) / 86400_000) + 1);
  }

  private ref(flock: Flock | null, ageDays = 0): AssistantFlockRef | null {
    return flock ? { id: flock.id, name: flock.name, ageDays } : null;
  }

  /* -------------------------------- پیام -------------------------------- */

  async message(farmId: string, dto: AssistantMessageDto): Promise<AssistantReply> {
    const today = todayIso();
    const all = await this.flocks.list(farmId);
    const parsed = parseAssistantText(dto.text, {
      today,
      flocks: all.map((f) => ({ id: f.id, name: f.name })),
    });

    const target = await this.resolveFlock(farmId, dto.flockId ?? parsed.entities.flockHint);
    const flockRef = target ? this.ref(target.flock, target.ageDays) : null;

    if (parsed.intent === "unknown" || parsed.intent === "help") {
      return {
        kind: parsed.intent === "help" ? "help" : "unknown",
        intent: parsed.intent,
        confidence: parsed.confidence,
        reply: parsed.reply,
        flock: flockRef,
        entities: parsed.entities as Record<string, unknown>,
        missing: parsed.missing,
        requiresConfirm: false,
        normalized: parsed.normalized,
      };
    }

    if (this.isQuery(parsed.intent)) {
      const answer = await this.answerQuery(farmId, parsed.intent, target);
      return {
        kind: "answer",
        intent: parsed.intent,
        confidence: parsed.confidence,
        reply: answer.reply,
        flock: flockRef,
        entities: parsed.entities as Record<string, unknown>,
        missing: [],
        requiresConfirm: false,
        data: answer.data,
        normalized: parsed.normalized,
      };
    }

    /* نیّت ثبت داده: پیشنهاد بساز، اجرا نکن */
    if (!target) {
      return {
        kind: "clarify",
        intent: parsed.intent,
        confidence: parsed.confidence,
        reply: "اول یک گله بسازید؛ بعد می‌توانم ثبت‌ها را برای همان گله انجام دهم.",
        flock: null,
        entities: parsed.entities as Record<string, unknown>,
        missing: parsed.missing,
        requiresConfirm: false,
      };
    }

    const missing = [...parsed.missing];
    const reply = missing.length
      ? parsed.reply
      : `${parsed.reply} (گله: ${target.flock.name})`;

    return {
      kind: missing.length ? "clarify" : "draft",
      intent: parsed.intent,
      confidence: parsed.confidence,
      reply,
      flock: flockRef,
      entities: parsed.entities as Record<string, unknown>,
      missing,
      requiresConfirm: !missing.length,
      normalized: parsed.normalized,
    };
  }

  private isQuery(intent: AssistantIntent): boolean {
    return intent.startsWith("query_");
  }

  /* ----------------------------- پاسخ پرسش‌ها ----------------------------- */

  private async answerQuery(farmId: string, intent: AssistantIntent, target: { flock: Flock; ageDays: number } | null) {
    if (!target) {
      return { reply: "گله‌ای برای پاسخ به این سؤال ثبت نشده است.", data: {} };
    }
    const metrics = await this.analytics.flockMetrics(farmId, target.flock.id);
    const fa = (v: number, digits = 1) => faDigits(v.toFixed(digits));

    if (intent === "query_water") {
      const change = metrics.waterChangePct;
      const dir = change === null || change === undefined ? "نامشخص" : change < 0 ? `${fa(Math.abs(change))}٪ کاهش` : `${fa(change)}٪ افزایش`;
      return {
        reply:
          `${target.flock.name}: مصرف آب آخرین ثبت ${fa(metrics.lastWaterL, 0)} لیتر، میانگین سه روز قبل ${fa(metrics.waterBaselineL, 0)} لیتر — ${dir}.` +
          (change !== null && change <= -10 ? " این افت بیشتر از آستانه هشدار است؛ آبخوری و دمای سالن را بررسی کنید." : ""),
        data: { lastWaterL: metrics.lastWaterL, baselineL: metrics.waterBaselineL, changePct: change },
      };
    }

    if (intent === "query_feed") {
      const forecast = await this.ai.feedForecast(farmId);
      const daily = metrics.totalFeedKg;
      return {
        reply:
          `${target.flock.name}: تا امروز ${fa(daily, 0)} کیلوگرم دان مصرف شده و ضریب تبدیل ${metrics.fcr ? fa(metrics.fcr, 2) : "محاسبه‌نشده"} است. ` +
          (forecast.daysOfStock !== null
            ? `موجودی انبار برای حدود ${fa(forecast.daysOfStock)} روز کافی است${forecast.runsOut ? " — سفارش دان لازم است." : "."}`
            : "موجودی انبار ثبت نشده است."),
        data: { totalFeedKg: daily, fcr: metrics.fcr, stockKg: forecast.stockKg, daysOfStock: forecast.daysOfStock },
      };
    }

    if (intent === "query_loading") {
      const loading = await this.ai.loadingDate(farmId, target.flock.id);
      return {
        reply:
          `بهترین زمان بارگیری ${target.flock.name}: ${faDigits(loading.optimalAgeDays)} روزگی ` +
          `(حدود ${faDigits(loading.daysFromNow)} روز دیگر، ${formatJalali(loading.expectedDate)})، ` +
          `با وزن تقریبی ${faDigits(Math.round(loading.expectedWeightGr / 10) / 100)} کیلوگرم. ${loading.reason}`,
        data: loading as unknown as Record<string, unknown>,
      };
    }

    return {
      reply:
        `${target.flock.name} در روز ${faDigits(target.ageDays)}: ` +
        `${faDigits(metrics.liveBirds)} قطعه زنده، تلفات ${fa(metrics.mortalityPct, 2)}٪، ` +
        `FCR ${metrics.fcr ? fa(metrics.fcr, 2) : "محاسبه‌نشده"}، ` +
        `قیمت تمام‌شده هر کیلو ${metrics.costPerKgLive ? `${faDigits(Math.round(metrics.costPerKgLive / 1000))} هزار ریال` : "محاسبه‌نشده"}.`,
      data: {
        liveBirds: metrics.liveBirds,
        mortalityPct: metrics.mortalityPct,
        fcr: metrics.fcr,
        costPerKgLive: metrics.costPerKgLive,
        feedKg: metrics.totalFeedKg,
      },
    };
  }

  /* -------------------------------- اجرا -------------------------------- */

  async confirm(farmId: string, userId: string, dto: AssistantConfirmDto): Promise<AssistantReply> {
    if (!dto.confirm) {
      throw new BadRequestException("بدون تأیید صریح کاربر، هیچ داده‌ای ثبت نمی‌شود.");
    }
    const preview = await this.message(farmId, dto);
    if (preview.kind === "answer" || preview.kind === "unknown" || preview.kind === "help") {
      return preview;
    }
    if (preview.kind === "clarify" || !preview.flock) {
      throw new BadRequestException(preview.reply);
    }

    const parsed = parseAssistantText(dto.text, { today: todayIso() });
    const flockId = dto.flockId ?? preview.flock.id;
    const e = parsed.entities;

    try {
      switch (parsed.intent) {
        case "log_daily": {
          const saved = await this.logs.save(farmId, userId, flockId, {
            date: e.date!,
            mortality: e.mortality ?? 0,
            cull: e.cull ?? 0,
            feedKg: e.feedKg ?? 0,
            waterLiter: e.waterLiter ?? 0,
            avgTemp: e.avgTemp,
            feedType: e.feedType,
          });
          return {
            ...preview,
            kind: "done",
            requiresConfirm: false,
            created: { type: "dailyLog", ...saved },
            reply: `ثبت شد: ${formatJalali(e.date!)} — تلفات ${faDigits(e.mortality ?? 0)}، دان ${faDigits(e.feedKg ?? 0)} کیلوگرم، آب ${faDigits(e.waterLiter ?? 0)} لیتر.`,
          };
        }
        case "add_weight": {
          const saved = await this.weights.create(farmId, userId, flockId, {
            date: e.date!,
            sampleCount: e.sampleCount ?? 30,
            avgWeightGr: Math.round(e.weightGr!),
          });
          return {
            ...preview,
            kind: "done",
            requiresConfirm: false,
            created: { type: "weightSample", ...saved },
            reply: `وزن‌گیری ثبت شد: میانگین ${faDigits(Math.round(e.weightGr!))} گرم${e.sampleCount ? ` از ${faDigits(e.sampleCount)} نمونه` : ""}.`,
          };
        }
        case "add_expense": {
          const saved = await this.expenses.create(farmId, userId, flockId, {
            date: e.date!,
            category: (e.category ?? "other") as never,
            description: (e.description ?? "هزینه").slice(0, 200),
            amount: Math.round(e.amountRial!),
            quantity: e.quantity,
            unit: e.quantity ? "kg" : undefined,
            feedType: e.feedType,
          });
          return {
            ...preview,
            kind: "done",
            requiresConfirm: false,
            created: { type: "expense", ...saved },
            reply: `هزینه ثبت شد: «${e.description ?? "هزینه"}» به مبلغ ${faDigits(Math.round(e.amountRial!).toLocaleString("en-US"))} ریال.`,
          };
        }
        case "add_sale": {
          const saved = await this.sales.create(farmId, userId, flockId, {
            date: e.date!,
            totalWeightKg: e.totalWeightKg!,
            pricePerKg: Math.round(e.pricePerKg!),
            buyer: e.buyer,
          });
          return {
            ...preview,
            kind: "done",
            requiresConfirm: false,
            created: { type: "sale", ...saved },
            reply: `فروش ثبت شد: ${faDigits(e.totalWeightKg!)} کیلوگرم به قیمت هر کیلو ${faDigits(Math.round(e.pricePerKg!).toLocaleString("en-US"))} ریال.`,
          };
        }
        default:
          throw new BadRequestException("این جمله قابل ثبت نیست.");
      }
    } catch (error) {
      // خطای اعتبارسنجی سرویس‌های موجود باید با همان پیام فارسی به کاربر برسد
      if (error instanceof BadRequestException) throw error;
      this.logger.warn(`ثبت از دستیار ناموفق بود: ${error instanceof Error ? error.message : error}`);
      throw new BadRequestException("ثبت انجام نشد؛ مقادیر گفته‌شده را بررسی کنید.");
    }
  }

  /* ------------------------------ صدا به متن ------------------------------ */

  /**
   * تبدیل صدا به متن با سرویس پایتون (اختیاری).
   * اگر موتور گفتار نصب/فعال نباشد، خطای ۵۰۳ با پیام روشن برمی‌گردد تا
   * کلاینت به موتور گفتار دستگاه (Web Speech / Expo) برگردد — ثبت داده هرگز
   * به این قابلیت وابسته نیست.
   */
  async voice(dto: { audioBase64: string; mimeType?: string; language?: string }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(`${this.aiUrl}/assistant/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.aiKey ? { "X-AI-Key": this.aiKey } : {}) },
        body: JSON.stringify({
          audio_base64: dto.audioBase64,
          mime_type: dto.mimeType ?? "audio/wav",
          language: dto.language ?? "fa",
        }),
        signal: controller.signal,
      });

      if (res.status === 503) {
        throw new ServiceUnavailableException(
          "تبدیل گفتار به متن روی سرور فعال نیست. متن را تایپ کنید یا از میکروفن دستگاه استفاده کنید.",
        );
      }
      if (res.status === 400 || res.status === 422) {
        // خطای ورودی (صدای کوتاه/خالی) را با پیام خود سرویس به کاربر بده
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new BadRequestException(body.detail ?? "در صدا جمله‌ای شنیده نشد؛ دوباره بگویید.");
      }
      if (!res.ok) {
        throw new ServiceUnavailableException("سرویس تبدیل گفتار پاسخ نداد؛ متن را تایپ کنید.");
      }
      const body = (await res.json()) as { text?: string };
      if (!body.text?.trim()) {
        throw new BadRequestException("در صدا جمله‌ای شنیده نشد.");
      }
      return { text: body.text.trim() };
    } catch (error) {
      if (error instanceof ServiceUnavailableException || error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException(
        "سرویس تبدیل گفتار در دسترس نیست. متن را تایپ کنید یا از میکروفن دستگاه استفاده کنید.",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  examples() {
    return {
      examples: assistantExamples(),
      tips: [
        "تاریخ را می‌توانید بگویید: «دیروز»، «۳ روز پیش» یا «۲ آبان».",
        "عدد را می‌شود با رقم یا با حروف گفت: «دویست و پنجاه لیتر».",
        "هیچ داده‌ای بدون تأیید شما ثبت نمی‌شود.",
      ],
    };
  }
}
