import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, Matches, Max, Min, ValidateNested } from 'class-validator';

// One placed widget in grid units (12 columns). Widgets that are not listed are hidden.
export class DashboardItemDto {
  @ApiProperty({ example: 'open-items' })
  @Matches(/^[a-z0-9-]{1,40}$/)
  id!: string;

  @IsInt() @Min(0) @Max(11)
  x!: number;

  @IsInt() @Min(0) @Max(500)
  y!: number;

  @IsInt() @Min(1) @Max(12)
  w!: number;

  @IsInt() @Min(1) @Max(20)
  h!: number;
}

export class SaveDashboardLayoutDto {
  @ApiProperty({ type: [DashboardItemDto] })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => DashboardItemDto)
  items!: DashboardItemDto[];
}
