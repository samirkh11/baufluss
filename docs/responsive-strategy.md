# Responsive-Strategie

Figma liefert nur Desktop (1440 px). Tablet und Phone sind daher **eigene Entscheidungen**, abgeleitet aus dem
Nutzungskontext (Baustelle, Handschuhe, eine Hand, schlechtes Netz) und den Regeln in
`.claude/memory/feedback_responsive.md`.

## Breakpoints

| Name | Bereich | Hook | Shell |
| --- | --- | --- | --- |
| Phone | < 768 px | `useIsPhone()` | Topbar (Menü-Button, Logo, Abmelden) + **Bottom-Navigation** + Drawer |
| Tablet / kompakt | 768–991 px | `useIsCompact()` | Topbar + Drawer |
| Desktop | ≥ 992 px | – | Sidebar 248 px (Figma) |

Werte stehen in `tokens.ts` (`breakpoint`) und entsprechen den antd-Breakpoints `md`/`lg`.

## Phone ist kein verkleinerter Desktop

- **Bottom-Navigation** mit den vier Baustellen-Zielen: Übersicht, Projekte, Zeiten, Berichte – im Daumenbereich,
  Tap-Fläche ≥ 44 px, `env(safe-area-inset-bottom)` für iPhones mit Home-Indikator. Alles Weitere über „Menü“.
- **Größere Controls:** `componentSize="large"` auf Phones (bestehend).
- **Inhalt** mit 12 px Rand und Abstand nach unten, damit nichts unter der Bottom-Navigation verschwindet.
- **Tabellen:** Spalten mit `responsive: ['md']` werden ausgeblendet (bestehendes Muster beibehalten).
- **Login:** einspaltig, Logo über dem Formular, Karte ohne Rahmen; Markenpanel entfällt.
- **Offline-Banner** zeigt, dass Änderungen gerade nicht gespeichert werden können.

## Tablet

Drawer-Navigation statt Sidebar, volle Inhaltsbreite. Login einspaltig.

## Desktop

Figma-Layout: Sidebar mit Verlauf, aktive Navigation als weiße Pille mit Schatten, User-Karte unten, Inhalt 16 px Rand.

## Barrierefreiheit

- Landmarks: `nav` (Haupt- und Schnellnavigation, je mit `aria-label`), `main` im Login.
- Sichtbarer Fokus (`:focus-visible`, 2 px Markenfarbe).
- `prefers-reduced-motion` wird respektiert.
- Aktiver Bottom-Nav-Eintrag mit `aria-current="page"`.

## Tests

`e2e/responsive.e2e.mjs` prüft Phone/Tablet (keine Sidebar, Drawer, keine horizontale Überbreite).
Diese Tests wurden in dieser Umgebung **nicht** ausgeführt (kein PostgreSQL/Playwright-Browser) und müssen vor dem
Push lokal laufen (Regel in `.claude/memory`).
