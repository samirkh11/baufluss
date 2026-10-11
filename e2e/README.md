# E2E-Tests (Playwright)

Klickt die echte Oberfläche in einem Headless-Chromium durch (Login, Projekte, Berichte, Fotos,
Kontakte, Katalog, Nutzer, Rechte eines Arbeiters) und meldet jede Prüfung als PASS/FAIL.

```bash
# einmalig
cd e2e && npm install && npm run install:browser

# vor jedem Lauf: Stack läuft (docker compose up -d, Backend :3000, Frontend :5173) und Demo-Daten frisch
cd backend && npm run seed
cd ../e2e && npm test
```

- Das Skript legt Test-Daten an (z.B. ein Projekt, einen Bericht) und ändert Seed-Daten
  (Nachname von Dennis Vogel) → danach wieder `npm run seed`.
- Screenshots landen in `e2e/shots/` (nicht im Git).
- Andere Frontend-URL: `E2E_BASE_URL=http://... npm test`.
- Neue Features bekommen hier neue Prüfungen (siehe `.claude/memory/`).
