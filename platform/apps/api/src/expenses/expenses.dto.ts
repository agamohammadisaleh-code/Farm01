import { Type } from "class-transformer";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const EXPENSE_CATEGORIES = [
  "chick",
  "feed",
  "medication",
  "vaccine",
  "labor",
  "energy",
  "litter",
  "transport",
  "equipment",
  "other",
] as const;

export class CreateExpenseDto {
  @Matches(DATE, { message: "تاریخ معتبر نیست." }) date!: string;
  @IsIn(EXPENSE_CATEGORIES, { message: "دسته هزینه معتبر نیست." }) category!: (typeof EXPENSE_CATEGORIES)[number];
  @IsString() @MinLength(2, { message: "شرح هزینه را وارد کنید." }) @MaxLength(200) description!: string;
  @Type(() => Number) @IsInt() @Min(1, { message: "مبلغ باید بزرگ‌تر از صفر باشد." }) @Max(1_000_000_000_000)
  amount!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(10_000_000) quantity?: number;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsString() @MaxLength(80) vendor?: string;
  /** برای خرید دان: نوع دان که به انبار اضافه می‌شود (پیش‌فرض: شرح هزینه) */
  @IsOptional() @IsString() @MaxLength(60) feedType?: string;
}
