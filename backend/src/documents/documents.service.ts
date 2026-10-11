import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Contact, DocumentItemKind, DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import { NumberSequencesService } from '../companies/number-sequences/number-sequences.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { calculateTotals, lineTotal } from './calculations';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentItemDto } from './dto/document-item.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

// Only quotes are implemented so far; orders and invoices follow in the next steps of the block.
const SUPPORTED_TYPES: DocumentType[] = [DocumentType.QUOTE];

const DEFAULT_QUOTE_INTRO = 'vielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen die folgenden Leistungen an:';
const DEFAULT_QUOTE_CLOSING = 'Wir freuen uns auf Ihren Auftrag und stehen für Rückfragen gerne zur Verfügung.';
const QUOTE_VALIDITY_DAYS = 30;

const DOCUMENT_INCLUDE = {
  project: { select: { id: true, number: true, name: true } },
  items: { orderBy: { sortOrder: 'asc' as const } },
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
        include: { project: DOCUMENT_INCLUDE.project },
        orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.document.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(companyId: string, id: string) {
    const document = await this.prisma.document.findFirst({ where: { id, companyId }, include: DOCUMENT_INCLUDE });
    if (!document) {
      throw new NotFoundException();
    }
    return document;
  }

  async create(companyId: string, projectId: string, dto: CreateDocumentDto) {
    if (!SUPPORTED_TYPES.includes(dto.type)) {
      throw new BadRequestException('Dieser Dokumenttyp wird noch nicht unterstützt.');
    }
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId }, include: { customer: true } });
    if (!project) {
      throw new NotFoundException();
    }

    // Recipient defaults to the project's customer.
    const contact = dto.recipientContactId ? await this.requireContact(companyId, dto.recipientContactId) : project.customer;
    const documentDate = dto.documentDate ? new Date(dto.documentDate) : new Date(new Date().toISOString().slice(0, 10));
    const validUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : new Date(documentDate.getTime() + QUOTE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

    const id = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          companyId,
          projectId,
          type: dto.type,
          recipientContactId: contact?.id,
          ...(contact ? recipientSnapshot(contact) : EMPTY_RECIPIENT),
          subject: dto.subject ?? project.name,
          introText: dto.introText ?? DEFAULT_QUOTE_INTRO,
          closingText: dto.closingText ?? DEFAULT_QUOTE_CLOSING,
          documentDate,
          validUntil,
        },
      });
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

    const { items, recipientContactId, documentDate, validUntil, ...fields } = dto;
    let recipient: Partial<RecipientFields> & { recipientContactId?: string | null } = {};
    if (recipientContactId !== undefined) {
      if (recipientContactId === null) {
        recipient = { recipientContactId: null, ...EMPTY_RECIPIENT };
      } else {
        const contact = await this.requireContact(companyId, recipientContactId);
        recipient = { recipientContactId: contact.id, ...recipientSnapshot(contact) };
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
  async finalize(companyId: string, id: string) {
    const document = await this.findOne(companyId, id);
    this.assertDraft(document.status);
    if (!document.items.some((item) => item.kind === DocumentItemKind.POSITION)) {
      throw new BadRequestException('Das Dokument enthält keine Positionen.');
    }
    const contact = document.recipientContactId
      ? await this.prisma.contact.findFirst({ where: { id: document.recipientContactId, companyId } })
      : null;
    const snapshot = contact ? recipientSnapshot(contact) : document;
    if (!snapshot.recipientName) {
      throw new BadRequestException('Bitte zuerst einen Empfänger angeben.');
    }

    await this.prisma.$transaction(async (tx) => {
      const number = await this.numberSequences.next(tx, companyId, document.type);
      await tx.document.update({
        where: { id },
        data: { number, status: DocumentStatus.SENT, finalizedAt: new Date(), ...(contact ? recipientSnapshot(contact) : {}) },
      });
    });
    return this.findOne(companyId, id);
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
    const copyId = await this.prisma.$transaction(async (tx) => {
      const copy = await tx.document.create({
        data: {
          companyId,
          projectId: source.projectId,
          type: source.type,
          recipientContactId: source.recipientContactId,
          recipientName: source.recipientName,
          recipientStreet: source.recipientStreet,
          recipientZipCode: source.recipientZipCode,
          recipientCity: source.recipientCity,
          recipientCountry: source.recipientCountry,
          subject: source.subject,
          introText: source.introText,
          closingText: source.closingText,
          documentDate: new Date(new Date().toISOString().slice(0, 10)),
          validUntil: new Date(Date.now() + QUOTE_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      await this.replaceItems(
        tx,
        copy.id,
        source.items.map((item) => ({
          kind: item.kind,
          catalogItemId: item.catalogItemId ?? undefined,
          sku: item.sku ?? undefined,
          name: item.name,
          description: item.description ?? undefined,
          quantity: item.quantity.toNumber(),
          unit: item.unit,
          unitPrice: item.unitPrice.toNumber(),
          vatRate: item.vatRate.toNumber(),
          discountPercent: item.discountPercent.toNumber(),
          isOptional: item.isOptional,
        })),
      );
      await this.recalculateTotals(tx, copy.id);
      return copy.id;
    });
    return this.findOne(companyId, copyId);
  }

  private assertDraft(status: DocumentStatus) {
    if (status !== DocumentStatus.DRAFT) {
      throw new ConflictException('Ausgestellte Dokumente sind gesperrt. Bitte duplizieren und den Entwurf ändern.');
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
    const document = await tx.document.findUniqueOrThrow({ where: { id: documentId }, select: { companyId: true } });
    const catalogIds = [...new Set(items.map((item) => item.catalogItemId).filter((id): id is string => !!id))];
    const validCatalogIds = new Set(
      (await tx.catalogItem.findMany({ where: { id: { in: catalogIds }, companyId: document.companyId }, select: { id: true } })).map(
        (entry) => entry.id,
      ),
    );
    if (validCatalogIds.size !== catalogIds.length) {
      throw new BadRequestException('Katalogeintrag nicht gefunden.');
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
