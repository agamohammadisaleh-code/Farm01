import { BadRequestException } from "@nestjs/common";

/** خطای اعتبارسنجی به شکل فیلد → پیام، مطابق قرارداد فرم‌های کلاینت */
export class ValidationError extends BadRequestException {
  constructor(
    message: string,
    public readonly errors: Record<string, string>,
  ) {
    super({ message, errors });
  }
}

export function assertValid(errors: Record<string, string>, message = "مقادیر را بررسی کنید.") {
  if (Object.keys(errors).length > 0) throw new ValidationError(message, errors);
}
