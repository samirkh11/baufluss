---
name: project-roadmap
description: Meisterwerk – Die 7 geforderten Funktionsblöcke, Status, empfohlene Reihenfolge
metadata:
  type: project
---

Ursprüngliche Anforderung vom 2026-10-10: 7 Funktionsblöcke für den Start. Jeder Block wird als
vollständige, lokal getestete Ausbaustufe umgesetzt und erst dann committet/gepusht (siehe
[[project_dev_environment]]) — bewusst NICHT alles auf einmal als Rohbau, um keine
halbfertigen Features zu hinterlassen.

## Status

### ✅ Block 1 — Firmenprofil und Konto (fertig, V1)
Firmendaten, Logo-Upload, Briefpapier-Texte, Nummernkreise-Konfiguration, Nutzer & Rollen
(Owner/Admin/Member), Mitarbeiter-Profilbild. Backend: `companies/`, `users/`, `auth/`. Frontend:
`CompanyProfilePage`, `UsersPage`.

### ✅ Block 2 — Kontakte und Stammdaten (fertig, 2026-10-10)
Backend: `contacts/` und `catalog/`. Frontend: `ContactsPage`, `CatalogPage`.
- Ein gemeinsames `Contact`-Modell, Rollen als Array `types` (`CUSTOMER`/`SUPPLIER`/`SUBCONTRACTOR`,
  ein Kontakt kann mehrere Rollen haben). Optionale eigene `number` (unique je Firma, noch nicht an
  Nummernkreise gekoppelt — kann später über `NumberSequence` automatisch vergeben werden).
- Leistungs- und Artikelstamm in EINEM Modell `CatalogItem` mit `kind` (`SERVICE`/`ARTICLE`),
  Netto-VK, optional EK, USt-Satz, Einheit. Preise sind `Decimal(12,2)` → JSON-Strings, Frontend
  wandelt per `Number()`. Angebotspositionen (Block 4) sollen Werte beim Anlegen KOPIEREN.
- Archivieren (`isActive=false`) ist der normale Weg; Löschen ist erlaubt, muss aber ab Block 3/4
  blockiert werden, sobald Projekte/Dokumente auf einen Kontakt/Artikel verweisen (FK Restrict).
- Bilder (2026-10-11 nachgerüstet): Kontakt 1 Bild, Leistung/Artikel mehrere (max. 10), siehe
  [[project_architecture]].
- Listen-Endpunkte: Pagination (`page`,`pageSize`) + `q`-Suche über gemeinsames
  `PaginationQueryDto`; Antwort `{items,total,page,pageSize}`.
- Offen/Ideen: Ansprechpartner je Kontakt, mehrere Adressen (Lieferadresse), CSV-Import,
  Kategorien/Warengruppen im Katalog.

### ✅ Block 3 — Projekte (fertig, 2026-10-11)
Backend: `projects/`, `reports/`. Frontend: `ProjectsPage`, `ProjectDetailPage`, `ReportsPage`,
`components/ProjectFormModal`, `components/ReportsPanel`.
- `Project`: Nummer aus Nummernkreis `PROJECT`, Status (Planung/Ausführung/Pausiert/Abgeschlossen/
  Abgebrochen), Kunde (Contact, FK Restrict → verwendeter Kontakt nur archivierbar), Baustellen-
  Adresse, Zeitraum, Projektleiter, Team (`ProjectMember`, M:N). Ansehen: alle; Anlegen/Ändern/
  Löschen: OWNER/ADMIN.
- **Berichte** gleichrangig: `Report` mit Nummer (`REPORT`), Art (Tages-/Fortschritts-/Mängel-
  bericht, Abnahme, Vorkommnis, Sonstiges), Datum, Wetter, Arbeiten, Mängel, Fortschritt %, bis zu
  20 Fotos. JEDER Mitarbeiter darf Berichte schreiben; ändern/löschen nur Verfasser oder
  OWNER/ADMIN. Verfasser-Namenssnapshot (`authorName`) bleibt bei gelöschtem Nutzer erhalten.
  Eigene Berichte-Seite (alle Projekte) + Tab im Projekt.
- Projektübersicht hat bisher nur den Tab „Berichte". **Ab Block 4/5 kommen hier Tabs für
  Angebote, Aufträge, Rechnungen dazu** (Dokumentenliste je Projekt).
- Nummernvergabe: `NumberSequencesService.next(tx, companyId, type)` — lückenlos in der Transaktion
  des Speicherns, mit Jahreswechsel-Reset (`lastResetYear`). Block 4/5 nutzen dasselbe.
- Offen/Ideen: Projektdateien/Pläne als Anhänge, Zeiterfassung je Projekt, PDF-Export von
  Berichten, Bautagebuch-Vorlagen, Mitarbeiter sieht nur zugewiesene Projekte (aktuell sehen alle alles).

### ✅ Block 4 — Angebote (alle 3 Teilschritte fertig, 2026-10-11)
Aufgeteilt in drei Teilschritte:
- ✅ **1. Angebotseditor + PDF + Preise aus dem Stamm.** Backend `documents/`, Frontend
  `DocumentEditorPage`, `DocumentsPanel`, `QuotesPage` (Menü „Angebote", Tab „Angebote" im Projekt;
  nur OWNER/ADMIN sehen Dokumente).
  - Generisches `Document` + `DocumentItem` (Typ QUOTE/ORDER/INVOICE/CREDIT_NOTE; nur QUOTE
    freigeschaltet, `SUPPORTED_TYPES` im Service). Status DRAFT → SENT (ausgestellt) →
    ACCEPTED/REJECTED. **Nummer erst beim Ausstellen** (lückenlos, `NumberSequencesService.next`),
    danach gesperrt (409), Überarbeiten per „Duplizieren" → neuer Entwurf.
  - Positionen: Art POSITION/HEADING/TEXT, Menge (3 Nachkommastellen), Einheit, EK-netto-Preis,
    USt, Rabatt %, `isOptional` (Alternativposition, nicht in Summe). Katalogwerte werden beim
    Hinzufügen KOPIERT (Verweis `catalogItemId` nur Referenz). Ordnungszahlen 1, 1.1, 1.2 …
  - Summen serverseitig (`calculations.ts`, `Prisma.Decimal`, kaufmännisch gerundet, USt je Satz
    auf Netto-Summe) mit Jest-Unit-Tests (`npm test` in backend/); Frontend rechnet nur eine
    Vorschau (`utils/documentCalc.ts`).
  - Empfänger: Kontakt-Verweis + Adress-Snapshot, beim Ausstellen aus dem Kontakt eingefroren.
  - PDF (`document-pdf.service.ts`, pdfkit + svg-to-pdfkit für SVG-Logo): Briefkopf mit Logo,
    Anschrift, Positionstabelle mit Seitenumbruch + wiederholtem Tabellenkopf, USt-Summen,
    Schlusstext, Fußzeile (Briefpapier-Text + IBAN/BIC/USt-IdNr.), Wasserzeichen „ENTWURF".
  - Projekte/Kontakte mit Dokumenten sind nicht löschbar (FK Restrict → 409).
- ✅ **2. Übernahme Angebot → Auftragsbestätigung → Rechnung** (2026-10-11).
  `POST /documents/:id/convert {targetType}` (`DocumentsService.convert`), Buttons im Editor.
  Erlaubt: Angebot→Auftrag, Angebot→Rechnung, Auftrag→Rechnung. Quelle muss ausgestellt sein
  (Angebot: SENT/ACCEPTED, ein SENT-Angebot wird dabei automatisch ACCEPTED; Auftrag: SENT).
  Pro Angebot nur EINE Auftragsbestätigung (409), mehrere Rechnungen erlaubt (Abschläge, Block 5).
  Neuer Entwurf kopiert Empfänger, Betreff und alle Positionen (inkl. Optionalpositionen als
  Optional-Flag), `sourceDocumentId` verknüpft die Kette; Editor zeigt „Erstellt aus" und
  „Folgedokumente"; PDF zeigt Zeile „Bezug". Eigene Listen/Menü/Tabs: Angebote, Aufträge,
  Rechnungen; Editor-Routen `/quotes/:id`, `/orders/:id`, `/invoices/:id`. Auftrag hat keine
  Gültigkeit; Standardtexte je Typ, Rechnungs-Schlusstext mit Zahlungsziel des Kunden.
  **Rechnungen sind nur als ENTWURF möglich** (`ISSUABLE_TYPES` in `documents.service.ts` = Angebot,
  Auftrag): Ausstellen bleibt gesperrt (409 + Hinweis im Editor), bis Block 5 die Pflichtangaben
  (§ 14 UStG, Leistungsdatum, Zahlungsbedingungen, § 13b, Abschlag/Schluss, EN16931-Felder) liefert.
  Block 5 muss außerdem: Optionalpositionen vor dem Ausstellen verbieten, `CREDIT_NOTE` freischalten.
- ✅ **3. GAEB-Import/-Export** (2026-10-11). Code in `backend/src/documents/gaeb/`
  (`gaeb-xml.ts` Baumparser mit fast-xml-parser, `gaeb-parser.ts`, `gaeb-writer.ts`,
  `gaeb.service.ts`), Frontend `GaebImportButton` + Button „GAEB-Export" im Editor.
  - **Import** (`POST /projects/:id/documents/import-gaeb`, Datei nur im Speicher): GAEB DA XML 3.x,
    jede Phase mit LV (X81/83/84/86 …), Namespace/Prefix egal, UTF-8 oder Windows-1252. Titel
    (auch verschachtelt) → HEADING, Items → POSITION, Item ohne Menge/Einheit → TEXT, Pauschal →
    „psch", Bedarfs-/Alternativposition (`Provis`, `ALN*`) → Optional, `m2`→`m²`. Kurztext/Langtext
    aus `OutlineText`/`DetailTxt`. Erzeugt einen Angebots-ENTWURF; Preise aus der Datei (`UP`) falls
    vorhanden, sonst 0. Neu: `DocumentItem.oz` (Original-Ordnungszahl, z.B. `02.01.0030`), bleibt bei
    Speichern/Duplizieren/Übernahme erhalten und wird im Editor als „OZ …" angezeigt.
  - **Export** (`GET /documents/:id/gaeb`, nur Angebote): GAEB DA XML 3.3, Phase **X84**
    (Angebotsabgabe, mit `UP`/`IT`). Mit Original-OZ wird die Original-Gliederung (auch
    verschachtelt) rekonstruiert, sonst werden 01/02… und 0010/0020… erzeugt. Rabatt wird in den
    Einheitspreis eingerechnet, Optionalpositionen als `Provis WithoutTotal` ohne `IT`.
  - **Testdaten:** `docs/gaeb-samples/` (SELBST erzeugt, keine Originale: X83 3.3 mit Verschachtelung,
    Pauschal/Bedarf/Alternative/Text; X81 3.2 flach) + 17 Jest-Tests (Parser, Writer, Rundlauf).
  - **Grenzen / ungeprüft:** nicht gegen das offizielle GAEB-XSD validiert (Schreibweise von
    Alternativpositionen und Element-Reihenfolge nach bestem Wissen); Zuschlagspositionen
    (`MarkupItem`) werden mit Warnung übersprungen; keine Teilmengen (`QtySplit`), keine X86/X89-
    Ausgabe, kein GAEB-90 (.d83); Bieter-Angaben (`OWN`) fehlen im Export. **Vor dem Kundeneinsatz
    mit echten Dateien aus Ausschreibungsportalen und einer AVA-Software gegentesten.**
- Ideen/offen: Textbausteine & Standard-Einleitung je Firma, Angebotsvarianten/Alternativen
  gruppieren, Zwischensummen, Rabatt auf Gesamtsumme, Versand per E-Mail, PDF-Layout
  konfigurierbar (Briefpapier-PDF als Hintergrund), Angebots-Historie/Revisionen.

### 🟡 Block 5 — Rechnungen (Teilschritte 1+2 von 4 fertig, 2026-10-11)
Aufgeteilt in vier Teilschritte:
- ✅ **1. Rechnung ausstellen mit allen Pflichtangaben.** Rechnungen sind `Document`s vom Typ INVOICE
  (Entwurf entsteht per „Rechnung erstellen" aus Angebot/Auftrag oder direkt im Projekt).
  - Neue Tabelle `InvoiceDetails` (1:1): Leistungsdatum/-zeitraum, Zahlungsziel + `dueDate`
    (Rechnungsdatum + Tage, beim Ausstellen fixiert), `reverseCharge` (§ 13b), Snapshot der
    Empfänger-USt-IdNr., Bestellnummer, Leitweg-ID. Defaults: Leistungszeitraum = Projektzeitraum,
    Zahlungsziel = Kontakt-Zahlungsziel (sonst 14 Tage).
  - **Prüfung vor dem Ausstellen** (`documents/invoice-validation.ts`, 10 Jest-Tests; Endpunkt
    `GET /documents/:id/issues`, Anzeige als Checkliste im Editor, `finalize` lehnt unvollständige
    Rechnungen mit allen Gründen ab): Firmenname/-anschrift, Steuernummer ODER USt-IdNr., Empfänger-
    anschrift, Leistungsdatum, Zahlungsziel, mind. eine Position, keine Optionalpositionen, Summe > 0;
    bei § 13b zusätzlich beide USt-IdNr. und 0 % auf allen Positionen (Schalter im Editor setzt alle
    Sätze auf 0).
  - **Absender-Snapshot** (`Document.issuerSnapshot`, `documents/issuer-snapshot.ts`): beim Ausstellen
    (alle Dokumenttypen) werden Firmendaten/Logo/Briefpapier eingefroren; das PDF eines ausgestellten
    Dokuments nutzt den Snapshot (GoBD). Entwürfe nutzen das aktuelle Firmenprofil.
  - **PDF**: Leistungszeitraum, Fälligkeit, Kunden-Nr., Bestell-Nr., Leitweg-ID, Bezug; unter der Summe
    § 13b-Hinweis + USt-IdNr. des Empfängers, Zahlungsbedingungen, Bankverbindung mit
    Verwendungszweck, Aufbewahrungshinweis für Privatkunden (§ 14b UStG). Standard-Schlusstext
    enthält keine Zahlungsfrist mehr (kommt strukturiert aus den Rechnungsdaten).
  - Nummer `INVOICE` lückenlos, Jahreswechsel-Reset: Der Seed MUSS `lastResetYear` setzen (sonst
    Kollision mit seeded RE-00001, so geschehen).
- ✅ **2. Abschlags- und Schlussrechnung, Sicherheitseinbehalt** (2026-10-11).
  - `InvoiceDetails.kind` (STANDARD/PARTIAL/FINAL), `partialNumber`, `retentionPercent/Amount/DueDate`;
    `DocumentItem.deductsDocumentId` (Abzugszeile → Abschlagsrechnung). Menü im Editor (Angebot/
    Auftrag): „Rechnung erstellen" → Gesamtrechnung / Abschlagsrechnung … / Schlussrechnung.
  - **Abschlag** (`DocumentsService.createContractInvoice`): Prozent ODER Nettobetrag vom Auftragswert,
    aufgeteilt auf die Steuersätze des Auftrags (`partial-invoice.ts`, Rest in die letzte Gruppe →
    Summe exakt, Jest-getestet), je Satz eine Pauschalzeile „Abschlagszahlung Nr. n"; Summe aller
    Abschläge darf den Auftragswert nicht übersteigen (409); Nummer = höchste + 1.
  - **Schluss**: alle Positionen des Auftrags + Überschrift „Bereits berechnete Abschlagszahlungen" +
    negative Zeilen je ausgestellter Abschlagsrechnung und Steuersatz (netto). Prüfliste meldet
    nicht abgezogene Abschläge und Abschläge im Entwurf; Button „Abzüge aktualisieren"
    (`POST /documents/:id/refresh-deductions`). Nach einer ausgestellten Schlussrechnung keine weiteren
    Abschläge/Schlussrechnungen (409). Saldo 0 € erlaubt, negativ nicht.
  - Hat ein Angebot eine Auftragsbestätigung, wird Abschlag/Schluss nur noch vom Auftrag aus erzeugt.
  - **Sicherheitseinbehalt**: Prozent vom Brutto der Rechnung + Fälligkeitsdatum (Ende Gewährleistung),
    Betrag wird beim Ausstellen fixiert; PDF zeigt Einbehalt + „Zahlbetrag" und den Fälligkeitshinweis.
    ⚠ Der Einbehalt ist noch KEINE offene Forderung mit eigener Fälligkeit — das kommt mit Zahlungen
    (Teilschritt 3: Einbehalt als eigener offener Posten, Auszahlung/Bürgschaftsablösung).
  - **Abrechnungsübersicht** (`GET /documents/:id/billing`, Karte „Abrechnung" im Auftrag/Angebot):
    Auftragswert, abgerechnet (ausgestellte Rechnungen), offen, Fortschrittsbalken, Rechnungsliste.
  - PDF: Titel nach Art („Abschlagsrechnung Nr. 1", „Schlussrechnung"), Hinweis „Schlussabrechnung
    bleibt vorbehalten". Listen zeigen Tags Abschlag n / Schluss.
  - Offen/Ideen: Abschlag nach Leistungsstand je Position (Aufmaß), Teilschlussrechnung, VOB/B-Fristen
    (Prüffrist 30 Tage, Schlusszahlung), Abschlag mit Umsatzsteuer nach Vereinnahmung (§ 13 UStG).
- ⬜ **3. Storno und Zahlungseingang.** `CREDIT_NOTE` freischalten (Stornorechnung referenziert die
  Originalrechnung, spiegelt Beträge, eigene Nummer), Status PAID/PARTIALLY_PAID/CANCELLED, Tabelle
  `Payment` (Datum, Betrag, Zahlungsart, Notiz), offene Posten/Fälligkeitsliste, Skonto.
- ⬜ **4. Mahnwesen.** Mahnstufen (Zahlungserinnerung, 1./2./3. Mahnung), Fristen, Verzugszinsen
  (§ 288 BGB: Basiszins + 9 Prozentpunkte B2B, 5 PP Verbraucher) und Pauschale (40 € B2B), Mahn-PDF,
  Mahnvorschlagsliste, Mahnsperre, Protokoll.
- Ideen/offen: Lohn-/Materialkostenausweis für Privatkunden (§ 35a EStG, Handwerkerleistungen),
  Kleinunternehmer (§ 19 UStG) ohne USt-Ausweis, Skonto, Zahlungslink/QR-Code (GiroCode), Versand per
  E-Mail, Rechnungs-Textbausteine, Teilleistungen/Aufmaß-Abrechnung.

### ⬜ Block 6 — Eingangsrechnungen
Empfang per Mail (eigenes Postfach/Weiterleitung nötig — Infrastruktur-Entscheidung) und Upload,
Freigabe-Workflow, Zuordnung zum Projekt.

### ⬜ Block 7 — E-Rechnung und Compliance
XRechnung und ZUGFeRD lesen und erzeugen, GoBD (Unveränderbarkeit, Verfahrensdokumentation,
Aufbewahrung), DSGVO, Export für den Steuerprüfer (GoBD-Z3-Zugriff / DATEV-Export).
**Hinweis:** Ab 2025 gilt in Deutschland die E-Rechnungspflicht für B2B — betrifft Block 5 und 6
direkt. Sollte NICHT als letztes "Compliance-Anhängsel" behandelt werden, sondern die
Rechnungs-/Eingangsrechnungs-Datenmodelle in Block 5/6 müssen von Anfang an so gebaut sein, dass
XRechnung/ZUGFeRD-Export ohne Nacharbeit möglich ist (alle Pflichtfelder der EN16931-Norm von
Anfang an im Schema vorsehen). Details siehe [[project_compliance]].

### ⬜ Block 8 — Plattform-Admin / Betreiber-Backoffice (von Volker nachgefordert 2026-10-10)
Unter der Backend-URL gibt es bisher nur die Swagger-Doku. Es braucht ein echtes
**Betreiber-Backoffice** (getrennt von der Kunden-App): Mandanten-/Abonnentenverwaltung
(Firmen ansehen, sperren, Testphase), Abo-Pläne & Abrechnung (Subscriptions, Zahlungsanbieter
z.B. Stripe, Rechnungen an die Kunden), Nutzungsstatistiken, Support-Zugriffe (Impersonation
mit Audit-Log), ggf. System-Monitoring.
**Entwurfshinweise:** Eigene Rolle `PLATFORM_ADMIN` auf Nutzerebene, die NICHT an eine Company
gebunden ist (heute hängt jeder `User` zwingend an einer `Company` — Schema-Änderung nötig, z.B.
separate `PlatformAdmin`-Tabelle + eigener Auth-Guard/Token-Audience); eigene API unter
`/admin/*`, eigene SPA (`admin-frontend/` oder Route-Bereich im Frontend mit separatem Guard).
Mandanten-Status (`ACTIVE/TRIAL/SUSPENDED`) und Plan-Zuordnung am `Company`-Modell vorsehen; die
App-Auth muss gesperrte Mandanten ablehnen. Sinnvoll nach Block 3, spätestens vor dem ersten
zahlenden Kunden.

### ⬜ Block 9 — Dashboard mit frei anordenbaren Widgets (Wunsch von Volker 2026-10-11)
Auf der Startseite soll der Benutzer sich ein Dashboard aus Widgets selbst zusammenstellen und
anordnen können (Drag & Drop, Größe, ein-/ausblenden). Welche Widgets es gibt, wird später
festgelegt — Beispiele: Auftragslage, Geldfluss (offene Posten/Zahlungseingänge), Angebotsquote,
laufende Projekte, aktuelle Berichte, fällige Mahnungen, Mitarbeitereinsatz.
**Vorgaben für die laufende Entwicklung (damit später nichts umgebaut werden muss):**
- Jedes Feature-Modul soll seine Kennzahlen/Listen über eigene, schlanke Read-Endpunkte
  bereitstellen können (z.B. `GET /projects/stats`), statt dass das Dashboard Rohlisten lädt.
  Neue Module deshalb Aggregationen im Service kapseln (Status-Zählungen, Summen).
- Frontend: Widgets sind eigenständige Komponenten (Titel, Inhalt, Ladezustand) ohne feste
  Seiten-Abhängigkeit; Registry-Muster (`id → Komponente + Default-Größe`) beim Bau von Block 9.
- Persistenz: Layout je Nutzer in der DB (z.B. Tabelle `DashboardLayout(userId, widgets Json)`),
  nicht nur localStorage, damit es geräteübergreifend gilt.
- Passende Bibliothek später prüfen (z.B. `react-grid-layout`).
- Die Startseite (`DashboardPage`) ist bis dahin ein einfacher Platzhalter.
Zeitpunkt: nach Block 5 (dann gibt es Geld-Kennzahlen), spätestens vor dem ersten Kunden.

### ✅ Block 10 — Zeiterfassung (vorgezogen vor Block 5, fertig 2026-10-11)
Backend `time-entries/`, Frontend `TimePage` (Menü „Zeiten", für ALLE Rollen), `TimerCard`,
`TimeEntryModal`, `TimeReport`, `ProjectTimePanel` (Tab „Zeiten" im Projekt).
- **Stoppuhr** (Start/Stopp, Server misst in Europe/Berlin, nur ein laufender Eintrag je Mitarbeiter)
  und **manuelle Einträge** (Von–Bis + Pause oder nur Dauer). Zuordnung zu Projekt oder „Intern".
  Wochenansicht mit Tagessummen (Deep-Link `/time?week=YYYY-MM-DD`), Warnung > 10 h/Tag (ArbZG).
- Regeln (serverseitig): keine Zukunft, keine Überschneidungen, Ende > Beginn, Mitarbeiter sehen/
  ändern nur eigene Zeiten; **Freigabe** durch OWNER/ADMIN sperrt für den Mitarbeiter alle Einträge
  bis zum letzten freigegebenen Tag (Büro darf weiter korrigieren, Freigabe aufhebbar); Mitarbeiter
  mit Zeiten sind nicht löschbar (nur deaktivieren, Aufbewahrung), Projekte mit Zeiten ebenso.
- **Auswertung** (nur Büro): Stunden je Projekt/Mitarbeiter für einen Zeitraum, Plan-Stunden (Positionen
  mit Einheit „h" aus Aufträgen, sonst angenommenen Angeboten) mit Auslastung, interne Personalkosten
  (`User.hourlyRate`, nur für OWNER/ADMIN sichtbar/editierbar), CSV-Export (Excel-DE, Semikolon+BOM),
  Zeitraum freigeben/Freigabe aufheben. Projekt-Tab: Gesamtstunden + je Mitarbeiter + Einträge.
- Zeiten sind Minuten seit Mitternacht (`startMinute/endMinute`) + `durationMinutes`; Hilfsfunktionen
  mit Jest-Tests in `time-entries/time-utils.ts`.
- **Noch offen / Ideen:** Offline-Fähigkeit (PWA + Warteschlange) für schlechten Baustellenempfang,
  Tätigkeiten aus dem Leistungskatalog, Soll-Arbeitszeit/Überstundenkonto, Abwesenheiten (Block 11),
  Zuschläge/Lohnarten, DATEV-Lohn-Export, Erinnerung bei vergessener Stoppuhr (aktuell wird eine über
  Nacht laufende Stoppuhr beim Stoppen auf 23:59 begrenzt), Geofencing/Foto-Nachweis (Datenschutz!).

### ⬜ Block 11 — Urlaub / Abwesenheiten (Wunsch von Volker 2026-10-11)
Mitarbeiter bekommen ein **Urlaubskonto** und stellen **Urlaubsanträge, die freigegeben werden müssen**.
**Anforderungen/Ideen:**
- Urlaubskonto je Mitarbeiter und Jahr: Jahresanspruch (Tage, anteilig im Eintrittsjahr, Teilzeit),
  Übertrag aus dem Vorjahr mit Verfallsdatum (§ 7 Abs. 3 BUrlG, i.d.R. 31.3.), Sonderurlaub,
  Resturlaub live (Anspruch + Übertrag − genehmigt − beantragt).
- Antrag: Zeitraum (inkl. halbe Tage), Art (Urlaub, Sonderurlaub, ggf. unbezahlt), Notiz; Tage
  werden automatisch berechnet (ohne Wochenenden und **Feiertage je Bundesland**, Tabelle
  `PublicHoliday`). Kein Überziehen des Kontos; Überschneidungen werden angezeigt.
- Workflow: BEANTRAGT → GENEHMIGT/ABGELEHNT (Chef/Administrator, mit Kommentar), Rücknahme/
  Stornierung durch den Antragsteller; Benachrichtigung (E-Mail/Push) bei Antrag und Entscheidung.
- Team-/Abwesenheitskalender (wer ist wann weg; Warnung bei zu vielen Abwesenden in einem
  laufenden Projekt). Optional später: Krankmeldungen/andere Abwesenheiten im selben Modell.
- Dachdeckerhandwerk: **tarifliche Urlaubsregelung / Urlaubskasse (SOKA-DACH)** für gewerbliche
  Arbeitnehmer — Anforderung mit Volker klären, bevor das Konto-Modell fest ist.
- Datenmodell-Idee: `LeaveBalance(userId, year, entitlementDays, carryOverDays, carryOverExpires)`,
  `LeaveRequest(userId, from, to, halfDayStart/End, days, type, status, decidedById, decisionNote)`,
  `PublicHoliday(state, date, name)`. Verknüpfung zu Block 10: Urlaubstage zählen als Soll-Zeit.

## Empfohlene Reihenfolge

1. ~~Firmenprofil & Konto~~ ✅
2. ~~Kontakte & Stammdaten~~ ✅
3. ~~Projekte (inkl. Berichte)~~ ✅
4. ~~Angebote (Editor, PDF, Übernahme, GAEB)~~ ✅
5. Rechnungen (inkl. § 13b, Mahnwesen) — Teilschritte 1+2/4 ✅ (ausstellen, Abschlag/Schluss/Einbehalt), Datenmodell EN16931-kompatibel halten
6. Eingangsrechnungen
7. E-Rechnung-Export (XRechnung/ZUGFeRD) + GoBD/DSGVO-Feinschliff + Steuerprüfer-Export
8. Plattform-Admin / Betreiber-Backoffice (Abonnenten, Abrechnung) — Zeitpunkt flexibel, spätestens
   vor dem ersten zahlenden Kunden
9. Dashboard mit Widgets (ab Block 5 sinnvoll, Vorgaben siehe Block 9)
10. ~~Zeiterfassung~~ ✅ (auf Wunsch vorgezogen) und 11. Urlaub — beide teilen sich die
    Mitarbeiterstammdaten (Eintritt, Wochenstunden, Urlaubstage kommen mit Block 11)

**Why diese Reihenfolge:** Jeder Block baut auf dem vorherigen auf (Artikelstamm → Angebot →
Rechnung). E-Rechnung zuletzt, aber mit Vorwirkung auf das Rechnungsschema in Block 5, damit keine
nachträgliche Migration/Datenverlust-Gefahr entsteht.
