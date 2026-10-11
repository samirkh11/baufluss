import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { DocumentItemDto } from './document-item.dto';
import { InvoiceDetailsDto } from './invoice-details.dto';

export class CreateDocumentDto {
  @ApiProperty({ enum: DocumentType, example: DocumentType.QUOTE })
  @IsEnum(DocumentType)
  type!: DocumentType;

  @ApiPropertyOptional({ description: 'Defaults to the project customer' })
  @IsOptional()
  @IsUUID()
  recipientContactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  introText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  closingText?: string;

  @ApiPropertyOptional({ example: '2026-10-12', description: 'Defaults to today' })
  @IsOptional()
  @IsDateString()
  documentDate?: string;

  @ApiPropertyOptional({ description: 'Quotes: valid until (defaults to 30 days after the document date)' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ type: [DocumentItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentItemDto)
  items?: DocumentItemDto[];

  @ApiPropertyOptional({ type: InvoiceDetailsDto, description: 'Invoices only: service date, payment term, § 13b, references' })
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceDetailsDto)
  invoice?: InvoiceDetailsDto;
}
