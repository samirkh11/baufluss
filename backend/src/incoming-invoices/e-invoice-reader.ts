import { XMLParser } from 'fast-xml-parser';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, PDFHexString, decodePDFRawStream } from 'pdf-lib';

// Reads incoming e-invoices (EN16931): XRechnung / UBL, XRechnung / CII and ZUGFeRD / Factur-X (the CII
// XML embedded in a PDF). Pure parsing, no database; the result is a flat, format-independent summary
// that prefills an incoming invoice. Money values are decimal strings.

export type EInvoiceFormat = 'XRECHNUNG_UBL' | 'XRECHNUNG_CII' | 'ZUGFERD';

export interface ParsedEInvoice {
  format: EInvoiceFormat;
  typeCode: string | null; // 380 invoice, 381 credit note, 384 corrected invoice, 386 prepayment, ...
  isCreditNote: boolean;
  number: string | null;
  issueDate: string | null; // YYYY-MM-DD
  dueDate: string | null;
  serviceDate: string | null; // start of the service period / delivery date
  currency: string | null;
  buyerReference: string | null;
  note: string | null;
  seller: {
    name: string | null;
    vatId: string | null;
    taxId: string | null;
    iban: string | null;
    email: string | null;
    street: string | null;
    zipCode: string | null;
    city: string | null;
    country: string | null;
  };
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  reverseCharge: boolean;
  lines: { position: string | null; name: string; quantity: string | null; unit: string | null; unitPrice: string | null; net: string | null }[];
}

export class EInvoiceReadError extends Error {}

// Attributes are kept ("@_unitCode"), namespace prefixes are dropped so UBL and CII documents of any
// producer (cbc:/cac:/ram:/rsm: or default namespaces) look the same.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

type Node = Record<string, unknown>;

const arr = (value: unknown): unknown[] => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);
const obj = (value: unknown): Node => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Node) : {});
// text content of an element that may carry attributes
const text = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) return text(value[0]);
  const inner = (value as Node)['#text'];
  return typeof inner === 'string' ? inner.trim() || null : null;
};
const at = (node: unknown, ...path: string[]): unknown => path.reduce<unknown>((current, key) => (current === undefined ? undefined : obj(Array.isArray(current) ? current[0] : current)[key]), node);
const str = (node: unknown, ...path: string[]) => text(at(node, ...path));
const attr = (value: unknown, name: string): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  const found = obj(raw)[`@_${name}`];
  return typeof found === 'string' ? found : null;
};
const decimal = (value: string | null): string => (value && /^-?\d+(\.\d+)?$/.test(value) ? value : '0');
const compactId = (value: string | null) => (value ? value.replace(/\s+/g, '').toUpperCase() : null);

// "20261011" (CII format 102) or "2026-10-11" -> "2026-10-11"
function isoDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : null;
}

// ---- XML (XRechnung UBL / CII)
export function parseEInvoiceXml(xml: string): ParsedEInvoice {
  let root: Node;
  try {
    root = parser.parse(xml) as Node;
  } catch {
    throw new EInvoiceReadError('Die XML-Datei ist nicht lesbar.');
  }
  if (root['CrossIndustryInvoice']) return parseCii(obj(root['CrossIndustryInvoice']));
  if (root['Invoice']) return parseUbl(obj(root['Invoice']), false);
  if (root['CreditNote']) return parseUbl(obj(root['CreditNote']), true);
  throw new EInvoiceReadError('Das ist keine E-Rechnung (weder UBL noch CII).');
}

function parseUbl(inv: Node, creditNoteElement: boolean): ParsedEInvoice {
  const typeCode = str(inv, creditNoteElement ? 'CreditNoteTypeCode' : 'InvoiceTypeCode');
  const party = obj(at(inv, 'AccountingSupplierParty', 'Party'));
  const taxSchemes = arr(party['PartyTaxScheme']).map((entry) => ({ id: str(entry, 'CompanyID'), scheme: str(entry, 'TaxScheme', 'ID') }));
  const subtotals = arr(at(inv, 'TaxTotal')).flatMap((total) => arr(obj(total)['TaxSubtotal']));
  const total = obj(at(inv, 'LegalMonetaryTotal'));
  const lineKey = creditNoteElement ? 'CreditNoteLine' : 'InvoiceLine';
  const quantityKey = creditNoteElement ? 'CreditedQuantity' : 'InvoicedQuantity';
  const taxAmount = arr(at(inv, 'TaxTotal')).map((entry) => decimal(str(entry, 'TaxAmount')));
  const gross = decimal(text(total['TaxInclusiveAmount']));

  return {
    format: 'XRECHNUNG_UBL',
    typeCode,
    isCreditNote: creditNoteElement || typeCode === '381',
    number: str(inv, 'ID'),
    issueDate: isoDate(str(inv, 'IssueDate')),
    dueDate: isoDate(str(inv, 'DueDate')),
    serviceDate: isoDate(str(inv, 'InvoicePeriod', 'StartDate') ?? str(inv, 'Delivery', 'ActualDeliveryDate')),
    currency: str(inv, 'DocumentCurrencyCode'),
    buyerReference: str(inv, 'BuyerReference'),
    note: arr(inv['Note']).map(text).filter(Boolean).join('\n') || null,
    seller: {
      name: str(party, 'PartyLegalEntity', 'RegistrationName') ?? str(party, 'PartyName', 'Name'),
      vatId: taxSchemes.find((entry) => entry.scheme === 'VAT')?.id ?? null,
      taxId: taxSchemes.find((entry) => entry.scheme !== 'VAT')?.id ?? null,
      iban: arr(inv['PaymentMeans']).map((means) => str(means, 'PayeeFinancialAccount', 'ID')).find(Boolean) ?? null,
      email: str(party, 'Contact', 'ElectronicMail') ?? str(party, 'EndpointID'),
      street: str(party, 'PostalAddress', 'StreetName'),
      zipCode: str(party, 'PostalAddress', 'PostalZone'),
      city: str(party, 'PostalAddress', 'CityName'),
      country: str(party, 'PostalAddress', 'Country', 'IdentificationCode'),
    },
    netAmount: decimal(text(total['TaxExclusiveAmount'])),
    vatAmount: taxAmount[0] ?? '0',
    grossAmount: gross,
    reverseCharge: subtotals.some((subtotal) => str(subtotal, 'TaxCategory', 'ID') === 'AE'),
    lines: arr(inv[lineKey]).map((line) => ({
      position: str(line, 'ID'),
      name: str(line, 'Item', 'Name') ?? '',
      quantity: text(obj(line)[quantityKey]),
      unit: attr(obj(line)[quantityKey], 'unitCode'),
      unitPrice: str(line, 'Price', 'PriceAmount'),
      net: str(line, 'LineExtensionAmount'),
    })),
  };
}

function parseCii(cii: Node): ParsedEInvoice {
  const doc = obj(cii['ExchangedDocument']);
  const trade = obj(cii['SupplyChainTradeTransaction']);
  const agreement = obj(trade['ApplicableHeaderTradeAgreement']);
  const delivery = obj(trade['ApplicableHeaderTradeDelivery']);
  const settlement = obj(trade['ApplicableHeaderTradeSettlement']);
  const seller = obj(agreement['SellerTradeParty']);
  const registrations = arr(seller['SpecifiedTaxRegistration']).map((entry) => ({ id: str(entry, 'ID'), scheme: attr(obj(entry)['ID'], 'schemeID') }));
  const sum = obj(settlement['SpecifiedTradeSettlementHeaderMonetarySummation']);
  const typeCode = text(doc['TypeCode']);
  const dateOf = (node: unknown, ...path: string[]) => isoDate(str(node, ...path, 'DateTimeString'));
  const taxes = arr(settlement['ApplicableTradeTax']);

  return {
    format: 'XRECHNUNG_CII',
    typeCode,
    isCreditNote: typeCode === '381',
    number: str(doc, 'ID'),
    issueDate: dateOf(doc, 'IssueDateTime'),
    dueDate: dateOf(settlement, 'SpecifiedTradePaymentTerms', 'DueDateDateTime'),
    serviceDate: dateOf(settlement, 'BillingSpecifiedPeriod', 'StartDateTime') ?? dateOf(delivery, 'ActualDeliverySupplyChainEvent', 'OccurrenceDateTime'),
    currency: str(settlement, 'InvoiceCurrencyCode'),
    buyerReference: str(agreement, 'BuyerReference'),
    note: arr(doc['IncludedNote']).map((note) => str(note, 'Content')).filter(Boolean).join('\n') || null,
    seller: {
      name: str(seller, 'Name'),
      vatId: registrations.find((entry) => entry.scheme === 'VA')?.id ?? null,
      taxId: registrations.find((entry) => entry.scheme === 'FC')?.id ?? null,
      iban: arr(settlement['SpecifiedTradeSettlementPaymentMeans']).map((means) => str(means, 'PayeePartyCreditorFinancialAccount', 'IBANID')).find(Boolean) ?? null,
      email: str(seller, 'URIUniversalCommunication', 'URIID') ?? str(seller, 'DefinedTradeContact', 'EmailURIUniversalCommunication', 'URIID'),
      street: str(seller, 'PostalTradeAddress', 'LineOne'),
      zipCode: str(seller, 'PostalTradeAddress', 'PostcodeCode'),
      city: str(seller, 'PostalTradeAddress', 'CityName'),
      country: str(seller, 'PostalTradeAddress', 'CountryID'),
    },
    netAmount: decimal(text(sum['TaxBasisTotalAmount']) ?? text(sum['LineTotalAmount'])),
    vatAmount: decimal(text(sum['TaxTotalAmount'])),
    grossAmount: decimal(text(sum['GrandTotalAmount'])),
    reverseCharge: taxes.some((tax) => str(tax, 'CategoryCode') === 'AE'),
    lines: arr(trade['IncludedSupplyChainTradeLineItem']).map((line) => ({
      position: str(line, 'AssociatedDocumentLineDocument', 'LineID'),
      name: str(line, 'SpecifiedTradeProduct', 'Name') ?? '',
      quantity: text(at(line, 'SpecifiedLineTradeDelivery', 'BilledQuantity')),
      unit: attr(at(line, 'SpecifiedLineTradeDelivery', 'BilledQuantity'), 'unitCode'),
      unitPrice: str(line, 'SpecifiedLineTradeAgreement', 'NetPriceProductTradePrice', 'ChargeAmount'),
      net: str(line, 'SpecifiedLineTradeSettlement', 'SpecifiedTradeSettlementLineMonetarySummation', 'LineTotalAmount'),
    })),
  };
}

// ---- PDF (ZUGFeRD / Factur-X)

// Collects the (name, file specification) pairs of the PDF's EmbeddedFiles name tree.
function collectEmbeddedFiles(tree: PDFDict, out: { name: string; spec: PDFDict }[]): void {
  const names = tree.lookupMaybe(PDFName.of('Names'), PDFArray);
  if (names) {
    for (let index = 0; index + 1 < names.size(); index += 2) {
      const label = names.lookup(index);
      const spec = names.lookupMaybe(index + 1, PDFDict);
      const name = label instanceof PDFString || label instanceof PDFHexString ? label.decodeText() : '';
      if (spec) out.push({ name, spec });
    }
  }
  const kids = tree.lookupMaybe(PDFName.of('Kids'), PDFArray);
  for (let index = 0; kids && index < kids.size(); index += 1) {
    const kid = kids.lookupMaybe(index, PDFDict);
    if (kid) collectEmbeddedFiles(kid, out);
  }
}

// Returns the invoice XML embedded in a ZUGFeRD / Factur-X PDF, or null if there is none.
export async function extractEmbeddedInvoiceXml(pdf: Buffer): Promise<string | null> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    throw new EInvoiceReadError('Die PDF-Datei ist nicht lesbar.');
  }
  const embedded = document.catalog.lookupMaybe(PDFName.of('Names'), PDFDict)?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  if (!embedded) return null;
  const files: { name: string; spec: PDFDict }[] = [];
  collectEmbeddedFiles(embedded, files);
  for (const file of files.filter((entry) => entry.name.toLowerCase().endsWith('.xml'))) {
    const stream = file.spec.lookupMaybe(PDFName.of('EF'), PDFDict)?.lookup(PDFName.of('F'));
    if (!(stream instanceof PDFRawStream)) continue;
    const xml = Buffer.from(decodePDFRawStream(stream).decode()).toString('utf8');
    if (/CrossIndustryInvoice|<(\w+:)?Invoice[\s>]/.test(xml)) return xml;
  }
  return null;
}

export async function parseEInvoicePdf(pdf: Buffer): Promise<ParsedEInvoice | null> {
  const xml = await extractEmbeddedInvoiceXml(pdf);
  return xml ? { ...parseEInvoiceXml(xml), format: 'ZUGFERD' } : null;
}

// Tries to read an uploaded file as e-invoice. Returns null for ordinary PDFs/images (no e-invoice).
export async function readEInvoice(buffer: Buffer, extension: string): Promise<ParsedEInvoice | null> {
  if (extension === '.xml') return parseEInvoiceXml(buffer.toString('utf8'));
  if (extension === '.pdf') return parseEInvoicePdf(buffer);
  return null;
}
