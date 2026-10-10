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

## Datei-Upload (Logos, später Belege/Eingangsrechnungen)

V1 speichert Uploads lokal auf Disk (`backend/uploads/`), über `multer` mit `diskStorage` und
zufälligem Dateinamen (verhindert Path-Traversal/Überschreiben). Für Produktion/Cloud-Deployment
sollte das auf Object Storage (z.B. S3-kompatibel) umgestellt werden, sobald ein Deployment-Ziel
feststeht — siehe [[project_roadmap]].
