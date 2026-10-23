import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateVaccinationDto {
  @IsString() @MinLength(2, { message: "نام واکسن را وارد کنید." }) @MaxLength(80) name!: string;
  @Matches(DATE, { message: "تاریخ برنامه معتبر نیست." }) scheduledDate!: string;
  @IsOptional() @Matches(DATE) doneDate?: string;
  @IsOptional() @IsIn(["scheduled", "done", "skipped"]) status?: "scheduled" | "done" | "skipped";
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class UpdateVaccinationDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @Matches(DATE) scheduledDate?: string;
  @IsOptional() @Matches(DATE) doneDate?: string;
  @IsOptional() @IsIn(["scheduled", "done", "skipped"]) status?: "scheduled" | "done" | "skipped";
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class CreateMedicationDto {
  @IsString() @MinLength(2, { message: "نام دارو را وارد کنید." }) @MaxLength(80) name!: string;
  @IsString() @MinLength(1, { message: "دوز مصرف را وارد کنید." }) @MaxLength(80) dose!: string;
  @Matches(DATE, { message: "تاریخ شروع معتبر نیست." }) startDate!: string;
  @IsOptional() @Matches(DATE) endDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(120) withdrawalDays?: number;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}
