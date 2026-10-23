import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateWeightSampleDto {
  @Matches(DATE, { message: "تاریخ معتبر نیست." }) date!: string;
  @Type(() => Number) @IsInt() @Min(1, { message: "تعداد نمونه باید بزرگ‌تر از صفر باشد." }) @Max(100_000) sampleCount!: number;
  @Type(() => Number) @IsInt() @Min(20, { message: "میانگین وزن معتبر نیست." }) @Max(6000) avgWeightGr!: number;

  /** اختیاری: حداقل/حداکثر وزن نمونه، برای برآورد یکنواختی */
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(6000) minWeightGr?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(7000) maxWeightGr?: number;

  /** اختیاری: اگر ترازوی دیجیتال خودش CV یا یکنواختی می‌دهد */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) cvPct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) uniformityPct?: number;

  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class UpdateWeightSampleDto extends CreateWeightSampleDto {}
