// Block 2 test data: customers, suppliers and subcontractors of the demo roofing company.
import { ContactType, PrismaClient } from '@prisma/client';
import { avatarSvg, colorFor, initialsOf, writeSeedImage } from './helpers';

const { CUSTOMER, SUPPLIER, SUBCONTRACTOR } = ContactType;

const CONTACTS = [
  {
    types: [CUSTOMER], number: 'K-1001', organizationName: 'Wohnbau Ulm GmbH', street: 'Hirschstraße 14', zipCode: '89073',
    city: 'Ulm', email: 'verwaltung@wohnbau-ulm.example', phone: '0731 555 100', vatId: 'DE811111111', paymentTermDays: 14,
    notes: 'Hausverwaltung, viele Mehrfamilienhäuser. Ansprechpartnerin: Frau Lang.',
  },
  {
    types: [CUSTOMER], number: 'K-1002', isOrganization: false, salutation: 'Herr', firstName: 'Stefan', lastName: 'Becker',
    street: 'Lindenweg 3', zipCode: '89231', city: 'Neu-Ulm', email: 's.becker@mail.example', mobile: '0170 1234567', paymentTermDays: 14,
    notes: 'Privatkunde, Einfamilienhaus Baujahr 1978, Dach komplett neu.',
  },
  {
    types: [CUSTOMER], number: 'K-1003', organizationName: 'Gemeinde Blaustein', street: 'Marktplatz 1', zipCode: '89134',
    city: 'Blaustein', email: 'bauamt@blaustein.example', phone: '07304 8010', paymentTermDays: 30,
    notes: 'Öffentlicher Auftraggeber – E-Rechnung/Leitweg-ID erforderlich.',
  },
  {
    types: [SUPPLIER], number: 'L-2001', organizationName: 'Baustoffhandel Maier & Söhne KG', street: 'Industriestraße 22',
    zipCode: '89079', city: 'Ulm', email: 'bestellung@baustoffe-maier.example', phone: '0731 777 200', vatId: 'DE822222222',
    iban: 'DE89370400440532013000', paymentTermDays: 30, notes: 'Hauptlieferant für Lattung, Dämmung, Kleinteile.',
  },
  {
    types: [SUPPLIER], number: 'L-2002', organizationName: 'Tondach Süd GmbH', street: 'Ziegeleiweg 5', zipCode: '88400',
    city: 'Biberach', email: 'vertrieb@tondach-sued.example', phone: '07351 9090', vatId: 'DE833333333', paymentTermDays: 21,
    notes: 'Dachziegel und Zubehör, Lieferung direkt auf die Baustelle.',
  },
  {
    types: [SUBCONTRACTOR], number: 'S-3001', organizationName: 'Gerüstbau Wagner GmbH', street: 'Werkstraße 9', zipCode: '89077',
    city: 'Ulm', email: 'info@geruestbau-wagner.example', phone: '0731 888 300', vatId: 'DE844444444', paymentTermDays: 14,
    notes: 'Gerüststellung. Nachweis §13b-Bauleistung/Freistellungsbescheinigung anfordern.',
  },
  {
    types: [CUSTOMER, SUBCONTRACTOR], number: 'K-1004', organizationName: 'Zimmerei Huber GmbH', street: 'Holzgasse 2', zipCode: '89264',
    city: 'Weißenhorn', email: 'kontakt@zimmerei-huber.example', phone: '07309 4545', vatId: 'DE855555555', paymentTermDays: 14,
    notes: 'Arbeitet mit uns zusammen: mal Auftraggeber (Dacheindeckung), mal Subunternehmer (Dachstuhl).',
  },
  {
    // Archived example so the "Archivierte anzeigen" filter has something to show.
    types: [CUSTOMER], number: 'K-0999', isOrganization: false, salutation: 'Frau', firstName: 'Helga', lastName: 'Meyer',
    street: 'Bahnhofstraße 40', zipCode: '89073', city: 'Ulm', isActive: false, notes: 'Altkunde, seit 2022 inaktiv.',
  },
];

export async function seedContacts(prisma: PrismaClient, companyId: string): Promise<void> {
  for (const contact of CONTACTS) {
    const label = contact.organizationName ?? `${contact.firstName} ${contact.lastName}`;
    await prisma.contact.create({
      data: {
        ...contact,
        companyId,
        imagePath: writeSeedImage(
          'contacts',
          `seed-${contact.number.toLowerCase()}.svg`,
          avatarSvg(initialsOf(label), colorFor(label)),
        ),
      },
    });
  }
}
