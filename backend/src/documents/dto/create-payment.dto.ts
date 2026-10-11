import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentTarget } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ example: '2026-10-09', description: 'Date the money was received (not in the future)' })
  @IsDateString()
  paidAt!: string;

  @ApiProperty({ example: 5000, description: 'Positive amount (EUR)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.BANK_TRANSFER })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ enum: PaymentTarget, default: PaymentTarget.INVOICE, description: 'RETENTION settles the Sicherheitseinbehalt' })
  @IsOptional()
  @IsEnum(PaymentTarget)
  target?: PaymentTarget;

  @ApiPropertyOptional({ example: 'RE-00004 Hirschstraße' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
