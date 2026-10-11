import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateDocumentDto } from './create-document.dto';

// PATCH semantics for drafts. `items`, when present, replaces all lines. Send null to clear the
// recipient, dates or texts.
export class UpdateDocumentDto extends PartialType(OmitType(CreateDocumentDto, ['type'] as const)) {}
