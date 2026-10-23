import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { AnalyticsService } from "./analytics.service";

@ApiTags("analytics")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  /**
   * کارگر و دامپزشک خلاصه زیستی می‌گیرند و شاخص‌های مالی حذف می‌شود
   * (ماتریس دسترسی در common/roles.ts).
   */
  @Get("overview")
  @Roles("owner", "manager", "worker", "vet")
  async overview(@CurrentUser() user: AuthUser) {
    const data = await this.service.overview(user.farmId);
    if (user.role === "worker" || user.role === "vet") {
      return {
        ...data,
        activeCost: undefined,
        activeProjectedProfit: undefined,
        activeProjectedRevenue: undefined,
        realizedProfit: undefined,
        realizedRevenue: undefined,
        totalCostAll: undefined,
        feedCostTotal: undefined,
        costBreakdown: [],
        activeMetrics: data.activeMetrics.map((m) => ({
          ...m,
          totalCost: undefined,
          cashCost: undefined,
          inventoryValue: undefined,
          costBreakdown: [],
          costPerBird: undefined,
          costPerKgLive: undefined,
          revenue: undefined,
          netProfit: undefined,
          profitPerBird: undefined,
          marginPct: undefined,
          breakevenPerKg: undefined,
          projection: undefined,
        })),
      };
    }
    return data;
  }

  @Get("flocks/:id")
  @Roles("owner", "manager", "worker", "vet")
  async flock(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const m = await this.service.flockMetrics(user.farmId, id);
    if (user.role === "worker" || user.role === "vet") {
      return {
        ...m,
        totalCost: undefined,
        cashCost: undefined,
        inventoryValue: undefined,
        costBreakdown: [],
        costTimeline: [],
        revenue: undefined,
        netProfit: undefined,
        profitPerBird: undefined,
        marginPct: undefined,
        breakevenPerKg: undefined,
        projection: undefined,
      };
    }
    return m;
  }
}
