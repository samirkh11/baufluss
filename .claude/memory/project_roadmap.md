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
(Owner/Admin/Member). Backend: `companies/`, `users/`, `auth/`. Frontend:
`CompanyProfilePage`, `UsersPage`.

### ⬜ Block 2 — Kontakte und Stammdaten
Kunden, Lieferanten, Subunternehmer, Leistungs- und Artikelstamm.
**Empfehlung für die Umsetzung:** Ein gemeinsames `Contact`-Modell mit einem Typ-Feld
(`CUSTOMER` | `SUPPLIER` | `SUBCONTRACTOR`) spart Code-Duplizierung, da Adress-/Kontaktfelder
identisch sind. Artikelstamm (`Article`: Bezeichnung, Einheit, Preis, Steuersatz) ist ein
separates Modell, wird aber von Block 4 (Angebote) direkt referenziert — deshalb sollte Block 2
vor Block 4 kommen.

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

## Empfohlene Reihenfolge

1. ~~Firmenprofil & Konto~~ ✅
2. Kontakte & Stammdaten (Grundlage für alles Folgende)
3. Projekte (inkl. Berichte von Anfang an)
4. Angebote (inkl. GAEB)
5. Rechnungen (inkl. § 13b, Mahnwesen) — Datenmodell von Anfang an EN16931-kompatibel
6. Eingangsrechnungen
7. E-Rechnung-Export (XRechnung/ZUGFeRD) + GoBD/DSGVO-Feinschliff + Steuerprüfer-Export

**Why diese Reihenfolge:** Jeder Block baut auf dem vorherigen auf (Artikelstamm → Angebot →
Rechnung). E-Rechnung zuletzt, aber mit Vorwirkung auf das Rechnungsschema in Block 5, damit keine
nachträgliche Migration/Datenverlust-Gefahr entsteht.
