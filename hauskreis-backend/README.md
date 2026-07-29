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

| Methode  | Pfad                       | Zweck                                      |
| -------- | -------------------------- | ------------------------------------------ |
| `GET`    | `/api/push/public-key`     | VAPID-Key für `pushManager.subscribe()`    |
| `GET`    | `/api/push/subscriptions`  | eigene registrierte Geräte                 |
| `POST`   | `/api/push/subscriptions`  | Gerät registrieren                         |
| `DELETE` | `/api/push/subscriptions`  | Gerät abmelden                             |
| `POST`   | `/api/push/test`           | Testbenachrichtigung an die eigenen Geräte |
| `GET`    | `/api/push/settings`       | eigene Einstellungen, alle Typen           |
| `PUT`    | `/api/push/settings/:type` | einen Typ ein-/ausschalten oder umstellen  |

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

### Der Katalog: was die App überhaupt verschickt

Alle Typen stehen in [`notification-catalog.ts`](src/notification/notification-catalog.ts),
jeder mit Label, Begründung und Default-Rhythmus.

| Typ                      | Anlass                                        | Empfänger                     | Default       |
| ------------------------ | --------------------------------------------- | ----------------------------- | ------------- |
| `HOST_REMINDER`          | Abend rückt näher                             | der Host                      | 3 Tage vorher |
| `TOPIC_REMINDER`         | Abend rückt näher                             | Themen-Verantwortliche        | 5 Tage vorher |
| `SONG_REMINDER`          | Abend rückt näher                             | Musik-Verantwortliche         | 5 Tage vorher |
| `ACTIONSTEP_REMINDER`    | Actionstep vom letzten Mal                    | alle                          | freitags      |
| `PRAYER_BUDDY_ASSIGNED`  | neue Rotation                                 | alle                          | sofort        |
| `MEETING_CANCELLED`      | ganzer Abend fällt aus                        | alle                          | sofort        |
| `ATTENDANCE_DECLINED`    | jemand sagt ab                                | der Host dieses Abends        | sofort        |
| `HOST_CAPACITY_UNLOCKED` | genug Absagen, dass eine kleine Wohnung passt | Bewohner:innen dieser Wohnung | sofort        |

Die Vorlauf-Werte sind bewusst verschieden: Inhalte vorbereiten braucht mehr
Vorlauf als aufräumen. Der Freitag beim Actionstep liegt mittig zwischen zwei
Dienstagen und lässt das Wochenende noch übrig — montags käme die Nachfrage, wenn
die Woche schon vorbei ist.

### Einstellungen: nur Abweichungen werden gespeichert

`GET /api/push/settings` liefert **alle** Typen mit Label, Begründung, dem
möglichen Knopf und dem aktuellen Wert. Keine Zeile in der Datenbank heißt
„wie im Katalog" — dadurch braucht ein neuer Typ kein Nachtragen von neun Zeilen,
er ist ab dem Deploy für alle an.

Nicht jeder Typ hat einen Rhythmus. `schedule.kind` sagt, was einstellbar ist:

- **`LEAD_TIME`** — `leadDays`, Grenzen stehen im Katalog (1–14).
- **`WEEKLY`** — `weekday`, 0 = Sonntag.
- **`EVENT`** — nur an/aus. „Wie oft" ist bei „du hast neue Gebetsbuddys" keine
  sinnvolle Frage.

Ein Knopf am falschen Typ ist ein `400` und kein stillschweigend gespeicherter
Wert, den nie jemand liest.

```bash
curl -X PUT .../push/settings/HOST_REMINDER -d '{"leadDays":7}'          # 200
curl -X PUT .../push/settings/HOST_REMINDER -d '{"leadDays":30}'         # 400, max 14
curl -X PUT .../push/settings/MEETING_CANCELLED -d '{"weekday":3}'       # 400, kein Wochentag
curl -X PUT .../push/settings/HOST_REMINDER -d '{"leadDays":null}'       # zurück auf Default
```

**Ausgeschaltet schreibt keinen Log-Eintrag.** Wer einen Typ wieder anschaltet,
bekommt die Erinnerung für den anstehenden Termin noch — statt dass dort eine
Zeile steht, die behauptet, sie sei längst erledigt.

### Ein Cron für alle, Rhythmus pro Person

Vorlauf und Wochentag sind persönlich, es gibt also keinen einen Tag, an dem der
Job laufen könnte. Deshalb läuft er **täglich für alle und fragt pro Person, ob
heute ihr Tag ist** — ein Cron für die Gruppe statt einem pro Person, und eine
geänderte Einstellung greift am nächsten Morgen, ohne dass irgendwo etwas
umgeplant wird.

Das Suchfenster reicht entsprechend so weit wie die **geduldigste** erlaubte
Einstellung (14 Tage), nicht so weit wie der Default. Ein Fenster auf Default-Basis
würde den Termin von jemandem mit längerem Vorlauf nie zu sehen bekommen.

### Für kommende Reminder

`NotificationModule` importieren und `NotificationService` injizieren — **nicht**
direkt `web-push` verwenden. Nur so gelten Deduplizierung, Endpoint-Cleanup,
Einstellungen und das Verhalten ohne VAPID-Keys überall gleich.

**Einen neuen Typ ergänzen:**

1. Wert in `NotificationType` (Prisma-Enum) + Migration.
2. Eintrag in `NOTIFICATION_CATALOG` — Label, Begründung, Rhythmus, Default.
3. Einen Absender. Bei `LEAD_TIME` ist das eine Funktion „wer ist gemeint und was
   steht drin", der Rest kommt von
   [`MeetingReminderService`](src/notification/meeting-reminder.service.ts):

   ```ts
   this.reminders.run(NotificationType.SONG_REMINDER, (meeting) =>
     meeting.songLeaders.map((leader) => ({
       personId: leader.personId,
       payload: { title: 'Du machst die Musik', body: …, url: … },
     })),
   );
   ```

Danach steht der Typ **von allein** in den Einstellungen, mit Text, Default und
geprüften Grenzen — die Settings-Route, das DTO und das Frontend bleiben
unangetastet. `notification-catalog.spec.ts` schlägt fehl, wenn Schritt 2
vergessen wurde; sonst würde der Typ zwar senden, wäre aber unsichtbar und nicht
abschaltbar.

**Als Admin in der App neue Typen anlegen ist bewusst nicht vorgesehen.** Eine
Benachrichtigung besteht aus Auslöser, Empfängerkreis und Text — nur der Text ist
Daten. Die beiden anderen zur Laufzeit editierbar zu machen hieße, eine kleine
Regelsprache zu bauen: viel Aufwand für etwas, das niemand debuggen kann, wenn es
falsch feuert.

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
hinterlegen. Referenzen laufen über Namen, nicht über IDs — `person.csv` zeigt
per `hauskreisName` auf `hauskreis.csv` und per `locationName` auf
`location.csv`. Ein unbekannter Name bricht den Import mit Zeilennummer ab,
statt still eine leere Zuordnung zu schreiben.

Zwei Personen dürfen dieselbe `locationName` tragen — das ist der Fall der
geteilten Wohnung, den die Host-Vorschläge kennen. `locationName` leer lassen
heißt „bringt kein Zuhause in die Rotation ein"; alle anderen Rollen bleiben
davon unberührt. `capacity` in `location.csv` leer lassen heißt „passt jeder
rein" — nur die engen Zuhause brauchen eine Zahl.

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

## Vorschläge

Die App **schlägt vor, sie teilt nicht zu**. Der Endpunkt ist read-only und
unverbindlich; eingetragen wird ganz normal per `PATCH …/meetings/:id`. Ein
Termin ohne Host bleibt ein gültiger Zustand.

```
GET …/meetings/:id/host-suggestions
```

Zurück kommt die **komplette** Liste, nach Passung sortiert und mit `rank` —
die UI zeigt die ersten 2–3 und kann den Rest aufklappen. Jeder Eintrag bringt
die Fakten mit, auf denen er beruht, damit nachvollziehbar bleibt, warum jemand
oben steht (CLAUDE.md §4: keine Blackbox):

```json
{
  "personId": "…",
  "name": "Marlene",
  "rank": 9,
  "facts": {
    "lastAssignedAt": "2026-12-08",
    "daysSinceLastAssignment": 7,
    "timesAssigned": 3,
    "upcomingCommitments": [{ "role": "HOST", "date": "2027-01-05" }],
    "deferred": false,
    "deferredReason": null,
    "home": {
      "locationId": "…",
      "locationName": "Bei Julian & Marlene",
      "hostWeight": 5,
      "credit": -0.3243,
      "capacity": null,
      "expectedAttendance": 9,
      "timesUsed": 6,
      "lastUsedAt": "2026-12-08",
      "daysSinceLastUse": 7,
      "expectedShare": 0.2703,
      "actualShare": 0.3
    }
  }
}
```

### Host: Person und Ort sind eine Entscheidung

„Bei Niko" _ist_ Niko hostet. Zwei getrennte Rankings — eins für Personen, eins
für Orte — könnten sich widersprechen, deshalb läuft die Host-Empfehlung in
zwei Stufen und liefert beides zusammen:

1. **Welches Zuhause** ist am ehesten dran ([`host-ranking.ts`](src/role-suggestion/host-ranking.ts)).
2. **Wer aus dem Haushalt** übernimmt ([`ranking.ts`](src/role-suggestion/ranking.ts),
   unverändert). Bei einem Bewohner Formsache, bei einer geteilten Wohnung
   dieselbe „am längsten nicht dran"-Regel wie überall sonst.

`hostWeight` hängt am **Zuhause**, nicht an der Person: Hosten kostet den
Haushalt, also teilen sich zwei Bewohner ein Gewicht statt je eines zu bekommen.
Jeder von ihnen hostet dadurch etwa halb so oft wie jemand, der allein wohnt.

Orte **ohne** Host (Schlosspark) sind gar nicht Teil davon. Sie schulden der
Gruppe nichts, sondern sind eine Wetterfrage — und werden schlicht aus
`…/locations` ausgewählt.

### Wie das Zuhause bestimmt wird: ein Guthaben

Statt All-Time-Anteile zu vergleichen, spielt die Logik die Historie Abend für
Abend durch und führt pro Zuhause ein **Guthaben in Terminen**: jeder Abend
bringt jedem Zuhause seinen Gewichtsanteil ein, wer hostet gibt einen aus.
Positives Guthaben heißt „ist dran", negatives „war überdurchschnittlich oft".

Das reguliert sich selbst — es gibt keinen Zähler, der zurückgesetzt werden
müsste. Über 30 Abende mit den Seed-Gewichten:

| Zuhause              | Gewicht | Soll | Ist |
| -------------------- | ------: | ---: | --: |
| Bei Julian & Marlene |       5 |  8.1 |   8 |
| Bei Chris            |       3 |  4.9 |   5 |
| Bei Erik & Elisha    |       3 |  4.9 |   5 |
| Bei Niko             |       3 |  4.9 |   5 |
| Bei Antonia          |       2 |  3.2 |   3 |
| Bei Reini            |     1.5 |  2.4 |   2 |
| Bei Sofie            |       1 |  1.6 |   2 |

Bei Gleichstand entscheidet der längere Abstand zur letzten Nutzung, dann der
Name — damit dieselben Daten immer dieselbe Liste ergeben.

**Warum das Durchspielen und keine Formel?** Wegen der Vergesslichkeit. Kann
jemand ein halbes Jahr nicht hosten, wächst sein Rückstand sonst ungebremst
weiter, und bei der Rückkehr blockiert er über Wochen alle anderen. Ein Deckel
auf einen aus Gesamtsummen _neu berechneten_ Wert hilft dagegen **nicht** — der
Rohwert steht weiter im Raum und ist nach dem ersten Hosten sofort wieder da.
Im Durchspielen wirkt er, weil jeder Schritt den gedeckelten Wert weiterträgt.

`MAX_CREDIT_MEETINGS` liegt bei **1.5**. Unbeeinflusst verlässt das Guthaben
nie den Bereich ±0.8 — der Deckel greift also im Normalbetrieb nie. Er gilt in
beide Richtungen, was den Abstand auf `2 × 1.5` begrenzt: nach einem halben Jahr
Pause sind es **drei Abende Aufholen**, dann läuft die normale Rotation weiter.

Nebeneffekt derselben Mechanik: ein **neu angelegtes** Zuhause startet bei null
statt mit dem Anspruch, erst einmal den All-Time-Stand aller anderen einzuholen.

Und genau hier docken die Abwesenheiten aus Phase 9 an: ein Zuhause, dessen
Bewohner weg sind, verdient in der Zeit einfach nichts — dann entsteht der
Rückstand gar nicht erst und der Deckel bleibt das Sicherheitsnetz, das er sein
soll.

### Was ausgeschlossen wird und was nur nach hinten rutscht

**Harter Ausschluss** nur bei Dauerzuständen: inaktive Personen, `canHost = false`,
ab Phase 9 Abwesenheit. Ein Zuhause fällt raus, wenn **kein** Bewohner mehr
übrig ist. Abgesagte Termine zählen nicht als Historie — ein Abend, der nie
stattgefunden hat, ist kein „du warst doch gerade erst dran". Der Termin selbst
fließt nicht in seine eigene Historie ein.

**Nur Zurückstellung** für einen einzelnen Abend: das Zuhause rutscht ans Ende
der Liste (`deferred: true` samt `deferredReason`), statt zu verschwinden. Eine
Verschiebung übersteht den Fall „keine bessere Option da", ein Filter nicht.

| `deferredReason` | Wann                                                         |
| ---------------- | ------------------------------------------------------------ |
| `TOO_SMALL`      | Es kommen mehr Leute, als reinpassen — siehe unten           |
| `HOUSEHOLD_BUSY` | Jeder Bewohner ist an dem Abend schon anderweitig eingeteilt |

Für `HOUSEHOLD_BUSY` zählt bewusst **nur der Termintag selbst**. Eine Aufgabe
drei Wochen später ist kein Konflikt, sondern Last — und Last ist ohnehin schon
das erste Sortierkriterium innerhalb des Haushalts. Dadurch braucht es kein
willkürliches „die nächsten N Wochen"-Fenster. Solange HOST die einzige Rolle
ist, kann das gar nicht auslösen (ein Host pro Abend, ein Termin pro Datum); ab
Phase 5 greift es.

### Platz: kleine Wohnungen kommen nur an kleine Abende

`capacity` ist nullable — die meisten Zuhause haben keine echte Grenze, nur die
engen brauchen eine Zahl. Passt die erwartete Runde nicht rein, wird das Zuhause
für **diesen einen Abend** zurückgestellt.

Erwartet werden alle aktiven Personen abzüglich derer, die für den Termin
`ABSENT` eingetragen haben. Ein **unentschiedener** Status zählt als „kommt": der
Fehler, den man vermeiden will, ist ein Zuhause, das am Abend zu klein ist — nicht
umgekehrt. Aus demselben Grund gilt eine unbekannte Zahl als volle Runde.

Bei 9 aktiven Personen und `capacity = 5` heißt das: erst ab **vier Absagen**
taucht das Zuhause im Ranking auf.

**Und jetzt der Punkt, an dem die Gewichtung kippen könnte:** ein
zurückgestelltes Zuhause **verdient weiter** sein Guthaben. Das ist der
entscheidende Unterschied zur Abwesenheit (Phase 9), wo es nichts verdient:

- **Abwesend** — der Haushalt _konnte_ nicht. Kein Anspruch entsteht, sonst
  staut sich ein Rückstand für Zeit auf, in der er gar nicht zur Verfügung stand.
- **Zurückgestellt** — der Haushalt _wollte und könnte_, die Umstände sagten
  nein. Der Anspruch bleibt.

Ohne das würde ein kleines Zuhause bei jedem seltenen kleinen Abend wieder bei
null gegen die großen antreten — und faktisch nie hosten. Mit dem angesparten
Guthaben gewinnt es den ersten Abend, der passt.

Über 200 Abende simuliert, Sofie (Gewicht 1 von 18.5 → Soll 10.8):

| Wie oft passt ein Abend zu ihr | Ist    | Verhalten                                      |
| ------------------------------ | ------ | ---------------------------------------------- |
| 14 von 200 (mehr als ihr Soll) | **10** | trifft ihr Soll und belegt nicht alle kleinen  |
| 8 von 200 (weniger als Soll)   | **7**  | nimmt fast alle — mehr ist physisch nicht drin |
| 0 von 200                      | **0**  | die anderen übernehmen anteilig                |

Der Rest verteilt sich in allen drei Fällen weiter nach Gewicht. Im mittleren
Fall bleiben 7 statt 8 übrig, weil ihr Guthaben nach jedem Hosten fällt und
gelegentlich ein großes Zuhause knapp vorbeizieht — ein bewusst in Kauf
genommener Rest, kein Aufbau von Rückstand.

**Praktische Einschränkung:** heute senken nur explizite Absagen am Termin die
Zahl. Weit entfernte Abende sehen deshalb immer voll aus, und die engen Zuhause
tauchen erst kurzfristig auf. Die Abwesenheitszeiträume aus Phase 9 haben Start-
und Enddatum und fließen dann hier mit ein — ein früh eingetragener Urlaub zählt
also schon bei der Planung.

### Die Personen-Sortierung: `rankForRole`

Dieselbe Funktion für den Haushalt beim Hosten **und** für die Themen-Vergabe:

1. **Wer hat am wenigsten zu tun** — Aufgaben ab dem Termindatum, über _alle_
   Rollen gezählt.
2. **Wer war am längsten nicht dran** — in _dieser_ Rolle; wer noch nie dran war,
   steht ganz oben.
3. **Wer war insgesamt am seltensten dran**.
4. **Name**.

#### Wie weit die Auslastung nach vorn schaut

`LOAD_HORIZON_DAYS` = **8 Wochen**. Das ist kein frei gewählter Wert, sondern das
Planungsfenster, das der Termin-Generator offenhält (7 Dienstage), plus eine
Woche Luft. Weiter draußen ist ohnehin nichts entschieden.

Ohne Grenze würde ein Ja zu einem Abend in drei Monaten jede Rangliste bis dahin
nach unten ziehen — das bestraft genau die, die vorausplanen, und ein Termin so
weit weg macht keinen Abend dazwischen anstrengender.

#### Mehrteilige Aufgaben zählen einmal

Ein Thema über drei Abende ist **eine** Vorbereitung, kein dreifacher Einsatz
(CLAUDE.md §5). Die Events tragen dafür einen `slotKey` — beim Thema die
Themen-ID:

- `timesAssigned` zählt verschiedene Slots, nicht Termine.
- `lastAssignedAt` bleibt der **letzte** Abend, an dem die Person zuständig war.
- `upcomingCommitments` fasst zusammen und datiert auf den **ersten** Abend.

Ohne `slotKey` steht jedes Event für sich — richtig beim Hosten: ein Abend, eine
Aufgabe.

### Eine weitere Rolle ergänzen

Host, Thema und Musik laufen alle über dieselbe Funktion. Für eine vierte
braucht es genau drei Dinge:

1. ein Wert mehr in `AssignmentRole`,
2. ein Adapter, der die Zuweisungen als `RoleAssignmentEvent[]` einsammelt
   (mit `slotKey`, falls eine Aufgabe über mehrere Abende läuft),
3. ggf. ein Eligibility-Filter — beim Thema keiner, bei der Musik
   `playsInstrument = true`.

Die Filter sind **Vorschlags**-Filter, keine Regeln: eingetragen werden darf
immer, worauf sich die Gruppe geeinigt hat.

Beide Ranking-Funktionen sind reine Funktionen über bereits geladene Daten und
ohne Datenbank getestet.

## Themen

Ein Thema ist **nicht** an einen Termin gebunden: es kann über mehrere Abende
laufen, und ein `LOBPREIS_GEBET`-Abend hat gar keins. Der Titel ist optional —
nicht jeder legt ihn vorab fest.

| Methode  | Pfad                  | Rechte                      |
| -------- | --------------------- | --------------------------- |
| `GET`    | `…/topics?status=`    | eingeloggt                  |
| `GET`    | `…/topics/:id`        | eingeloggt                  |
| `POST`   | `…/topics`            | eingeloggt                  |
| `PATCH`  | `…/topics/:id`        | eingeloggt (`If-Match`)     |
| `DELETE` | `…/topics/:id`        | `admin`                     |
| `POST`   | `…/topics/carry-over` | `admin` (manueller Trigger) |

Abgeschlossen wird über `PATCH` mit `{ "status": "COMPLETED" }`. Die
Verantwortlichen liegen in einer Join-Tabelle statt in zwei nullable Spalten —
eine dritte Person bräuchte so keine Migration. `responsiblePersonIds` ersetzt
die Liste komplett, weglassen lässt sie unverändert.

Wer das nächste Thema vorbereiten könnte, liefert
`GET …/meetings/:id/topic-suggestions` — dieselbe Rangliste wie beim Host, nur
ohne Ortsbezug.

### Automatische Übernahme

`TopicCarryOverService` läuft nachts um 3:15 Uhr, eine Viertelstunde nach dem
Termin-Generator, und setzt ein laufendes Thema auf den **nächsten** Termin.
Betroffen sind nur `STANDARD`-Abende: `LOBPREIS_GEBET` trägt stattdessen ein
Testimony, `CUSTOM` ist, was die Gruppe daraus macht.

Gesucht wird der **früheste kommende** Termin — bewusst _ohne_ Filter auf „hat
noch kein Thema". Würde der Job stattdessen zum nächsten themenlosen Abend
springen, belegte er bei jedem nächtlichen Lauf einen weiteren, und nach einer
Woche gehörte das ganze Planungsfenster einem Thema, das meist zwei bis drei
Abende läuft. So bereitet er immer nur den nächsten Abend vor und ist echt
idempotent.

Ein von Hand gesetztes Thema wird nie überschrieben: das `UPDATE` ist zusätzlich
auf `topic_id IS NULL` abgesichert.

## Songs

Zwei Dinge, die zusammenhängen: eine **Song-Datenbank**, die mit der Zeit
wächst, und pro Abend eine **Auswahl** daraus.

### Die Datenbank

Was einmal vorgeschlagen wurde, bleibt und lässt sich wieder auswählen
(CLAUDE.md §6). Pflicht ist nur der Titel; Lyrics werden **nicht** gespeichert,
nur ein Link dorthin.

`GET …/songs?search=` sucht case-insensitiv in Titel **und** Artist — das ist,
was die Autovervollständigung im „Song eintragen"-Feld aufruft. Umgesetzt als
`ILIKE`; bei ein paar hundert Zeilen bringt ein Trigram-Index nichts außer einer
Extension, die installiert sein will.

`POST …/songs` legt an **oder gibt den vorhandenen Song zurück**. Ein `400` bei
Dubletten würde das Frontend zwingen, erst zu suchen und dann ein Rennen zu
behandeln, das es nicht gewinnen kann. Als Dublette gilt gleicher Titel _und_
gleicher Artist — zwei Lieder gleichen Namens von verschiedenen Leuten bleiben
getrennt.

Löschen ist `admin` und wird abgelehnt, solange der Song noch an einem Abend
hängt: es würde ihn sonst rückwirkend aus dem Archiv entfernen. Umbenennen ist
fast immer gemeint.

### Pro Abend

`POST …/meetings/:id/songs` nimmt **entweder** `{ songId }` **oder**
`{ title, artist?, lyricsUrl? }` — genau eines von beidem, sonst `400`. Das
bildet ab, wie das Feld sich anfühlt: man tippt einen Titel, und der ist
entweder bekannt oder nicht. Neues landet in der Datenbank und steht beim
nächsten Mal zur Auswahl.

`isSelected` trennt die Vorschlagsliste von dem, was am Ende gesungen wird — ein
Vorschlag, der es nicht geschafft hat, bleibt sichtbar statt gelöscht zu werden.
Denselben Song zweimal vorzuschlagen ist derselbe Wunsch, kein zweiter Eintrag.

`PUT …/meetings/:id/song-leaders` ersetzt die Zuständigen. Eine **leere** Liste
ist gültig: nicht jeder Abend hat Lieder, dann braucht es niemanden.

`GET …/meetings/:id/song-leader-suggestions` rankt nur, wer ein Instrument
spielt — vier der neun. Eingetragen werden darf trotzdem jeder.

## Erinnerungen vor dem Abend

Drei Erinnerungen laufen täglich um 9 Uhr und unterscheiden sich in genau zwei
Dingen — wer gemeint ist und was drinsteht:

| Job                    | Empfänger              | Manuell auslösen (`admin`)       |
| ---------------------- | ---------------------- | -------------------------------- |
| `HostReminderService`  | Host                   | `POST …/meetings/host-reminders` |
| `TopicReminderService` | Themen-Verantwortliche | `POST …/topics/reminders`        |
| `SongReminderService`  | Musik-Verantwortliche  | `POST …/songs/reminders`         |

Alles andere — Fenster, Vorlauf pro Person, Deduplizierung, Zählung — liegt einmal
in `MeetingReminderService`. Antwort jeweils `{ "notified": 1, "skipped": 0 }`;
`skipped` zählt bereits Erinnerte, Abgeschaltete und den Fall, dass Push gar nicht
konfiguriert ist.

Gesucht wird ein **Zeitfenster** statt „genau in N Tagen": steht der Server an dem
einen Tag still, holt der nächste Lauf die Erinnerung nach, und wer sich erst
kurzfristig einträgt, fällt nicht durch. Tragfähig ist das nur wegen der
Deduplizierung über `notification_log`.

Ein Thema über mehrere Abende erinnert **erneut** — die Deduplizierung hängt am
Termin, nicht am Thema. Das ist gewollt: Teil zwei muss genauso vorbereitet
werden.

## Actionstep

`ActionstepReminderService` fragt mitten in der Woche nach, was aus dem Actionstep
geworden ist. Genommen wird der **jüngste vergangene Termin, der einen hat** —
nicht schlicht „der letzte Termin". Hat vorletzte Woche niemand einen
eingetragen, bleibt die Woche still, statt einen zwei Wochen alten Schritt
aufzuwärmen.

Ein leerer String zählt als „keiner": das Feld ist Freitext, und Leerzeichen sind
nichts, wofür man neun Leute unterbricht.

Manuell über `POST …/meetings/actionstep-reminders`. Der Knopf hält sich an den
eingestellten Wochentag und meldet an anderen Tagen `notified: 0` — er dient dazu,
den Job zu prüfen, nicht dazu, die Einstellung zu übergehen.

## Wenn sich etwas ändert

Drei Benachrichtigungen hängen nicht am Kalender, sondern an einer Änderung.
Sie werden aus `MeetingService` heraus ausgelöst, **nachdem** geschrieben wurde —
eine Absage-Meldung zu einem Speichern, das dann fehlschlägt, wäre schlimmer als
eine späte.

**`MEETING_CANCELLED`** geht an alle, sobald ein Abend abgesagt wird. Ausgelöst
wird das am Übergang des Status, nicht am Endpunkt: absagen geht über
`POST …/cancel` **und** über `PATCH { "status": "CANCELLED" }`, und beide Wege
sollen sich gleich verhalten. Ein bereits abgesagter Abend bleibt still, ein
vergangener auch — dass Dienstag vor drei Wochen nicht stattgefunden hat, ist
Buchhaltung und keine Nachricht.

**`ATTENDANCE_DECLINED`** geht an den Host dieses Abends, der schließlich
einkauft. Nur beim Übergang nach „abwesend" — dieselbe Antwort nochmal zu
speichern löst nichts aus, und dass man selbst abgesagt hat, muss einem niemand
mitteilen.

**`HOST_CAPACITY_UNLOCKED`** ist die Umkehrung der Kapazitätsregel weiter oben:
sagen genug Leute ab, passt der Abend plötzlich auch in eine kleine Wohnung, und
deren Bewohner:innen bekommen einen Hinweis. Bei neun Personen und Kapazität 5
also ab der vierten Absage — verifiziert, dass bei drei Absagen noch nichts
kommt. Still, sobald der Abend einen Host oder einen Ort hat: die Nachricht füllt
eine Lücke, und die gibt es dann nicht mehr. Es ist eine Einladung, keine
Entscheidung — wer wirklich dran wäre, beantwortet nach wie vor das Ranking.

### Abgrenzung zu Phase 9

Diese drei reagieren auf **ausdrückliche** Absagen für einen einzelnen Abend.
Phase 9 ergänzt `absence_period` — „ich bin vom 10. bis 24. weg" — und erzeugt
daraus automatisch dieselben Absagen. Sie fließen durch denselben Pfad, also
feuern die Benachrichtigungen dann von allein: **Phase 9 liefert die Daten,
Phase 8 reagiert darauf.** Neuer Notification-Code entsteht dort nicht.

Praktisch heißt das: der Kapazitäts-Hinweis kommt heute erst, wenn Leute für den
konkreten Abend absagen. Ein früh angekündigter Urlaub zählt erst mit Phase 9 mit
— dann aber ohne Änderung an diesem Kapitel.

## Gebetsbuddys

Alle zwei Wochen (einstellbar) neu zugeteilt: Zweiergruppen, plus eine Dreier,
wenn die Zahl nicht aufgeht. Bei neun Personen also **2/2/2/3** — zu zweit ist
das Format, das die Gruppe will, die Dreier existiert nur, weil neun ungerade
ist.

Bewusst **nicht** Teil der Vorschlags-Engine: die beantwortet „eine Person pro
Slot", das hier ist ein Paarungsproblem mit anderer Form
(Architektur-Prinzip 4). Und anders als beim Host wird hier automatisch
zugeteilt, nicht vorgeschlagen — es gibt nichts abzuwägen.

### Wiederholungs-Vermeidung

Jede Paarung kostet `1 / Perioden seit dem letzten Mal zusammen`, noch nie
zusammen kostet nichts. Gesucht wird die Aufteilung mit der kleinsten Summe —
**exakt**, über eine Suche über Teilmengen. Bei neun Personen sind das höchstens
256 Zustände, da gibt es keinen Grund zu schätzen.

Das erste, naheliegende Verfahren — immer das beste Paar zuerst nehmen — sieht
gleichwertig aus und ist es nicht: es lässt die Übriggebliebenen am Ende
zwangsweise miteinander übrig, egal wie kurz das her ist. Im Probelauf standen
dieselben zwei Personen dadurch **drei Perioden hintereinander** zusammen. Mit
der exakten Suche liegt der kleinste Abstand einer Wiederholung über 20 Perioden
bei **zwei** — direkt hintereinander passiert nicht mehr.

Die Kostenfunktion fällt bewusst steil (1/x) statt linear ab. Sonst würde die
Suche eine „letzte Periode zusammen"-Paarung einkaufen, um drei andere ein wenig
älter zu machen.

**Wer in die Dreiergruppe kommt**, wird _zuerst_ entschieden, und zwar nach „wer
war am seltensten drin". Überließe man es der Paarung, wäre es, wer zufällig
übrig bleibt — und das kann dieselbe Person immer wieder treffen.

Durchgehend deterministisch: Gleichstände entscheidet der Name, dieselbe
Historie ergibt also immer dieselbe Aufteilung.

### Rotation

`PrayerBuddyGeneratorService` läuft **täglich** um 4 Uhr, nicht alle zwei
Wochen: ein 14-tägiger Cron würde eine Rotation still überspringen, wenn der
Server an dem Morgen gerade steht. Die tägliche Frage „ist heute jemand
zugeteilt" heilt sich selbst und kostet eine Query.

| Methode | Pfad                       | Rechte                 |
| ------- | -------------------------- | ---------------------- |
| `GET`   | `…/prayer-buddies/current` | eingeloggt             |
| `GET`   | `…/prayer-buddies`         | eingeloggt (paginiert) |
| `GET`   | `…/prayer-buddies/config`  | eingeloggt             |
| `PUT`   | `…/prayer-buddies/config`  | `admin` (`If-Match`)   |
| `POST`  | `…/prayer-buddies/rotate`  | `admin`                |

### Was der Admin darf

**Rhythmus ändern** (`PUT …/config`, 1–12 Wochen). Gilt ab der **nächsten**
Rotation — die laufende Zuteilung behält ihre Daten, damit niemandem seine
Buddys unter den Füßen weggezogen werden, nur weil eine Einstellung sich
bewegt hat.

**Sofort neu zuteilen** (`POST …/rotate`), auch mitten in einer laufenden
Periode. Zwei Fälle, bewusst unterschiedlich:

- **Heute erst gestartet** → die laufende Zuteilung wird als _verworfen_
  markiert. Sie war nie in Kraft, taucht also nicht im Archiv auf.
- **Früher gestartet** → sie wird auf gestern beendet. Die Tage haben
  stattgefunden, die Paarungen bleiben im Archiv.

In beiden Fällen läuft die neue Periode einen vollen Zyklus ab heute: Sinn des
Neuzuteilens ist ja, dass die neuen Gruppen ihre richtige Zeit miteinander
bekommen.

Verworfene Zuteilungen werden **markiert, nicht gelöscht** — und genau das
macht „nochmal würfeln" erst brauchbar. Ohne sie wüsste der deterministische
Algorithmus nichts von der abgelehnten Aufteilung und gäbe dieselbe zurück.
Verifiziert: drei Rotationen hintereinander ergeben drei verschiedene
Aufteilungen, das Archiv zeigt trotzdem nur eine Periode.

`notify: false` im Body würfelt still — nützlich, wenn man zweimal
hintereinander neu zuteilt und nicht jedes Mal alle anpiepen will.

### Warum das Notification-Log eine Spalte mehr hat

`notification_log` deduplizierte über `(person, typ, termin)`. Gebetsbuddy-
Zuteilungen hängen an keinem Termin, also wäre jede Rotation als „schon
geschickt" durchgefallen — **nur die allererste** wäre je angekündigt worden.
`related_group_id` macht jede Rotation zu ihrer eigenen Nachricht.

Nebenbei festgehalten: der Unique-Index kann das ohnehin nicht erzwingen.
Postgres behandelt Zeilen mit einem NULL im Tupel als verschieden, und beide
Bezugsspalten sind nullable. Die echte Prüfung ist die Query in
`hasBeenSent` — der Index macht sie nur schnell.

## Paginierte Listen

Listen, die wachsen — Termine, Themen, Songs — antworten mit einem Umschlag
statt einem nackten Array:

```json
{ "items": [...], "total": 51, "take": 20, "skip": 0, "hasMore": true }
```

Ohne `total` wüsste das Archiv nicht, ob noch etwas kommt. `hasMore` ist zwar
ableitbar, wird aber mitgeliefert: es ist der Wert, auf den man verzweigt, und
selbst ausrechnen ist die Stelle für Off-by-one-Fehler.

Offset-Paging und nicht Cursor-Paging, weil ein Archiv auf eine Seite springen
will statt sich dorthin durchzuhangeln. `take` ist auf 100 gedeckelt.

Gemeinsam in [`pagination.ts`](src/common/http/pagination.ts): neue Listen
erweitern `paginationSchema` im DTO und geben `toPage(items, total, query)`
zurück.

## API (Stand: Phase 8)

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
| `GET`                   | `…/meetings?scope=upcoming\|past\|all`       | eingeloggt (paginiert)                   |
| `GET`                   | `…/meetings/:id`                             | eingeloggt                               |
| `GET`                   | `…/meetings/:id/host-suggestions`            | eingeloggt                               |
| `GET`                   | `…/meetings/:id/topic-suggestions`           | eingeloggt                               |
| `POST`                  | `…/meetings`                                 | eingeloggt                               |
| `PATCH`                 | `…/meetings/:id`                             | eingeloggt                               |
| `POST`                  | `…/meetings/:id/cancel`                      | eingeloggt                               |
| `PUT`                   | `…/meetings/:id/attendance`                  | eingeloggt                               |
| `DELETE`                | `…/meetings/:id`                             | `admin`                                  |
| `POST`                  | `…/meetings/generate`                        | `admin` (manueller Generator-Trigger)    |
| `POST`                  | `…/meetings/host-reminders`                  | `admin` (manueller Reminder-Trigger)     |
| `POST`                  | `…/meetings/actionstep-reminders`            | `admin` (manueller Reminder-Trigger)     |
| `GET`                   | `…/topics?status=RUNNING\|COMPLETED`         | eingeloggt (paginiert)                   |
| `GET`                   | `…/topics/:id`                               | eingeloggt                               |
| `POST`                  | `…/topics`                                   | eingeloggt                               |
| `PATCH`                 | `…/topics/:id`                               | eingeloggt                               |
| `DELETE`                | `…/topics/:id`                               | `admin`                                  |
| `POST`                  | `…/topics/carry-over`                        | `admin` (manuelle Themen-Übernahme)      |
| `POST`                  | `…/topics/reminders`                         | `admin` (manueller Reminder-Trigger)     |
| `GET`                   | `…/songs?search=`                            | eingeloggt (paginiert)                   |
| `GET`                   | `…/songs/:id`                                | eingeloggt                               |
| `POST`                  | `…/songs`                                    | eingeloggt (legt an oder gibt zurück)    |
| `PATCH`                 | `…/songs/:id`                                | eingeloggt                               |
| `DELETE`                | `…/songs/:id`                                | `admin` (nur wenn nirgends verwendet)    |
| `POST`                  | `…/songs/reminders`                          | `admin` (manueller Reminder-Trigger)     |
| `GET`/`POST`            | `…/meetings/:id/songs`                       | eingeloggt                               |
| `PATCH`/`DELETE`        | `…/meetings/:id/songs/:entryId`              | eingeloggt                               |
| `GET`/`PUT`             | `…/meetings/:id/song-leaders`                | eingeloggt                               |
| `GET`                   | `…/meetings/:id/song-leader-suggestions`     | eingeloggt                               |
| `GET`                   | `…/prayer-buddies/current`                   | eingeloggt                               |
| `GET`                   | `…/prayer-buddies`                           | eingeloggt (paginiert)                   |
| `GET`                   | `…/prayer-buddies/config`                    | eingeloggt                               |
| `PUT`                   | `…/prayer-buddies/config`                    | `admin`                                  |
| `POST`                  | `…/prayer-buddies/rotate`                    | `admin` (sofort neu zuteilen)            |
| `GET`                   | `/api/push/settings`                         | eingeloggt (eigene Einstellungen)        |
| `PUT`                   | `/api/push/settings/:type`                   | eingeloggt (eigene Einstellungen)        |

Alle `GET`s beantworten `If-None-Match` mit `304`. Die `PATCH`-Endpunkte auf
Personen, Locations, Terminen, Themen und Songs, `PUT …/prayer-buddies/config`
sowie `…/meetings/:id/cancel` **verlangen**
`If-Match` (`428` ohne, `412` bei veralteter Version) — Details siehe
[Conditional Requests](#conditional-requests-etag-304-412).

> Der Invite-Endpunkt legt den Keycloak-Account an, weist die Realm-Rolle zu und
> verschickt die Einladung. Lokal landet die Mail in Mailpit (<http://localhost:8025>).
> Schlägt nur der Mailversand fehl, antwortet er mit `invitationEmailSent: false` —
> der Account existiert dann trotzdem und die Einladung kann erneut gesendet werden.
> Scheitert dagegen ein früherer Schritt, wird der Keycloak-Account wieder gelöscht,
> damit kein verwaister Account zurückbleibt.
