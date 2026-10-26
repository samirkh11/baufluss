# Projektanalyse – Baufluss (ehemals „Meisterwerk“)

Stand: 26.10.2026. Grundlage: Repository `N:\meisterwerk`, `.claude/memory/*`, README, Figma-Datei
„Claude testing“ (Seite „Prototype board“, Node `1061:16319`).

## 1. Produkt

Cloudbasierte, mandantenfähige Software für Handwerksbetriebe (Projekte, Bautagebuch/Berichte,
Zeiterfassung, Angebote → Aufträge → Rechnungen/Gutschriften, Mahnwesen, Eingangsrechnungen,
E-Rechnung, GoBD-Archiv, Betreiber-Backoffice mit Tarifen und Plattformrechnungen).
Der Produktname ist jetzt **Baufluss** (Figma). Er steht zentral in `frontend/src/config/app.ts`.

## 2. Tatsächlicher Tech-Stack

| Schicht | Technologie |
| --- | --- |
| Frontend | Vite 5 + React 18 SPA, TypeScript (strict), Ant Design 5.29, TanStack Query 5, React Router 6, axios |
| Backend | NestJS, Prisma, PostgreSQL 16, JWT (Passport) |
| Tests | Jest (Backend, 107 Tests), Playwright-Skripte in `e2e/` (smoke, responsive, admin) |
| Betrieb | Docker Compose, nginx (SPA + Reverse-Proxy `/api`), Synology, aktuell **HTTP auf Port 8085** |

Kein Next.js, kein SSR – Empfehlungen im Master-Prompt zu Next.js sind nicht anwendbar.

## 3. Befunde vor der Überarbeitung

| Bereich | Befund | Status |
| --- | --- | --- |
| Design | Kein zentrales Theme; antd-Standardblau, dunkle Sidebar `#001529`, Farben inline | behoben (Design-System) |
| Branding | „Meisterwerk“ fest an 5 Stellen im UI | behoben (`APP_NAME`) |
| Status-Tags | ~37 `<Tag color={…}>` mit antd-Preset-Farben, teils unter WCAG AA | behoben (`StatusTag` + Tones) |
| Bundle | Ein JS-Chunk mit 1,59 MB | behoben (Route-Splitting, Haupt-Chunk 787 kB) |
| Lint | 2 Warnungen (`react-refresh/only-export-components`) → `npm run lint` schlug fehl | behoben |
| Sicherheit | Query-Cache wurde beim Logout nicht geleert (Daten des Vornutzers im Speicher) | behoben |
| PWA | nicht vorhanden | umgesetzt (siehe `pwa.md`) |
| Mobile | Drawer-Navigation vorhanden, aber nur „verkleinerter Desktop“ | Bottom-Navigation ergänzt |
| Backend-Lint | ~11.700 Prettier-CRLF-Fehler (Git-autocrlf) + 10 echte `no-unused-vars` | offen, nicht Teil dieser Arbeit |
| Git | Packfile auf dem Netzlaufwerk „nicht verfügbar“ (`bad object HEAD`) | offen – Repo prüfen, bevor gepusht wird |

## 4. Figma ↔ Code

Die Figma-Datei enthält ~200 Desktop-Frames (1440 px) in den Abschnitten A–L, **keine Mobile-Frames**.

Übernommen: Markenname, Schrift (Plus Jakarta Sans), Farbpalette, Typo-Skala, Sidebar (248 px,
Verlauf, aktive Navigation als weiße Pille), Karten (Radius 8, Schatten), Buttons (Höhe 34, Radius 2),
Status-Pillen (Punkt + getönter Hintergrund), Tabellenköpfe, Login als geteiltes Layout.

Bewusste Abweichungen (Barrierefreiheit/Lizenz): siehe `design-system.md`, Abschnitt „Abweichungen“.

In Figma vorhanden, im Code **nicht** vorhanden (offene Produktfragen, nicht umgesetzt, keine Tabellen
erfunden): Terminplanung/Scheduling, Aufgaben, Lieferschein, Briefe, Aufmaß, Abwesenheit/Krankmeldung,
Rollen-&-Rechte-Editor, E-Mail-Vorlagen, Briefpapier, Ordnerstruktur, Projektkosten-Ansicht,
KI-Angebot. Die Projektstatus in Figma weichen vom Code ab – **auf Wunsch bleiben die Code-Status**.

## 5. Weiterführende Dokumente

- `architecture.md` – Frontend-Architektur und Entscheidungen
- `design-system.md` – Tokens, Komponenten, Kontraste
- `responsive-strategy.md` – Desktop / Tablet / Phone
- `pwa.md` – PWA, Caching, Sicherheit, Plattformgrenzen
- `database-analysis.md` + `diagrams/*.mmd` – DB-Analyse mit Prioritäten
