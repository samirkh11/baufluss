import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Company,
  Contact,
  DocumentItemKind,
  DocumentStatus,
  DocumentType,
  InvoiceKind,
  Prisma,
} from '@prisma/client';
import { NumberSequencesService } from '../companies/number-sequences/number-sequences.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { calculateTotals, lineTotal } from './calculations';
import { ConvertDocumentDto } from './dto/convert-document.dto';
import { InvoiceDetailsDto } from './dto/invoice-details.dto';
import { amountFromPercent, splitPartialAmount } from './partial-invoice';
import { issuerSnapshotOf } from './issuer-snapshot';
import { validateInvoice } from './invoice-validation';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentItemDto } from './dto/document-item.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

// Credit notes (Storno) follow with the invoice block.
const SUPPORTED_TYPES: DocumentType[] = [DocumentType.QUOTE, DocumentType.ORDER, DocumentType.INVOICE];

// Quotes, orders and invoices can be issued. Invoices must pass validateInvoice() first (mandatory
// details under § 14 UStG); credit notes follow with the cancellation step.
const ISSUABLE_TYPES: DocumentType[] = [DocumentType.QUOTE, DocumentType.ORDER, DocumentType.INVOICE];

// Allowed conversions: quote -> order, quote -> invoice (without order), order -> invoice.
const CONVERSIONS: Partial<Record<DocumentType, DocumentType[]>> = {
  [DocumentType.QUOTE]: [DocumentType.ORDER, DocumentType.INVOICE],
  [DocumentType.ORDER]: [DocumentType.INVOICE],
};

const QUOTE_VALIDITY_DAYS = 30;
const DEFAULT_PAYMENT_TERM_DAYS = 14;

// Default texts per document type (salutation is part of the PDF layout, so texts start lower-case).
const DEFAULT_TEXTS: Record<DocumentType, { intro: string; closing: string }> = {
  [DocumentType.QUOTE]: {
    intro: 'vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen die folgenden Leistungen an:',
    closing: 'Wir freuen uns auf Ihren Auftrag und stehen für Rückfragen gerne zur Verfügung.',
  },
  [DocumentType.ORDER]: {
    intro: 'vielen Dank für Ihren Auftrag. Wir bestätigen Ihnen hiermit die folgenden Leistungen:',
    closing: 'Wir danken für das entgegengebrachte Vertrauen und freuen uns auf die Zusammenarbeit.',
  },
  [DocumentType.INVOICE]: {
    intro: 'für die von uns ausgeführten Leistungen berechnen wir Ihnen:',
    // Payment terms, bank details and legal notes are printed automatically from the invoice data.
    closing: 'Vielen Dank für Ihren Auftrag und das entgegengebrachte Vertrauen.',
  },
  [DocumentType.CREDIT_NOTE]: { intro: '', closing: '' },
};

const DOCUMENT_INCLUDE = {
  project: { select: { id: true, number: true, name: true } },
  items: { orderBy: { sortOrder: 'asc' as const } },
  invoiceDetails: true,
  // Document this one was created from, and the documents created from it (conversion chain).
  sourceDocument: { select: { id: true, type: true, number: true, status: true } },
  derivedDocuments: {
    select: { id: true, type: true, number: true, status: true },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.DocumentInclude;

type RecipientFields = {
  recipientName: string | null;
  recipientStreet: string | null;
  recipientZipCode: string | null;
  recipientCity: string | null;
  recipientCountry: string | null;
};

const EMPTY_RECIPIENT: RecipientFields = {
  recipientName: null,
  recipientStreet: null,
  recipientZipCode: null,
  recipientCity: null,
  recipientCountry: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEDUCTION_HEADING = 'Bereits berechnete Abschlagszahlungen (netto)';
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const percentFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const today = () => new Date(new Date().toISOString().slice(0, 10));

function toDate(value: string | null | undefined): Date | null | undefined {
  return value === undefined || value === null ? value : new Date(value);
}

function contactName(contact: Contact): string {
  const person = [contact.salutation, contact.firstName, contact.lastName].filter(Boolean).join(' ');
  return contact.organizationName || person;
}

// Copy of the contact's address, frozen into the document.
function recipientSnapshot(contact: Contact): RecipientFields {
  return {
    recipientName: contactName(contact) || null,
    recipientStreet: contact.street,
    recipientZipCode: contact.zipCode,
    recipientCity: contact.city,
    recipientCountry: contact.country,
  };
}

// Only the fields that were actually sent (undefined = keep, null = clear).
function invoiceDetailsData(dto?: InvoiceDetailsDto) {
  if (!dto) {
    return {};
  }
  return {
    ...(dto.serviceDateFrom !== undefined ? { serviceDateFrom: toDate(dto.serviceDateFrom) } : {}),
    ...(dto.serviceDateTo !== undefined ? { serviceDateTo: toDate(dto.serviceDateTo) } : {}),
    ...(dto.paymentTermDays !== undefined ? { paymentTermDays: dto.paymentTermDays } : {}),
    ...(dto.reverseCharge !== undefined ? { reverseCharge: dto.reverseCharge } : {}),
    ...(dto.retentionPercent !== undefined ? { retentionPercent: dto.retentionPercent } : {}),
    ...(dto.retentionDueDate !== undefined ? { retentionDueDate: toDate(dto.retentionDueDate) } : {}),
    ...(dto.orderReference !== undefined ? { orderReference: dto.orderReference } : {}),
    ...(dto.buyerReference !== undefined ? { buyerReference: dto.buyerReference } : {}),
  };
}

// Defaults of a new invoice: service period = project period (else the invoice date), payment
// term and VAT id from the customer.
function invoiceDefaults(
  project: { startDate: Date | null; endDate: Date | null },
  contact: Contact | null,
  documentDate: Date,
) {
  return {
    serviceDateFrom: project.startDate ?? documentDate,
    serviceDateTo: project.startDate && project.endDate ? project.endDate : null,
    paymentTermDays: contact?.paymentTermDays ?? DEFAULT_PAYMENT_TERM_DAYS,
    recipientVatId: contact?.vatId ?? null,
  };
}

// A stored line as DTO, e.g. to copy it into another document.
function itemToDto(item: {
  kind: DocumentItemKind;
  catalogItemId: string | null;
  oz: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  quantity: Prisma.Decimal;
  unit: string;
  unitPrice: Prisma.Decimal;
  vatRate: Prisma.Decimal;
  discountPercent: Prisma.Decimal;
  isOptional: boolean;
  deductsDocumentId: string | null;
}): DocumentItemDto {
  return {
    kind: item.kind,
    catalogItemId: item.catalogItemId ?? undefined,
    oz: item.oz ?? undefined,
    sku: item.sku ?? undefined,
    name: item.name,
    description: item.description ?? undefined,
    quantity: item.quantity.toNumber(),
    unit: item.unit,
    unitPrice: item.unitPrice.toNumber(),
    vatRate: item.vatRate.toNumber(),
    discountPercent: item.discountPercent.toNumber(),
    isOptional: item.isOptional,
    deductsDocumentId: item.deductsDocumentId ?? undefined,
  };
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numberSequences: NumberSequencesService,
  ) {}

  async findAll(companyId: string, query: ListDocumentsQueryDto) {
    const where: Prisma.DocumentWhereInput = {
      companyId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.q
        ? {
            OR: [
              { number: { contains: query.q, mode: 'insensitive' } },
              { subject: { contains: query.q, mode: 'insensitive' } },
              { recipientName: { contains: query.q, mode: 'insensitive' } },
              { project: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        include: { project: DOCUMENT_INCLUDE.project, invoiceDetails: { select: { kind: true, partialNumber: true } } },
        orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.document.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(companyId: string, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, companyId },
      include: DOCUMENT_INCLUDE,
    });
    if (!document) {
      throw new NotFoundException();
    }
    return document;
  }

  async create(companyId: string, projectId: string, dto: CreateDocumentDto) {
    if (!SUPPORTED_TYPES.includes(dto.type)) {
      throw new BadRequestException('Dieser Dokumenttyp wird noch nicht unterstützt.');
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      include: { customer: true },
    });
    if (!project) {
      throw new NotFoundException();
    }

    // Recipient defaults to the project's customer.
    const contact = dto.recipientContactId
      ? await this.requireContact(companyId, dto.recipientContactId)
      : project.customer;
    const documentDate = dto.documentDate ? new Date(dto.documentDate) : today();
    // Only quotes have a validity period.
    const validUntil =
      dto.type !== DocumentType.QUOTE
        ? null
        : dto.validUntil
          ? new Date(dto.validUntil)
          : new Date(documentDate.getTime() + QUOTE_VALIDITY_DAYS * DAY_MS);
    const texts = DEFAULT_TEXTS[dto.type];

    const id = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          companyId,
          projectId,
          type: dto.type,
          recipientContactId: contact?.id,
          ...(contact ? recipientSnapshot(contact) : EMPTY_RECIPIENT),
          subject: dto.subject ?? project.name,
          introText: dto.introText ?? texts.intro,
          closingText: dto.closingText ?? texts.closing,
          documentDate,
          validUntil,
        },
      });
      if (dto.type === DocumentType.INVOICE) {
        await tx.invoiceDetails.create({
          data: {
            documentId: document.id,
            ...invoiceDefaults(project, contact ?? null, documentDate),
            ...invoiceDetailsData(dto.invoice),
          },
        });
      }
      if (dto.items) {
        await this.replaceItems(tx, document.id, dto.items);
      }
      await this.recalculateTotals(tx, document.id);
      return document.id;
    });
    return this.findOne(companyId, id);
  }

  // Drafts only: issued documents are legal records and locked (duplicate them to revise).
  async update(companyId: string, id: string, dto: UpdateDocumentDto) {
    const existing = await this.findOne(companyId, id);
    this.assertDraft(existing.status);

    const { items, recipientContactId, documentDate, validUntil, invoice, ...fields } = dto;
    let recipient: Partial<RecipientFields> & { recipientContactId?: string | null } = {};
    // The recipient's VAT id is part of an invoice and follows the chosen contact.
    let recipientVatId: string | null | undefined;
    if (recipientContactId !== undefined) {
      if (recipientContactId === null) {
        recipient = { recipientContactId: null, ...EMPTY_RECIPIENT };
        recipientVatId = null;
      } else {
        const contact = await this.requireContact(companyId, recipientContactId);
        recipient = { recipientContactId: contact.id, ...recipientSnapshot(contact) };
        recipientVatId = contact.vatId;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id },
        data: {
          ...fields,
          ...recipient,
          documentDate: documentDate ? new Date(documentDate) : undefined,
          validUntil: toDate(validUntil),
        },
      });
      if (existing.type === DocumentType.INVOICE && (invoice || recipientVatId !== undefined)) {
        const data = {
          ...invoiceDetailsData(invoice),
          ...(recipientVatId !== undefined ? { recipientVatId } : {}),
        };
        await tx.invoiceDetails.upsert({
          where: { documentId: id },
          create: { documentId: id, ...data },
          update: data,
        });
      }
      if (items) {
        await this.replaceItems(tx, id, items);
      }
      await this.recalculateTotals(tx, id);
    });
    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string) {
    const existing = await this.findOne(companyId, id);
    this.assertDraft(existing.status);
    await this.prisma.document.delete({ where: { id } });
  }

  // Issues the document: assigns the next gap-free number, refreshes the recipient snapshot from
  // the contact and locks the content.
  // Pre-issue check for the editor: problems that would block issuing (invoices only).
  async issues(companyId: string, id: string): Promise<{ issues: string[] }> {
    const document = await this.findOne(companyId, id);
    if (document.type !== DocumentType.INVOICE || document.status !== DocumentStatus.DRAFT) {
      return { issues: [] };
    }
    const [company, contact] = await this.loadIssuerAndRecipient(companyId, document.recipientContactId);
    return {
      issues: [
        ...this.checkInvoice(document, company, contact),
        ...(await this.billingProblems(companyId, document)),
      ],
    };
  }

  // Issues the document: assigns the next gap-free number, refreshes the recipient snapshot from
  // the contact, freezes the sender data and locks the content. Invoices must be complete first.
  async finalize(companyId: string, id: string) {
    const document = await this.findOne(companyId, id);
    this.assertDraft(document.status);
    if (!ISSUABLE_TYPES.includes(document.type)) {
      throw new ConflictException('Dieser Dokumenttyp kann noch nicht ausgestellt werden.');
    }
    if (!document.items.some((item) => item.kind === DocumentItemKind.POSITION)) {
      throw new BadRequestException('Das Dokument enthält keine Positionen.');
    }
    const [company, contact] = await this.loadIssuerAndRecipient(companyId, document.recipientContactId);
    const snapshot = contact ? recipientSnapshot(contact) : document;
    if (!snapshot.recipientName) {
      throw new BadRequestException('Bitte zuerst einen Empfänger angeben.');
    }
    if (document.type === DocumentType.INVOICE) {
      const problems = [
        ...this.checkInvoice(document, company, contact),
        ...(await this.billingProblems(companyId, document)),
      ];
      if (problems.length > 0) {
        throw new BadRequestException(['Die Rechnung ist unvollständig:', ...problems]);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const number = await this.numberSequences.next(tx, companyId, document.type);
      await tx.document.update({
        where: { id },
        data: {
          number,
          status: DocumentStatus.SENT,
          finalizedAt: new Date(),
          issuerSnapshot: issuerSnapshotOf(company),
          ...(contact ? recipientSnapshot(contact) : {}),
        },
      });
      if (document.type === DocumentType.INVOICE) {
        // The due date is fixed at issue time: invoice date + payment term.
        const dueDate = new Date(
          document.documentDate.getTime() +
            (document.invoiceDetails?.paymentTermDays ?? DEFAULT_PAYMENT_TERM_DAYS) * DAY_MS,
        );
        const percent = document.invoiceDetails?.retentionPercent;
        const retentionAmount =
          percent && percent.gt(0)
            ? document.grossTotal.mul(percent).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            : null;
        await tx.invoiceDetails.update({
          where: { documentId: id },
          data: {
            dueDate,
            retentionAmount,
            recipientVatId: contact?.vatId ?? document.invoiceDetails?.recipientVatId ?? null,
          },
        });
      }
    });
    return this.findOne(companyId, id);
  }

  private async loadIssuerAndRecipient(
    companyId: string,
    contactId: string | null,
  ): Promise<[Company, Contact | null]> {
    const [company, contact] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      contactId ? this.prisma.contact.findFirst({ where: { id: contactId, companyId } }) : null,
    ]);
    return [company, contact];
  }

  private checkInvoice(
    document: Awaited<ReturnType<DocumentsService['findOne']>>,
    company: Company,
    contact: Contact | null,
  ): string[] {
    const recipient = contact ? recipientSnapshot(contact) : document;
    const details = document.invoiceDetails;
    return validateInvoice({
      issuer: company,
      recipient: {
        name: recipient.recipientName,
        street: recipient.recipientStreet,
        zipCode: recipient.recipientZipCode,
        city: recipient.recipientCity,
      },
      details: {
        serviceDateFrom: details?.serviceDateFrom,
        serviceDateTo: details?.serviceDateTo,
        paymentTermDays: details?.paymentTermDays,
        reverseCharge: details?.reverseCharge ?? false,
        recipientVatId: contact?.vatId ?? details?.recipientVatId,
        kind: details?.kind,
        retentionPercent: details?.retentionPercent?.toNumber() ?? null,
        retentionDueDate: details?.retentionDueDate,
      },
      items: document.items,
    });
  }

  // Customer's decision on a sent quote.
  async setStatus(companyId: string, id: string, status: DocumentStatus) {
    const document = await this.findOne(companyId, id);
    if (document.type !== DocumentType.QUOTE || document.status !== DocumentStatus.SENT) {
      throw new ConflictException('Nur versendete Angebote können angenommen oder abgelehnt werden.');
    }
    await this.prisma.document.update({ where: { id }, data: { status } });
    return this.findOne(companyId, id);
  }

  // New draft with the same content (e.g. to revise a sent quote).
  async duplicate(companyId: string, id: string) {
    const source = await this.findOne(companyId, id);
    const copyId = await this.copyToNewDraft(companyId, source, source.type, {});
    return this.findOne(companyId, copyId);
  }

  // Takes over a document into the next stage of the chain without retyping anything:
  // quote -> order, quote -> invoice, order -> invoice. The new draft keeps a link to its source.
  async convert(companyId: string, id: string, dto: ConvertDocumentDto) {
    const targetType = dto.targetType;
    const source = await this.findOne(companyId, id);
    if (!CONVERSIONS[source.type]?.includes(targetType)) {
      throw new BadRequestException('Diese Übernahme ist nicht möglich.');
    }

    if (source.type === DocumentType.QUOTE) {
      // A rejected or not yet issued quote cannot become an order or invoice.
      if (source.status !== DocumentStatus.SENT && source.status !== DocumentStatus.ACCEPTED) {
        throw new ConflictException('Nur ausgestellte, nicht abgelehnte Angebote können übernommen werden.');
      }
    } else if (source.status !== DocumentStatus.SENT) {
      throw new ConflictException('Nur ausgestellte Dokumente können übernommen werden.');
    }
    if (
      targetType === DocumentType.ORDER &&
      source.derivedDocuments.some((derived) => derived.type === DocumentType.ORDER)
    ) {
      throw new ConflictException('Zu diesem Angebot existiert bereits eine Auftragsbestätigung.');
    }

    const kind = targetType === DocumentType.INVOICE ? (dto.invoiceKind ?? InvoiceKind.STANDARD) : null;
    const texts = DEFAULT_TEXTS[targetType];
    let copyId: string;
    if (kind === InvoiceKind.PARTIAL || kind === InvoiceKind.FINAL) {
      copyId = await this.createContractInvoice(companyId, source, kind, dto);
    } else {
      copyId = await this.copyToNewDraft(companyId, source, targetType, {
        sourceDocumentId: source.id,
        introText: texts.intro,
        closingText: texts.closing,
      });
    }

    // Handing a sent quote on to an order/invoice means the customer accepted it.
    if (source.type === DocumentType.QUOTE && source.status === DocumentStatus.SENT) {
      await this.prisma.document.update({
        where: { id: source.id },
        data: { status: DocumentStatus.ACCEPTED },
      });
    }
    return this.findOne(companyId, copyId);
  }

  // ------------------------------------------------------------ contract billing

  // Ids of all documents that belong to the same contract as `document`: the quote, its order(s).
  // Partial and final invoices point to one of them as their source.
  private contractIds(document: {
    id: string;
    sourceDocumentId: string | null;
    derivedDocuments: { id: string; type: DocumentType }[];
  }): string[] {
    return [
      document.id,
      ...(document.sourceDocumentId ? [document.sourceDocumentId] : []),
      ...document.derivedDocuments
        .filter((derived) => derived.type === DocumentType.ORDER)
        .map((derived) => derived.id),
    ];
  }

  private invoicesOfContract(companyId: string, ids: string[]) {
    return this.prisma.document.findMany({
      where: { companyId, type: DocumentType.INVOICE, sourceDocumentId: { in: ids } },
      include: { invoiceDetails: true, items: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Partial invoice (Abschlagsrechnung) or final invoice (Schlussrechnung) from a quote/order.
  private async createContractInvoice(
    companyId: string,
    source: Awaited<ReturnType<DocumentsService['findOne']>>,
    kind: InvoiceKind,
    dto: ConvertDocumentDto,
  ) {
    if (
      source.type === DocumentType.QUOTE &&
      source.derivedDocuments.some((derived) => derived.type === DocumentType.ORDER)
    ) {
      throw new ConflictException(
        'Zu diesem Angebot gibt es eine Auftragsbestätigung – bitte von dort abrechnen.',
      );
    }
    const invoices = await this.invoicesOfContract(companyId, this.contractIds(source));
    if (
      invoices.some(
        (invoice) =>
          invoice.invoiceDetails?.kind === InvoiceKind.FINAL && invoice.status !== DocumentStatus.DRAFT,
      )
    ) {
      throw new ConflictException('Es wurde bereits eine Schlussrechnung ausgestellt.');
    }
    const partials = invoices.filter((invoice) => invoice.invoiceDetails?.kind === InvoiceKind.PARTIAL);
    const totals = calculateTotals(source.items);
    const label =
      `${source.type === DocumentType.ORDER ? 'Auftragsbestätigung' : 'Angebot'} ${source.number ?? ''}`.trim();

    if (kind === InvoiceKind.PARTIAL) {
      if (dto.percent === undefined && dto.netAmount === undefined) {
        throw new BadRequestException(
          'Bitte einen Prozentsatz oder einen Nettobetrag für die Abschlagszahlung angeben.',
        );
      }
      const target =
        dto.percent !== undefined
          ? amountFromPercent(totals.net, dto.percent)
          : new Prisma.Decimal(dto.netAmount!);
      const alreadyPlanned = partials.reduce(
        (sum, invoice) => sum.plus(invoice.netTotal),
        new Prisma.Decimal(0),
      );
      if (target.lte(0)) {
        throw new BadRequestException('Der Abschlagsbetrag muss größer als 0 € sein.');
      }
      if (alreadyPlanned.plus(target).gt(totals.net)) {
        throw new ConflictException(
          `Die Abschlagszahlungen würden den Auftragswert überschreiten (bereits ${money.format(alreadyPlanned.toNumber())} von ${money.format(totals.net.toNumber())} netto).`,
        );
      }

      // Highest number + 1 (not the count), so numbers stay unique even if a draft was deleted.
      const number = partials.reduce((max, invoice) => Math.max(max, invoice.invoiceDetails?.partialNumber ?? 0), 0) + 1;
      const share = percentFormat.format(dto.percent ?? target.div(totals.net).mul(100).toNumber());
      const parts = splitPartialAmount(totals.vatGroups, target).filter((part) => !part.net.isZero());
      const items: DocumentItemDto[] = parts.map((part) => ({
        kind: DocumentItemKind.POSITION,
        name: `Abschlagszahlung Nr. ${number}${parts.length > 1 ? ` (${percentFormat.format(part.vatRate.toNumber())} % USt)` : ''}`,
        description: `${share} % der Auftragssumme von ${money.format(totals.net.toNumber())} (netto) gemäß ${label}`,
        quantity: 1,
        unit: 'psch',
        unitPrice: part.net.toNumber(),
        vatRate: part.vatRate.toNumber(),
        discountPercent: 0,
        isOptional: false,
      }));
      return this.copyToNewDraft(companyId, source, DocumentType.INVOICE, {
        sourceDocumentId: source.id,
        introText: 'für die vertraglich vereinbarte Abschlagszahlung berechnen wir Ihnen:',
        closingText: 'Dies ist eine Abschlagsrechnung. Die Schlussabrechnung bleibt vorbehalten.',
        items,
        invoice: { kind: InvoiceKind.PARTIAL, partialNumber: number },
      });
    }

    // Final invoice: all services of the contract, minus the partial invoices already issued.
    const items = [
      ...source.items.map(itemToDto),
      ...this.deductionLines(partials.filter((invoice) => invoice.status !== DocumentStatus.DRAFT)),
    ];
    return this.copyToNewDraft(companyId, source, DocumentType.INVOICE, {
      sourceDocumentId: source.id,
      introText: 'für die von uns ausgeführten Leistungen berechnen wir Ihnen abschließend:',
      closingText: DEFAULT_TEXTS[DocumentType.INVOICE].closing,
      items,
      invoice: { kind: InvoiceKind.FINAL },
    });
  }

  // Negative lines that deduct issued partial invoices (net per VAT rate), preceded by a heading.
  private deductionLines(
    partials: Awaited<ReturnType<DocumentsService['invoicesOfContract']>>,
  ): DocumentItemDto[] {
    if (partials.length === 0) {
      return [];
    }
    const lines: DocumentItemDto[] = [{ kind: DocumentItemKind.HEADING, name: DEDUCTION_HEADING }];
    for (const partial of partials) {
      const groups = calculateTotals(partial.items).vatGroups;
      for (const group of groups) {
        lines.push({
          kind: DocumentItemKind.POSITION,
          name: `abzüglich Abschlagsrechnung Nr. ${partial.invoiceDetails?.partialNumber ?? ''} (${partial.number ?? 'Entwurf'} vom ${partial.documentDate.toLocaleDateString('de-DE', { timeZone: 'UTC' })})`.replace(
            '  ',
            ' ',
          ),
          description:
            groups.length > 1
              ? `Anteil mit ${percentFormat.format(group.vatRate.toNumber())} % USt`
              : undefined,
          quantity: 1,
          unit: 'psch',
          unitPrice: group.net.negated().toNumber(),
          vatRate: group.vatRate.toNumber(),
          discountPercent: 0,
          isOptional: false,
          deductsDocumentId: partial.id,
        });
      }
    }
    return lines;
  }

  // Final invoice draft: drops the old deduction lines and adds them again for every partial
  // invoice issued so far (e.g. after another partial invoice was issued in the meantime).
  async refreshDeductions(companyId: string, id: string) {
    const document = await this.findOne(companyId, id);
    this.assertDraft(document.status);
    if (document.invoiceDetails?.kind !== InvoiceKind.FINAL) {
      throw new BadRequestException('Nur bei einer Schlussrechnung möglich.');
    }
    const source = document.sourceDocumentId
      ? await this.prisma.document.findFirst({
          where: { id: document.sourceDocumentId, companyId },
          include: { derivedDocuments: { select: { id: true, type: true } } },
        })
      : null;
    const ids = source ? this.contractIds(source) : [];
    const partials = (await this.invoicesOfContract(companyId, ids)).filter(
      (invoice) =>
        invoice.invoiceDetails?.kind === InvoiceKind.PARTIAL && invoice.status !== DocumentStatus.DRAFT,
    );
    const kept = document.items.filter(
      (item) =>
        !item.deductsDocumentId &&
        !(item.kind === DocumentItemKind.HEADING && item.name === DEDUCTION_HEADING),
    );
    await this.prisma.$transaction(async (tx) => {
      await this.replaceItems(tx, id, [...kept.map(itemToDto), ...this.deductionLines(partials)]);
      await this.recalculateTotals(tx, id);
    });
    return this.findOne(companyId, id);
  }

  // Billing overview of a contract: what was invoiced so far and what is still open (net).
  async billing(companyId: string, id: string) {
    const contract = await this.findOne(companyId, id);
    if (contract.type !== DocumentType.QUOTE && contract.type !== DocumentType.ORDER) {
      throw new BadRequestException('Nur für Angebote und Aufträge.');
    }
    const invoices = await this.invoicesOfContract(companyId, this.contractIds(contract));
    // Drafts are planned, not billed yet. The final invoice adds only its remainder because the
    // partial invoices it deducts are counted on their own.
    const billedNet = invoices
      .filter((invoice) => invoice.status !== DocumentStatus.DRAFT)
      .reduce((sum, invoice) => sum.plus(invoice.netTotal), new Prisma.Decimal(0));
    const openNet = contract.netTotal.minus(billedNet);
    return {
      contractNet: contract.netTotal,
      contractGross: contract.grossTotal,
      billedNet,
      openNet,
      percentBilled: contract.netTotal.isZero()
        ? 0
        : billedNet.div(contract.netTotal).mul(100).toDecimalPlaces(1).toNumber(),
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        kind: invoice.invoiceDetails?.kind ?? InvoiceKind.STANDARD,
        partialNumber: invoice.invoiceDetails?.partialNumber ?? null,
        documentDate: invoice.documentDate,
        netTotal: invoice.netTotal,
        grossTotal: invoice.grossTotal,
      })),
    };
  }

  // Problems that only show when the whole contract is looked at (final invoice).
  private async billingProblems(
    companyId: string,
    document: Awaited<ReturnType<DocumentsService['findOne']>>,
  ): Promise<string[]> {
    if (document.invoiceDetails?.kind !== InvoiceKind.FINAL || !document.sourceDocumentId) {
      return [];
    }
    const source = await this.prisma.document.findFirst({
      where: { id: document.sourceDocumentId, companyId },
      include: { derivedDocuments: { select: { id: true, type: true } } },
    });
    if (!source) {
      return [];
    }
    const invoices = await this.invoicesOfContract(companyId, this.contractIds(source));
    const problems: string[] = [];
    const deducted = new Set(document.items.map((item) => item.deductsDocumentId).filter(Boolean));
    for (const invoice of invoices) {
      if (invoice.id === document.id) {
        continue;
      }
      const details = invoice.invoiceDetails;
      if (details?.kind === InvoiceKind.FINAL && invoice.status !== DocumentStatus.DRAFT) {
        problems.push('Es wurde bereits eine Schlussrechnung ausgestellt.');
      }
      if (details?.kind === InvoiceKind.PARTIAL) {
        const name = `Abschlagsrechnung Nr. ${details.partialNumber ?? ''}`.trim();
        if (invoice.status === DocumentStatus.DRAFT) {
          problems.push(`${name} ist noch ein Entwurf: bitte zuerst ausstellen oder löschen.`);
        } else if (!deducted.has(invoice.id)) {
          problems.push(
            `${name} (${invoice.number}) ist nicht abgezogen: bitte „Abzüge aktualisieren" wählen.`,
          );
        }
      }
    }
    return problems;
  }

  // Creates a draft of `type` with the recipient, subject and all lines of `source`. `items`
  // replaces the copied lines (used for partial invoices); `invoice` sets the kind of a new invoice.
  private async copyToNewDraft(
    companyId: string,
    source: Awaited<ReturnType<DocumentsService['findOne']>>,
    type: DocumentType,
    overrides: {
      sourceDocumentId?: string;
      introText?: string | null;
      closingText?: string | null;
      items?: DocumentItemDto[];
      invoice?: { kind: InvoiceKind; partialNumber?: number };
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const copy = await tx.document.create({
        data: {
          companyId,
          projectId: source.projectId,
          type,
          sourceDocumentId: overrides.sourceDocumentId,
          recipientContactId: source.recipientContactId,
          recipientName: source.recipientName,
          recipientStreet: source.recipientStreet,
          recipientZipCode: source.recipientZipCode,
          recipientCity: source.recipientCity,
          recipientCountry: source.recipientCountry,
          subject: source.subject,
          introText: overrides.introText === undefined ? source.introText : overrides.introText,
          closingText: overrides.closingText === undefined ? source.closingText : overrides.closingText,
          documentDate: today(),
          validUntil:
            type === DocumentType.QUOTE ? new Date(Date.now() + QUOTE_VALIDITY_DAYS * DAY_MS) : null,
        },
      });
      await this.replaceItems(tx, copy.id, overrides.items ?? source.items.map(itemToDto));
      if (type === DocumentType.INVOICE) {
        // A copied invoice keeps its invoice data (the due date is set again when it is issued);
        // a new invoice gets the defaults from the project and the customer.
        const old = source.invoiceDetails;
        const project = await tx.project.findUniqueOrThrow({ where: { id: source.projectId } });
        const contact = source.recipientContactId
          ? await tx.contact.findUnique({ where: { id: source.recipientContactId } })
          : null;
        await tx.invoiceDetails.create({
          data: {
            documentId: copy.id,
            ...invoiceDefaults(project, contact, copy.documentDate),
            kind: overrides.invoice?.kind ?? old?.kind ?? InvoiceKind.STANDARD,
            partialNumber: overrides.invoice?.partialNumber ?? old?.partialNumber ?? null,
            ...(old
              ? {
                  serviceDateFrom: old.serviceDateFrom,
                  serviceDateTo: old.serviceDateTo,
                  paymentTermDays: old.paymentTermDays,
                  reverseCharge: old.reverseCharge,
                  retentionPercent: old.retentionPercent,
                  retentionDueDate: old.retentionDueDate,
                  orderReference: old.orderReference,
                  buyerReference: old.buyerReference,
                }
              : {}),
          },
        });
      }
      await this.recalculateTotals(tx, copy.id);
      return copy.id;
    });
  }

  private assertDraft(status: DocumentStatus) {
    if (status !== DocumentStatus.DRAFT) {
      throw new ConflictException(
        'Ausgestellte Dokumente sind gesperrt. Bitte duplizieren und den Entwurf ändern.',
      );
    }
  }

  private async requireContact(companyId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, companyId } });
    if (!contact) {
      throw new BadRequestException('Empfänger nicht gefunden.');
    }
    return contact;
  }

  // Replaces all lines. Catalog references are only kept when the entry belongs to the same company.
  private async replaceItems(tx: Prisma.TransactionClient, documentId: string, items: DocumentItemDto[]) {
    const document = await tx.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { companyId: true },
    });
    const catalogIds = [
      ...new Set(items.map((item) => item.catalogItemId).filter((id): id is string => !!id)),
    ];
    const validCatalogIds = new Set(
      (
        await tx.catalogItem.findMany({
          where: { id: { in: catalogIds }, companyId: document.companyId },
          select: { id: true },
        })
      ).map((entry) => entry.id),
    );
    if (validCatalogIds.size !== catalogIds.length) {
      throw new BadRequestException('Katalogeintrag nicht gefunden.');
    }

    // Deduction lines may only point to invoices of the same company.
    const deductIds = [
      ...new Set(items.map((item) => item.deductsDocumentId).filter((id): id is string => !!id)),
    ];
    if (deductIds.length > 0) {
      const found = await tx.document.count({
        where: { id: { in: deductIds }, companyId: document.companyId, type: DocumentType.INVOICE },
      });
      if (found !== deductIds.length) {
        throw new BadRequestException('Abzugsposition verweist auf eine unbekannte Rechnung.');
      }
    }

    await tx.documentItem.deleteMany({ where: { documentId } });
    await tx.documentItem.createMany({
      data: items.map((item, index) => {
        const values = {
          kind: item.kind ?? DocumentItemKind.POSITION,
          quantity: item.quantity ?? 1,
          unitPrice: item.unitPrice ?? 0,
          vatRate: item.vatRate ?? 19,
          discountPercent: item.discountPercent ?? 0,
          isOptional: item.isOptional ?? false,
        };
        return {
          documentId,
          sortOrder: index,
          ...values,
          catalogItemId: item.catalogItemId,
          deductsDocumentId: item.deductsDocumentId,
          oz: item.oz,
          sku: item.sku,
          name: item.name,
          description: item.description,
          unit: item.unit ?? 'Stk',
          lineTotal: lineTotal(values),
        };
      }),
    });
  }

  private async recalculateTotals(tx: Prisma.TransactionClient, documentId: string) {
    const items = await tx.documentItem.findMany({ where: { documentId } });
    const totals = calculateTotals(items);
    await tx.document.update({
      where: { id: documentId },
      data: { netTotal: totals.net, vatTotal: totals.vat, grossTotal: totals.gross },
    });
  }
}
