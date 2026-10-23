import { Module } from "@nestjs/common";
import { WeightSamplesController } from "./weight-samples.controller";
import { WeightSamplesService } from "./weight-samples.service";
import { FlockAccess } from "../common/flock-access";

@Module({
  controllers: [WeightSamplesController],
  providers: [WeightSamplesService, FlockAccess],
  exports: [WeightSamplesService],
})
export class WeightSamplesModule {}
