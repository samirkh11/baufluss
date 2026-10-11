import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyRole } from '@prisma/client';
import { Response } from 'express';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../common/prisma/prisma.service';
import { ArchiveService } from '../documents/archive.service';
import { AuditService } from './audit.service';
import { CompliancePdfService } from './compliance-pdf.service';
import { AuditQueryDto, PeriodQueryDto, UpdateComplianceSettingsDto } from './dto/compliance.dto';
import { DsgvoService } from './dsgvo.service';
import { ExportService } from './export.service';

// GoBD / DSGVO / tax audit functions. Inhaber and Administratoren only.
@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(CompanyRole.OWNER, CompanyRole.ADMIN)
@Controller('compliance')
export class ComplianceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly archive: ArchiveService,
    private readonly pdf: CompliancePdfService,
    private readonly exports: ExportService,
    private readonly dsgvo: DsgvoService,
  ) {}

  @Get('settings')
  async settings(@CurrentUser() user: AuthenticatedUser) {
    return (await this.prisma.complianceSettings.findUnique({ where: { companyId: user.companyId } })) ?? (await this.prisma.complianceSettings.create({ data: { companyId: user.companyId } }));
  }

  @Put('settings')
  updateSettings(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateComplianceSettingsDto) {
    return this.prisma.complianceSettings.upsert({ where: { companyId: user.companyId }, create: { companyId: user.companyId, ...dto }, update: dto });
  }

  @Get('audit-log')
  auditLog(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditQueryDto) {
    return this.audit.list(user.companyId, query);
  }

  // Recomputes all checksums of the archive and the stored originals.
  @Get('archive/verify')
  async verify(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.archive.verify(user.companyId);
    await this.audit.log(user, { method: 'GET', route: '/compliance/archive/verify', entityType: 'compliance', entityLabel: result.ok ? 'Archivprüfung ok' : 'Archivprüfung mit Befunden' });
    return result;
  }

  // Archives issued documents that have no archive copy yet (older data).
  @Post('archive/complete')
  @HttpCode(200)
  async complete(@CurrentUser() user: AuthenticatedUser) {
    return { archived: await this.archive.archiveMissing(user.companyId) };
  }

  @Get('procedure-documentation')
  async procedure(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    send(res, await this.pdf.procedureDocumentation(user.companyId), 'Verfahrensdokumentation.pdf', 'application/pdf');
  }

  @Get('privacy-documentation')
  async privacy(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    send(res, await this.pdf.privacyDocumentation(user.companyId), 'Datenschutz_VVT_TOM.pdf', 'application/pdf');
  }

  @Get('export/tax-audit')
  async taxAudit(@CurrentUser() user: AuthenticatedUser, @Query() query: PeriodQueryDto, @Res() res: Response) {
    const file = await this.exports.taxAuditZip(user.companyId, query.from, query.to);
    await this.audit.log(user, { method: 'GET', route: '/compliance/export/tax-audit', entityType: 'compliance', entityLabel: `Betriebsprüfung ${query.from} – ${query.to}` });
    send(res, file.buffer, file.filename, 'application/zip');
  }

  @Get('export/datev')
  async datev(@CurrentUser() user: AuthenticatedUser, @Query() query: PeriodQueryDto, @Res() res: Response) {
    const file = await this.exports.datev(user.companyId, query.from, query.to);
    await this.audit.log(user, { method: 'GET', route: '/compliance/export/datev', entityType: 'compliance', entityLabel: `DATEV ${query.from} – ${query.to}` });
    send(res, file.buffer, file.filename, 'text/csv; charset=windows-1252');
  }

  // ---- DSGVO
  @Get('contacts/:id/export')
  async contactExport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const data = await this.dsgvo.contactExport(user.companyId, id);
    await this.audit.log(user, { method: 'GET', route: '/compliance/contacts/:id/export', entityType: 'contacts', entityId: id, entityLabel: 'Datenauskunft' });
    return data;
  }

  @Get('contacts/:id/erasure')
  erasureInfo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.dsgvo.erasureInfo(user.companyId, id);
  }

  @Post('contacts/:id/erase')
  @HttpCode(200)
  async erase(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const result = await this.dsgvo.erase(user.companyId, id);
    await this.audit.log(user, { method: 'POST', route: '/compliance/contacts/:id/erase', entityType: 'contacts', entityId: id, entityLabel: `DSGVO-Löschung: ${result.result}` });
    return result;
  }

  @Get('users/:id/export')
  async userExport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const data = await this.dsgvo.userExport(user.companyId, id);
    await this.audit.log(user, { method: 'GET', route: '/compliance/users/:id/export', entityType: 'users', entityId: id, entityLabel: 'Datenauskunft Mitarbeiter' });
    return data;
  }
}

function send(res: Response, buffer: Buffer, filename: string, contentType: string) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}
