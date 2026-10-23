import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { InventoryService } from "./inventory.service";
import { AdjustInventoryDto, SetInventoryDto } from "./inventory.dto";

@ApiTags("inventory")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("farm/inventory")
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  @Roles("owner", "manager", "worker", "vet")
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.farmId);
  }

  @Post("set")
  @Roles("owner", "manager")
  set(@CurrentUser() user: AuthUser, @Body() dto: SetInventoryDto) {
    return this.service.setQuantity(user.farmId, dto.feedType, dto.quantityKg);
  }

  @Post("adjust")
  @Roles("owner", "manager", "worker")
  adjust(@CurrentUser() user: AuthUser, @Body() dto: AdjustInventoryDto) {
    return this.service.adjust(user.farmId, dto.feedType, dto.deltaKg);
  }
}
