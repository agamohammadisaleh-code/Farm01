import { Type } from "class-transformer";
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class UpdateSettingsDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) farmName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1000) @Max(10_000_000) marketPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1000) @Max(10_000_000) feedPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1000) @Max(5000) targetWeightG?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(21) @Max(70) targetAgeDays?: number;
  @IsOptional() @IsString() @MaxLength(60) defaultBreed?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) feedAlertDays?: number;
}

export class UpdateFarmDto {
  @IsOptional() @IsString() @MinLength(2, { message: "نام مزرعه را وارد کنید." }) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
}

export class UpdateMemberRoleDto {
  @IsIn(["manager", "worker", "vet"], { message: "نقش معتبر نیست." }) role!: "manager" | "worker" | "vet";
}

export class AddMemberDto {
  @IsEmail({}, { message: "ایمیل معتبر نیست." }) email!: string;
  @IsIn(["manager", "worker", "vet"], { message: "نقش معتبر نیست." }) role!: "manager" | "worker" | "vet";
  @IsOptional() @IsString() @MinLength(8) @MaxLength(72) password?: string;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
}

export class CreateFarmDto {
  @IsString() @MinLength(2, { message: "نام مزرعه را وارد کنید." }) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
}
