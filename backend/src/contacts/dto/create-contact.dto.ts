import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContactType } from '@prisma/client';
import { ArrayNotEmpty, IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateContactDto {
  @ApiProperty({ enum: ContactType, isArray: true, example: [ContactType.CUSTOMER] })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ContactType, { each: true })
  types!: ContactType[];

  @ApiPropertyOptional({ description: 'Own customer/supplier number, unique per company' })
  @IsOptional()
  @IsString()
  number?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isOrganization?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salutation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vatId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bic?: string;

  @ApiPropertyOptional({ description: 'Default payment term in days' })
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
