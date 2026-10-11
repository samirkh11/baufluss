import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ComplianceModule } from '../compliance/compliance.module';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformAuthController, PlatformJwtStrategy } from './platform-auth';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformCompaniesService } from './platform-companies.service';
import { PlatformInvoicePdfService } from './platform-invoice-pdf.service';
import { PlatformOverviewService } from './platform-overview.service';
import { PlatformController } from './platform.controller';

@Module({
  imports: [
    PassportModule,
    ComplianceModule,
    JwtModule.registerAsync({ inject: [ConfigService], useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET') }) }),
  ],
  controllers: [PlatformAuthController, PlatformController],
  providers: [PlatformJwtStrategy, PlatformAuditService, PlatformCompaniesService, PlatformBillingService, PlatformOverviewService, PlatformInvoicePdfService],
})
export class PlatformModule {}
