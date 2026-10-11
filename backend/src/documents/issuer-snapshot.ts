import { Company } from '@prisma/client';

// The company data that is frozen into an issued document (Document.issuerSnapshot), so changing
// the company profile later never alters an already issued document (GoBD).
export type IssuerData = Pick<
  Company,
  | 'name' | 'legalForm' | 'street' | 'zipCode' | 'city' | 'country' | 'taxId' | 'vatId' | 'iban' | 'bic'
  | 'email' | 'phone' | 'website' | 'logoPath' | 'letterheadHeaderText' | 'letterheadFooterText'
>;

export function issuerSnapshotOf(company: Company): IssuerData {
  const { name, legalForm, street, zipCode, city, country, taxId, vatId, iban, bic, email, phone, website, logoPath, letterheadHeaderText, letterheadFooterText } = company;
  return { name, legalForm, street, zipCode, city, country, taxId, vatId, iban, bic, email, phone, website, logoPath, letterheadHeaderText, letterheadFooterText };
}
