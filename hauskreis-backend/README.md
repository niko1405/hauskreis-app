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

### Start und Ende

Beim Start fasst ein Banner zusammen, was man sonst zusammensuchen müsste:
Adresse und Health-URL, System und Node-Version, die Keycloak-Adresse samt
Realm, die erlaubten CORS-Origins, ob Push aktiv ist, und die Routen nach
Gruppen gezählt.

Die Routen kommen aus Nests eigenen Metadaten über `ModulesContainer`, nicht
aus dem Express-Router: `express` ist nur eine transitive Abhängigkeit des
Plattform-Adapters und war im Produktions-Image schon einmal nicht auflösbar.

Dafür sind Nests eigene Start-Meldungen (`RoutesResolver`, `RouterExplorer`,
`InstanceLoader`, `NestApplication`) auf `log`-Ebene stummgeschaltet — 110
Zeilen „Mapped {…} route" bei jedem Neustart, die der Banner in vier Zeilen
zusammenfasst. `warn` und `error` kommen immer durch, eine fehlende
VAPID-Konfiguration verschwindet also nicht. Das ist nicht nur Geschmack: der
Banner geht direkt über `process.stdout.write` hinaus, pino in der Entwicklung
über einen `pino-pretty`-Worker-Thread. Die beiden Ströme lassen sich nicht
ordnen, und der Banner landete zuverlässig **vor** den Routen-Zeilen — also
sofort weggescrollt. Ohne das Geplauder streitet nichts mehr um die Reihenfolge.

Weil damit auch Nests „successfully started" wegfällt, schließt der Banner
selbst mit `Bereit in … s · Strg+C beendet`. Ein Start, nach dem nichts mehr
kommt, sieht sonst aus wie ein hängender Prozess.

Damit wirklich nichts mehr dahinter steht, setzt
[`app.module.ts`](src/app.module.ts) `forRoutes` für `nestjs-pino` explizit auf
`{*splat}`. Die Bibliothek hängt ihre Middleware sonst an `path: '*'` — die
Express-4-Schreibweise, die sie aus Rückwärtskompatibilität beibehält. Unter
Express 5 warnt `path-to-regexp` darüber bei jedem Start, und zwar **zweimal**,
weil `pinoHttp` und `bindLoggerMiddleware` getrennt registriert werden.

**Strg+C** (und `docker stop`) fährt geordnet herunter: `app.close()` führt die
Lifecycle-Hooks aus, `PrismaService.onModuleDestroy` schließt den Pool, und
zwei Logzeilen sagen, dass es passiert ist. Exit-Code 0, weil das Beenden
beabsichtigt war.

Bewusst eigene Handler statt `app.enableShutdownHooks()`: das registriert
dieselben Signale, nur ohne Ausgabe und ohne Zeitlimit. Man sah nicht, ob die
Verbindungen wirklich zu waren — und hing `close()` an einer offenen
Keep-Alive-Verbindung, blieb der Prozess still stehen. Jetzt greift nach
10 Sekunden ein Zeitlimit, und ein zweites Strg+C beendet sofort.

#### `[ELIFECYCLE] Command failed.` nach Strg+C

Kosmetik, kein Fehler. Strg+C schickt SIGINT an die **ganze
Vordergrund-Prozessgruppe** — also auch an `pnpm` selbst, nicht nur an den
Server. pnpm stirbt daran mit 130 und meldet das, unabhängig davon, womit das
Skript geendet hat.

Die Formulierung verrät, welcher Fall vorliegt:

| Meldung                            | Bedeutung                                     |
| ---------------------------------- | --------------------------------------------- |
| `Command failed.`                  | pnpm wurde selbst per Signal beendet — normal |
| `Command failed with exit code N.` | das Skript ist wirklich mit `N` gescheitert   |

Nachgestellt mit einem Minimalskript ohne Nest, das bei SIGINT ausdrücklich
`process.exit(0)` aufruft — dieselbe Ausgabe. `node dist/src/main` direkt
gestartet und mit SIGINT beendet liefert dagegen sauber Exit-Code 0.

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

## Die API beschrieben: OpenAPI

```bash
pnpm openapi        # -> openapi.json, 73 Operationen auf 47 Pfaden
pnpm start:dev      # -> http://localhost:3000/api/docs zum Durchklicken
```

Die Datei wird **erzeugt, nicht gepflegt**. Anfragen, Parameter und Antworten
stammen aus denselben Zod-Schemas, gegen die zur Laufzeit geprüft wird — eine
Beschreibung, die man von Hand nachziehen müsste, wäre nach dem zweiten Feature
falsch, und eine falsche Beschreibung ist schlimmer als gar keine.

Die Antwort-Schemas **beschneiden** dabei: was nicht im Schema steht, verlässt
den Server nicht, und passt eine Antwort nicht zu ihrem eigenen Schema, gibt es
`500` statt einer stillen Lüge. Genau so ist beim Einbau aufgefallen, dass
`GET /api/me` die `keycloakUserId` herausgab — `personSelect` deckte nur
`findAll` und `findOne` ab, `/me`, `POST …/people` und der Invite gingen daran
vorbei.

**Warum ein eigener Interceptor statt `ZodResponse` aus nestjs-zod:** der prüft
den Rückgabewert des Controllers, und der enthält echte `Date`-Objekte aus
Prisma. Ein Schema, das ein `Date` annimmt, lässt sich aber nicht als JSON
Schema ausdrücken — Zod 4 lehnt `z.date()` ab, und weder `.meta()` noch
`z.custom()` retten das. Man müsste sich zwischen Laufzeitprüfung und
brauchbarer Beschreibung entscheiden. `ResponseSerializerInterceptor`
normalisiert deshalb erst über `JSON.parse(JSON.stringify())` — die Umwandlung,
die Express ohnehin vornimmt — und prüft danach.

**Tage und Zeitpunkte.** Die `@db.Date`-Spalten haben in der Datenbank keine
Uhrzeit, Prisma gibt sie trotzdem als `DateTime` zurück, und über `JSON` wurde
daraus ein UTC-Mitternachts-Zeitstempel. Wer den lokal formatiert, bekommt
westlich von UTC den Vortag — ein Fehler, der nur in einem Teil der Welt
auftritt. `isoDateOut` in [`src/common/dto/response.ts`](src/common/dto/response.ts)
schneidet ihn deshalb ab, statt ihn zu dokumentieren: es nimmt beide Formen an
und liefert immer `YYYY-MM-DD`.

Das ist ein `transform()`, dessen Ausgabeseite für sich genommen nicht
beschreibbar wäre — deshalb das `.pipe()` zurück auf `z.iso.date()`. Und
deshalb setzt `ApiZodResponse` `dto.Output` statt `dto`: `nestjs-zod`
beschreibt ein DTO sonst aus seiner _Eingabe_-Seite, und das wäre bei einer
Antwort die falsche. So steht in der Datei `format: date`, nicht ein Oder aus
beiden Eingabeformen.

Fürs Frontend gehört [`docs/api-fuer-frontend.md`](../docs/api-fuer-frontend.md)
dazu: die Regeln, die für jeden Aufruf gelten und sich in OpenAPI schlecht
ausdrücken lassen — Keycloak-PKCE, das `If-Match`-Protokoll, das Fehlerformat
und die Trennung von Tag und Zeitpunkt.

## Endpunkte ausprobieren: Bruno

Die komplette API liegt als [Bruno](https://www.usebruno.com/)-Collection im
Repo, unter [`../bruno/`](../bruno/). 82 Requests, die **von oben nach unten
durchlaufen**: `00-auth` holt das Token, die Listen-Requests merken sich IDs und
ETags als Environment-Variablen, alles Weitere greift darauf zu. Keine UUIDs zum
Abtippen.

```bash
cp ../bruno/environments/local.example.bru ../bruno/environments/local.bru
cd ../bruno && npx @usebruno/cli run --env local -r
```

`environments/local.bru` ist **ignoriert**, nicht vergessen: der Runner schreibt
gesetzte Variablen dorthin zurück, also auch Access-Tokens.

### In der Bruno-App

Vorher muss laufen: `docker compose up -d`, `./scripts/setup-keycloak.sh`,
`pnpm db:migrate && pnpm db:seed`, `pnpm start:dev`.

1. **Open Collection** → den Ordner `bruno/` wählen (den Ordner, nicht die
   `bruno.json`, und nicht das Repo-Root).
2. Die `local.bru` anlegen — der `cp` oben. Ohne sie ist die
   Environment-Auswahl leer.
3. Oben rechts das Environment **`local` auswählen**. Bruno startet ohne
   ausgewähltes Environment; `{{baseUrl}}` bleibt dann als Literal stehen und
   die Fehlermeldung zeigt nicht darauf.
4. **`00-auth/01-token-admin` zuerst.** Es setzt `{{token}}`, an dem die
   Collection-Auth hängt. Vorher antwortet alles mit `401`.

#### Wenn das Environment nicht auftaucht

`.bru`-Environments werden **nicht importiert**. Bruno liest sie von selbst aus
`environments/` innerhalb des Collection-Ordners; der Import-Dialog kann
ausschließlich Postman-JSON und ist hier der falsche Weg.

Steht `local` trotzdem nicht im Dropdown, der Reihe nach:

- **Zeigt die Collection auf `bruno/`?** Rechtsklick auf den Collection-Namen →
  _Settings_. Steht dort das Repo-Root, findet Bruno weder `bruno.json` noch die
  Environments.
- **Collection schließen und neu öffnen.** Wer sie geöffnet hat, bevor
  `local.bru` existierte, sieht sie nicht — Bruno bemerkt die neue Datei nicht
  immer, besonders nicht über einen WSL-Pfad
  (`\\wsl.localhost\Ubuntu\home\…`), wo der File-Watcher unzuverlässig ist.
- **Selbst anlegen geht auch**: Environment-Dropdown → _Configure_ → _Create_,
  Name `local`, die acht Variablen aus
  [`local.example.bru`](../bruno/environments/local.example.bru) eintragen.
  Bruno schreibt die `.bru` dann selbst.
- **Notlösung, falls nur der Import-Dialog funktioniert**:
  [`environments/local.postman.json`](../bruno/environments/local.postman.json)
  liegt im Postman-Format bereit und lässt sich damit einlesen. Bruno legt beim
  Import eine ganz normale `local.bru` an — die JSON-Datei wird danach nicht
  mehr gebraucht.

Danach beliebig klicken — mit drei Einschränkungen:

- **Das Token hält 5 Minuten** (Keycloak-Default, im Setup nicht verändert).
  Wenn nach einer Pause plötzlich alles `401` gibt, ist das der Grund:
  `01-token-admin` erneut ausführen.
- **Requests weiter unten bauen auf Variablen von weiter oben.** `04-meetings`
  braucht `{{hauskreisId}}` aus `01-hauskreis`, `{{meetingId}}` aus der
  Terminliste. Klickt man mitten hinein, geht der unaufgelöste Platzhalter als
  Text in die URL — das Ergebnis ist ein `404` auf eine Adresse, in der noch
  `{{meetingId}}` steht. Einmal von oben durchlaufen, dann stimmt alles.
- **Bei `PATCH` sitzt der ETag in einer Variable**, die der vorangehende `GET`
  gesetzt hat. Ohne den `GET` fehlt `If-Match` und die API antwortet `428`.
  Das ist die Regel der API, kein Fehler der Collection.

Die App schreibt gesetzte Variablen genauso in `environments/local.bru` wie der
CLI-Runner — die Datei bleibt also auch beim Klicken ignoriert, aus demselben
Grund.

`99-edge-cases` prüft die Eigenheiten dieser API, die einem sonst erst im
Frontend auffallen — `428` ohne `If-Match`, `412` mit veraltetem, `403` mit
Member-Token, `304`, `429`.

Zwei Fallen im `.bru`-Format, falls du Requests ergänzt: ein `params:query`-Block
wird **nur gesendet, wenn die Query auch in der URL steht**, und eine fehlende
`auth:`-Zeile bedeutet `none`, nicht `inherit`. Beides fällt still aus, solange
alle Parameter optional sind.

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
- `PUT …/meetings/:id/actionstep-done` — ein Schalter, siehe unten

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

**Bewusst ohne Versionierung:** `PUT …/meetings/:id/attendance` und
`PUT …/meetings/:id/actionstep-done`. Beide setzen etwas für _eine_ Person und
sind idempotent — hier ist Last-Write-Wins die richtige Semantik. Beim
Actionstep gibt es den Konflikt sogar begrifflich nicht: zwei Personen, die
gleichzeitig abhaken, schreiben verschiedene Zeilen.

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

### Wohin eine Benachrichtigung springt

Die Ziel-Pfade stehen an **einer** Stelle:
[`app-paths.ts`](src/notification/app-paths.ts).

Vorher waren es Zeichenketten in sechs Erinnerungsdiensten, und alle sechs
zeigten auf `/meetings/:id`. Diese Route gibt es im Frontend nicht — sie heißt
`/termine/:id`. Jede Push-Benachrichtigung dieser App führte also auf eine
404-Seite, und die Gebetsbuddy-Nachricht mit `/prayer-buddies` (statt `/gebet`)
genauso. So etwas fällt niemandem auf, der Benachrichtigungen nur verschickt
und nie eine antippt.

Es sind Pfade der **PWA**, nicht der API. Wer im Frontend eine Route umbenennt,
findet mit einer Suche nach dieser Datei alles, was mitzieht.

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
- **`WEEKLY`** — `weekdays`, eine Liste, 0 = Sonntag. Mehrere sind erlaubt: ein
  Actionstep verträgt eine Nachfrage zur Wochenmitte _und_ eine kurz vor dem
  nächsten Abend — das sind zwei Erinnerungen, nicht dieselbe zweimal. Doppelte
  Tage werden entfernt und die Liste sortiert; leer oder `null` heißt „wie im
  Katalog", nicht „nie" (dafür gibt es `enabled`).
- **`EVENT`** — nur an/aus. „Wie oft" ist bei „du hast neue Gebetsbuddys" keine
  sinnvolle Frage.

Ein Knopf am falschen Typ ist ein `400` und kein stillschweigend gespeicherter
Wert, den nie jemand liest.

```bash
curl -X PUT .../push/settings/HOST_REMINDER -d '{"leadDays":7}'          # 200
curl -X PUT .../push/settings/HOST_REMINDER -d '{"leadDays":30}'         # 400, max 14
curl -X PUT .../push/settings/ACTIONSTEP_REMINDER -d '{"weekdays":[2,5]}' # 200, zweimal die Woche
curl -X PUT .../push/settings/MEETING_CANCELLED -d '{"weekdays":[3]}'    # 400, kein Wochentag
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

`latitude`, `longitude` und `address` dürfen leer bleiben; die Koordinaten aber
nur **gemeinsam**. Dieselbe Regel wie in der API, hier noch einmal in `seed.ts`,
weil sich sonst per CSV einsäen ließe, was ein `PATCH` auf denselben Ort mit
`400` ablehnt:

```
location.csv row 4 is invalid — longitude: latitude and longitude must be
filled in together, or both left empty
```

Die Positionen in den mitgelieferten Daten liegen in Karlsruhe und sind
**erfunden** — Demodaten, um „In Maps öffnen" ausprobieren zu können, keine
echten Anschriften.

## Code-Qualität

`oxlint` ersetzt ESLint (deutlich schneller, keine Plugin-Kette), Prettier bleibt für
die Formatierung zuständig. Konfiguration: [`.oxlintrc.json`](.oxlintrc.json).

Zwei bewusste Regel-Anpassungen:

- `typescript/no-extraneous-class` mit `allowWithDecorator` — NestJS-Module sind
  per Design leere dekorierte Klassen.
- `no-await-in-loop` aus für `prisma/**` und `scripts/**` — dort wird absichtlich
  sequenziell geschrieben.

```bash
pnpm check          # lint + format:check + typecheck + tests (das volle Gate)
pnpm typecheck      # nur tsc --noEmit, mit gedeckeltem Heap
```

### Speicher unter WSL

Die Entwicklungsmaschine hat 5,9 GB, WSL bekommt davon 3 GB, und der VS-Code-Server
belegt davon rund 1 GB. Wenn dort mehrere Node-Prozesse gleichzeitig laufen, ist
nicht der Compiler zu langsam — die VM stirbt.

Deshalb setzt `typecheck` **`--max-old-space-size=900`**. Der Wert ist bewusst
niedrig: ein kompletter Durchlauf braucht gemessen 474 MB, und ein hohes Limit
bedeutet nur, dass V8 bis dahin kaum aufräumt. Ein zu großzügiger Wert ist hier
gefährlicher als ein knapper.

Nicht gleichzeitig laufen lassen:

- `pnpm start:dev` (hält ein eigenes tsc-Programm im Speicher) **und** `pnpm check`
- `docker compose up` mit Keycloak (JVM, mehrere hundert MB) während eines Testlaufs

Für die End-to-End-Verifikation gegen die laufende API also erst `pnpm check`
durchlaufen lassen, danach den Stack starten — nicht beides parallel. Nach dem
Verifizieren `docker compose down`.

Host-seitig liegt eine [`.wslconfig`](https://learn.microsoft.com/windows/wsl/wsl-config)
im Windows-Benutzerordner. Entscheidend darin ist `swap=8GB`: der Standard von
1 GB gibt einer Speicherspitze nichts, wohin sie ausweichen kann. Änderungen dort
greifen erst nach `wsl --shutdown`.

Jest läuft mit `maxWorkers: 1`. Jeder Worker lädt sonst den kompletten generierten
Prisma-Client, was die Suite von ~4 s auf über 100 s aufbläht und zusätzlich die
Warnung „worker process has failed to exit gracefully" produziert. In Specs
deshalb `import type` verwenden, wo eine Klasse nur als Typ gebraucht wird.

### Erreichbarkeit von Windows aus

`main.ts` bindet ausdrücklich auf `0.0.0.0` statt Nest den Default zu überlassen.
Der wäre dual-stack `::` — und die localhost-Weiterleitung von WSL nach Windows
spiegelt davon nur `[::1]`. Ein Windows-Client, der `localhost` auf IPv4 auflöst
(Bruno tut das), landet dann auf `127.0.0.1:3000`, wo nichts lauscht, und meldet
`ECONNREFUSED`.

Nachprüfen lässt sich das mit der Windows-Binary, die im Windows-Netzwerk-Stack
läuft:

```bash
/mnt/c/Windows/System32/netstat.exe -ano | grep ':3000'
```

Erwartet wird eine Zeile `TCP 127.0.0.1:3000 … ABHÖREN`. Steht dort nur
`[::1]:3000`, bindet der Server wieder dual-stack. (Auf einem deutschen Windows
heißt der Status `ABHÖREN`, nicht `LISTENING` — ein Filter auf das englische Wort
findet nichts und sieht aus wie „kein Listener".)

Warum Keycloak trotzdem immer erreichbar ist: Docker Desktop veröffentlicht
seine Ports selbst auf `0.0.0.0` der Windows-Seite und geht am WSL-Relay vorbei.
Der Vergleich „8080 geht, 3000 nicht" spricht also nicht gegen das Relay.

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

## Sicherheit

**CORS.** Allowlist aus `CORS_ORIGINS`; ist die Liste leer, wird
Cross-Origin komplett verweigert (`origin: false`) statt auf `*` zu fallen.
`ETag` steht in `exposedHeaders` — **ohne das** liest ein Frontend auf einer
anderen Origin den Header nicht, kann kein `If-Match` schicken, und jeder
`PATCH` endet in `428`. Das gesamte Optimistic Locking hängt an dieser Zeile.

**Token.** Geprüft werden Signatur (JWKS), `iss`, `aud`, `azp`, `exp` und der
Algorithmus. `aud`/`azp` sind der Punkt: ohne sie ist jedes Token aus demselben
Realm gültig, auch eines, das eine ganz andere Anwendung für sich geholt hat.
Verifiziert mit einem korrekt signierten Token eines fremden Realm-Clients —
`401`. Keycloak setzt `aud` nur mit Audience-Mapper; den legt
`scripts/setup-keycloak.sh` beiden Clients an.

**Zwei Clients.** Ein Browser kann kein Secret halten:

| Client              | Art                           | Zweck                   |
| ------------------- | ----------------------------- | ----------------------- |
| `hauskreis-app`     | public, PKCE, Standard Flow   | das Frontend im Browser |
| `hauskreis-backend` | confidential, Service Account | Admin-API (Einladungen) |

`directAccessGrantsEnabled` bleibt am Backend-Client für lokale Skripte und die
Bruno-Collection — **in der Produktion gehört es aus**.

**Rate-Limiting.** 300/Minute, absichtlich großzügig: es geht um `/api/health`,
das ohne Token erreichbar ist und pro Aufruf eine Datenbankabfrage macht, und um
einen Client, der sich in einer Schleife verhakt. Dazu `trust proxy`, sonst zählt
hinter einem Reverse Proxy die ganze Gruppe als ein Aufrufer.

**Weiteres.** `helmet` mit Defaults, `compression`, Body-Limit explizit auf
128 kB, Autorisierungs-Header im Log redigiert, unbekannte Exceptions ohne
Stacktrace nach außen. Die Personenliste liefert `keycloakUserId` nicht aus.

### Abhängigkeiten

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

Die Musik-Zuständigen stehen **doppelt** in der API: unter
`…/meetings/:id/song-leaders` (dort wird geschrieben) und als `songLeaders` am
Termin selbst. Das ist Absicht — ohne das Feld bräuchte eine Terminliste pro
Karte eine zweite Anfrage, nur um „Musik: Lena" anzuzeigen.

### Ort und Gastgeber sind eine Entscheidung

`locationId` und `hostPersonId` waren zwei unabhängige Felder. Damit ließ sich
„Abend bei Chris" mit „Ort: Bei Niko" kombinieren — zwei Angaben, die einander
widersprechen, und niemand weiß, welche gilt. In der Praxis entstand genau das,
sobald jemand umzog.

Wer hostet, hostet bei sich. `MeetingService.resolveVenue` setzt das für
`create` **und** `update` durch, nicht die Oberfläche: die API ist auch aus
Bruno, aus einem Skript und aus der nächsten Ansicht erreichbar.

| Was ankommt                                          | Was passiert                                      |
| ---------------------------------------------------- | ------------------------------------------------- |
| `hostPersonId` einer Person mit Zuhause              | `locationId` wird dieses Zuhause                  |
| `hostPersonId` einer Person ohne Adresse             | `400` — ohne Wohnung kein Hosten                  |
| `hostPersonId` **und** ein abweichender `locationId` | `400`, keine stille Korrektur                     |
| `locationId` eines Zuhauses, ohne Gastgeber          | `400` — das geht nur über die Person              |
| `hostPersonId: null`                                 | eine Wohnung fällt mit weg, ein Treffpunkt bleibt |

Die letzte Zeile ist der Grund, warum `requiresHost` hier trägt: der
Schlosspark hing nie am Gastgeber, ihn mitzulöschen wäre Datenverlust. Eine
Wohnung ohne ihre Bewohner:innen dagegen ist kein Ort mehr, sondern ein
Widerspruch.

**Bestehende Daten**: die Migration
`20260803140000_meeting_venue_follows_host` zieht Widersprüche nur für
**kommende** Termine gerade. Ein vergangener Abend hat stattgefunden, und wo,
ist eine Tatsache — die zu überschreiben, weil das Modell heute strenger ist,
wäre das Umschreiben von Geschichte. Die Oberfläche zeigt solche Altfälle
weiter so an, wie sie notiert wurden; erst beim Bearbeiten greift die Regel.

### Ein vergangener Abend sagt niemandem mehr ab

`cancel` und der Statuswechsel über `update` verschicken die
`MEETING_CANCELLED`-Benachrichtigung nur für Termine, die noch bevorstehen.
Rückwärts heißt „absagen" nicht „fällt aus", sondern „hat nicht
stattgefunden" — ein Nachtrag fürs Archiv. Eine Push-Nachricht darüber wäre
eine Warnung vor etwas, das längst vorbei ist.

Der heutige Abend zählt dabei als kommend: `meeting.date` ist ein Kalendertag,
und ohne den Zuschnitt auf UTC-Mitternacht wäre ein Termin ab 00:01 Uhr
„vergangen" und jede Absage am Tag selbst stumm.

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

### Zuhause oder Treffpunkt

Ein Ort ist eines von beidem, und der Unterschied trägt fast jede Bedienung:

|                | Zuhause                        | Treffpunkt            |
| -------------- | ------------------------------ | --------------------- |
| `requiresHost` | `true`                         | `false`               |
| `residents`    | mindestens eine Person         | leer                  |
| Name           | abgeleitet: „Bei Niko & Chris" | frei gewählt          |
| entsteht durch | eine Adresse im Profil         | `POST …/locations`    |
| verschwindet   | wenn alle ausziehen            | `DELETE` (legt still) |

Der Name eines Zuhauses wird **nirgends getippt**. `syncHomeName` zieht ihn an
den Bewohner:innen nach, sobald jemand ein- oder auszieht — sonst hieße eine
Wohnung „Bei Niko & Chris", obwohl Chris längst woanders wohnt, und stünde mit
ihrem Gewicht in der Rotation, ohne dass jemand dort einladen könnte. Aus
demselben Grund ist `active` bei Zuhausen abgeleitet: bewohnt heißt verfügbar.

**Der Schlüssel ist die Anschrift, nicht der Name.** `addressKey` ist die
normalisierte Adresse (Kleinschreibung, Umlaute ausgeschrieben, „Str."/„Straße"
vereinheitlicht, Satzzeichen weg — siehe [`address.ts`](src/location/address.ts))
und trägt die Eindeutigkeit. Zwei Gründe: abgeleitete Namen können kollidieren,
sobald zwei Menschen denselben Vornamen haben; und nur so erkennt
`POST …/locations/resolve-address` eine **Wohngemeinschaft**, wenn die zweite
Person dieselbe Adresse einträgt. Ob daraus wirklich ein gemeinsamer Haushalt
wird, entscheidet die Person — die Route antwortet, sie zieht niemanden ein.

**Eine Wohnung entsteht über `PUT /api/me/home`**, nicht über `…/locations`.
Ein Aufruf statt dreier (auflösen, anlegen, Person ändern): mitten darin
abzubrechen hinterließe eine Wohnung ohne Bewohner:innen. Wohnt unter der
Anschrift schon jemand, antwortet die Route mit `409` und nennt die Namen —
weiter geht es nur mit `joinExisting: true`. Das ist Absicht: gleiche Anschrift
ist ein starkes Indiz für eine Wohngemeinschaft, aber ein Tippfehler sieht
genauso aus, und ein stiller Zusammenzug halbierte still das Gewicht beider.

`capacity` gehört dabei der Wohnung, nicht der Person: in einer
Wohngemeinschaft sehen und ändern alle Bewohner:innen dieselbe Zahl. Ein
Wohnzimmer hat eine Größe, unabhängig davon, wer sie einträgt.

**Orte darf jede:r anlegen und ändern**, ohne Admin-Rolle. Ein Treffpunkt
entsteht im Vorbeigehen, und wer dafür erst jemanden mit Rechten suchen muss,
trägt ihn gar nicht erst ein. Geschützt ist das Zuhause: `DELETE` antwortet mit
`409`, solange dort jemand wohnt. Und gelöscht wird nie — `active = false`
nimmt einen Ort aus der Auswahl und lässt die Vergangenheit heil, sonst stünde
im Archiv „irgendwo".

### Wo der Ort liegt

Ein Ort trägt optional `latitude`, `longitude` und `address` — genug für ein
„In Maps öffnen" im Frontend, ohne dass das Backend eine Karten-URL bauen und
sich damit auf einen Anbieter festlegen müsste.

**Beide Koordinaten oder keine.** Eine Breite ohne Länge zeigt auf nichts; das
Frontend könnte daraus keinen Link bauen und müsste den halben Zustand trotzdem
behandeln. Das DTO lehnt ihn deshalb mit `400` ab, in beide Richtungen — auch
das Löschen nur einer Hälfte. Prisma kennt keine feldübergreifende Bedingung,
also sitzt die Regel im Schema von Zod, nicht in der Datenbank.

`Float`, nicht `Decimal`, aus demselben Grund wie bei `hostWeight`: `Decimal`
serialisiert als String und zwänge das Frontend zum Parsen, bevor es die Zahl
in eine URL schreiben kann. Ein Double trifft Koordinaten auf etwa zehn
Nanometer genau — für ein Wohnzimmer reichlich.

Die Adresse ist keine Ableitung der Koordinaten und umgekehrt: zum Navigieren
ist der Punkt genauer, zum Vorlesen am Telefon die Anschrift. Der Home-Screen
liefert alle drei Felder im Kontext des nächsten Treffens gleich mit.

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

### Abgehakt wird pro Person

`PUT …/meetings/{id}/actionstep-done` mit `{ "done": true|false }`.

Eine eigene Tabelle (`meeting_actionstep_done`) statt eines Häkchens am Termin:
der Actionstep ist ein Vorsatz, den sich jede:r einzeln nimmt. Ein Feld am
Abend hieße „einer hakt ab, für alle" — und dass eine Person es geschafft hat,
sagt über die anderen acht nichts.

Kein Boolean in der Zeile, sondern die reine **Anwesenheit** einer Zeile:
abgehakt oder nicht abgehakt, ein dritter Zustand wäre erfunden. `done_at` ist
deshalb `NOT NULL`.

**Ohne `If-Match`.** Es ist ein Schalter, kein Wettlauf: zwei Personen, die
gleichzeitig abhaken, schreiben verschiedene Zeilen, und dieselbe Person
zweimal schreibt zweimal dasselbe. Es gibt nichts, was ein `412` retten könnte
— und einen Haken erst nach einem `GET` setzen zu dürfen, wäre für die
Erinnerung auf dem Startbildschirm ein Umweg ohne Gegenwert. Die Route steht
deshalb in der `UNCONDITIONAL`-Liste des Frontend-Clients.

**Kein `personId` im Body**, anders als bei der Teilnahme: einen Vorsatz hakt
man für sich ab, nicht füreinander. Wer gemeint ist, steht im Token.

Idempotent in beide Richtungen. Nochmal abhaken behält den ursprünglichen
`doneAt` (das Feld heißt „seit wann", nicht „zuletzt angetippt"), und ein
Haken, den es nicht gibt, lässt sich folgenlos entfernen.

**Wirkung auf den Reminder:** wer abgehakt hat, wird nicht mehr gefragt, wie es
läuft. Genau dafür ist der Haken da — sonst wäre er nur Statistik.

Angezeigt wird er an drei Stellen, mit verschiedener Auflösung:

| Wo            | Feld                                            | warum                        |
| ------------- | ----------------------------------------------- | ---------------------------- |
| Termin-Detail | `actionstepDone: [{ person, doneAt }]`          | Namen — wen man fragen kann  |
| Home-Screen   | `openActionstep.done`/`doneCount`/`peopleCount` | dein Haken und „5 von 9"     |
| Archiv        | dasselbe wie im Termin (die Liste liefert es)   | wie es der Gruppe damit ging |

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

### Woher die Absagen kommen

Diese drei reagieren auf Absagen für einen einzelnen Abend — egal ob jemand sie
selbst eingetragen hat oder ob sie aus einem Abwesenheitszeitraum stammen. Beide
laufen durch denselben Pfad, deshalb brauchte die Abwesenheit keinen eigenen
Notification-Code: **der Zeitraum liefert die Absagen, dieses Kapitel reagiert
darauf.**

## Abwesenheit

„Ich bin vom 10. bis 24. weg." Beide Enden **inklusive** — bis zum 24. heißt, der 24. ist noch weg.

| Methode  | Pfad                             | Rechte                            |
| -------- | -------------------------------- | --------------------------------- |
| `GET`    | `…/absences?scope=upcoming\|all` | eingeloggt (paginiert)            |
| `POST`   | `…/absences`                     | eigene; fremde nur `admin`        |
| `PATCH`  | `…/absences/:id`                 | wie oben, `If-Match` erforderlich |
| `DELETE` | `…/absences/:id`                 | wie oben                          |
| `POST`   | `…/absences/sync`                | `admin` (manueller Nachlauf)      |

Die Liste zeigt **alle**, nicht nur die eigenen: wer weg ist, ist genau das, was
beim Planen eines Abends interessiert. `personId` beim Anlegen ist optional —
ohne trägt man sich selbst ein, mit darf nur ein Admin, was es möglich macht,
einen Urlaub für jemanden zu notieren, der sich noch nie eingeloggt hat.

### Der Zeitraum ist die Wahrheit, die Absagen sind abgeleitet

Ein Zeitraum schreibt `meeting_attendance`-Zeilen für die Abende, die er abdeckt.
Das ist bewusst materialisiert statt bei jeder Frage neu berechnet: sonst müsste
jede Stelle, die „wer kommt" fragt — der Host, die Gästezahl, die Kapazitätsregel
— es einzeln nachschlagen, und in der Teilnehmerliste stünde nichts, wo die Leute
hinschauen.

Die Zeilen tragen deshalb `source`:

- **`SELF`** — jemand hat für diesen Abend geantwortet. Wird **nie** von einem
  Zeitraum überschrieben oder zurückgenommen.
- **`ABSENCE`** — aus einem Zeitraum abgeleitet. Wird beim nächsten Abgleich neu
  aufgebaut.

Ohne diese Spalte ginge ein „doch, ich komme an dem Abend" verloren, sobald der
Urlaub später bearbeitet wird. Eine Antwort von Hand beansprucht die Zeile
deshalb auch dann, wenn ein Zeitraum sie angelegt hat.

Der Abgleich läuft **nur vorwärts**. Ein nachträglich eingetragener Urlaub soll
nicht umschreiben, wer letzte Woche da war.

Bearbeiten heißt „neu aufbauen", nicht „nachbessern": Verkürzen gibt Abende
zurück, Verlängern nimmt welche weg, und keiner der beiden Fälle braucht zu
wissen, wie der Zeitraum vorher aussah. Zusätzlich läuft nachts um 3:30 ein
Abgleich für alle — Termine entstehen im Voraus, und ein Abend, der heute erzeugt
wird, kann in einen Urlaub von vor drei Wochen fallen.

### Was das für die Vorschläge bedeutet

**Wer weg ist, verdient kein Guthaben.** Das ist die eigentliche Feinheit. Eine
Wohnung, deren Bewohner:innen im Urlaub sind, fällt für diese Abende aus der
Rechnung heraus — sowohl aus der Auszahlung als auch aus dem Nenner. Bliebe sie
im Nenner, verpuffte ihr Anteil und alle Anwesenden sähen mit der Zeit
unterversorgt aus, was dasselbe ist wie „niemandem steht etwas zu". Und ohne den
Ausschluss käme jemand aus drei Wochen Urlaub mit drei Abenden Guthaben zurück
und wäre erstmal Dauerhost.

Das ist der Unterschied zum Zurückstellen: eine Wohnung, die für den Abend zu
klein ist oder deren Bewohner:innen schon etwas anderes machen, **verdient
weiter** — die Gelegenheit wurde ihr genommen. Wer wegfährt, hat sie abgegeben.

**Niemand verschwindet kommentarlos.** Abwesende stehen weiterhin in der Liste,
nur hinten und mit Begründung — dasselbe Prinzip wie bei Sofies Kapazität. Ein
Name, der einfach fehlt, sieht aus wie ein Fehler:

```
 7. Julian    Bei Julian & Marlene   credit=-0.4071
 8. Niko      Bei Niko               credit= 0.1622  weg AWAY
 9. sofie     Bei Sofie              credit= 0.1186  TOO_SMALL
```

Zwei getrennte Angaben, weil sie Verschiedenes bedeuten: `facts.away` heißt
„diese Person ist weg", `deferredReason: 'AWAY'` heißt „die ganze Wohnung ist
leer". Bei einer geteilten Wohnung, in der eine:r verreist ist, gilt nur das
Erste — es macht ja jemand die Tür auf.

Themen- und Musik-Vorschläge kennen keine Wohnung und lassen Abwesende schlicht
weg.

### Wo Abwesenheit bewusst nicht zählt

Die Gebetsbuddy-Rotation ignoriert Abwesenheiten vollständig und teilt weiter
zu. Füreinander beten hängt nicht daran, in der Stadt zu sein — jemanden für eine
Runde auszulassen würde ihm ausgerechnet das nehmen, was ein Urlaub nicht
unterbricht.

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

### Fünf Runden im Voraus

`PrayerBuddyGeneratorService` hält immer **fünf Runden** vor, die laufende
mitgezählt — dasselbe Muster wie `MEETINGS_AHEAD` bei den Terminen. Vorher
entstand eine Runde erst an dem Morgen, an dem die vorige auslief; „mit wem
bete ich ab übernächster Woche" war schlicht nicht beantwortbar.

Der Lauf ist **täglich** um 4 Uhr, nicht alle zwei Wochen: ein 14-tägiger Cron
würde eine Rotation still überspringen, wenn der Server an dem Morgen gerade
steht. Die tägliche Frage „stehen fünf Runden" heilt sich selbst und kostet
eine Query, wenn die Antwort ja ist.

Gebaut wird **eine nach der anderen**, nicht in einem Rutsch. Jede Runde
gruppiert aus der Historie _einschließlich_ der gerade geplanten; ohne das
Nachlesen kämen alle fünf identisch heraus, denn der Algorithmus ist
deterministisch und bekäme fünfmal dieselbe Eingabe.

Angekündigt wird beim Vorausplanen **nichts**. Wer im Juli erfährt, mit wem er
im Oktober betet, hat keine Erinnerung bekommen, sondern Lärm. Angekündigt wird
die Runde, die _läuft_ — und zwar täglich, was nichts kostet, weil
`NotificationService.notify` über die Gruppen-Id dedupliziert. Ein verpasster
Morgen wird damit zu einer späten Benachrichtigung statt zu gar keiner.

Nach einer **Lücke** — Server war wochenlang aus — beginnt die nächste Runde
heute, nicht rückwirkend. Runden nachzutragen, die niemand erlebt hat, wäre
erfundene Geschichte.

| Methode | Pfad                       | Rechte                          |
| ------- | -------------------------- | ------------------------------- |
| `GET`   | `…/prayer-buddies/current` | eingeloggt                      |
| `GET`   | `…/prayer-buddies`         | eingeloggt (paginiert, `scope`) |
| `GET`   | `…/prayer-buddies/config`  | eingeloggt                      |
| `PUT`   | `…/prayer-buddies/config`  | `admin` (`If-Match`)            |
| `POST`  | `…/prayer-buddies/rotate`  | `admin`                         |
| `POST`  | `…/prayer-buddies/plan`    | `admin`                         |

### `scope` bestimmt Ausschnitt und Richtung

| `scope`    | was                          | Reihenfolge |
| ---------- | ---------------------------- | ----------- |
| `upcoming` | laufende und kommende Runden | vorwärts    |
| `past`     | abgeschlossene Runden        | rückwärts   |
| `all`      | beides (Vorgabe)             | rückwärts   |

Die Grenze ist das **Ende** des Zeitraums, nicht der Anfang: die laufende Runde
ist nicht vorbei und gehört deshalb zu `upcoming`. Die Richtung folgt aus dem
Ausschnitt und ist kein zweiter Parameter — kommende Runden liest man vorwärts
(die nächste zuerst, das ist die Frage), vergangene rückwärts wie jedes Archiv.

### Was der Admin darf

**Rhythmus ändern** (`PUT …/config`, 1–12 Wochen). Gilt ab der **nächsten**
Rotation — die laufende Zuteilung behält ihre Daten, damit niemandem seine
Buddys unter den Füßen weggezogen werden, nur weil eine Einstellung sich
bewegt hat.

**Vorausplanen von Hand** (`POST …/plan`) — derselbe Lauf wie nachts, für die
Einrichtung und zum Nachschauen. Idempotent: ein zweiter Aufruf antwortet mit
`created: 0`.

**Jetzt weiterschalten** (`POST …/rotate`), auch mitten in einer laufenden
Periode. Zuerst macht die laufende Runde Platz, in zwei bewusst
unterschiedlichen Weisen:

- **Heute erst gestartet** → sie wird als _verworfen_ markiert. Sie war nie in
  Kraft, taucht also nicht im Archiv auf.
- **Früher gestartet** → sie wird auf gestern beendet. Die Tage haben
  stattgefunden, die Paarungen bleiben im Archiv.

Dann wird die **nächste geplante Runde auf heute vorgezogen**, und alles
dahinter rutscht um dieselbe Zahl von Tagen mit; hinten wird wieder auf fünf
aufgefüllt. Sie wird _nicht_ verworfen und neu gewürfelt: sie entstand aus
derselben Historie gegen dieselben Leute, ein frischer Wurf käme fast gleich
heraus — und der Sinn des Vorausplanens ist, dass der Plan etwas bedeutet. Nur
wenn keine geplante Runde da ist, wird eine gebaut.

`created` in der Antwort heißt deshalb „es läuft jetzt eine **andere** Runde",
nicht „es wurden Zeilen angelegt". Für die Fragende ist beides dasselbe.

Verworfene Zuteilungen werden **markiert, nicht gelöscht**. Ohne sie wüsste der
deterministische Algorithmus nichts von der abgelehnten Aufteilung und gäbe
dieselbe zurück. Verifiziert: drei Rotationen hintereinander ergeben drei
verschiedene Aufteilungen, das Archiv zeigt trotzdem nur eine Periode.

`notify: false` im Body schaltet still weiter.

### Warum das Notification-Log eine Spalte mehr hat

`notification_log` deduplizierte über `(person, typ, termin)`. Gebetsbuddy-
Zuteilungen hängen an keinem Termin, also wäre jede Rotation als „schon
geschickt" durchgefallen — **nur die allererste** wäre je angekündigt worden.
`related_group_id` macht jede Rotation zu ihrer eigenen Nachricht.

Nebenbei festgehalten: der Unique-Index kann das ohnehin nicht erzwingen.
Postgres behandelt Zeilen mit einem NULL im Tupel als verschieden, und beide
Bezugsspalten sind nullable. Die echte Prüfung ist die Query in
`hasBeenSent` — der Index macht sie nur schnell.

## Home-Screen und Zuteilungen

Zwei Routen aus [`src/dashboard/`](src/dashboard/) — eine Sicht auf vorhandene
Daten, wie das Archiv, ohne eigene Tabellen.

`GET …/assignments?from=&to=&personId=` liefert alle vier Rollenarten als eine
**flache, einheitlich geformte Liste**. `personId` ist optional: ohne ihn ist es
die Mehrwochen-Tabelle aus CLAUDE.md §9, mit ihm sind es die Badges für den
Home-Screen. Eine Route für beides, damit die zwei Ansichten nicht
unterschiedlicher Meinung darüber sein können, wer an einem Abend dran ist.

```jsonc
{ "role": "HOST", "date": "2026-08-04", "endDate": null,
  "meetingId": "…", "person": {…}, "label": "Bei Chris" }

{ "role": "PRAYER_BUDDY", "date": "2026-08-01", "endDate": "2026-08-14",
  "groupId": "…", "person": {…}, "label": "mit Antonia und Reini" }
```

Alle Rollen tragen dieselbe Form, obwohl eine Gebetsbuddy-Periode zwei Wochen
umspannt und eine Termin-Rolle auf einen Tag fällt — sonst müsste jeder Konsument
auf vier Formen verzweigen. Abgesagte Abende bleiben draußen. Gebetsbuddy-Perioden
zählen bei **Überlappung**, nicht nur wenn sie ganz im Zeitraum liegen: eine
Runde, die im Juli begann, läuft im August weiter.

Zwei Prisma-Aufrufe unabhängig vom Zeitraum. Die Spanne ist auf **366 Tage**
begrenzt, weil es hier keine Pagination gibt, auf die man zurückfallen könnte.

`GET …/home` setzt daraus den ganzen Home-Screen in **einem** Request zusammen:
nächster Termin mit Ort, Host, Thema und eigenem Teilnahmestatus, eigene Rollen
der nächsten acht Wochen, offener Actionstep, aktuelle Gebetsbuddys. Auf dem
Handy sind die Round Trips der Preis. Neue Logik entsteht dabei nicht — der
Actionstep folgt derselben Regel wie der Reminder.

### Der nächste Termin trägt alle drei Rollen

`nextMeeting` nennt **Host, Thema und Musik**, und beim Thema die zuständigen
Personen, nicht nur den Titel. Der Grund für den Umweg über die Personen: ein
Thema hat oft gar keinen Titel (CLAUDE.md §5, „nicht jeder trägt vorab einen
Titel ein"), und dann stünde über das Thema des Abends sonst nichts da.

```jsonc
"topic":       { "id": "…", "title": null, "responsibles": [{ "id": "…", "name": "Antonia" }] },
"songLeaders": [{ "id": "…", "name": "Lena" }]
```

`songLeaders` ist hier **flach**, anders als im Termin-DTO, wo jede Zeile in
`{ "person": … }` steckt. Dort spiegelt die Hülle die Verknüpfungstabelle; hier
ist es eine eigens für einen Bildschirm gebaute Ansicht, und die Hülle wäre nur
Ballast. Eine leere Liste ist gültig — nicht jeder Abend hat Lieder.

### `myRoles` sind Aufgaben, keine Zuteilungen

In `myRoles` stehen nur `HOST`, `TOPIC` und `SONG`. Die Gebetsbuddys fehlen
absichtlich: sie stehen schon in `prayerBuddies`, sie haben ihren eigenen
Bildschirm, und mit jemandem zu beten ist nichts, was man abarbeitet. Ein
Home-Screen, der es unter „Deine Rollen" mitzählt, macht aus einer Beziehung
eine Aufgabe.

Die vollständige Liste über alle vier Rollen gibt es weiterhin — in
`…/assignments`. Die Route beantwortet „wer ist wann dran", diese hier „was
liegt bei dir an".

### Der Ort kommt mit Position

Damit der Home-Screen ein „In Maps öffnen" anbieten kann, ohne den Ort einzeln
nachzuladen:

```jsonc
"location": {
  "id": "…", "name": "Bei Sofie",
  "latitude": 48.7758, "longitude": 9.1829,
  "address": "Königstraße 1, 70173 Stuttgart",
  "requiresHost": true
}
```

Die drei Ortsangaben sind optional. `latitude` und `longitude` sind entweder
beide gesetzt oder beide `null` — das erzwingt das Location-DTO, siehe unten.
Die Adresse ist unabhängig davon: zum Navigieren ist der Punkt genauer, zum
Vorlesen am Telefon die Anschrift.

`requiresHost` steht dabei, damit „kein Host nötig" nicht wie ein vergessener
Host aussieht. Ein Treffen im Schlosspark hat keinen und braucht keinen.

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

## Archiv

Das Archiv ist eine **Sicht** auf Vorhandenes, kein eigener Datenbestand. Die
Listen bleiben deshalb dort, wo die Daten liegen — `…/meetings?scope=past`,
`…/topics`, `…/songs` — statt als `/archive/meetings` ein zweites Mal zu
existieren und mit der Zeit auseinanderzulaufen. Alles read-only, es gibt nichts
zu schreiben.

| Zweck                  | Aufruf                                     |
| ---------------------- | ------------------------------------------ |
| Überblick, Jahresliste | `GET …/archive`                            |
| Vergangene Abende      | `GET …/meetings?scope=past`                |
| Suche im Archiv        | `…&search=Vergebung`                       |
| Ein Jahr               | `…&from=2026-01-01&to=2026-12-31`          |
| Abgeschlossene Themen  | `GET …/topics?status=COMPLETED&search=…`   |
| Song-Datenbank         | `GET …/songs?sort=popular&playedOnly=true` |

### Suche

Bei Terminen läuft sie über **alle** Textfelder — Titel, Zusammenfassung,
Actionstep, Info, Testimony und den Titel des Themas. Die Archivfrage lautet
„wann ging es nochmal um Vergebung", und niemand weiß mehr, in welchem der
Felder das gelandet ist. `contains` mit `insensitive`, kein Volltext-Index: bei
ein paar hundert Abenden kostet die Pflege des Index mehr als der Scan.

`from`/`to` **verengen** den Scope, sie ersetzen ihn nicht. `scope=past` mit
einem `to` im nächsten Jahr hört trotzdem heute auf — sonst würde das Archiv
still anfangen, Abende aufzuführen, die noch gar nicht stattgefunden haben.

### Songs: was wir wirklich singen

Jeder Song trägt `timesPlayed` und `lastPlayedAt`. Gezählt werden nur Abende, an
denen er tatsächlich **ausgewählt** war (`isSelected`) — ein Vorschlag, der es
nicht auf die Liste geschafft hat, sagt etwas über einen Wunsch aus, nicht über
das Repertoire. `lastPlayedAt: null` heißt „noch nie gesungen".

`sort=title` (Default) ist die Reihenfolge zum Tippen. `popular` und `recent`
sind die Archivfragen: was singen wir dauernd, und was haben wir ewig nicht mehr
gesungen. Bei `recent` stehen nie gesungene Songs **hinten** — ein leeres Datum
heißt „kennen wir noch nicht", nicht „ewig her".

Sortiert wird in TypeScript, nicht in SQL, und **danach** paginiert. Ließe man
die Datenbank zuerst blättern, würde sie eine alphabetische Seite schneiden und
erst diese Seite ranken — Seite 2 könnte dann Seite 1 überholen.

### Abende werden abgeschlossen

`MeetingStatus.COMPLETED` stand seit dem Termin-Kern im Enum und wurde nie
gesetzt; das Archiv führte Abende von vor Monaten als „geplant". Der nächtliche
Generator setzt vergangene `PLANNED`-Abende jetzt auf `COMPLETED`. Abgesagte
behalten ihren Status: „fiel aus" ist eine andere Tatsache als „hat
stattgefunden", und das Archiv soll beides unterscheiden können.

## Produktion: Docker

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Das [Dockerfile](Dockerfile) ist mehrstufig. `prisma generate` muss **vor**
`nest build` laufen, sonst fehlen die Typen aus `generated/prisma`. Der Container
läuft als `node`, nicht als root, und hat einen `HEALTHCHECK` auf `/api/health`.

### Was im Container anders ist

Gegen das gebaute Image geprüft, gegen die lokale Datenbank und Keycloak:

|               |                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------- |
| Banner        | erscheint in `docker logs`, ohne Farben und ohne Strg+C-Hinweis — `process.stdout.isTTY` ist falsch |
| Version       | `0.0.1`, denn `package.json` liegt im Image unter dem `WORKDIR /app`                                |
| Bindung       | `0.0.0.0`, sonst wäre der Port aus dem Container heraus nicht erreichbar                            |
| `HEALTHCHECK` | nach der `start-period` von 20 s `healthy`                                                          |
| `docker stop` | 1,3 s, Exit-Code 0, beide Shutdown-Zeilen im Log                                                    |
| Keycloak      | Issuer aus `KEYCLOAK_URL`, JWKS über `KEYCLOAK_INTERNAL_URL` — `/api/me` antwortet `200`            |

Der Shutdown ist im Container **kein Selbstläufer**: die Exec-Form des `CMD`
macht node zu **PID 1**, und für PID 1 installiert Linux keine
Standard-Signalbehandlung. Ein Prozess ohne eigenen SIGTERM-Handler würde das
Signal schlicht ignorieren, und Docker müsste nach zehn Sekunden SIGKILL
nachschieben — mit gekappten Datenbankverbindungen. `installShutdownHandlers()`
registriert den Handler, deshalb sind es 1,3 Sekunden statt zehn.

**Eine Abweichung, die man kennen sollte:** entwickelt und getestet wird auf
Node 24, das Image liefert Node 22 (`node:22-alpine`). Beides läuft, aber es ist
nicht dasselbe. Wer angleichen will, setzt im Dockerfile `node:24-alpine` und
baut neu.

**Migrationen sind ein eigener, vorgelagerter Service** (`migrate` im
Prod-Compose), nicht etwas, das die App beim Start tut: das macht die Reihenfolge
sichtbar, scheitert für sich statt mitten im Boot-Log, und falls je mehr als eine
Instanz läuft gibt es kein Rennen. Er läuft aus der `build`-Stufe, die den
Prisma-CLI hat.

Zwei Dinge, die man wissen sollte:

- **Eine Instanz, nicht mehr.** Die Cron-Jobs (`@nestjs/schedule`) laufen
  in-process. Mit zwei Instanzen feuern Terminegenerator,
  Gebetsbuddy-Rotation und alle Reminder doppelt. Für neun Leute ist eine
  Instanz richtig — aber es muss dastehen.
- **1,25 GB**, das meiste Prismas Query-Engines. Der Prisma-CLI landet trotz
  `--prod` im Image, weil er optionaler Peer von `@prisma/client` ist und die
  Peer-Auflösung im Lockfile steckt. Wissenswert, nicht bekämpfenswert.

  Es waren einmal 1,78 GB, wegen eines abschließenden `RUN chown -R node:node
/app`. Ebenen sind unveränderlich: ein rekursives `chown` schreibt jede Datei
  neu und legt damit eine vollständige Kopie des `node_modules`-Baums als
  eigene Ebene an — 423 MB obendrauf, während das Original darunter liegen
  bleibt. Der `chown` ist ersatzlos gestrichen. Nötig war er nie: die Dateien
  gehören root und sind mit `755`/`644` für alle lesbar, und die Anwendung
  schreibt nirgends ins Dateisystem. Der Prozess läuft weiterhin als
  `uid=1000(node)`.

Im Prod-Compose läuft Keycloak in `start` statt `start-dev`, Ports hängen an
`127.0.0.1` statt an allen Interfaces, und keine Zugangsdaten stehen in der
Datei.

### Das Image lokal ausprobieren

In der Entwicklung enthält [`docker-compose.yml`](docker-compose.yml) bewusst
**keinen** API-Container: die App läuft mit `pnpm start:dev` auf dem Host, wo
sie nach jeder Codeänderung in Sekunden neu startet statt in Minuten neu gebaut
zu werden. Im Prod-Compose ist sie dabei, weil es dort kein Neuladen gibt.

Wer trotzdem nachsehen will, ob das fertige Image tut, was es soll, nimmt das
Profil `image` — es hängt den Produktions-Container an dieselben
Entwicklungsdienste:

```bash
docker compose --profile image up -d --build api   # starten
docker compose --profile image logs -f api         # Banner ansehen
docker compose --profile image down                # wieder weg
```

Ohne `--profile image` taucht der Dienst gar nicht erst auf, ein gewöhnliches
`docker compose up -d` startet ihn also nicht versehentlich mit.

**Port 3030 auf dem Host, 3000 im Container.** Die Schreibweise `3030:3000` ist
`HOST:CONTAINER`; die 3030 hält deinem parallel laufenden `pnpm start:dev`
seinen Port 3000 frei. Im Banner steht trotzdem `3000` — er wird **im**
Container ausgegeben, und der Prozess kennt nur seinen eigenen Port. Die
Weiterleitung entscheidet Docker außerhalb und kann bei jedem Start anders
aussehen. Auch das `localhost` in der Adresszeile meint aus Containersicht den
Container selbst, nicht deinen Rechner.

### `localhost` gilt nur, solange der Server auf dem Host läuft

Die `.env.example` ist auf die Entwicklung ausgelegt: der Server läuft mit
`pnpm start:dev` auf dem Host, die Dienste aus `docker-compose.yml`
veröffentlichen ihre Ports dorthin, und `localhost` stimmt für alles. Sobald der
Server selbst im Container läuft, zeigt `localhost` auf **den Container** — jede
dieser Adressen muss auf den Compose-Namen umgestellt werden. Das Prod-Compose
tut das bereits, aber wer die Werte von Hand setzt, sollte den Unterschied
kennen:

| Variable                | Entwicklung (Host)      | Compose (Container)         |
| ----------------------- | ----------------------- | --------------------------- |
| `DATABASE_URL`          | `…@localhost:5432/…`    | `…@postgres:5432/…`         |
| `KEYCLOAK_URL`          | `http://localhost:8080` | die **öffentliche** Adresse |
| `KEYCLOAK_INTERNAL_URL` | leer                    | `http://keycloak:8080`      |
| `CORS_ORIGINS`          | `http://localhost:3001` | die Origin des Frontends    |

Bei Keycloak reicht ein einzelner Wert nicht, und das ist der Punkt, an dem der
Umzug typischerweise scheitert. `KEYCLOAK_URL` hat **zwei** Aufgaben, die im
Container auseinanderfallen:

- Aus ihr wird der **Issuer**, und der wird gegen den `iss` im Token geprüft.
  Keycloak schreibt dort seinen `KC_HOSTNAME` hinein — die öffentliche Adresse,
  über die sich der Browser angemeldet hat. Trägt man hier `http://keycloak:8080`
  ein, passt der Issuer nicht mehr und **jeder** Request endet in `401`.
- Über sie holt der Server die **Signaturschlüssel** (JWKS) und spricht die
  Admin-API an. Trägt man hier die öffentliche Adresse ein und der Container
  kommt nicht an sie heran — was hinter einem Heimrouter ohne Hairpin-NAT der
  Normalfall ist — schlägt der Abruf fehl, und wieder endet **jeder** Request in
  `401`.

Deshalb `KEYCLOAK_INTERNAL_URL`: Issuer bleibt öffentlich, der Abruf geht über
das Compose-Netz. Leer lassen heißt "dieselbe wie `KEYCLOAK_URL`" — richtig für
alles, was nicht in einem Container läuft. Beide Werte müssen `http://` oder
`https://` haben; `keycloak:8080` ist für `z.url()` eine gültige URL mit dem
Schema `keycloak:` und würde sonst erst beim ersten Request auffallen.

Damit das aufgeht, muss `KC_HOSTNAME` bei Keycloak auf dieselbe öffentliche
Adresse gesetzt sein wie `KEYCLOAK_URL` beim Backend. Das Prod-Compose leitet
beide aus derselben Variable ab.

## API (Stand: Phase 10)

| Methode                 | Pfad                                         | Rechte                                       |
| ----------------------- | -------------------------------------------- | -------------------------------------------- |
| `GET`                   | `/api/health`                                | öffentlich                                   |
| `GET`                   | `/api/me`                                    | eingeloggt (verknüpft beim ersten Login)     |
| `PUT`/`DELETE`          | `/api/me/home`                               | eingeloggt (`409` ohne `joinExisting`)       |
| `PATCH`                 | `/api/me/email`                              | eingeloggt (Keycloak **und** `person`)       |
| `GET`/`POST`            | `/api/hauskreise`                            | eingeloggt                                   |
| `GET`                   | `/api/hauskreise/:hauskreisId/people`        | eingeloggt                                   |
| `POST`                  | `/api/hauskreise/:hauskreisId/people`        | `admin`                                      |
| `POST`                  | `/api/hauskreise/:hauskreisId/people/invite` | `admin`                                      |
| `PATCH`                 | `/api/hauskreise/:hauskreisId/people/:id`    | eingeloggt                                   |
| `DELETE`                | `/api/hauskreise/:hauskreisId/people/:id`    | `admin` (löscht offene Einladung samt Konto) |
| `GET`                   | `…/locations`, `…/locations/:id`             | eingeloggt                                   |
| `POST`                  | `…/locations/resolve-address`                | eingeloggt                                   |
| `POST`/`PATCH`/`DELETE` | `…/locations[/:id]`                          | eingeloggt (`409` bei bewohnter Wohnung)     |
| `GET`                   | `…/meetings?scope=…&search=&from=&to=`       | eingeloggt (paginiert)                       |
| `GET`                   | `…/meetings/:id`                             | eingeloggt                                   |
| `GET`                   | `…/meetings/:id/host-suggestions`            | eingeloggt                                   |
| `GET`                   | `…/meetings/:id/topic-suggestions`           | eingeloggt                                   |
| `POST`                  | `…/meetings`                                 | eingeloggt                                   |
| `PATCH`                 | `…/meetings/:id`                             | eingeloggt                                   |
| `POST`                  | `…/meetings/:id/cancel`                      | eingeloggt                                   |
| `PUT`                   | `…/meetings/:id/attendance`                  | eingeloggt                                   |
| `PUT`                   | `…/meetings/:id/actionstep-done`             | eingeloggt (ohne If-Match, für sich selbst)  |
| `DELETE`                | `…/meetings/:id`                             | `admin`                                      |
| `POST`                  | `…/meetings/generate`                        | `admin` (manueller Generator-Trigger)        |
| `POST`                  | `…/meetings/host-reminders`                  | `admin` (manueller Reminder-Trigger)         |
| `POST`                  | `…/meetings/actionstep-reminders`            | `admin` (manueller Reminder-Trigger)         |
| `GET`                   | `…/topics?status=…&search=&from=&to=`        | eingeloggt (paginiert)                       |
| `GET`                   | `…/topics/:id`                               | eingeloggt                                   |
| `POST`                  | `…/topics`                                   | eingeloggt                                   |
| `PATCH`                 | `…/topics/:id`                               | eingeloggt                                   |
| `DELETE`                | `…/topics/:id`                               | `admin`                                      |
| `POST`                  | `…/topics/carry-over`                        | `admin` (manuelle Themen-Übernahme)          |
| `POST`                  | `…/topics/reminders`                         | `admin` (manueller Reminder-Trigger)         |
| `GET`                   | `…/songs?search=&sort=&playedOnly=`          | eingeloggt (paginiert)                       |
| `GET`                   | `…/songs/:id`                                | eingeloggt                                   |
| `POST`                  | `…/songs`                                    | eingeloggt (legt an oder gibt zurück)        |
| `PATCH`                 | `…/songs/:id`                                | eingeloggt                                   |
| `DELETE`                | `…/songs/:id`                                | `admin` (nur wenn nirgends verwendet)        |
| `POST`                  | `…/songs/reminders`                          | `admin` (manueller Reminder-Trigger)         |
| `GET`/`POST`            | `…/meetings/:id/songs`                       | eingeloggt                                   |
| `PATCH`/`DELETE`        | `…/meetings/:id/songs/:entryId`              | eingeloggt                                   |
| `GET`/`PUT`             | `…/meetings/:id/song-leaders`                | eingeloggt                                   |
| `GET`                   | `…/meetings/:id/song-leader-suggestions`     | eingeloggt                                   |
| `GET`                   | `…/prayer-buddies/current`                   | eingeloggt                                   |
| `GET`                   | `…/prayer-buddies?scope=past\|upcoming\|all` | eingeloggt (paginiert)                       |
| `GET`                   | `…/prayer-buddies/config`                    | eingeloggt                                   |
| `PUT`                   | `…/prayer-buddies/config`                    | `admin`                                      |
| `POST`                  | `…/prayer-buddies/rotate`                    | `admin` (nächste Runde vorziehen)            |
| `POST`                  | `…/prayer-buddies/plan`                      | `admin` (Vorlauf auf fünf auffüllen)         |
| `GET`                   | `…/absences?scope=upcoming\|all`             | eingeloggt (paginiert)                       |
| `GET`                   | `…/absences/:id`                             | eingeloggt                                   |
| `POST`                  | `…/absences`                                 | eigene; fremde nur `admin`                   |
| `PATCH`/`DELETE`        | `…/absences/:id`                             | eigene; fremde nur `admin`                   |
| `POST`                  | `…/absences/sync`                            | `admin` (manueller Nachlauf)                 |
| `GET`                   | `…/archive`                                  | eingeloggt (Überblick, Jahresliste)          |
| `GET`                   | `…/assignments?from=&to=&personId=`          | eingeloggt (Rollen im Zeitraum)              |
| `GET`                   | `…/home`                                     | eingeloggt (Home-Screen in einem Aufruf)     |
| `GET`                   | `/api/push/settings`                         | eingeloggt (eigene Einstellungen)            |
| `PUT`                   | `/api/push/settings/:type`                   | eingeloggt (eigene Einstellungen)            |

Alle `GET`s beantworten `If-None-Match` mit `304`. Die `PATCH`-Endpunkte auf
Personen, Locations, Terminen, Themen, Songs und Abwesenheiten,
`PUT …/prayer-buddies/config` sowie `…/meetings/:id/cancel` **verlangen**
`If-Match` (`428` ohne, `412` bei veralteter Version) — Details siehe
[Conditional Requests](#conditional-requests-etag-304-412).

> Der Invite-Endpunkt legt den Keycloak-Account an, weist die Realm-Rolle zu und
> verschickt die Einladung. Lokal landet die Mail in Mailpit (<http://localhost:8025>).
> Mit gesetzter `APP_URL` endet der Ablauf nicht bei Keycloak, sondern mit einem
> Knopf zurück in die App — siehe [Der Weg zurück](#der-weg-zurück).
> Schlägt nur der Mailversand fehl, antwortet er mit `invitationEmailSent: false` —
> der Account existiert dann trotzdem und die Einladung kann erneut gesendet werden.
> Scheitert dagegen ein früherer Schritt, wird der Keycloak-Account wieder gelöscht,
> damit kein verwaister Account zurückbleibt.

### Eingeladen ist nicht angekommen

Eine Einladung ist **Name, Adresse, Rolle** — mehr nicht. Ob jemand ein
Instrument spielt, wo er wohnt und ob er gerade hosten möchte, weiß nur er
selbst; das steht im Profil. Wer es im Einladungsformular ausfüllte, träfe
Annahmen über einen Menschen, der noch gar nicht da ist.

`person.acceptedAt` unterscheidet beides. `null` heißt „eingeladen, aber noch
nicht da". Die `keycloakUserId` taugt dafür nicht: die steht schon ab dem
Einladen drin, weil das Konto vor der Person angelegt wird. Gesetzt wird das
Datum in `resolveForUser`, beim ersten `GET /api/me` — der einzige Moment, in
dem feststeht, dass wirklich jemand vor dem Bildschirm saß.

Daran hängt, was `DELETE …/people/:id` tut:

- **Noch nicht da** — das Keycloak-Konto wird mitgelöscht. Bliebe es stehen,
  könnte sich jemand damit anmelden und landete auf „du bist noch nicht
  eingetragen", und ein erneutes Einladen scheiterte an der belegten Adresse.
- **Schon da gewesen** — das Konto bleibt. Es gehört einem Menschen, nicht
  dieser Gruppe.

### Der Nutzername gehört den Menschen

Beim Anlegen setzt `inviteUser` den Nutzernamen auf die E-Mail-Adresse — ein
Konto braucht einen, und mehr wissen wir zu dem Zeitpunkt nicht. Bleiben muss
er nicht: die Einladungsmail schickt `UPDATE_PROFILE` mit, und dort trägt sich
jede:r selbst ein. Damit das Feld nicht gesperrt ist, setzt `setup-keycloak.sh`
am Realm `editUsernameAllowed`.

Daraus folgt eine Regel für `changeEmail`: der Nutzername wird **nicht**
mitgeschrieben. Er ist seit der Einladung eine eigene Wahl, und ihn beim
Adresswechsel zu überschreiben hieße, sie still zu verwerfen. Das PUT an die
Admin-API schickt deshalb nur `email` und `emailVerified` — was dort nicht
steht, lässt Keycloak in Ruhe.

Verknüpft bleibt trotzdem die Adresse: `resolveForUser` findet die Person über
`person.email`, nicht über den Nutzernamen.

Ebenfalls am Realm: `resetPasswordAllowed`. Ohne das wäre ein vergessenes
Passwort eine Sackgasse — die App kennt keinen Weg, eine Einladung noch einmal
zu schicken.

### Der Weg zurück

Ein `execute-actions-email` ohne Client kennt kein Ziel: Keycloak weiß nicht,
wo die App liegt, und der Ablauf endet auf einer Keycloak-Seite ohne Ausgang.
Deshalb hängt `actionsEmailPath` `client_id` und `redirect_uri` an, sobald
`APP_URL` gesetzt ist. Keycloak prüft die Adresse gegen die Redirect-URIs des
Frontend-Clients; passt sie nicht, verweigert es den Link. Ohne `APP_URL`
bleiben beide weg und der alte Ablauf gilt weiter.

Was dabei **nicht** passiert, und zwar mit Absicht auf Keycloaks Seite:

- **Kein automatischer Sprung.** Keycloak zeigt eine Bestätigung („Fertig. Du
  kannst dich jetzt im Hauskreis anmelden.") mit einem Knopf. Ein
  Auto-Redirect ließe sich nur über eine kopierte `info.ftl` erzwingen — eine
  Vorlage, die man dann bei jedem Update nachziehen müsste, für einen
  eingesparten Fingertipp.
- **Keine fertige Sitzung.** Ein Aktions-Token ist keine Anmeldung; danach
  steht kein SSO-Cookie im Browser. Wer gerade Nutzername und Passwort gesetzt
  hat, meldet sich damit einmal an. Nachgestellt: die Autorisierungs-Anfrage
  direkt nach dem Ablauf zeigt wieder die Anmeldeseite.

### Die Anmeldeseiten gehören uns

Keycloaks Standardtexte sind englisch und klingen nach Verwaltungssoftware, und
seine Anmeldeseite sieht aus wie Keycloak. Das Realm-Theme `hauskreis`
([`keycloak/themes/hauskreis`](keycloak/themes/hauskreis)) ändert beides — in
zwei Teilen, `email/` und `login/`, und in beiden **ohne eigene Vorlagen**:

|          | erbt von      | ersetzt                                                   |
| -------- | ------------- | --------------------------------------------------------- |
| `email/` | `base`        | `messages_de.properties`                                  |
| `login/` | `keycloak.v2` | `messages_de.properties`, ein Stylesheet, Logo, Schriften |

Die `.ftl`-Dateien mitzuschleppen hieße, sie bei jedem Keycloak-Update gegen
die neuen Fassungen zu halten. Eine Handvoll CSS-Variablen überlebt Updates
unbeaufsichtigt: Keycloak baut diese Seiten mit PatternFly 5, und PatternFly
stellt seine Werte als CSS-Variablen ein — wer die überschreibt, färbt auch
Seiten mit, die es heute noch nicht gibt.

Die Farben stammen aus `hauskreis-frontend/src/app/globals.css`, die Schriften
sind dieselben `.woff2`-Dateien, die next/font ausliefert. Mitgeliefert statt
von Google geladen: die Anmeldeseite soll nicht auf einen fremden Server warten
und auch dann stimmen, wenn jemand Drittanbieter blockiert.

Damit die deutschen Texte überhaupt gezogen werden, setzt
`setup-keycloak.sh` am Realm `internationalizationEnabled` und
`defaultLocale: de` — ohne das greift Keycloak zu `messages_en` und beide
Themes blieben unbenutzt. Das Verzeichnis hängt als Volume im Container: eine
Änderung kostet einen Neustart, keinen Neubau.

> Ohne Browser lässt sich ein Theme schlecht ansehen. Was sich prüfen lässt,
> ist, ob die Regeln überhaupt etwas treffen: die Seiten rendern, alle Klassen
> und IDs einsammeln und die Selektoren dagegen halten. Genau so kam heraus,
> dass Keycloak die Begrüßung der Einladung als `pf-m-warning` ausliefert —
> mit der Alarmfarbe der App wäre das ein roter Kasten für „schön, dass du da
> bist" geworden.
