import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { CyclesModule } from "./cycles/cycles.module";
import { LogsModule } from "./logs/logs.module";
import { CostsModule } from "./costs/costs.module";
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
    CyclesModule,
    LogsModule,
    CostsModule,
    SalesModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
