import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../common/prisma/prisma.service';
import { DEFAULT_FONT, registerEmbeddedFonts } from '../documents/pdf-fonts';

interface Section {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

// Generates the compliance documents from the company data and the settings: the GoBD process
// documentation (Verfahrensdokumentation) and the data protection papers (VVT + TOM draft).
// The texts describe what the software really does; items the company must fill in are marked.
@Injectable()
export class CompliancePdfService {
  constructor(private readonly prisma: PrismaService) {}

  private async context(companyId: string) {
    const [company, settings] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      this.prisma.complianceSettings.findUnique({ where: { companyId } }),
    ]);
    return { company, settings };
  }

  private render(title: string, subtitle: string, sections: Section[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 56, font: DEFAULT_FONT, info: { Title: title }, bufferPages: true });
      registerEmbeddedFonts(doc);
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.font('Helvetica-Bold').fontSize(20).text(title);
      doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#555').text(subtitle).fillColor('#000');
      sections.forEach((section, index) => {
        doc.moveDown(1).font('Helvetica-Bold').fontSize(13).text(`${index + 1}. ${section.heading}`);
        doc.font('Helvetica').fontSize(10);
        for (const paragraph of section.paragraphs ?? []) doc.moveDown(0.4).text(paragraph, { align: 'left' });
        for (const bullet of section.bullets ?? []) doc.moveDown(0.2).text(`•  ${bullet}`, { indent: 10 });
      });
      const range = doc.bufferedPageRange();
      for (let page = 0; page < range.count; page++) {
        doc.switchToPage(range.start + page);
        doc.font('Helvetica').fontSize(8).fillColor('#888').text(`${title} – Seite ${page + 1} von ${range.count}`, 56, doc.page.height - 40, { align: 'center', width: doc.page.width - 112 });
      }
      doc.end();
    });
  }

  async procedureDocumentation(companyId: string): Promise<Buffer> {
    const { company, settings } = await this.context(companyId);
    const todo = '[bitte ergänzen]';
    const years = settings?.retentionYearsInvoices ?? 8;
    return this.render('Verfahrensdokumentation zur ordnungsmäßigen Buchführung (GoBD)', `${company.name} · Stand ${new Date().toLocaleDateString('de-DE')} · erzeugt mit Meisterwerk`, [
      {
        heading: 'Allgemeine Beschreibung',
        paragraphs: [
          `Das Unternehmen ${company.name}, ${company.street}, ${company.zipCode} ${company.city}, nutzt die cloudbasierte Branchensoftware „Meisterwerk“ für Kontakte, Projekte, Angebote, Aufträge, Rechnungen, Mahnwesen, Eingangsrechnungen und Zeiterfassung.`,
          `Verantwortlich für die Verfahrensdokumentation und die Organisation des Verfahrens: ${settings?.responsiblePerson || todo}.`,
          'Die Dokumentation beschreibt den Ablauf von der Erfassung bis zur Aufbewahrung der steuerlich relevanten Unterlagen und ist bei Änderungen des Verfahrens fortzuschreiben.',
        ],
      },
      {
        heading: 'Anwenderdokumentation – Ablauf der Belegverarbeitung',
        bullets: [
          'Ausgangsbelege: Angebot → Auftrag → Rechnung (auch Abschlags- und Schlussrechnung, Gutschrift/Storno). Entwürfe sind veränderbar; mit dem Ausstellen erhält der Beleg eine fortlaufende, lückenlose Nummer aus dem Nummernkreis der Firma und wird gesperrt.',
          'Beim Ausstellen werden Absenderdaten und Empfängeranschrift unveränderlich im Beleg festgehalten (Snapshot). Spätere Änderungen an Stammdaten verändern ausgestellte Belege nicht.',
          'Korrekturen ausgestellter Rechnungen erfolgen ausschließlich durch Stornobeleg (Gutschrift) und neue Rechnung; ausgestellte Rechnungen können weder geändert noch gelöscht werden.',
          'Zahlungseingänge werden je Rechnung erfasst; der Zahlungsstatus wird daraus berechnet. Mahnungen (Zahlungserinnerung bis letzte Mahnung) werden als PDF erzeugt und protokolliert.',
          'Eingangsrechnungen: Beleg wird hochgeladen (PDF, Bild oder strukturierte E-Rechnung XRechnung/ZUGFeRD), die Daten werden erfasst bzw. aus der E-Rechnung gelesen, durch eine berechtigte Person geprüft, freigegeben oder abgelehnt und nach Zahlung als bezahlt markiert. Freigegebene Beträge sind gesperrt.',
          'E-Rechnungen: Für ausgestellte Rechnungen können XRechnung (UBL/CII) und ZUGFeRD/Factur-X (PDF/A-3) erzeugt werden.',
        ],
      },
      {
        heading: 'Technische Systemdokumentation',
        bullets: [
          'Architektur: Webanwendung (React) und REST-Schnittstelle (NestJS) mit relationaler PostgreSQL-Datenbank; Mandantentrennung über die Firmenzugehörigkeit jedes Datensatzes.',
          `Hosting und Betrieb: ${settings?.hostingDescription || todo}`,
          'Zugriffsschutz: Anmeldung mit persönlichem Konto (Passwort-Hash, Token-Authentifizierung); Rollen Inhaber, Administrator und Mitarbeiter. Kaufmännische Daten sind nur Inhaber/Administrator zugänglich.',
          'Datenintegrität: Beträge werden serverseitig berechnet; Nummernkreise werden atomar vergeben (lückenlos). Originaldateien von Eingangsrechnungen und die archivierten Ausgangsbelege werden mit SHA-256-Prüfsumme gespeichert.',
          'Protokollierung: Jede schreibende Aktion eines Nutzers wird mit Zeitpunkt, Nutzer, Vorgang und Inhalt unveränderlich im Änderungsprotokoll festgehalten; das Protokoll kann in der Anwendung eingesehen werden.',
        ],
      },
      {
        heading: 'Archivierung und Aufbewahrung',
        paragraphs: [
          'Beim Ausstellen eines Belegs wird das PDF exakt so, wie es erzeugt wurde, in einem schreibgeschützten Archiv abgelegt (zusätzlich bei Rechnungen die XRechnung-XML, soweit erzeugbar). Das Archiv wird von der Anwendung nie überschrieben oder gelöscht. Über „Archiv prüfen“ werden alle Prüfsummen neu berechnet und mit dem Soll abgeglichen.',
          `Aufbewahrungsfristen: Rechnungen und Buchungsbelege ${years} Jahre, übrige Handels- und Geschäftsbriefe ${settings?.retentionYearsOther ?? 6} Jahre, jeweils ab Ende des Kalenderjahres des Belegs. Vor Ablauf der Frist werden Belege nicht gelöscht; personenbezogene Daten gesperrter Kontakte werden nur anonymisiert, wenn gesetzliche Aufbewahrungspflichten einer Löschung entgegenstehen. Die gesetzlichen Fristen sind regelmäßig zu prüfen.`,
          'Maschinelle Auswertbarkeit: Für Betriebsprüfungen kann ein Datenträger nach GoBD (index.xml mit CSV-Tabellen und Belegen) sowie ein DATEV-Buchungsstapel erzeugt werden.',
        ],
      },
      {
        heading: 'Betriebsdokumentation und Datensicherung',
        paragraphs: [`Datensicherung: ${settings?.backupDescription || todo}`, 'Verfahren bei Störungen, Wiederherstellung und Test der Sicherungen sind vom Betreiber zu beschreiben und regelmäßig zu prüfen.'],
      },
      {
        heading: 'Internes Kontrollsystem (IKS)',
        bullets: [
          'Zugriffsberechtigungen über Rollen; Vergabe nur durch Inhaber/Administrator.',
          'Freigabeprozess für Eingangsrechnungen (Erfassung, Prüfung, Freigabe, Zahlung) mit Protokoll.',
          'Plausibilitätsprüfungen: Pflichtangaben nach § 14 UStG vor dem Ausstellen, Beträge Netto + USt = Brutto, Doppelerfassungsprüfung bei Eingangsrechnungen.',
          'Regelmäßige Archivprüfung (Prüfsummen) und Durchsicht des Änderungsprotokolls.',
        ],
      },
      { heading: 'Hinweis', paragraphs: ['Dieses Dokument wurde automatisch aus den Systemeinstellungen erstellt und ersetzt keine steuerliche Beratung. Mit [bitte ergänzen] markierte Stellen müssen vom Unternehmen ergänzt werden.'] },
    ]);
  }

  async privacyDocumentation(companyId: string): Promise<Buffer> {
    const { company, settings } = await this.context(companyId);
    return this.render('Datenschutz: Verzeichnis der Verarbeitungstätigkeiten und technisch-organisatorische Maßnahmen (Entwurf)', `${company.name} · Stand ${new Date().toLocaleDateString('de-DE')} · erzeugt mit Meisterwerk`, [
      {
        heading: 'Verantwortlicher',
        paragraphs: [`${company.name}, ${company.street}, ${company.zipCode} ${company.city}. E-Mail: ${company.email ?? '[bitte ergänzen]'}. Datenschutzbeauftragter/Ansprechpartner: ${settings?.responsiblePerson || '[bitte ergänzen]'}.`],
      },
      {
        heading: 'Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO)',
        bullets: [
          'Kunden-, Lieferanten- und Subunternehmerverwaltung – Zweck: Vertragsanbahnung/-durchführung (Art. 6 Abs. 1 lit. b); Daten: Name, Anschrift, Kontaktdaten, USt-IdNr., Bankverbindung; Betroffene: Kunden, Lieferanten, Ansprechpartner; Löschfrist: nach Wegfall des Zwecks, soweit keine Aufbewahrungspflicht (Rechnungen 8 Jahre, Geschäftsbriefe 6 Jahre).',
          'Angebote, Aufträge, Rechnungen, Mahnwesen – Zweck: Vertragsabwicklung, Buchführung (lit. b, c); Aufbewahrung nach § 147 AO / § 257 HGB.',
          'Projekt- und Baustellenberichte mit Fotos – Zweck: Dokumentation der Leistungserbringung; Hinweis: Fotos können Personen zeigen, ggf. Betroffene informieren.',
          'Mitarbeiterdaten und Zeiterfassung – Zweck: Durchführung des Beschäftigungsverhältnisses, Arbeitszeitnachweis (§ 26 BDSG, § 16 ArbZG); Aufbewahrung der Arbeitszeitnachweise 2 Jahre.',
          'Eingangsrechnungen – Zweck: Buchführung, Zahlungsabwicklung (lit. c); Aufbewahrung 8 Jahre.',
          'Änderungsprotokoll – Zweck: Nachvollziehbarkeit nach GoBD, IT-Sicherheit (lit. c, f).',
        ],
      },
      {
        heading: 'Technisch-organisatorische Maßnahmen (Art. 32 DSGVO)',
        bullets: [
          'Zutrittskontrolle: Rechenzentrum des Hosters – Nachweise des Hosters anfordern.',
          'Zugangskontrolle: persönliche Konten, Passwort-Hashing (bcrypt), tokenbasierte Anmeldung.',
          'Zugriffskontrolle: Rollen und Rechte (Inhaber/Administrator/Mitarbeiter), Mandantentrennung in der Datenbank.',
          'Weitergabekontrolle: verschlüsselte Übertragung (HTTPS/TLS) – im Betrieb sicherzustellen; Originalbelege nur über authentifizierte Schnittstellen abrufbar.',
          'Eingabekontrolle: Änderungsprotokoll mit Nutzer, Zeitpunkt und Inhalt jeder schreibenden Aktion; Auskünfte und Exporte werden protokolliert.',
          'Verfügbarkeitskontrolle: Datensicherung – siehe Verfahrensdokumentation.',
          'Integrität: SHA-256-Prüfsummen der archivierten Belege, Archivprüfung.',
          'Trennungskontrolle: Daten verschiedener Mandanten werden logisch getrennt.',
          'Betroffenenrechte: Datenauskunft (Export) und Löschung/Anonymisierung je Kontakt in der Anwendung.',
        ],
      },
      {
        heading: 'Auftragsverarbeitung (Art. 28 DSGVO)',
        paragraphs: [
          'Wird Meisterwerk als Cloud-Dienst betrieben, verarbeitet der Betreiber personenbezogene Daten im Auftrag der Kunden. Hierfür ist ein Vertrag zur Auftragsverarbeitung (AVV) zwischen Betreiber und Kunde abzuschließen; eingesetzte Unterauftragnehmer (Hosting, E-Mail, Zahlungsanbieter) sind darin aufzuführen.',
          `Hosting laut Einstellungen: ${settings?.hostingDescription || '[bitte ergänzen]'}`,
        ],
      },
      { heading: 'Hinweis', paragraphs: ['Entwurf zur Vorlage beim Datenschutzbeauftragten bzw. Rechtsberater; er ersetzt keine Rechtsberatung.'] },
    ]);
  }
}
