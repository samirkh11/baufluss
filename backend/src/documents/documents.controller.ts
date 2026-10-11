import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyRole } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { DocumentPdfService } from './document-pdf.service';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { SetDocumentStatusDto } from './dto/set-document-status.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

// Business documents (quotes now; orders and invoices later) are handled by the office:
// OWNER and ADMIN only, because they contain prices and customer data.
@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(CompanyRole.OWNER, CompanyRole.ADMIN)
@Controller()
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly pdfService: DocumentPdfService,
  ) {}

  @Get('documents')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListDocumentsQueryDto) {
    return this.documentsService.findAll(user.companyId, query);
  }

  @Get('documents/:id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.findOne(user.companyId, id);
  }

  @Post('projects/:projectId/documents')
  create(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Body() dto: CreateDocumentDto) {
    return this.documentsService.create(user.companyId, projectId, dto);
  }

  @Patch('documents/:id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documentsService.update(user.companyId, id, dto);
  }

  @Delete('documents/:id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.remove(user.companyId, id);
  }

  @Post('documents/:id/finalize')
  finalize(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.finalize(user.companyId, id);
  }

  @Post('documents/:id/status')
  setStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SetDocumentStatusDto) {
    return this.documentsService.setStatus(user.companyId, id, dto.status);
  }

  @Post('documents/:id/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.duplicate(user.companyId, id);
  }

  @Get('documents/:id/pdf')
  async pdf(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.pdfService.render(user.companyId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }
}
