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

## Zugangsdaten & Testdaten (nur lokal)

`npm run seed` (im Ordner `backend/`) setzt die Demo-Daten zurück und neu auf (siehe
[[feedback_testdata_seed]]). Passwort für ALLE Seed-Nutzer: `demo12345`.

- Chef (OWNER): `demo@meisterwerk.local` — Thomas Schmidt, Dachdeckerei Schmidt GmbH, Ulm
- Bürokraft (ADMIN): `buero@dachdecker-schmidt.example` — Sabine Keller
- Arbeiter (MEMBER): `j.hoffmann@`, `d.vogel@`, `m.yilmaz@`, `l.bauer@dachdecker-schmidt.example`
- 2. Mandant (Isolationstest): `zimmerei@meisterwerk.local` — Zimmerei Beispiel GmbH
- Postgres: `meisterwerk` / `meisterwerk`, DB `meisterwerk`, Port 5432 (`docker-compose.yml`)
- Adminer (DB-Web-UI): http://localhost:8080 (Server `postgres`)

Backend/Frontend starten: `cd backend && npm run start` bzw. `start:dev`; `cd frontend && npm run dev`.
Achtung beim Neustart des Backends: nicht mit `pkill -f` auf Muster killen, das beendet die
eigene Shell — PID über `ss -ltnp | grep :3000` ermitteln.

## UI-Tests im Browser (E2E)

`e2e/` im Repo (Playwright, Chromium liegt in `~/.cache/ms-playwright`). Ablauf: Stack läuft →
`cd backend && npm run seed` → `cd e2e && npm test` (`smoke.e2e.mjs` 127 Checks: Login, Projekte,
Berichte+Fotos, Kontakte, Katalog, Nutzer, Angebote/Editor/PDF/Übernahme/GAEB, Rechnung ausstellen, Abschlag/Schluss, Zahlungen/Storno/Offene Posten, Zeiterfassung, Arbeiter-Rechte; danach
`responsive.e2e.mjs` 59 Checks auf Phone 390 px/Tablet 820 px: Drawer-Menü, kein Seiten-Überlauf,
Dialoge, Arbeiter-Bericht mit Foto). Einzeln: `npm run test:smoke` / `npm run test:responsive`.
Falls der Vite-Dev-Server leere Module liefert (Cache nach vielen Änderungen): Prozess auf :5173
beenden und `npm run dev` neu starten. Einrichtung/Details: `e2e/README.md`.
**Regel:** Jedes neue Feature erweitert `e2e/smoke.e2e.mjs` (oder eine neue `*.e2e.mjs`) um
UI-Prüfungen und wird vor dem Push damit getestet (Volker hat das Skript ausdrücklich im Repo
gewünscht, 2026-10-11).
Hinweise: antd-`<a onClick>` hat keine Link-Rolle (per `tbody a` selektieren); Dialoge mit dem
„×" schließen, nicht per Escape, wenn der Fokus im Datei-Input liegt; der Lauf verändert Seed-Daten
→ danach neu seeden.

## Unit-Tests (Backend)

`cd backend && npm test` (Jest + ts-jest, `*.spec.ts` neben dem Code). Aktuell
`documents/calculations.spec.ts` (Geldberechnung) `time-entries/time-utils.spec.ts` und `documents/gaeb/gaeb.spec.ts` (GAEB-Parser/Writer
mit den Beispielen aus `docs/gaeb-samples/`). Neue Rechenlogik (Rechnungen, Mahnzinsen,
Sicherheitseinbehalt …) immer mit Unit-Tests absichern.
PDFs prüfen: per curl holen, `pdftoppm -png` rendern und ansehen (poppler-utils ist installiert).

## Stolpersteine (Frontend)

- antd `message.*` gibt ein Thenable zurück, das erst beim Schließen des Toasts (~3 s) auflöst.
  NIE aus einem react-query `onError`/`onSuccess` zurückgeben (`=> void message.error(...)` oder
  Block-Body), sonst bleibt die Mutation ~3 s „pending" und Buttons drehen weiter (so geschehen,
  2026-10-11 überall behoben).
- Nach dem Löschen eines Datensatzes auf dessen Detailseite darf die Detail-Query nicht neu laden
  (404): Query per `enabled: !deleted` abschalten, bevor navigiert/invalidiert wird.
- Playwright in Tabs: `waitForSelector('tbody tr...')` findet auch Zeilen inaktiver Tab-Panels (versteckt, dann
  Timeout); immer `.ant-tabs-tabpane-active tbody tr...` verwenden. Der Vite-Dev-Server liefert nach vielen
  Änderungen veraltete Module (Meldung wie "X is not defined" trotz sauberem tsc): Prozess auf :5173 beenden und
  `npm run dev` neu starten.
- antd `InputNumber` `addonAfter` ist deprecated → Text daneben setzen. Zeilentexte im Angebots-/Rechnungseditor
  sind Input-Werte (nicht Textinhalt): in Playwright mit `input[value="…"]` suchen, nicht mit `getByText`.
- Fehler-Toast kann das „×" eines Dialogs verdecken → in E2E „Abbrechen" klicken.

## Push-Workflow

Laut Nutzeranforderung: Code wird erst nach GitHub gepusht, wenn neue Funktionen **lokal
erfolgreich getestet** sind. Nicht automatisch nach jedem Build pushen.

- Pitfall: Rechner hat nur ~8 GB RAM; bei Speichermangel werden Backend/Vite/Tool-Shell mit Exit 137/144 gekillt → Server neu starten (`setsid nohup npm run start:dev`), Seed + Tests einzeln laufen lassen. Antd-Dropdown-Menüs animieren: vor Menüpunkt-Klick kurz warten.
- Pitfall: NIE `pkill -f "nest start"` o. ä. in der Tool-Shell – das Muster steht in der eigenen Kommandozeile und killt die Shell (Exit 144). Nest-Watch lädt Änderungen selbst neu.
- E-Rechnung prüfen: `cd e2e && ./validate-einvoice.sh` (Backend + Seed nötig, Java; erster Lauf lädt ~100 MB nach e2e/.cache).
