import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateComplianceSettingsDto {
  @IsOptional() @IsString() responsiblePerson?: string;
  @IsOptional() @IsString() hostingDescription?: string;
  @IsOptional() @IsString() backupDescription?: string;
  @IsOptional() @IsInt() @Min(1) @Max(30) retentionYearsInvoices?: number;
  @IsOptional() @IsInt() @Min(1) @Max(30) retentionYearsOther?: number;
  @IsOptional() @IsInt() @Min(1) @Max(9999999) datevAdvisorNumber?: number;
  @IsOptional() @IsInt() @Min(1) @Max(99999) datevClientNumber?: number;
  @IsOptional() @IsInt() @Min(1) @Max(99999999) accountRevenue19?: number;
  @IsOptional() @IsInt() @Min(1) @Max(99999999) accountRevenue7?: number;
  @IsOptional() @IsInt() @Min(1) @Max(99999999) accountRevenueExempt?: number;
  @IsOptional() @IsInt() @Min(1) @Max(99999999) accountExpense19?: number;
  @IsOptional() @IsInt() @Min(1) @Max(99999999) accountExpense7?: number;
  @IsOptional() @IsInt() @Min(1) @Max(99999999) accountExpenseNoVat?: number;
  @IsOptional() @IsInt() @Min(1) @Max(99999999) accountBank?: number;
  @IsOptional() @IsInt() @Min(1) @Max(99999999) accountDebtorBase?: number;
  @IsOptional() @IsInt() @Min(1) @Max(99999999) accountCreditorBase?: number;
}

export class PeriodQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsDateString()
  from!: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsDateString()
  to!: string;
}

export class AuditQueryDto {
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize: number = 50;
}
