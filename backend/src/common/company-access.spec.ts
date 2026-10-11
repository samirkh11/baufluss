import { CompanyStatus } from '@prisma/client';
import { blockedReason } from './company-access';

const now = new Date('2026-10-11T12:00:00Z');
const base = { statusReason: null, trialEndsAt: null };

describe('blockedReason', () => {
  it('lets active companies and running trials in', () => {
    expect(blockedReason({ ...base, status: CompanyStatus.ACTIVE }, now)).toBeNull();
    expect(blockedReason({ ...base, status: CompanyStatus.TRIAL, trialEndsAt: new Date('2026-10-20') }, now)).toBeNull();
    expect(blockedReason({ ...base, status: CompanyStatus.TRIAL }, now)).toBeNull(); // legacy trial without end date
  });

  it('blocks suspended companies and shows the reason', () => {
    expect(blockedReason({ status: CompanyStatus.SUSPENDED, statusReason: 'Rechnung offen', trialEndsAt: null }, now)).toContain('Rechnung offen');
  });

  it('blocks cancelled companies and expired trials', () => {
    expect(blockedReason({ ...base, status: CompanyStatus.CANCELLED }, now)).toContain('beendet');
    expect(blockedReason({ ...base, status: CompanyStatus.TRIAL, trialEndsAt: new Date('2026-10-01') }, now)).toContain('Testphase');
  });

  it('does not apply the trial end date to active companies', () => {
    expect(blockedReason({ ...base, status: CompanyStatus.ACTIVE, trialEndsAt: new Date('2026-01-01') }, now)).toBeNull();
  });
});
