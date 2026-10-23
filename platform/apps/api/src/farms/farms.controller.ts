import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { FarmsService } from "./farms.service";
import { AddMemberDto, CreateFarmDto, UpdateSettingsDto } from "./farms.dto";

@ApiTags("farm")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("farm")
export class FarmsController {
  constructor(private readonly service: FarmsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.service.get(user.farmId);
  }

  @Post()
  @Roles("owner", "manager")
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFarmDto) {
    return this.service.create(user.id, dto);
  }

  @Get("settings")
  @Roles("owner", "manager", "worker", "vet")
  settings(@CurrentUser() user: AuthUser) {
    return this.service.settings(user.farmId);
  }

  @Patch("settings")
  @Roles("owner", "manager")
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.service.updateSettings(user.farmId, dto);
  }

  @Get("members")
  @Roles("owner", "manager")
  members(@CurrentUser() user: AuthUser) {
    return this.service.members(user.farmId);
  }

  @Post("members")
  @Roles("owner")
  addMember(@CurrentUser() user: AuthUser, @Body() dto: AddMemberDto) {
    return this.service.addMember(user.farmId, dto);
  }

  @Delete("members/:userId")
  @Roles("owner")
  removeMember(@CurrentUser() user: AuthUser, @Param("userId") userId: string) {
    return this.service.removeMember(user.farmId, userId);
  }
}
