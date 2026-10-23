import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export const SYNC_OP_TYPES = ["log.save", "expense.create", "sale.create", "weight.create"] as const;

/* همان الگوی clientId که جدول ثبت روزانه انتظار دارد (شناسه یکتای دستگاه) */
const CLIENT_ID = /^[0-9a-zA-Z_-]{8,64}$/;

export class SyncOperationDto {
  @Matches(CLIENT_ID, { message: "شناسه عملیات معتبر نیست." })
  clientId!: string;

  @IsIn(SYNC_OP_TYPES as unknown as string[], { message: "نوع عملیات پشتیبانی نمی‌شود." })
  type!: (typeof SYNC_OP_TYPES)[number];

  @IsString()
  @MaxLength(64)
  flockId!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class SyncPushDto {
  @IsArray()
  @ArrayMaxSize(100, { message: "حداکثر ۱۰۰ عملیات در هر ارسال." })
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations!: SyncOperationDto[];
}

export class SyncPullQueryDto {
  /** آخرین زمان موفق همگام‌سازی (ISO)؛ اگر نباشد همه داده برمی‌گردد */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  since?: string;

  /** فقط شمارش و زمان سرور، بدون داده (برای بررسی سریع اتصال) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  metaOnly?: number;
}
