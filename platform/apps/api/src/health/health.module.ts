import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { FlockAccess } from "../common/flock-access";

@Module({
  controllers: [HealthController],
  providers: [HealthService, FlockAccess],
  exports: [HealthService],
})
export class HealthModule {}
