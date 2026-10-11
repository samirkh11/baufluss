import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { DocumentPdfService } from './document-pdf.service';
import { GaebService } from './gaeb/gaeb.service';
import { PaymentsService } from './payments.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [CompaniesModule], // provides NumberSequencesService for document numbers
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentPdfService, GaebService, PaymentsService],
})
export class DocumentsModule {}
