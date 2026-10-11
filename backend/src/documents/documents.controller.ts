import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyRole } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { GaebService } from './gaeb/gaeb.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListReceivablesQueryDto } from './dto/list-receivables-query.dto';
import { PaymentsService } from './payments.service';
import { DocumentPdfService } from './document-pdf.service';
import { EInvoiceService, isEInvoiceFormat } from './e-invoice/e-invoice.service';
import { DocumentsService } from './documents.service';
import { ConvertDocumentDto } from './dto/convert-document.dto';
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
    private readonly eInvoiceService: EInvoiceService,
    private readonly gaebService: GaebService,
    private readonly paymentsService: PaymentsService,
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

  // Problems that would block issuing the document (mandatory invoice details); empty = ready.
  @Get('documents/:id/issues')
  issues(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.issues(user.companyId, id);
  }

  @Post('documents/:id/finalize')
  finalize(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.finalize(user.companyId, id);
  }

  @Post('documents/:id/status')
  setStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SetDocumentStatusDto) {
    return this.documentsService.setStatus(user.companyId, id, dto.status);
  }

  // Billing overview of a contract (quote/order): invoices issued so far, billed vs. open amount.
  @Get('documents/:id/billing')
  billing(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.billing(user.companyId, id);
  }

  // Final invoice draft: rebuilds the deduction lines from the partial invoices issued so far.
  @Post('documents/:id/refresh-deductions')
  refreshDeductions(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.refreshDeductions(user.companyId, id);
  }

  // Cancels an issued invoice: creates the credit note (Stornorechnung) as a draft; issuing it
  // marks the invoice as cancelled.
  @Post('documents/:id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.cancel(user.companyId, id);
  }

  // Incoming payment on an issued invoice (or refund on a credit note).
  @Post('documents/:id/payments')
  addPayment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(user, id, dto);
  }

  @Delete('payments/:paymentId')
  removePayment(@CurrentUser() user: AuthenticatedUser, @Param('paymentId') paymentId: string) {
    return this.paymentsService.remove(user.companyId, paymentId);
  }

  // Open items (Offene Posten): unpaid amounts, retentions and refunds, oldest due date first.
  @Get('receivables')
  receivables(@CurrentUser() user: AuthenticatedUser, @Query() query: ListReceivablesQueryDto) {
    return this.paymentsService.receivables(user.companyId, query);
  }

  @Post('documents/:id/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.duplicate(user.companyId, id);
  }

  // Creates the next document of the chain (quote -> order -> invoice) as a draft.
  @Post('documents/:id/convert')
  convert(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ConvertDocumentDto) {
    return this.documentsService.convert(user.companyId, id, dto);
  }

  @Get('documents/:id/pdf')
  async pdf(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.pdfService.render(user.companyId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }

  // E-invoice (EN16931) of an issued invoice or credit note: xrechnung-ubl | xrechnung-cii | zugferd.
  @Get('documents/:id/e-invoice')
  async eInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    if (!isEInvoiceFormat(format)) {
      throw new BadRequestException('Format: xrechnung-ubl, xrechnung-cii oder zugferd.');
    }
    const { buffer, filename, mimeType } = await this.eInvoiceService.generate(user.companyId, id, format);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // GAEB import: uploads a bill of quantities (GAEB DA XML) and creates a quote draft from it.
  // The file is processed in memory and not stored.
  @Post('projects/:projectId/documents/import-gaeb')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        const ok = /\.(x8[0-9]|x3[0-9]|xml|gaeb)$/i.test(file.originalname);
        callback(ok ? null : new BadRequestException('Bitte eine GAEB-DA-XML-Datei (.x83, .x84, .x86, .xml) wählen.'), ok);
      },
    }),
  )
  importGaeb(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Keine Datei empfangen.');
    }
    return this.gaebService.importAsQuote(user.companyId, projectId, file.buffer);
  }

  // GAEB export of a quote as X84 (Angebotsabgabe, with prices).
  @Get('documents/:id/gaeb')
  async exportGaeb(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const { xml, filename } = await this.gaebService.exportQuote(user.companyId, id);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  }
}
