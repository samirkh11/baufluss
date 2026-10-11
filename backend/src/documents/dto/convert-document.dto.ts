import { ApiProperty } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { IsIn } from 'class-validator';

export class ConvertDocumentDto {
  @ApiProperty({ enum: [DocumentType.ORDER, DocumentType.INVOICE], description: 'Type of the document to create' })
  @IsIn([DocumentType.ORDER, DocumentType.INVOICE])
  targetType!: DocumentType;
}
