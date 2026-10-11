import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType, InvoiceKind } from '@prisma/client';
import { IsEnum, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ConvertDocumentDto {
  @ApiProperty({ enum: [DocumentType.ORDER, DocumentType.INVOICE], description: 'Type of the document to create' })
  @IsIn([DocumentType.ORDER, DocumentType.INVOICE])
  targetType!: DocumentType;

  @ApiPropertyOptional({
    enum: InvoiceKind,
    default: InvoiceKind.STANDARD,
    description: 'Invoices only: complete invoice, partial invoice (Abschlag) or final invoice (Schluss)',
  })
  @IsOptional()
  @IsEnum(InvoiceKind)
  invoiceKind?: InvoiceKind;

  @ApiPropertyOptional({ example: 30, description: 'Partial invoice: share of the contract net value in percent' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  percent?: number;

  @ApiPropertyOptional({ example: 5000, description: 'Partial invoice: net amount (alternative to percent)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  netAmount?: number;
}
