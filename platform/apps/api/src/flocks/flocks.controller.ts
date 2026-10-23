import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { FlocksService } from "./flocks.service";
import { CreateFlockDto, UpdateFlockDto } from "./flocks.dto";

@ApiTags("flocks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("flocks")
export class FlocksController {
  constructor(private readonly service: FlocksService) {}

  @Get()
  @Roles("owner", "manager", "worker", "vet")
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.farmId);
  }

  @Get(":id")
  @Roles("owner", "manager", "worker", "vet")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.farmId, id);
  }

  @Get(":id/stats")
  @Roles("owner", "manager", "worker", "vet")
  stats(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.stats(user.farmId, id);
  }

  @Post()
  @Roles("owner", "manager")
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFlockDto) {
    return this.service.create(user.farmId, user.id, dto);
  }

  @Patch(":id")
  @Roles("owner", "manager")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateFlockDto) {
    return this.service.update(user.farmId, id, dto);
  }

  @Delete(":id")
  @Roles("owner")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.remove(user.farmId, id);
  }
}
