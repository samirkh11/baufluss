// Block 8 test data: the operator back office. Plans, one operator admin, operator settings, a few more customer
// companies in every lifecycle state, and invoices of the operator to its customers.
import { CompanyRole, CompanyStatus, PlatformInvoiceStatus, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { billingPeriod, invoiceAmounts, platformInvoiceNumber } from '../../src/platform/billing-calc';
import { DEMO_OWNER_EMAIL, DEMO_PASSWORD } from './company-and-users';
import { SECOND_TENANT_OWNER_EMAIL } from './second-tenant';

export const PLATFORM_ADMIN_EMAIL = 'admin@meisterwerk.local';
export const PLATFORM_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin12345';

const DAY = 86400000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY);

// Extra demo customers (owner e-mail -> company). Removed and recreated on every seed run.
const EXTRA_COMPANIES = [
  { email: 'inhaber@elektro-mueller.example', name: 'Elektro Müller GmbH', city: 'Neu-Ulm', status: CompanyStatus.SUSPENDED, reason: 'Rechnung PR-2026-0003 seit über 30 Tagen offen', plan: 'business', trialEndsAt: null, created: -200 },
  { email: 'inhaber@maler-hoffmann.example', name: 'Malerbetrieb Hoffmann', city: 'Ulm', status: CompanyStatus.TRIAL, reason: null, plan: 'starter', trialEndsAt: daysFromNow(-3), created: -17 },
  { email: 'inhaber@gartenbau-weber.example', name: 'Gartenbau Weber', city: 'Blaubeuren', status: CompanyStatus.CANCELLED, reason: null, plan: 'starter', trialEndsAt: null, created: -400 },
  { email: 'inhaber@sanitaer-kaiser.example', name: 'Sanitär Kaiser & Söhne', city: 'Ehingen', status: CompanyStatus.ACTIVE, reason: null, plan: 'starter', trialEndsAt: null, created: -90 },
];
export const EXTRA_OWNER_EMAILS = EXTRA_COMPANIES.map((company) => company.email);

export async function seedPlatform(prisma: PrismaClient): Promise<void> {
  // ---- plans
  const plans = [
    { key: 'starter', name: 'Starter', description: 'Für kleine Betriebe, bis 3 Nutzer', priceMonthly: 29, maxUsers: 3, sortOrder: 1 },
    { key: 'business', name: 'Business', description: 'Für wachsende Betriebe, bis 10 Nutzer', priceMonthly: 79, maxUsers: 10, sortOrder: 2 },
    { key: 'pro', name: 'Pro', description: 'Unbegrenzte Nutzer, Priorität im Support', priceMonthly: 149, maxUsers: null, sortOrder: 3 },
  ];
  // Dev database: plans created by hand during tests are removed (their companies fall back to no plan).
  await prisma.plan.deleteMany({ where: { key: { notIn: plans.map((plan) => plan.key) } } });
  const planId: Record<string, string> = {};
  for (const plan of plans) {
    const saved = await prisma.plan.upsert({ where: { key: plan.key }, update: plan, create: plan });
    planId[plan.key] = saved.id;
  }

  // ---- operator admin and settings
  await prisma.platformAdmin.upsert({
    where: { email: PLATFORM_ADMIN_EMAIL },
    update: { passwordHash: await bcrypt.hash(PLATFORM_ADMIN_PASSWORD, 12), isActive: true },
    create: { email: PLATFORM_ADMIN_EMAIL, passwordHash: await bcrypt.hash(PLATFORM_ADMIN_PASSWORD, 12), firstName: 'Vera', lastName: 'Betreiber' },
  });
  await prisma.platformSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, operatorName: 'Meisterwerk Software UG', street: 'Softwarestraße 1', zipCode: '10115', city: 'Berlin', vatId: 'DE300000001', iban: 'DE02120300000000202051', bic: 'BYLADEM1001', email: 'rechnung@meisterwerk.example' },
  });

  // ---- the two main demo tenants
  const demo = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_OWNER_EMAIL } });
  await prisma.company.update({ where: { id: demo.companyId }, data: { status: CompanyStatus.ACTIVE, planId: planId.business, trialEndsAt: daysFromNow(-120), operatorNotes: 'Pilotkunde, Ansprechpartner Thomas Schmidt.' } });
  const second = await prisma.user.findUniqueOrThrow({ where: { email: SECOND_TENANT_OWNER_EMAIL } });
  await prisma.company.update({ where: { id: second.companyId }, data: { status: CompanyStatus.TRIAL, planId: planId.starter, trialEndsAt: daysFromNow(9) } });

  // ---- more customers in every state, each with an owner
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const created: Record<string, string> = {};
  for (const entry of EXTRA_COMPANIES) {
    const company = await prisma.company.create({
      data: {
        name: entry.name, city: entry.city, country: 'DE', email: entry.email, status: entry.status, statusReason: entry.reason,
        trialEndsAt: entry.trialEndsAt, planId: planId[entry.plan], createdAt: daysFromNow(entry.created),
        users: { create: { email: entry.email, passwordHash, firstName: 'Inhaber', lastName: entry.name.split(' ')[0], role: CompanyRole.OWNER } },
      },
    });
    created[entry.email] = company.id;
  }

  // ---- operator invoices
  const settings = await prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 } });
  const counters: Record<number, number> = {};
  const invoice = async (companyId: string, planKey: string, month: string, status: PlatformInvoiceStatus, dueOffset: number, paid = false) => {
    const period = billingPeriod(month);
    const plan = plans.find((p) => p.key === planKey)!;
    const year = period.start.getUTCFullYear();
    counters[year] = (counters[year] ?? 0) + 1;
    await prisma.platformInvoice.create({
      data: {
        number: platformInvoiceNumber(year, counters[year]), companyId, periodStart: period.start, periodEnd: period.end, planName: plan.name,
        description: `Meisterwerk ${plan.name} – ${period.label}`, ...invoiceAmounts(plan.priceMonthly, settings.vatRate),
        status, dueDate: daysFromNow(dueOffset), paidAt: paid ? daysFromNow(dueOffset - 3) : null, issuedAt: daysFromNow(dueOffset - settings.paymentTermDays),
      },
    });
  };
  await invoice(demo.companyId, 'business', '2026-08', PlatformInvoiceStatus.PAID, -40, true);
  await invoice(demo.companyId, 'business', '2026-09', PlatformInvoiceStatus.PAID, -10, true);
  await invoice(created['inhaber@elektro-mueller.example'], 'business', '2026-08', PlatformInvoiceStatus.OPEN, -35);
  await invoice(created['inhaber@sanitaer-kaiser.example'], 'starter', '2026-09', PlatformInvoiceStatus.PAID, -9, true);
  await invoice(demo.companyId, 'business', '2026-10', PlatformInvoiceStatus.OPEN, 9);
}
