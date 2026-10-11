import { ApiPropertyOptional } from '@nestjs/swagger';
import { IncomingInvoiceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

// Captured invoice data. Every field is optional so a freshly uploaded file can be completed step by step.
export class UpdateIncomingInvoiceDto {
  @ApiPropertyOptional({ description: 'Supplier from the contacts; null clears it' })
  @IsOptional()
  @IsUUID()
  supplierId?: string | null;

  @ApiPropertyOptional({ description: 'Free-text supplier if it is not in the contacts' })
  @IsOptional()
  @IsString()
  supplierName?: string;

  @ApiPropertyOptional({ description: "The supplier's own invoice number" })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  serviceDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  netAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  vatAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  grossAmount?: number;

  @ApiPropertyOptional({ description: '§ 13b: no VAT on the invoice, the recipient owes it' })
  @IsOptional()
  @IsBoolean()
  reverseCharge?: boolean;

  @ApiPropertyOptional({ description: 'Project the costs belong to; null clears it' })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}

export class ListIncomingInvoicesQueryDto {
  @ApiPropertyOptional({ enum: IncomingInvoiceStatus })
  @IsOptional()
  @IsEnum(IncomingInvoiceStatus)
  status?: IncomingInvoiceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Free text: supplier, invoice number, internal number' })
  @IsOptional()
  @IsString()
  q?: string;
}

export class RejectIncomingInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class PayIncomingInvoiceDto {
  @ApiPropertyOptional({ description: 'Payment date, defaults to today' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
