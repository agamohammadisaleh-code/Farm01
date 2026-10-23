import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module";
import { FarmsModule } from "../farms/farms.module";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";

@Module({
  imports: [AnalyticsModule, FarmsModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
