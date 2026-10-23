import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateHallDto {
  @IsString() @MinLength(1, { message: "نام سالن را وارد کنید." }) @MaxLength(40) name!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) capacity!: number;
}

export class UpdateHallDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) capacity?: number;
}
