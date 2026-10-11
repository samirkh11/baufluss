import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

// Invoice-only data of a draft invoice (PATCH semantics; send null to clear dates/references).
export class InvoiceDetailsDto {
  @ApiPropertyOptional({ example: '2026-09-14', description: 'Leistungsdatum / start of the service period' })
  @IsOptional()
  @IsDateString()
  serviceDateFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-09', description: 'End of the service period (omit for a single date)' })
  @IsOptional()
  @IsDateString()
  serviceDateTo?: string;

  @ApiPropertyOptional({ example: 14, description: 'Payment term in days after the invoice date' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermDays?: number;

  @ApiPropertyOptional({ description: '§ 13b UStG: the recipient owes the VAT' })
  @IsOptional()
  @IsBoolean()
  reverseCharge?: boolean;

  @ApiPropertyOptional({ example: 5, description: 'Sicherheitseinbehalt in percent of this invoice (gross)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(30)
  retentionPercent?: number;

  @ApiPropertyOptional({ example: '2031-10-12', description: 'When the retention becomes payable (end of the warranty period)' })
  @IsOptional()
  @IsDateString()
  retentionDueDate?: string;

  @ApiPropertyOptional({ description: "Customer's order number" })
  @IsOptional()
  @IsString()
  orderReference?: string;

  @ApiPropertyOptional({ description: 'Leitweg-ID for invoices to public bodies' })
  @IsOptional()
  @IsString()
  buyerReference?: string;
}
