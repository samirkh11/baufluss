import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

// Manual entry: either a time range (startTime + endTime, optional break) or just a duration.
export class CreateTimeEntryDto {
  @ApiPropertyOptional({ description: 'Employee (OWNER/ADMIN only); defaults to the caller' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Project; omit for internal time (workshop, office, travel)' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({ example: '2026-10-09' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: '07:00' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:MM' })
  startTime?: string;

  @ApiPropertyOptional({ example: '16:00' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:MM' })
  endTime?: string;

  @ApiPropertyOptional({ example: 60, description: 'Break in minutes (only with a time range)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  breakMinutes?: number;

  @ApiPropertyOptional({ example: 480, description: 'Net duration in minutes, used when there is no time range' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 'Dachlatten montiert' })
  @IsOptional()
  @IsString()
  activity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

// PATCH semantics; send null for projectId/startTime/endTime/activity/note to clear them.
export class UpdateTimeEntryDto extends PartialType(OmitType(CreateTimeEntryDto, ['userId'] as const)) {}

export class StartTimerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  activity?: string;
}

export class StopTimerDto {
  @ApiPropertyOptional({ description: 'Break in minutes to deduct' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  breakMinutes?: number;
}
