// Block 1 test data: the demo roofing company ("Dachdeckerei Schmidt GmbH"), its users and number ranges.
import { CompanyRole, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { avatarSvg, colorFor, initialsOf, logoSvg, writeSeedImage } from './helpers';

export const DEMO_PASSWORD = 'demo12345';
export const DEMO_OWNER_EMAIL = 'demo@meisterwerk.local';

// Boss + office clerk + four roofers, as in the agreed demo scenario.
const USERS = [
  { firstName: 'Thomas', lastName: 'Schmidt', email: DEMO_OWNER_EMAIL, role: CompanyRole.OWNER, hourlyRate: 45 }, // Chef
  { firstName: 'Sabine', lastName: 'Keller', email: 'buero@dachdecker-schmidt.example', role: CompanyRole.ADMIN, hourlyRate: 24 }, // Bürokraft
  { firstName: 'Jürgen', lastName: 'Hoffmann', email: 'j.hoffmann@dachdecker-schmidt.example', role: CompanyRole.MEMBER, hourlyRate: 28.5 },
  { firstName: 'Dennis', lastName: 'Vogel', email: 'd.vogel@dachdecker-schmidt.example', role: CompanyRole.MEMBER, hourlyRate: 26 },
  { firstName: 'Mehmet', lastName: 'Yilmaz', email: 'm.yilmaz@dachdecker-schmidt.example', role: CompanyRole.MEMBER, hourlyRate: 25 },
  { firstName: 'Lukas', lastName: 'Bauer', email: 'l.bauer@dachdecker-schmidt.example', role: CompanyRole.MEMBER, hourlyRate: 22 },
];

const NUMBER_SEQUENCES = [
  { documentType: 'QUOTE', prefix: 'AN-', digits: 5 },
  { documentType: 'ORDER', prefix: 'AB-', digits: 5 },
  { documentType: 'INVOICE', prefix: 'RE-', digits: 5, resetYearly: true },
  { documentType: 'CREDIT_NOTE', prefix: 'GS-', digits: 5 },
  { documentType: 'REPORT', prefix: 'BE-', digits: 4 },
  { documentType: 'PROJECT', prefix: 'P-', digits: 4 },
];

export interface SeededCompany {
  companyId: string;
  // user ids keyed by last name (Schmidt, Keller, Hoffmann, Vogel, Yilmaz, Bauer)
  userIds: Record<string, string>;
}

export async function seedCompanyAndUsers(prisma: PrismaClient): Promise<SeededCompany> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const name = 'Dachdeckerei Schmidt GmbH';

  const company = await prisma.company.create({
    data: {
      name,
      legalForm: 'GmbH',
      street: 'Am Sägewerk 7',
      zipCode: '89073',
      city: 'Ulm',
      country: 'DE',
      taxId: '151/123/45678',
      vatId: 'DE123456789',
      iban: 'DE02120300000000202051',
      bic: 'BYLADEM1001',
      email: 'info@dachdecker-schmidt.example',
      phone: '0731 123456',
      website: 'https://www.dachdecker-schmidt.example',
      logoPath: writeSeedImage('logos', 'seed-schmidt-logo.svg', logoSvg('Dachdeckerei Schmidt')),
      letterheadHeaderText: 'Dachdeckerei Schmidt GmbH · Am Sägewerk 7 · 89073 Ulm',
      letterheadFooterText:
        'Geschäftsführer: Thomas Schmidt · Amtsgericht Ulm HRB 123456',
      users: {
        create: USERS.map((user) => ({
          ...user,
          passwordHash,
          imagePath: writeSeedImage(
            'users',
            `seed-${user.lastName.toLowerCase()}.svg`,
            avatarSvg(initialsOf(`${user.firstName} ${user.lastName}`), colorFor(user.lastName)),
          ),
        })),
      },
      numberSequences: { create: NUMBER_SEQUENCES },
    },
    include: { users: true },
  });

  return {
    companyId: company.id,
    userIds: Object.fromEntries(company.users.map((user) => [user.lastName, user.id])),
  };
}
