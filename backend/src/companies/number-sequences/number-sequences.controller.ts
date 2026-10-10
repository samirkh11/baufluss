import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../auth/types/jwt-payload.type';
import { CompanyRole } from '@prisma/client';
import { NumberSequencesService } from './number-sequences.service';
import { UpsertNumberSequenceDto } from './dto/upsert-number-sequence.dto';

@ApiTags('companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies/me/number-sequences')
export class NumberSequencesController {
  constructor(private readonly numberSequencesService: NumberSequencesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.numberSequencesService.findAll(user.companyId);
  }

  @Put()
  @Roles(CompanyRole.OWNER, CompanyRole.ADMIN)
  upsert(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertNumberSequenceDto) {
    return this.numberSequencesService.upsert(user.companyId, dto);
  }

  @Delete(':documentType')
  @Roles(CompanyRole.OWNER, CompanyRole.ADMIN)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('documentType') documentType: string) {
    return this.numberSequencesService.remove(user.companyId, documentType);
  }
}
