import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateWeightSampleDto {
  @Matches(DATE, { message: "تاریخ معتبر نیست." }) date!: string;
  @Type(() => Number) @IsInt() @Min(1, { message: "تعداد نمونه باید بزرگ‌تر از صفر باشد." }) @Max(100_000) sampleCount!: number;
  @Type(() => Number) @IsInt() @Min(20, { message: "میانگین وزن معتبر نیست." }) @Max(6000) avgWeightGr!: number;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}
