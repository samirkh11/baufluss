import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { CompanyStatus } from '@prisma/client';

export class ListCompaniesQueryDto {
  @IsOptional() @IsEnum(CompanyStatus) status?: CompanyStatus;
  @IsOptional() @IsString() q?: string;
}

export class UpdateCompanyDto {
  @IsOptional() @IsEnum(CompanyStatus) status?: CompanyStatus;
  @IsOptional() @IsString() statusReason?: string;
  @IsOptional() @IsDateString() trialEndsAt?: string;
  @IsOptional() @IsString() planId?: string;
  @IsOptional() @IsString() operatorNotes?: string;
}

export class ImpersonateDto {
  @IsOptional() @IsString() userId?: string;
}

export class PlanDto {
  @IsOptional() @Matches(/^[a-z0-9-]{2,30}$/) key?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) priceMonthly?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxUsers?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class RunInvoicesDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month!: string; // billing month, e.g. 2026-10
}

export class PayInvoiceDto {
  @IsOptional() @IsDateString() paidAt?: string;
}

export class UpdatePlatformSettingsDto {
  @IsOptional() @IsString() operatorName?: string;
  @IsOptional() @IsString() street?: string;
  @IsOptional() @IsString() zipCode?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() vatId?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() iban?: string;
  @IsOptional() @IsString() bic?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) trialDays?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(30) vatRate?: number;
  @IsOptional() @IsInt() @Min(0) @Max(120) paymentTermDays?: number;
  @IsOptional() @IsString() defaultPlanKey?: string;
}

export class PagingQueryDto {
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize: number = 50;
}

export class InvoiceListQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() companyId?: string;
}
