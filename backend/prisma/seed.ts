// Seeds one demo tenant for local development. Run with `npm run seed` (backend/).
// Safe to re-run: skips creation if the demo user already exists.
import { PrismaClient, CompanyRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@meisterwerk.local';
const DEMO_PASSWORD = 'demo12345';

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log('Demo-Nutzer existiert bereits, überspringe Seed.');
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  await prisma.company.create({
    data: {
      name: 'Musterbetrieb Handwerk GmbH',
      street: 'Musterstraße 1',
      zipCode: '12345',
      city: 'Musterstadt',
      country: 'DE',
      users: {
        create: {
          email: DEMO_EMAIL,
          passwordHash,
          firstName: 'Demo',
          lastName: 'Admin',
          role: CompanyRole.OWNER,
        },
      },
    },
  });

  console.log(`Demo-Tenant angelegt. Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
