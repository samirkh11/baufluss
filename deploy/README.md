# Deployment auf der Synology Diskstation (Demo / Prototyp)

Alles läuft in Docker: **postgres** (Datenbank), **backend** (API) und **web** (Frontend + nginx, leitet `/api/` an das Backend).
Die Images baut GitHub Actions und legt sie in der GitHub Container Registry ab; die Diskstation holt sie von dort.

```
Internet ──443──▶ Synology Reverse Proxy (HTTPS, Zertifikat) ──▶ web:8085 ──▶ backend ──▶ postgres
```

## Einmalig: GitHub

1. Im Repository unter **Actions** den Workflow *Build and publish images* starten (**Run workflow**) – oder einfach nach `master` pushen.
   Danach gibt es unter *Packages* die Images `meisterwerk-backend` und `meisterwerk-web` (privat).
2. Zugriffstoken für die NAS anlegen: GitHub → *Settings → Developer settings → Personal access tokens (classic)* →
   Scope **`read:packages`** → Token kopieren (wird nur einmal angezeigt; nicht in Chats/Mails teilen).

## Einmalig: Diskstation

Voraussetzungen: DSM 7.2 oder neuer, Paket **Container Manager** installiert, SSH vorübergehend aktiviert
(Systemsteuerung → Terminal & SNMP).

1. Per SSH anmelden und bei der Registry einloggen (als root, damit auch Watchtower die Zugangsdaten findet):
   ```
   sudo -i
   docker login ghcr.io -u <github-benutzername>     # Passwort = das Token von oben
   ```
2. Ordner anlegen und die Dateien aus diesem Verzeichnis (`deploy/`) hineinkopieren (File Station genügt), z. B. nach
   `/volume1/docker/meisterwerk/`: `docker-compose.yml`, `.env.example`, `backup.sh`.
3. `.env.example` nach `.env` kopieren und ausfüllen:
   - `IMAGE_PREFIX` (Benutzername in Kleinbuchstaben), `PUBLIC_URL` (z. B. `https://demo.deine-domain.de`)
   - `POSTGRES_PASSWORD` und `JWT_SECRET`: je mit `openssl rand -hex 24` erzeugen
   - `SEED_PASSWORD` / `SEED_ADMIN_PASSWORD`: eigene Passwörter für die Demo-Zugänge (nicht die Entwicklungs-Standardpasswörter!)
4. Stack starten:
   ```
   cd /volume1/docker/meisterwerk && docker compose up -d
   ```
   (oder in Container Manager → Projekt → Erstellen → Pfad wählen, die vorhandene `docker-compose.yml` verwenden)
5. Demo-Daten laden (legt Mandanten, Belege, Betreiber-Zugang an; kann beliebig oft wiederholt werden, es werden nur die Demo-Mandanten ersetzt):
   ```
   docker compose --profile tools run --rm seed
   ```

## Erreichbarkeit von außen

1. **DNS:** Bei der temporären Domain einen A-Record (z. B. `demo`) auf die feste IP-Adresse des Anschlusses setzen.
2. **Router:** Port **443** (und **80** für die Zertifikatsausstellung) auf die IP der Diskstation weiterleiten.
3. **Reverse Proxy** (DSM → Systemsteuerung → Anmeldeportal → Erweitert → Reverse Proxy → Erstellen):
   Quelle `HTTPS`, Hostname `demo.deine-domain.de`, Port 443 → Ziel `HTTP`, `localhost`, Port `8085`.
4. **Zertifikat:** Systemsteuerung → Sicherheit → Zertifikat → Hinzufügen → *Let's Encrypt* für `demo.deine-domain.de`,
   danach im Reverse-Proxy-Dialog zuweisen (Zertifikat → Konfigurieren).
5. Test: `https://demo.deine-domain.de` (Kunden-App) und `https://demo.deine-domain.de/admin` (Betreiber-Backoffice).

Nach der Vorstellung: Portweiterleitungen im Router wieder entfernen (oder den Reverse-Proxy-Eintrag deaktivieren).

## Aktualisieren („Deploy auf Knopfdruck")

1. Änderungen nach `master` pushen (oder in GitHub **Run workflow**). Die Action testet und baut neue Images.
2. Auf der Diskstation entweder
   - manuell: Container Manager → Projekt `meisterwerk` → *Aktion → Erstellen/Neu erstellen* (zieht die neuesten Images), oder per SSH
     `docker compose pull && docker compose up -d`, oder
   - automatisch: `docker compose --profile autoupdate up -d` startet Watchtower, das alle 5 Minuten nach neuen Images sucht und die Container neu startet.
3. Datenbankmigrationen laufen beim Start des Backends automatisch (`prisma migrate deploy`). Die Daten bleiben in den Volumes erhalten.

## Datensicherung

`./backup.sh` sichert Datenbank (`pg_dump`) sowie die Volumes `storage` (GoBD-Archiv, Eingangsrechnungen) und `uploads` nach `./backups`.
Als Aufgabe im DSM-Aufgabenplaner täglich einrichten. Für mehr als eine Vorführung: den Ordner zusätzlich per Hyper Backup sichern.

## Fehlersuche

- Logs: `docker compose logs -f backend` (bzw. `web`, `postgres`)
- Backend startet nicht: stimmen `POSTGRES_PASSWORD` und `JWT_SECRET` in `.env`? (Passwort der Datenbank nachträglich ändern geht nur über die Datenbank selbst.)
- „502 Bad Gateway": Backend läuft noch nicht (erster Start dauert ~30–60 s wegen der Migrationen) – `docker compose ps`.
- Login nach dem Seed nicht möglich: wurden `SEED_PASSWORD` / `SEED_ADMIN_PASSWORD` nach dem Seed geändert? Seed erneut ausführen.
- Swagger/API-Doku ist von außen absichtlich gesperrt.
