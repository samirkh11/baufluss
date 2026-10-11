// Block 4 test data: quotes of the roofing company in every status (draft, sent, accepted, rejected).
import { DocumentItemKind, DocumentStatus, DocumentType, DunningLevel, InvoiceKind, Prisma, PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { calculateTotals, lineTotal } from '../../src/documents/calculations';
import { parseGaeb } from '../../src/documents/gaeb/gaeb-parser';
import { issuerSnapshotOf } from '../../src/documents/issuer-snapshot';
import { amountFromPercent, splitPartialAmount } from '../../src/documents/partial-invoice';
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
  await seedContractInvoices(prisma, companyId);
  await seedCancelledInvoice(prisma, companyId);
  await seedPayments(prisma, companyId);
  await seedGaebImport(prisma, companyId);

  // Issued documents carry the company data as it was when they were issued.
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  await prisma.document.updateMany({
    where: { companyId, status: { not: DocumentStatus.DRAFT } },
    data: { issuerSnapshot: issuerSnapshotOf(company) },
  });

  // The seed assigns numbers directly, so move the sequences past them.
  await prisma.numberSequence.updateMany({ where: { companyId, documentType: 'QUOTE' }, data: { nextNumber: numbered + 1 } });
  await prisma.numberSequence.updateMany({ where: { companyId, documentType: 'ORDER' }, data: { nextNumber: 3 } });
  await prisma.numberSequence.updateMany({ where: { companyId, documentType: 'CREDIT_NOTE' }, data: { nextNumber: 2, lastResetYear: new Date().getFullYear() } });

  // The invoice range resets yearly, so it must know its current year or it would restart at 1.
  await prisma.numberSequence.updateMany({
    where: { companyId, documentType: 'INVOICE' },
    data: { nextNumber: 5, lastResetYear: new Date().getFullYear() },
  });
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
  invoice?: { paymentTermDays: number; serviceFrom: string; serviceTo?: string; reverseCharge?: boolean; orderReference?: string };
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
  { sourceNumber: 'AN-00001', type: DocumentType.INVOICE, number: 'RE-00002', status: DocumentStatus.SENT, date: '2026-08-18',
    introText: 'für die von uns ausgeführten Leistungen berechnen wir Ihnen:',
    closingText: 'Vielen Dank für Ihren Auftrag und das entgegengebrachte Vertrauen.',
    invoice: { paymentTermDays: 30, serviceFrom: '2026-08-03', serviceTo: '2026-08-14', orderReference: 'BA-2026/118' } },
  // Draft for a private customer (the PDF then carries the retention notice for the customer).
  { sourceNumber: 'AB-00002', type: DocumentType.INVOICE, number: null, status: DocumentStatus.DRAFT, date: '2026-10-11', dropOptional: true,
    introText: 'für die von uns ausgeführten Leistungen berechnen wir Ihnen:',
    closingText: 'Vielen Dank für Ihren Auftrag und das entgegengebrachte Vertrauen.',
    invoice: { paymentTermDays: 14, serviceFrom: '2026-11-02', serviceTo: '2026-11-13' } },
  // Draft between contractors: reverse charge (§ 13b UStG), all positions at 0 % VAT.
  { sourceNumber: 'AN-00005', type: DocumentType.INVOICE, number: null, status: DocumentStatus.DRAFT, date: '2026-10-11', dropOptional: true,
    introText: 'für die von uns ausgeführten Leistungen berechnen wir Ihnen:',
    closingText: 'Vielen Dank für Ihren Auftrag und das entgegengebrachte Vertrauen.',
    invoice: { paymentTermDays: 14, serviceFrom: '2026-10-19', reverseCharge: true } },
];

async function seedDerivedDocuments(prisma: PrismaClient, companyId: string): Promise<void> {
  for (const spec of DERIVED) {
    const source = await prisma.document.findFirstOrThrow({ where: { companyId, number: spec.sourceNumber }, include: { items: true } });
    const reverseCharge = spec.invoice?.reverseCharge ?? false;
    const items = source.items
      .filter((item) => !(spec.dropOptional && item.isOptional))
      // § 13b: the recipient owes the VAT, so every position is at 0 %
      .map((item) => (reverseCharge ? { ...item, vatRate: new Prisma.Decimal(0) } : item));
    const totals = calculateTotals(items);
    const customer = source.recipientContactId ? await prisma.contact.findUnique({ where: { id: source.recipientContactId } }) : null;

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
        ...(spec.invoice
          ? {
              invoiceDetails: {
                create: {
                  serviceDateFrom: new Date(spec.invoice.serviceFrom),
                  serviceDateTo: spec.invoice.serviceTo ? new Date(spec.invoice.serviceTo) : null,
                  paymentTermDays: spec.invoice.paymentTermDays,
                  dueDate: spec.number ? new Date(new Date(spec.date).getTime() + spec.invoice.paymentTermDays * 24 * 60 * 60 * 1000) : null,
                  reverseCharge,
                  recipientVatId: customer?.vatId ?? null,
                  orderReference: spec.invoice.orderReference,
                },
              },
            }
          : {}),
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
// (backend/assets/gaeb-samples/lv-dachsanierung.x83, copy of docs/gaeb-samples): original numbering kept, prices still to be filled in.
async function seedGaebImport(prisma: PrismaClient, companyId: string): Promise<void> {
  const xml = readFileSync(join(process.cwd(), 'assets', 'gaeb-samples', 'lv-dachsanierung.x83'), 'utf8');
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

// Contract billing of the running roof renovation (order AB-00001): two issued partial invoices of
// 30 % each and the final invoice as a draft that deducts both and withholds 5 % as security.
async function seedContractInvoices(prisma: PrismaClient, companyId: string): Promise<void> {
  const order = await prisma.document.findFirstOrThrow({
    where: { companyId, number: 'AB-00001' },
    include: { items: { orderBy: { sortOrder: 'asc' } }, project: true },
  });
  const totals = calculateTotals(order.items);
  const base = {
    companyId,
    projectId: order.projectId,
    type: DocumentType.INVOICE,
    sourceDocumentId: order.id,
    recipientContactId: order.recipientContactId,
    recipientName: order.recipientName,
    recipientStreet: order.recipientStreet,
    recipientZipCode: order.recipientZipCode,
    recipientCity: order.recipientCity,
    recipientCountry: order.recipientCountry,
    subject: order.subject,
  };
  const customer = await prisma.contact.findUniqueOrThrow({ where: { id: order.recipientContactId! } });

  const partials: { id: string; number: string; nets: { vatRate: Prisma.Decimal; net: Prisma.Decimal }[]; date: string; n: number }[] = [];
  for (const [index, spec] of [
    { number: 'RE-00003', percent: 30, date: '2026-09-20' },
    { number: 'RE-00004', percent: 30, date: '2026-10-05' },
  ].entries()) {
    const n = index + 1;
    const parts = splitPartialAmount(totals.vatGroups, amountFromPercent(totals.net, spec.percent));
    const rows = parts.map((part) => ({
      sortOrder: 0,
      kind: DocumentItemKind.POSITION,
      name: `Abschlagszahlung Nr. ${n}`,
      description: `${spec.percent} % der Auftragssumme von ${totals.net.toFixed(2).replace('.', ',')} € (netto) gemäß Auftragsbestätigung AB-00001`,
      quantity: new Prisma.Decimal(1),
      unit: 'psch',
      unitPrice: part.net,
      vatRate: part.vatRate,
      discountPercent: new Prisma.Decimal(0),
      isOptional: false,
    }));
    const t = calculateTotals(rows);
    const created = await prisma.document.create({
      data: {
        ...base,
        status: DocumentStatus.SENT,
        number: spec.number,
        introText: 'für die vertraglich vereinbarte Abschlagszahlung berechnen wir Ihnen:',
        closingText: 'Dies ist eine Abschlagsrechnung. Die Schlussabrechnung bleibt vorbehalten.',
        documentDate: new Date(spec.date),
        finalizedAt: new Date(spec.date),
        netTotal: t.net,
        vatTotal: t.vat,
        grossTotal: t.gross,
        invoiceDetails: {
          create: {
            kind: InvoiceKind.PARTIAL,
            partialNumber: n,
            serviceDateFrom: order.project.startDate,
            serviceDateTo: new Date(spec.date),
            paymentTermDays: 14,
            dueDate: new Date(new Date(spec.date).getTime() + 14 * 24 * 60 * 60 * 1000),
            recipientVatId: customer.vatId,
          },
        },
        items: { create: rows.map((row, i) => ({ ...row, sortOrder: i, lineTotal: lineTotal(row) })) },
      },
    });
    partials.push({ id: created.id, number: spec.number, nets: t.vatGroups, date: spec.date, n });
  }

  // Final invoice (draft): all positions of the order, minus the issued partial invoices.
  const orderRows = order.items.filter((item) => !item.isOptional).map((item) => ({
    kind: item.kind, oz: item.oz, catalogItemId: item.catalogItemId, name: item.name, description: item.description,
    quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, vatRate: item.vatRate,
    discountPercent: item.discountPercent, isOptional: false, deductsDocumentId: null as string | null,
  }));
  const deductionRows = partials.flatMap((partial) =>
    partial.nets.map((group) => ({
      kind: DocumentItemKind.POSITION,
      oz: null as string | null,
      catalogItemId: null as string | null,
      name: `abzüglich Abschlagsrechnung Nr. ${partial.n} (${partial.number} vom ${partial.date.split('-').reverse().join('.')})`,
      description: null as string | null,
      quantity: new Prisma.Decimal(1),
      unit: 'psch',
      unitPrice: group.net.negated(),
      vatRate: group.vatRate,
      discountPercent: new Prisma.Decimal(0),
      isOptional: false,
      deductsDocumentId: partial.id,
    })),
  );
  const finalRows = [
    ...orderRows,
    { ...orderRows[0], kind: DocumentItemKind.HEADING, oz: null, catalogItemId: null, name: 'Bereits berechnete Abschlagszahlungen (netto)', description: null, quantity: new Prisma.Decimal(1), unit: 'Stk', unitPrice: new Prisma.Decimal(0), deductsDocumentId: null },
    ...deductionRows,
  ];
  const finalTotals = calculateTotals(finalRows);
  await prisma.document.create({
    data: {
      ...base,
      status: DocumentStatus.DRAFT,
      introText: 'für die von uns ausgeführten Leistungen berechnen wir Ihnen abschließend:',
      closingText: 'Vielen Dank für Ihren Auftrag und das entgegengebrachte Vertrauen.',
      documentDate: new Date('2026-10-11'),
      netTotal: finalTotals.net,
      vatTotal: finalTotals.vat,
      grossTotal: finalTotals.gross,
      invoiceDetails: {
        create: {
          kind: InvoiceKind.FINAL,
          serviceDateFrom: order.project.startDate,
          serviceDateTo: order.project.endDate,
          paymentTermDays: 14,
          recipientVatId: customer.vatId,
          retentionPercent: 5,
          retentionDueDate: new Date('2031-10-12'),
        },
      },
      items: {
        create: finalRows.map((row, i) => ({
          sortOrder: i, kind: row.kind, oz: row.oz, catalogItemId: row.catalogItemId, name: row.name, description: row.description,
          quantity: row.quantity, unit: row.unit, unitPrice: row.unitPrice, vatRate: row.vatRate, discountPercent: row.discountPercent,
          isOptional: false, deductsDocumentId: row.deductsDocumentId, lineTotal: lineTotal(row),
        })),
      },
    },
  });
}

// An invoice of the finished flat-roof repair that was cancelled again (wrong price): the issued
// invoice RE-00001 is CANCELLED and the credit note GS-00001 mirrors it with negative quantities.
async function seedCancelledInvoice(prisma: PrismaClient, companyId: string): Promise<void> {
  const project = await prisma.project.findFirstOrThrow({ where: { companyId, number: 'P-0005' }, include: { customer: true } });
  const customer = project.customer!;
  const rows = [
    { name: 'Flachdach Garagenhof abdichten (Bitumenbahnen, zweilagig)', quantity: 120, unit: 'm²', unitPrice: 38.5 },
    { name: 'Material: Bitumenbahnen und Kleber', quantity: 1, unit: 'psch', unitPrice: 640 },
  ].map((row) => ({
    kind: DocumentItemKind.POSITION, quantity: new Prisma.Decimal(row.quantity), unit: row.unit, name: row.name,
    unitPrice: new Prisma.Decimal(row.unitPrice), vatRate: new Prisma.Decimal(19), discountPercent: new Prisma.Decimal(0), isOptional: false,
  }));
  const negated = rows.map((row) => ({ ...row, quantity: row.quantity.negated() }));
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const base = {
    companyId,
    projectId: project.id,
    recipientContactId: customer.id,
    recipientName: customer.organizationName,
    recipientStreet: customer.street,
    recipientZipCode: customer.zipCode,
    recipientCity: customer.city,
    recipientCountry: customer.country,
    subject: 'Flachdachreparatur Garagen Wohnbau Ulm',
    issuerSnapshot: issuerSnapshotOf(company),
  };
  const details = { serviceDateFrom: new Date('2026-06-08'), serviceDateTo: new Date('2026-06-12'), paymentTermDays: 14, recipientVatId: customer.vatId };

  const t = calculateTotals(rows);
  const invoice = await prisma.document.create({
    data: {
      ...base, type: DocumentType.INVOICE, status: DocumentStatus.CANCELLED, number: 'RE-00001',
      introText: 'für die von uns ausgeführten Leistungen berechnen wir Ihnen:',
      closingText: 'Vielen Dank für Ihren Auftrag und das entgegengebrachte Vertrauen.',
      documentDate: new Date('2026-06-15'), finalizedAt: new Date('2026-06-15'),
      netTotal: t.net, vatTotal: t.vat, grossTotal: t.gross,
      invoiceDetails: { create: { ...details, dueDate: new Date('2026-06-29') } },
      items: { create: rows.map((row, i) => ({ ...row, sortOrder: i, lineTotal: lineTotal(row) })) },
    },
  });
  const tn = calculateTotals(negated);
  await prisma.document.create({
    data: {
      ...base, type: DocumentType.CREDIT_NOTE, status: DocumentStatus.SENT, number: 'GS-00001', sourceDocumentId: invoice.id,
      introText: 'hiermit stornieren wir unsere Rechnung RE-00001 vom 15.06.2026 und schreiben Ihnen den Betrag gut:',
      closingText: 'Bereits geleistete Zahlungen werden erstattet bzw. mit offenen Forderungen verrechnet.',
      documentDate: new Date('2026-06-22'), finalizedAt: new Date('2026-06-22'),
      netTotal: tn.net, vatTotal: tn.vat, grossTotal: tn.gross,
      invoiceDetails: { create: details },
      items: { create: negated.map((row, i) => ({ ...row, sortOrder: i, lineTotal: lineTotal(row) })) },
    },
  });
}

// Payments: RE-00001 was paid before it was cancelled (refund still open), RE-00002 is paid, the
// first partial invoice RE-00003 is overdue and unpaid, the second one RE-00004 is partly paid.
async function seedPayments(prisma: PrismaClient, companyId: string): Promise<void> {
  const byNumber = (number: string) => prisma.document.findFirstOrThrow({ where: { companyId, number } });
  const [cancelled, school, partial1, partial2] = await Promise.all([byNumber('RE-00001'), byNumber('RE-00002'), byNumber('RE-00003'), byNumber('RE-00004')]);
  await prisma.payment.createMany({
    data: [
      { companyId, documentId: cancelled.id, paidAt: new Date('2026-06-24'), amount: cancelled.grossTotal, reference: 'RE-00001 Flachdach Garagen' },
      { companyId, documentId: school.id, paidAt: new Date('2026-09-10'), amount: school.grossTotal, reference: 'RE-00002 Grundschule Blaustein' },
      { companyId, documentId: partial2.id, paidAt: new Date('2026-10-09'), amount: 5000, reference: 'RE-00004 Abschlag 2, Teilzahlung' },
    ],
  });

  // Dunning: the first partial invoice got a payment reminder on 5 Oct whose deadline (9 Oct) has
  // expired, so the 1st dunning shows up in the proposals. (The reminder itself is free of charge.)
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  await prisma.dunning.create({
    data: {
      companyId,
      documentId: partial1.id,
      number: 'MA-0001',
      level: DunningLevel.REMINDER,
      dunningDate: new Date('2026-10-05'),
      dueDate: new Date('2026-10-09'),
      openAmount: partial1.grossTotal,
      totalAmount: partial1.grossTotal,
      issuerSnapshot: issuerSnapshotOf(company),
    },
  });
  await prisma.numberSequence.updateMany({ where: { companyId, documentType: 'DUNNING' }, data: { nextNumber: 2 } });
}
