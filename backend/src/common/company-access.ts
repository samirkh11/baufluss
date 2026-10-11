import { CompanyStatus } from '@prisma/client';

// Why a company's users may not use the app right now (message shown on login), or null when access is fine.
export function blockedReason(
  company: { status: CompanyStatus; statusReason: string | null; trialEndsAt: Date | null },
  now: Date = new Date(),
): string | null {
  if (company.status === CompanyStatus.SUSPENDED) {
    return `Das Konto ist gesperrt${company.statusReason ? `: ${company.statusReason}` : ''}. Bitte den Support kontaktieren.`;
  }
  if (company.status === CompanyStatus.CANCELLED) {
    return 'Der Vertrag wurde beendet. Bitte den Support kontaktieren.';
  }
  if (company.status === CompanyStatus.TRIAL && company.trialEndsAt && company.trialEndsAt < now) {
    return 'Die Testphase ist abgelaufen. Bitte einen Tarif buchen oder den Support kontaktieren.';
  }
  return null;
}
