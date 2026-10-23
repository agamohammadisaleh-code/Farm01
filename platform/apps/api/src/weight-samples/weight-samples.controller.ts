import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { WeightSamplesService } from "./weight-samples.service";
import { CreateWeightSampleDto } from "./weight-samples.dto";

@ApiTags("weights")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("flocks/:flockId/weights")
export class WeightSamplesController {
  constructor(private readonly service: WeightSamplesService) {}

  @Get()
  @Roles("owner", "manager", "worker", "vet")
  list(@CurrentUser() user: AuthUser, @Param("flockId") flockId: string) {
    return this.service.list(user.farmId, flockId);
  }

  @Post()
  @Roles("owner", "manager", "worker", "vet")
  create(@CurrentUser() user: AuthUser, @Param("flockId") flockId: string, @Body() dto: CreateWeightSampleDto) {
    return this.service.create(user.farmId, user.id, flockId, dto);
  }

  @Delete(":id")
  @Roles("owner", "manager", "vet")
  remove(@CurrentUser() user: AuthUser, @Param("flockId") flockId: string, @Param("id") id: string) {
    return this.service.remove(user.farmId, flockId, id);
  }
}
