import { Module } from "@nestjs/common";
import { LogsController } from "./logs.controller";
import { LogsService } from "./logs.service";
import { FlockAccess } from "../common/flock-access";
import { InventoryModule } from "../inventory/inventory.module";

@Module({
  imports: [InventoryModule],
  controllers: [LogsController],
  providers: [LogsService, FlockAccess],
  exports: [LogsService],
})
export class LogsModule {}
