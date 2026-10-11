import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DocumentsModule } from '../documents/documents.module';
import { AuditInterceptor, AuditService } from './audit.service';
import { ComplianceController } from './compliance.controller';
import { CompliancePdfService } from './compliance-pdf.service';
import { DsgvoService } from './dsgvo.service';
import { ExportService } from './export.service';

@Module({
  imports: [DocumentsModule],
  controllers: [ComplianceController],
  providers: [AuditService, CompliancePdfService, DsgvoService, ExportService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuditService],
})
export class ComplianceModule {}
