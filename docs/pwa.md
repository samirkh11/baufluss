# PWA

Umgesetzt mit `vite-plugin-pwa` 1.3.0 (Workbox 7, Strategie `generateSW`). Konfiguration: `frontend/vite.config.ts`.

## Bestandteile

| Teil | Umsetzung |
| --- | --- |
| Manifest | wird beim Build erzeugt (`manifest.webmanifest`): Name/Kurzname aus `config/app.ts`, `theme_color #116CE3`, `background_color #FAFAFA`, `display: standalone`, `lang: de` |
| Icons | `public/favicon.svg` (Quelle) → `npm run generate-pwa-assets` erzeugt 64/192/512 px, maskable 512 px, Apple-Touch 180 px, `favicon.ico`. Die PNGs liegen im Repo, der Build braucht kein `sharp`. |
| Service Worker | `dist/sw.js`, precacht nur die App-Shell: JS, CSS, HTML, Icons, Schrift (latin, latin-ext) |
| Offline | Navigationen fallen auf das gecachte `index.html` zurück → App startet offline; API-Aufrufe schlagen fehl, das **Offline-Banner** erklärt das |
| Update | `registerType: 'prompt'`: neue Version lädt im Hintergrund; Hinweis „Neue Version verfügbar – Jetzt aktualisieren“ (`pwa/PwaUpdatePrompt.tsx`). Prüfung stündlich, solange die App offen ist. Alte Caches werden entfernt (`cleanupOutdatedCaches`). |
| iOS | `apple-touch-icon`, `apple-mobile-web-app-*`-Meta-Tags, `viewport-fit=cover` + Safe-Area-Abstände |

## Sicherheit / Datenschutz

- **Keine Laufzeit-Caches** (`runtimeCaching: []`): API-Antworten (Kunden-, Preis-, Personaldaten) und `/uploads`
  landen nie im Service-Worker-Cache.
- `navigateFallbackDenylist`: `/api/…` und `/uploads/…` gehen immer ans Netz.
- Beim **Logout** (Kunde und Betreiber) und beim **Login** wird der TanStack-Query-Cache geleert.
  Der Precache enthält nur öffentliche Build-Dateien und muss deshalb nicht gelöscht werden.
- nginx liefert `sw.js`, `workbox-*.js` und `manifest.webmanifest` mit `Cache-Control: no-cache`, damit Updates ankommen.

## Wichtige Voraussetzung: HTTPS

Service Worker laufen nur in einem **sicheren Kontext** (HTTPS oder `localhost`). Der aktuelle Betrieb auf der
Synology über **HTTP, Port 8085** erfüllt das nicht: Dort wird der Service Worker **nicht** registriert, die App ist
nicht installierbar; alles andere funktioniert unverändert. Abhilfe: Reverse-Proxy der Synology (DSM →
Anmeldeportal → Reverse-Proxy) mit Let's-Encrypt-Zertifikat vor Port 8085 schalten.

## Plattformgrenzen

| Plattform | Grenzen |
| --- | --- |
| iOS/iPadOS Safari | Installation nur über „Zum Home-Bildschirm“; kein Install-Prompt. Speicher kann nach längerer Nichtnutzung gelöscht werden. Push nur ab iOS 16.4 für installierte Apps (nicht umgesetzt). |
| Android Chrome | Installierbar, Update-Hinweis funktioniert wie im Desktop-Browser. |
| Desktop Chrome/Edge | Installierbar als Fenster-App. |
| Firefox Desktop | Kein Installieren; Service Worker und Offline-Start funktionieren. |

## Bewusst nicht umgesetzt

- Offline-Bearbeitung / Hintergrund-Sync (würde Konfliktauflösung und Verschlüsselung lokaler Daten erfordern).
- Push-Benachrichtigungen.

## Manuell prüfen (nach Deployment mit HTTPS)

1. DevTools → Application → Manifest: keine Fehler, Icons sichtbar.
2. Service Worker „activated“; Offline schalten, neu laden → App-Shell erscheint mit Offline-Banner.
3. Neue Version deployen → Hinweis „Neue Version verfügbar“ erscheint.
4. Cache Storage enthält nur `workbox-precache-*`, keine API-Antworten.
