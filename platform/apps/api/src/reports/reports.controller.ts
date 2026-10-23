import { Controller, Get, Param, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiProduces, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ReportsService, type ReportFormat } from "./reports.service";

/**
 * هدر Content-Disposition باید ASCII باشد؛ نام فایل فارسی است، پس نسخه
 * پاک‌شده برای سازگاری و نسخه UTF-8 (RFC 5987) برای نمایش درست ارسال می‌شود.
 */
function disposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

@ApiTags("reports")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  /** گزارش کامل گله به‌صورت JSON (همان داده‌ای که Excel و PDF از آن ساخته می‌شوند) */
  @Get("flocks/:id")
  @Roles("owner", "manager", "worker", "vet")
  flock(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.flockReport(user.farmId, id, user.email);
  }

  /**
   * خروجی فایل: `?format=xlsx|pdf|json`
   * نام فایل در هدر `Content-Disposition` می‌آید تا کلاینت مستقیم دانلود کند.
   */
  @Get("flocks/:id/export")
  @Roles("owner", "manager")
  @ApiProduces("application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  async exportFlock(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("format") format: string = "xlsx",
    @Res({ passthrough: true }) res: Response,
  ) {
    const fmt: ReportFormat = format === "pdf" ? "pdf" : format === "json" ? "json" : "xlsx";
    const file = await this.service.exportFlock(user.farmId, id, fmt, user.email ?? "");
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", disposition(file.filename));
    res.setHeader("Content-Length", String(file.body.length));
    return new StreamableFile(file.body);
  }

  /** گزارش مزرعه: خلاصه همه گله‌ها (`?format=xlsx|json`) */
  @Get("farm")
  @Roles("owner", "manager")
  farm(@CurrentUser() user: AuthUser) {
    return this.service.farmReport(user.farmId);
  }

  @Get("farm/export")
  @Roles("owner", "manager")
  async exportFarm(
    @CurrentUser() user: AuthUser,
    @Query("format") format: string = "xlsx",
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.service.exportFarm(user.farmId, format === "json" ? "json" : "xlsx");
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", disposition(file.filename));
    res.setHeader("Content-Length", String(file.body.length));
    return new StreamableFile(file.body);
  }
}
