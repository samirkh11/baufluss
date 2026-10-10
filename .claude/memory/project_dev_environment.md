---
name: project-dev-environment
description: Meisterwerk – lokale Entwicklungsumgebung, Zugangsdaten, offene Setup-Schritte
metadata:
  type: project
---

## Setup-Status (Stand 2026-10-10)

- Docker (Engine 29, Compose v5) wurde von Volker installiert (Zorin OS 18.1, Ubuntu-„noble"-
  Basis; Claude kann kein `sudo`-Passwort eingeben). `docker compose up -d` läuft, Postgres 16
  + Adminer sind aktiv.
- Backend: `npm install`, Migration `init` angewendet, Seed ausgeführt, API per curl getestet
  (Login, Firmenprofil PATCH, Nummernkreise, Nutzer anlegen, Mandanten-Isolation, 403 für
  MEMBER, 401 ohne Token) — alles OK.
- Frontend: `tsc` + `vite build` sauber, Dev-Server liefert HTTP 200, CORS-Preflight OK.
  **Noch NICHT im echten Browser durchgeklickt** (kein Browser-Tool in der Session) — Volker
  sollte Login/Firmenprofil/Logo-Upload/Nutzerliste einmal manuell prüfen.
- Bekannt: `multer` 1.x (deprecated, Schwachstellen) → bei Gelegenheit auf 2.x heben;
  `npm audit` meldet Schwachstellen in Dev-Abhängigkeiten.

**Why:** Kein `sudo` ohne Passwort verfügbar, Docker war die vom Nutzer gewählte Option
(Alternative wäre natives PostgreSQL via apt gewesen).

**How to apply:** Bei der nächsten Session zuerst prüfen, ob `docker compose up -d` erfolgreich
läuft, bevor an neuen Features weitergebaut wird — das Grundgerüst muss erst lokal laufen und
end-to-end getestet werden (Registrierung → Login → Firmenprofil bearbeiten → Logo hochladen →
Nutzer anlegen), bevor es wie gewünscht nach GitHub gepusht wird (siehe [[reference_github]]).

## Zugangsdaten (nur lokal, Demo-Daten)

- Seed-Nutzer (`backend/prisma/seed.ts`): `demo@meisterwerk.local` / `demo12345`
- Postgres: `meisterwerk` / `meisterwerk`, DB `meisterwerk`, Port 5432 (siehe
  `docker-compose.yml`)
- Adminer (DB-Web-UI): http://localhost:8080

## Push-Workflow

Laut Nutzeranforderung: Code wird erst nach GitHub gepusht, wenn neue Funktionen **lokal
erfolgreich getestet** sind. Nicht automatisch nach jedem Build pushen.
