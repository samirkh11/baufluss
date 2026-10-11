import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportType } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateReportDto {
  @ApiPropertyOptional({ enum: ReportType, default: ReportType.DAILY })
  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;

  @ApiProperty({ example: 'Tagesbericht 12.10.' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ example: '2026-10-12' })
  @IsDateString()
  reportDate!: string;

  @ApiPropertyOptional({ example: 'bewölkt, 11 °C' })
  @IsOptional()
  @IsString()
  weather?: string;

  @ApiPropertyOptional({ description: 'Durchgeführte Arbeiten' })
  @IsOptional()
  @IsString()
  workPerformed?: string;

  @ApiPropertyOptional({ description: 'Besonderheiten, Mängel, Behinderungen' })
  @IsOptional()
  @IsString()
  issues?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;
}
