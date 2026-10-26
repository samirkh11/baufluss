# Design-System Baufluss

Quelle: Figma „Claude testing“ (Prototype board). Single Source of Truth im Code:
`frontend/src/theme/tokens.ts`. Werte nur dort ändern.

## Ebenen

| Ebene | Datei | Beispiel |
| --- | --- | --- |
| Primitive | `tokens.ts` → `palette` | `blue500 #116CE3`, `navy50 #E7E8EA` |
| Semantik | `tokens.ts` → `color`, `toneColors`, `font`, `space`, `radius`, `shadow`, `layout` | `color.brand`, `color.textMuted` |
| Komponenten | `antdTheme.ts` (antd-Tokens), `index.css` (über `--mw-*`) | `Menu.darkItemSelectedBg`, `.mw-status-tag` |

## Farben

| Rolle | Token | Wert | Herkunft |
| --- | --- | --- | --- |
| Marke/Primär | `color.brand` | `#116CE3` | Figma Primary/500 |
| Hover / Active | `brandHover` / `brandActive` | `#0E5DC4` / `#0B4FA6` | abgeleitet |
| Marke hell | `brandSubtle` | `#F2F7FD` | Figma |
| Text | `color.text` | `#17233B` | Figma Text/500 |
| Text sekundär | `textSecondary` | `#454F62` | Figma Text/400 |
| Meta/Placeholder | `textMuted` | `#646C7C` | Figma Text/300 |
| Nur Disabled | `textDisabled` | `#949AA5` | Figma Text/200 |
| Hintergrund | `color.background` | `#FAFAFA` | Figma |
| Rahmen | `border` / `borderStrong` | `#E7E8EA` / `#B5B8BE` | Figma Navy/50, /100 |
| Erfolg / Warnung / Fehler | `success` / `warning` / `error` | `#2BA156` / `#D4A72C` / `#FF5252` | Figma (Warnung abgeleitet) |

## Typografie

Plus Jakarta Sans (Variable Font, selbst gehostet über `@fontsource-variable`, damit sie offline verfügbar ist).

| Stil | Größe/Zeilenhöhe | Gewicht | Verwendung |
| --- | --- | --- | --- |
| Page Title | 22/28 | 600 | `h1`–`h3` (antd `fontSizeHeading1–3`) |
| Section | 16/24 | 600 | `h4` |
| Body | 14/20 | 500 | Standard |
| Meta/Label | 12/16 | 500 | Hinweise, Bottom-Nav |

## Abstände, Radien, Schatten

- Abstände: 4 · 8 · 12 · 16 · 24 · 32 (`space`)
- Radien: 2 (Buttons, Nav-Items) · 4 (Inputs, User-Karte) · 8 (Karten) · Pille (Status)
- Schatten: `card` = `0 5px 10px rgba(0,0,0,.05)`, `raised` = `0 4px 5px rgba(0,0,0,.1)` (aktives Nav-Item)

## Komponenten

| Komponente | Datei | Hinweise |
| --- | --- | --- |
| `StatusTag` | `components/StatusTag.tsx` | Pille mit Punkt; `tone`: info, success, warning, error, neutral. Basis antd `Tag` (`.ant-tag` bleibt). |
| `AuthShell` | `components/AuthShell.tsx` | Login, Registrierung, Betreiber-Login. Desktop geteilt, < 992 px einspaltig. |
| `BrandLogo` | `components/BrandLogo.tsx` | Bildmarke „B“ + Wortmarke aus `APP_NAME`; `inverse` für den Verlauf. |
| `PageFallback` | `components/PageFallback.tsx` | Ladezustand beim Nachladen einer Seite. |
| App-Shell | `layout/AppLayout.tsx` | Sidebar 248 px mit Verlauf, User-Karte, Drawer, Bottom-Nav. |

Status → Tone ist in `utils/labels.ts` bzw. `admin/adminLabels.ts` festgelegt (`StatusLabel`).

## Kontraste (WCAG 2.1 AA, gemessen)

| Kombination | Verhältnis | Ergebnis |
| --- | --- | --- |
| Weiß auf `#116CE3` | 4,91 | AA |
| `#116CE3` auf `#F2F7FD` (Info-Pille) | 4,56 | AA |
| `#1E7B42` auf `#EAF6EE` (Erfolg) | 4,77 | AA |
| `#8A6A12` auf `#FCF8EB` (Warnung) | 4,76 | AA |
| `#C62828` auf `#FFF2F2` (Fehler) | 5,15 | AA |
| `#646C7C` auf Weiß (Meta) | 5,28 | AA |
| `#949AA5` auf Weiß | 2,83 | nur für Disabled |

## Abweichungen von Figma (begründet)

1. **Sidebar-Verlauf** `#116CE3 → #0B4FA6` statt `#1284FF → #61ACFF`: weiße Schrift hätte auf `#61ACFF` nur 2,37 : 1.
2. **Status-Textfarben** dunkler als Figma (`#2BA156` auf `#EAF6EE` = 2,99 : 1, `#FF5252` auf `#FFF2F2` = 2,92 : 1).
   Die Figma-Farben bleiben als Punktfarbe erhalten.
3. **Placeholder** `#646C7C` statt `#949AA5`.
4. **Login-Bild:** kein Stockfoto aus Figma (Lizenz unklar) – Markenverlauf mit Claim.
5. **Logo:** Figma-Logo nicht als Asset übernommen; vorläufige Bildmarke „B“ (`public/favicon.svg`).
   Bei finalem Logo `favicon.svg` ersetzen und `npm run generate-pwa-assets` ausführen.
6. **Warnung-500** fehlt in Figma → `#D4A72C` abgeleitet.
