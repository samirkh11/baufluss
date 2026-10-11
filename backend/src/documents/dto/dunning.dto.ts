import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DunningLevel } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateDunningDto {
  @ApiPropertyOptional({ enum: DunningLevel, description: 'Defaults to the next level after the last letter' })
  @IsOptional()
  @IsEnum(DunningLevel)
  level?: DunningLevel;
}

export class DunningBlockDto {
  @ApiProperty({ description: 'Mahnsperre on/off' })
  @IsBoolean()
  blocked!: boolean;

  @ApiPropertyOptional({ description: 'Why dunning is paused (dispute, payment arrangement, ...)' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateDunningSettingsDto {
  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  reminderAfterDays?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  graceDays?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  feeFirst?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  feeSecond?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  feeFinal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  interestEnabled?: boolean;

  @ApiPropertyOptional({ example: 1.27, description: 'Current Basiszinssatz of the Bundesbank in percent' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(-5)
  @Max(20)
  baseRatePercent?: number;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lumpSumB2B?: number;
}
