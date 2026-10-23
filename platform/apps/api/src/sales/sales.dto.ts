import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateSaleDto {
  @Matches(DATE, { message: "تاریخ معتبر نیست." }) date!: string;
  @Type(() => Number) @IsInt() @Min(1, { message: "تعداد باید بزرگ‌تر از صفر باشد." }) @Max(1_000_000) count!: number;
  @Type(() => Number) @IsNumber() @Min(0.1) @Max(500_000) weightKg!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(10_000_000) pricePerKg!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000_000) deductions?: number;
  @IsOptional() @IsString() @MaxLength(80) buyer?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
