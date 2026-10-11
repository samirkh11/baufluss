import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ArchiveKind } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { deleteUploadedFile } from '../common/storage/uploads';

// Data subject rights (DSGVO): access/export (Art. 15, 20) and erasure (Art. 17) of a contact and the
// export of an employee's data. Erasure respects the legal retention duties: a contact that appears on
// retained documents is anonymized instead of deleted; the documents keep their frozen address block
// because the tax law requires it.
@Injectable()
export class DsgvoService {
  constructor(private readonly prisma: PrismaService) {}

  private async contact(companyId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, companyId } });
    if (!contact) throw new NotFoundException('Kontakt nicht gefunden.');
    return contact;
  }

  // Everything stored about the contact in a machine-readable structure.
  async contactExport(companyId: string, id: string) {
    const contact = await this.contact(companyId, id);
    const [documents, projects, incoming] = await Promise.all([
      this.prisma.document.findMany({
        where: { companyId, recipientContactId: id },
        select: { type: true, number: true, status: true, documentDate: true, subject: true, netTotal: true, grossTotal: true, recipientName: true, recipientStreet: true, recipientZipCode: true, recipientCity: true },
        orderBy: { documentDate: 'asc' },
      }),
      this.prisma.project.findMany({ where: { companyId, customerId: id }, select: { number: true, name: true, status: true, siteStreet: true, siteZipCode: true, siteCity: true, startDate: true, endDate: true } }),
      this.prisma.incomingInvoice.findMany({ where: { companyId, supplierId: id }, select: { number: true, invoiceNumber: true, invoiceDate: true, grossAmount: true, status: true } }),
    ]);
    const { imagePath, ...data } = contact;
    return { exportedAt: new Date().toISOString(), basis: 'Art. 15/20 DSGVO', contact: { ...data, hasImage: !!imagePath }, documents, projects, incomingInvoices: incoming };
  }

  // What stands in the way of a complete deletion.
  async erasureInfo(companyId: string, id: string) {
    const contact = await this.contact(companyId, id);
    const [documents, projects, incoming, archive] = await Promise.all([
      this.prisma.document.count({ where: { companyId, recipientContactId: id, number: { not: null } } }),
      this.prisma.project.count({ where: { companyId, customerId: id } }),
      this.prisma.incomingInvoice.count({ where: { companyId, supplierId: id } }),
      this.prisma.archivedFile.aggregate({ where: { companyId, document: { recipientContactId: id }, kind: ArchiveKind.DOCUMENT_PDF }, _max: { retainUntil: true } }),
    ]);
    const blockers: string[] = [];
    if (documents > 0) blockers.push(`${documents} ausgestellte Belege (Aufbewahrungspflicht${archive._max.retainUntil ? ` bis ${archive._max.retainUntil.toISOString().slice(0, 10)}` : ''})`);
    if (projects > 0) blockers.push(`${projects} Projekt(e)`);
    if (incoming > 0) blockers.push(`${incoming} Eingangsrechnung(en)`);
    return { alreadyErased: !!contact.erasedAt, canDeleteCompletely: blockers.length === 0, blockers, retainUntil: archive._max.retainUntil };
  }

  // Deletes the contact when nothing refers to it, otherwise anonymizes it.
  async erase(companyId: string, id: string): Promise<{ result: 'deleted' | 'anonymized' }> {
    const contact = await this.contact(companyId, id);
    const info = await this.erasureInfo(companyId, id);
    if (info.canDeleteCompletely) {
      await this.prisma.contact.delete({ where: { id } });
      await deleteUploadedFile(contact.imagePath);
      return { result: 'deleted' };
    }
    if (contact.erasedAt) throw new ConflictException('Der Kontakt wurde bereits anonymisiert.');
    await this.prisma.contact.update({
      where: { id },
      data: {
        organizationName: contact.isOrganization ? `Gelöschter Kontakt ${contact.number ?? ''}`.trim() : null,
        salutation: null,
        firstName: contact.isOrganization ? null : 'Gelöscht',
        lastName: contact.isOrganization ? null : contact.number ?? 'Kontakt',
        street: null, zipCode: null, city: null, email: null, phone: null, mobile: null, website: null,
        vatId: null, taxId: null, iban: null, bic: null, notes: null, imagePath: null,
        isActive: false,
        erasedAt: new Date(),
      },
    });
    await deleteUploadedFile(contact.imagePath);
    return { result: 'anonymized' };
  }

  async userExport(companyId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('Mitarbeiter nicht gefunden.');
    const { passwordHash, ...profile } = user as typeof user & { passwordHash?: string };
    void passwordHash;
    const [timeEntries, reports] = await Promise.all([
      this.prisma.timeEntry.findMany({ where: { companyId, userId }, orderBy: { date: 'asc' }, select: { date: true, startMinute: true, endMinute: true, breakMinutes: true, durationMinutes: true, activity: true, status: true, project: { select: { number: true } } } }),
      this.prisma.report.findMany({ where: { companyId, authorId: userId }, select: { number: true, title: true, reportDate: true, type: true } }),
    ]);
    return { exportedAt: new Date().toISOString(), basis: 'Art. 15/20 DSGVO', employee: profile, timeEntries, reports };
  }
}
