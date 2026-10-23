import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class SetInventoryDto {
  @IsString() @MinLength(1, { message: "نوع دان را وارد کنید." }) @MaxLength(60) feedType!: string;
  @Type(() => Number) @IsNumber() @Min(0) @Max(10_000_000) quantityKg!: number;
}

export class AdjustInventoryDto {
  @IsString() @MinLength(1) @MaxLength(60) feedType!: string;
  /** مقدار مثبت (افزایش) یا منفی (کاهش) */
  @Type(() => Number) @IsNumber() @Min(-10_000_000) @Max(10_000_000) deltaKg!: number;
  @IsOptional() @IsString() @MaxLength(120) reason?: string;
}
