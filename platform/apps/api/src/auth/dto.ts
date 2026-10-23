import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { Transform } from "class-transformer";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class RegisterDto {
  @Transform(trim)
  @IsEmail({}, { message: "ایمیل معتبر نیست." })
  @MaxLength(120)
  email!: string;

  @IsString()
  @MinLength(8, { message: "گذرواژه باید حداقل ۸ نویسه باشد." })
  @MaxLength(72, { message: "گذرواژه بیش از حد بلند است." })
  @Matches(/[A-Za-z\u0600-\u06FF]/, { message: "گذرواژه باید حداقل یک حرف داشته باشد." })
  password!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2, { message: "نام را وارد کنید." })
  @MaxLength(80)
  name!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2, { message: "نام مزرعه را وارد کنید." })
  @MaxLength(80)
  farmName!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class LoginDto {
  @Transform(trim)
  @IsEmail({}, { message: "ایمیل معتبر نیست." })
  email!: string;

  @IsString()
  @MinLength(1, { message: "گذرواژه را وارد کنید." })
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}

export class SwitchFarmDto {
  @IsString()
  @MinLength(8)
  farmId!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: "نام را وارد کنید." })
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: "گذرواژه فعلی را وارد کنید." })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: "گذرواژه جدید باید حداقل ۸ نویسه باشد." })
  @MaxLength(72)
  @Matches(/[A-Za-z\u0600-\u06FF]/, { message: "گذرواژه باید حداقل یک حرف داشته باشد." })
  newPassword!: string;
}
