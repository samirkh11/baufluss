import { Injectable, NotFoundException } from '@nestjs/common';
import { Company, DunningLevel } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { DEFAULT_FONT, registerEmbeddedFonts } from './pdf-fonts';
import { PrismaService } from '../common/prisma/prisma.service';
import { COLORS, CONTENT_WIDTH, DocumentPdfService, PAGE } from './document-pdf.service';

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const percent = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
const formatDate = (date: Date | null | undefined) =>
  date
    ? date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    : '';

const TITLES: Record<DunningLevel, string> = {
  REMINDER: 'Zahlungserinnerung',
  FIRST: '1. Mahnung',
  SECOND: '2. Mahnung',
  FINAL: 'Letzte Mahnung',
};

// Wording per escalation level; `{deadline}` is replaced with the payment deadline.
const BODY: Record<DunningLevel, string> = {
  REMINDER:
    'möglicherweise ist die Zahlung bei Ihnen untergegangen. Wir bitten Sie, den offenen Betrag bis zum {deadline} zu überweisen. Sollten Sie bereits gezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.',
  FIRST:
    'Sie befinden sich mit der Zahlung im Verzug. Wir fordern Sie auf, den nachstehenden Gesamtbetrag bis zum {deadline} zu überweisen.',
  SECOND:
    'trotz unserer bisherigen Schreiben haben wir keinen Zahlungseingang festgestellt. Wir fordern Sie nochmals auf, den nachstehenden Gesamtbetrag bis zum {deadline} zu überweisen.',
  FINAL:
    'dies ist unsere letzte Mahnung. Bitte überweisen Sie den nachstehenden Gesamtbetrag bis zum {deadline}. Andernfalls übergeben wir die Angelegenheit ohne weitere Ankündigung an ein Inkassounternehmen bzw. unseren Rechtsanwalt; die dadurch entstehenden Kosten gehen zu Ihren Lasten.',
};

@Injectable()
export class DunningPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentPdf: DocumentPdfService,
  ) {}

  async render(companyId: string, dunningId: string): Promise<{ buffer: Buffer; filename: string }> {
    const dunning = await this.prisma.dunning.findFirst({
      where: { id: dunningId, companyId },
      include: {
        document: { include: { recipientContact: { select: { number: true } }, invoiceDetails: true } },
      },
    });
    if (!dunning) {
      throw new NotFoundException();
    }
    const invoice = dunning.document;
    const history = await this.prisma.dunning.findMany({
      where: { documentId: invoice.id, createdAt: { lt: dunning.createdAt } },
      orderBy: { createdAt: 'asc' },
    });
    // Sender data as it was when the letter was issued.
    const company = dunning.issuerSnapshot as unknown as Company;

    const pdf = new PDFDocument({
      font: DEFAULT_FONT,
      size: 'A4',
      margins: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.left, right: PAGE.right },
      bufferPages: true,
      info: { Title: `${TITLES[dunning.level]} ${invoice.number ?? ''}`, Author: company.name },
    });
    registerEmbeddedFonts(pdf);
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolveBuffer) =>
      pdf.on('end', () => resolveBuffer(Buffer.concat(chunks))),
    );

    await this.documentPdf.drawLetterhead(pdf, company);

    // Sender line, recipient and reference block.
    pdf.font('Helvetica').fontSize(7).fillColor(COLORS.muted);
    pdf.text(
      [company.name, company.street, [company.zipCode, company.city].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(' · '),
      PAGE.left,
      150,
      { width: 250, underline: true },
    );
    pdf.font('Helvetica').fontSize(10).fillColor(COLORS.text);
    pdf.text(
      [
        invoice.recipientName,
        invoice.recipientStreet,
        [invoice.recipientZipCode, invoice.recipientCity].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join('\n'),
      PAGE.left,
      165,
      { width: 250 },
    );
    const info: [string, string][] = [
      ['Datum:', formatDate(dunning.dunningDate)],
      ['Rechnung:', invoice.number ?? ''],
      ['Rechnungsdatum:', formatDate(invoice.documentDate)],
      ['Fällig seit:', formatDate(invoice.invoiceDetails?.dueDate)],
      ...(invoice.recipientContact?.number
        ? ([['Kunden-Nr.:', invoice.recipientContact.number]] as [string, string][])
        : []),
      ...(dunning.number ? ([['Mahn-Nr.:', dunning.number]] as [string, string][]) : []),
    ];
    let infoY = 150;
    pdf.fontSize(9);
    for (const [label, value] of info) {
      pdf.fillColor(COLORS.muted).text(label, 365, infoY, { width: 80 });
      pdf.fillColor(COLORS.text).text(value, 447, infoY, { width: 100 });
      infoY += 14;
    }

    pdf
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(COLORS.accent)
      .text(TITLES[dunning.level], PAGE.left, Math.max(260, infoY + 12), { width: CONTENT_WIDTH });
    pdf
      .moveDown(0.6)
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(COLORS.text)
      .text(`zu unserer Rechnung ${invoice.number ?? ''} vom ${formatDate(invoice.documentDate)}`, {
        width: CONTENT_WIDTH,
      });
    pdf
      .moveDown(0.8)
      .font('Helvetica')
      .fontSize(10)
      .text(
        `zu der genannten Rechnung (Fälligkeit ${formatDate(invoice.invoiceDetails?.dueDate)}) ist bisher kein vollständiger Zahlungseingang zu verzeichnen. ` +
          BODY[dunning.level].replace('{deadline}', formatDate(dunning.dueDate)),
        { width: CONTENT_WIDTH },
      );
    pdf.moveDown(1);

    // Amount table.
    const rows: [string, string, boolean][] = [
      ['Offener Rechnungsbetrag', money.format(dunning.openAmount.toNumber()), false],
    ];
    if (dunning.interestAmount.gt(0)) {
      rows.push([
        `Verzugszinsen ${percent.format(dunning.interestRate.toNumber())} % p. a. für ${dunning.interestDays} Tage (§ 288 BGB)`,
        money.format(dunning.interestAmount.toNumber()),
        false,
      ]);
    }
    if (dunning.feeAmount.gt(0)) {
      rows.push(['Mahngebühr', money.format(dunning.feeAmount.toNumber()), false]);
    }
    if (dunning.lumpSumAmount.gt(0)) {
      rows.push([
        'Verzugspauschale (§ 288 Abs. 5 BGB)',
        money.format(dunning.lumpSumAmount.toNumber()),
        false,
      ]);
    }
    rows.push([
      `Zu zahlen bis ${formatDate(dunning.dueDate)}`,
      money.format(dunning.totalAmount.toNumber()),
      true,
    ]);

    for (const [label, value, bold] of rows) {
      const y = pdf.y;
      if (bold) {
        pdf
          .moveTo(PAGE.left, y)
          .lineTo(PAGE.width - PAGE.right, y)
          .lineWidth(0.8)
          .strokeColor(COLORS.text)
          .stroke();
      }
      pdf
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? 11 : 10)
        .fillColor(COLORS.text);
      pdf.text(label, PAGE.left, y + (bold ? 5 : 0), { width: 360 });
      pdf.text(value, PAGE.left + 360, y + (bold ? 5 : 0), { width: CONTENT_WIDTH - 360, align: 'right' });
      pdf.y = y + (bold ? 22 : 16);
    }

    pdf.moveDown(1).font('Helvetica').fontSize(10).fillColor(COLORS.text);
    if (company.iban) {
      const bank = [`IBAN ${company.iban}`, company.bic ? `BIC ${company.bic}` : null]
        .filter(Boolean)
        .join(', ');
      pdf.text(
        `Bitte überweisen Sie auf: ${bank}. Verwendungszweck: Rechnung ${invoice.number ?? ''}`,
        PAGE.left,
        undefined,
        { width: CONTENT_WIDTH },
      );
      pdf.moveDown(0.6);
    }
    pdf.text(
      'Zahlungen, die sich mit diesem Schreiben überschneiden, sind berücksichtigt.',
      PAGE.left,
      undefined,
      { width: CONTENT_WIDTH },
    );
    if (history.length > 0) {
      pdf
        .moveDown(0.8)
        .fontSize(9)
        .fillColor(COLORS.muted)
        .text(
          `Bisherige Schreiben: ${history.map((entry) => `${TITLES[entry.level]} vom ${formatDate(entry.dunningDate)}`).join(', ')}.`,
          PAGE.left,
          undefined,
          { width: CONTENT_WIDTH },
        );
    }

    this.documentPdf.decoratePages(pdf, company, false);
    pdf.end();
    return {
      buffer: await finished,
      filename: `${TITLES[dunning.level].replace(/[^A-Za-z0-9]+/g, '_')}_${(invoice.number ?? '').replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`,
    };
  }
}
