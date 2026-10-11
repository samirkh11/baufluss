import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { CompanyRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiPropertyOptional({ enum: CompanyRole, default: CompanyRole.MEMBER })
  @IsOptional()
  @IsEnum(CompanyRole)
  role?: CompanyRole;

  @ApiPropertyOptional({
    example: 28.5,
    description: 'Internal hourly cost rate (EUR), visible to OWNER/ADMIN only',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  hourlyRate?: number;
}
