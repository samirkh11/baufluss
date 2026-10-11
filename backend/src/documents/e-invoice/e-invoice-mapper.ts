import { DocumentItemKind, DocumentType, Prisma } from '@prisma/client';
import { lineTotal } from '../calculations';
import { IssuerData } from '../issuer-snapshot';

// Maps an ISSUED invoice / credit note to the EN16931 data model (in the UBL-shaped internal format
// of @e-invoice-eu/core). Pure function: no database, no I/O, so it is easy to unit test.
//
// Conventions of the target standard that differ from our storage:
//  - Credit notes (type 381) carry POSITIVE amounts; we store them with negative quantities.
//  - A line price must not be negative (BR-27); we store deduction lines (final invoice) with a
//    negative unit price, so the sign moves to the quantity.
//  - Totals are rebuilt from the lines the same way calculations.ts does (VAT per rate on the sum).

const { Decimal } = Prisma;
type Dec = Prisma.Decimal;
const ROUND = Decimal.ROUND_HALF_UP;
// The library's schema wants all numbers as decimal strings.
const money = (value: Dec): string => value.toDecimalPlaces(2, ROUND).toFixed(2);
const num = (value: Dec): string => value.toDecimalPlaces(4, ROUND).toString();
const day = (date: Date | null | undefined): string | undefined => (date ? date.toISOString().slice(0, 10) : undefined);

export interface EInvoiceSource {
  type: DocumentType;
  number: string | null;
  documentDate: Date;
  currency: string;
  subject: string | null;
  recipientName: string | null;
  recipientStreet: string | null;
  recipientZipCode: string | null;
  recipientCity: string | null;
  recipientCountry: string | null;
  netTotal: Dec;
  vatTotal: Dec;
  grossTotal: Dec;
  items: {
    kind: DocumentItemKind;
    sku: string | null;
    name: string;
    description: string | null;
    quantity: Dec;
    unit: string;
    unitPrice: Dec;
    vatRate: Dec;
    discountPercent: Dec;
    isOptional: boolean;
  }[];
  invoiceDetails: {
    serviceDateFrom: Date | null;
    serviceDateTo: Date | null;
    paymentTermDays: number;
    dueDate: Date | null;
    reverseCharge: boolean;
    recipientVatId: string | null;
    orderReference: string | null;
    buyerReference: string | null;
    retentionPercent: Dec | null;
    retentionAmount: Dec | null;
    retentionDueDate: Date | null;
  } | null;
  project: { number: string } | null;
  sourceDocument: { number: string | null; documentDate?: Date | null } | null;
  recipientContact: { email: string | null; phone: string | null; isOrganization: boolean } | null;
}

export type EInvoiceTarget = 'xrechnung' | 'zugferd';

// Unit of measure -> UN/ECE Recommendation 20 code. Unknown units fall back to "piece" (C62).
const UNIT_CODES: Record<string, string> = {
  stk: 'C62', 'stk.': 'C62', stück: 'C62', st: 'C62',
  'm²': 'MTK', qm: 'MTK', m2: 'MTK',
  m: 'MTR', lfm: 'MTR', 'lfd. m': 'MTR',
  'm³': 'MTQ', cbm: 'MTQ', m3: 'MTQ',
  h: 'HUR', std: 'HUR', 'std.': 'HUR', stunde: 'HUR', stunden: 'HUR',
  kg: 'KGM', t: 'TNE', l: 'LTR',
  psch: 'LS', 'psch.': 'LS', pauschal: 'LS', pauschale: 'LS',
  tag: 'DAY', tage: 'DAY', woche: 'WEE', monat: 'MON',
  satz: 'SET', set: 'SET',
};
export const unitCode = (unit: string): string => UNIT_CODES[unit.trim().toLowerCase()] ?? 'C62';

const COUNTRIES: Record<string, string> = { deutschland: 'DE', germany: 'DE', österreich: 'AT', schweiz: 'CH', luxemburg: 'LU', niederlande: 'NL' };
export function countryCode(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
  return COUNTRIES[text.toLowerCase()] ?? 'DE';
}

// What is missing for a valid e-invoice (German messages, shown to the user). XRechnung is stricter
// than ZUGFeRD (electronic addresses, seller contact, buyer reference).
export function readinessIssues(source: EInvoiceSource, issuer: IssuerData, target: EInvoiceTarget): string[] {
  const issues: string[] = [];
  if (!issuer.vatId && !issuer.taxId) issues.push('Steuernummer oder USt-IdNr. im Firmenprofil fehlt.');
  if (!issuer.iban) issues.push('IBAN im Firmenprofil fehlt (Zahlungsangaben).');
  if (!source.recipientName || !source.recipientStreet || !source.recipientCity || !source.recipientZipCode) {
    issues.push('Anschrift des Empfängers ist unvollständig.');
  }
  if (source.invoiceDetails?.reverseCharge && !source.invoiceDetails.recipientVatId) {
    issues.push('Für § 13b fehlt die USt-IdNr. des Empfängers.');
  }
  if (target === 'xrechnung') {
    if (!issuer.email) issues.push('E-Mail-Adresse im Firmenprofil fehlt (XRechnung: Kontakt des Verkäufers).');
    if (!issuer.phone) issues.push('Telefonnummer im Firmenprofil fehlt (XRechnung: Kontakt des Verkäufers).');
    if (!source.recipientContact?.email && !source.invoiceDetails?.buyerReference) {
      issues.push('E-Mail-Adresse des Empfängers fehlt (XRechnung: elektronische Adresse des Käufers).');
    }
  }
  return issues;
}

interface BuiltLine {
  position: number;
  item: EInvoiceSource['items'][number];
  quantity: Dec; // signed as required by the standard
  price: Dec; // never negative
  net: Dec; // line net amount, after discount
  allowance: Dec; // line discount amount (>= 0)
  category: 'S' | 'Z' | 'AE';
  rate: Dec;
}

export function buildEInvoice(source: EInvoiceSource, issuer: IssuerData, target: EInvoiceTarget) {
  const isCredit = source.type === DocumentType.CREDIT_NOTE;
  const details = source.invoiceDetails;
  const reverseCharge = details?.reverseCharge ?? false;
  const currency = source.currency || 'EUR';
  const creditSign = isCredit ? -1 : 1;

  // ---- lines
  const lines: BuiltLine[] = [];
  for (const item of source.items) {
    if (item.kind !== DocumentItemKind.POSITION || item.isOptional) continue;
    const priceSign = new Decimal(item.unitPrice).isNegative() ? -1 : 1;
    const quantity = new Decimal(item.quantity).mul(priceSign * creditSign);
    const price = new Decimal(item.unitPrice).abs();
    const net = lineTotal(item).mul(creditSign);
    // The line discount is what quantity * price exceeds the net amount by.
    const gross = quantity.mul(price).toDecimalPlaces(2, ROUND);
    const allowance = gross.minus(net).toDecimalPlaces(2, ROUND);
    const rate = new Decimal(item.vatRate);
    const category = rate.gt(0) ? 'S' : reverseCharge ? 'AE' : 'Z';
    lines.push({ position: lines.length + 1, item, quantity, price, net, allowance: allowance.gt(0) ? allowance : new Decimal(0), category, rate });
  }

  // ---- VAT breakdown: per (category, rate) on the summed net, rounded like calculations.ts
  const groups = new Map<string, { category: string; rate: Dec; taxable: Dec }>();
  for (const line of lines) {
    const key = `${line.category}-${line.rate.toFixed(2)}`;
    const group = groups.get(key) ?? { category: line.category, rate: line.rate, taxable: new Decimal(0) };
    group.taxable = group.taxable.plus(line.net);
    groups.set(key, group);
  }
  const breakdown = [...groups.values()].map((group) => ({
    ...group,
    tax: group.taxable.mul(group.rate).div(100).toDecimalPlaces(2, ROUND),
  }));
  const lineSum = lines.reduce((sum, line) => sum.plus(line.net), new Decimal(0));
  const taxSum = breakdown.reduce((sum, group) => sum.plus(group.tax), new Decimal(0));
  const gross = lineSum.plus(taxSum);

  const partyAddress = (street: string | null, zip: string | null, city: string | null, country: string | null) => ({
    'cbc:StreetName': street ?? '',
    'cbc:CityName': city ?? '',
    'cbc:PostalZone': zip ?? '',
    'cac:Country': { 'cbc:IdentificationCode': countryCode(country) },
  });

  // ---- seller
  const sellerTax: { 'cbc:CompanyID': string; 'cac:TaxScheme': { 'cbc:ID': string } }[] = [];
  if (issuer.vatId) sellerTax.push({ 'cbc:CompanyID': issuer.vatId, 'cac:TaxScheme': { 'cbc:ID': 'VAT' } });
  else if (issuer.taxId) sellerTax.push({ 'cbc:CompanyID': issuer.taxId, 'cac:TaxScheme': { 'cbc:ID': 'FC' } });
  const seller: Record<string, unknown> = {
    ...(issuer.email ? { 'cbc:EndpointID': issuer.email, 'cbc:EndpointID@schemeID': 'EM' } : {}),
    'cac:PartyName': { 'cbc:Name': issuer.name },
    'cac:PostalAddress': partyAddress(issuer.street, issuer.zipCode, issuer.city, issuer.country),
    ...(sellerTax.length ? { 'cac:PartyTaxScheme': sellerTax } : {}),
    'cac:PartyLegalEntity': { 'cbc:RegistrationName': issuer.name, ...(issuer.legalForm ? { 'cbc:CompanyLegalForm': issuer.legalForm } : {}) },
    'cac:Contact': {
      'cbc:Name': issuer.name,
      ...(issuer.phone ? { 'cbc:Telephone': issuer.phone } : {}),
      ...(issuer.email ? { 'cbc:ElectronicMail': issuer.email } : {}),
    },
  };

  // ---- buyer
  const buyerEmail = source.recipientContact?.email;
  const buyer: Record<string, unknown> = {
    ...(buyerEmail ? { 'cbc:EndpointID': buyerEmail, 'cbc:EndpointID@schemeID': 'EM' } : {}),
    'cac:PartyName': { 'cbc:Name': source.recipientName ?? '' },
    'cac:PostalAddress': partyAddress(source.recipientStreet, source.recipientZipCode, source.recipientCity, source.recipientCountry),
    ...(details?.recipientVatId ? { 'cac:PartyTaxScheme': { 'cbc:CompanyID': details.recipientVatId, 'cac:TaxScheme': { 'cbc:ID': 'VAT' } } } : {}),
    'cac:PartyLegalEntity': { 'cbc:RegistrationName': source.recipientName ?? '' },
  };

  // ---- notes and payment terms
  const notes: string[] = [];
  if (source.subject) notes.push(source.subject);
  if (reverseCharge) notes.push('Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG)');
  if (details?.retentionAmount && details.retentionAmount.gt(0)) {
    notes.push(
      `Sicherheitseinbehalt ${details.retentionPercent?.toString() ?? ''} % (${money(details.retentionAmount)} ${currency})` +
        (details.retentionDueDate ? ` bis ${day(details.retentionDueDate)}` : '') + ' ist Bestandteil des Rechnungsbetrags.',
    );
  }
  const terms = details?.dueDate
    ? `Zahlbar innerhalb von ${details.paymentTermDays} Tagen bis ${day(details.dueDate)} ohne Abzug.`
    : undefined;

  const buyerReference = details?.buyerReference || details?.orderReference || source.project?.number || source.number || 'n/a';

  const invoice: Record<string, unknown> = {
    'cbc:ID': source.number ?? '',
    'cbc:IssueDate': day(source.documentDate),
    ...(details?.dueDate && !isCredit ? { 'cbc:DueDate': day(details.dueDate) } : {}),
    'cbc:InvoiceTypeCode': isCredit ? '381' : '380',
    // one combined note: XRechnung (CII) allows the note only once
    ...(notes.length ? { 'cbc:Note': [notes.join('\n')] } : {}),
    'cbc:DocumentCurrencyCode': currency,
    'cbc:BuyerReference': buyerReference,
    ...(details?.serviceDateFrom || details?.serviceDateTo
      ? { 'cac:InvoicePeriod': { 'cbc:StartDate': day(details.serviceDateFrom ?? details.serviceDateTo), 'cbc:EndDate': day(details.serviceDateTo ?? details.serviceDateFrom) } }
      : {}),
    ...(details?.orderReference ? { 'cac:OrderReference': { 'cbc:ID': details.orderReference } } : {}),
    ...(isCredit && source.sourceDocument?.number
      ? { 'cac:BillingReference': [{ 'cac:InvoiceDocumentReference': { 'cbc:ID': source.sourceDocument.number, ...(source.sourceDocument.documentDate ? { 'cbc:IssueDate': day(source.sourceDocument.documentDate) } : {}) } }] }
      : {}),
    ...(source.project && !isCredit ? { 'cac:ProjectReference': { 'cbc:ID': source.project.number } } : {}),
    'cac:AccountingSupplierParty': { 'cac:Party': seller },
    'cac:AccountingCustomerParty': { 'cac:Party': buyer },
    ...(issuer.iban
      ? {
          'cac:PaymentMeans': [
            {
              'cbc:PaymentMeansCode': '58',
              'cbc:PaymentID': source.number ?? undefined,
              'cac:PayeeFinancialAccount': {
                'cbc:ID': issuer.iban.replace(/\s+/g, ''),
                ...(issuer.bic ? { 'cac:FinancialInstitutionBranch': { 'cbc:ID': issuer.bic } } : {}),
              },
            },
          ],
        }
      : {}),
    ...(terms ? { 'cac:PaymentTerms': { 'cbc:Note': terms } } : {}),
    'cac:TaxTotal': [
      {
        'cbc:TaxAmount': money(taxSum),
        'cbc:TaxAmount@currencyID': currency,
        'cac:TaxSubtotal': breakdown.map((group) => ({
          'cbc:TaxableAmount': money(group.taxable),
          'cbc:TaxableAmount@currencyID': currency,
          'cbc:TaxAmount': money(group.tax),
          'cbc:TaxAmount@currencyID': currency,
          'cac:TaxCategory': {
            'cbc:ID': group.category,
            'cbc:Percent': num(group.rate),
            ...(group.category === 'AE'
              ? { 'cbc:TaxExemptionReasonCode': 'vatex-eu-ae', 'cbc:TaxExemptionReason': 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG)' }
              : group.category === 'Z' ? { 'cbc:TaxExemptionReason': 'Nullsatz' } : {}),
            'cac:TaxScheme': { 'cbc:ID': 'VAT' },
          },
        })),
      },
    ],
    'cac:LegalMonetaryTotal': {
      'cbc:LineExtensionAmount': money(lineSum),
      'cbc:LineExtensionAmount@currencyID': currency,
      'cbc:TaxExclusiveAmount': money(lineSum),
      'cbc:TaxExclusiveAmount@currencyID': currency,
      'cbc:TaxInclusiveAmount': money(gross),
      'cbc:TaxInclusiveAmount@currencyID': currency,
      'cbc:PayableAmount': money(gross),
      'cbc:PayableAmount@currencyID': currency,
    },
    'cac:InvoiceLine': lines.map((line) => ({
      'cbc:ID': String(line.position),
      ...(line.item.description ? { 'cbc:Note': line.item.description.slice(0, 500) } : {}),
      'cbc:InvoicedQuantity': num(line.quantity),
      'cbc:InvoicedQuantity@unitCode': unitCode(line.item.unit),
      'cbc:LineExtensionAmount': money(line.net),
      'cbc:LineExtensionAmount@currencyID': currency,
      ...(line.allowance.gt(0)
        ? {
            'cac:AllowanceCharge': [
              {
                'cbc:ChargeIndicator': 'false',
                'cbc:AllowanceChargeReason': 'Rabatt',
                'cbc:MultiplierFactorNumeric': num(new Decimal(line.item.discountPercent)),
                'cbc:Amount': money(line.allowance),
                'cbc:Amount@currencyID': currency,
                'cbc:BaseAmount': money(line.quantity.mul(line.price)),
                'cbc:BaseAmount@currencyID': currency,
              },
            ],
          }
        : {}),
      'cac:Item': {
        'cbc:Name': line.item.name,
        ...(line.item.sku ? { 'cac:SellersItemIdentification': { 'cbc:ID': line.item.sku } } : {}),
        'cac:ClassifiedTaxCategory': { 'cbc:ID': line.category, 'cbc:Percent': num(line.rate), 'cac:TaxScheme': { 'cbc:ID': 'VAT' } },
      },
      'cac:Price': { 'cbc:PriceAmount': num(line.price), 'cbc:PriceAmount@currencyID': currency },
    })),
  };

  return {
    invoice: { 'ubl:Invoice': invoice },
    // control values for tests / consistency checks against the stored document totals
    totals: { net: lineSum, vat: taxSum, gross },
    target,
  };
}
