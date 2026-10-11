import { ApiProperty } from '@nestjs/swagger';
import { DocumentStatus } from '@prisma/client';
import { IsIn } from 'class-validator';

// Outcome of a sent quote.
export class SetDocumentStatusDto {
  @ApiProperty({ enum: [DocumentStatus.ACCEPTED, DocumentStatus.REJECTED] })
  @IsIn([DocumentStatus.ACCEPTED, DocumentStatus.REJECTED])
  status!: DocumentStatus;
}
