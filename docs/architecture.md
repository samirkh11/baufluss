# Frontend-Architektur

## Schichten

```
src/
  config/app.ts          Produktname, Kurzname, Beschreibung (UI, <title>, Manifest)
  theme/
    tokens.ts            Design-Tokens (Primitive → Semantik), keine Browser-Imports
    antdTheme.ts         Komponenten-Layer: Tokens → antd ThemeConfig
    cssVariables.ts      Tokens → CSS-Custom-Properties (--mw-*) für index.css
  Root.tsx               Provider: ConfigProvider(theme, locale, Größe) > QueryClient > Router > Auth
  main.tsx               Einstieg: Font, CSS, CSS-Variablen, Render
  App.tsx                Routen; Seiten per React.lazy (lazyPage) in eigenen Chunks
  auth/
    useAuth.ts           Context + Hook
    AuthContext.tsx      AuthProvider (Login/Logout, leert Query-Cache)
    ProtectedRoute.tsx
  layout/AppLayout.tsx   App-Shell: Sidebar | Drawer | Bottom-Navigation, Banner (offline/Support/Trial)
  admin/                 Betreiber-Backoffice (eigenes Token, eigenes Layout)
  components/            Wiederverwendbare Bausteine (StatusTag, AuthShell, BrandLogo, PageFallback, Fach-Panels)
  hooks/                 useMediaQuery (useIsPhone/useIsCompact), useOnlineStatus
  pwa/PwaUpdatePrompt.tsx  Service-Worker-Registrierung + „Neue Version“-Hinweis
  utils/labels.ts        Labels + Tone je Statuswert (StatusLabel)
```

## Entscheidungen

1. **Bestehende Architektur beibehalten** (Vite + antd + TanStack Query). Kein Rewrite, keine neue UI-Bibliothek.
2. **antd-Theme statt eigener CSS-Komponenten.** Farben/Radien/Schrift kommen über `ConfigProvider theme`;
   nur was antd nicht abbildet (Sidebar-Verlauf, Status-Punkt, Bottom-Nav, Auth-Layout) liegt in `index.css`
   und nutzt ausschließlich `--mw-*`-Variablen.
3. **Status-Darstellung zentral:** Label-Maps liefern `{ label, tone }`; `<StatusTag tone>` setzt Farben aus
   `toneColors`. Neue Status brauchen nur einen Eintrag in `labels.ts`.
4. **Route-Level-Code-Splitting:** Login, Registrierung und die Shells bleiben im Haupt-Chunk; alle übrigen Seiten
   werden bei Bedarf geladen (`<Suspense fallback={<PageFallback/>}>` um das `Outlet`, damit die Navigation stehen bleibt).
5. **Sicherheit beim Benutzerwechsel:** `signIn` und `signOut` rufen `queryClient.clear()`; Admin-Logout ebenso.
   Die localStorage-Schlüssel behalten das Präfix `meisterwerk.`, damit bestehende Sitzungen nach dem Rename gültig bleiben.
6. **E2E-Kompatibilität:** Selektoren der Playwright-Skripte bleiben gültig (`.ant-layout-sider`, Button „Menü“,
   `menuitem` im Drawer, `h3`-Titel in Projekt-/Belegdetails, `.ant-tag`, `data-testid`-Banner).
   Die Bottom-Navigation nutzt bewusst Links (keine `menuitem`), damit Rollen-Prüfungen im Drawer eindeutig bleiben.

## Prüfungen (lokal ausgeführt, siehe Abschlussbericht)

`npm run lint` (0 Warnungen), `npm run build` (tsc + vite + Service Worker), Backend `tsc` und `jest`.
E2E (Playwright) konnten mangels PostgreSQL/Browsern in dieser Umgebung **nicht** ausgeführt werden.
