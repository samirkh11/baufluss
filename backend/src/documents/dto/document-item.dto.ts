import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentItemKind } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

// One line of a document as sent by the editor. The list of items is always sent as a whole and
// replaces the existing lines (position = array order).
export class DocumentItemDto {
  @ApiPropertyOptional({ enum: DocumentItemKind, default: DocumentItemKind.POSITION })
  @IsOptional()
  @IsEnum(DocumentItemKind)
  kind?: DocumentItemKind;

  @ApiPropertyOptional({ description: 'Catalog entry the values were copied from (reference only)' })
  @IsOptional()
  @IsUUID()
  catalogItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ example: 'Neueindeckung Tonziegel inkl. Lattung' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 320 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ example: 'm²' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: 95, description: 'Net unit price' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  unitPrice?: number;

  @ApiPropertyOptional({ example: 19 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Alternative/optional position, excluded from the totals' })
  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;
}
