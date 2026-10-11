import { readFileSync } from 'fs';
import { join } from 'path';
import { EInvoiceReadError, parseEInvoiceXml, readEInvoice } from './e-invoice-reader';

// Fixtures are real output of our own generator (validated with the KoSIT validator and veraPDF),
// issued by the demo company "Dachdeckerei Schmidt GmbH".
const fixture = (name: string) => readFileSync(join(__dirname, '../../test/fixtures/e-invoice', name));

describe('e-invoice reader', () => {
  it('reads an XRechnung (UBL) invoice', () => {
    const invoice = parseEInvoiceXml(fixture('xrechnung-ubl-invoice.xml').toString());
    expect(invoice.format).toBe('XRECHNUNG_UBL');
    expect(invoice.number).toBe('RE-00007');
    expect(invoice.typeCode).toBe('380');
    expect(invoice.isCreditNote).toBe(false);
    expect(invoice.seller.name).toBe('Dachdeckerei Schmidt GmbH');
    expect(invoice.seller.iban).toMatch(/^DE\d{20}$/);
    expect(invoice.seller.vatId).toMatch(/^DE/);
    expect(invoice.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(invoice.grossAmount)).toBeCloseTo(12621.45, 2);
    expect(Number(invoice.netAmount) + Number(invoice.vatAmount)).toBeCloseTo(Number(invoice.grossAmount), 2);
    expect(invoice.lines.length).toBeGreaterThan(0);
    expect(invoice.lines[0].unit).toBeTruthy();
  });

  it('reads the same invoice from CII and gets the same figures', () => {
    const ubl = parseEInvoiceXml(fixture('xrechnung-ubl-invoice.xml').toString());
    const cii = parseEInvoiceXml(fixture('xrechnung-cii-invoice.xml').toString());
    expect(cii.format).toBe('XRECHNUNG_CII');
    for (const key of ['number', 'issueDate', 'dueDate', 'currency', 'netAmount', 'vatAmount', 'grossAmount', 'reverseCharge'] as const) {
      expect(cii[key]).toEqual(ubl[key]);
    }
    expect(cii.seller.name).toBe(ubl.seller.name);
    expect(cii.seller.iban).toBe(ubl.seller.iban);
    expect(cii.lines).toHaveLength(ubl.lines.length);
  });

  it('recognises a credit note (UBL CreditNote element)', () => {
    const credit = parseEInvoiceXml(fixture('xrechnung-ubl-creditnote.xml').toString());
    expect(credit.isCreditNote).toBe(true);
    expect(credit.typeCode).toBe('381');
    expect(Number(credit.grossAmount)).toBeGreaterThan(0);
  });

  it('extracts the XML embedded in a ZUGFeRD PDF', async () => {
    const invoice = await readEInvoice(fixture('zugferd-invoice.pdf'), '.pdf');
    expect(invoice?.format).toBe('ZUGFERD');
    expect(invoice?.number).toBe('RE-00007');
    expect(Number(invoice?.grossAmount)).toBeCloseTo(12621.45, 2);
  });

  it('returns null for a plain PDF without embedded invoice', async () => {
    const plain = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
    await expect(readEInvoice(plain, '.pdf')).resolves.toBeNull();
  });

  it('rejects XML that is not an e-invoice', () => {
    expect(() => parseEInvoiceXml('<foo><bar/></foo>')).toThrow(EInvoiceReadError);
    expect(() => parseEInvoiceXml('<<<nonsense')).toThrow(EInvoiceReadError);
  });

  it('does not treat images as e-invoices', async () => {
    await expect(readEInvoice(Buffer.from('x'), '.png')).resolves.toBeNull();
  });
});
