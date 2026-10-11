// Block 6 test data: supplier invoices of the demo roofing company in every workflow state, each
// with a generated one-page PDF as the "original" so the viewer and download can be tested.
import { IncomingInvoiceStatus, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { readEInvoice } from '../../src/incoming-invoices/e-invoice-reader';

export const INCOMING_STORAGE_ROOT = join(process.cwd(), 'storage', 'incoming-invoices');

interface SeedInvoice {
  supplier: string; // contact number
  invoiceNumber: string;
  date: string;
  due: string;
  net: number;
  vat: number;
  project?: string; // project number
  status: IncomingInvoiceStatus;
  description: string;
  reverseCharge?: boolean;
  rejectionReason?: string;
  paidAt?: string;
  captured?: boolean; // false = only the uploaded file, no data yet
}

const INVOICES: SeedInvoice[] = [
  { supplier: 'L-2001', invoiceNumber: 'RE-2026-4411', date: '2026-09-18', due: '2026-10-18', net: 2840, vat: 539.6, project: 'P-0001', status: IncomingInvoiceStatus.APPROVED, description: 'Dachlatten, Konterlatten, Unterspannbahn für MFH Hirschstraße' },
  { supplier: 'L-2002', invoiceNumber: 'T-88231', date: '2026-09-25', due: '2026-10-16', net: 6120, vat: 1162.8, project: 'P-0001', status: IncomingInvoiceStatus.PAID, paidAt: '2026-10-05', description: 'Tondachziegel Rubin, 1.020 Stück inkl. Firstziegel' },
  { supplier: 'S-3001', invoiceNumber: 'GB-2026-077', date: '2026-10-02', due: '2026-10-16', net: 1850, vat: 0, project: 'P-0001', status: IncomingInvoiceStatus.RECEIVED, reverseCharge: true, description: 'Gerüststellung 4 Wochen, Auf- und Abbau (Bauleistung, § 13b)' },
  { supplier: 'L-2001', invoiceNumber: '', date: '', due: '', net: 0, vat: 0, status: IncomingInvoiceStatus.RECEIVED, description: '', captured: false },
  { supplier: 'L-2002', invoiceNumber: 'T-88302', date: '2026-10-01', due: '2026-10-22', net: 980, vat: 186.2, project: 'P-0002', status: IncomingInvoiceStatus.REJECTED, rejectionReason: 'Falsche Menge geliefert – Gutschrift angefordert', description: 'Ortgangziegel (Lieferung unvollständig)' },
  { supplier: 'L-2001', invoiceNumber: 'RE-2026-4502', date: '2026-10-05', due: '2026-10-09', net: 412.5, vat: 78.38, status: IncomingInvoiceStatus.RECEIVED, description: 'Verbrauchsmaterial Lager (Schrauben, Dichtbänder)' },
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// One-page stand-in for a supplier invoice.
function writePdf(file: string, title: string, lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(20).text(title);
    doc.moveDown();
    doc.fontSize(11);
    lines.forEach((line) => doc.text(line));
    doc.end();
  });
}

export async function seedIncomingInvoices(
  prisma: PrismaClient,
  companyId: string,
  userIds: Record<string, string>,
  contactIds: Record<string, string>,
): Promise<void> {
  const projects = await prisma.project.findMany({ where: { companyId }, select: { id: true, number: true } });
  const projectId = Object.fromEntries(projects.map((p) => [p.number, p.id]));
  const contacts = await prisma.contact.findMany({ where: { companyId }, select: { id: true, number: true, organizationName: true } });
  const contactName = Object.fromEntries(contacts.map((c) => [c.number, c.organizationName]));

  mkdirSync(join(INCOMING_STORAGE_ROOT, companyId), { recursive: true });
  let counter = 0;
  for (const invoice of INVOICES) {
    counter += 1;
    const number = `ER-${String(counter).padStart(4, '0')}`;
    const captured = invoice.captured !== false;
    const gross = round2(invoice.net + invoice.vat);
    const supplierName = contactName[invoice.supplier] ?? '';

    const lines = captured
      ? [`Lieferant: ${supplierName}`, `Rechnungsnummer: ${invoice.invoiceNumber}`, `Datum: ${invoice.date}`, '', invoice.description, '', `Netto: ${invoice.net.toFixed(2)} EUR`, `USt: ${invoice.vat.toFixed(2)} EUR`, `Brutto: ${gross.toFixed(2)} EUR`, `Zahlbar bis: ${invoice.due}`]
      : [`Scan ohne erfasste Daten (${supplierName})`];
    const buffer = await writePdf('', captured ? `Rechnung ${invoice.invoiceNumber}` : 'Eingescannter Beleg', lines);
    const relative = join(companyId, `seed-${counter}.pdf`);
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(join(INCOMING_STORAGE_ROOT, relative));
      stream.on('finish', () => resolve());
      stream.on('error', reject);
      stream.end(buffer);
    });

    const approved = invoice.status === IncomingInvoiceStatus.APPROVED || invoice.status === IncomingInvoiceStatus.PAID;
    await prisma.incomingInvoice.create({
      data: {
        companyId,
        number,
        supplierId: contactIds[invoice.supplier],
        supplierName: captured ? supplierName : null,
        invoiceNumber: captured ? invoice.invoiceNumber : null,
        invoiceDate: captured ? new Date(invoice.date) : null,
        dueDate: captured ? new Date(invoice.due) : null,
        description: captured ? invoice.description : null,
        netAmount: invoice.net,
        vatAmount: invoice.vat,
        grossAmount: gross,
        reverseCharge: invoice.reverseCharge ?? false,
        projectId: invoice.project ? projectId[invoice.project] : null,
        status: invoice.status,
        rejectionReason: invoice.rejectionReason ?? null,
        filePath: relative,
        fileName: captured ? `${invoice.invoiceNumber}.pdf` : 'scan_2026-10-08.pdf',
        mimeType: 'application/pdf',
        fileSize: buffer.length,
        fileHash: createHash('sha256').update(buffer).digest('hex'),
        uploadedById: userIds['Keller'],
        approvedById: approved ? userIds['Schmidt'] : null,
        approvedAt: approved ? new Date('2026-10-06T09:00:00Z') : null,
        paidAt: invoice.paidAt ? new Date(invoice.paidAt) : null,
      },
    });
  }
  counter = await seedXRechnung(prisma, companyId, userIds, contactIds, projectId, counter);
  await prisma.numberSequence.updateMany({ where: { companyId, documentType: 'INCOMING_INVOICE' }, data: { nextNumber: counter + 1 } });
}

// A supplier invoice that arrived as XRechnung (UBL XML): the data is read from the file, exactly like
// an upload through the app does it.
async function seedXRechnung(
  prisma: PrismaClient,
  companyId: string,
  userIds: Record<string, string>,
  contactIds: Record<string, string>,
  projectId: Record<string, string>,
  counter: number,
): Promise<number> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ID>RE-2026-4620</cbc:ID>
  <cbc:IssueDate>2026-10-09</cbc:IssueDate>
  <cbc:DueDate>2026-11-08</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>P-0001</cbc:BuyerReference>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>Baustoffhandel Maier &amp; Söhne KG</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Industriestraße 22</cbc:StreetName><cbc:CityName>Ulm</cbc:CityName><cbc:PostalZone>89079</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>DE822222222</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Baustoffhandel Maier &amp; Söhne KG</cbc:RegistrationName></cac:PartyLegalEntity>
    <cac:Contact><cbc:ElectronicMail>bestellung@baustoffe-maier.example</cbc:ElectronicMail></cac:Contact>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:PaymentMeans><cbc:PaymentMeansCode>58</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>DE89370400440532013000</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">237.50</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">1250.00</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">1250.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">1487.50</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">1487.50</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="MTK">500</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">750.00</cbc:LineExtensionAmount><cac:Item><cbc:Name>Dämmung Mineralwolle 140 mm</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">1.50</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:InvoiceLine><cbc:ID>2</cbc:ID><cbc:InvoicedQuantity unitCode="C62">250</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">500.00</cbc:LineExtensionAmount><cac:Item><cbc:Name>Konterlatten 30x50 mm</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">2.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;
  const buffer = Buffer.from(xml, 'utf8');
  const parsed = (await readEInvoice(buffer, '.xml'))!;
  const relative = join(companyId, 'seed-xrechnung.xml');
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(join(INCOMING_STORAGE_ROOT, relative));
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    stream.end(buffer);
  });
  const number = `ER-${String(counter + 1).padStart(4, '0')}`;
  await prisma.incomingInvoice.create({
    data: {
      companyId,
      number,
      supplierId: contactIds['L-2001'],
      supplierName: parsed.seller.name,
      invoiceNumber: parsed.number,
      invoiceDate: new Date(parsed.issueDate!),
      dueDate: new Date(parsed.dueDate!),
      description: parsed.lines.map((line) => line.name).join('; '),
      netAmount: parsed.netAmount,
      vatAmount: parsed.vatAmount,
      grossAmount: parsed.grossAmount,
      projectId: projectId['P-0001'],
      status: IncomingInvoiceStatus.RECEIVED,
      filePath: relative,
      fileName: 'RE-2026-4620.xml',
      mimeType: 'application/xml',
      fileSize: buffer.length,
      fileHash: createHash('sha256').update(buffer).digest('hex'),
      eInvoice: { ...parsed, supplierMatched: true } as object,
      uploadedById: userIds['Keller'],
    },
  });
  return counter + 1;
}
