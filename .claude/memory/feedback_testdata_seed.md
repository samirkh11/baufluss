---
name: feedback-testdata-seed
description: Jedes neue Feature bekommt sofort passende Testdaten im Seed (Szenario Dachdeckerbetrieb)
metadata:
  type: feedback
---

Bei JEDEM neuen Feature im selben Zug den Seed (`backend/prisma/seed/`) um wenige, sinnvolle
Datensätze für alle neuen Tabellen erweitern — nicht nachträglich.

**Why:** Volker (2026-10-11) will jedes Feature sofort mit realistischen Daten ausprobieren
können; Block 1+2 wurden deshalb nachträglich befüllt.

**How to apply:**
- Szenario: **Dachdeckerei Schmidt GmbH** (Ulm), Chef + Bürokraft + 4 Arbeiter. Neue Module
  hängen ihre Daten an diese Firma (Projekte = typische Dachsanierungen, Angebote/Rechnungen mit
  den vorhandenen Kunden und dem Katalog, Berichte von den Arbeitern, usw.).
- Pro Feature eine eigene Datei `prisma/seed/<feature>.ts` mit `seedXxx(prisma, companyId, ...)`,
  in `prisma/seed/index.ts` einhängen (Reihenfolge nach FK-Abhängigkeit).
- Seed ist idempotent: `removeExistingDemoTenants()` löscht die Demo-Mandanten (Cascade + Upload-
  Dateien) und legt sie neu an. Neue Tabellen mit `companyId` brauchen `onDelete: Cascade`;
  neue Upload-Pfade müssen in `removeExistingDemoTenants` mit aufgeräumt werden.
- Bisher im Seed: Firma+Nutzer+Nummernkreise, Kontakte, Katalog, Projekte+Berichte+Fotos
  (`projects.ts`), Angebote in allen Status plus daraus abgeleitete Aufträge und Rechnungen inkl. § 13b-Entwurf, Privatkunden-Entwurf, zwei Abschlagsrechnungen (je 30 %) und Schlussrechnungs-Entwurf mit 5 % Einbehalt für die Dachsanierung (`documents.ts`; Rechnungsnummernkreis mit `lastResetYear`, nächste Nr. RE-00004), drei Wochen Arbeitszeiten der Crew mit Freigabe bis 30.9.
  (`time-entries.ts`, Stundensätze am Mitarbeiter). Der Seed setzt die Nummernzähler
  (PROJECT/REPORT/QUOTE/ORDER/INVOICE) hinter die vergebenen Nummern.
- Bilder im Seed: generierte SVGs über `seed/helpers.ts` (`writeSeedImage`), nichts Binäres
  committen.
- Zweiter Mandant (`second-tenant.ts`, Zimmerei Beispiel GmbH) bekommt je Feature 1 Datensatz,
  damit Mandanten-Isolation manuell prüfbar bleibt.
- Gleiches Prinzip für Tests: neue UI-Features bekommen Prüfungen in `e2e/` (siehe
  [[project_dev_environment]]).
