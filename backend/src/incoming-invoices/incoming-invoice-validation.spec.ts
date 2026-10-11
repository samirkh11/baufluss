import { approvalIssues } from './incoming-invoice-validation';

const valid = {
  supplierName: 'Ziegelwerk Nord',
  invoiceNumber: 'R-2026-118',
  invoiceDate: new Date('2026-10-01'),
  netAmount: 1000,
  vatAmount: 190,
  grossAmount: 1190,
  reverseCharge: false,
};

describe('approvalIssues', () => {
  it('accepts complete data', () => {
    expect(approvalIssues(valid)).toEqual([]);
  });

  it('reports missing supplier, number and date', () => {
    const issues = approvalIssues({ ...valid, supplierName: '', invoiceNumber: ' ', invoiceDate: null });
    expect(issues).toHaveLength(3);
  });

  it('accepts a supplier from the contacts instead of a name', () => {
    expect(approvalIssues({ ...valid, supplierName: null, supplierId: 'abc' })).toEqual([]);
  });

  it('reports amounts that do not add up (tolerance 1 cent)', () => {
    expect(approvalIssues({ ...valid, grossAmount: 1190.01 })).toEqual([]);
    expect(approvalIssues({ ...valid, grossAmount: 1200 })).toHaveLength(1);
  });

  it('requires a gross amount', () => {
    expect(approvalIssues({ ...valid, netAmount: 0, vatAmount: 0, grossAmount: 0 })).toContain('Bruttobetrag fehlt.');
  });

  it('forbids VAT on §13b invoices', () => {
    expect(approvalIssues({ ...valid, reverseCharge: true })).toHaveLength(1);
    expect(approvalIssues({ ...valid, reverseCharge: true, vatAmount: 0, grossAmount: 1000 })).toEqual([]);
  });
});
