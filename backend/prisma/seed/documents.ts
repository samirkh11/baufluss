// Block 4 test data: quotes of the roofing company in every status (draft, sent, accepted, rejected).
import { DocumentItemKind, DocumentStatus, DocumentType, PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { calculateTotals, lineTotal } from '../../src/documents/calculations';
import { parseGaeb } from '../../src/documents/gaeb/gaeb-parser';
import { SeededCatalogItem } from './catalog';

const { POSITION, HEADING, TEXT } = DocumentItemKind;

type SeedLine =
  | { kind: 'heading'; name: string }
  | { kind: 'text'; name: string }
  // Position taken from the catalog by SKU; quantity/discount per quote.
  | { kind: 'catalog'; sku: string; quantity: number; discountPercent?: number; description?: string }
  // Free position that is not in the catalog.
  | { kind: 'free'; name: string; quantity: number; unit: string; unitPrice: number; description?: string; isOptional?: boolean };

interface SeedQuote {
  project: string; // project number
  number: string | null; // null = draft
  status: DocumentStatus;
  date: string;
  subject: string;
  lines: SeedLine[];
}

const QUOTES: SeedQuote[] = [
  {
    project: 'P-0003', number: 'AN-00001', status: DocumentStatus.ACCEPTED, date: '2026-07-10',
    subject: 'Erneuerung der Dachrinnen Grundschule Blaustein',
    lines: [
      { kind: 'heading', name: 'Dachentwässerung Hauptgebäude' },
      { kind: 'catalog', sku: 'L-111', quantity: 85, description: 'Demontage der alten Rinnen und Fallrohre, Montage inkl. Rinnenhalter und Endstücken.' },
      { kind: 'catalog', sku: 'A-203', quantity: 85 },
      { kind: 'text', name: 'Entsorgung der Altmaterialien ist im Preis enthalten.' },
    ],
  },
  {
    project: 'P-0001', number: 'AN-00002', status: DocumentStatus.ACCEPTED, date: '2026-08-20',
    subject: 'Dachsanierung Mehrfamilienhaus Hirschstraße 14',
    lines: [
      { kind: 'heading', name: 'Gerüst und Vorbereitung' },
      { kind: 'catalog', sku: 'L-120', quantity: 1 },
      { kind: 'heading', name: 'Dacheindeckung' },
      { kind: 'catalog', sku: 'L-110', quantity: 320, description: 'Alte Eindeckung abtragen und entsorgen, Konterlattung und Lattung erneuern, Unterspannbahn verlegen, Tonziegel naturrot eindecken, First und Ortgang ausbilden.' },
      { kind: 'catalog', sku: 'L-130', quantity: 2 },
      { kind: 'catalog', sku: 'A-204', quantity: 2 },
      { kind: 'heading', name: 'Dachentwässerung' },
      { kind: 'catalog', sku: 'L-111', quantity: 48 },
      { kind: 'catalog', sku: 'A-203', quantity: 48 },
      { kind: 'heading', name: 'Alternativen' },
      { kind: 'free', name: 'Zusätzliche Zwischensparrendämmung 160 mm', quantity: 320, unit: 'm²', unitPrice: 38, isOptional: true, description: 'Nur bei Beauftragung; nicht in der Angebotssumme enthalten.' },
      { kind: 'text', name: 'Alle Preise verstehen sich zuzüglich der gesetzlichen Umsatzsteuer.' },
    ],
  },
  {
    project: 'P-0002', number: 'AN-00003', status: DocumentStatus.REJECTED, date: '2026-09-30',
    subject: 'Neueindeckung Einfamilienhaus – Variante Premium',
    lines: [
      { kind: 'heading', name: 'Dacheindeckung' },
      { kind: 'catalog', sku: 'L-110', quantity: 140 },
      { kind: 'catalog', sku: 'L-130', quantity: 3 },
      { kind: 'catalog', sku: 'A-204', quantity: 3 },
    ],
  },
  {
    project: 'P-0002', number: 'AN-00004', status: DocumentStatus.ACCEPTED, date: '2026-10-02',
    subject: 'Neueindeckung Einfamilienhaus – Variante Standard',
    lines: [
      { kind: 'heading', name: 'Dacheindeckung' },
      { kind: 'catalog', sku: 'L-110', quantity: 140, discountPercent: 3, description: 'Treuerabatt für Folgeauftrag.' },
      { kind: 'heading', name: 'Dachentwässerung' },
      { kind: 'catalog', sku: 'L-111', quantity: 22 },
      { kind: 'catalog', sku: 'A-203', quantity: 22 },
      { kind: 'heading', name: 'Regiearbeiten' },
      { kind: 'catalog', sku: 'L-101', quantity: 24, description: 'Stundenlohnarbeiten nach Aufwand (Planwert).' },
    ],
  },
  {
    project: 'P-0004', number: 'AN-00005', status: DocumentStatus.SENT, date: '2026-10-08',
    subject: 'Einbau von 6 Dachfenstern in der Werkhalle',
    lines: [
      { kind: 'heading', name: 'Dachfenster' },
      { kind: 'catalog', sku: 'A-204', quantity: 6 },
      { kind: 'catalog', sku: 'L-130', quantity: 6 },
      { kind: 'catalog', sku: 'L-101', quantity: 8, description: 'Zusätzliche Anpassungen an der Dachhaut.' },
    ],
  },
  {
    // Draft: no number yet, can still be edited.
    project: 'P-0001', number: null, status: DocumentStatus.DRAFT, date: '2026-10-11',
    subject: 'Nachtrag: Sparrenreparatur Traufe Ost',
    lines: [
      { kind: 'catalog', sku: 'L-100', quantity: 6 },
      { kind: 'catalog', sku: 'L-101', quantity: 12 },
      { kind: 'catalog', sku: 'A-201', quantity: 40 },
    ],
  },
];

export async function seedDocuments(
  prisma: PrismaClient,
  companyId: string,
  catalog: Record<string, SeededCatalogItem>,
): Promise<void> {
  let numbered = 0;

  for (const quote of QUOTES) {
    const project = await prisma.project.findFirstOrThrow({ where: { companyId, number: quote.project }, include: { customer: true } });
    const customer = project.customer!;
    const date = new Date(quote.date);

    // Resolve the lines into item rows (catalog values are copied, like the real editor does).
    const rows = quote.lines.map((line, index) => {
      const base = { sortOrder: index, kind: POSITION, name: '', quantity: 1, unit: 'Stk', unitPrice: 0, vatRate: 19, discountPercent: 0, isOptional: false };
      if (line.kind === 'heading') return { ...base, kind: HEADING, name: line.name };
      if (line.kind === 'text') return { ...base, kind: TEXT, name: line.name };
      if (line.kind === 'free') {
        return { ...base, name: line.name, quantity: line.quantity, unit: line.unit, unitPrice: line.unitPrice, description: line.description, isOptional: line.isOptional ?? false };
      }
      const item = catalog[line.sku];
      return {
        ...base,
        catalogItemId: item.id,
        sku: item.sku,
        name: item.name,
        description: line.description ?? item.description ?? undefined,
        quantity: line.quantity,
        unit: item.unit,
        unitPrice: item.netPrice,
        vatRate: item.vatRate,
        discountPercent: line.discountPercent ?? 0,
      };
    });
    const totals = calculateTotals(rows);

    if (quote.number) numbered++;
    await prisma.document.create({
      data: {
        companyId,
        projectId: project.id,
        type: DocumentType.QUOTE,
        status: quote.status,
        number: quote.number,
        recipientContactId: customer.id,
        recipientName: customer.organizationName ?? [customer.salutation, customer.firstName, customer.lastName].filter(Boolean).join(' '),
        recipientStreet: customer.street,
        recipientZipCode: customer.zipCode,
        recipientCity: customer.city,
        recipientCountry: customer.country,
        subject: quote.subject,
        introText: 'vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen die folgenden Leistungen an:',
        closingText: 'Wir freuen uns auf Ihren Auftrag und stehen für Rückfragen gerne zur Verfügung.',
        documentDate: date,
        validUntil: new Date(date.getTime() + 30 * 24 * 60 * 60 * 1000),
        netTotal: totals.net,
        vatTotal: totals.vat,
        grossTotal: totals.gross,
        finalizedAt: quote.number ? date : null,
        items: { create: rows.map((row) => ({ ...row, lineTotal: lineTotal(row) })) },
      },
    });
  }

  await seedDerivedDocuments(prisma, companyId);
  await seedGaebImport(prisma, companyId);

  // The seed assigns numbers directly, so move the sequences past them.
  await prisma.numberSequence.updateMany({ where: { companyId, documentType: 'QUOTE' }, data: { nextNumber: numbered + 1 } });
  await prisma.numberSequence.updateMany({ where: { companyId, documentType: 'ORDER' }, data: { nextNumber: 3 } });
  await prisma.numberSequence.updateMany({ where: { companyId, documentType: 'INVOICE' }, data: { nextNumber: 2 } });
}

interface DerivedSpec {
  sourceNumber: string;
  type: DocumentType;
  number: string | null; // null = draft
  status: DocumentStatus;
  date: string;
  introText: string;
  closingText: string;
  dropOptional?: boolean; // optional (alternative) positions are not part of an invoice
}

// Orders and invoices created from the quotes above (same chain the "Übernahme" button builds).
const DERIVED: DerivedSpec[] = [
  { sourceNumber: 'AN-00002', type: DocumentType.ORDER, number: 'AB-00001', status: DocumentStatus.SENT, date: '2026-09-01',
    introText: 'vielen Dank für Ihren Auftrag. Wir bestätigen Ihnen hiermit die folgenden Leistungen:',
    closingText: 'Wir danken für das entgegengebrachte Vertrauen und freuen uns auf die Zusammenarbeit.' },
  { sourceNumber: 'AN-00004', type: DocumentType.ORDER, number: 'AB-00002', status: DocumentStatus.SENT, date: '2026-10-05',
    introText: 'vielen Dank für Ihren Auftrag. Wir bestätigen Ihnen hiermit die folgenden Leistungen:',
    closingText: 'Wir danken für das entgegengebrachte Vertrauen und freuen uns auf die Zusammenarbeit.' },
  // Issued invoice straight from a quote (no order) for the finished school project.
  { sourceNumber: 'AN-00001', type: DocumentType.INVOICE, number: 'RE-00001', status: DocumentStatus.SENT, date: '2026-08-18',
    introText: 'für die von uns ausgeführten Leistungen berechnen wir Ihnen:',
    closingText: 'Bitte überweisen Sie den Rechnungsbetrag innerhalb von 30 Tagen ohne Abzug auf das unten genannte Konto.' },
  // Invoice draft prepared from the order of the running project.
  { sourceNumber: 'AB-00001', type: DocumentType.INVOICE, number: null, status: DocumentStatus.DRAFT, date: '2026-10-11', dropOptional: true,
    introText: 'für die von uns ausgeführten Leistungen berechnen wir Ihnen:',
    closingText: 'Bitte überweisen Sie den Rechnungsbetrag innerhalb von 14 Tagen ohne Abzug auf das unten genannte Konto.' },
];

async function seedDerivedDocuments(prisma: PrismaClient, companyId: string): Promise<void> {
  for (const spec of DERIVED) {
    const source = await prisma.document.findFirstOrThrow({ where: { companyId, number: spec.sourceNumber }, include: { items: true } });
    const items = source.items.filter((item) => !(spec.dropOptional && item.isOptional));
    const totals = calculateTotals(items);

    await prisma.document.create({
      data: {
        companyId,
        projectId: source.projectId,
        type: spec.type,
        status: spec.status,
        number: spec.number,
        sourceDocumentId: source.id,
        recipientContactId: source.recipientContactId,
        recipientName: source.recipientName,
        recipientStreet: source.recipientStreet,
        recipientZipCode: source.recipientZipCode,
        recipientCity: source.recipientCity,
        recipientCountry: source.recipientCountry,
        subject: source.subject,
        introText: spec.introText,
        closingText: spec.closingText,
        documentDate: new Date(spec.date),
        netTotal: totals.net,
        vatTotal: totals.vat,
        grossTotal: totals.gross,
        finalizedAt: spec.number ? new Date(spec.date) : null,
        items: {
          create: items.map((item, index) => ({
            sortOrder: index,
            kind: item.kind,
            catalogItemId: item.catalogItemId,
            sku: item.sku,
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            vatRate: item.vatRate,
            discountPercent: item.discountPercent,
            isOptional: item.isOptional,
            lineTotal: item.lineTotal,
          })),
        },
      },
    });
  }
}

// A quote draft created by the GAEB import from the self-made sample bill of quantities
// (docs/gaeb-samples/lv-dachsanierung.x83): original numbering kept, prices still to be filled in.
async function seedGaebImport(prisma: PrismaClient, companyId: string): Promise<void> {
  const xml = readFileSync(join(process.cwd(), '..', 'docs', 'gaeb-samples', 'lv-dachsanierung.x83'), 'utf8');
  const parsed = parseGaeb(xml);
  const project = await prisma.project.findFirstOrThrow({ where: { companyId, number: 'P-0004' }, include: { customer: true } });
  const customer = project.customer!;

  await prisma.document.create({
    data: {
      companyId,
      projectId: project.id,
      type: DocumentType.QUOTE,
      status: DocumentStatus.DRAFT,
      recipientContactId: customer.id,
      recipientName: customer.organizationName,
      recipientStreet: customer.street,
      recipientZipCode: customer.zipCode,
      recipientCity: customer.city,
      recipientCountry: customer.country,
      subject: parsed.projectLabel,
      introText: 'vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen die folgenden Leistungen an:',
      closingText: 'Wir freuen uns auf Ihren Auftrag und stehen für Rückfragen gerne zur Verfügung.',
      documentDate: new Date('2026-10-10'),
      validUntil: new Date('2026-11-09'),
      items: {
        create: parsed.items.map((item, index) => ({
          sortOrder: index,
          kind: item.kind,
          oz: item.oz,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          vatRate: 19,
          isOptional: item.isOptional,
          lineTotal: 0,
        })),
      },
    },
  });
}
