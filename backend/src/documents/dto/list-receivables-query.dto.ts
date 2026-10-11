import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ListReceivablesQueryDto {
  @ApiPropertyOptional({ description: 'Only items past their due date', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  overdueOnly?: boolean;

  @ApiPropertyOptional({ description: 'Only items of this customer (contact id)' })
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
