import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SaveLogDto {
  @Matches(DATE, { message: "تاریخ معتبر نیست." }) date!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(100_000) mortality!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) cull?: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(500_000) feedKg!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(2_000_000) waterLiter?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-10) @Max(50) avgTemp?: number;
  @IsOptional() @IsString() @MaxLength(60) feedType?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsString() @MaxLength(64) clientId?: string;
}
