import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { SalesService } from "./sales.service";
import { CreateSaleDto } from "./sales.dto";

@ApiTags("sales")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("owner", "manager")
@Controller("cycles/:cycleId/sales")
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("cycleId") cycleId: string) {
    return this.service.list(user.farmId, cycleId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Param("cycleId") cycleId: string, @Body() dto: CreateSaleDto) {
    return this.service.create(user.farmId, user.id, cycleId, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("cycleId") cycleId: string, @Param("id") id: string) {
    return this.service.remove(user.farmId, cycleId, id);
  }
}
