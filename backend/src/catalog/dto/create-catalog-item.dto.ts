import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CatalogItemKind } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateCatalogItemDto {
  @ApiProperty({ enum: CatalogItemKind })
  @IsEnum(CatalogItemKind)
  kind!: CatalogItemKind;

  @ApiPropertyOptional({ description: 'Article/service number, unique per company' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ example: 'Elektromeister Stunde' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'h', default: 'Stk' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ example: 65, description: 'Net sales price' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  netPrice!: number;

  @ApiPropertyOptional({ description: 'Net purchase price (for margin calculation)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional({ example: 19, default: 19, description: 'VAT rate in percent' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate?: number;
}
