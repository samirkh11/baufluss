import { Injectable, NotFoundException } from '@nestjs/common';
import { Company, DocumentItemKind, DocumentStatus, DocumentType } from '@prisma/client';
import { readFile } from 'fs/promises';
import { extname, resolve, sep } from 'path';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { PrismaService } from '../common/prisma/prisma.service';
import { UPLOAD_ROOT } from '../common/storage/uploads';
import { buildOrdinals, calculateTotals } from './calculations';

// A4 layout in points (1 pt = 1/72 inch).
const PAGE = { width: 595.28, height: 841.89, left: 56, right: 56, top: 50, bottom: 96 };
const CONTENT_WIDTH = PAGE.width - PAGE.left - PAGE.right;
const COLORS = { text: '#222222', muted: '#666666', line: '#bbbbbb', band: '#eeeeee', accent: '#7b241c' };

// Table columns (sum = CONTENT_WIDTH).
const COLUMNS = { ordinal: 36, name: 229, quantity: 52, unit: 38, price: 62, total: 66 };

const TITLES: Record<DocumentType, string> = {
  QUOTE: 'Angebot',
  ORDER: 'Auftragsbestätigung',
  INVOICE: 'Rechnung',
  CREDIT_NOTE: 'Gutschrift',
};

// Short names for the reference line (the column is narrow).
const SHORT_TITLES: Record<DocumentType, string> = { QUOTE: 'Angebot', ORDER: 'Auftrag', INVOICE: 'Rechnung', CREDIT_NOTE: 'Gutschrift' };

// Label of the number field in the reference block (the full title would not fit).
const NUMBER_LABELS: Record<DocumentType, string> = {
  QUOTE: 'Angebots-Nr.:',
  ORDER: 'Auftrags-Nr.:',
  INVOICE: 'Rechnungs-Nr.:',
  CREDIT_NOTE: 'Gutschrift-Nr.:',
};

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const quantityFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
const formatDate = (date: Date | null) =>
  date ? date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '';

@Injectable()
export class DocumentPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async render(companyId: string, documentId: string): Promise<{ buffer: Buffer; filename: string }> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
      include: {
        project: true,
        items: { orderBy: { sortOrder: 'asc' } },
        sourceDocument: { select: { type: true, number: true } },
        invoiceDetails: true,
        recipientContact: { select: { number: true, isOrganization: true } },
      },
    });
    if (!document) {
      throw new NotFoundException();
    }
    const liveCompany = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    // Issued documents are printed with the sender data frozen at issue time (GoBD); drafts use the
    // current company profile.
    const company = (document.issuerSnapshot as unknown as Company | null) ?? liveCompany;

    const pdf = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.left, right: PAGE.right },
      bufferPages: true,
      info: { Title: `${TITLES[document.type]} ${document.number ?? '(Entwurf)'}`, Author: company.name },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolveBuffer) => pdf.on('end', () => resolveBuffer(Buffer.concat(chunks))));

    const isDraft = document.status === DocumentStatus.DRAFT;
    const title = `${TITLES[document.type]} ${document.number ?? '(Entwurf)'}`;

    await this.drawLetterhead(pdf, company);

    // Sender line above the recipient window + recipient address.
    pdf.font('Helvetica').fontSize(7).fillColor(COLORS.muted);
    pdf.text([company.name, company.street, [company.zipCode, company.city].filter(Boolean).join(' ')].filter(Boolean).join(' · '), PAGE.left, 150, { width: 250, underline: true });
    pdf.font('Helvetica').fontSize(10).fillColor(COLORS.text);
    pdf.text(
      [document.recipientName, document.recipientStreet, [document.recipientZipCode, document.recipientCity].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join('\n'),
      PAGE.left,
      165,
      { width: 250 },
    );

    // Reference block on the right.
    const invoice = document.type === DocumentType.INVOICE ? document.invoiceDetails : null;
    const servicePeriod = invoice?.serviceDateFrom
      ? invoice.serviceDateTo && invoice.serviceDateTo.getTime() !== invoice.serviceDateFrom.getTime()
        ? `${formatDate(invoice.serviceDateFrom)} –\n${formatDate(invoice.serviceDateTo)}`
        : formatDate(invoice.serviceDateFrom)
      : null;
    const info: [string, string][] = [
      [NUMBER_LABELS[document.type], document.number ?? 'Entwurf'],
      ['Datum:', formatDate(document.documentDate)],
      ...(servicePeriod ? ([['Leistung:', servicePeriod]] as [string, string][]) : []),
      ...(invoice?.dueDate ? ([['Fällig am:', formatDate(invoice.dueDate)]] as [string, string][]) : []),
      ...(document.validUntil ? ([['Gültig bis:', formatDate(document.validUntil)]] as [string, string][]) : []),
      ['Projekt:', `${document.project.number}`],
      ...(document.recipientContact?.number ? ([['Kunden-Nr.:', document.recipientContact.number]] as [string, string][]) : []),
      ...(invoice?.orderReference ? ([['Ihre Bestell-Nr.:', invoice.orderReference]] as [string, string][]) : []),
      ...(invoice?.buyerReference ? ([['Leitweg-ID:', invoice.buyerReference]] as [string, string][]) : []),
      ...(document.sourceDocument?.number
        ? ([['Bezug:', `${SHORT_TITLES[document.sourceDocument.type]} ${document.sourceDocument.number}`]] as [string, string][])
        : []),
    ];
    let infoY = 150;
    pdf.font('Helvetica').fontSize(9);
    for (const [label, value] of info) {
      const rowHeight = Math.max(14, pdf.heightOfString(value, { width: 100 }) + 3);
      pdf.fillColor(COLORS.muted).text(label, 370, infoY, { width: 65 });
      pdf.fillColor(COLORS.text).text(value, 437, infoY, { width: 100 });
      infoY += rowHeight;
    }

    // Many reference lines (invoices) push the title down.
    pdf.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.accent).text(title, PAGE.left, Math.max(260, infoY + 12), { width: CONTENT_WIDTH });
    pdf.moveDown(0.4);
    if (document.subject) {
      pdf.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.text).text(document.subject, { width: CONTENT_WIDTH });
    }
    if (document.introText) {
      pdf.moveDown(0.5).font('Helvetica').fontSize(10).fillColor(COLORS.text).text(document.introText, { width: CONTENT_WIDTH });
    }
    pdf.moveDown(1);

    this.drawItems(pdf, document.items);
    this.drawTotals(pdf, document.items);

    if (document.type === DocumentType.INVOICE) {
      this.drawInvoiceNotes(pdf, document, company);
    }

    // Reserve exactly the space the closing block needs, so it only moves to a new page when it
    // really doesn't fit.
    const hasValidity = document.type === DocumentType.QUOTE && !!document.validUntil;
    pdf.font('Helvetica').fontSize(10);
    const closingHeight = document.closingText ? pdf.heightOfString(document.closingText, { width: CONTENT_WIDTH }) + 18 : 0;
    this.ensureSpace(pdf, closingHeight + (hasValidity ? 24 : 0));
    if (document.closingText) {
      pdf.moveDown(1.2).fillColor(COLORS.text).text(document.closingText, PAGE.left, undefined, { width: CONTENT_WIDTH });
    }
    if (hasValidity) {
      pdf.moveDown(0.6).fontSize(9).fillColor(COLORS.muted).text(`Dieses Angebot ist gültig bis ${formatDate(document.validUntil)}.`, PAGE.left, undefined, { width: CONTENT_WIDTH });
    }

    this.decoratePages(pdf, company, isDraft);
    pdf.end();

    const safeNumber = (document.number ?? 'Entwurf').replace(/[^A-Za-z0-9_-]/g, '_');
    return { buffer: await finished, filename: `${TITLES[document.type]}_${safeNumber}.pdf` };
  }

  // Legally required notes and payment information below the totals of an invoice.
  private drawInvoiceNotes(
    pdf: PDFKit.PDFDocument,
    document: { documentDate: Date; number: string | null; invoiceDetails: { paymentTermDays: number; dueDate: Date | null; reverseCharge: boolean; recipientVatId: string | null } | null; recipientContact: { isOrganization: boolean } | null },
    company: Company,
  ) {
    const details = document.invoiceDetails;
    const lines: { text: string; bold?: boolean }[] = [];

    if (details?.reverseCharge) {
      lines.push({
        text: 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG): Die Umsatzsteuer ist vom Leistungsempfänger zu entrichten.',
        bold: true,
      });
      if (details.recipientVatId) {
        lines.push({ text: `USt-IdNr. des Leistungsempfängers: ${details.recipientVatId}` });
      }
    }

    const termDays = details?.paymentTermDays ?? 14;
    const due = details?.dueDate ?? new Date(document.documentDate.getTime() + termDays * 24 * 60 * 60 * 1000);
    lines.push({ text: `Zahlungsbedingungen: Zahlbar innerhalb von ${termDays} Tagen ohne Abzug, fällig am ${formatDate(due)}.` });
    if (company.iban) {
      const bank = [`IBAN ${company.iban}`, company.bic ? `BIC ${company.bic}` : null].filter(Boolean).join(', ');
      lines.push({ text: `Bitte überweisen Sie auf: ${bank}. Verwendungszweck: Rechnung ${document.number ?? ''}`.trim() });
    }

    // Private customers must be told about their retention duty for construction services (§ 14b UStG).
    if (document.recipientContact && !document.recipientContact.isOrganization) {
      lines.push({
        text: 'Hinweis: Sie sind als Privatperson verpflichtet, diese Rechnung zwei Jahre lang aufzubewahren (§ 14b Abs. 1 UStG).',
      });
    }

    pdf.fontSize(9);
    const height = lines.reduce((sum, line) => sum + pdf.heightOfString(line.text, { width: CONTENT_WIDTH }) + 4, 0);
    this.ensureSpace(pdf, height + 16);
    pdf.moveDown(1);
    for (const line of lines) {
      pdf.font(line.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(COLORS.text).text(line.text, PAGE.left, undefined, { width: CONTENT_WIDTH });
      pdf.moveDown(0.3);
    }
  }

  // Logo (PNG/JPG via pdfkit, SVG via svg-to-pdfkit) top left, company contact block top right.
  private async drawLetterhead(pdf: PDFKit.PDFDocument, company: Company) {
    if (company.logoPath?.startsWith('/uploads/')) {
      const file = resolve(UPLOAD_ROOT, company.logoPath.slice('/uploads/'.length));
      if (file.startsWith(UPLOAD_ROOT + sep)) {
        try {
          const data = await readFile(file);
          if (extname(file).toLowerCase() === '.svg') {
            SVGtoPDF(pdf, data.toString('utf8'), PAGE.left, PAGE.top, { width: 190, height: 60, preserveAspectRatio: 'xMinYMin meet' });
          } else {
            pdf.image(data, PAGE.left, PAGE.top, { fit: [190, 60] });
          }
        } catch {
          // A missing/unreadable logo must not prevent the PDF from being created.
        }
      }
    }
    pdf.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
    const contact = [company.phone && `Tel. ${company.phone}`, company.email, company.website].filter(Boolean).join('\n');
    pdf.text(contact, 370, PAGE.top + 4, { width: PAGE.width - PAGE.right - 370, align: 'right' });
  }

  private ensureSpace(pdf: PDFKit.PDFDocument, needed: number): boolean {
    if (pdf.y + needed > PAGE.height - PAGE.bottom) {
      pdf.addPage();
      return true;
    }
    return false;
  }

  private drawTableHeader(pdf: PDFKit.PDFDocument) {
    const y = pdf.y;
    pdf.rect(PAGE.left, y, CONTENT_WIDTH, 16).fill(COLORS.band);
    pdf.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(8);
    const x = this.columnXs();
    pdf.text('Pos.', x.ordinal, y + 4, { width: COLUMNS.ordinal });
    pdf.text('Bezeichnung', x.name, y + 4, { width: COLUMNS.name });
    pdf.text('Menge', x.quantity, y + 4, { width: COLUMNS.quantity, align: 'right' });
    pdf.text('Einheit', x.unit + 6, y + 4, { width: COLUMNS.unit - 6 });
    pdf.text('Einzelpreis', x.price, y + 4, { width: COLUMNS.price, align: 'right' });
    pdf.text('Gesamt', x.total, y + 4, { width: COLUMNS.total, align: 'right' });
    pdf.y = y + 20;
  }

  private columnXs() {
    const ordinal = PAGE.left;
    const name = ordinal + COLUMNS.ordinal;
    const quantity = name + COLUMNS.name;
    const unit = quantity + COLUMNS.quantity;
    const price = unit + COLUMNS.unit;
    const total = price + COLUMNS.price;
    return { ordinal, name, quantity, unit, price, total };
  }

  private drawItems(pdf: PDFKit.PDFDocument, items: Awaited<ReturnType<PrismaService['documentItem']['findMany']>>) {
    const ordinals = buildOrdinals(items.map((item) => item.kind));
    const x = this.columnXs();
    this.ensureSpace(pdf, 60);
    this.drawTableHeader(pdf);

    items.forEach((item, index) => {
      const ordinal = ordinals[index] ?? '';
      const description = item.description ?? '';
      const label = item.name + (item.isOptional && item.kind === DocumentItemKind.POSITION ? ' (optional)' : '');

      // Row height from the texts, so we can break the page before drawing instead of mid-row.
      pdf.font(item.kind === DocumentItemKind.HEADING ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      const nameWidth = item.kind === DocumentItemKind.POSITION ? COLUMNS.name : COLUMNS.name + COLUMNS.quantity + COLUMNS.unit + COLUMNS.price + COLUMNS.total;
      const nameHeight = pdf.heightOfString(label, { width: nameWidth });
      pdf.font('Helvetica').fontSize(8);
      const descriptionHeight = description ? pdf.heightOfString(description, { width: nameWidth }) + 2 : 0;
      const rowHeight = nameHeight + descriptionHeight + 8;

      if (this.ensureSpace(pdf, rowHeight)) {
        this.drawTableHeader(pdf);
      }
      const y = pdf.y;

      if (item.kind === DocumentItemKind.HEADING) {
        pdf.rect(PAGE.left, y - 2, CONTENT_WIDTH, nameHeight + 6).fill('#f6f1f0');
        pdf.fillColor(COLORS.accent).font('Helvetica-Bold').fontSize(9);
        pdf.text(ordinal, x.ordinal + 2, y + 1, { width: COLUMNS.ordinal });
        pdf.text(item.name, x.name, y + 1, { width: nameWidth });
      } else if (item.kind === DocumentItemKind.TEXT) {
        pdf.fillColor(COLORS.text).font('Helvetica-Oblique').fontSize(9).text(item.name, x.name, y + 1, { width: nameWidth });
      } else {
        pdf.fillColor(item.isOptional ? COLORS.muted : COLORS.text).font('Helvetica').fontSize(9);
        pdf.text(ordinal, x.ordinal + 2, y + 1, { width: COLUMNS.ordinal });
        pdf.text(label, x.name, y + 1, { width: COLUMNS.name });
        pdf.text(quantityFormat.format(item.quantity.toNumber()), x.quantity, y + 1, { width: COLUMNS.quantity, align: 'right' });
        pdf.text(item.unit, x.unit + 6, y + 1, { width: COLUMNS.unit - 6 });
        pdf.text(money.format(item.unitPrice.toNumber()), x.price, y + 1, { width: COLUMNS.price, align: 'right' });
        const discount = item.discountPercent.toNumber();
        pdf.text(item.isOptional ? '—' : money.format(item.lineTotal.toNumber()), x.total, y + 1, { width: COLUMNS.total, align: 'right' });
        if (discount > 0) {
          pdf.fontSize(7).fillColor(COLORS.muted).text(`abzgl. ${quantityFormat.format(discount)} % Rabatt`, x.price - 20, y + 11, { width: COLUMNS.price + COLUMNS.total + 20, align: 'right' });
        }
      }
      if (description) {
        pdf.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(description, x.name, y + nameHeight + 2, { width: nameWidth });
      }
      pdf.y = y + rowHeight;
      pdf.moveTo(PAGE.left, pdf.y - 3).lineTo(PAGE.width - PAGE.right, pdf.y - 3).lineWidth(0.3).strokeColor(COLORS.line).stroke();
    });
  }

  private drawTotals(pdf: PDFKit.PDFDocument, items: Awaited<ReturnType<PrismaService['documentItem']['findMany']>>) {
    const totals = calculateTotals(items);
    this.ensureSpace(pdf, 30 + (totals.vatGroups.length + 2) * 15);
    pdf.moveDown(0.8);

    const labelX = 330;
    const labelWidth = 130;
    const valueX = labelX + labelWidth;
    const valueWidth = PAGE.width - PAGE.right - valueX;
    const row = (label: string, value: string, bold = false) => {
      const y = pdf.y;
      pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5).fillColor(COLORS.text);
      pdf.text(label, labelX, y, { width: labelWidth });
      pdf.text(value, valueX, y, { width: valueWidth, align: 'right' });
      pdf.y = y + (bold ? 17 : 14);
    };

    row('Nettosumme', money.format(totals.net.toNumber()));
    for (const group of totals.vatGroups) {
      row(`zzgl. ${quantityFormat.format(group.vatRate.toNumber())} % USt`, money.format(group.vat.toNumber()));
    }
    pdf.moveTo(labelX, pdf.y).lineTo(PAGE.width - PAGE.right, pdf.y).lineWidth(0.8).strokeColor(COLORS.text).stroke();
    pdf.y += 4;
    row('Gesamtsumme', money.format(totals.gross.toNumber()), true);
  }

  // Footer, page numbers and the draft watermark on every page (needs bufferPages).
  private decoratePages(pdf: PDFKit.PDFDocument, company: Company, isDraft: boolean) {
    const range = pdf.bufferedPageRange();
    for (let index = 0; index < range.count; index++) {
      pdf.switchToPage(range.start + index);
      // Writing inside the bottom margin would otherwise trigger an automatic page break.
      const bottomMargin = pdf.page.margins.bottom;
      pdf.page.margins.bottom = 0;

      const footerY = PAGE.height - PAGE.bottom + 25;
      pdf.moveTo(PAGE.left, footerY - 6).lineTo(PAGE.width - PAGE.right, footerY - 6).lineWidth(0.3).strokeColor(COLORS.line).stroke();
      const bank = [company.iban && `IBAN ${company.iban}`, company.bic && `BIC ${company.bic}`, company.vatId && `USt-IdNr. ${company.vatId}`, company.taxId && `Steuernr. ${company.taxId}`].filter(Boolean).join('  ·  ');
      pdf.font('Helvetica').fontSize(7).fillColor(COLORS.muted);
      pdf.text([company.letterheadFooterText, bank].filter(Boolean).join('\n'), PAGE.left, footerY, { width: CONTENT_WIDTH - 60 });
      pdf.text(`Seite ${index + 1} von ${range.count}`, PAGE.width - PAGE.right - 60, footerY, { width: 60, align: 'right' });

      if (isDraft) {
        pdf.save();
        pdf.rotate(-35, { origin: [PAGE.width / 2, PAGE.height / 2] });
        pdf.font('Helvetica-Bold').fontSize(90).fillColor('#cc0000').fillOpacity(0.12);
        pdf.text('ENTWURF', 0, PAGE.height / 2 - 45, { width: PAGE.width, align: 'center', lineBreak: false });
        pdf.restore();
      }
      pdf.page.margins.bottom = bottomMargin;
    }
  }
}
