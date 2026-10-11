import { BadRequestException, Injectable } from '@nestjs/common';
import { ArchiveKind, ComplianceSettings, DocumentStatus, DocumentType, IncomingInvoiceStatus, Prisma } from '@prisma/client';
import JSZip from 'jszip';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../common/prisma/prisma.service';
import { archivePath } from '../documents/archive-paths';
import { calculateTotals } from '../documents/calculations';
import { CompliancePdfService } from './compliance-pdf.service';
import { csvLine, dateDe, decimalDe } from './csv';
import { buildBookings, datevFile, DatevAccounts, personAccount, toWindows1252 } from './datev';
import { GdpduTable, gdpduIndex } from './gdpdu';

const DEFAULT_ACCOUNTS: DatevAccounts = { revenue19: 8400, revenue7: 8300, revenueExempt: 8337, expense19: 3400, expense7: 3300, expenseNoVat: 3200, bank: 1200, debtorBase: 10000, creditorBase: 70000 };

function accountsOf(settings: ComplianceSettings | null): DatevAccounts {
  if (!settings) return DEFAULT_ACCOUNTS;
  return {
    revenue19: settings.accountRevenue19, revenue7: settings.accountRevenue7, revenueExempt: settings.accountRevenueExempt,
    expense19: settings.accountExpense19, expense7: settings.accountExpense7, expenseNoVat: settings.accountExpenseNoVat,
    bank: settings.accountBank, debtorBase: settings.accountDebtorBase, creditorBase: settings.accountCreditorBase,
  };
}

const contactName = (c: { organizationName: string | null; firstName: string | null; lastName: string | null } | null) =>
  c ? c.organizationName || [c.firstName, c.lastName].filter(Boolean).join(' ') : '';

// Exports for the tax audit: the GoBD data carrier ("Z3", index.xml + CSV tables + documents as ZIP) and the
// DATEV bookings file. Everything is read-only and limited to one period.
@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: CompliancePdfService,
  ) {}

  private period(from: string, to: string) {
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw new BadRequestException('Ungültiger Zeitraum.');
    return { start, end };
  }

  private async loadAccountingData(companyId: string, start: Date, end: Date) {
    const range = { gte: start, lte: end };
    const [invoices, payments, incoming] = await Promise.all([
      this.prisma.document.findMany({
        where: { companyId, number: { not: null }, type: { in: [DocumentType.INVOICE, DocumentType.CREDIT_NOTE] }, documentDate: range },
        include: { items: { orderBy: { sortOrder: 'asc' } }, invoiceDetails: true, project: { select: { number: true } }, recipientContact: { select: { number: true } }, archivedFiles: true, payments: false },
        orderBy: [{ documentDate: 'asc' }, { number: 'asc' }],
      }),
      this.prisma.payment.findMany({
        where: { companyId, paidAt: range },
        include: { document: { select: { number: true, type: true, recipientContact: { select: { number: true } } } } },
        orderBy: { paidAt: 'asc' },
      }),
      this.prisma.incomingInvoice.findMany({
        where: { companyId, status: { in: [IncomingInvoiceStatus.APPROVED, IncomingInvoiceStatus.PAID] }, invoiceDate: range },
        include: { supplier: { select: { number: true, organizationName: true, firstName: true, lastName: true } }, project: { select: { number: true } }, approvedBy: { select: { firstName: true, lastName: true } } },
        orderBy: [{ invoiceDate: 'asc' }, { number: 'asc' }],
      }),
    ]);
    return { invoices, payments, incoming };
  }

  private bookingsFor(data: Awaited<ReturnType<ExportService['loadAccountingData']>>, settings: ComplianceSettings | null) {
    const accounts = accountsOf(settings);
    const debtorIndex = new Map<string, number>();
    const creditorIndex = new Map<string, number>();
    const index = (map: Map<string, number>, key: string) => map.get(key) ?? map.set(key, map.size + 1).get(key)!;
    return buildBookings(
      {
        debtor: (number, name) => personAccount(accounts.debtorBase, number, index(debtorIndex, number ?? name)),
        creditor: (number, name) => personAccount(accounts.creditorBase, number, index(creditorIndex, number ?? name)),
        invoices: data.invoices.map((d) => ({
          number: d.number!, isCreditNote: d.type === DocumentType.CREDIT_NOTE, date: d.documentDate, contactNumber: d.recipientContact?.number ?? null,
          contactName: d.recipientName ?? '', reverseCharge: d.invoiceDetails?.reverseCharge ?? false, items: d.items,
        })),
        payments: data.payments.filter((p) => p.document.number).map((p) => ({
          documentNumber: p.document.number!, isCreditNote: p.document.type === DocumentType.CREDIT_NOTE, date: p.paidAt, amount: p.amount, contactNumber: p.document.recipientContact?.number ?? null,
        })),
        incoming: data.incoming.map((i) => ({
          number: i.number, invoiceNumber: i.invoiceNumber, date: i.invoiceDate ?? i.createdAt, supplierNumber: i.supplier?.number ?? null,
          supplierName: i.supplier ? contactName(i.supplier) : i.supplierName ?? '', net: i.netAmount, vat: i.vatAmount, gross: i.grossAmount, paidAt: i.paidAt,
        })),
      },
      accounts,
    );
  }

  async datev(companyId: string, from: string, to: string): Promise<{ buffer: Buffer; filename: string }> {
    const { start, end } = this.period(from, to);
    const [settings, data] = await Promise.all([this.prisma.complianceSettings.findUnique({ where: { companyId } }), this.loadAccountingData(companyId, start, end)]);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } });
    const text = datevFile(this.bookingsFor(data, settings), {
      advisor: settings?.datevAdvisorNumber ?? null, client: settings?.datevClientNumber ?? null, from: start, to: end, label: company.name, now: new Date(),
    });
    return { buffer: toWindows1252(text), filename: `EXTF_Buchungsstapel_${from}_${to}.csv` };
  }

  // GoBD data carrier as ZIP: index.xml, CSV tables, archived documents, incoming invoice originals,
  // DATEV file and the process documentation.
  async taxAuditZip(companyId: string, from: string, to: string): Promise<{ buffer: Buffer; filename: string }> {
    const { start, end } = this.period(from, to);
    const [company, settings, data] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      this.prisma.complianceSettings.findUnique({ where: { companyId } }),
      this.loadAccountingData(companyId, start, end),
    ]);
    const zip = new JSZip();
    const csv = (lines: string[]) => '﻿' + lines.join('\r\n') + '\r\n';

    // ---- documents and lines
    const documentRows = [csvLine(['Belegart', 'Belegnummer', 'Belegdatum', 'Status', 'Kontaktnummer', 'Empfaenger', 'Strasse', 'PLZ', 'Ort', 'Netto', 'Umsatzsteuer', 'Brutto', 'Waehrung', 'Leistung_von', 'Leistung_bis', 'Faellig', 'Par13b', 'Projekt', 'Archivdatei', 'SHA256'])];
    const lineRows = [csvLine(['Belegnummer', 'Position', 'Bezeichnung', 'Menge', 'Einheit', 'Einzelpreis_netto', 'Rabatt_Prozent', 'USt_Satz', 'Netto'])];
    for (const document of data.invoices) {
      const pdf = document.archivedFiles.find((f) => f.kind === ArchiveKind.DOCUMENT_PDF);
      const xml = document.archivedFiles.find((f) => f.kind === ArchiveKind.EINVOICE_XML);
      for (const file of [pdf, xml]) {
        if (file) zip.file(`belege/${file.fileName}`, await readFile(archivePath(file.filePath)).catch(() => Buffer.from('')));
      }
      const totals = calculateTotals(document.items);
      documentRows.push(csvLine([
        document.type === DocumentType.CREDIT_NOTE ? 'Gutschrift' : 'Rechnung', document.number, dateDe(document.documentDate),
        document.status === DocumentStatus.CANCELLED ? 'storniert' : 'ausgestellt', document.recipientContact?.number, document.recipientName,
        document.recipientStreet, document.recipientZipCode, document.recipientCity, decimalDe(totals.net), decimalDe(totals.vat), decimalDe(totals.gross), document.currency,
        dateDe(document.invoiceDetails?.serviceDateFrom), dateDe(document.invoiceDetails?.serviceDateTo), dateDe(document.invoiceDetails?.dueDate),
        document.invoiceDetails?.reverseCharge ? 'ja' : 'nein', document.project?.number, pdf ? `belege/${pdf.fileName}` : '', pdf?.sha256,
      ]));
      document.items.filter((item) => item.kind === 'POSITION' && !item.isOptional).forEach((item, position) =>
        lineRows.push(csvLine([document.number, position + 1, item.name, item.quantity.toString().replace('.', ','), item.unit, decimalDe(item.unitPrice), decimalDe(item.discountPercent), decimalDe(item.vatRate), decimalDe(item.lineTotal)])));
    }

    // ---- payments
    const paymentRows = [csvLine(['Belegnummer', 'Zahlungsdatum', 'Betrag', 'Zahlungsart', 'Referenz', 'Ziel'])];
    for (const payment of data.payments) {
      paymentRows.push(csvLine([payment.document.number, dateDe(payment.paidAt), decimalDe(payment.amount), payment.method, payment.reference, payment.target]));
    }

    // ---- incoming invoices with their originals
    const incomingRows = [csvLine(['Interne_Nr', 'Lieferant', 'Lieferantennummer', 'Rechnungsnummer', 'Rechnungsdatum', 'Faellig', 'Netto', 'Umsatzsteuer', 'Brutto', 'Par13b', 'Status', 'Projekt', 'Freigegeben_von', 'Freigegeben_am', 'Bezahlt_am', 'Datei', 'SHA256'])];
    for (const invoice of data.incoming) {
      let file = '';
      if (invoice.filePath) {
        file = `eingang/${invoice.number}_${(invoice.fileName ?? 'beleg').replace(/[^\w.-]/g, '_')}`;
        zip.file(file, await readFile(join(process.cwd(), 'storage', 'incoming-invoices', invoice.filePath)).catch(() => Buffer.from('')));
      }
      incomingRows.push(csvLine([
        invoice.number, invoice.supplier ? contactName(invoice.supplier) : invoice.supplierName, invoice.supplier?.number, invoice.invoiceNumber, dateDe(invoice.invoiceDate), dateDe(invoice.dueDate),
        decimalDe(invoice.netAmount), decimalDe(invoice.vatAmount), decimalDe(invoice.grossAmount), invoice.reverseCharge ? 'ja' : 'nein', invoice.status, invoice.project?.number,
        invoice.approvedBy ? `${invoice.approvedBy.firstName} ${invoice.approvedBy.lastName}` : '', dateDe(invoice.approvedAt), dateDe(invoice.paidAt), file, invoice.fileHash,
      ]));
    }

    // ---- contacts that appear in the data
    const numbers = new Set<string>();
    data.invoices.forEach((d) => d.recipientContact?.number && numbers.add(d.recipientContact.number));
    data.incoming.forEach((i) => i.supplier?.number && numbers.add(i.supplier.number));
    const contacts = await this.prisma.contact.findMany({ where: { companyId, number: { in: [...numbers] } }, orderBy: { number: 'asc' } });
    const contactRows = [csvLine(['Kontaktnummer', 'Name', 'Strasse', 'PLZ', 'Ort', 'Land', 'USt_IdNr', 'Steuernummer', 'IBAN'])];
    for (const c of contacts) contactRows.push(csvLine([c.number, contactName(c), c.street, c.zipCode, c.city, c.country, c.vatId, c.taxId, c.iban]));

    const col = (name: string, type: 'text' | 'number' | 'date' = 'text') => ({ name, type });
    const tables: GdpduTable[] = [
      { file: 'belege.csv', name: 'Ausgangsrechnungen und Gutschriften', description: 'Kopfdaten der ausgestellten Rechnungen und Gutschriften des Zeitraums', columns: [col('Belegart'), col('Belegnummer'), col('Belegdatum', 'date'), col('Status'), col('Kontaktnummer'), col('Empfaenger'), col('Strasse'), col('PLZ'), col('Ort'), col('Netto', 'number'), col('Umsatzsteuer', 'number'), col('Brutto', 'number'), col('Waehrung'), col('Leistung_von', 'date'), col('Leistung_bis', 'date'), col('Faellig', 'date'), col('Par13b'), col('Projekt'), col('Archivdatei'), col('SHA256')] },
      { file: 'positionen.csv', name: 'Belegpositionen', description: 'Positionen der ausgestellten Belege', columns: [col('Belegnummer'), col('Position', 'number'), col('Bezeichnung'), col('Menge', 'number'), col('Einheit'), col('Einzelpreis_netto', 'number'), col('Rabatt_Prozent', 'number'), col('USt_Satz', 'number'), col('Netto', 'number')] },
      { file: 'zahlungen.csv', name: 'Zahlungen', description: 'Zahlungseingaenge und Erstattungen', columns: [col('Belegnummer'), col('Zahlungsdatum', 'date'), col('Betrag', 'number'), col('Zahlungsart'), col('Referenz'), col('Ziel')] },
      { file: 'eingangsrechnungen.csv', name: 'Eingangsrechnungen', description: 'Freigegebene und bezahlte Eingangsrechnungen mit Originalbeleg', columns: [col('Interne_Nr'), col('Lieferant'), col('Lieferantennummer'), col('Rechnungsnummer'), col('Rechnungsdatum', 'date'), col('Faellig', 'date'), col('Netto', 'number'), col('Umsatzsteuer', 'number'), col('Brutto', 'number'), col('Par13b'), col('Status'), col('Projekt'), col('Freigegeben_von'), col('Freigegeben_am', 'date'), col('Bezahlt_am', 'date'), col('Datei'), col('SHA256')] },
      { file: 'kontakte.csv', name: 'Kunden und Lieferanten', description: 'Stammdaten der in den Belegen verwendeten Kontakte', columns: [col('Kontaktnummer'), col('Name'), col('Strasse'), col('PLZ'), col('Ort'), col('Land'), col('USt_IdNr'), col('Steuernummer'), col('IBAN')] },
    ];
    zip.file('belege.csv', csv(documentRows));
    zip.file('positionen.csv', csv(lineRows));
    zip.file('zahlungen.csv', csv(paymentRows));
    zip.file('eingangsrechnungen.csv', csv(incomingRows));
    zip.file('kontakte.csv', csv(contactRows));
    zip.file('index.xml', gdpduIndex({ company: company.name, location: `${company.zipCode} ${company.city}`, comment: `Export ${from} bis ${to} aus Meisterwerk` }, tables));

    const datev = datevFile(this.bookingsFor(data, settings), { advisor: settings?.datevAdvisorNumber ?? null, client: settings?.datevClientNumber ?? null, from: start, to: end, label: company.name, now: new Date() });
    zip.file(`EXTF_Buchungsstapel_${from}_${to}.csv`, toWindows1252(datev));
    zip.file('Verfahrensdokumentation.pdf', await this.pdf.procedureDocumentation(companyId));
    zip.file('LIESMICH.txt', [
      `Datenträger für die Betriebsprüfung – ${company.name}`, `Zeitraum: ${from} bis ${to}`, '',
      'index.xml beschreibt die CSV-Tabellen (Beschreibungsstandard für die Datenträgerüberlassung, GoBD/GDPdU). Die Datei gdpdu-01-09-2002.dtd',
      'wird von der Prüfsoftware (z. B. IDEA) mitgebracht. Tabellen: UTF-8, Trennzeichen ";", Dezimalkomma, Zeile 1 enthält die Spaltennamen.', '',
      'belege/   Ausgangsrechnungen und Gutschriften als PDF (und XRechnung-XML) genau so, wie sie ausgestellt wurden; SHA256 in belege.csv.',
      'eingang/  Originalbelege der Eingangsrechnungen; SHA256 in eingangsrechnungen.csv.',
      'EXTF_Buchungsstapel_*.csv  Buchungsstapel im DATEV-Format (Entwurf; Konten nach den Einstellungen, SKR03).',
      'Verfahrensdokumentation.pdf  Beschreibung des Verfahrens.', '',
    ].join('\r\n'));

    return { buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), filename: `Betriebspruefung_${from}_${to}.zip` };
  }
}
