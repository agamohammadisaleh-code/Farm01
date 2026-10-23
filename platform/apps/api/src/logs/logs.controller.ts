import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { LogsService } from "./logs.service";
import { SaveLogDto } from "./logs.dto";

@ApiTags("logs")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("flocks/:flockId/logs")
export class LogsController {
  constructor(private readonly service: LogsService) {}

  @Get()
  @Roles("owner", "manager", "worker", "vet")
  list(@CurrentUser() user: AuthUser, @Param("flockId") flockId: string) {
    return this.service.list(user.farmId, flockId);
  }

  @Post()
  @Roles("owner", "manager", "worker", "vet")
  save(@CurrentUser() user: AuthUser, @Param("flockId") flockId: string, @Body() dto: SaveLogDto) {
    return this.service.save(user.farmId, user.id, flockId, dto);
  }

  @Delete(":id")
  @Roles("owner", "manager")
  remove(@CurrentUser() user: AuthUser, @Param("flockId") flockId: string, @Param("id") id: string) {
    return this.service.remove(user.farmId, flockId, id);
  }
}
