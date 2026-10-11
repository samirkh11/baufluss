import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { DEFAULT_FONT, registerEmbeddedFonts } from '../documents/pdf-fonts';
import { PlatformBillingService } from './platform-billing.service';

const eur = (value: { toFixed(digits: number): string }) => `${value.toFixed(2).replace('.', ',')} €`;
const date = (value: Date) => value.toISOString().slice(0, 10).split('-').reverse().join('.');

// PDF of an operator invoice (customer subscription invoice).
@Injectable()
export class PlatformInvoicePdfService {
  constructor(private readonly billing: PlatformBillingService) {}

  async render(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.billing.getInvoice(id);
    const settings = await this.billing.getSettings();
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 56, font: DEFAULT_FONT, info: { Title: `Rechnung ${invoice.number}`, Author: settings.operatorName } });
      registerEmbeddedFonts(doc);
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const sender = [settings.operatorName, settings.street, [settings.zipCode, settings.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
      doc.fontSize(8).fillColor('#666').text(sender, { underline: true });
      doc.moveDown(1.5).fillColor('#000').fontSize(11);
      doc.text(invoice.company.name);
      doc.text(invoice.company.street ?? '');
      doc.text([invoice.company.zipCode, invoice.company.city].filter(Boolean).join(' '));
      doc.moveDown(2).font('Helvetica-Bold').fontSize(16).text(`Rechnung ${invoice.number}`);
      doc.font('Helvetica').fontSize(10).moveDown(0.5);
      doc.text(`Rechnungsdatum: ${date(invoice.issuedAt)}`);
      doc.text(`Leistungszeitraum: ${date(invoice.periodStart)} – ${date(invoice.periodEnd)}`);
      doc.text(`Zahlbar bis: ${date(invoice.dueDate)}`);
      if (invoice.company.vatId) doc.text(`USt-IdNr. Kunde: ${invoice.company.vatId}`);

      doc.moveDown(1.5).font('Helvetica-Bold').text('Beschreibung', 56, doc.y, { continued: false });
      doc.font('Helvetica').moveDown(0.3).text(invoice.description);
      doc.moveDown(1.5);
      const row = (label: string, value: string, bold = false) => {
        const y = doc.y;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, 56, y, { width: 300 });
        doc.text(value, 356, y, { width: 183, align: 'right' });
        doc.moveDown(0.3);
      };
      row('Nettobetrag', eur(invoice.net));
      row(`Umsatzsteuer ${settings.vatRate.toString()} %`, eur(invoice.vat));
      row('Rechnungsbetrag', eur(invoice.gross), true);
      doc.moveDown(2).font('Helvetica').fontSize(9).fillColor('#444');
      doc.text(`Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer auf: ${settings.iban ?? '[IBAN ergänzen]'}${settings.bic ? ` (BIC ${settings.bic})` : ''}.`);
      doc.text([settings.vatId ? `USt-IdNr. ${settings.vatId}` : '', settings.taxId ? `Steuernummer ${settings.taxId}` : ''].filter(Boolean).join(' · '));
      doc.end();
    });
    return { buffer, filename: `${invoice.number}.pdf` };
  }
}
