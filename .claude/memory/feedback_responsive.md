---
name: feedback-responsive
description: Die App muss auf Smartphone und Tablet gut bedienbar sein (Mitarbeiter auf der Baustelle)
metadata:
  type: feedback
---

Alle Seiten und Dialoge müssen responsive sein und auf Smartphone/Tablet gut bedienbar bleiben.

**Why:** Volker (2026-10-11): Mitarbeiter nutzen die Anwendung auf Baustellen mit Handy/Tablet
(Berichte, Fotos, Projektinfos). Beim Initial-Setup vergessen, nachträglich für alle Seiten
umgestellt.

**How to apply (Muster, siehe vorhandene Seiten):**
- Hooks `useIsPhone` (<768 px) / `useIsCompact` (<992 px) in `frontend/src/hooks/useMediaQuery.ts`.
  Desktop: feste Sidebar; compact: Header mit Hamburger + Drawer (`layout/AppLayout.tsx`).
- Auf Phones `componentSize="large"` (größere Touch-Ziele) in `main.tsx`.
- Formulare: `<Col xs={24} sm={N}>` statt `<Col span={N}>`; feste Breiten immer mit
  `maxWidth: '100%'`; Seitenränder 12 px (Phone) statt 24.
- Tabellen: `scroll={{ x: 'max-content' }}` und Nebenspalten `responsive: ['md']` (auf dem Handy nur
  das Wichtigste; Telefonnummer/Titel/Status bleiben sichtbar).
- Breite, tabellarische Editoren (Angebotspositionen) bekommen auf dem Phone eine Kartenansicht.
- Neue Seiten in `e2e/responsive.e2e.mjs` aufnehmen (Prüfung „kein horizontaler Überlauf" auf
  Phone 390 px und Tablet 820 px, Dialoge passen in den Bildschirm).
- Arbeiter-Workflow auf dem Handy (Projekt öffnen → Bericht schreiben → Foto) muss immer gehen.
