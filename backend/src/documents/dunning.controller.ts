import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyRole, DunningLevel } from '@prisma/client';
import { Response } from 'express';
import { IsEnum, IsOptional } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreateDunningDto, DunningBlockDto, UpdateDunningSettingsDto } from './dto/dunning.dto';
import { ArchiveService } from './archive.service';
import { DunningPdfService } from './dunning-pdf.service';
import { DunningService } from './dunning.service';

class PreviewQuery {
  @IsOptional()
  @IsEnum(DunningLevel)
  level?: DunningLevel;
}

// Dunning (Mahnwesen) is handled by the office only.
@ApiTags('dunning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(CompanyRole.OWNER, CompanyRole.ADMIN)
@Controller()
export class DunningController {
  constructor(
    private readonly dunningService: DunningService,
    private readonly pdfService: DunningPdfService,
    private readonly archive: ArchiveService,
  ) {}

  @Get('dunning/settings')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.dunningService.getSettings(user.companyId);
  }

  @Put('dunning/settings')
  updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateDunningSettingsDto) {
    return this.dunningService.updateSettings(user.companyId, dto);
  }

  // Overdue invoices that are due for the next letter ("Mahnvorschlag").
  @Get('dunning/proposals')
  proposals(@CurrentUser() user: AuthenticatedUser) {
    return this.dunningService.proposals(user.companyId);
  }

  @Get('documents/:id/dunnings')
  list(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.dunningService.list(user.companyId, id);
  }

  @Get('documents/:id/dunning-preview')
  preview(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() query: PreviewQuery) {
    return this.dunningService.preview(user.companyId, id, query.level);
  }

  @Post('documents/:id/dunnings')
  async create(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateDunningDto) {
    const dunning = await this.dunningService.create(user, id, dto.level);
    await this.archive.archiveDunning(user.companyId, dunning.id);
    return dunning;
  }

  @Patch('documents/:id/dunning-block')
  setBlock(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: DunningBlockDto) {
    return this.dunningService.setBlock(user.companyId, id, dto);
  }

  @Get('dunnings/:id/pdf')
  async pdf(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const archived = await this.archive.readArchived(user.companyId, { dunningId: id, kind: 'DUNNING_PDF' });
    const { buffer, filename } = archived
      ? { buffer: archived.buffer, filename: archived.entry.fileName }
      : await this.pdfService.render(user.companyId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }

  @Delete('dunnings/:id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.dunningService.remove(user.companyId, id);
  }
}
