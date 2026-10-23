import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { SyncService } from "./sync.service";
import { SyncPullQueryDto, SyncPushDto } from "./sync.dto";

@ApiTags("sync")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("sync")
export class SyncController {
  constructor(private readonly service: SyncService) {}

  /**
   * ارسال صف آفلاین.
   * نقش هر عملیات جدا بررسی می‌شود (کارگر ثبت روزانه دارد، هزینه ندارد)؛
   * به همین دلیل کل مسیر به یک نقش محدود نشده و قاعده در سرویس اعمال می‌شود.
   */
  @Post("push")
  @Roles("owner", "manager", "worker", "vet")
  push(@CurrentUser() user: AuthUser, @Body() dto: SyncPushDto) {
    const timezone = "Asia/Tehran";
    return this.service.push(user.farmId, user.id, user.role, dto.operations, timezone);
  }

  /** دریافت افزایشی تغییرات سرور برای همان گوشی */
  @Get("pull")
  @Roles("owner", "manager", "worker", "vet")
  pull(@CurrentUser() user: AuthUser, @Query() query: SyncPullQueryDto) {
    return this.service.pull(user.farmId, query.since, "Asia/Tehran");
  }
}
