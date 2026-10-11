---
name: project-compliance
description: Meisterwerk – GoBD, DSGVO, XRechnung/ZUGFeRD, GAEB, § 13b – rechtliche Eckpunkte
metadata:
  type: project
---

Sammlung der rechtlichen/fachlichen Anforderungen, die beim Bauen der Dokument-Module (Blöcke
4–7, siehe [[project_roadmap]]) zu beachten sind. Kein Ersatz für Steuerberater-/Rechtsberatung,
aber die Punkte, die das Datenmodell und die Workflows von Anfang an berücksichtigen sollten.

## GoBD (Grundsätze zur ordnungsmäßigen Führung und Aufbewahrung von Büchern)

- **Unveränderbarkeit:** Einmal gestellte Rechnungen dürfen nicht mehr editiert werden — nur
  stornieren (Storno-Beleg) und neu erstellen. Das Invoice-Modul braucht einen Status
  `FINALIZED`/`SENT`, nach dem Felder gesperrt sind.
- **Nummernkreise müssen lückenlos sein** — passt zur bereits in V1 angelegten
  `NumberSequence`-Konfiguration (Block 1), die Zähler-Logik (atomar inkrementieren beim
  Finalisieren eines Dokuments) kommt erst in Block 4/5.
- **Verfahrensdokumentation & Protokollierung:** Änderungen an rechnungsrelevanten Daten sollten
  nachvollziehbar sein (Audit-Log). Noch nicht umgesetzt — als eigener Punkt in Block 5/7 planen.
- **Aufbewahrungsfrist:** 10 Jahre für Rechnungen — relevant für Backup-/Löschkonzept, nicht nur
  für die App selbst.

## DSGVO

- Auftragsverarbeitungsvertrag (AVV) nötig, sobald ein Hosting-/Cloud-Anbieter feststeht.
- Löschkonzept für Kontakte (Block 2) — Kundendaten dürfen nicht unbegrenzt gespeichert werden,
  wenn kein berechtigtes Interesse (laufende Verträge, gesetzliche Aufbewahrungsfristen) mehr
  besteht.
- Keine Mandanten-übergreifende Datenverarbeitung — passt zur Multi-Tenancy-Isolation in
  [[project_architecture]].

## Rechnungsstellung (umgesetzt in Block 5, Teil 1)

Pflichtangaben § 14 Abs. 4 UStG werden vor dem Ausstellen geprüft (siehe `invoice-validation.ts` und
[[project_roadmap]]): Anschrift beider Seiten, Steuernummer/USt-IdNr., Datum, lückenlose Nummer,
Leistung (Positionen), Leistungszeitraum, Entgelt je Steuersatz + Steuerbetrag bzw. Hinweis. Bei
Privatkunden wird der Aufbewahrungshinweis (§ 14b UStG) gedruckt. NOCH NICHT abgedeckt:
Abschlagsrechnungen (§ 14 Abs. 5), Kleinunternehmer (§ 19), Skonto, § 35a-Ausweis, Storno.
Unveränderbarkeit: ausgestellte Dokumente sind gesperrt, Absenderdaten eingefroren
(`issuerSnapshot`); eine echte Archivierung des PDF/der XRechnung folgt mit Block 7.

## § 13b UStG (Steuerschuldnerschaft des Leistungsempfängers)

Bei Bauleistungen zwischen Unternehmen, die selbst Bauleistungen erbringen, wird die Rechnung
**ohne** Umsatzsteuer gestellt, mit Pflichthinweis "Steuerschuldnerschaft des
Leistungsempfängers". Sehr häufiger Fall im Handwerk (Subunternehmer-Ketten) — das
Rechnungs-Datenmodell (Block 5) braucht ein Flag `reverseCharge: boolean` plus den Pflichttext.

## E-Rechnung: XRechnung & ZUGFeRD

- **Rechtsgrundlage:** Ab 2025 gestufte E-Rechnungspflicht für B2B in Deutschland (Wachstumschancen-
  gesetz). Ab 2027 generelle Pflicht zum Ausstellen, ab 2028 auch für kleinere Unternehmen ohne
  Übergangsfristen — Status zum Zeitpunkt der Projekterstellung (2026-10-10), vor Umsetzung von
  Block 7 unbedingt aktuellen Rechtsstand prüfen.
- **ZUGFeRD** = PDF/A-3 mit eingebettetem XML (hybrides Format). **XRechnung** = reines XML
  (EN16931-Profil, in Deutschland für B2G vorgeschrieben).
- **Für die Umsetzung relevant:** PHP hat mit `horstoeko/zugferd` und `horstoeko/xrechnung` sehr
  ausgereifte, gepflegte Open-Source-Bibliotheken für Erzeugen UND Validieren. Node.js/TypeScript-
  Ökosystem ist hier spürbar dünner — das ist ein bewusster Trade-off der NestJS-Entscheidung
  (siehe [[project_architecture]]). Vor Block 7 konkret prüfen: entweder eine Node-Bibliothek
  reicht inzwischen aus, oder dieser eine Teil wird als separater Mini-Service in PHP oder über
  eine externe Validierungs-API (z.B. KoSIT-Validator) gelöst. Noch nicht final entschieden.
- **EN16931-Pflichtfelder** sollten schon beim Bau des Invoice-Schemas (Block 5) vollständig
  vorhanden sein (Leistungsdatum, Leitweg-ID für B2G, Zahlungsbedingungen strukturiert statt nur
  als Freitext, etc.), damit der Export in Block 7 keine Schema-Migration erfordert.

## GAEB (Block 4 — umgesetzt, Details in [[project_roadmap]])

Import/Export von GAEB DA XML 3.x ist umgesetzt (X83/X81 rein, X84 raus), eigene Implementierung
mit `fast-xml-parser` (kein brauchbares fertiges npm-Paket). Recherche-Stand: Aufbau
`GAEB/Award/BoQ/BoQBody → BoQCtgy(RNoPart) → BoQBody → Itemlist → Item(RNoPart; Qty, QU, UP, IT,
Description/CompleteText/DetailTxt+OutlineText)`, Namespace je Phase `…/DA83/3.3`. NICHT verifiziert
(kein Zugriff auf das offizielle XSD, keine echte Datei): Schreibweise der Alternativposition
(`ALNGroupNo/ALNSerNo` Element vs. Zuordnungszahl-Attribut), Werte von `Provis`, Reihenfolge der
Item-Kinder. Der Importer ist deshalb tolerant, der Export konservativ. Echte Dateien besorgen (z.B.
aus Ausschreibungsportalen) und die Tests damit erweitern. Offen: X86/X89, Zuschläge, Teilmengen,
`OWN`-Bieterdaten, GAEB 90.

## Export für den Steuerprüfer (Block 7)

Üblich ist ein DATEV-kompatibler Export oder ein GoBD-konformer "Z3"-Datenzugriff (maschinell
auswertbare Daten, z.B. CSV/XML mit definierter Struktur). Konkretes Format erst festlegen, wenn
Block 5 (Rechnungsdaten) steht.
