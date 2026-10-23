import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { HallsService } from "./halls.service";
import { CreateHallDto, UpdateHallDto } from "./halls.dto";

@ApiTags("halls")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("halls")
export class HallsController {
  constructor(private readonly service: HallsService) {}

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

  @Post()
  @Roles("owner", "manager")
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateHallDto) {
    return this.service.create(user.farmId, dto);
  }

  @Patch(":id")
  @Roles("owner", "manager")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateHallDto) {
    return this.service.update(user.farmId, id, dto);
  }

  @Delete(":id")
  @Roles("owner")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.remove(user.farmId, id);
  }
}
