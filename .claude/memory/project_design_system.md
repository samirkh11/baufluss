---
name: project-design-system
description: Produktname Baufluss, Design-System (Figma-Tokens), PWA, Mobile-Bottom-Nav – wo was liegt und welche Regeln gelten
metadata:
  type: project
---

Seit 2026-10-26 heißt das Produkt **Baufluss** (Figma „Claude testing“). Repo/Ordner/Paketnamen und
localStorage-Schlüssel (`meisterwerk.*`) bleiben absichtlich unverändert (bestehende Sitzungen).
Projektstatus bleiben wie im Code (Figma-Status weichen ab – Entscheidung des Nutzers, vorerst).

**Why:** Einheitliches UI nach Figma, PWA für Baustellen-Nutzung, keine verstreuten Farben/Namen.

**How to apply:**
- Name nur über `frontend/src/config/app.ts` (`APP_NAME`); Farben/Abstände nur über `frontend/src/theme/tokens.ts`.
- Status-Darstellung: `{ label, tone }` in `utils/labels.ts` + `<StatusTag tone>` – kein `<Tag color=…>` für Status.
- Phone: Bottom-Navigation (Links, keine menuitems) zusätzlich zum „Menü“-Drawer; siehe [[feedback-responsive]].
- PWA: keine Runtime-Caches für `/api` oder `/uploads`; Query-Cache wird bei Login/Logout geleert. HTTPS nötig.
- Doku: `docs/design-system.md`, `docs/pwa.md`, `docs/responsive-strategy.md`, `docs/database-analysis.md`.
