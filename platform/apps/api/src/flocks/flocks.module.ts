import { Module } from "@nestjs/common";
import { FlocksController } from "./flocks.controller";
import { FlocksService } from "./flocks.service";
import { FlockAccess } from "../common/flock-access";

@Module({
  controllers: [FlocksController],
  providers: [FlocksService, FlockAccess],
  exports: [FlocksService, FlockAccess],
})
export class FlocksModule {}
