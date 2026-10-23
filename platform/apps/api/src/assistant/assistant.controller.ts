import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { AssistantService } from "./assistant.service";
import { AssistantConfirmDto, AssistantMessageDto, AssistantVoiceDto } from "./assistant.dto";

@ApiTags("assistant")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("assistant")
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  /** نمونه‌جمله‌ها و راهنما — برای چیپ‌های رابط کاربری */
  @Get("examples")
  @Roles("owner", "manager", "worker", "vet")
  examples() {
    return this.service.examples();
  }

  /**
   * جمله فارسی → پیشنهاد ثبت یا پاسخ پرسش.
   * هیچ‌چیز اینجا نوشته نمی‌شود؛ فقط پیشنهاد با `requiresConfirm` برمی‌گردد.
   */
  @Post("message")
  @Roles("owner", "manager", "worker", "vet")
  message(@CurrentUser() user: AuthUser, @Body() dto: AssistantMessageDto) {
    return this.service.message(user.farmId, dto);
  }

  /** اجرای پیشنهاد پس از تأیید کاربر */
  @Post("confirm")
  @Roles("owner", "manager", "worker")
  confirm(@CurrentUser() user: AuthUser, @Body() dto: AssistantConfirmDto) {
    return this.service.confirm(user.farmId, user.id, dto);
  }

  /** صدا (base64) → متن؛ سپس همان مسیر `message` */
  @Post("voice")
  @Roles("owner", "manager", "worker", "vet")
  voice(@Body() dto: AssistantVoiceDto) {
    return this.service.voice(dto);
  }
}
