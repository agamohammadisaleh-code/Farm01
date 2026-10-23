import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AnalyticsModule } from "../analytics/analytics.module";
import { ExpensesModule } from "../expenses/expenses.module";
import { FlocksModule } from "../flocks/flocks.module";
import { LogsModule } from "../logs/logs.module";
import { SalesModule } from "../sales/sales.module";
import { WeightSamplesModule } from "../weight-samples/weight-samples.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";

@Module({
  imports: [FlocksModule, LogsModule, ExpensesModule, SalesModule, WeightSamplesModule, AnalyticsModule, AiModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
