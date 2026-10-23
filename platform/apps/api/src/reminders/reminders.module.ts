import { Module } from "@nestjs/common";
import { HealthModule } from "../health/health.module";
import { AnalyticsModule } from "../analytics/analytics.module";
import { RemindersController } from "./reminders.controller";
import { RemindersService } from "./reminders.service";

@Module({
  imports: [HealthModule, AnalyticsModule],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
