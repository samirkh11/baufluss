import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { IncomingInvoicesModule } from '../incoming-invoices/incoming-invoices.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [DocumentsModule, IncomingInvoicesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
