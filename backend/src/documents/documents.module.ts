import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { DocumentPdfService } from './document-pdf.service';
import { GaebService } from './gaeb/gaeb.service';
import { PaymentsService } from './payments.service';
import { DunningController } from './dunning.controller';
import { DunningPdfService } from './dunning-pdf.service';
import { DunningService } from './dunning.service';
import { EInvoiceService } from './e-invoice/e-invoice.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [CompaniesModule], // provides NumberSequencesService for document numbers
  controllers: [DocumentsController, DunningController],
  providers: [DocumentsService, DocumentPdfService, GaebService, PaymentsService, DunningService, DunningPdfService, EInvoiceService],
  exports: [DocumentsService, PaymentsService, DunningService], // used by the dashboard read models
})
export class DocumentsModule {}
