import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { CostsService } from "./costs.service";
import { CreateCostDto } from "./costs.dto";

@ApiTags("costs")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("owner", "manager")
@Controller("cycles/:cycleId/costs")
export class CostsController {
  constructor(private readonly service: CostsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("cycleId") cycleId: string) {
    return this.service.list(user.farmId, cycleId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Param("cycleId") cycleId: string, @Body() dto: CreateCostDto) {
    return this.service.create(user.farmId, user.id, cycleId, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("cycleId") cycleId: string, @Param("id") id: string, @Body() dto: CreateCostDto) {
    return this.service.update(user.farmId, cycleId, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("cycleId") cycleId: string, @Param("id") id: string) {
    return this.service.remove(user.farmId, cycleId, id);
  }
}
