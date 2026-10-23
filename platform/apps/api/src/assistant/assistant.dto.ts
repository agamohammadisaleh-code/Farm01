import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AssistantMessageDto {
  /** جمله فارسی کاربر (تایپ‌شده یا حاصل تبدیل گفتار به متن) */
  @IsString()
  @MinLength(2, { message: "جمله خیلی کوتاه است." })
  @MaxLength(600, { message: "جمله بیش از حد بلند است." })
  text!: string;

  /** گله‌ای که کاربر انتخاب کرده؛ اگر نباشد گله فعال انتخاب می‌شود */
  @IsOptional()
  @IsString()
  flockId?: string;
}

export class AssistantConfirmDto extends AssistantMessageDto {
  /** تأیید صریح کاربر — بدون این، هیچ داده‌ای ثبت نمی‌شود */
  @Type(() => Boolean)
  @IsBoolean({ message: "تأیید کاربر لازم است." })
  confirm!: boolean;
}

export class AssistantVoiceDto {
  /** صدای ضبط‌شده به‌صورت base64 (بدون پیشوند data:) */
  @IsString()
  @MinLength(32)
  audioBase64!: string;

  /** نوع فایل صوتی؛ پیش‌فرض audio/wav */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  mimeType?: string;

  /** زبان گفتار؛ پیش‌فرض fa */
  @IsOptional()
  @IsIn(["fa", "fa-IR", "en"])
  language?: string;

  @IsOptional()
  @IsString()
  flockId?: string;
}
