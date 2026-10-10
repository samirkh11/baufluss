import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateContactDto } from './create-contact.dto';

// PATCH semantics: every create field becomes optional; isActive allows archiving a contact.
export class UpdateContactDto extends PartialType(CreateContactDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
