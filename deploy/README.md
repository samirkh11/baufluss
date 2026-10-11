# Deployment auf der Synology Diskstation (Demo / Prototyp)

Alles läuft in Docker: **postgres** (Datenbank), **backend** (API) und **web** (Frontend + nginx, leitet `/api/` an das Backend).
Die Images baut GitHub Actions und legt sie in der GitHub Container Registry ab; die Diskstation holt sie von dort.

```
Internet ──Port (z. B. 8085)──▶ web ──▶ backend ──▶ postgres        (optional davor: Synology Reverse Proxy mit HTTPS)
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

### Variante A: freier Port, ohne HTTPS (für die Vorführung empfohlen)

Wenn 80/443 schon belegt sind, brauchst du weder Reverse Proxy noch Zertifikat:

0. **Öffentliche IPv4-Adresse prüfen:** WAN-IP im Router mit der IP von `wieistmeineip.de` vergleichen. Sind sie verschieden (oder beginnt
   die Router-Adresse mit `100.64.`–`100.127.`, `10.`, `172.16.`, `192.168.`), steckt der Anschluss hinter CGNAT/DS-Lite – dann hilft keine
   Portfreigabe; Alternative: Cloudflare Tunnel oder Tailscale Funnel.
1. **DNS (dynamische IP):** DSM → Systemsteuerung → Externer Zugriff → DDNS → Hinzufügen, Anbieter *Synology*, Hostname z. B.
   `meisterwerk-demo.synology.me`. Die NAS hält den Eintrag selbst aktuell. Entweder diese Adresse direkt verwenden oder bei der
   temporären Domain einen **CNAME** `demo` → `meisterwerk-demo.synology.me` anlegen (CNAME nur für Subdomains).
   Router vor der Vorführung nicht neu starten (neue IP, DNS braucht einige Minuten).
2. **`.env`:** `WEB_PORT=8085` (Port auf der NAS) und `PUBLIC_URL=http://<ddns-oder-cname-name>:8085`.
3. **Router:** Einen freien externen Port (z. B. 8085) auf `NAS-IP:8085` weiterleiten. Der externe Port darf vom internen abweichen;
   in Firmen-/Gäste-Netzen kommen Ports wie 8080 oder 8443 oft eher durch.
4. Aufruf: `http://demo.deine-domain.de:8085` (Kunden-App) und `http://demo.deine-domain.de:8085/admin` (Betreiber-Backoffice).
5. Hinweis: Ohne HTTPS laufen Passwörter unverschlüsselt. Deshalb nur die eigenen Demo-Passwörter (`SEED_PASSWORD`, `SEED_ADMIN_PASSWORD`)
   benutzen und keine echten Zugangsdaten eintippen. Optional die Freigabe in Router/DSM-Firewall auf bekannte IP-Adressen beschränken.

Nach der Vorstellung: Portweiterleitung im Router wieder entfernen.

### Variante B: mit HTTPS über den Synology Reverse Proxy (nur wenn 443 frei ist)

1. DNS (DDNS) und Router-Freigabe wie oben, aber Port **443** (und **80** für die Zertifikatsausstellung) auf die NAS.
2. **Reverse Proxy** (DSM → Systemsteuerung → Anmeldeportal → Erweitert → Reverse Proxy → Erstellen):
   Quelle `HTTPS`, Hostname `demo.deine-domain.de`, Port 443 → Ziel `HTTP`, `localhost`, Port `8085`.
3. **Zertifikat:** Systemsteuerung → Sicherheit → Zertifikat → Hinzufügen → *Let's Encrypt* für `demo.deine-domain.de`,
   danach im Reverse-Proxy-Dialog zuweisen. `PUBLIC_URL` dann mit `https://`.

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
