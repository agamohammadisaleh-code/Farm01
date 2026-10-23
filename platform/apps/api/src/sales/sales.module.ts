import { Module } from "@nestjs/common";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";
import { FlockAccess } from "../common/flock-access";

@Module({
  controllers: [SalesController],
  providers: [SalesService, FlockAccess],
  exports: [SalesService],
})
export class SalesModule {}
