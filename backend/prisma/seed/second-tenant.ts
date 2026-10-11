// A second, tiny tenant so tenant isolation can be checked by hand (log in as both and compare).
import { CatalogItemKind, CompanyRole, ContactType, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEMO_PASSWORD } from './company-and-users';

export const SECOND_TENANT_OWNER_EMAIL = 'zimmerei@meisterwerk.local';

export async function seedSecondTenant(prisma: PrismaClient): Promise<void> {
  await prisma.company.create({
    data: {
      name: 'Zimmerei Beispiel GmbH',
      city: 'Augsburg',
      users: {
        create: {
          email: SECOND_TENANT_OWNER_EMAIL,
          passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
          firstName: 'Anna',
          lastName: 'Zimmermann',
          role: CompanyRole.OWNER,
        },
      },
      contacts: { create: { types: [ContactType.CUSTOMER], number: 'K-1', organizationName: 'Nur für Zimmerei sichtbar GmbH' } },
      catalogItems: { create: { kind: CatalogItemKind.SERVICE, sku: 'L-1', name: 'Zimmermann, Stunde', unit: 'h', netPrice: 60 } },
    },
  });
}
