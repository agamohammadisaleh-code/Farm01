import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { RemindersService } from "./reminders.service";

class ReminderQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) horizonDays?: number;
}

@ApiTags("reminders")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("reminders")
export class RemindersController {
  constructor(private readonly service: RemindersService) {}

  /** همه یادآورها؛ افق پیش‌فرض ۷ روز آینده */
  @Get()
  @Roles("owner", "manager", "worker", "vet")
  list(@CurrentUser() user: AuthUser, @Query() query: ReminderQueryDto) {
    return this.service.list(user.farmId, { horizonDays: query.horizonDays });
  }

  /** فقط شمارش‌ها — سبک، برای نشان اعلان در موبایل */
  @Get("badge")
  @Roles("owner", "manager", "worker", "vet")
  badge(@CurrentUser() user: AuthUser) {
    return this.service.badge(user.farmId);
  }
}
