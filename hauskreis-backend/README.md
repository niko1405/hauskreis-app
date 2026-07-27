# Hauskreis Backend

NestJS + Prisma + Keycloak Backend für die Hauskreis-App.
Fachlicher Kontext und Gesamtplan: siehe [`../CLAUDE.md`](../CLAUDE.md).

## Stack

| Bereich      | Wahl                                                 |
| ------------ | ---------------------------------------------------- |
| Framework    | NestJS 11 (Express)                                  |
| ORM          | Prisma 7 (mit `@prisma/adapter-pg`)                  |
| Datenbank    | PostgreSQL 17                                        |
| Auth         | Keycloak 26 (JWT-Verifizierung über JWKS mit `jose`) |
| Validierung  | Zod 4 über `nestjs-zod`, global registrierte Pipe    |
| Logging      | `nestjs-pino`                                        |
| Security     | `helmet`, `compression`, CORS                        |
| Jobs         | `@nestjs/schedule`                                   |
| Tests        | Jest + `@nestjs/testing`                             |
| Paketmanager | pnpm (via corepack)                                  |
| Lint/Format  | oxlint + Prettier                                    |

## Lokales Setup

```bash
corepack enable pnpm          # falls pnpm noch nicht verfügbar
pnpm install
cp .env.example .env          # Werte passen für das Docker-Compose-Setup
# für lokales Seeding zusätzlich SEED_ENABLED=true setzen

docker compose up -d          # Postgres + Keycloak (+ Keycloak-DB + Mailpit)
./scripts/setup-keycloak.sh   # Realm, Rollen, Client, SMTP, Test-User (idempotent)

pnpm db:migrate               # Schema anwenden
pnpm db:seed                  # Testdaten aus prisma/seed-data/*.csv

pnpm start:dev
```

| Dienst                           | URL                                         |
| -------------------------------- | ------------------------------------------- |
| API-Health                       | <http://localhost:3000/api/health>          |
| Keycloak-Admin                   | <http://localhost:8080> (`admin` / `admin`) |
| Mailpit (alle ausgehenden Mails) | <http://localhost:8025>                     |

### Test-Accounts

Vom Setup-Skript angelegt (Passwort jeweils `test1234`):

| User         | E-Mail             | Realm-Rolle |
| ------------ | ------------------ | ----------- |
| `testadmin`  | `niko@example.com` | `admin`     |
| `testmember` | `toni@example.com` | `member`    |

Die E-Mails entsprechen bewusst Zeilen aus `prisma/seed-data/person.csv`:
`GET /api/me` verknüpft Keycloak-Account und Person über die E-Mail, dadurch
landet man nach `pnpm db:seed` direkt auf einem echten Mitglied.

Access-Token holen:

```bash
curl -s -X POST http://localhost:8080/realms/hauskreis/protocol/openid-connect/token \
  -d client_id=hauskreis-backend -d client_secret=local-dev-secret \
  -d username=testadmin -d password=test1234 -d grant_type=password
```

## Wichtige Konventionen

- **Ein Feature = ein NestJS-Modul** (`src/<feature>/`), Abhängigkeiten explizit über `imports`/`exports`.
- **Rollen leben in Keycloak**, nicht in der Datenbank. `@Roles('admin')` + globaler `RolesGuard` erzwingen sie; `@Public()` öffnet einzelne Routen.
- **`person.keycloakUserId`** ist bewusst nullable: Admins können Personen anlegen, bevor diese sich je eingeloggt haben. Beim ersten `GET /api/me` wird per E-Mail-Match verknüpft.
- **Validierung ausschließlich über Zod-DTOs** (`createZodDto`). Die globale Pipe läuft mit `strictSchemaDeclaration`, meldet also Endpunkte, die versehentlich ohne Validierung arbeiten. Werte aus Custom-Decorators (`@CurrentUser()`, `@IfMatch()`) sind davon ausgenommen — siehe [`src/common/pipes/zod-validation.pipe.ts`](src/common/pipes/zod-validation.pipe.ts).
- **Schreibende Endpunkte auf versionierten Entitäten** gehen über `updateWithVersionCheck` und akzeptieren `If-Match` — siehe [Conditional Requests](#conditional-requests-etag-304-412).

## Conditional Requests (ETag, 304, 412)

### Lesen — funktioniert von allein

Express hasht den Response-Body, setzt einen `ETag` und beantwortet
`If-None-Match` selbst mit `304 Not Modified`. Dafür ist **kein Code nötig**,
auch nicht für neue Endpunkte.

```bash
curl -i .../locations            # -> 200 + ETag: W/"1ab-aawRnAM…"
curl -i -H 'If-None-Match: W/"1ab-aawRnAM…' .../locations   # -> 304
```

### Schreiben — Optimistic Locking

Was Express **nicht** tut: `If-Match` auswerten. Ohne das überschreiben sich zwei
Leute, die denselben Termin bearbeiten, gegenseitig lautlos (Lost Update).

Deshalb trägt jede veränderliche Entität eine `version`-Spalte, und ihr ETag ist
genau diese Version:

```bash
curl -i .../locations/<id>                  # -> ETag: W/"0"
curl -X PATCH -H 'If-Match: W/"0"' …        # -> 200, ETag: W/"1"
curl -X PATCH -H 'If-Match: W/"0"' …        # -> 412 Precondition Failed
curl -X PATCH …                             # -> 428 Precondition Required
```

| Fall                      | Antwort                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| Kein `If-Match`           | `428 Precondition Required`                                       |
| `If-Match` passt          | `200`, Version wird erhöht                                        |
| `If-Match` veraltet       | `412` — Datensatz bleibt unverändert                              |
| `If-Match: *`             | Schreibt durch, solange die Ressource existiert                   |
| `If-Match` unlesbar       | `412` (schlägt bewusst fehl statt stillschweigend zu akzeptieren) |
| Ressource existiert nicht | `404` (nicht `412`)                                               |

`If-Match` ist **Pflicht**, nicht optional. Ein optionaler Header schützt nur die
Aufrufer, die daran denken — ein vergessener Header würde verlorene Updates
unbemerkt wieder zulassen. Mit `428` wird das Weglassen zum sichtbaren Fehler.

Betroffen sind ausschließlich Änderungen an versionierten Entitäten. **Ohne**
`If-Match` funktionieren weiterhin:

- `POST` zum Anlegen — es gibt noch keine Version, gegen die man prüfen könnte
- `PUT …/meetings/:id/attendance` — idempotent, siehe unten

Das Frontend braucht dafür keinen Extra-Request: die Entitäten enthalten ihr
`version`-Feld auch in Listen-Antworten, der ETag lässt sich also als
`W/"<version>"` selbst bilden.

### Für neue Endpunkte

1. Entität im Prisma-Schema mit `version Int @default(0)` versehen.
2. Im Service **nicht** `update()` verwenden, sondern
   [`updateWithVersionCheck`](src/common/http/optimistic-update.ts).
3. Im Controller `@IfMatch() ifMatch?: IfMatchCondition` als Parameter ergänzen
   und durchreichen.

Den ETag setzt der globale
[`EtagInterceptor`](src/common/http/etag.interceptor.ts) automatisch, sobald der
Response-Body ein numerisches `version`-Feld hat — pro Endpunkt ist dafür nichts
zu tun.

Der Versionsvergleich passiert in der `WHERE`-Klausel des `UPDATE` selbst, nicht
als vorgelagerter Read. Nur so bleibt zwischen Prüfung und Schreiben kein Fenster,
in das sich ein zweiter Writer schieben kann.

**Bewusst ohne Versionierung:** `PUT …/meetings/:id/attendance`. Der Endpunkt
setzt den Teilnahmestatus _einer_ Person und ist idempotent — hier ist
Last-Write-Wins die richtige Semantik, ein Konflikt zwischen zwei Schreibern
existiert praktisch nicht.

## Push-Benachrichtigungen

Web Push (VAPID) über [`web-push`](https://www.npmjs.com/package/web-push).
Schlüsselpaar erzeugen und in die `.env` eintragen:

```bash
npx web-push generate-vapid-keys
```

**Ohne Schlüssel startet der Server normal** — Push ist dann deaktiviert und
wird einmal geloggt. Lokale Entwicklung und Tests brauchen also keine
Credentials.

| Methode  | Pfad                      | Zweck                                      |
| -------- | ------------------------- | ------------------------------------------ |
| `GET`    | `/api/push/public-key`    | VAPID-Key für `pushManager.subscribe()`    |
| `GET`    | `/api/push/subscriptions` | eigene registrierte Geräte                 |
| `POST`   | `/api/push/subscriptions` | Gerät registrieren                         |
| `DELETE` | `/api/push/subscriptions` | Gerät abmelden                             |
| `POST`   | `/api/push/test`          | Testbenachrichtigung an die eigenen Geräte |

Die Routen liegen bewusst außerhalb von `/hauskreise/:id` — eine Subscription
gehört zur eingeloggten Person, nicht zur Gruppe. `POST` nimmt das Objekt
entgegen, das `PushSubscription.toJSON()` im Browser liefert, und kann
unverändert durchgereicht werden.

### Warum ein Notification-Log

Reminder-Jobs laufen täglich und würden dieselbe Nachricht sonst jeden Tag
erneut schicken. `NotificationService.notify()` schreibt deshalb einen
Log-Eintrag pro (Person, Typ, Termin) und überspringt alles, was dort schon
steht. Der Eintrag entsteht **vor** dem Versand: stürzt der Prozess mitten drin
ab, kostet das eine ausgefallene Erinnerung statt einer täglichen Wiederholung.

### Umgang mit toten Endpoints

Antwortet der Push-Dienst mit `404`/`410`, ist die Subscription endgültig weg
(App deinstalliert, Browserdaten gelöscht) und wird entfernt. Jeder andere
Fehler gilt als möglicherweise vorübergehend — das Gerät bleibt erhalten und
wird beim nächsten Lauf erneut versucht. Das Ergebnis unterscheidet beides
explizit:

```json
{ "delivered": 2, "pruned": 1, "failed": 0 }
```

### Für kommende Reminder

`NotificationModule` importieren und `NotificationService` injizieren — **nicht**
direkt `web-push` verwenden. Nur so gelten Deduplizierung, Endpoint-Cleanup und
das Verhalten ohne VAPID-Keys überall gleich. Neue Anlässe brauchen einen
zusätzlichen Wert in `NotificationType`.

### Offen: was das Frontend noch beitragen muss

Der Weg vom Backend bis zum Push-Dienst ist verifiziert (Registrieren, Upsert,
Abmelden, Fehlerbehandlung). **Die Zustellung an ein echtes Gerät ist es nicht** —
dafür fehlen Bausteine, die es nur im Frontend gibt. Ohne die folgenden Punkte
kommt trotz funktionierendem Backend nichts an:

1. **HTTPS.** Die Notification-API braucht einen Secure Context. `localhost`
   gilt als sicher, jeder andere Host nicht — für Tests am Handy also ein
   Tunnel (ngrok/Cloudflare Tunnel) oder ein echtes Zertifikat.
2. **`manifest.json` mit `"display": "standalone"`.**
3. **Service Worker mit `push`-Handler.** Ohne registrierten Service Worker
   schlägt `pushManager.subscribe()` fehl. Im Handler zwingend
   `event.waitUntil(self.registration.showNotification(...))` — ohne das bricht
   der Browser die Subscription nach wenigen Nachrichten ab.
4. **`notificationclick`-Handler**, der das `url`-Feld aus dem Payload öffnet.
   Der Server schickt `{ title, body, url }` als JSON-String.
5. **`Notification.requestPermission()` nur auf Klick.** Automatisch beim Laden
   lehnen Browser dauerhaft ab — und eine einmal blockierte Erlaubnis lässt sich
   aus der App nicht zurückholen.
6. **VAPID-Key vor der Subscription holen.** `GET /api/push/public-key` liefert
   `{ publicKey, enabled }`; bei `enabled: false` den Button gar nicht erst
   anzeigen. Der Key muss für `applicationServerKey` von base64url in ein
   `Uint8Array` konvertiert werden.
7. **Ergebnis von `subscribe()` unverändert posten.** `subscription.toJSON()`
   passt 1:1 auf das DTO.
8. **iOS:** Push funktioniert erst nach „Zum Home-Bildschirm hinzufügen" — im
   normalen Safari-Tab ist die API deaktiviert, auch auf aktuellen Versionen.
9. **Re-Subscribe behandeln.** Browser rollieren Endpoints; bei
   `pushsubscriptionchange` oder abweichendem Endpoint beim App-Start erneut
   posten. Der Upsert auf `endpoint` macht das gefahrlos wiederholbar.

## Seeding

Die Seed-**Daten** liegen als CSV in [`prisma/seed-data/`](prisma/seed-data/) und werden
bewusst nicht in TypeScript gepflegt — sie lassen sich so ohne Codeänderung anpassen.
[`prisma/seed.ts`](prisma/seed.ts) liest, validiert (Zod, mit Zeilennummer im Fehler)
und upsertet sie nur.

Der Import ist doppelt abgesichert und bricht ab, wenn eine der Bedingungen fehlt:

- `SEED_ENABLED=true` muss in der `.env` gesetzt sein
- `NODE_ENV` darf **nicht** `production` sein

Neue Spalten/Dateien: CSV ergänzen und in `seed.ts` ein passendes Zod-Row-Schema
hinterlegen. `person.csv` referenziert den Hauskreis über die Spalte `hauskreisName`,
die zu einem Eintrag in `hauskreis.csv` passen muss.

## Code-Qualität

`oxlint` ersetzt ESLint (deutlich schneller, keine Plugin-Kette), Prettier bleibt für
die Formatierung zuständig. Konfiguration: [`.oxlintrc.json`](.oxlintrc.json).

Zwei bewusste Regel-Anpassungen:

- `typescript/no-extraneous-class` mit `allowWithDecorator` — NestJS-Module sind
  per Design leere dekorierte Klassen.
- `no-await-in-loop` aus für `prisma/**` und `scripts/**` — dort wird absichtlich
  sequenziell geschrieben.

```bash
pnpm check          # lint + format:check + tsc --noEmit + tests (das volle Gate)
```

Jest läuft mit `maxWorkers: 1`. Jeder Worker lädt sonst den kompletten generierten
Prisma-Client, was die Suite von ~4 s auf über 100 s aufbläht und zusätzlich die
Warnung „worker process has failed to exit gracefully" produziert. In Specs
deshalb `import type` verwenden, wo eine Klasse nur als Typ gebraucht wird.

## Skripte

```bash
pnpm start:dev      # Watch-Mode
pnpm build          # Kompiliert nach dist/ (Einstieg: dist/src/main.js)
pnpm test           # Unit-Tests
pnpm lint           # oxlint
pnpm lint:fix       # oxlint --fix
pnpm format         # Prettier schreiben
pnpm format:check   # Prettier prüfen
pnpm check          # alles zusammen
pnpm db:migrate     # prisma migrate dev
pnpm db:seed        # CSV-Testdaten (nur mit SEED_ENABLED=true)
```

## Abhängigkeiten & Sicherheit

`pnpm audit` muss sauber bleiben. Drei transitive Pakete brauchen aktuell
Patch-Overrides (in [`pnpm-workspace.yaml`](pnpm-workspace.yaml) begründet) —
nach Dependency-Upgrades prüfen, ob sie noch nötig sind.

Install-Skripte sind unter pnpm standardmäßig blockiert; erlaubt sind nur die
Prisma-Pakete und oxlints Resolver (`allowBuilds`).

## Prisma 7 – Besonderheiten

- Der Client wird als **TypeScript-Quelle** nach `generated/prisma/` erzeugt (nicht nach `node_modules`) und mitkompiliert — daher liegt der Build-Einstieg unter `dist/src/main.js`.
- Prisma 7 braucht zwingend einen **Driver Adapter**; die Verbindung läuft über `@prisma/adapter-pg` (siehe `src/prisma/prisma.service.ts`).
- Der Generator ist auf `moduleFormat = "cjs"` und `importFileExtension = ""` gestellt, damit Build, `ts-node` und Jest die generierten Dateien identisch auflösen.

## Termine

Alle Pfade sind relativ zu `/api/hauskreise/:hauskreisId`.

Der `MeetingGeneratorService` läuft täglich um 3 Uhr und sorgt dafür, dass immer
die nächsten **7 Dienstage** als Termin existieren. Der jeweils letzte Dienstag
eines Monats wird als `LOBPREIS_GEBET` angelegt, alle anderen als `STANDARD`.

Der Lauf ist **idempotent**: ein Datum, an dem bereits _irgendein_ Termin liegt,
bleibt unangetastet — unabhängig vom Typ. Genau das schützt selbst angelegte
`CUSTOM`-Termine (z. B. „Geburtstag von …") davor, durch einen generierten
Standardtermin ersetzt zu werden. Abgesichert ist das zusätzlich durch einen
Unique-Index auf `(hauskreis_id, date)`.

Die Datumslogik liegt bewusst als reine Funktionen in
[`meeting-schedule.ts`](src/meeting/meeting-schedule.ts) (UTC-Mitternacht, damit
Kalendertage nicht über Zeitzonen verrutschen) und ist dort direkt getestet.

Ein Termin **ohne** Host, Location oder Thema ist ein gültiger Zustand, kein
unvollständiger Datensatz. Beim Bearbeiten gilt: ein weggelassenes Feld bleibt
unverändert, `null` löscht die Zuordnung.

Zuweisungen werden gegen die Mandantengrenze geprüft — eine Person oder Location
aus einem anderen Hauskreis wird mit `400` abgelehnt.

## Vorschläge (Host & Location)

Die App **schlägt vor, sie teilt nicht zu**. Beide Endpunkte sind read-only und
unverbindlich; eingetragen wird ganz normal per `PATCH …/meetings/:id`. Ein
Termin ohne Host bleibt ein gültiger Zustand.

```
GET …/meetings/:id/host-suggestions
GET …/meetings/:id/location-suggestions
```

Zurück kommt die **komplette** Liste, nach Passung sortiert und mit `rank` —
die UI zeigt die ersten 2–3 und kann den Rest aufklappen. Jeder Eintrag bringt
die Fakten mit, auf denen er beruht, damit nachvollziehbar bleibt, warum jemand
oben steht (CLAUDE.md §4: keine Blackbox):

```json
{
  "personId": "…",
  "name": "Marlene",
  "rank": 4,
  "facts": {
    "lastAssignedAt": "2026-06-09",
    "daysSinceLastAssignment": 84,
    "timesAssigned": 1,
    "upcomingCommitments": [{ "role": "HOST", "date": "2026-09-08" }]
  }
}
```

### Wie sortiert wird

Die Reihenfolge der Kriterien ist die eigentliche Fachlogik:

1. **Wer hat am wenigsten zu tun** — Aufgaben ab dem Termindatum, über _alle_
   Rollen gezählt. Wer an dem Abend schon das Thema hat, soll nicht zusätzlich
   hosten.
2. **Wer war am längsten nicht dran** — in _dieser_ Rolle; wer noch nie dran war,
   steht ganz oben.
3. **Wer war insgesamt am seltensten dran** — trennt zwei Personen, die zuletzt
   am selben Abend dran waren.
4. **Name** — damit dieselben Daten immer dieselbe Liste ergeben und sich die
   Reihenfolge nicht bei jedem Aufruf umsortiert.

Nicht berücksichtigt werden inaktive Personen, Personen mit `canHost = false`
und **abgesagte Termine** — ein Abend, der nie stattgefunden hat, zählt nicht als
„du warst doch gerade erst dran". Der Termin selbst fließt ebenfalls nicht in
seine eigene Historie ein.

### Locations

Locations rotieren nicht gleichmäßig: `frequencyFactor` beschreibt den
gewünschten Mix (drei Haupt-Locations häufiger als die am Stadtrand). Die
Sortierung fragt deshalb, **wer am weitesten unter seinem Soll liegt** —
`expectedShare` aus dem Faktor gegen `actualShare` aus der Historie. Ein Ort über
seinem Soll rutscht nach unten, einer darunter nach oben, und das Verhältnis
pendelt sich von selbst auf den gewünschten Mix ein. Gleichstand entscheidet der
längere Abstand zur letzten Nutzung.

Locations, die nicht mehr aktiv sind, zählen auch nicht mehr im Nenner — sonst
würde ein aufgegebener Ort den Anteil aller anderen dauerhaft verzerren.

### Erweitern (Phase 5/6)

Thema und Song folgen demselben Muster. Nötig ist jeweils:

1. ein Wert mehr in `AssignmentRole`,
2. ein Adapter, der die Zuweisungen als `RoleAssignmentEvent[]` einsammelt,
3. ggf. ein Eligibility-Filter (bei Songs `playsInstrument = true`).

Die Ranking-Funktion in [`ranking.ts`](src/role-suggestion/ranking.ts) bleibt
unverändert — sie ist bewusst eine reine Funktion über bereits geladene Daten
und ohne Datenbank testbar.

## Host-Erinnerungen

`HostReminderService` läuft täglich um 9 Uhr und erinnert jeden Host, dessen
Termin in den nächsten **3 Tagen** liegt (Samstag für den Dienstag).

Gesucht wird ein **Zeitfenster** statt „genau in 3 Tagen": steht der Server an
dem einen Tag still, holt der nächste Lauf die Erinnerung nach. Tragfähig ist das
nur wegen der Deduplizierung über `notification_log` — ohne die ginge dieselbe
Erinnerung drei Tage hintereinander raus.

Manuell auslösbar über `POST …/meetings/host-reminders` (`admin`, auf die Gruppe
begrenzt). Antwort: `{ "notified": 1, "skipped": 0 }` — `skipped` zählt sowohl
bereits Erinnerte als auch den Fall, dass Push gar nicht konfiguriert ist.

## API (Stand: Phase 4)

| Methode                 | Pfad                                         | Rechte                                   |
| ----------------------- | -------------------------------------------- | ---------------------------------------- |
| `GET`                   | `/api/health`                                | öffentlich                               |
| `GET`                   | `/api/me`                                    | eingeloggt (verknüpft beim ersten Login) |
| `GET`/`POST`            | `/api/hauskreise`                            | eingeloggt                               |
| `GET`                   | `/api/hauskreise/:hauskreisId/people`        | eingeloggt                               |
| `POST`                  | `/api/hauskreise/:hauskreisId/people`        | `admin`                                  |
| `POST`                  | `/api/hauskreise/:hauskreisId/people/invite` | `admin`                                  |
| `PATCH`                 | `/api/hauskreise/:hauskreisId/people/:id`    | eingeloggt                               |
| `DELETE`                | `/api/hauskreise/:hauskreisId/people/:id`    | `admin`                                  |
| `GET`                   | `…/locations`, `…/locations/:id`             | eingeloggt                               |
| `POST`/`PATCH`/`DELETE` | `…/locations[/:id]`                          | `admin`                                  |
| `GET`                   | `…/meetings?scope=upcoming\|past\|all`       | eingeloggt                               |
| `GET`                   | `…/meetings/:id`                             | eingeloggt                               |
| `GET`                   | `…/meetings/:id/host-suggestions`            | eingeloggt                               |
| `GET`                   | `…/meetings/:id/location-suggestions`        | eingeloggt                               |
| `POST`                  | `…/meetings`                                 | eingeloggt                               |
| `PATCH`                 | `…/meetings/:id`                             | eingeloggt                               |
| `POST`                  | `…/meetings/:id/cancel`                      | eingeloggt                               |
| `PUT`                   | `…/meetings/:id/attendance`                  | eingeloggt                               |
| `DELETE`                | `…/meetings/:id`                             | `admin`                                  |
| `POST`                  | `…/meetings/generate`                        | `admin` (manueller Generator-Trigger)    |
| `POST`                  | `…/meetings/host-reminders`                  | `admin` (manueller Reminder-Trigger)     |

Alle `GET`s beantworten `If-None-Match` mit `304`. Die `PATCH`-Endpunkte auf
Personen, Locations und Terminen sowie `…/meetings/:id/cancel` **verlangen**
`If-Match` (`428` ohne, `412` bei veralteter Version) — Details siehe
[Conditional Requests](#conditional-requests-etag-304-412).

> Der Invite-Endpunkt legt den Keycloak-Account an, weist die Realm-Rolle zu und
> verschickt die Einladung. Lokal landet die Mail in Mailpit (<http://localhost:8025>).
> Schlägt nur der Mailversand fehl, antwortet er mit `invitationEmailSent: false` —
> der Account existiert dann trotzdem und die Einladung kann erneut gesendet werden.
> Scheitert dagegen ein früherer Schritt, wird der Keycloak-Account wieder gelöscht,
> damit kein verwaister Account zurückbleibt.
