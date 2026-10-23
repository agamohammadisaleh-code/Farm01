import { Module } from "@nestjs/common";
import { ExpensesModule } from "../expenses/expenses.module";
import { FarmsModule } from "../farms/farms.module";
import { LogsModule } from "../logs/logs.module";
import { SalesModule } from "../sales/sales.module";
import { WeightSamplesModule } from "../weight-samples/weight-samples.module";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";

@Module({
  imports: [LogsModule, ExpensesModule, SalesModule, WeightSamplesModule, FarmsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
