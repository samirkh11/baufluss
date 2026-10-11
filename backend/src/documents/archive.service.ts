import { Injectable, Logger } from '@nestjs/common';
import { ArchiveKind, DocumentType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../common/prisma/prisma.service';
import { DocumentPdfService } from './document-pdf.service';
import { DunningPdfService } from './dunning-pdf.service';
import { EInvoiceService } from './e-invoice/e-invoice.service';

export { ARCHIVE_ROOT, archivePath, retainUntil, sha256Of } from './archive-paths';
import { ARCHIVE_ROOT, archivePath, retainUntil, sha256Of } from './archive-paths';

// Creates and reads the write-once archive of issued documents and sent dunning letters.
@Injectable()
export class ArchiveService {
  private readonly logger = new Logger(ArchiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: DocumentPdfService,
    private readonly dunningPdfService: DunningPdfService,
    private readonly eInvoiceService: EInvoiceService,
  ) {}

  private async store(companyId: string, extension: string, buffer: Buffer): Promise<string> {
    const relative = join(companyId, `${randomUUID()}${extension}`);
    await mkdir(join(ARCHIVE_ROOT, companyId), { recursive: true });
    // flag 'wx': never overwrite an existing archive file
    await writeFile(join(ARCHIVE_ROOT, relative), buffer, { flag: 'wx' });
    return relative;
  }

  // Archives the PDF of a freshly issued document, plus the XRechnung XML for invoices and credit notes
  // when the data allows it. Safe to call again: nothing is archived twice. Never throws, so a failing
  // archive cannot block issuing; "verify" and "archiveMissing" report and repair such gaps.
  async archiveDocument(companyId: string, documentId: string): Promise<void> {
    try {
      const document = await this.prisma.document.findFirst({ where: { id: documentId, companyId } });
      if (!document?.number || !document.issuerSnapshot) return;
      const existing = await this.prisma.archivedFile.findMany({ where: { companyId, documentId }, select: { kind: true } });
      const has = (kind: ArchiveKind) => existing.some((entry) => entry.kind === kind);
      const settings = await this.prisma.complianceSettings.findUnique({ where: { companyId } });
      const accounting = document.type === DocumentType.INVOICE || document.type === DocumentType.CREDIT_NOTE;
      const until = retainUntil(document.documentDate, accounting ? (settings?.retentionYearsInvoices ?? 8) : (settings?.retentionYearsOther ?? 6));

      if (!has(ArchiveKind.DOCUMENT_PDF)) {
        const pdf = await this.pdfService.render(companyId, documentId);
        await this.record(companyId, { documentId, kind: ArchiveKind.DOCUMENT_PDF, extension: '.pdf', fileName: `${document.number}.pdf`, mimeType: 'application/pdf', buffer: pdf.buffer, until });
      }
      if (accounting && !has(ArchiveKind.EINVOICE_XML)) {
        try {
          const xml = await this.eInvoiceService.generate(companyId, documentId, 'xrechnung-ubl');
          await this.record(companyId, { documentId, kind: ArchiveKind.EINVOICE_XML, extension: '.xml', fileName: `${document.number}.xml`, mimeType: 'application/xml', buffer: xml.buffer, until });
        } catch {
          // data not complete enough for an e-invoice (e.g. no buyer e-mail): the PDF is the original
        }
      }
    } catch (error) {
      this.logger.error(`Archiving document ${documentId} failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  async archiveDunning(companyId: string, dunningId: string): Promise<void> {
    try {
      const dunning = await this.prisma.dunning.findFirst({ where: { id: dunningId, companyId } });
      if (!dunning || (await this.prisma.archivedFile.count({ where: { companyId, dunningId } })) > 0) return;
      const settings = await this.prisma.complianceSettings.findUnique({ where: { companyId } });
      const pdf = await this.dunningPdfService.render(companyId, dunningId);
      await this.record(companyId, {
        dunningId,
        kind: ArchiveKind.DUNNING_PDF,
        extension: '.pdf',
        fileName: pdf.filename,
        mimeType: 'application/pdf',
        buffer: pdf.buffer,
        until: retainUntil(dunning.dunningDate, settings?.retentionYearsOther ?? 6),
      });
    } catch (error) {
      this.logger.error(`Archiving dunning ${dunningId} failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async record(
    companyId: string,
    input: { documentId?: string; dunningId?: string; kind: ArchiveKind; extension: string; fileName: string; mimeType: string; buffer: Buffer; until: Date },
  ) {
    const filePath = await this.store(companyId, input.extension, input.buffer);
    await this.prisma.archivedFile.create({
      data: {
        companyId,
        kind: input.kind,
        documentId: input.documentId,
        dunningId: input.dunningId,
        filePath,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.buffer.length,
        sha256: sha256Of(input.buffer),
        retainUntil: input.until,
      },
    });
  }

  // The archived original, or null for documents issued before the archive existed.
  async readArchived(companyId: string, where: { documentId?: string; dunningId?: string; kind: ArchiveKind }) {
    const entry = await this.prisma.archivedFile.findFirst({ where: { companyId, ...where }, orderBy: { createdAt: 'asc' } });
    if (!entry) return null;
    return { entry, buffer: await readFile(archivePath(entry.filePath)) };
  }

  // Issued documents that have no archived PDF yet (issued before the archive existed or archiving failed).
  async archiveMissing(companyId: string): Promise<number> {
    const documents = await this.prisma.document.findMany({
      where: { companyId, number: { not: null }, issuerSnapshot: { not: undefined }, archivedFiles: { none: { kind: ArchiveKind.DOCUMENT_PDF } } },
      select: { id: true },
    });
    for (const document of documents) await this.archiveDocument(companyId, document.id);
    const dunnings = await this.prisma.dunning.findMany({ where: { companyId, archivedFiles: { none: {} } }, select: { id: true } });
    for (const dunning of dunnings) await this.archiveDunning(companyId, dunning.id);
    return documents.length + dunnings.length;
  }

  // Integrity check: recomputes the SHA-256 of every archived file and of every stored incoming invoice.
  async verify(companyId: string) {
    const problems: { file: string; problem: 'MISSING' | 'ALTERED'; ref: string }[] = [];
    let checked = 0;
    const archived = await this.prisma.archivedFile.findMany({ where: { companyId }, include: { document: { select: { number: true } } } });
    for (const entry of archived) {
      checked += 1;
      try {
        const buffer = await readFile(archivePath(entry.filePath));
        if (sha256Of(buffer) !== entry.sha256) problems.push({ file: entry.fileName, problem: 'ALTERED', ref: entry.document?.number ?? entry.fileName });
      } catch {
        problems.push({ file: entry.fileName, problem: 'MISSING', ref: entry.document?.number ?? entry.fileName });
      }
    }
    const incoming = await this.prisma.incomingInvoice.findMany({ where: { companyId, filePath: { not: null } }, select: { number: true, fileName: true, filePath: true, fileHash: true } });
    for (const invoice of incoming) {
      checked += 1;
      try {
        const buffer = await readFile(join(process.cwd(), 'storage', 'incoming-invoices', invoice.filePath!));
        if (invoice.fileHash && sha256Of(buffer) !== invoice.fileHash) problems.push({ file: invoice.fileName ?? invoice.number, problem: 'ALTERED', ref: invoice.number });
      } catch {
        problems.push({ file: invoice.fileName ?? invoice.number, problem: 'MISSING', ref: invoice.number });
      }
    }
    const unarchived = await this.prisma.document.count({
      where: { companyId, number: { not: null }, archivedFiles: { none: { kind: ArchiveKind.DOCUMENT_PDF } } },
    });
    return { checked, archivedDocuments: archived.length, unarchivedDocuments: unarchived, problems, ok: problems.length === 0 && unarchived === 0 };
  }
}
