# Meisterwerk

Multiuser-fähige, cloudbasierte Software für Handwerksbetriebe (Vorbild: [Plancraft](https://plancraft.com/de-de)).

## Tech-Stack

| Schicht     | Technologie                                                          |
| ----------- | --------------------------------------------------------------------- |
| Frontend    | React 18 + TypeScript + Vite, Ant Design, TanStack Query, React Router |
| Backend     | NestJS (TypeScript), Prisma ORM, JWT-Auth (Passport)                  |
| Datenbank   | PostgreSQL 16                                                          |
| API         | REST, OpenAPI/Swagger-Dokumentation unter `/api/docs`                 |

Architektur-Entscheidungen, Multi-Tenancy-Strategie und die Roadmap der restlichen Funktionsblöcke
stehen in [`.claude/memory/`](.claude/memory/).

## Lokale Entwicklungsumgebung einrichten

### Voraussetzungen

- Node.js 20+ und npm (vorhanden)
- Docker Engine + Docker Compose Plugin (für PostgreSQL) — siehe Installationsbefehle, die dir im
  Setup-Chat gegeben wurden

### 1. Datenbank starten

```bash
docker compose up -d
```

Startet PostgreSQL auf Port 5432 und Adminer (DB-Web-UI) auf http://localhost:8080.

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:migrate   # erstellt die Tabellen
npm run seed              # Demo-Daten: Dachdeckerei Schmidt (Login demo@meisterwerk.local / demo12345)
npm run start:dev
```

API läuft auf http://localhost:3000, interaktive API-Doku unter http://localhost:3000/api/docs.

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

App läuft auf http://localhost:5173.

## Projektstruktur

```
meisterwerk/
├── backend/           NestJS API (API-first, REST)
│   ├── prisma/        Datenbankschema & Migrationen
│   └── src/
│       ├── auth/       Registrierung, Login, JWT
│       ├── companies/  Firmenprofil, Logo, Nummernkreise
│       ├── users/      Nutzerverwaltung & Rollen
│       ├── contacts/   Kunden, Lieferanten, Subunternehmer
│       ├── catalog/    Leistungs- und Artikelstamm
│       ├── projects/   Projekte, Team
│       ├── reports/    Berichte mit Fotos
│       ├── time-entries/ Zeiterfassung, Auswertung, Freigabe
│       ├── documents/  Angebote, Aufträge, Rechnungsentwürfe, Berechnung, PDF, GAEB
│       └── common/     Prisma-Service, Guards, Decorators, Datei-Uploads
├── frontend/          React-SPA
└── docker-compose.yml PostgreSQL + Adminer für die lokale Entwicklung
```

## Umgesetzter Stand (V1)

- Responsive Oberfläche für Desktop, Tablet und Smartphone (Baustellen-Einsatz)
- Firmenregistrierung (Mandant + erster Nutzer), Login via JWT
- Firmenprofil: Stammdaten, Logo-Upload, Briefpapier-Texte
- Nummernkreise (Konfiguration je Dokumenttyp, wird von späteren Modulen konsumiert)
- Nutzerverwaltung mit Rollen (Inhaber/Administrator/Mitarbeiter)
- Kontakte (Kunden, Lieferanten, Subunternehmer) mit Suche, Filter, Archivierung
- Leistungs- und Artikelstamm (Preise, USt, Einheiten)
- Bilder: 1 Bild je Kontakt/Mitarbeiter, mehrere je Leistung/Artikel
- Projekte (Status, Kunde, Baustelle, Team) mit Projektübersicht
- Zeiterfassung: Stoppuhr und manuelle Zeiten je Projekt, Wochenansicht, Freigabe durch das Büro,
  Auswertung (Stunden, Plan/Ist, interne Kosten), CSV-Export
- Berichte (Bautagebuch, Mängel, Abnahme, ...) mit Fotos, je Projekt und projektübergreifend
- Angebote: Editor mit Titeln/Positionen/Optionalpositionen, Preise aus dem Stamm, lückenlose Nummern,
  Sperre nach Ausstellung, PDF mit Briefpapier
- Übernahme Angebot → Auftragsbestätigung → Rechnung; Rechnungen mit Pflichtangaben (Leistungsdatum, Zahlungsziel,
  § 13b), Prüfliste vor dem Ausstellen, lückenlose Nummern, eingefrorene Absenderdaten;
  Abschlags- und Schlussrechnung (mit Abzügen), Sicherheitseinbehalt, Abrechnungsübersicht je Auftrag;
  Zahlungseingang mit Zahlstatus, Offene-Posten-Liste, Storno per Stornorechnung (inkl. Erstattung)
- GAEB: Leistungsverzeichnis (DA XML, z.B. .x83) als Angebotsentwurf importieren, Angebot als .x84 exportieren;
  Testdateien in [`docs/gaeb-samples/`](docs/gaeb-samples/)

- Mahnwesen: Mahnstufen, Verzugszinsen/Pauschale nach § 288 BGB, Mahn-PDF, Mahnvorschlag, Mahnsperre
- Eingangsrechnungen: Beleg-Upload, Erfassung, Freigabe-Workflow, Projektzuordnung (Mail-Eingang folgt)
- Dashboard: frei anordenbare Widgets (Drag & Drop, Größe, ein-/ausblenden), Layout je Nutzer gespeichert
- E-Rechnung: XRechnung (UBL/CII) und ZUGFeRD/Factur-X (PDF/A-3) für ausgestellte Rechnungen und Gutschriften, mit offiziellen Validatoren geprüft (`e2e/validate-einvoice.sh`)

Die restlichen Funktionsblöcke (E-Rechnung/Compliance, Betreiber-Backoffice, Urlaub) sind in der Roadmap-Memory-Datei geplant und werden
Schritt für Schritt als vollständige, getestete Ausbaustufen ergänzt.

## Testdaten

`npm run seed` (in `backend/`) legt ein Dachdeckerei-Szenario an und setzt es bei jedem Lauf zurück:
Dachdeckerei Schmidt GmbH (Chef, Bürokraft, 4 Arbeiter), Kunden/Lieferanten/Subunternehmer,
Leistungs- und Artikelstamm mit Bildern, Nummernkreise sowie ein zweiter Mandant zum Testen der
Mandanten-Isolation. Passwort aller Seed-Nutzer: `demo12345`. Jedes neue Feature erweitert den
Seed (`backend/prisma/seed/`).

## Tests

- Browser-E2E-Tests (Playwright): siehe [`e2e/README.md`](e2e/README.md).
- Backend-Unit-Tests (Jest): `cd backend && npm test`.
