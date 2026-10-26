# Datenbank-Analyse

Grundlage: `backend/prisma/schema.prisma` (27 Modelle, 18 Enums), 16 Migrationen bis `20261011135625_platform`.
**Es wurde nichts am Schema oder an Migrationen geändert.** Alle Punkte sind Empfehlungen und vor Umsetzung
mit einer Migration auf einer Kopie der Produktivdaten zu prüfen.

Diagramme: `diagrams/database-current.mmd` (Ist), `diagrams/database-proposed.mmd` (Vorschlag).

## Überblick

- Mandantentrennung über `companyId` (Shared Schema). Alle fachlichen Tabellen tragen `companyId` direkt oder
  hängen an einem Elternobjekt mit `companyId` (`DocumentItem` → `Document`, `ReportPhoto` → `Report` …).
- Belegnummern: `@@unique([companyId, number])` bzw. `([companyId, type, number])` – korrekt mandantengetrennt.
- Betreiber-Tabellen (`PlatformAdmin`, `Plan`, `PlatformSettings`, `PlatformInvoice`, `PlatformAuditLog`) liegen im
  selben Schema, ohne `companyId`-Pflicht.

## Befunde

### P0 – kritisch

Keine Befunde, die Datenverlust oder Mandanten-Datenlecks im Schema selbst belegen.

### P1 – hoch

| # | Befund | Risiko | Empfehlung |
| --- | --- | --- | --- |
| 1 | `/uploads` wird ohne Authentifizierung ausgeliefert (`main.ts`, `useStaticAssets`). Betroffen: Logos, **Baustellenfotos der Berichte**, Katalogbilder. Schutz nur durch zufällige Dateinamen. | Wer eine URL kennt (weitergeleitet, Browser-Verlauf, Proxy-Log), sieht Fotos ohne Login, auch nach Rollenentzug. | Fotos wie Eingangsrechnungen außerhalb des öffentlichen Ordners ablegen und über einen authentifizierten, mandantengeprüften Endpoint ausliefern; Logos dürfen öffentlich bleiben. |
| 2 | Fehlende Indizes auf Fremdschlüsseln (PostgreSQL legt sie nicht automatisch an): `documents.sourceDocumentId`, `documents.recipientContactId`, `document_items.catalogItemId`, `document_items.deductsDocumentId`, `IncomingInvoice.supplierId`, `IncomingInvoice.uploadedById`, `IncomingInvoice.approvedById`, `projects.managerId`, `reports.authorId`, `ArchivedFile.dunningId` | Langsame Abfragen „Folgedokumente“/„Abzüge“ und langsame bzw. sperrende `DELETE`s auf Kontakten, Katalogartikeln, Nutzern | `@@index` je Feld ergänzen (rein additive Migration, `CREATE INDEX CONCURRENTLY` bei großen Tabellen). |

### P2 – mittel

| # | Befund | Empfehlung |
| --- | --- | --- |
| 3 | `TimeEntry.approvedById`, `Payment.createdById`, `Dunning.createdById` sind Strings **ohne FK** | Relation mit `onDelete: SetNull` ergänzen, vorher verwaiste IDs prüfen (`SELECT … WHERE NOT EXISTS`). |
| 4 | `NumberSequence.documentType` ist freier String (Kommentar: „free-form for now“) | Enum `NumberSequenceType` (QUOTE, ORDER, INVOICE, CREDIT_NOTE, REPORT, INCOMING) – Migration mit Datenprüfung. |
| 5 | Keine Row-Level-Security; Mandantentrennung nur in der Anwendung | Mittelfristig RLS-Policies auf `companyId` als zweite Verteidigungslinie; erfordert `SET app.company_id` je Request. |
| 6 | `User.email` global eindeutig | Eine Person kann nicht in zwei Firmen arbeiten. Fachlich bewusst entscheiden; bei Bedarf `@@unique([companyId, email])` + Login mit Firmenauswahl. |

### P3 – niedrig

| # | Befund | Empfehlung |
| --- | --- | --- |
| 7 | Uneinheitliche Tabellennamen: ohne `@@map` (PascalCase) sind `IncomingInvoice`, `DashboardLayout`, `ArchivedFile`, `AuditLog`, `ComplianceSettings`, alle `Platform*`, `Plan` | Nur bei ohnehin anstehender Migration angleichen; ein Rename bricht Rohabfragen/Backups-Skripte. |
| 8 | `AuditLog.userId`/`entityId` ohne FK | **Beibehalten** – das Protokoll muss Löschungen überdauern (GoBD). |

## Vorgeschlagene Erweiterung (nur durch Roadmap belegt)

Block 11 „Urlaub / Abwesenheiten“ (`.claude/memory/project_roadmap.md`) nennt selbst das Datenmodell:
`LeaveBalance`, `LeaveRequest`, `PublicHoliday`. Es ist in `database-proposed.mmd` skizziert, ergänzt um
`companyId` (Mandantentrennung). Offene Frage laut Roadmap: SOKA-DACH-Urlaubskasse klären, bevor das Modell fix ist.

## Nicht modelliert (offene Produktfragen aus Figma)

Terminplanung, Aufgaben, Lieferschein, Briefe, Aufmaß, Krankmeldung, Rollen-/Rechte-Editor, E-Mail-Vorlagen,
Briefpapier, Ordnerstruktur, Projektkosten. Dafür werden **keine Tabellen vorgeschlagen**, solange keine
Anforderungen vorliegen.

## Vorgehen für Migrationen

1. Branch, `prisma migrate dev --create-only`, SQL prüfen.
2. Auf einer Kopie der Produktivdatenbank ausführen, Laufzeit und Sperren messen.
3. Seed und Tests erweitern (Regel in `.claude/memory/feedback_testdata_seed.md`).
4. Backup, dann `prisma migrate deploy`.
