import { PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';

// PATCH semantics. Send `null` for customerId/managerId/dates/text fields to clear them.
export class UpdateProjectDto extends PartialType(CreateProjectDto) {}
