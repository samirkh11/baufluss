import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { IncomingInvoicesController } from './incoming-invoices.controller';
import { IncomingInvoicesService } from './incoming-invoices.service';

@Module({
  imports: [CompaniesModule], // provides NumberSequencesService for the internal ER- numbers
  controllers: [IncomingInvoicesController],
  providers: [IncomingInvoicesService],
})
export class IncomingInvoicesModule {}
