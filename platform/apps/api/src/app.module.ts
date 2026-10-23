import { Module } from "@nestjs/common";
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
import { FarmsModule } from "./farms/farms.module";
import { DatabaseModule } from "./db/db.module";
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
