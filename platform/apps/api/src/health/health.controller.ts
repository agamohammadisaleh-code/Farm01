import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../common/roles";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { HealthService } from "./health.service";
import { CreateMedicationDto, CreateVaccinationDto, UpdateVaccinationDto } from "./health.dto";

@ApiTags("health")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("flocks/:flockId")
export class HealthController {
  constructor(private readonly service: HealthService) {}

  @Get("health")
  @Roles("owner", "manager", "worker", "vet")
  summary(@CurrentUser() user: AuthUser, @Param("flockId") flockId: string) {
    return this.service.summary(user.farmId, flockId);
  }

  @Get("vaccinations")
  @Roles("owner", "manager", "worker", "vet")
  vaccinations(@CurrentUser() user: AuthUser, @Param("flockId") flockId: string) {
    return this.service.listVaccinations(user.farmId, flockId);
  }

  @Post("vaccinations")
  @Roles("owner", "manager", "vet")
  createVaccination(@CurrentUser() user: AuthUser, @Param("flockId") flockId: string, @Body() dto: CreateVaccinationDto) {
    return this.service.createVaccination(user.farmId, flockId, dto);
  }

  @Patch("vaccinations/:id")
  @Roles("owner", "manager", "vet")
  updateVaccination(
    @CurrentUser() user: AuthUser,
    @Param("flockId") flockId: string,
    @Param("id") id: string,
    @Body() dto: UpdateVaccinationDto,
  ) {
    return this.service.updateVaccination(user.farmId, flockId, id, dto);
  }

  @Delete("vaccinations/:id")
  @Roles("owner", "manager", "vet")
  removeVaccination(@CurrentUser() user: AuthUser, @Param("flockId") flockId: string, @Param("id") id: string) {
    return this.service.removeVaccination(user.farmId, flockId, id);
  }

  @Get("medications")
  @Roles("owner", "manager", "worker", "vet")
  medications(@CurrentUser() user: AuthUser, @Param("flockId") flockId: string) {
    return this.service.listMedications(user.farmId, flockId);
  }

  @Post("medications")
  @Roles("owner", "manager", "vet")
  createMedication(@CurrentUser() user: AuthUser, @Param("flockId") flockId: string, @Body() dto: CreateMedicationDto) {
    return this.service.createMedication(user.farmId, flockId, dto);
  }

  @Delete("medications/:id")
  @Roles("owner", "manager", "vet")
  removeMedication(@CurrentUser() user: AuthUser, @Param("flockId") flockId: string, @Param("id") id: string) {
    return this.service.removeMedication(user.farmId, flockId, id);
  }
}
