---
name: project-roadmap
description: Meisterwerk – Die 7 geforderten Funktionsblöcke, Status, empfohlene Reihenfolge
metadata:
  type: project
---

Ursprüngliche Anforderung vom 2026-10-10: 7 Funktionsblöcke für den Start. Jeder Block wird als
vollständige, lokal getestete Ausbaustufe umgesetzt und erst dann committet/gepusht (siehe
[[project_dev_environment]]) — bewusst NICHT alles auf einmal als Rohbau, um keine
halbfertigen Features zu hinterlassen.

## Status

### ✅ Block 1 — Firmenprofil und Konto (fertig, V1)
Firmendaten, Logo-Upload, Briefpapier-Texte, Nummernkreise-Konfiguration, Nutzer & Rollen
(Owner/Admin/Member), Mitarbeiter-Profilbild. Backend: `companies/`, `users/`, `auth/`. Frontend:
`CompanyProfilePage`, `UsersPage`.

### ✅ Block 2 — Kontakte und Stammdaten (fertig, 2026-10-10)
Backend: `contacts/` und `catalog/`. Frontend: `ContactsPage`, `CatalogPage`.
- Ein gemeinsames `Contact`-Modell, Rollen als Array `types` (`CUSTOMER`/`SUPPLIER`/`SUBCONTRACTOR`,
  ein Kontakt kann mehrere Rollen haben). Optionale eigene `number` (unique je Firma, noch nicht an
  Nummernkreise gekoppelt — kann später über `NumberSequence` automatisch vergeben werden).
- Leistungs- und Artikelstamm in EINEM Modell `CatalogItem` mit `kind` (`SERVICE`/`ARTICLE`),
  Netto-VK, optional EK, USt-Satz, Einheit. Preise sind `Decimal(12,2)` → JSON-Strings, Frontend
  wandelt per `Number()`. Angebotspositionen (Block 4) sollen Werte beim Anlegen KOPIEREN.
- Archivieren (`isActive=false`) ist der normale Weg; Löschen ist erlaubt, muss aber ab Block 3/4
  blockiert werden, sobald Projekte/Dokumente auf einen Kontakt/Artikel verweisen (FK Restrict).
- Bilder (2026-10-11 nachgerüstet): Kontakt 1 Bild, Leistung/Artikel mehrere (max. 10), siehe
  [[project_architecture]].
- Listen-Endpunkte: Pagination (`page`,`pageSize`) + `q`-Suche über gemeinsames
  `PaginationQueryDto`; Antwort `{items,total,page,pageSize}`.
- Offen/Ideen: Ansprechpartner je Kontakt, mehrere Adressen (Lieferadresse), CSV-Import,
  Kategorien/Warengruppen im Katalog.

### ⬜ Block 3 — Projekte
Projektliste, Projekt anlegen, Projektübersicht mit allen Dokumenten UND Berichten.
**Wichtig (explizit vom Nutzer betont):** Berichte sind in der Baubranche genauso wichtig wie
Angebote/Rechnungen und gehören zu den Kernfunktionen, nicht als Nachgedanke. Ein `Report`-Modell
(Datum, Verfasser, Freitext, ggf. Fotos/Anhänge, Wetter/Baufortschritt) sollte von Anfang an
gleichrangig neben `Quote`/`Invoice` im Projekt-Dokumenten-Tab stehen.

### ⬜ Block 4 — Angebote
Angebotseditor mit Positionen, PDF-Export, Preise aus dem Artikelstamm (Block 2), Workflow
Angebot → Auftrag → Rechnung (Status-Übergänge, keine Datenneueingabe bei Übernahme), GAEB-Import
und -Export.
**Hinweis:** GAEB (GAEB DA XML / P88/P90) ist ein eigenes, nicht-triviales XML-Format aus der
Baubranche — eigene Recherche/Bibliothek nötig, kein Standard-npm-Paket bekannt; ggf. eigenen
Parser/Serializer schreiben. Sollte als eigener Teilschritt innerhalb von Block 4 geplant werden,
nicht nebenbei.

### ⬜ Block 5 — Rechnungen
Pflichtangaben nach § 14 UStG, Abschlags- und Schlussrechnung, § 13b UStG (Reverse Charge bei
Bauleistungen — sehr relevant für Handwerksbetriebe!), Sicherheitseinbehalt, Storno,
Zahlungseingang, Mahnwesen (Mahnstufen, Fristen, Zinsen).
**Hinweis:** § 13b-Fälle brauchen eine eigene Rechnungsvariante ohne USt-Ausweis mit Hinweistext
("Steuerschuldnerschaft des Leistungsempfängers").

### ⬜ Block 6 — Eingangsrechnungen
Empfang per Mail (eigenes Postfach/Weiterleitung nötig — Infrastruktur-Entscheidung) und Upload,
Freigabe-Workflow, Zuordnung zum Projekt.

### ⬜ Block 7 — E-Rechnung und Compliance
XRechnung und ZUGFeRD lesen und erzeugen, GoBD (Unveränderbarkeit, Verfahrensdokumentation,
Aufbewahrung), DSGVO, Export für den Steuerprüfer (GoBD-Z3-Zugriff / DATEV-Export).
**Hinweis:** Ab 2025 gilt in Deutschland die E-Rechnungspflicht für B2B — betrifft Block 5 und 6
direkt. Sollte NICHT als letztes "Compliance-Anhängsel" behandelt werden, sondern die
Rechnungs-/Eingangsrechnungs-Datenmodelle in Block 5/6 müssen von Anfang an so gebaut sein, dass
XRechnung/ZUGFeRD-Export ohne Nacharbeit möglich ist (alle Pflichtfelder der EN16931-Norm von
Anfang an im Schema vorsehen). Details siehe [[project_compliance]].

### ⬜ Block 8 — Plattform-Admin / Betreiber-Backoffice (von Volker nachgefordert 2026-10-10)
Unter der Backend-URL gibt es bisher nur die Swagger-Doku. Es braucht ein echtes
**Betreiber-Backoffice** (getrennt von der Kunden-App): Mandanten-/Abonnentenverwaltung
(Firmen ansehen, sperren, Testphase), Abo-Pläne & Abrechnung (Subscriptions, Zahlungsanbieter
z.B. Stripe, Rechnungen an die Kunden), Nutzungsstatistiken, Support-Zugriffe (Impersonation
mit Audit-Log), ggf. System-Monitoring.
**Entwurfshinweise:** Eigene Rolle `PLATFORM_ADMIN` auf Nutzerebene, die NICHT an eine Company
gebunden ist (heute hängt jeder `User` zwingend an einer `Company` — Schema-Änderung nötig, z.B.
separate `PlatformAdmin`-Tabelle + eigener Auth-Guard/Token-Audience); eigene API unter
`/admin/*`, eigene SPA (`admin-frontend/` oder Route-Bereich im Frontend mit separatem Guard).
Mandanten-Status (`ACTIVE/TRIAL/SUSPENDED`) und Plan-Zuordnung am `Company`-Modell vorsehen; die
App-Auth muss gesperrte Mandanten ablehnen. Sinnvoll nach Block 3, spätestens vor dem ersten
zahlenden Kunden.

## Empfohlene Reihenfolge

1. ~~Firmenprofil & Konto~~ ✅
2. ~~Kontakte & Stammdaten~~ ✅
3. Projekte (inkl. Berichte von Anfang an)
4. Angebote (inkl. GAEB)
5. Rechnungen (inkl. § 13b, Mahnwesen) — Datenmodell von Anfang an EN16931-kompatibel
6. Eingangsrechnungen
7. E-Rechnung-Export (XRechnung/ZUGFeRD) + GoBD/DSGVO-Feinschliff + Steuerprüfer-Export
8. Plattform-Admin / Betreiber-Backoffice (Abonnenten, Abrechnung) — Zeitpunkt flexibel, spätestens
   vor dem ersten zahlenden Kunden

**Why diese Reihenfolge:** Jeder Block baut auf dem vorherigen auf (Artikelstamm → Angebot →
Rechnung). E-Rechnung zuletzt, aber mit Vorwirkung auf das Rechnungsschema in Block 5, damit keine
nachträgliche Migration/Datenverlust-Gefahr entsteht.
