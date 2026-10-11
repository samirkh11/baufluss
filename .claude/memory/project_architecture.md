---
name: project-architecture
description: Meisterwerk – Multi-Tenancy-Strategie, Auth-Design, API-first-Konventionen
metadata:
  type: project
---

## Multi-Tenancy-Strategie

**Entscheidung:** Shared Database, Shared Schema, Tenant-Spalte (`companyId`) auf jeder
mandantenbezogenen Tabelle. Isolation wird in der Anwendungsschicht erzwungen: jede
Service-Methode bekommt die `companyId` des authentifizierten Nutzers (aus dem JWT) übergeben und
filtert zwingend danach. Mutations auf fremde IDs prüfen zusätzlich explizit Zugehörigkeit (siehe
`UsersService.ensureBelongsToCompany` als Muster).

**Why:** Einfachste, am weitesten verbreitete Variante für B2B-SaaS in der Frühphase. Schema-pro-
Tenant oder DB-pro-Tenant skaliert operativ schlechter (Migrationen auf N Schemas) und ist für den
Start unnötig komplex. Postgres Row-Level-Security wäre zusätzliche Verteidigungstiefe, wurde aber
bewusst nicht in V1 eingebaut, um das Schema nicht vorzeitig zu verkomplizieren, solange die
meisten Tabellen (Kontakte, Projekte, Angebote, ...) noch gar nicht existieren.

**How to apply:** Jedes neue Modul, das mandantenbezogene Daten verwaltet, MUSS eine `companyId`-
Spalte mit Relation zu `Company` bekommen und in jeder Query danach filtern. Wenn das Projekt
wächst (viele Module, viele Entwickler), ist Postgres RLS mit einer Session-Variable
(`SET app.current_tenant_id`) der nächste sinnvolle Schritt — dann greift die Isolation auch, wenn
eine Service-Methode versehentlich den Filter vergisst.

## Auth-Design

- Registrierung (`POST /auth/register`) legt **gleichzeitig** eine neue `Company` (Tenant) UND
  deren ersten Nutzer (Rolle `OWNER`) an. Das ist der einzige Weg, wie ein Tenant entsteht — es
  gibt keinen separaten "Admin legt Firma an"-Flow.
- JWT-Payload: `{ sub: userId, companyId, role }`. Die `JwtStrategy` prüft bei jedem Request
  zusätzlich live in der DB, ob der Nutzer noch aktiv ist und noch zur im Token stehenden Firma
  gehört (schützt gegen weiterhin gültige Tokens nach Deaktivierung).
- Nutzerverwaltung (`UsersService.update/remove`, serverseitig erzwungen): OWNER/ADMIN bearbeiten
  Name, E-Mail, Rolle, Aktiv-Status, Passwort-Reset und Bild. ADMINs dürfen keine OWNER-Konten
  ändern/löschen und die Rolle OWNER nicht vergeben; niemand ändert die eigene Rolle, deaktiviert
  oder löscht sich selbst (Aussperr-Schutz).
- Rollen: `OWNER`, `ADMIN`, `MEMBER` (einfaches Enum, keine granulare Permission-Tabelle). Bewusst
  minimal gehalten — erst erweitern, wenn ein konkretes Feature granulare Rechte braucht.

## API-first-Konventionen

- Jeder Endpunkt bekommt `@ApiTags`/`@ApiProperty`-Dekoratoren, damit `/api/docs` (Swagger) immer
  vollständig und aktuell ist — das ist der Vertrag für das Frontend.
- DTOs mit `class-validator` sind Pflicht für jeden Request-Body; `ValidationPipe` mit
  `whitelist: true, forbidNonWhitelisted: true` ist global aktiv (main.ts) — unbekannte Felder
  führen zu einem 400-Fehler statt stillschweigend ignoriert zu werden.
- Tenant-Scoping passiert NIE über einen Request-Parameter (z.B. `?companyId=...`), sondern immer
  ausschließlich über die im JWT enthaltene `companyId` — verhindert, dass ein Client sich als
  anderer Mandant ausgeben kann.

## Nummernkreise (Dokumentnummern)

`NumberSequencesService.next(tx, companyId, documentType)` vergibt Nummern wie `P-0007`. Immer mit
dem Transaktions-Client des Speichervorgangs aufrufen (kein verbrannter Zähler bei Rollback →
lückenlos, GoBD). Legt fehlende Kreise mit Standard-Präfix an, setzt bei `resetYearly` zum
Jahreswechsel zurück. Alle künftigen Dokumente (Angebot, Auftrag, Rechnung, Gutschrift) nutzen es.

## Dokumente (Angebot → Auftrag → Rechnung)

Eine Tabelle `Document` (+ `DocumentItem`) für alle Geschäftsdokumente, Typ per Enum. Gründe:
Übernahme = Kopie, PDF/GAEB/E-Rechnung-Logik nur einmal. Typspezifische Zusatzdaten (Rechnung:
Zahlungen, Mahnungen, Sicherheitseinbehalt …) kommen als eigene Tabellen mit 1:1-Bezug dazu,
NICHT als Spalten-Wildwuchs im Document. Dokumente sind Rechtsnachweise: Nummer erst beim
Ausstellen, danach unveränderlich (Service `assertDraft`), FKs auf Projekt/Kontakt Restrict.
Geld immer als `Decimal` (Prisma.Decimal) im Backend, nie `number`-Arithmetik. Dokument-
Endpunkte sind OWNER/ADMIN-only (Preise, Kundendaten).

## Datei-Upload & Bilder

- Gemeinsamer Baustein: `backend/src/common/storage/uploads.ts` (`imageUploadOptions(subdir)`,
  `publicUploadPath`, `deleteUploadedFile`). Dateien liegen unter `backend/uploads/<subdir>/` mit
  Zufallsnamen (kein Überschreiben/Path-Traversal) und werden statisch unter `/uploads/...`
  ausgeliefert. Pfad wird vom Arbeitsverzeichnis aufgelöst (`process.cwd()`), NICHT per
  `__dirname` (kompilierter Code liegt in `dist/src`).
- Bilder: Firmenlogo (`Company.logoPath`, SVG erlaubt), Kontakt (`Contact.imagePath`, genau 1),
  Mitarbeiter (`User.imagePath`, genau 1; OWNER/ADMIN für alle, jeder für sich selbst),
  Leistung/Artikel (Tabelle `CatalogItemImage`, bis zu 10, `sortOrder`), Bericht (Tabelle
  `ReportPhoto`, bis zu 20).
  Nutzer-Uploads erlauben nur PNG/JPG/WebP — **kein SVG** (Skriptausführung beim direkten Öffnen).
- Services löschen beim Ersetzen/Entfernen/Löschen die alte Datei und räumen die neu hochgeladene
  Datei wieder auf, wenn der Request abgelehnt wird (fremder Mandant, Limit) → keine Waisen.
- **Bekannte Einschränkung:** `/uploads` ist ohne Login abrufbar (Schutz nur durch unratbare
  UUID-Namen). Für Produktion/vertrauliche Dokumente (Eingangsrechnungen!) auf authentifizierte
  Downloads bzw. Object Storage mit signierten URLs umstellen.
- Frontend: `components/ImageUpload.tsx` (einzeln), `components/ImageGallery.tsx` (mehrere),
  `utils/assets.ts` (`assetUrl`, `apiErrorMessage`).
- Für Produktion/Cloud: Object Storage (S3-kompatibel) statt lokaler Platte — siehe
  [[project_roadmap]].
