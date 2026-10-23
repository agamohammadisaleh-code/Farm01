import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateFlockDto {
  @IsString() @MinLength(8) hallId!: string;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(60) breed?: string;
  @Matches(DATE, { message: "تاریخ جوجه‌ریزی معتبر نیست." }) startDate!: string;
  @Type(() => Number) @IsInt() @Min(100) @Max(1_000_000) initialCount!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) chickPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1000) @Max(5000) targetWeightG?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(21) @Max(70) targetAgeDays?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  /** شناسه تولیدشده در کلاینت آفلاین */
  @IsOptional() @IsString() @MaxLength(64) clientId?: string;
}

export class UpdateFlockDto {
  @IsOptional() @IsString() @MinLength(8) hallId?: string;
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(60) breed?: string;
  @IsOptional() @Matches(DATE) startDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(1_000_000) initialCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) chickPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1000) @Max(5000) targetWeightG?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(21) @Max(70) targetAgeDays?: number;
  @IsOptional() @Matches(DATE) closedDate?: string;
  @IsOptional() @IsIn(["active", "closed"]) status?: "active" | "closed";
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
