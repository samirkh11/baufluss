import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { IncomingInvoiceSource, IncomingInvoiceStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { NumberSequencesService } from '../companies/number-sequences/number-sequences.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ListIncomingInvoicesQueryDto, UpdateIncomingInvoiceDto } from './dto/incoming-invoice.dto';
import { approvalIssues } from './incoming-invoice-validation';
import { EInvoiceReadError, ParsedEInvoice, readEInvoice } from './e-invoice-reader';
import { deleteInvoiceFile, sha256, storeInvoiceFile, validateInvoiceFile } from './incoming-invoice-storage';

const NUMBER_TYPE = 'INCOMING_INVOICE';

const INCLUDE = {
  supplier: { select: { id: true, number: true, organizationName: true, firstName: true, lastName: true } },
  project: { select: { id: true, number: true, name: true } },
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.IncomingInvoiceInclude;

@Injectable()
export class IncomingInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: NumberSequencesService,
  ) {}

  async findAll(companyId: string, query: ListIncomingInvoicesQueryDto) {
    const where: Prisma.IncomingInvoiceWhereInput = { companyId };
    if (query.status) where.status = query.status;
    if (query.projectId) where.projectId = query.projectId;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { supplierName: { contains: q, mode: 'insensitive' } },
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { number: { contains: q, mode: 'insensitive' } },
        { supplier: { organizationName: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const items = await this.prisma.incomingInvoice.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ createdAt: 'desc' }],
    });

    // Totals over the whole company (not the filter): what is waiting and what is approved to pay.
    const grouped = await this.prisma.incomingInvoice.groupBy({
      by: ['status'],
      where: { companyId },
      _sum: { grossAmount: true },
      _count: true,
    });
    const totals = Object.fromEntries(
      grouped.map((g) => [g.status, { count: g._count, gross: (g._sum.grossAmount ?? new Prisma.Decimal(0)).toFixed(2) }]),
    );
    return { items, totals };
  }

  async findOne(companyId: string, id: string) {
    const invoice = await this.prisma.incomingInvoice.findFirst({ where: { id, companyId }, include: INCLUDE });
    if (!invoice) {
      throw new NotFoundException('Eingangsrechnung nicht gefunden.');
    }
    return { ...invoice, issues: this.issuesOf(invoice), duplicateOf: await this.findDuplicate(invoice) };
  }

  // Creates an invoice from an uploaded file. The data is captured afterwards via update().
  async createFromUpload(user: AuthenticatedUser, file: Express.Multer.File) {
    const extension = validateInvoiceFile(file);
    const hash = sha256(file.buffer);
    const same = await this.prisma.incomingInvoice.findFirst({
      where: { companyId: user.companyId, fileHash: hash },
      select: { number: true },
    });
    if (same) {
      throw new ConflictException(`Diese Datei wurde bereits hochgeladen (${same.number}).`);
    }

    // Structured e-invoices (XRechnung XML, ZUGFeRD PDF) prefill the captured data. A plain PDF/image is
    // simply stored; an XML file that is not an e-invoice is refused.
    let parsed: ParsedEInvoice | null = null;
    try {
      parsed = await readEInvoice(file.buffer, extension);
    } catch (error) {
      if (extension === '.xml') {
        throw new BadRequestException(error instanceof EInvoiceReadError ? error.message : 'Die E-Rechnung konnte nicht gelesen werden.');
      }
    }
    const prefill = parsed ? await this.prefillFrom(user.companyId, parsed) : {};

    const filePath = await storeInvoiceFile(user.companyId, extension, file.buffer);
    try {
      const created = await this.prisma.$transaction(async (tx) =>
        tx.incomingInvoice.create({
          data: {
            ...prefill,
            companyId: user.companyId,
            number: await this.numbers.next(tx, user.companyId, NUMBER_TYPE),
            source: IncomingInvoiceSource.UPLOAD,
            filePath,
            fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
            mimeType: file.mimetype,
            fileSize: file.size,
            fileHash: hash,
            uploadedById: user.id,
          },
        }),
      );
      return this.findOne(user.companyId, created.id);
    } catch (error) {
      await deleteInvoiceFile(filePath);
      throw error;
    }
  }

  // Captures an invoice without a file (e.g. received on paper and keyed in).
  async createManual(user: AuthenticatedUser, dto: UpdateIncomingInvoiceDto) {
    const data = await this.toData(user.companyId, dto);
    const created = await this.prisma.$transaction(async (tx) =>
      tx.incomingInvoice.create({
        data: {
          ...data,
          companyId: user.companyId,
          number: await this.numbers.next(tx, user.companyId, NUMBER_TYPE),
          source: IncomingInvoiceSource.MANUAL,
          uploadedById: user.id,
        } as Prisma.IncomingInvoiceUncheckedCreateInput,
      }),
    );
    return this.findOne(user.companyId, created.id);
  }

  async update(companyId: string, id: string, dto: UpdateIncomingInvoiceDto) {
    const current = await this.getEntity(companyId, id);
    const data = await this.toData(companyId, dto);

    if (current.status === IncomingInvoiceStatus.PAID) {
      throw new ConflictException('Bezahlte Eingangsrechnungen können nicht mehr geändert werden.');
    }
    // After the approval only the project assignment and the description may change; the approved
    // amounts are what the approver saw.
    if (current.status === IncomingInvoiceStatus.APPROVED) {
      const allowed = new Set(['projectId', 'description']);
      if (Object.keys(data).some((key) => !allowed.has(key))) {
        throw new ConflictException('Freigegebene Rechnungen sind gesperrt. Zum Ändern zuerst die Freigabe zurücknehmen.');
      }
    }
    const supplierId = dto.supplierId !== undefined ? dto.supplierId : current.supplierId;
    const invoiceNumber = dto.invoiceNumber !== undefined ? dto.invoiceNumber.trim() || null : current.invoiceNumber;
    await this.assertNoDuplicate(companyId, id, supplierId, invoiceNumber);
    await this.prisma.incomingInvoice.update({ where: { id }, data });
    return this.findOne(companyId, id);
  }

  async approve(user: AuthenticatedUser, id: string) {
    const current = await this.getEntity(user.companyId, id);
    if (current.status !== IncomingInvoiceStatus.RECEIVED) {
      throw new ConflictException('Nur eingegangene Rechnungen können freigegeben werden.');
    }
    const issues = this.issuesOf(current);
    if (issues.length > 0) {
      throw new BadRequestException(issues.join(' '));
    }
    await this.assertNoDuplicate(user.companyId, id, current.supplierId, current.invoiceNumber);
    await this.prisma.incomingInvoice.update({
      where: { id },
      data: { status: IncomingInvoiceStatus.APPROVED, approvedById: user.id, approvedAt: new Date(), rejectionReason: null },
    });
    return this.findOne(user.companyId, id);
  }

  async reject(companyId: string, id: string, reason?: string) {
    const current = await this.getEntity(companyId, id);
    if (current.status !== IncomingInvoiceStatus.RECEIVED) {
      throw new ConflictException('Nur eingegangene Rechnungen können abgelehnt werden.');
    }
    await this.prisma.incomingInvoice.update({
      where: { id },
      data: { status: IncomingInvoiceStatus.REJECTED, rejectionReason: reason?.trim() || null },
    });
    return this.findOne(companyId, id);
  }

  // Takes an approval back (APPROVED) or reopens a rejected invoice (REJECTED) for another review.
  async reopen(companyId: string, id: string) {
    const current = await this.getEntity(companyId, id);
    if (current.status !== IncomingInvoiceStatus.APPROVED && current.status !== IncomingInvoiceStatus.REJECTED) {
      throw new ConflictException('Nur freigegebene oder abgelehnte Rechnungen können zurückgesetzt werden.');
    }
    await this.prisma.incomingInvoice.update({
      where: { id },
      data: { status: IncomingInvoiceStatus.RECEIVED, approvedById: null, approvedAt: null, rejectionReason: null },
    });
    return this.findOne(companyId, id);
  }

  async markPaid(companyId: string, id: string, paidAt?: string) {
    const current = await this.getEntity(companyId, id);
    if (current.status !== IncomingInvoiceStatus.APPROVED) {
      throw new ConflictException('Nur freigegebene Rechnungen können als bezahlt markiert werden.');
    }
    await this.prisma.incomingInvoice.update({
      where: { id },
      data: { status: IncomingInvoiceStatus.PAID, paidAt: paidAt ? new Date(paidAt) : new Date() },
    });
    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string) {
    const current = await this.getEntity(companyId, id);
    if (current.status === IncomingInvoiceStatus.APPROVED || current.status === IncomingInvoiceStatus.PAID) {
      throw new ConflictException('Freigegebene oder bezahlte Rechnungen werden aufbewahrt und können nicht gelöscht werden.');
    }
    await this.prisma.incomingInvoice.delete({ where: { id } });
    await deleteInvoiceFile(current.filePath);
  }

  // Original file metadata for the download endpoint (tenant-checked).
  async getFile(companyId: string, id: string) {
    const invoice = await this.getEntity(companyId, id);
    if (!invoice.filePath) {
      throw new NotFoundException('Zu dieser Eingangsrechnung gibt es keine Datei.');
    }
    return { path: invoice.filePath, name: invoice.fileName ?? 'rechnung', mimeType: invoice.mimeType ?? 'application/octet-stream' };
  }

  private async getEntity(companyId: string, id: string) {
    const invoice = await this.prisma.incomingInvoice.findFirst({ where: { id, companyId } });
    if (!invoice) {
      throw new NotFoundException('Eingangsrechnung nicht gefunden.');
    }
    return invoice;
  }

  private issuesOf(invoice: Parameters<typeof approvalIssues>[0] & { eInvoice?: Prisma.JsonValue | null }) {
    const issues = approvalIssues(invoice);
    const parsed = invoice.eInvoice as unknown as (ParsedEInvoice & { supplierMatched?: boolean }) | null | undefined;
    if (parsed?.isCreditNote) {
      issues.push('Das ist eine Gutschrift des Lieferanten (Typ 381) und kann nicht als Eingangsrechnung freigegeben werden.');
    }
    if (parsed?.currency && parsed.currency !== 'EUR') {
      issues.push(`Die Rechnung lautet auf ${parsed.currency}; nur EUR wird unterstützt.`);
    }
    return issues;
  }

  // Captured data from a parsed e-invoice; the supplier is matched against the contacts by USt-IdNr.,
  // IBAN or name, otherwise the seller name is kept as free text.
  private async prefillFrom(companyId: string, parsed: ParsedEInvoice) {
    const suppliers = await this.prisma.contact.findMany({
      where: { companyId, types: { hasSome: ['SUPPLIER', 'SUBCONTRACTOR'] } },
      select: { id: true, vatId: true, iban: true, organizationName: true, firstName: true, lastName: true },
    });
    const compact = (value: string | null | undefined) => (value ? value.replace(/\s+/g, '').toUpperCase() : null);
    const name = (value: string | null | undefined) => value?.trim().toLowerCase() ?? null;
    const sellerName = name(parsed.seller.name);
    const match =
      suppliers.find((c) => compact(c.vatId) && compact(c.vatId) === compact(parsed.seller.vatId)) ??
      suppliers.find((c) => compact(c.iban) && compact(c.iban) === compact(parsed.seller.iban)) ??
      suppliers.find((c) => sellerName && name(c.organizationName ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`) === sellerName);
    const lines = parsed.lines.map((line) => line.name).filter(Boolean);
    return {
      supplierId: match?.id ?? null,
      supplierName: parsed.seller.name,
      invoiceNumber: parsed.number,
      invoiceDate: parsed.issueDate ? new Date(parsed.issueDate) : null,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      serviceDate: parsed.serviceDate ? new Date(parsed.serviceDate) : null,
      description: lines.length ? lines.slice(0, 3).join('; ') + (lines.length > 3 ? ` (+${lines.length - 3} weitere)` : '') : parsed.note,
      netAmount: parsed.netAmount,
      vatAmount: parsed.vatAmount,
      grossAmount: parsed.grossAmount,
      currency: parsed.currency ?? 'EUR',
      reverseCharge: parsed.reverseCharge,
      eInvoice: { ...parsed, supplierMatched: !!match } as unknown as Prisma.InputJsonValue,
    };
  }

  // Maps the DTO to Prisma data and verifies that referenced supplier/project belong to the tenant.
  private async toData(companyId: string, dto: UpdateIncomingInvoiceDto): Promise<Prisma.IncomingInvoiceUncheckedUpdateInput> {
    if (dto.supplierId) {
      const supplier = await this.prisma.contact.findFirst({ where: { id: dto.supplierId, companyId }, select: { id: true } });
      if (!supplier) throw new BadRequestException('Lieferant nicht gefunden.');
    }
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: dto.projectId, companyId }, select: { id: true } });
      if (!project) throw new BadRequestException('Projekt nicht gefunden.');
    }
    const data: Prisma.IncomingInvoiceUncheckedUpdateInput = {};
    if (dto.supplierId !== undefined) data.supplierId = dto.supplierId;
    if (dto.supplierName !== undefined) data.supplierName = dto.supplierName.trim() || null;
    if (dto.invoiceNumber !== undefined) data.invoiceNumber = dto.invoiceNumber.trim() || null;
    if (dto.invoiceDate !== undefined) data.invoiceDate = new Date(dto.invoiceDate);
    if (dto.serviceDate !== undefined) data.serviceDate = new Date(dto.serviceDate);
    if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.netAmount !== undefined) data.netAmount = dto.netAmount;
    if (dto.vatAmount !== undefined) data.vatAmount = dto.vatAmount;
    if (dto.grossAmount !== undefined) data.grossAmount = dto.grossAmount;
    if (dto.reverseCharge !== undefined) data.reverseCharge = dto.reverseCharge;
    if (dto.projectId !== undefined) data.projectId = dto.projectId;
    return data;
  }

  private async findDuplicate(invoice: { id: string; companyId: string; supplierId: string | null; invoiceNumber: string | null }) {
    if (!invoice.supplierId || !invoice.invoiceNumber) return null;
    return this.prisma.incomingInvoice.findFirst({
      where: { companyId: invoice.companyId, supplierId: invoice.supplierId, invoiceNumber: invoice.invoiceNumber, id: { not: invoice.id } },
      select: { id: true, number: true },
    });
  }

  // Same supplier + same supplier invoice number is almost certainly a double entry.
  private async assertNoDuplicate(companyId: string, id: string, supplierId: string | null, invoiceNumber: string | null) {
    const duplicate = await this.findDuplicate({ id, companyId, supplierId, invoiceNumber });
    if (duplicate) {
      throw new ConflictException(`Diese Rechnungsnummer dieses Lieferanten ist bereits erfasst (${duplicate.number}).`);
    }
  }
}
