import { ApiPropertyOptional } from '@nestjs/swagger';
import { CatalogItemKind } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListCatalogItemsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CatalogItemKind })
  @IsOptional()
  @IsEnum(CatalogItemKind)
  kind?: CatalogItemKind;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}
