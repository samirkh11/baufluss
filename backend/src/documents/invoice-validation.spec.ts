import { DocumentItemKind, InvoiceKind } from '@prisma/client';
import { InvoiceCheckInput, validateInvoice } from './invoice-validation';

const valid = (): InvoiceCheckInput => ({
  issuer: { name: 'Dachdeckerei Schmidt GmbH', street: 'Am Sägewerk 7', zipCode: '89073', city: 'Ulm', taxId: '151/123/45678', vatId: 'DE123456789' },
  recipient: { name: 'Wohnbau Ulm GmbH', street: 'Hirschstraße 14', zipCode: '89073', city: 'Ulm' },
  details: { serviceDateFrom: new Date('2026-09-14'), serviceDateTo: new Date('2026-10-09'), paymentTermDays: 14, reverseCharge: false, recipientVatId: null },
  items: [
    { kind: DocumentItemKind.HEADING, name: 'Dach', quantity: 1, unitPrice: 0, vatRate: 19, discountPercent: 0, isOptional: false },
    { kind: DocumentItemKind.POSITION, name: 'Eindeckung', quantity: 10, unitPrice: 95, vatRate: 19, discountPercent: 0, isOptional: false },
  ],
});

describe('validateInvoice', () => {
  it('accepts a complete invoice', () => {
    expect(validateInvoice(valid())).toEqual([]);
  });

  it('accepts either a tax number or a VAT id of the issuer', () => {
    const onlyVat = valid();
    onlyVat.issuer.taxId = null;
    expect(validateInvoice(onlyVat)).toEqual([]);
    const none = valid();
    none.issuer.taxId = '';
    none.issuer.vatId = null;
    expect(validateInvoice(none)).toEqual(['Firmenprofil: Steuernummer oder USt-IdNr. fehlt.']);
  });

  it('requires the issuer address', () => {
    const input = valid();
    input.issuer.city = ' ';
    expect(validateInvoice(input)).toEqual(['Firmenprofil: Name und vollständige Anschrift des Unternehmens fehlen.']);
  });

  it('requires name and address of the recipient', () => {
    const input = valid();
    input.recipient.street = null;
    expect(validateInvoice(input)).toEqual(['Empfänger: Name und vollständige Anschrift fehlen (beim Kontakt ergänzen).']);
  });

  it('requires a service date and a sensible service period', () => {
    const missing = valid();
    missing.details.serviceDateFrom = null;
    expect(validateInvoice(missing)).toEqual(['Leistungsdatum bzw. Leistungszeitraum fehlt.']);
    const reversed = valid();
    reversed.details.serviceDateTo = new Date('2026-09-01');
    expect(validateInvoice(reversed)).toEqual(['Leistungszeitraum: Das Ende liegt vor dem Beginn.']);
  });

  it('requires a payment term', () => {
    const input = valid();
    input.details.paymentTermDays = null;
    expect(validateInvoice(input)).toContain('Zahlungsziel fehlt.');
  });

  it('rejects invoices without positions, with optional positions or without a total', () => {
    const empty = valid();
    empty.items = [];
    expect(validateInvoice(empty)).toContain('Die Rechnung enthält keine Positionen.');

    const optional = valid();
    optional.items.push({ kind: DocumentItemKind.POSITION, name: 'Alternative', quantity: 1, unitPrice: 50, vatRate: 19, discountPercent: 0, isOptional: true });
    expect(validateInvoice(optional)).toEqual([expect.stringContaining('Optionalpositionen')]);

    const zero = valid();
    zero.items[1].unitPrice = 0;
    expect(validateInvoice(zero)).toEqual(['Die Rechnungssumme muss größer als 0 € sein.']);
  });

  it('rejects unnamed lines', () => {
    const input = valid();
    input.items[1].name = '';
    expect(validateInvoice(input)).toContain('Mindestens eine Zeile hat keine Bezeichnung.');
  });

  describe('partial and final invoices, retention', () => {
    it('allows a final invoice with a 0 € balance but not a negative one', () => {
      const input = valid();
      input.details.kind = InvoiceKind.FINAL;
      input.items.push({ kind: DocumentItemKind.POSITION, name: 'Abzug', quantity: 1, unitPrice: -950, vatRate: 19, discountPercent: 0, isOptional: false });
      expect(validateInvoice(input)).toEqual([]);
      input.items[2].unitPrice = -1000;
      expect(validateInvoice(input)).toEqual([expect.stringContaining('übersteigen den Rechnungswert')]);
    });

    it('still requires a positive total for standard and partial invoices', () => {
      const input = valid();
      input.details.kind = InvoiceKind.PARTIAL;
      input.items[1].unitPrice = 0;
      expect(validateInvoice(input)).toEqual(['Die Rechnungssumme muss größer als 0 € sein.']);
    });

    it('needs a due date for the retention', () => {
      const input = valid();
      input.details.retentionPercent = 5;
      expect(validateInvoice(input)).toEqual([expect.stringContaining('Sicherheitseinbehalt')]);
      input.details.retentionDueDate = new Date('2031-10-12');
      expect(validateInvoice(input)).toEqual([]);
    });
  });

  describe('reverse charge (§ 13b)', () => {
    const reverse = () => {
      const input = valid();
      input.details.reverseCharge = true;
      input.details.recipientVatId = 'DE811111111';
      input.items[1].vatRate = 0;
      return input;
    };

    it('accepts a complete reverse-charge invoice', () => {
      expect(validateInvoice(reverse())).toEqual([]);
    });

    it('needs both VAT ids and 0 % on all positions', () => {
      const input = reverse();
      input.issuer.vatId = null;
      input.details.recipientVatId = null;
      input.items[1].vatRate = 19;
      const problems = validateInvoice(input);
      expect(problems).toEqual(expect.arrayContaining([
        '§ 13b: Die USt-IdNr. des Unternehmens muss im Firmenprofil hinterlegt sein.',
        '§ 13b: Die USt-IdNr. des Empfängers fehlt (beim Kontakt ergänzen).',
        '§ 13b: Alle Positionen müssen den Steuersatz 0 % haben (die Steuer schuldet der Empfänger).',
      ]));
    });
  });
});
