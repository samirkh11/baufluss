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
npm run seed              # legt einen Demo-Mandanten an (demo@meisterwerk.local / demo12345)
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
│       └── common/     Prisma-Service, Guards, Decorators
├── frontend/          React-SPA
└── docker-compose.yml PostgreSQL + Adminer für die lokale Entwicklung
```

## Umgesetzter Stand (V1)

- Firmenregistrierung (Mandant + erster Nutzer), Login via JWT
- Firmenprofil: Stammdaten, Logo-Upload, Briefpapier-Texte
- Nummernkreise (Konfiguration je Dokumenttyp, wird von späteren Modulen konsumiert)
- Nutzerverwaltung mit Rollen (Inhaber/Administrator/Mitarbeiter)
- Kontakte (Kunden, Lieferanten, Subunternehmer) mit Suche, Filter, Archivierung
- Leistungs- und Artikelstamm (Preise, USt, Einheiten)

Die restlichen Funktionsblöcke (Projekte, Angebote, Rechnungen,
Eingangsrechnungen, E-Rechnung/Compliance, Betreiber-Backoffice) sind in der Roadmap-Memory-Datei geplant und werden
Schritt für Schritt als vollständige, getestete Ausbaustufen ergänzt.
