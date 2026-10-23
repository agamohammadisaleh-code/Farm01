/* آزمون رندر واقعی رابط کاربری.

   این آزمون همان چیزهایی را می‌سنجد که با بازکردن مرورگر بررسی می‌شد:
   ۱. با داده‌ی API، چهار شاخص کلیدی و سه نمودار در داشبورد رندر می‌شوند.
   ۲. عددها با ارقام فارسی نمایش داده می‌شوند.
   ۳. کارگر سالن لینک داشبورد را نمی‌بیند و فرم «ثبت امروز» را دارد.
   ۴. ثبت فرم، درخواست درستی به API می‌فرستد. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { AuthProvider } from "../auth";
import { tokenStore } from "../lib/api";
import type { FlockMetrics, Overview } from "../lib/types";

const metrics: FlockMetrics = {
  flock: {
    id: "flock-demo-0001",
    name: "گله پاییزه",
    breed: "راس ۳۰۸",
    hall_id: "hall-1",
    start_date: "2026-09-26",
    initial_count: 12000,
    target_weight_g: 2450,
    target_age_days: 42,
    status: "active",
  },
  ageDays: 29,
  targetAge: 42,
  daysRemaining: 13,
  liveBirds: 11771,
  lostBirds: 229,
  mortalityPct: 1.88,
  cullPct: 0.03,
  removalPct: 1.91,
  expectedMortalityPct: 2.69,
  dailyMortalityPct: 0.017,
  waterChangePct: -94.6,
  waterBaselineL: 3174,
  lastWaterL: 170,
  totalFeedKg: 26535,
  todayFeedKg: 85,
  avgDailyFeedG: 126.4,
  expectedDailyFeedKg: 1824.5,
  feedStockKg: 10465,
  feedDaysLeft: 5.7,
  currentWeightG: 1426,
  weightSource: "measured",
  measuredWeightG: 1335,
  stdWeightG: 1622,
  weightVsStdPct: -12.1,
  dailyGainG: 69,
  fcr: 1.58,
  stdFcr: 1.45,
  feedVsStdPct: 8.9,
  totalCost: 1_332_881_114,
  costPerBird: 111_000,
  costPerKgLive: 79_407,
  revenue: 0,
  liveBiomassKg: 16_785,
  estimatedLiveValue: 1_644_956_000,
  netProfit: 0,
  marginPct: 0,
  breakevenPerKg: 79_407,
  marketPrice: 98_000,
  targetWeightG: 2450,
  projection: {
    targetAge: 42,
    daysRemaining: 13,
    projectedWeightG: 2532,
    projectedCost: 2_278_875_904,
    projectedRevenue: 2_920_888_856,
    projectedProfit: 641_932_951,
    projectedFcr: 1.776,
  },
  costBreakdown: [
    { key: "feed", label: "دان و خوراک", color: "#e0a020", amount: 864_001_114, share: 64.8 },
    { key: "chick", label: "جوجه یک‌روزه", color: "#2f7d5b", amount: 324_000_000, share: 24.3 },
  ],
  alerts: [
    {
      id: "water-drop",
      severity: "critical",
      title: "افت مصرف آب نسبت به سه روز گذشته",
      detail: "کاهش ۹۴٫۶٪ نسبت به میانگین سه روز قبل (آستانه ۱۰٪).",
      recommendation: "گرفتگی خط آب و دمای سالن را بررسی کنید.",
    },
  ],
  dailySeries: [
    {
      day: 1,
      date: "2026-09-26",
      weightG: 43.6,
      stdWeightG: 45,
      feedKg: 158,
      stdDailyFeedKg: 155.9,
      mortality: 4,
      liveBirds: 11996,
      cumFeedKg: 158,
      stdCumFeedKg: 156,
      waterL: 270,
      tempC: 33.2,
      avgWeightG: null,
    },
    {
      day: 2,
      date: "2026-09-27",
      weightG: 70,
      stdWeightG: 73,
      feedKg: 264,
      stdDailyFeedKg: 259,
      mortality: 7,
      liveBirds: 11989,
      cumFeedKg: 422,
      stdCumFeedKg: 415,
      waterL: 481,
      tempC: 33,
      avgWeightG: null,
    },
  ],
};

const overview: Overview = {
  activeMetrics: [metrics],
  closedMetrics: [],
  liveBirds: 11771,
  liveBiomassKg: 16_785,
  activeCost: 1_332_881_114,
  activeProjectedProfit: 641_932_951,
  activeProjectedRevenue: 2_920_888_856,
  realizedProfit: 2_122_134_000,
  realizedRevenue: 2_122_134_000,
  alerts: metrics.alerts,
  mortalityPctWeighted: 1.91,
  costBreakdown: metrics.costBreakdown,
  generatedAt: "2026-10-23T21:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function mockApi(role: "owner" | "worker") {
  return vi.fn(async (...args: FetchArgs) => {
    const [input] = args;
    const url = String(input);
    if (url.includes("/auth/me")) {
      return jsonResponse({
        id: "u1",
        email: "u@farm.ir",
        name: role === "owner" ? "مالک نمونه" : "کارگر سالن",
        farms: [{ farmId: "f1", role, name: "مزرعه نمونه" }],
      });
    }
    if (url.includes("/analytics/overview")) return jsonResponse(overview);
    if (url.includes("/reminders")) return jsonResponse({ reminders: [] });
    if (url.endsWith("/logs")) return jsonResponse([]);
    return jsonResponse({ id: "log-1", date: "2026-10-23" });
  });
}

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  tokenStore.set("test-token");
});

afterEach(() => {
  cleanup();
  tokenStore.clear();
  vi.restoreAllMocks();
});

describe("داشبورد وب", () => {
  it("چهار شاخص کلیدی و سه نمودار روند را با ارقام فارسی رندر می‌کند", async () => {
    vi.stubGlobal("fetch", mockApi("owner"));
    renderApp("/dashboard");

    expect(await screen.findByText("ضریب تبدیل (FCR)")).toBeTruthy();
    expect(screen.getByText("تلفات و حذف")).toBeTruthy();
    expect(screen.getByText("میانگین وزن")).toBeTruthy();
    expect(screen.getByText("بهای تمام‌شده هر کیلو")).toBeTruthy();

    expect(screen.getByText("مصرف دان روزانه")).toBeTruthy();
    expect(screen.getByText("روند وزن")).toBeTruthy();

    expect(screen.getByText("۱٫۵۸")).toBeTruthy();
    expect(screen.getByText("افت مصرف آب نسبت به سه روز گذشته")).toBeTruthy();
    expect(screen.getByText(/گرفتگی خط آب/)).toBeTruthy();
  });

  it("کارگر سالن لینک داشبورد را نمی‌بیند و فرم ثبت امروز را دارد", async () => {
    vi.stubGlobal("fetch", mockApi("worker"));
    renderApp("/");

    expect(await screen.findByRole("heading", { name: "ثبت امروز" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /داشبورد/ })).toBeNull();
    expect(screen.getByLabelText("تلفات")).toBeTruthy();
    expect(screen.getByLabelText("دان مصرفی")).toBeTruthy();
  });

  it("ثبت فرم، درخواست درست را به API می‌فرستد", async () => {
    const fetchMock = mockApi("worker");
    vi.stubGlobal("fetch", fetchMock);
    renderApp("/");

    const mortality = await screen.findByLabelText("تلفات");
    fireEvent.change(mortality, { target: { value: "۳" } });
    fireEvent.change(screen.getByLabelText("دان مصرفی"), { target: { value: "۹۰۰" } });

    fireEvent.click(screen.getByRole("button", { name: /^ثبت امروز$/ }));

    const findPost = () => fetchMock.mock.calls.find(([, init]) => init?.method === "POST");

    await waitFor(() => {
      expect(findPost()).toBeTruthy();
    });

    const post = findPost()!;
    expect(String(post[0])).toContain("/flocks/flock-demo-0001/logs");
    const body = JSON.parse(String(post[1]?.body));
    expect(body.mortality).toBe(3);
    expect(body.feedKg).toBe(900);
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
