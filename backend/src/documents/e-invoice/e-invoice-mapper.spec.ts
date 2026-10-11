import { DocumentItemKind, DocumentType, Prisma } from '@prisma/client';
import { buildEInvoice, countryCode, EInvoiceSource, readinessIssues, unitCode } from './e-invoice-mapper';

const D = (value: number | string) => new Prisma.Decimal(value);

const issuer = {
  name: 'Dachdeckerei Schmidt GmbH', legalForm: 'GmbH', street: 'Musterstr. 1', zipCode: '89073', city: 'Ulm', country: 'DE',
  taxId: '12/345/67890', vatId: 'DE123456789', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', email: 'info@schmidt.example',
  phone: '0731 123', website: null, logoPath: null, letterheadHeaderText: null, letterheadFooterText: null,
};

function item(overrides: Partial<EInvoiceSource['items'][number]> = {}): EInvoiceSource['items'][number] {
  return {
    kind: DocumentItemKind.POSITION, sku: null, name: 'Position', description: null, quantity: D(1), unit: 'Stk',
    unitPrice: D(100), vatRate: D(19), discountPercent: D(0), isOptional: false, ...overrides,
  };
}

function source(overrides: Partial<EInvoiceSource> = {}): EInvoiceSource {
  return {
    type: DocumentType.INVOICE, number: 'RE-00001', documentDate: new Date('2026-10-01'), currency: 'EUR', subject: null,
    recipientName: 'Wohnbau Ulm GmbH', recipientStreet: 'Hirschstr. 14', recipientZipCode: '89073', recipientCity: 'Ulm', recipientCountry: 'DE',
    netTotal: D(100), vatTotal: D(19), grossTotal: D(119), items: [item()],
    invoiceDetails: {
      serviceDateFrom: new Date('2026-09-01'), serviceDateTo: new Date('2026-09-30'), paymentTermDays: 14, dueDate: new Date('2026-10-15'),
      reverseCharge: false, recipientVatId: null, orderReference: null, buyerReference: null, retentionPercent: null, retentionAmount: null, retentionDueDate: null,
    },
    project: { number: 'P-0001' }, sourceDocument: null, recipientContact: { email: 'k@wohnbau.example', phone: null, isOrganization: true },
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inv = (result: ReturnType<typeof buildEInvoice>): any => result.invoice['ubl:Invoice'];

describe('buildEInvoice', () => {
  it('maps a simple invoice (type 380, totals as strings)', () => {
    const result = buildEInvoice(source(), issuer, 'xrechnung');
    expect(inv(result)['cbc:InvoiceTypeCode']).toBe('380');
    expect(inv(result)['cac:LegalMonetaryTotal']['cbc:PayableAmount']).toBe('119.00');
    expect(inv(result)['cac:InvoiceLine'][0]['cbc:InvoicedQuantity@unitCode']).toBe('C62');
    expect(result.totals.gross.toString()).toBe('119');
  });

  it('groups VAT per rate and keeps the stored rounding', () => {
    const s = source({ items: [item({ unitPrice: D(33.33), vatRate: D(19) }), item({ unitPrice: D(10), vatRate: D(7) })] });
    const result = buildEInvoice(s, issuer, 'zugferd');
    const sub = inv(result)['cac:TaxTotal'][0]['cac:TaxSubtotal'];
    expect(sub).toHaveLength(2);
    expect(inv(result)['cac:TaxTotal'][0]['cbc:TaxAmount']).toBe('7.03'); // 6.33 + 0.70
  });

  it('turns a discount into a line allowance', () => {
    const s = source({ items: [item({ quantity: D(10), unitPrice: D(50), discountPercent: D(10) })] });
    const line = inv(buildEInvoice(s, issuer, 'zugferd'))['cac:InvoiceLine'][0];
    expect(line['cbc:LineExtensionAmount']).toBe('450.00');
    expect(line['cac:AllowanceCharge'][0]['cbc:Amount']).toBe('50.00');
  });

  it('moves the sign of a deduction line (negative price) to the quantity', () => {
    const s = source({ items: [item({ unitPrice: D(1000) }), item({ name: 'Abzug', unitPrice: D(-300) })] });
    const lines = inv(buildEInvoice(s, issuer, 'xrechnung'))['cac:InvoiceLine'];
    expect(lines[1]['cbc:InvoicedQuantity']).toBe('-1');
    expect(lines[1]['cac:Price']['cbc:PriceAmount']).toBe('300');
    expect(lines[1]['cbc:LineExtensionAmount']).toBe('-300.00');
  });

  it('maps credit notes to type 381 with positive amounts and a reference to the invoice', () => {
    const s = source({
      type: DocumentType.CREDIT_NOTE, number: 'GS-00001', items: [item({ quantity: D(-2), unitPrice: D(100) })],
      grossTotal: D(-238), sourceDocument: { number: 'RE-00001', documentDate: new Date('2026-09-20') },
    });
    const result = buildEInvoice(s, issuer, 'xrechnung');
    expect(inv(result)['cbc:InvoiceTypeCode']).toBe('381');
    expect(inv(result)['cac:InvoiceLine'][0]['cbc:InvoicedQuantity']).toBe('2');
    expect(inv(result)['cac:LegalMonetaryTotal']['cbc:PayableAmount']).toBe('238.00');
    expect(inv(result)['cac:BillingReference'][0]['cac:InvoiceDocumentReference']['cbc:ID']).toBe('RE-00001');
    expect(inv(result)['cac:ProjectReference']).toBeUndefined();
  });

  it('uses category AE with exemption reason for §13b invoices', () => {
    const s = source({
      items: [item({ vatRate: D(0) })], vatTotal: D(0), grossTotal: D(100),
      invoiceDetails: { ...source().invoiceDetails!, reverseCharge: true, recipientVatId: 'DE999999999' },
    });
    const result = buildEInvoice(s, issuer, 'xrechnung');
    const category = inv(result)['cac:TaxTotal'][0]['cac:TaxSubtotal'][0]['cac:TaxCategory'];
    expect(category['cbc:ID']).toBe('AE');
    expect(category['cbc:TaxExemptionReasonCode']).toBe('vatex-eu-ae');
    expect(inv(result)['cbc:Note'][0]).toContain('§ 13b');
  });

  it('skips optional lines, headings and text lines', () => {
    const s = source({ items: [item(), item({ isOptional: true }), item({ kind: DocumentItemKind.HEADING }), item({ kind: DocumentItemKind.TEXT })] });
    expect(inv(buildEInvoice(s, issuer, 'zugferd'))['cac:InvoiceLine']).toHaveLength(1);
  });

  it('falls back for the buyer reference: Leitweg-ID, order reference, project number', () => {
    expect(inv(buildEInvoice(source(), issuer, 'xrechnung'))['cbc:BuyerReference']).toBe('P-0001');
    const withLeitweg = source({ invoiceDetails: { ...source().invoiceDetails!, buyerReference: '04011000-1234512345-06' } });
    expect(inv(buildEInvoice(withLeitweg, issuer, 'xrechnung'))['cbc:BuyerReference']).toBe('04011000-1234512345-06');
  });
});

describe('readinessIssues', () => {
  it('is empty for complete data', () => {
    expect(readinessIssues(source(), issuer, 'xrechnung')).toEqual([]);
  });

  it('XRechnung needs seller contact and buyer e-mail, ZUGFeRD does not', () => {
    const incomplete = { ...issuer, email: null, phone: null };
    const noMail = source({ recipientContact: null });
    expect(readinessIssues(noMail, incomplete, 'xrechnung')).toHaveLength(3);
    expect(readinessIssues(noMail, incomplete, 'zugferd')).toEqual([]);
  });

  it('requires tax number or VAT id, IBAN and the recipient address', () => {
    const issues = readinessIssues(source({ recipientStreet: null }), { ...issuer, vatId: null, taxId: null, iban: null }, 'zugferd');
    expect(issues).toHaveLength(3);
  });

  it('requires the recipient VAT id for §13b', () => {
    const s = source({ invoiceDetails: { ...source().invoiceDetails!, reverseCharge: true } });
    expect(readinessIssues(s, issuer, 'zugferd')).toHaveLength(1);
  });
});

describe('codes', () => {
  it('maps units to UN/ECE codes', () => {
    expect(unitCode('m²')).toBe('MTK');
    expect(unitCode('Std.')).toBe('HUR');
    expect(unitCode('psch.')).toBe('LS');
    expect(unitCode('irgendwas')).toBe('C62');
  });

  it('maps country names to ISO codes', () => {
    expect(countryCode('Deutschland')).toBe('DE');
    expect(countryCode('at')).toBe('AT');
    expect(countryCode(null)).toBe('DE');
  });
});
