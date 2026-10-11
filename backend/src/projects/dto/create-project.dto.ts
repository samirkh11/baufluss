import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Dachsanierung MFH Hirschstraße 14' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ enum: ProjectStatus, default: ProjectStatus.PLANNING })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Contact id of the customer' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  siteStreet?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  siteZipCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  siteCity?: string;

  @ApiPropertyOptional({ example: '2026-09-14' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'User id of the project manager' })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({ type: [String], description: 'User ids of the assigned team; replaces the current team' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  memberIds?: string[];
}
