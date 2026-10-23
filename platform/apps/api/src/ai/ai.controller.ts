import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { AiService } from "./ai.service";

@ApiTags("ai")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("ai")
export class AiController {
  constructor(private readonly service: AiService) {}

  /** وضعیت سرویس تحلیل: در دسترس یا خاموش (بدون خطا) */
  @Get("status")
  @Roles("owner", "manager", "worker", "vet")
  status() {
    return this.service.status();
  }

  @Get("flocks/:id/forecast")
  @Roles("owner", "manager", "worker", "vet")
  forecast(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.forecast(user.farmId, id);
  }

  @Get("flocks/:id/loading-date")
  @Roles("owner", "manager", "worker", "vet")
  loadingDate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.loadingDate(user.farmId, id);
  }

  @Get("flocks/:id/risk")
  @Roles("owner", "manager", "worker", "vet")
  risk(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.risk(user.farmId, id);
  }

  @Get("farm/feed")
  @Roles("owner", "manager", "worker", "vet")
  feed(@CurrentUser() user: AuthUser) {
    return this.service.feedForecast(user.farmId);
  }
}
