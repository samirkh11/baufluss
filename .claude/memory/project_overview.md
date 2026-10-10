---
name: project-overview
description: Meisterwerk – Tech-Stack, Architektur, Verzeichnisstruktur, Zielgruppe
metadata:
  type: project
---

## Was ist Meisterwerk

Multiuser-fähige, cloudbasierte SaaS-Software für Handwerksbetriebe. Vorbild ist
[Plancraft](https://plancraft.com/de-de). Begonnen am 2026-10-10.

**Why:** Volker will ein eigenständiges, kommerzielles Produkt für den deutschen
Handwerksmarkt bauen — separat vom Travel-Planner-Projekt (siehe
`../../../travel-planner/.claude/memory/project_commercialization.md` für Volkers generelle
Kommerzialisierungs-Herangehensweise, auch wenn es ein anderes Produkt ist).

## Tech-Stack (Entscheidungen von Claude getroffen, Backend war offen)

- **Frontend:** React 18 + TypeScript + Vite, Ant Design (antd) als UI-Kit — gut geeignet für
  datenintensive Business-/ERP-Oberflächen (Tabellen, Formulare), TanStack Query für Server-State,
  React Router, Axios.
- **Backend:** NestJS (TypeScript) statt Laravel/PHP (wie im Travel-Planner-Projekt) — bewusst
  dieselbe Sprache wie das Frontend, klare modulare DI-Architektur, nativer OpenAPI/Swagger-Support
  passt zum API-first-Anspruch.
- **ORM/DB-Zugriff:** Prisma, Migrations-basiert.
- **Datenbank:** PostgreSQL 16 (echtes RDBMS, wie vom Nutzer gefordert).
- **Auth:** JWT (Passport), bcrypt-Passwort-Hashing.
- **API-Stil:** REST, API-first — Swagger-Dokument unter `/api/docs` ist der Vertrag, den das
  Frontend konsumiert.

**How to apply:** Neue Backend-Module folgen dem NestJS-Modul-Muster (Controller/Service/DTO),
neue Frontend-Seiten nutzen Ant Design + TanStack Query wie die bestehenden Seiten unter
`frontend/src/pages/`.

## Verzeichnisstruktur

```
meisterwerk/
├── backend/            NestJS API
│   ├── prisma/schema.prisma   Datenmodell (Single Source of Truth)
│   └── src/{auth,companies,users,common}/
├── frontend/           React-SPA (Vite)
│   └── src/{api,auth,layout,pages,types}/
└── docker-compose.yml  PostgreSQL + Adminer für lokale Entwicklung
```

## Multi-Tenancy

Siehe [[project_architecture]] — ein Tenant = eine `Company` (= ein Handwerksbetrieb), Isolation
über `companyId`-Spalte, in der Anwendungsschicht erzwungen (kein Postgres-RLS in V1).

## Status & Roadmap

Siehe [[project_roadmap]] für den Funktionsumfang (7 Blöcke aus der Anforderung) und was bereits
umgesetzt ist.

## Compliance-Anforderungen

Siehe [[project_compliance]] — GoBD, DSGVO, XRechnung/ZUGFeRD, GAEB, § 13b UStG, Mahnwesen.

## GitHub & lokale Entwicklungsumgebung

Siehe [[reference_github]] bzw. [[project_dev_environment]].
