import { Prisma } from '@prisma/client';

type Money = Prisma.Decimal.Value;

export interface InvoiceDataToCheck {
  supplierId?: string | null;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: Date | null;
  netAmount: Money;
  vatAmount: Money;
  grossAmount: Money;
  reverseCharge: boolean;
}

// Problems that block the approval of an incoming invoice (German messages shown to the user).
export function approvalIssues(data: InvoiceDataToCheck): string[] {
  const issues: string[] = [];
  if (!data.supplierId && !data.supplierName?.trim()) {
    issues.push('Lieferant fehlt.');
  }
  if (!data.invoiceNumber?.trim()) {
    issues.push('Rechnungsnummer des Lieferanten fehlt.');
  }
  if (!data.invoiceDate) {
    issues.push('Rechnungsdatum fehlt.');
  }
  const net = new Prisma.Decimal(data.netAmount);
  const vat = new Prisma.Decimal(data.vatAmount);
  const gross = new Prisma.Decimal(data.grossAmount);
  if (gross.lte(0)) {
    issues.push('Bruttobetrag fehlt.');
  } else if (net.plus(vat).minus(gross).abs().gt(0.01)) {
    issues.push('Netto + Umsatzsteuer ergibt nicht den Bruttobetrag.');
  }
  if (data.reverseCharge && !vat.isZero()) {
    issues.push('Bei Steuerschuldnerschaft des Leistungsempfängers (§ 13b) darf keine Umsatzsteuer ausgewiesen sein.');
  }
  return issues;
}
