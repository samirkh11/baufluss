import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListTimeEntriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-10-05' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-11' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filter by employee (OWNER/ADMIN only; others always see their own entries)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

// Period (+ optional filters) for summaries, exports and approvals.
export class TimePeriodQueryDto {
  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

export class ApproveTimeEntriesDto {
  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-10-31' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ description: 'Only this employee; omit for all employees' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
