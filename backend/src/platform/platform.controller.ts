import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentAdmin, PlatformAuthGuard, PlatformUser } from './platform-auth';
import { ImpersonateDto, InvoiceListQueryDto, ListCompaniesQueryDto, PagingQueryDto, PayInvoiceDto, PlanDto, RunInvoicesDto, UpdateCompanyDto, UpdatePlatformSettingsDto } from './dto/platform.dto';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformCompaniesService } from './platform-companies.service';
import { PlatformInvoicePdfService } from './platform-invoice-pdf.service';
import { PlatformOverviewService } from './platform-overview.service';

// Operator back office API (/admin/*). Only platform staff (own token type) may call it.
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(PlatformAuthGuard)
@Controller('admin')
export class PlatformController {
  constructor(
    private readonly companies: PlatformCompaniesService,
    private readonly billing: PlatformBillingService,
    private readonly overview: PlatformOverviewService,
    private readonly audit: PlatformAuditService,
    private readonly invoicePdf: PlatformInvoicePdfService,
  ) {}

  @Get('stats')
  stats() {
    return this.overview.stats();
  }

  @Get('system')
  system() {
    return this.overview.system();
  }

  @Get('audit-log')
  auditLog(@Query() query: PagingQueryDto) {
    return this.audit.list(query);
  }

  // ---- companies
  @Get('companies')
  listCompanies(@Query() query: ListCompaniesQueryDto) {
    return this.companies.list(query);
  }

  @Get('companies/:id')
  company(@Param('id') id: string) {
    return this.companies.detail(id);
  }

  @Patch('companies/:id')
  updateCompany(@CurrentAdmin() admin: PlatformUser, @Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companies.update(admin, id, dto);
  }

  @Post('companies/:id/impersonate')
  @HttpCode(200)
  impersonate(@CurrentAdmin() admin: PlatformUser, @Param('id') id: string, @Body() dto: ImpersonateDto) {
    return this.companies.impersonate(admin, id, dto);
  }

  // ---- plans and settings
  @Get('plans')
  plans() {
    return this.billing.listPlans();
  }

  @Post('plans')
  createPlan(@CurrentAdmin() admin: PlatformUser, @Body() dto: PlanDto) {
    return this.billing.savePlan(admin, null, dto);
  }

  @Patch('plans/:id')
  updatePlan(@CurrentAdmin() admin: PlatformUser, @Param('id') id: string, @Body() dto: PlanDto) {
    return this.billing.savePlan(admin, id, dto);
  }

  @Get('settings')
  settings() {
    return this.billing.getSettings();
  }

  @Put('settings')
  updateSettings(@CurrentAdmin() admin: PlatformUser, @Body() dto: UpdatePlatformSettingsDto) {
    return this.billing.updateSettings(admin, dto);
  }

  // ---- invoices
  @Get('invoices')
  invoices(@Query() query: InvoiceListQueryDto) {
    return this.billing.listInvoices(query);
  }

  @Post('invoices/run')
  @HttpCode(200)
  run(@CurrentAdmin() admin: PlatformUser, @Body() dto: RunInvoicesDto) {
    return this.billing.runInvoices(admin, dto.month);
  }

  @Post('invoices/:id/pay')
  @HttpCode(200)
  pay(@CurrentAdmin() admin: PlatformUser, @Param('id') id: string, @Body() dto: PayInvoiceDto) {
    return this.billing.markPaid(admin, id, dto.paidAt);
  }

  @Post('invoices/:id/void')
  @HttpCode(200)
  void(@CurrentAdmin() admin: PlatformUser, @Param('id') id: string) {
    return this.billing.voidInvoice(admin, id);
  }

  @Get('invoices/:id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.invoicePdf.render(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
