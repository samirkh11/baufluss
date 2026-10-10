---
name: project-dev-environment
description: Meisterwerk – lokale Entwicklungsumgebung, Zugangsdaten, offene Setup-Schritte
metadata:
  type: project
---

## Setup-Status (Stand 2026-10-10)

- Docker war beim Projektstart NICHT installiert (Zorin OS 18.1, Ubuntu-„noble"-Basis). Volker
  wurde gebeten, die Docker-Engine-Installation selbst auszuführen (braucht `sudo`-Passwort, das
  Claude nicht eingeben kann). Installationsbefehle wurden im Setup-Chat gegeben
  (offizielles Docker-APT-Repo für Ubuntu noble).
- **Nach der Docker-Installation:** Ab- und wieder anmelden (Gruppenmitgliedschaft `docker`),
  dann `docker compose up -d` im Projektverzeichnis `/home/volker/meisterwerk/` prüfen.
- Danach wurden Backend/Frontend-Code geschrieben, aber `npm install` / `prisma migrate dev` /
  ein tatsächlicher End-to-End-Test (Login, Firmenprofil speichern) standen zum Zeitpunkt dieses
  Commits noch aus — siehe README.md im Repo-Root für die Setup-Schritte.

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
