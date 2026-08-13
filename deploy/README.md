# Betrieb

Was außerhalb der Container liegt: Server, Reverse Proxy, TLS, Backups. Der
Stack selbst steht in
[`hauskreis-backend/docker-compose.prod.yml`](../hauskreis-backend/docker-compose.prod.yml).

Drei Namen, eine Domain:

| Name            | Wohin                                    |
| --------------- | ---------------------------------------- |
| `acts2.de`      | Cloudflare Pages (Frontend)              |
| `api.acts2.de`  | VPS, nginx → `127.0.0.1:3000`            |
| `auth.acts2.de` | VPS, nginx → `127.0.0.1:8080` (Keycloak) |

Die App heißt **Acts2**. „Hauskreis" ist im Code und in der Oberfläche weiterhin
der Fachbegriff für die Gruppe selbst — man gründet einen Hauskreis in Acts2,
nicht einen Acts2.

## Eine Instanz, kein Load Balancing

Die Cron-Jobs laufen in-process (`@nestjs/schedule`), ohne Leader-Election. Mit
zwei API-Containern erzeugt der Terminegenerator jeden Abend doppelt und die
Gebetsbuddy-Rotation ebenfalls. nginx ist hier **Reverse Proxy und
TLS-Terminierung**, nicht Lastverteilung — für neun Leute ist eine Instanz
richtig, aber es muss dastehen, bevor jemand `--scale api=2` tippt.

## DNS: api und auth bleiben grau

Beide Namen zeigen **direkt** auf den VPS (bei Cloudflare: Proxy aus, graue
Wolke). Nur das Frontend liegt hinter Cloudflare.

Der Grund ist keine Vorsicht im Allgemeinen, sondern ein konkreter Mechanismus.
Der `ETag` dieser API ist kein Inhalts-Hash, sondern eine Versionsnummer:
`W/"7"`, gelesen von `parseEtagVersion` in
[`etag.ts`](../hauskreis-backend/src/common/http/etag.ts). Jedes `PATCH` schickt
sie als `If-Match` zurück, und daraus wird eine `WHERE version IN (…)` im
`UPDATE` — das ist das ganze Optimistic Locking.

Ob der Wert stark oder schwach ausgezeichnet ist, ist der App dabei egal;
`parseEtagVersion` nimmt `W/"7"` und `"7"` gleichermaßen. Was sie **nicht**
übersteht, ist ein Zwischenstück, das den ETag durch einen **eigenen** ersetzt —
und genau das tun CDNs, wenn sie eine Antwort am Rand umschreiben. Aus `W/"7"`
würde ein Inhalts-Hash, `parseEtagVersion` erkennt ihn nicht wieder, die
Versionsliste bleibt leer, und jeder Schreibvorgang endet in `412`. Das fiele
nicht beim Deploy auf, sondern beim ersten Mal, wenn jemand einen Termin
bearbeitet.

Dem steht nichts gegenüber: Hinter dieser API liegt nichts Cachebares — jede
Antwort ist angemeldet und personenbezogen. Was ein Proxy brächte (versteckte
IP, WAF), wiegt diese Fehlerklasse für eine Gruppe von neun nicht auf.

## Ohne eigene Domain

Das Frontend braucht keine: Cloudflare Pages gibt jedem Projekt eine feste
Adresse `<projektname>.pages.dev`, mit gültigem Zertifikat, und die bleibt auch
gültig, wenn später eine eigene Domain dazukommt.

**Das Backend braucht eine.** Nicht aus Ordnungsliebe, sondern weil sonst nichts
zusammenpasst:

- Die Seite läuft auf `https://…pages.dev`. Ein `fetch` von dort auf
  `http://<ip>:3000` blockiert der Browser als Mixed Content — nicht als
  Warnung, sondern ersatzlos.
- Also braucht die API HTTPS, also ein Zertifikat, und Let's Encrypt stellt
  keines auf eine nackte IP-Adresse aus, das sich hier praktisch nutzen ließe.
- Keycloak hängt mit dran: `KEYCLOAK_URL` wird zum Issuer und steht in jedem
  Token. Ein `http://`-Issuer bedeutet, dass der Token-Tausch über HTTP liefe —
  von einer HTTPS-Seite aus wieder Mixed Content.

Zwei Wege, und beide funktionieren heute:

**Eine Domain kaufen.** Fünf bis fünfzehn Euro im Jahr, bei Cloudflare direkt
zum Einkaufspreis. Das ist die Antwort, wenn die App wirklich benutzt werden
soll — sie räumt diese ganze Sektion ersatzlos ab.

**Bis dahin: `sslip.io`.** Ein öffentlicher DNS-Dienst, der jede IP im Namen
zurückgibt. Nichts zu registrieren, nichts zu bezahlen, und beliebige Präfixe
funktionieren:

```
203-0-113-9.sslip.io       → 203.0.113.9
api.203-0-113-9.sslip.io   → 203.0.113.9
auth.203-0-113-9.sslip.io  → 203.0.113.9
```

Damit sind `api.<ip-mit-bindestrichen>.sslip.io` und `auth.…` echte Hostnamen,
für die Let's Encrypt per HTTP-01 ein Zertifikat ausstellt. Der Rest dieser
Anleitung bleibt Wort für Wort gleich, nur die Namen sehen hässlich aus.

Zwei Dinge dazu, bevor du dich darauf verlässt:

- Scheitert `certbot` mit einer Rate-Limit-Meldung, liegt es daran, dass
  Let's Encrypt `sslip.io` als eine einzige Domain zählt und andere sie schon
  ausgereizt haben. Dann bleibt nur eine eigene Domain (oder DuckDNS).
- **Der Umstieg auf die eigene Domain ist kein reines Umbenennen.** `KEYCLOAK_URL`
  steckt als Issuer in jeder ausgestellten Sitzung; nach dem Wechsel müssen sich
  alle neu anmelden. Solange das nur du bist, ist es ein Klick — deshalb lohnt es
  sich, die Domain **vor** dem Einladen der anderen acht zu haben.

---

## Erstinstallation

Die Reihenfolge ist nicht beliebig. Das Frontend wird mit der API-Adresse
**gebacken** (die drei `NEXT_PUBLIC_*` sind Bauzeit-Werte), und die API muss die
Frontend-Adresse kennen, bevor der Browser sie anspricht. Deshalb zuerst beide
Namen festlegen, dann bauen.

### 0. Namen festlegen

Drei Zeilen aufschreiben und bis zum Schluss nicht mehr ändern:

```
Frontend    acts2.de          (Cloudflare Pages, eigene Domain auf dem Projekt)
API         api.acts2.de      → VPS
Keycloak    auth.acts2.de     → VPS
```

Das Frontend liegt auf der **Apex-Domain**, nicht auf `app.acts2.de`: Es ist
das, was man weitergibt, und `acts2.de` ist kürzer vorzulesen als alles mit
Punkt davor. `www.acts2.de` bei Cloudflare als Weiterleitung auf die Apex
anlegen — jemand tippt es, und ein Zertifikatsfehler wäre ein schlechter erster
Eindruck.

Bis die Domain auf dem Pages-Projekt liegt, ist die App zusätzlich unter
`<projektname>.pages.dev` erreichbar; diese Adresse bleibt auch danach gültig.
Sie gehört aber **nicht** in `CORS_ORIGINS` — eine zweite Origin heißt zwei
Redirect-URIs in Keycloak und zwei Wege, auf denen sich etwas auseinander
entwickeln kann.

Hast du noch keine Domain, siehe [oben](#ohne-eigene-domain).

### 1. Image bauen lassen

Der Server baut nicht selbst, er zieht nur — also muss das Image existieren,
bevor er startet.

```bash
git push origin main
```

Der Workflow
[`backend.yml`](../.github/workflows/backend.yml) baut und legt das Ergebnis als
`ghcr.io/niko1405/hauskreis-backend:latest` ab (plus einen Tag mit der
Commit-Sha). Unter **Actions** zusehen; beim ersten Mal dauert es ein paar
Minuten, danach greift der Cache.

Danach unter **Repo → Packages → hauskreis-backend → Package settings**
entscheiden:

- **Public** — der Server zieht ohne Anmeldung. Für ein Image ohne Zugangsdaten
  darin ist das in Ordnung, und es spart einen Token auf dem VPS.
- **Private** — dann braucht der Server ein Personal Access Token mit
  `read:packages` (siehe Schritt 3).

### 2. Server härten und Docker installieren

```bash
# Docker aus dem offiziellen Repository — die Debian/Ubuntu-Pakete `docker.io`
# und `docker-compose` sind meist zu alt für `docker compose` als Unterbefehl.
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"     # danach einmal ab- und wieder anmelden
docker compose version              # muss v2 melden

# SSH: nur Schlüssel
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/'               /etc/ssh/sshd_config
sudo systemctl restart ssh          # vorher in einer zweiten Sitzung anmelden können!

sudo apt install -y fail2ban unattended-upgrades
sudo systemctl enable --now fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades

sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow 22,80,443/tcp && sudo ufw enable
```

Für Keycloaks Anmeldeseite braucht es **kein** eigenes fail2ban-Jail: Keycloak
bringt eine Brute-Force-Erkennung mit, die `setup-keycloak.sh` einschaltet, und
die zählt pro Konto statt pro IP — besser als alles, was sich aus Logzeilen
ablesen ließe.

> **Die Falle, die hier nicht zuschnappt.** Docker schreibt für veröffentlichte
> Ports eigene iptables-Regeln und geht dabei an ufw vorbei. Weil im Prod-Compose
> jeder `ports:`-Eintrag an `127.0.0.1` hängt, ist das folgenlos. Wer dort je ein
> `- '5432:5432'` schreibt, hat die Datenbank offen im Internet — und `ufw status`
> zeigt weiterhin „deny incoming".

### 3. Stack ablegen

```bash
sudo mkdir -p /srv/acts2 && sudo chown "$USER" /srv/acts2
git clone https://github.com/niko1405/hauskreis-app.git /srv/acts2
cd /srv/acts2/hauskreis-backend

cp .env.prod.example .env.prod
chmod 600 .env.prod
$EDITOR .env.prod          # jede leere Zeile füllen, Passwörter mit `openssl rand -base64 32`
```

Ist das GitHub-Repository privat, braucht der Server einmalig Zugang zur
Registry — ein Token mit `read:packages` genügt:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u niko1405 --password-stdin
```

### 4. Starten

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Erwartet: `migrate` steht auf `exited (0)`, `api` nach etwa zwanzig Sekunden auf
`healthy`. Die Datenbank ist dabei leer und bleibt es — `SEED_ENABLED` steht
fest auf `false`.

### 5. nginx und TLS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

sudo cp /srv/acts2/deploy/nginx/api.conf  /etc/nginx/sites-available/acts2-api
sudo cp /srv/acts2/deploy/nginx/auth.conf /etc/nginx/sites-available/acts2-auth
sudo ln -s /etc/nginx/sites-available/acts2-api  /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/acts2-auth /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d api.acts2.de -d auth.acts2.de
sudo certbot renew --dry-run
```

`certbot` schreibt den TLS-Teil und die Weiterleitung von 80 nach 443 selbst in
die vhosts. HSTS danach von Hand ergänzen, wenn die Zertifikate stehen — vorher
sperrt man sich damit aus, falls etwas schiefgeht.

### 6. Keycloak einrichten

**Vom eigenen Rechner aus, nicht auf dem Server.** Das Skript spricht
`${KEYCLOAK_URL}/realms/master/…` an, also die öffentliche Adresse; das setzt
fertiges DNS und ein gültiges Zertifikat voraus.

```bash
cd hauskreis-backend
set -a && source /pfad/zur/.env.prod && set +a
./scripts/setup-keycloak.sh --production
```

Es bricht ab, solange `SMTP_HOST`, `SMTP_FROM`, `KEYCLOAK_URL`, `FRONTEND_URL`,
`KEYCLOAK_CLIENT_SECRET` oder `KEYCLOAK_ADMIN_PASSWORD` noch auf einer
Entwicklungsvorgabe stehen. Das ist Absicht: Der Realm verlangt eine bestätigte
E-Mail-Adresse, und ohne funktionierenden Mailversand kommt **niemand** herein,
auch der Gründer nicht.

Danach in der Admin-Konsole (`https://auth.acts2.de/admin`):

1. Ein **persönliches** Admin-Konto anlegen, im `master`-Realm, mit **OTP**.
2. Das Bootstrap-Konto aus `KEYCLOAK_ADMIN_USER` deaktivieren.
3. `KEYCLOAK_ADMIN_USER` und `KEYCLOAK_ADMIN_PASSWORD` aus `.env.prod` löschen —
   sie wirken ohnehin nur beim allerersten Start auf leerer Datenbank, und was
   danach bleibt, ist ein Passwort, das niemand mehr wechselt.
4. Im `master`-Realm die Brute-Force-Erkennung einschalten. Im `hauskreis`-Realm
   hat das Skript sie schon gesetzt.

### 7. Frontend bei Cloudflare Pages

| Einstellung      | Wert                 |
| ---------------- | -------------------- |
| Root directory   | `hauskreis-frontend` |
| Build command    | `pnpm build`         |
| Output directory | `out`                |

`pnpm build`, nicht `next build`: Im Skript steckt `--webpack`, und das ist nicht
optional — `@serwist/next` arbeitet nur mit webpack, Next 16 baut sonst mit
Turbopack und bricht ab, sobald eine webpack-Konfiguration vorliegt.

Drei Variablen unter Settings → Environment Variables, **vor** dem ersten Build:

```
NEXT_PUBLIC_API_BASE_URL    https://api.acts2.de/api
NEXT_PUBLIC_OIDC_AUTHORITY  https://auth.acts2.de/realms/hauskreis
NEXT_PUBLIC_OIDC_CLIENT_ID  hauskreis-app
```

Das `/api` gehört mit hinein. Fehlt eine Variable, greifen die Vorgaben im Code,
und die zeigen auf `localhost` — kein Fehler beim Bauen, kein Fehler beim Laden,
nur eine App, die nichts anzeigt.

**Preview-Deployments abschalten.** Jede Vorschau bekommt eine eigene
`*.pages.dev`-Adresse, die weder in `CORS_ORIGINS` noch in Keycloaks
`webOrigins` steht. Man kann sich dort nicht anmelden, und bis man versteht,
warum, ist der Abend vorbei.

Danach unter **Custom domains** `acts2.de` hinzufügen. Cloudflare legt den
DNS-Eintrag selbst an und stellt das Zertifikat aus; die Apex-Domain darf dabei
ruhig durch den Proxy laufen (orange), das ist ausgeliefertes Statisches und
genau der Fall, für den ein CDN gedacht ist — anders als bei `api.` und `auth.`,
[siehe oben](#dns-api-und-auth-bleiben-grau).

`www.acts2.de` als Weiterleitung auf die Apex anlegen (Redirect Rule,
`https://acts2.de/$1`). Jemand tippt es, und ein Zertifikatsfehler wäre ein
schlechter erster Eindruck.

### 8. Der erste Mensch

Es gibt kein Bootstrap-Skript. Der Weg hinein ist derselbe, den alle gehen:

1. Auf der Keycloak-Anmeldeseite **registrieren**.
2. Die Bestätigungsmail anklicken — ohne bestätigte Adresse weist der `AuthGuard`
   jedes Token ab.
3. In der App auf **„Hauskreis gründen"** — die gründende Person wird
   automatisch Admin.
4. Von dort die anderen acht einladen.

### 9. Backups scharf schalten

```bash
sudo cp /srv/acts2/deploy/acts2-backup.{service,timer} /etc/systemd/system/
sudo tee /etc/acts2-backup.env >/dev/null <<'EOF'
RCLONE_REMOTE=r2:acts2-backups
AGE_RECIPIENT=age1...
EOF
sudo chmod 600 /etc/acts2-backup.env
sudo systemctl daemon-reload
sudo systemctl enable --now acts2-backup.timer
sudo systemctl start acts2-backup.service   # einmal sofort
journalctl -u acts2-backup -n 30
```

Ohne `AGE_RECIPIENT` lädt das Skript **nichts** hoch, auch wenn ein Remote
gesetzt ist. In den Dumps stehen Namen, E-Mail-Adressen, Geburtsdaten und
Gebetsanliegen von neun realen Menschen; lieber gar kein Off-Site als ein
offenes.

Dazu die Snapshots des VPS-Anbieters als zweite, unabhängige Ebene: die retten
den ganzen Server, die Dumps retten die Daten.

### 10. Erreichbarkeit beobachten

Ein externer Monitor auf `https://api.acts2.de/api/health` (öffentlich,
macht eine echte Datenbankabfrage, antwortet `{"status":"ok","database":"up"}`).
Intervall mindestens eine Minute — der Throttler erlaubt 300 pro Minute, und der
Endpunkt kostet jedes Mal eine Abfrage.

---

## Im Alltag

### Deploy

```bash
cd /srv/acts2 && git pull
cd hauskreis-backend
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker image prune -f
```

Der Server baut nichts — das Image kommt fertig aus der CI. `git pull` ist nur
für Compose-Datei und Skripte nötig. Der `migrate`-Service läuft bei jedem `up`
vorweg und wartet, bis Postgres gesund ist; die API startet erst danach.

Rollback auf einen früheren Stand:

```bash
IMAGE_TAG=<commit-sha> docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Zu jedem Build legt die CI einen sha-Tag ab. **Migrationen gehen dabei nicht
zurück** — ein Rollback über eine Schemaänderung hinweg braucht das Backup.

Das Frontend deployt Cloudflare selbst, bei jedem Push nach `main`.

### In die Datenbank sehen

Kein pgAdmin. Postgres hängt an `127.0.0.1:5432` und ist von außen nicht
erreichbar; der Weg hinein ist ein Tunnel:

```bash
ssh -N -L 5433:127.0.0.1:5432 niko@vps      # läuft im Vordergrund

psql postgresql://hauskreis@localhost:5433/hauskreis
# oder, schöner, weil es das Schema kennt:
DATABASE_URL='postgresql://hauskreis:…@localhost:5433/hauskreis' pnpm prisma studio
# oder DBeaver / TablePlus auf localhost:5433
```

**Wichtiger als das Werkzeug ist, wann man es nicht nimmt.** Drei Regeln des
Datenmodells stehen nicht in der Datenbank, sondern im Code darüber:

| Vorhaben           | Warum nicht per SQL                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Person entfernen   | Heißt hier **anonymisieren**, nicht löschen. Ein `DELETE` nähme Gastgeber-Zuschreibung und Anwesenheiten mit — das Archiv wäre danach nicht anonym, sondern löchrig. In der App: **Verwaltung → Personen**              |
| Konto entfernen    | `person` und der Keycloak-Benutzer sind zwei Wahrheiten. Der Endpunkt räumt beide ab; ein SQL-`DELETE` lässt den Keycloak-Benutzer verwaist zurück, und derselbe Mensch kann sich danach nicht mehr sauber neu anmelden |
| Irgendetwas ändern | Die App fährt Optimistic Locking über `ETag`/`If-Match`. Ein Schreibvorgang an ihr vorbei fällt keinem offenen Client auf                                                                                               |

Für „Termin löschen", „Reminder-Lauf anstoßen", „Gewichtung ändern" gibt es den
**Verwaltungs-Bildschirm** in der App. Der Tunnel ist zum Nachsehen da.

### Restore

```bash
cd /srv/acts2/hauskreis-backend
BACKUP=/var/backups/acts2/2026-08-13T02-30-11Z

docker compose -f docker-compose.prod.yml --env-file .env.prod down
docker volume rm hauskreis-backend_postgres-data \
                 hauskreis-backend_keycloak-db-data \
                 hauskreis-backend_uploads
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d postgres keycloak-db
sleep 15

docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T postgres pg_restore -U hauskreis -d hauskreis --clean --if-exists < "$BACKUP/hauskreis.dump"
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T keycloak-db pg_restore -U keycloak -d keycloak --clean --if-exists < "$BACKUP/keycloak.dump"

docker run --rm -v hauskreis-backend_uploads:/ziel -v "$BACKUP":/quelle:ro \
  alpine:3 tar xzf /quelle/uploads.tgz -C /ziel

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

**Das wird einmal wirklich durchgespielt, bevor die Gruppe die App benutzt.**
Danach anmelden und ein Profilbild ansehen — die Bilder liegen im Volume, ihre
Zeitstempel in der Datenbank, und ob beides zusammenpasst, zeigt sich nur hier.
Ein Backup, das nie zurückgespielt wurde, ist eine Vermutung.

### Aktualisieren

`postgres` und `keycloak` hängen an festen Tags. Ein `docker compose pull` holt
sie **nicht** von selbst auf eine neue Hauptversion — das ist gewollt:

- **Keycloak** migriert seine Datenbank beim Start, und zwar in eine Richtung.
  Vor jedem Versionswechsel `keycloak.dump` frisch ziehen; ohne ihn gibt es kein
  Zurück.
- **Postgres** startet gar nicht erst, wenn das Datenverzeichnis von einer
  älteren Hauptversion stammt. Ein Wechsel von 17 auf 18 ist Dump und Restore,
  kein `pull`.

Für beides gilt: Release Notes lesen, Backup ziehen, dann den Tag im Compose
ändern.

### Wenn etwas klemmt

| Symptom                                      | Zuerst nachsehen                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Jede Anfrage `401`                           | Stimmt `KEYCLOAK_URL` exakt mit `server_name` in `auth.conf` und mit `NEXT_PUBLIC_OIDC_AUTHORITY` überein? Daraus wird der Issuer                                  |
| Anmeldung endet in `invalid_redirect_uri`    | `FRONTEND_URL` beim Setup-Lauf ≠ Cloudflare-Domain. `setup-keycloak.sh --production` erneut laufen lassen, es zieht die URI jetzt auch an bestehenden Clients nach |
| Jedes Speichern gibt `412`                   | Steht ein CDN vor der API und ersetzt den `ETag` durch einen eigenen? Er muss `W/"<zahl>"` bleiben                                                                 |
| Bild-Upload gibt `500`                       | `docker compose exec api ls -ld /data/uploads` — muss `node` gehören, nicht `root`                                                                                 |
| Erinnerungen kommen zur falschen Stunde      | `CRON_TIME_ZONE` in `src/common/time/local-evening.ts`                                                                                                             |
| `413 Request Entity Too Large` beim Kopfbild | `client_max_body_size` in `api.conf` (10 MB erlaubt die App, 12 MB steht dort)                                                                                     |
| Platte voll                                  | `docker system df`. Alte Images (`docker image prune -f`) oder Logs — die Rotation steht im Compose                                                                |
