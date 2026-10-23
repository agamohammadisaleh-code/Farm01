import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { FlocksModule } from "./flocks/flocks.module";
import { HallsModule } from "./halls/halls.module";
import { LogsModule } from "./logs/logs.module";
import { WeightSamplesModule } from "./weight-samples/weight-samples.module";
import { HealthModule } from "./health/health.module";
import { InventoryModule } from "./inventory/inventory.module";
import { ExpensesModule } from "./expenses/expenses.module";
import { SalesModule } from "./sales/sales.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { RemindersModule } from "./reminders/reminders.module";
import { ReportsModule } from "./reports/reports.module";
import { AiModule } from "./ai/ai.module";
import { FarmsModule } from "./farms/farms.module";
import { AssistantModule } from "./assistant/assistant.module";
import { SyncModule } from "./sync/sync.module";
import { DatabaseModule } from "./db/db.module";
import { RateLimitGuard } from "./common/rate-limit";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    FarmsModule,
    HallsModule,
    FlocksModule,
    LogsModule,
    WeightSamplesModule,
    HealthModule,
    ExpensesModule,
    SalesModule,
    InventoryModule,
    AnalyticsModule,
    RemindersModule,
    ReportsModule,
    AiModule,
    AssistantModule,
    SyncModule,
  ],
  controllers: [HealthController],
  providers: [
    // ترمز نرخ درخواست برای همه مسیرها؛ قواعد سخت‌گیرانه‌تر با
    // `@RateLimit(...)` روی مسیرهای احراز هویت اضافه می‌شود.
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
