// Development seed. Run with `npm run seed` from backend/. Safe to re-run: it removes the demo
// tenants (all their data cascades) and recreates them. Other tenants are never touched.
//
// RULE: every new feature extends this seed with realistic data for the demo roofing company
// (see /.claude/memory/feedback_testdata_seed.md).
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { ArchiveService } from '../../src/documents/archive.service';
import { rmSync } from 'fs';
import { join } from 'path';
import { DEMO_OWNER_EMAIL, DEMO_PASSWORD, seedCompanyAndUsers } from './company-and-users';
import { seedContacts } from './contacts';
import { seedCatalog } from './catalog';
import { seedProjects } from './projects';
import { seedDocuments } from './documents';
import { seedIncomingInvoices } from './incoming-invoices';
import { seedTimeEntries } from './time-entries';
import { SECOND_TENANT_OWNER_EMAIL, seedSecondTenant } from './second-tenant';

const prisma = new PrismaClient();

async function removeExistingDemoTenants() {
  const owners = await prisma.user.findMany({
    where: { email: { in: [DEMO_OWNER_EMAIL, SECOND_TENANT_OWNER_EMAIL] } },
    select: { companyId: true },
  });
  const companyIds = owners.map((owner) => owner.companyId);

  // Uploaded files are not removed by the database cascade, so delete them explicitly first.
  const [companies, users, contacts, images, photos] = await Promise.all([
    prisma.company.findMany({ where: { id: { in: companyIds } }, select: { logoPath: true } }),
    prisma.user.findMany({ where: { companyId: { in: companyIds } }, select: { imagePath: true } }),
    prisma.contact.findMany({ where: { companyId: { in: companyIds } }, select: { imagePath: true } }),
    prisma.catalogItemImage.findMany({ where: { catalogItem: { companyId: { in: companyIds } } }, select: { path: true } }),
    prisma.reportPhoto.findMany({ where: { report: { companyId: { in: companyIds } } }, select: { path: true } }),
  ]);
  const paths = [
    ...companies.map((c) => c.logoPath),
    ...users.map((u) => u.imagePath),
    ...contacts.map((c) => c.imagePath),
    ...images.map((i) => i.path),
    ...photos.map((p) => p.path),
  ];
  for (const path of paths) {
    if (path?.startsWith('/uploads/')) {
      rmSync(join(process.cwd(), path), { force: true });
    }
  }

  // Original incoming-invoice files and the GoBD archive are stored outside uploads/ (per company folder).
  for (const companyId of companyIds) {
    rmSync(join(process.cwd(), 'storage', 'archive', companyId), { recursive: true, force: true });
    rmSync(join(process.cwd(), 'storage', 'incoming-invoices', companyId), { recursive: true, force: true });
  }

  // Deleting a company cascades to users, contacts, catalog items, number sequences, ...
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}

async function main() {
  await removeExistingDemoTenants();

  const { companyId, userIds } = await seedCompanyAndUsers(prisma);
  const contactIds = await seedContacts(prisma, companyId);
  const catalog = await seedCatalog(prisma, companyId);
  await seedProjects(prisma, companyId, userIds, contactIds);
  await seedDocuments(prisma, companyId, catalog);
  await seedTimeEntries(prisma, companyId, userIds);
  await seedIncomingInvoices(prisma, companyId, userIds, contactIds);
  await seedSecondTenant(prisma);

  // GoBD archive of everything that is already issued in the demo data, created by the real service.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const archive = app.get(ArchiveService);
  for (const id of [companyId, ...(await prisma.company.findMany({ where: { id: { not: companyId } }, select: { id: true } })).map((c) => c.id)]) {
    await archive.archiveMissing(id);
  }
  await app.close();

  console.log('Demo-Daten angelegt (Dachdeckerei Schmidt GmbH + Zimmerei Beispiel GmbH).');
  console.log(`Login Chef:      ${DEMO_OWNER_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`Login Bürokraft: buero@dachdecker-schmidt.example / ${DEMO_PASSWORD}`);
  console.log(`Login 2. Mandant: ${SECOND_TENANT_OWNER_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
