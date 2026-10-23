import { Module } from "@nestjs/common";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";
import { FlockAccess } from "../common/flock-access";
import { InventoryModule } from "../inventory/inventory.module";

@Module({
  imports: [InventoryModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, FlockAccess],
  exports: [ExpensesService],
})
export class ExpensesModule {}
