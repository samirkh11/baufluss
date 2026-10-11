import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Company, DocumentStatus, DocumentType } from '@prisma/client';
import { Invoice, InvoiceService } from '@e-invoice-eu/core';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DocumentPdfService } from '../document-pdf.service';
import { buildEInvoice, EInvoiceTarget, readinessIssues } from './e-invoice-mapper';

export type EInvoiceFormat = 'xrechnung-ubl' | 'xrechnung-cii' | 'zugferd';

const FORMATS: Record<EInvoiceFormat, { library: string; target: EInvoiceTarget; extension: string; mimeType: string }> = {
  'xrechnung-ubl': { library: 'XRECHNUNG-UBL', target: 'xrechnung', extension: 'xml', mimeType: 'application/xml' },
  'xrechnung-cii': { library: 'XRECHNUNG-CII', target: 'xrechnung', extension: 'xml', mimeType: 'application/xml' },
  zugferd: { library: 'Factur-X-EN16931', target: 'zugferd', extension: 'pdf', mimeType: 'application/pdf' },
};

export const isEInvoiceFormat = (value: string): value is EInvoiceFormat => value in FORMATS;

// Creates e-invoices (EN16931) from issued invoices and credit notes:
//  - XRechnung (UBL or CII XML), mandatory for public bodies
//  - ZUGFeRD / Factur-X (our PDF with the CII XML embedded), for business customers
@Injectable()
export class EInvoiceService {
  private readonly library = new InvoiceService({ log: () => undefined, warn: () => undefined, error: console.error, debug: () => undefined } as never);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: DocumentPdfService,
  ) {}

  async generate(companyId: string, documentId: string, format: EInvoiceFormat) {
    const spec = FORMATS[format];
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
      include: {
        project: { select: { number: true } },
        items: { orderBy: { sortOrder: 'asc' } },
        invoiceDetails: true,
        sourceDocument: { select: { number: true, documentDate: true } },
        recipientContact: { select: { email: true, phone: true, isOrganization: true } },
      },
    });
    if (!document) throw new NotFoundException();
    if (document.type !== DocumentType.INVOICE && document.type !== DocumentType.CREDIT_NOTE) {
      throw new BadRequestException('E-Rechnungen gibt es nur für Rechnungen und Gutschriften.');
    }
    if (document.status === DocumentStatus.DRAFT || !document.issuerSnapshot) {
      throw new BadRequestException('Die E-Rechnung kann erst nach dem Ausstellen erzeugt werden.');
    }
    const issuer = document.issuerSnapshot as unknown as Company;

    const issues = readinessIssues(document, issuer, spec.target);
    if (issues.length > 0) {
      throw new BadRequestException(`E-Rechnung nicht möglich: ${issues.join(' ')}`);
    }
    const { invoice, totals } = buildEInvoice(document, issuer, spec.target);
    if (!totals.gross.abs().equals(document.grossTotal.abs())) {
      throw new BadRequestException('Die Beträge des Belegs sind in sich nicht schlüssig (Summe der Positionen ≠ Gesamtbetrag).');
    }

    const filename = `${document.number}.${spec.extension}`.replace(/[^\w.-]/g, '_');
    try {
      if (spec.target === 'zugferd') {
        const pdf = await this.pdfService.render(companyId, documentId);
        const buffer = await this.library.generate(invoice as unknown as Invoice, {
          format: spec.library,
          lang: 'de-de',
          pdf: { buffer: pdf.buffer, filename: pdf.filename, mimetype: 'application/pdf' },
        });
        return { buffer: Buffer.from(buffer as Uint8Array), filename, mimeType: spec.mimeType };
      }
      const xml = await this.library.generate(invoice as unknown as Invoice, { format: spec.library, lang: 'de-de' });
      return { buffer: Buffer.from(xml as string, 'utf8'), filename, mimeType: spec.mimeType };
    } catch (error) {
      // The library validates against the EN16931 JSON schema and reports what is wrong.
      throw new BadRequestException(`E-Rechnung konnte nicht erzeugt werden: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
