import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

// documentType is free-form on purpose: the document modules that will consume these sequences
// (Angebote, Aufträge, Rechnungen, ...) don't exist yet, so we don't hard-code an enum here.
export class UpsertNumberSequenceDto {
  @ApiProperty({ example: 'INVOICE' })
  @IsString()
  documentType!: string;

  @ApiPropertyOptional({ example: 'RE-' })
  @IsOptional()
  @IsString()
  prefix?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  nextNumber?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  digits?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  resetYearly?: boolean;
}
