# Acts2 Backend

NestJS + Prisma + Keycloak Backend für Acts2.
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

Beides gilt nur beim **Anlegen**. Ein erneuter Lauf des Skripts lässt
bestehende Konten unangetastet — wer beim Ausprobieren einen Nutzernamen oder
ein Passwort ändert, behält es. Zurücksetzen mit `--reset-users`.

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
- **Rollen gelten pro Hauskreis**, nicht realmweit: `person.role` (`MEMBER | ADMIN`), erzwungen von `@HauskreisAdmin()` im `HauskreisMemberGuard`. `@Public()` öffnet einzelne Routen. Siehe [Ein Mensch, ein Hauskreis](#ein-mensch-ein-hauskreis).
- **`person.keycloakUserId`** ist bewusst nullable und **global eindeutig**: nullable, weil eine Einladung eine Person-Zeile anlegt, bevor sich jemand je angemeldet hat; eindeutig, weil ein Mensch zu genau einem Hauskreis gehört.
- **Validierung ausschließlich über Zod-DTOs** (`createZodDto`). Die globale Pipe läuft mit `strictSchemaDeclaration`, meldet also Endpunkte, die versehentlich ohne Validierung arbeiten. Werte aus Custom-Decorators (`@CurrentUser()`, `@IfMatch()`) sind davon ausgenommen — siehe [`src/common/pipes/zod-validation.pipe.ts`](src/common/pipes/zod-validation.pipe.ts).
- **Schreibende Endpunkte auf versionierten Entitäten** gehen über `updateWithVersionCheck` und akzeptieren `If-Match` — siehe [Conditional Requests](#conditional-requests-etag-304-412).

## Ein Mensch, ein Hauskreis

### Die Tür, die es nicht gab

`hauskreisId` war ein reiner Pfadparameter. Geprüft wurde, dass es eine UUID
ist — mehr nicht. Nichts fragte, ob die anfragende Person zu diesem Hauskreis
gehört, und `GET /api/hauskreise` gab alle Ids heraus. Wer eine kannte, konnte
dort lesen und schreiben. Bei einem Hauskreis fällt das nicht auf; ab dem
zweiten ist es der eigentliche Fehler.

[`HauskreisMemberGuard`](src/auth/hauskreis-member.guard.ts) löst die
Mitgliedschaft **einmal je Anfrage** auf und legt sie an `request.membership`
ab (`@CurrentMembership()`). Routen ohne `:hauskreisId` im Pfad gehen ihn nichts
an — sie hängen ohnehin an der eigenen Person. Wer nicht dazugehört, bekommt
`403` und nicht `404`: dass es diesen Hauskreis gibt, weiß man ohnehin, wenn man
seine Id hat, und eine Notlüge stünde beim Suchen des Fehlers nur im Weg.

`@HauskreisAdmin()` liest von dort. Der Unterschied zum abgelösten
`@Roles(ROLE_ADMIN)` ist der ganze Punkt: die alte Fassung las eine Realm-Rolle
aus dem Token und galt in **jedem** Hauskreis. `RolesGuard` und `@Roles` sind
ersatzlos entfallen — zwei sich widersprechende Berechtigungswege nebeneinander
sind genau das, was später versehentlich benutzt wird.

### Ein Wechsel ist ein Umzug

Ein Mensch gehört zu genau einem Hauskreis. Das lässt
`keycloakUserId @unique` als Regel stehen statt als Hindernis und erspart es,
Name, Geburtstag und Wohnung je Mitgliedschaft doppelt zu pflegen.

| Vorgang                                                     | Was passiert                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Gründen** (`POST /api/hauskreise`)                        | Hauskreis **und** eigene Person mit `role: ADMIN`, in einer Transaktion. `409`, solange man noch woanders dabei ist |
| **Verlassen** (`POST …/leave`)                              | `active = false`, `keycloakUserId = null` **und** `username = null`                                                 |
| **Einladen**                                                | Person-Zeile **ohne** `keycloakUserId` — ein Angebot, keine Übernahme                                               |
| **Annehmen** (`POST /api/me/invitations/{personId}/accept`) | verlässt den bisherigen Hauskreis im selben Zug                                                                     |

Beim Verlassen bleibt die Zeile stehen, damit vergangene Abende weiter zeigen,
wer gehostet hat; frei wird nur die `keycloakUserId`, sonst käme man nirgends
mehr an. Deshalb prüft `resolveForUser` auf `active: true` — ohne das holte der
nächste Login jemanden in den Hauskreis zurück, den er gerade verlassen hat.

Aus demselben Grund **weckt eine Einladung eine verlassene Zeile wieder auf**,
statt eine zweite anzulegen: `@@unique([hauskreisId, email])` ließe das gar
nicht zu, und wer einmal gegangen ist, käme sonst nie wieder herein. Die
Geschichte bleibt dabei an der Person, die sie gemacht hat.

### Wer geht, bestimmt seine Nachfolge

Die letzte Admin-Person kann nicht einfach gehen; sonst bliebe ein Hauskreis
ohne jemanden, der einladen darf. Das zu **verbieten** wäre die bequemere
Lösung und eine Sackgasse — dann säße man für immer in einem Hauskreis fest,
den man verlassen will. Stattdessen nimmt `leave` ein optionales
`successorPersonId`:

- kein Admin, oder es bleiben andere Admins → geht ohne Weiteres
- einzige Admin-Person, andere Mitglieder da → `400`, das die Auswahl anfordert;
  mit `successorPersonId` wird die genannte Person im selben Zug `ADMIN`
- letzte Person überhaupt → der Hauskreis wird mit gelöscht

### Was ein Austritt aufräumt

Bis hierher setzte `leave` nur drei Spalten. **Alles andere blieb stehen**: die
Person hostete weiter am 26. August, stand in der Planungstabelle, war für ein
laufendes Thema eingetragen und hatte für kommende Abende zugesagt.

Geräumt wird jetzt, für alle Termine ab heute:

| Was                        | Warum                                                                       |
| -------------------------- | --------------------------------------------------------------------------- |
| Gastgeber-Platz (samt Ort) | Host und Ort sind eine Entscheidung, sobald der Ort seine Wohnung war       |
| Musik-Zuteilungen          | gilt je Abend                                                               |
| eigene Zu-/Absagen         | „kommt nicht" von jemandem, der nicht mehr dabei ist, verzerrt jede Zählung |
| Themen-Zuteilungen         | ein Abend, an dem die Person eingeteilt ist, wäre eine Zusage ohne jemanden |

Zwei Unterschiede zur einzelnen Absage (`RoleReleaseService.releaseFor`), beide
aus demselben Satz — **wer geht, ist an keinem Abend mehr da**:

- Beim Absagen fällt **eine** Themen-Zuteilung, hier alle kommenden auf einmal.
  Was die Person an ihren Themen gearbeitet hat, bleibt: Einheiten und ihre
  Verantwortlichen sind Archiv, ein Thema verliert höchstens seinen Owner
  (`onDelete: SetNull`) und ist dann für alle bearbeitbar.
- Beim Absagen bleiben **abgesagte Abende** in Ruhe, damit ein Wiederaufleben
  die Rollen zurückbringt. Hier wäre das Zurückgebrachte ein Mensch, der nicht
  mehr da ist.
- Die eigenen **Antworten** verschwinden, statt als Absage stehen zu bleiben.

Danach läuft `MeetingCancellationService.reconcile` über **jeden** kommenden
Abend, nicht nur die berührten: mit der Person ändert sich die Zahl der aktiven
Menschen und damit die Schwelle, ab der „alle haben abgesagt" gilt. Ein Abend
mit acht Absagen und einer offenen Antwort fällt aus, sobald genau diese Person
geht.

Die Verbleibenden bekommen `MEMBER_LEFT`, und darin steht auch, **was dadurch
offen bleibt** („Der Plan braucht jetzt einen Gastgeber."). Genannt wird das
_Was_, nicht das _Wie viel_ — für die Zahl gibt es die Planungstabelle, und
„drei Abende brauchen einen Gastgeber" liest sich wie eine Rechnung. Die
Nachfolge erfährt im selben Text, dass sie übernimmt; ein eigener Schalter dafür
wäre ein Eintrag mehr in den Einstellungen für einen Fall, den man ein- oder
zweimal im Jahr erlebt.

### Konto löschen heißt anonymisieren

`DELETE …/hauskreise/:id/account` ist der Austritt plus alles, was danach noch
auf die Person zeigt: Name, E-Mail und Geburtstag fallen weg, das Bild ist über
`leave` schon gelöscht, `anonymizedAt` wird gesetzt, und das Keycloak-Konto
verschwindet — nach demselben Nachzählen wie bei einer zurückgezogenen
Einladung, damit niemand seinen Zugang zu einem _anderen_ Hauskreis verliert.

**Die Zeile bleibt.** Ein `person.delete` sähe sauberer aus und wäre es nicht,
weil die Fremdschlüssel zwei verschiedene Dinge ausdrücken:

| Beziehung                                                                   | `onDelete` | Was ein `DELETE` anrichtete                                |
| --------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| Gastgeber, Themen-Owner, wer ein Lied eingetragen hat                       | `SetNull`  | Der Abend verlöre seinen Gastgeber, das Thema seinen Owner |
| `TopicSessionResponsible`, Anwesenheiten, Actionstep-Haken, Musik-Zuteilung | `Cascade`  | „Wer hat welche Einheit gehalten" wäre ersatzlos weg       |

Das Archiv wäre danach nicht anonym, sondern löchrig. So steht dort
„Ehemaliges Mitglied" — die Erinnerung der anderen bleibt vollständig, die
Person darin ist es nicht mehr.

`Person.email` ist dafür nullable geworden. Der Index `@@unique([hauskreisId,
email])` bleibt und trägt beliebig viele anonymisierte Zeilen: in Postgres ist
`NULL` in einem eindeutigen Index von jedem anderen `NULL` verschieden —
dieselbe Eigenschaft, auf der schon `topic_session.meeting_id` steht.

Der Austritt wird **aufgerufen**, nicht nachgebaut: Nachfolgeregelung,
Rollenfreigabe, Gebetsbuddys und `MEMBER_LEFT` sind dort schon richtig, und zwei
Fassungen davon liefen mit der Zeit auseinander. Wer als letzte Person geht,
nimmt den Hauskreis mit — dann gibt es keine Zeile mehr zu anonymisieren, nur
noch das Konto wegzuräumen.

### Mehrere offene Einladungen

`resolveForUser` verknüpft beim ersten Anmelden automatisch — aber nur, wenn es
**genau eine** offene Einladung gibt. Bei mehreren entschiede sonst die
Reihenfolge, in der Postgres die Zeilen zurückgibt, in welchem Hauskreis jemand
landet. Dann kommt ein `404`, und das Frontend zeigt
`GET /api/me/invitations` zur Auswahl.

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

### Wenn etwas Fremdes in der Antwort steht

Der ETag eines Termins entsteht **allein** aus `meeting.version`. In seiner
Antwort stehen aber Dinge, die in eigenen Tabellen liegen: die Zuteilungen, die
gewählte Einheit, die Anwesenheit, die Actionstep-Haken. Wer eine davon ändert,
ohne die Version anzuheben, hinterlässt einen ETag, der den Körper nicht mehr
beschreibt — der Server antwortet `304`, und der Bildschirm zeigt weiter den
alten Stand. Genau so sah es aus: „aktualisiert sich erst nach einem Reload".

Dafür gibt es [`touchMeeting`](src/meeting/meeting-version.ts) und
[`touchTopic`](src/topic/topic-version.ts) — zwei Zeilen, aufgerufen im selben
Transaktionsblock wie die Änderung. Faustregel: **steht das Feld in der Antwort
der Ressource, gehört ihre Version angehoben.** Lieder brauchen es nicht, sie
kommen von einer eigenen Sammel-URL mit eigenem ETag.

Dass damit auch ausstehende `If-Match`-Token ungültig werden, ist kein
Nebenschaden, sondern derselbe Satz von der anderen Seite: wer den Termin vor
einer Themenänderung gelesen hat, schreibt gegen ein veraltetes Bild.

**Die Regel gilt in beide Richtungen**, und das war die Lücke, die beim ersten
Mal übrig blieb. Nicht nur „Thema ändert sich → Termin altern lassen":

| Was sich ändert        | Was mit altern muss                     | Warum                                      |
| ---------------------- | --------------------------------------- | ------------------------------------------ |
| Titel einer Einheit    | Termin **und** Thema                    | Der Termin zeigt sie, das Thema listet sie |
| Titel eines Themas     | jeder Termin mit einer seiner Einheiten | Dort steht er als „Zugehöriges Thema"      |
| Mitarbeitende entfernt | Thema                                   | Sie stehen in seiner Antwort               |
| Thema gelöscht         | seine bisherigen Termine                | Die stehen danach ohne Thema da            |

Der Weg dahin ist immer derselbe: **wer ein Feld ändert, das in der Antwort
einer anderen Ressource steht, hebt deren Version mit an.** Ein Wächter je Pfad
steht in
[`topic-version-guard.spec.ts`](src/topic/topic-version-guard.spec.ts) — die
Regression ist sonst nicht zu bemerken, weil das Symptom ein _veralteter_
Bildschirm ist und kein Fehler.

### Für neue Endpunkte

1. Entität im Prisma-Schema mit `version Int @default(0)` versehen.
2. Im Service **nicht** `update()` verwenden, sondern
   [`updateWithVersionCheck`](src/common/http/optimistic-update.ts).
3. Im Controller `@IfMatch() ifMatch?: IfMatchCondition` als Parameter ergänzen
   und durchreichen.
4. Ändert der Endpunkt etwas, das in der Antwort einer **anderen** Ressource
   steht, dort `touchMeeting`/`touchTopic` aufrufen.

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

| Typ                      | Anlass                                        | Empfänger                                              | Default       |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------ | ------------- |
| `HOST_REMINDER`          | Abend rückt näher                             | der Host                                               | 3 Tage vorher |
| `TOPIC_REMINDER`         | Abend rückt näher                             | Themen-Verantwortliche                                 | 5 Tage vorher |
| `SONG_REMINDER`          | Abend rückt näher                             | Musik-Verantwortliche                                  | 5 Tage vorher |
| `ACTIONSTEP_REMINDER`    | Actionstep vom letzten Mal                    | alle                                                   | freitags      |
| `ROLE_ASSIGNED`          | jemand trägt dich für einen Abend ein         | die eingeteilte Person                                 | sofort        |
| `PRAYER_BUDDY_ASSIGNED`  | neue Rotation                                 | alle                                                   | sofort        |
| `MEETING_CANCELLED`      | Abend fällt aus — oder findet doch statt      | alle                                                   | sofort        |
| `MEETING_TIME_CHANGED`   | der **nächste** Abend fängt anders an         | alle außer der Person, die es geändert hat             | sofort        |
| `ATTENDANCE_DECLINED`    | jemand sagt ab                                | der Host — und alle, wenn dadurch eine Rolle frei wird | sofort        |
| `HOST_CAPACITY_UNLOCKED` | genug Absagen, dass eine kleine Wohnung passt | Bewohner:innen dieser Wohnung                          | sofort        |
| `MEMBER_LEFT`            | jemand verlässt den Hauskreis                 | alle Verbleibenden                                     | sofort        |

Ein Eintrag kann ein optionales `appliesTo(context)` tragen und erscheint dann
nur bei den Leuten, für die er überhaupt etwas bewirken kann. Bisher genau einer:
`HOST_CAPACITY_UNLOCKED` kann niemanden erreichen, dessen Wohnung für die volle
Gruppe reicht — bei allen anderen stand ein Schalter, der nie etwas tat, und ein
Schalter ohne Wirkung ist schlimmer als keiner, weil man ihm glaubt.

Gefiltert wird **nur die Anzeige** (`listForPerson`), nie `resolve()`. Andernfalls
verschwände mit dem Schalter auch die Nachricht: wer heute keine Kapazität gesetzt
hat, bekäme morgen mit gesetzter Kapazität keine Einladung mehr, weil beim Versand
niemand mehr nachfragt.

Die Vorlauf-Werte sind bewusst verschieden: Inhalte vorbereiten braucht mehr
Vorlauf als aufräumen. Der Freitag beim Actionstep liegt mittig zwischen zwei
Dienstagen und lässt das Wochenende noch übrig — montags käme die Nachfrage, wenn
die Woche schon vorbei ist.

### `ROLE_ASSIGNED`: ein Schalter für drei Rollen

Man erfuhr von einer Zuteilung bisher erst durch die Erinnerung drei bis fünf
Tage vorher. Bis dahin stand sie nur in der App — und wer nicht hineinsieht,
erfährt sie nicht. Genau das ist das Problem aus CLAUDE.md §2 („geht unter,
niemand hat den Überblick").

Ein Eintrag für Gastgeber, Thema und Musik zusammen, nicht drei. Die
_Erinnerungen_ sind einzeln einstellbar, weil man sie unterschiedlich früh
braucht; hier gibt es nichts einzustellen, und drei Schalter für dieselbe Frage
machen die Liste schlechter.

Damit das trotzdem funktioniert, hat `notification_log` eine Spalte
`related_role` bekommen. Ohne sie hielte `hasBeenSent` die Musik-Einteilung für
eine Dublette der Gastgeber-Einteilung am selben Abend — wer beides macht,
bekäme nur eine Nachricht. Der Termin allein ist nicht unterscheidbar genug,
dasselbe Muster wie schon bei `related_person_id` (zwei Absagen für denselben
Abend).

Der Enum dazu, `AssignmentRole`, ist bei der Gelegenheit aus
`role-assignment.types.ts` in die Datenbank gewandert. Er stand dort als
TypeScript-Objekt — zwei Aufschriebe derselben drei Werte, die auseinanderlaufen
können; die Vorschlagslogik leitet ihre Fassung jetzt davon ab.

Drei Regeln teilen sich alle Aufrufer, deshalb liegen sie in
[`role-assignment-notifier.service.ts`](src/notification/role-assignment-notifier.service.ts)
und nicht in den drei Diensten:

- **Nur kommende Abende.** Wer nachträgt, wer im Mai das Thema hatte, soll
  niemanden aufschrecken. Abgesagte Abende ebenso wenig.
- **Nur wirklich neue Namen.** Die Aufrufer lesen den Stand vorher und schicken
  die Differenz — sonst hörte beim Nachrücken einer zweiten Person auch die
  erste noch einmal davon.
- **Nicht an sich selbst.** Wer sich einträgt, weiß es bereits.

Ein Thema hängt an mehreren Abenden. Benachrichtigt wird für den **nächsten
kommenden**, sonst gäbe es eine Nachricht je Abend. Hängt das Thema an gar
keinem Termin, bleibt es still: ohne Termin gibt es weder ein Datum zu nennen
noch ein Ziel, zu dem die Nachricht springen könnte.

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

### Wenn die Empfänger nicht am Termin stehen

Host, Thema und Musik liest die `recipients`-Funktion vom Termin ab. „Alle
aktiven Mitglieder" steht dort nicht — deshalb darf sie ein Promise
zurückgeben. Eine Zeile mehr im Läufer, und billiger, als die Mitgliederlisten
aller Hauskreise auf Vorrat zu laden.

Genutzt wird das von den **zwei Nachrichten für besondere Termine**:

| Typ                       | Wann                             | An                               |
| ------------------------- | -------------------------------- | -------------------------------- |
| `CUSTOM_MEETING_CREATED`  | beim Anlegen, ereignisbasiert    | alle außer der anlegenden Person |
| `CUSTOM_MEETING_REMINDER` | 2 Tage vorher (1–14 einstellbar) | alle aktiven Mitglieder          |

Zwei und nicht eine, weil es zwei Fragen sind: „gibt es etwas Neues"
beantwortet man einmal, „ich muss daran denken" braucht eine Vorlaufzeit. Wer
das eine will und das andere nicht, kann das einstellen.

Beide gelten **nur für `CUSTOM`**. Der Dienstagabend steht jede Woche, alle
wissen es, und wer eine Rolle hat, bekommt seine eigene Erinnerung. Sieben
generierte Termine pro Nacht, jeder mit einer Ankündigung an alle neun, wäre
die schnellste Art, Benachrichtigungen abzuschalten — der Filter steht deshalb
in beiden Wegen und ist in `custom-meeting-notification.service.spec.ts`
festgehalten.

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

**Mindestens eine Zeile je Hauskreis braucht `role=admin`.** Das ist keine
Formalie: Admin ist eine Spalte an `person`, keine Realm-Rolle, und befördern
darf nur, wer selbst Admin ist. Ohne diese Spalte hatte ein frisch eingesäter
Hauskreis keine Verwaltung — und keinen Weg zu einer. `seed.ts` bricht deshalb
ab, bevor er etwas schreibt:

```
person.csv: „Holy-Homies" hat niemanden mit role=admin — ohne Admin lässt sich
der Hauskreis nicht verwalten.
```

`autoAttend` steht aus demselben Grund in der CSV: ohne die Spalte starteten
alle auf `false`, und zum Ausprobieren fehlten überall die Zusagen.

**Termine legt der Seed nicht an.** Die entstehen durch den Generator — nach
einem frischen Seed also einmal Verwaltung → Wartung → „Termine erzeugen",
sonst steht der Plan bis zum nächsten nächtlichen Lauf leer.

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

### Alles zurücksetzen

```bash
./scripts/reset-stack.sh
```

Wirft **beide** Datenbanken weg (Anwendung _und_ Keycloak), alle Profilbilder
und alle Konten samt Passwörtern, fährt die Dienste neu hoch, spielt Schema und
Testdaten ein und richtet Keycloak wieder ein. Fragt vorher nach; mit `--yes`
nicht.

Die Reihenfolge im Skript ist nicht beliebig: erst Volumes weg und Dienste hoch
(sonst schreibt die Migration in die alte Datenbank), dann Migrationen und
Client (der Seed braucht beides), dann Keycloak und **erst danach** der Seed —
`GET /api/me` verknüpft ein Konto über die E-Mail-Adresse mit einer
Personenzeile, und ein halb eingerichtetes Keycloak hinterließe sonst eine
Umgebung, in der niemand ankommt.

Danach: `testadmin` / `testmember`, beide `test1234`, `testadmin` ist Admin im
eingesäten Hauskreis.

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

### Die Anmeldeseite sieht aus wie Standard-Keycloak

Das Theme liegt in `keycloak/themes/hauskreis` (Login und E-Mail, beide erben
ihre Vorlagen von Keycloak und ersetzen nur Farben und Texte) und wird per
Volume eingehängt. Der Realm zeigt über `setup-keycloak.sh` darauf.

**Ein Realm lässt sich auf ein Theme setzen, das es gar nicht gibt.** Keycloak
protestiert nicht, es nimmt still die Standardseite. Das ist wochenlang
unbemerkt geblieben: `loginTheme: "hauskreis"` stand im Realm, aber
`GET /admin/serverinfo` kannte nur `keycloak.v2`. Seitdem prüft
`setup-keycloak.sh` am Ende nach und bricht mit einer Diagnose ab.

Die Frage „lädt mein Theme gerade?" ist ein eigener Befehl, damit sie kein
volles Setup kostet:

```bash
./scripts/setup-keycloak.sh --check-only
```

Unter WSL stellt sie sich **regelmäßig neu**: nach einem Neustart des
Docker-Daemons hängt das Bind-Mount wieder ins Leere, auch wenn die
WSL-Integration eingeschaltet ist. Dann hilft
`docker compose up -d --force-recreate keycloak`. Wer das leid ist, kopiert das
Theme in ein eigenes Keycloak-Image (`FROM quay.io/keycloak/keycloak:26.4` plus
`COPY`) — dafür kostet dann jede Farbänderung einen Neubau statt eines
Neustarts, weshalb es hier beim Volume bleibt.

Was im Container ankommt:

```bash
docker compose exec keycloak ls /opt/keycloak/themes/hauskreis
```

Ist der Ordner dort **leer**, kommt der Docker-Daemon nicht an das Dateisystem
heran, in dem die Dateien liegen. Unter WSL ist das fast immer die abgeschaltete
WSL-Integration: Docker Desktop → Einstellungen → Resources → WSL Integration
für diese Distribution einschalten. Ohne sie löst der Daemon den Bind-Mount in
seiner eigenen VM auf, findet dort nichts — und legt einen leeren Ordner an,
statt zu scheitern. Ein Mount, der aussieht, als hätte er geklappt.

Nachprüfen lässt sich das ohne Compose:

```bash
docker run --rm --entrypoint /bin/ls \
  -v "$PWD/keycloak/themes/hauskreis:/probe:ro" \
  quay.io/keycloak/keycloak:26.4 -la /probe
```

Sonst reicht `docker compose up -d --force-recreate keycloak`.

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

```bash
./scripts/reset-stack.sh              # alles zurücksetzen (fragt nach)
./scripts/setup-keycloak.sh           # Realm, Clients, Rollen, Testkonten
./scripts/setup-keycloak.sh --check-only    # nur: ist das Theme da?
./scripts/setup-keycloak.sh --reset-users   # Testkonten auf test1234 zurück
./scripts/setup-keycloak.sh --production    # ohne Testkonten, echter Mailversand
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
Bruno-Collection — **in der Produktion ist es aus**. Das stand hier lange als
Vorsatz und war im Skript nicht umgesetzt: `--production` legte den Client
trotzdem mit `true` an. Jetzt richtet sich der Wert nach dem Modus, und zwar auch
an einem **bestehenden** Client — wer lokal entwickelt und später `--production`
auf denselben Realm laufen lässt, hätte den Flow sonst weiter offen, und niemand
sähe es, weil das Skript „already exists" meldet.

Aus demselben Grund zieht `--production` auch `redirectUris` und `webOrigins` am
bestehenden Frontend-Client nach. Beim Umzug von `localhost:3001` auf die echte
Domain lief das Skript vorher durch, meldete Erfolg und änderte nichts — der
Fehler kam erst beim ersten Anmeldeversuch als `invalid_redirect_uri`, und zwar
bei allen neun gleichzeitig.

**Brute-Force-Erkennung** ist am Realm eingeschaltet (10 Versuche, danach
wachsende Wartezeit bis 15 Minuten, kein dauerhaftes Aussperren — sonst genügt
der Nutzername eines Mitglieds, um es aus der App zu werfen). Für den
`master`-Realm muss man sie in der Konsole selbst setzen.

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
die nächsten **7 Abende** als Termin existieren. Der jeweils letzte eines Monats
wird als `LOBPREIS_GEBET` angelegt, alle anderen als `STANDARD`.

**Wochentag, Uhrzeit und Zeitzone kommen aus `MeetingScheduleConfig`**
(`GET`/`PUT …/meetings/config`), Vorgabe Dienstag 18 Uhr, `Europe/Berlin`. Alle
drei standen vorher als Konstante im Code — `TUESDAY = 2`, `EVENING_HOUR = 18`
und `TIME_ZONE = 'Europe/Berlin'` —, was für die eine Gruppe stimmte, für die es
geschrieben wurde. `isLastOfMonth` rechnet ohnehin wochentagsunabhängig
(„+7 Tage, anderer Monat?"), nur der Name behauptete etwas anderes.

Ein Wechsel des Wochentags **verschiebt nichts.** Der Lauf legt nur an, was
fehlt; bestehende Dienstage bleiben stehen und laufen aus. Alles andere hieße,
dass eine Einstellung Termine verrückt, für die längst jemand zugesagt und ein
Thema vorbereitet hat.

Der Lauf ist **idempotent**: ein Datum, an dem bereits _irgendein_ Termin liegt,
bleibt unangetastet — unabhängig vom Typ. Genau das schützt selbst angelegte
`CUSTOM`-Termine (z. B. „Geburtstag von …") davor, durch einen generierten
Standardtermin ersetzt zu werden. Abgesichert ist das zusätzlich durch einen
Unique-Index auf `(hauskreis_id, date)`.

Die Datumslogik liegt bewusst als reine Funktionen in
[`meeting-schedule.ts`](src/meeting/meeting-schedule.ts) (UTC-Mitternacht, damit
Kalendertage nicht über Zeitzonen verrutschen) und ist dort direkt getestet.

### `toUtcDate` und `currentDay` beantworten zwei verschiedene Fragen

Lange beantwortete `toUtcDate` beide, und nur eine davon richtig.

| Frage                                               | Antwort                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| „Welcher Kalendertag ist dieser gespeicherte Wert?" | `toUtcDate(date)` — schneidet eine Zeit ab, die `@db.Date` gar nicht hat     |
| „Welchen Tag haben wir gerade?"                     | `currentDay(zone, now?)` — braucht eine Zone, weil `now` ein _Zeitpunkt_ ist |

`toUtcDate(new Date())` war die zweite Frage mit dem Werkzeug für die erste: es
las die **UTC**-Felder eines Zeitpunkts. Um 00:30 Berliner Zeit ist in UTC noch
gestern, also galt der Termin von gestern noch als kommend. Das Fenster war
00:00–02:00 im Sommer und 00:00–01:00 im Winter, **jede Nacht** — und es traf
rund fünfundzwanzig Stellen auf einmal:

- die Terminliste zeigte den Abend von gestern unter „Kommende", während die
  Detailseite ihn schon mit „Vorbei" auswies;
- `assertMayPickSongs` antwortete in demselben Fenster mit `403`, obwohl an
  einem vergangenen Abend jede:r abhaken darf — die App hatte die Kästchen
  längst freigegeben;
- Dashboard, Archiv, Gebetsbuddy-Rotation und die nächtlichen Läufe erbten
  dieselbe Verschiebung, nur fiel sie dort weniger auf.

**Die Zone ist in `currentDay` und `isPast` ein Pflichtargument, kein
Vorgabewert.** Ein Standard wäre genau die Falle, die hier zugegangen ist: eine
vergessene Stelle rechnete still in Berlin weiter, und niemand merkte es. So
zeigt der Typprüfer jede.

Wo die Zone herkommt, weiß **`GroupClockService`**
([`group-clock.service.ts`](src/meeting/group-clock.service.ts)): er liest
`MeetingScheduleConfig.timeZone` und hält sie im Speicher, weil ein einziger
Aufruf der Terminliste sonst für jeden Vergleich dieselbe Zeile abfragte. Der
Server läuft als genau eine Instanz — es gibt also keinen zweiten Prozess, mit
dem etwas abzugleichen wäre —, und der einzige Schreibweg räumt den Speicher
selbst ab (`forget`, gerufen von `MeetingScheduleConfigService.updateConfig`).

Er steckt in einem `@Global()`-Modul, obwohl er neben dem Terminplan liegt:
Dashboard, Archiv, Themen, Lieder und die Benachrichtigungen brauchen ihn alle,
und über einen Import auf `MeetingModule` zöge sich das zu Kreisen zusammen.

Die Regel für Aufrufer lautet: **einmal pro Vorgang auflösen**
(`await this.clock.zoneOf(hauskreisId)`), danach die reinen Funktionen
benutzen. Ein `await` in einer Schleife holt immer dieselbe Antwort. Wer genau
einen Vergleich braucht, nimmt `clock.isPast(hauskreisId, date)`.

Nächtliche Läufe, die **alle** Gruppen abdecken, gehen Gruppe für Gruppe
(`closePastMeetings`) oder ziehen ihr Vorauswahl-Fenster einen Tag weiter als
nötig und entscheiden danach je Termin (`MeetingReminderService.run`). „Gestern"
fängt in Auckland zwölf Stunden früher an als in Berlin, und ein gemeinsames
`updateMany` müsste sich für eine der beiden entscheiden.

Im Frontend gilt dieselbe Zone: `lib/date.ts` hat ein `setGroupZone`, gesetzt
beim Booten aus derselben Konfiguration. Sonst könnte ein Gerät in einer anderen
Zone „Vorbei" anzeigen, wo der Server noch „kommend" meint.

Ein Termin **ohne** Host, Location oder Thema ist ein gültiger Zustand, kein
unvollständiger Datensatz. Beim Bearbeiten gilt: ein weggelassenes Feld bleibt
unverändert, `null` löscht die Zuordnung.

### Woraus ein Abend besteht

Vier Schalter am Termin — `hasTopicSlot`, `hasNotesSlot`, `hasSongSlot`,
`hasTestimonySlot` — und die Terminart ist nur noch ihre **Voreinstellung**:

| Typ              | Thema | Nachbereitung¹ | Lieder | Testimony |
| ---------------- | ----- | -------------- | ------ | --------- |
| `STANDARD`       | ✓     | –              | ✓      | –         |
| `LOBPREIS_GEBET` | –     | –              | ✓      | ✓         |
| `CUSTOM`         | –     | –              | –      | –         |

¹ überall aus und erst **ab Terminbeginn** anschaltbar — siehe unten.

Vorher war der Typ eine **Behauptung**: er stand in der Antwort, geprüft wurde
nichts. Man konnte einem Lobpreisabend ein Thema geben und einem Geburtstag ein
Testimony, und „Geburtstag von Mira" zählte in der Fairness wie ein ganz
normaler Dienstag — obwohl dort niemand im Sinne der Rotation dran war.
Außerhalb der DTOs gab es genau drei Stellen mit Typ-Logik.

**Einen Gastgeber-Schalter gibt es nicht.** Man trifft sich immer irgendwo; ein
Schalter, der nie aus darf, ist keiner. Dass an einem Abend _niemand_
gastgebend eingetragen ist — das Treffen im Schlosspark — bleibt davon
unberührt: das ist ein leeres Feld, kein abgeschalteter Baustein.

**Die Nachbereitung** ist der jüngste Baustein und der einzige, der niemanden
einteilt: `summaryText` und `actionstepText` stehen dann am Termin selbst. Sie
füllt eine Lücke — beides hing bis dahin ausschließlich an der Einheit eines
Themas, und ein Abend, an dem die Gruppe nur singt und betet, hatte für den
Vorsatz der Woche keinen Ort. Der Haken darunter braucht dafür nichts Neues:
`MeetingActionstepDone` hing schon immer am Termin.

Sie ist außerdem der einzige, den man **nicht vorausplant**. Anschalten geht erst
**ab der Treffpunktzeit** (`assertNotesSlotNotAhead`, dieselbe
`eveningReached`-Grenze wie beim Abhaken); vorher wäre es die Frage nach der
Zusammenfassung von etwas, das noch nicht stattgefunden hat. Deshalb steht sie im
Frontend auch nicht im Bausteinkasten, sondern hinter einem Hinweis am Abend
selbst. Abschalten geht dagegen jederzeit — wer sich vertut, wäre sonst damit
eingesperrt.

**Zwei Paare schließen einander aus, ein drittes nicht.** Thema und Testimony,
weil beides der Beitrag ist, um den sich der Abend dreht. Thema und
Nachbereitung, weil beide Zusammenfassung und Actionstep tragen — zwei davon
wären zwei Antworten auf dieselbe Frage, und keine Stelle wüsste, welche auf den
Startbildschirm gehört. Testimony **und** Nachbereitung dagegen sind erlaubt:
genau der Lobpreisabend, an dem jemand erzählt und die Gruppe danach etwas
festhält. `assertSlotsExclusive` lehnt eine verbotene Kombination mit `400` ab;
im Frontend führt das Formular gar nicht erst dorthin, weil `applySlotToggle`
beim Anhaken das Ausgeschlossene mit abschaltet.

Was von dort kommt, sind **nur die vier Schalter**. Ein `{ ...meeting }` nahm
einmal `summaryText` in denselben PATCH mit, in dem `hasNotesSlot` auf `false`
ging — `assertSlotsAllow` wies das zu Recht ab („Dieser Termin hat keine
Nachbereitung — schalte das erst dazu"), und das Anhaken von „Thema" tat
sichtbar nichts. Die Regel war richtig, der Aufruf falsch: wer einen Baustein
abschaltet, schickt seine Felder nicht mit, sondern überlässt sie
`clearedByTurningOff`.

Die Regeln stehen als reine Funktionen in
[`meeting-slots.ts`](src/meeting/meeting-slots.ts) und gelten überall gleich:

- Ein Feld schreiben, dessen Baustein aus ist → `400`. `undefined` ist immer in
  Ordnung (ein PATCH mit dem Info-Text darf nicht an einem fremden Feld
  scheitern), ein ausdrückliches `null` auch — aufräumen darf man immer.
- Einen Baustein abschalten **räumt auf**: Liedvorschläge samt Musik-Zuteilung,
  die Testimony-Zuteilung, bei der Nachbereitung beide Texte **und** die Haken
  dazu. Ein Feld, das niemand mehr setzen kann und trotzdem einen Wert trägt,
  ist die Sorte Fehler, die man erst Wochen später bemerkt — und ein Haken an
  einem Actionstep, den es nicht mehr gibt, taucht wieder auf, sobald jemand
  einen neuen schreibt.
- Beim **Thema** wird nicht geräumt, sondern **gelöst**: die Einheit verliert
  ihren Termin und bleibt als Entwurf erhalten, die Zuteilung bleibt stehen. Ein
  versehentlich umgelegter Schalter soll keine Vorbereitung kosten, und wer ihn
  wieder anschaltet, findet wieder vor, wer dran war. Der Unterschied zur
  Nachbereitung ist, wem die Texte gehören: eine Einheit trägt die Vorbereitung
  einer Person über mehrere Abende, die zwei Felder am Termin gehören diesem
  einen Abend.
- Ein Wechsel der **Terminart** setzt alle vier auf deren Voreinstellung
  zurück; ausdrücklich mitgeschickte Schalter gewinnen trotzdem.

Die Fairness-Rechnung zählt Termine mit Musik-Zuteilung und mit Testimony —
ohne den Baustein kann keines von beiden gesetzt sein. Beim Thema filtert sie
zusätzlich auf `hasTopicSlot`: die Zuteilung überlebt das Abschalten, und ein
Geburtstagsabend soll in der Fairness des Themas nicht mitzählen.

### Testimony ist eine Rolle

`Meeting.testimonyPersonId`, nicht ein Textfeld. Ein Testimony ist nichts, was
man vorher aufschreibt, sondern jemand, der davon erzählt; als
`testimonyText` stand es leer da, und niemand wusste, wer es füllen sollte,
weil daran keine Zuständigkeit hing.

Damit ist es eine Rolle wie die anderen drei: mit Vorschlägen
(`GET …/meetings/:id/testimony-suggestions`, dieselbe Rangfolge wie beim Thema,
ohne Eignungsfilter — eine Geschichte hat jede:r), mit einer Erinnerung fünf
Tage vorher (`TESTIMONY_REMINDER`), und in der Fairness als **ein Dienst je
Abend**. Anders als das Thema, das sich über drei Dienstage ziehen kann und
trotzdem als ein Dienst zählt: eine Geschichte ist ein Abend.

Wer für den Abend absagt, gibt sie frei — wie Gastgeber, Musik und Thema. Beim
Thema war das lange anders, weil die Zuständigkeit am _Thema_ hing und nicht am
Abend; sie fallen zu lassen hätte geheißen, jemanden von seiner Vorbereitung für
alle kommenden Abende zu entbinden. Seit sie am Abend steht, gilt für alle vier
dasselbe: wer nicht da ist, ist nicht eingeteilt.

### Wer eintragen darf

Bis hierher durfte jedes Mitglied alles: Zusammenfassung, Actionstep, welche
Lieder gesungen wurden. Nicht falsch gedacht — die Gruppe ist neun Leute,
niemand sabotiert da etwas —, aber es half auch niemandem. Ein Feld, das alle
bearbeiten können, bearbeitet am Ende keiner, und wer für den Abend zuständig
ist, findet seine eigene Vorbereitung unter fremden Händen.

| Was                           | Zuständigkeit                     | Ausnahme                   |
| ----------------------------- | --------------------------------- | -------------------------- |
| Lieder abhaken                | die Musik-Zuständigen des Abends  | nach dem Abend darf jede:r |
| Ein Thema wählen              | die Zuteilung an **diesem** Abend | –                          |
| Alles am Thema (jede Einheit) | Owner und Mitarbeitende           | –                          |
| Ein Thema löschen             | nur der Owner                     | –                          |
| Die Nachbereitung schreiben   | jede:r                            | –                          |

Die Ausnahme bei den Liedern kommt von der Bedeutung: vorher ist das Abhaken
eine **Entscheidung** („das singen wir"), hinterher ein **Protokoll** („das
haben wir gesungen"). An das zweite erinnert sich jede:r gleich gut. Die Regel
steht in [`edit-rights.service.ts`](src/meeting/edit-rights.service.ts).

„Nach dem Abend" heißt: **am nächsten Tag der Gruppe** — nicht ab der
Treffpunktzeit. Ein Termin gilt seinen ganzen Tag über als kommend, und das
„Vorbei"-Abzeichen in der App rechnet genauso. Welcher Tag „heute" ist,
entscheidet der `GroupClockService`; vorher war es der UTC-Tag, und genau daher
kam der `403` um halb eins nachts (siehe „`toUtcDate` und `currentDay`").

**Streng, ohne die zwei Ausnahmen, die es einmal gab.** Eine mildere Fassung
ließ Admins immer und alle, solange niemand zugeteilt war. Beides passt zu
diesen beiden Zeilen nicht: Musik machen und ein Thema vorbereiten sind keine
Verwaltungsaufgaben, die ein Admin für andere erledigt, und ein Abend ohne
Zuteilung ist keiner, an dem jede:r bestimmen darf — er ist einer, an dem noch
niemand zugeteilt ist. Wer die Auswahl treffen will, trägt sich als zuständig
ein; das ist eine Zeile und kein Hindernis.

Die **Nachbereitung** ist die Gegenprobe dazu und steht bewusst offen: an ihr
hängt keine Rolle, sie entsteht während oder nach dem Abend, und es gibt
niemanden, dem man sie vorenthalten oder für den man sie reservieren würde. Sie
läuft deshalb über das gewöhnliche `PATCH …/meetings/:id`.

Die drei Themen-Zeilen folgen derselben Form, aber einer anderen Frage: nicht
„wer ist an diesem Abend zugeteilt", sondern „wer gehört zu diesem Thema". Ein
Thema zieht sich über mehrere Abende, sein Bearbeitungsrecht deshalb auch — die
Regel dafür steht in [`topic-visibility.ts`](src/topic/topic-visibility.ts). Ein
Thema ohne Owner und ohne Mitarbeitende darf jede:r ändern, sonst wäre es für
immer eingefroren.

Nicht geprüft wird die **Zuteilung** selbst — wer vorbereitet, wer hostet, wer
Musik macht, bleibt eine Frage an die Gruppe und läuft weiter über das
Vorschlagssystem.

`EditRightsModule` importiert **nichts**. Dasselbe gilt für `TopicLinkModule`.
Beide werden von mehreren Modulen gebraucht; lägen sie in einem davon, hätten
die anderen eine Kante dorthin — und der Modulgraph hat schon einmal genau so
einen Zyklus bekommen, der weder in `pnpm check` noch in den Tests auffällt,
sondern erst beim Hochfahren. Möglich ist das, weil `PrismaModule` `@Global` ist.

> **Was dabei weggefallen ist:** die Datumsprüfung, die Zusammenfassung und
> Actionstep vor dem Termintag ganz verbot. Sie stimmte für alle außer für die
> Zuständigen — und die haben den Actionstep oft vorher im Kopf und wollen ihn
> hinlegen, wo er am Abend gebraucht wird. Die Zuständigkeit trifft dasselbe
> Ziel besser: am falschen Termin in der Liste ist man in aller Regel nicht
> zuständig.

### Ein Termin, mehrere Tage

`endDate` — nur bei `CUSTOM`, für eine Freizeit von Freitag bis Sonntag. Das ist
**ein** Termin und kein Stapel aus dreien, deshalb bleibt der Unique-Index auf
`(hauskreis_id, date)`: eine Zeile, das Startdatum als Schlüssel.

Dass kein zweiter Termin in den Zeitraum fällt, prüft `assertNoOverlap` im
Service und nicht die Datenbank — ein Ausschluss über Bereiche bräuchte eine
Exclusion Constraint, die Prisma nicht ausdrücken kann. Der Generator prüft
seit dem ebenfalls den Zeitraum und nicht mehr nur das Datum; sonst stünde ein
Hauskreis-Abend mitten im Zeltlager.

Ein `endDate` gleich dem `date` wird zu `null`: derselbe Sachverhalt in zwei
Schreibweisen ist die Sorte Unterschied, an der später Vergleiche scheitern.

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

### Absagen ist Admin-Sache, und es steht dabei, warum

Den ganzen Abend abzusagen ist etwas anderes, als selbst nicht zu kommen.
`POST …/meetings/{id}/cancel` trägt deshalb `@Roles(ROLE_ADMIN)` und nimmt einen
optionalen `reason`; die eigene Teilnahme geht weiter über
`PUT …/meetings/{id}/attendance`, ohne Rolle und ohne Vorbedingung.

`status` ist aus `updateMeetingSchema` **entfernt**. Es stand dort und tat
dasselbe — die Admin-Pflicht wäre eine Tür weiter wieder offen gewesen. Für den
Rückweg gibt es `POST …/uncancel`, ebenfalls Admin.

Vier Spalten halten fest, was passiert ist: `cancelled_at`,
`cancelled_by_person_id`, `cancel_reason` und `cancel_source`
(`MANUAL | ALL_DECLINED`). Die letzte ist keine Buchhaltung, sondern eine Regel —
siehe unten.

### Der Abend, den niemand absagt und der trotzdem ausfällt

Wenn alle abgesagt haben, ist der Termin faktisch weg; im Kalender steht er
weiter, und niemand denkt daran, ihn abzusagen. `MeetingCancellationService`
zieht den Schluss selbst, aufgerufen nach jeder Änderung an der Anwesenheit —
von Hand wie aus einem Abwesenheitszeitraum heraus.

**Alle heißt alle.** Wer noch nicht geantwortet hat, verhindert die Absage. Das
ist die vorsichtige Lesart und die richtige: „vier von neun haben abgesagt" ist
ein dünner Abend, kein ausgefallener, und ein Termin, den die App aus Schweigen
heraus absagt, wäre schlimmer als einer, der zu dritt stattfindet.

Die Gegenrichtung gehört zwingend dazu. Sagt danach jemand doch zu, lebt der
Abend wieder auf — sonst müsste ein Mensch eine Absage zurücknehmen, die nie
jemand ausgesprochen hat. Zurückgenommen wird aber **nur `ALL_DECLINED`**; eine
Absage von Hand bleibt stehen. Genau dafür gibt es die Spalte: der Rückschluss
aus `cancelled_by_person_id IS NULL` wäre für den Altbestand aus der Migration
falsch gewesen und hätte längst abgesagte Abende wieder aufleben lassen.

Beide Richtungen laufen über **dieselbe** Benachrichtigungsart. Wer „Hauskreis
fällt aus" abonniert hat, will auch „findet doch statt" wissen; ein neunter
Schalter für die Rücknahme wäre eine Einstellung für einen Sonderfall. Damit
`hasBeenSent` die zweite Nachricht nicht als Dublette der ersten verschluckt,
räumt `announceStatusChange` die `NotificationLog`-Zeilen zu
`(MEETING_CANCELLED, meetingId)` vor jedem Wechsel weg — einmal je
Richtungswechsel, nicht einmal je Termin.

**Der Weg zurück war lange eine Sackgasse.** Die Regel oben verlangt eine
Zusage, aber alle vier Stellen im Frontend blendeten den Zusage-Schalter aus,
sobald der Abend abgesagt war — übrig blieb der Admin-Knopf „Absage
zurücknehmen", und `uncancel` fasste `MeetingAttendance` nicht an. Der Abend
stand danach wieder, die eigene Antwort weiterhin auf „nicht dabei". Zwei
Änderungen:

- In der „Fällt aus"-Karte steht bei `ALL_DECLINED` ein Knopf **für alle**:
  „Ich bin doch dabei" schreibt die eigene Zusage, `reconcile` holt den Abend
  von selbst zurück. Das ist der Weg, den der Text darunter seit jeher
  verspricht.
- `uncancel` setzt bei `ALL_DECLINED` die `ABSENT`-Zeilen mit `source = SELF`
  auf `UNKNOWN` zurück. Sonst stünde ein „findet statt" mit null von neun
  Zusagen da — ein Zustand, den der nächste `reconcile`-Auslöser (ein Austritt,
  der nächtliche Abgleich) sofort wieder in eine Absage übersetzt. Nur die
  selbst gegebenen: eine aus einem Urlaub abgeleitete Absage ist keine Meinung
  über diesen Abend, und sie zurückzusetzen hieße, sie beim nächsten Lauf erneut
  herzuleiten. Bei `MANUAL` bleibt alles stehen — dort wurden die Antworten
  unabhängig von der Absage gegeben.

Ein Nebeneffekt, der leicht zu übersehen ist: `AbsenceSyncService` filtert nicht
mehr auf `status: PLANNED`. Seit die Absage eine **Folge** dieser Zeilen ist und
keine Vorbedingung mehr, muss ein gelöschter Urlaub auch aus einem abgesagten
Abend wieder herauskommen — sonst bliebe er abgesagt mit einer Absage, die es
nicht mehr gibt.

### Ein vergangener Abend sagt niemandem mehr ab

`cancel` und `uncancel` verschicken ihre Benachrichtigung nur für Termine, die
noch bevorstehen. Rückwärts heißt „absagen" nicht „fällt aus", sondern „hat
nicht stattgefunden" — ein Nachtrag fürs Archiv. Eine Push-Nachricht darüber
wäre eine Warnung vor etwas, das längst vorbei ist. Aus demselben Grund rührt
`reconcile` vergangene Abende gar nicht erst an: dort ist „abgesagt" ein Vermerk,
keine Vorhersage.

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

## Themen und ihre Einheiten

Ein Thema ist **nicht** an einen Termin gebunden: es zieht sich über beliebig
viele Abende, und jeder davon ist eine `TopicSession` — hier „Einheit". Der Titel
ist optional, auf beiden Ebenen: nicht jeder legt ihn vorab fest.

Drei Dinge, die früher in einer Tabelle steckten, sind auseinandergezogen:

| Was               | Wo                                                  |
| ----------------- | --------------------------------------------------- |
| **Zuständigkeit** | `meeting_topic_responsible` — die Rolle am Abend    |
| **Auswahl**       | `topic_session.meeting_id` — nullable und `@unique` |
| **Inhalt**        | an der Einheit, nicht am Termin                     |

Dazwischen liegt ein Zustand, den es vorher nicht gab und der der Punkt der
Sache ist: **zugeteilt, aber noch nichts gewählt**. Vorher legte eine Zuteilung
sofort ein leeres Thema an, und der Abend sah aus, als stünde schon etwas fest.

`meeting_id = NULL` heißt **unfertig**: vorbereitet, aber an keinem Abend. Der
eindeutige Index darauf trägt zwei Lasten — fachlich hängt an einem Abend
höchstens eine Einheit, technisch ist er die Absicherung dagegen, dass zwei
gleichzeitig Zugeteilte beide wählen. Der zweite Schreibvorgang läuft in den
Konflikt und wird zu einem 409, statt eine zweite Einheit anzulegen. Postgres
zählt `NULL` als verschieden, unfertige Einheiten stören sich also nicht.

### Die Wahl

| Methode  | Pfad                                | Rechte                         |
| -------- | ----------------------------------- | ------------------------------ |
| `GET`    | `…/meetings/:id/topic-responsibles` | eingeloggt                     |
| `PUT`    | `…/meetings/:id/topic-responsibles` | eingeloggt (ohne Vorbedingung) |
| `GET`    | `…/meetings/:id/topic-choices`      | eingeloggt                     |
| `POST`   | `…/meetings/:id/topic-session`      | **nur zugeteilt**              |
| `DELETE` | `…/meetings/:id/topic-session`      | dito, nur vor dem Abend        |

`POST …/topic-session` nimmt einen von drei Wegen:

- `{ "mode": "new", "title": "…" }` — neues Thema, die handelnde Person wird
  sein **Owner**.
- `{ "mode": "existing", "topicId": "…" }` — ein eigenes Thema um einen weiteren
  Abend erweitern. `title`, `actionstepText` und `summaryText` dürfen gleich
  mitkommen.
- `{ "mode": "resume", "sessionId": "…" }` — eine eigene **offene** Einheit
  aufnehmen; ihr Inhalt bleibt vollständig erhalten. Hängt sie an einem anderen
  _kommenden_ Abend, zieht sie um.

**Owner wird, wer zuerst tatsächlich wählt**, nicht wer zuerst zugeteilt wurde.
Alle, die in diesem Moment ebenfalls für den Abend zugeteilt sind, kommen als
Verantwortliche der Einheit mit und werden damit Mitarbeitende des Themas.

**Wählen darf nur, wer an dem Abend zugeteilt ist.** Kein
Admin-Freifahrtschein, und „niemand zugeteilt heißt jede:r darf" gilt hier auch
nicht. Die Wahl ist kein Verwaltungsakt, sondern die Aussage „ich bereite das
vor" — die kann niemand für einen anderen treffen. Wer sie treffen will, trägt
sich vorher über `PUT …/topic-responsibles` ein; das prüft absichtlich nichts.
Dieselbe strenge Fassung gilt für die Liedauswahl (siehe „Wer eintragen darf").

Hängt am Abend schon eine Einheit, ist das kein Fehler, sondern ein **Wechsel**:
die bisherige löst sich in derselben Transaktion und wartet als Entwurf. An
einem vergangenen Abend nicht — `400`. Der eindeutige Index bleibt der
Rennschutz; ein `updateMany` mit dem _beobachteten_ `meeting_id` in der Bedingung
hält den Compare-and-swap aufrecht.

### Entkoppeln statt Löschen

Nichts wird weggeräumt, wenn eine Rolle wechselt — die Einheit wird nur vom
Abend **gelöst** (`meeting_id = NULL`) und wartet als Entwurf. Die Regel dafür
steht in `TopicLinkService.reconcile`: _entkoppelt wird, wenn niemand mehr
zugeteilt ist, der zum Thema gehört._

- Aus zwei Zugeteilten wird einer → die Einheit bleibt, der Übriggebliebene
  gehört ja dazu.
- Statt A ist jetzt C dran → entkoppelt, der Entwurf wartet auf A.
- C kommt zu A dazu → die Einheit bleibt, C wird Verantwortliche und
  Mitarbeiterin.

Denselben Weg gehen das Abschalten des Bausteins „Thema" und die Absage einer
zuständigen Person. **Ein vergangener Abend ist davon ausgenommen**: was war,
war, und eine Zusammenfassung rückwirkend aus dem Archiv zu nehmen, weil jemand
eine Rolle korrigiert, wäre der Preis für eine Aufräumaktion.

Wer aus der Zuteilung **herausfällt**, verliert dagegen etwas — aber nur im
Zweig, in dem die Einheit hängen bleibt. `TopicLinkService.leave` nimmt ihm die
Zeile an _dieser_ Einheit (sie wäre ab jetzt eine falsche Behauptung und keine
Geschichte) und das Schreibrecht am **Thema** nur dann, wenn er sonst nirgends
mehr daran hängt — gehalten oder geplant. Der Owner verliert nie etwas.

Im Entkoppel-Zweig wird ausdrücklich **nicht** aufgeräumt: der Entwurf wartet ab
sofort auf genau die Leute, die eben herausgefallen sind. Nähme man ihnen die
Zeile, verschwände er aus ihrem „Angefangenes" — und ein Entwurf, den niemand
mehr sehen kann, ist gelöscht, nur langsamer.

**Die Zuteilung selbst** fällt beim Abschalten des Bausteins dagegen weg, wie
bei der Musik. Sie blieb einmal aus Vorsicht stehen, aber an einem Abend ohne
Thema ist sie keine geduldige Notiz, sondern eine falsche Aussage:
`TopicReminderService` fragt nicht nach `hasTopicSlot` und schickte „Du bist dran
mit dem Thema" für einen Abend, an dem keins ist.

`TopicLinkService` liegt in einem Modul ohne Importe — `MeetingModule` und
`TopicModule` brauchen ihn beide, und eine Kante zwischen den zweien hat den
Modulgraphen schon einmal in einen Zyklus geführt (wie bei `EditRightsModule`).

### Sichtbarkeit

Drei Fragen, die man leicht verwechselt, in `topic-visibility.ts` als reine
Funktionen getrennt:

- **gehalten** — verknüpft, Termin vorbei, nicht abgesagt. Rein zeitlich, kein
  Häkchen.
- **öffentlich** — eine Eigenschaft des _Themas_: sobald eine Einheit gehalten
  wurde, steht es im Archiv, und alles, was danach dazukommt, ist sofort
  mitzusehen.
- **Inhalt sichtbar** — die Frage des einzelnen Abends. Titel, Actionstep und
  Zusammenfassung gehören denen, die sie vorbereiten, **bis der Abend anfängt**
  — also bis `meeting.startMinutes` Ortszeit (`common/time/local-evening.ts`,
  Rückfall 18 Uhr). Danach allen. Eine Gruppe, die sich um 20 Uhr trifft, gab
  ihren Actionstep sonst zwei Stunden zu früh frei.

Zurückgehalten wird im Backend: die Felder gehen als `null` raus und
`contentVisible` sagt, dass da etwas ist. Sie im Frontend auszublenden hieße,
sie trotzdem über die Leitung zu schicken.

Ein abgesagter Termin macht seine Einheit nicht „gehalten" — die Einheit bleibt
aber hängen. Wird die Absage zurückgenommen, ist alles wieder da, ohne dass
jemand neu wählen müsste.

### Themen

| Methode  | Pfad                                            | Rechte                          |
| -------- | ----------------------------------------------- | ------------------------------- |
| `GET`    | `…/topics?scope=public\|mine&search=&from=&to=` | eingeloggt (paginiert)          |
| `POST`   | `…/topics`                                      | eingeloggt (wird Owner)         |
| `GET`    | `…/topics/:id`                                  | eingeloggt                      |
| `PATCH`  | `…/topics/:id`                                  | Owner/Mitarbeit (`If-Match`)    |
| `DELETE` | `…/topics/:id`                                  | Owner oder `admin`              |
| `DELETE` | `…/topics/:id/collaborators/:personId`          | Owner oder `admin`              |
| `POST`   | `…/topics/:id/sessions`                         | Owner/Mitarbeit                 |
| `GET`    | `…/topic-sessions/:id`                          | eingeloggt                      |
| `PATCH`  | `…/topic-sessions/:id`                          | Owner/Mitarbeit (`If-Match`)    |
| `DELETE` | `…/topic-sessions/:id`                          | Owner/Mitarbeit, nicht gehalten |

Ein Thema entsteht auf **zwei** Wegen: beim Wählen an einem Abend, oder über
`POST …/topics` im Voraus. Lange gab es nur den ersten, mit dem Argument, ein
Thema ohne Anlass wäre ein leerer Datensatz — genau der, von dem das alte Modell
nicht loskam. Das stimmte, solange der Inhalt ausschließlich an Terminen hing.
Seit es Einheiten ohne Abend gibt, ist das Vorarbeiten selbst der Anlass: wer im
Zug eine Idee hat, legt das Thema an und füllt es, und der Dienstag findet sich
später. Der Titel ist dabei **Pflicht** (beim Wählen ist er es nicht — dort
steht das Thema unter seinem Termin und ist auch namenlos auffindbar).

Damit bekommt „wer zuerst **wählt**, wird Owner" einen Zusatz: **oder wer es
anlegt.** Dieselbe Regel einen Schritt früher.

Eine **Einheit** entsteht ebenfalls ohne Abend: `POST …/topics/:id/sessions`
ist der Ort zum Vorarbeiten. Vorher ging nur der umgekehrte Weg — erst einen
Termin belegen, dann dort schreiben. Der Titel ist dort **Pflicht**: ein Entwurf
ohne Abend hat nichts als seinen Titel. Wer anlegt, wird seine Verantwortliche,
sonst griffe die Rettung aus Spec 8.5 für handgemachte Entwürfe nicht.

`DELETE …/topic-sessions/:id` geht nur, solange die Einheit **nicht gehalten**
wurde (kein Abend, ein kommender, oder ein abgesagter — dasselbe `isHeld` wie
überall). Ein gehaltener Abend ist das Protokoll dessen, was war und geht nur
mit dem ganzen Thema.

`scope=public` (Vorgabe) listet Themen mit mindestens einem gehaltenen Abend,
`scope=mine` die eigenen — auch die, die noch niemand gesehen hat. Abgeschlossen
wird über `PATCH` mit `{ "status": "COMPLETED" }`.

**Bearbeiten darf, wer zum Thema gehört** (Owner oder Mitarbeit), und zwar jede
Einheit davon — auch die, bei der man selbst nicht dabei war. Ein Thema ist eine
gemeinsame Arbeit; ein Recht je Abend wäre Buchhaltung. **Löschen** ist enger:
nur der Owner. Mitarbeitende kommen automatisch dazu, wer eine Einheit hält;
entfernen darf sie nur der Owner, und wer entfernt wird, bleibt an den Abenden
stehen, die er gehalten hat — das ist Geschichte und kein Recht.

Ein Thema ohne Owner und ohne Mitarbeitende (aus der Zeit vor diesem Modell,
oder weil der Owner den Hauskreis verlassen hat) darf jede:r ändern
(`isOrphaned` in [`topic-visibility.ts`](src/topic/topic-visibility.ts)). Sonst
wäre es für immer eingefroren.

### Fairness

Wer das nächste Thema vorbereiten könnte, liefert
`GET …/meetings/:id/topic-suggestions` — dieselbe Rangliste wie beim Host, nur
ohne Ortsbezug.

Gelesen wird die **Zuteilung am Termin**, nicht wer an einer Einheit steht. Das
ist zweierlei, und die Fairness meint das erste: wer eingeteilt war und nichts
eingetragen hat, war trotzdem dran — und wer für einen kommenden Abend
eingeteilt ist, hat schon etwas zu tun, obwohl es dort noch gar keine Einheit
gibt. Der `slotKey` ist die Id des **Themas**; das ist es, was ein Thema über
drei Dienstage zu einem einzigen Dienst zusammenfasst (CLAUDE.md §5).

### Was es nicht mehr gibt

Die nächtliche Übernahme (`TopicCarryOverService`, 3:15 Uhr) belegte den
nächsten Abend im Voraus mit dem laufenden Thema. Sie ist weg: sie stand der
Regel im Weg, dass Owner wird, wer zuerst wählt. Stattdessen steht ein laufendes
eigenes Thema in `…/topic-choices` ganz oben — `status` sortiert jetzt diese
Liste, statt einen Job zu steuern.

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

### Die beiden Abkürzungen beim Erfassen (Gemini)

Titel, Interpret und Link von Hand zu tippen ist die lästigste Eingabe der App —
zwei der drei stehen ohnehin auf der Seite, die man gerade offen hat. Deshalb
zwei Hilfen, beide **auf Knopfdruck** und nie beim Tippen:

| Methode | Pfad                              | Zweck                                        |
| ------- | --------------------------------- | -------------------------------------------- |
| `GET`   | `…/songs/lookup/status`           | ob ein Schlüssel hinterlegt ist              |
| `POST`  | `…/songs/lookup/from-link`        | Link rein, Titel und Interpret raus (~3–4 s) |
| `POST`  | `…/songs/lookup/link-suggestions` | Titel rein, geprüfte Links raus (~3–5 s)     |

Einrichtung: Schlüssel auf <https://aistudio.google.com/apikey> erzeugen, im
selben Projekt **die Abrechnung aktivieren** und als `GEMINI_API_KEY` in die
`.env` legen. Die Abrechnung ist keine Formalie — die Linksuche braucht
`google_search`-Grounding, und das gibt es im kostenlosen Tarif nicht. **Ohne
Schlüssel startet der Server normal**, wie bei den VAPID-Keys; im Frontend
verschwinden dann nur die beiden Knöpfe.

Drei Entscheidungen, die man sonst nachfragen müsste:

**Jede vorgeschlagene URL wird abgerufen, bevor sie zurückgeht — und was zählt,
ist das Ziel der Weiterleitung.** Das Grounding liefert seine Fundstellen
nämlich nicht als echte Adressen aus, sondern als Weiterleitungen über
`vertexaisearch.cloud.google.com`, und die laufen nach einigen Wochen ab.
Gespeichert würde daraus ein Link, der beim Anlegen funktioniert und im Herbst
ins Leere zeigt. Der Abruf folgt der Weiterleitung deshalb bis zum Ende und
behält `response.url`. Erst an dieser aufgelösten Adresse wird geprüft, ob es
überhaupt eine Songseite ist — vorher weiß niemand, wohin ein Vorschlag zeigt.
Deshalb steht das Nachsehen **vor** dem Sortieren und Entdoppeln, nicht danach.

Dass ein Sprachmodell auch frei erfundene Adressen aufschreibt, fängt derselbe
Abruf ab. `403` zählt dabei als „gibt es": Ultimate Guitar sitzt hinter
Cloudflare und zeigt einem Server-Aufruf mitunter eine Prüfseite — für ein
unbekanntes Lied käme dort weiterhin `404`.

**Die Linksuche läuft ohne `url_context`.** Beide Werkzeuge zusammen bringen das
Modell dazu, jede gefundene Seite noch selbst zu lesen; gemessen lief der Aufruf
dann über zwei Minuten, ohne fertig zu werden. Nachsehen tun wir ohnehin selbst,
und zwar für alle Kandidaten parallel. **Kein** automatischer zweiter Versuch:
Der verdoppelte nur die Wartezeit vor einem Knopf, an dem jemand steht, und
kostete noch einmal dasselbe.

**Der zweite Druck sucht daneben weiter (`more: true`).** Ohne ihn kam beliebig
oft derselbe Zwischenspeicher-Eintrag zurück — wer einen schlechten Vorschlag
bekommen hatte, war damit fertig. Mit ihm bleibt das Bekannte stehen, die
bekannten Adressen gehen als „kennen wir schon" mit in den Prompt, und was
zurückkommt, wird gegen sie noch einmal gefiltert: das Modell hält sich nicht
immer daran, und der Erreichbarkeits-Abruf folgt Weiterleitungen, die auf einer
bekannten Seite landen können.

Zwei Feinheiten, die leicht andersherum ausfielen:

- **`dedupeBySite` gilt nur innerhalb eines Laufs.** Über zwei Läufe hinweg
  dürfen zwei Ultimate-Guitar-Links nebeneinander stehen — dass die erste Wahl
  von dort nicht taugte, ist ja der Grund für den zweiten Druck. Zusammengeführt
  wird deshalb nur über die URL (`mergeByUrl`), und die Gesamtliste hört bei
  neun auf.
- **Die Gesamtliste wird nicht neu sortiert.** `rank` läuft je Lauf; danach
  bleibt die Reihenfolge stehen, sonst verschöbe sich unter dem Finger, was man
  gerade lesen wollte. Was neu ist, markiert das Frontend selbst — es kennt die
  vorherige Liste.

Der Zwischenspeicher unterscheidet dabei `undefined` von `[]`: ein gespeichertes
„nichts gefunden" wird beim **ersten** Druck weiterhin nicht noch einmal
bezahlt, beim zweiten dagegen immer neu gesucht.

### Warum es billig und schnell ist

Die erste Fassung war beides nicht: Ein paar Entwicklungstage kosteten 0,22 €,
und die Knöpfe brauchten 5–22 Sekunden. Drei Änderungen, jede vermessen:

**`from-link` schickt nur den Seitenkopf, nicht die Seite.** Wir holen die Seite
selbst (`GET` mit `Range: bytes=0-32768`), ziehen `<title>`, die `og:`-Angaben
und die erste Überschrift heraus und geben dem Modell nur das. Der Grund steht
in einer Zahl: Eine Ultimate-Guitar-Seite wiegt **145 KB ≈ 36.000 Tokens**, und
`url_context` schob sie vollständig ins Modell, um eine Zeile daraus abzulesen.
Gemessen sind es jetzt **210–262 Tokens** — rund das Hundertfünfzigfache
gespart. `url_context` bleibt als **Rückfall** für Seiten, an denen unser Abruf
scheitert (Cloudflare, oder ein Kopf ohne brauchbare Angaben): Was für uns ein
`403` ist, ist für Googles Index eine gewöhnliche Seite.

**Das kleinste Modell genügt.** `gemini-3.6-flash` kostet 1,50/7,50 $ je Mio.
Tokens und denkt von Haus aus auf Stufe „medium" — Denk-Tokens werden als
Ausgabe abgerechnet. Ablesen und Auswählen ist keine Denkaufgabe, also
`gemini-3.1-flash-lite` (0,25/1,50 $) mit `thinking_level: 'minimal'`.
`gemini-2.5-flash-lite` wäre noch einmal deutlich billiger, nimmt aber **keine
neuen Nutzer mehr an** — ein frischer Schlüssel bekommt dort nur einen 404.

**Was einmal gefragt wurde, wird nicht zweimal bezahlt.** Ein Zwischenspeicher
im Prozess (24 h, 200 Einträge) hält Antworten fest, **auch leere** — gerade der
Fall ohne Treffer lädt zum zweiten Druck ein. Im Speicher und nicht in Redis,
weil der Server ohnehin als genau eine Instanz läuft.

Ergebnis, gemessen an denselben Liedern:

|                    | vorher                   | nachher                |
| ------------------ | ------------------------ | ---------------------- |
| Aus Link ausfüllen | 5–8 s, bis 36.000 Tokens | **3–4 s, ~250 Tokens** |
| Link suchen        | 12–22 s                  | **3–5 s**              |
| Zweiter Druck      | wie oben                 | **0 ms**               |

Jeder Aufruf schreibt eine Zeile ins Log mit Dauer, Tokens, Denk-Tokens und der
Zahl der **abgerechneten Suchanfragen** — Letztere steht nirgends sonst und ist
nicht an der Tokenzahl abzulesen, weil ein Aufruf mehrere Suchen ausführen kann.
Die Zeitgrenzen (12 s für den Seitenkopf, 20 s für den `url_context`-Rückfall,
30 s für die Suche) sind großzügig gegenüber diesen Messwerten, damit ein
langsamer Tag nicht sofort als Fehler endet.

**Die Seitenrangfolge steht als Konstante im Code**
(`LYRICS_SITE_PREFERENCE` in `song-lookup.service.ts`), nicht in der `.env`.
Ultimate Guitar zuerst, dann Genius. Sie ändert sich vielleicht einmal im Jahr,
und dann ist ein Commit ehrlicher als eine stille Einstellung auf dem Server.

**Keine eigene Suchmaschinen-API.** Naheliegend wäre, erst deterministisch zu
suchen und die KI nur als Rückfall zu nehmen. Googles Custom Search JSON API
nimmt seit Januar 2026 keine Neuanmeldungen mehr an und wird zum 1.1.2027
abgeschaltet; Braves freier Tarif fiel im Februar 2026; Ultimate Guitar hat
keine offizielle API, die npm-Pakete dafür umgehen Cloudflare per Scraping.
Unabhängig davon meldet eine Websuche nie „nichts gefunden" — sie liefert immer
zehn Treffer inklusive YouTube-Link und Bestenliste, und die Bedingung „wenn das
nicht klappt" ließe sich gar nicht formulieren. Der brauchbare Teil der Idee
steckt jetzt im Prompt: Gemini-Grounding _ist_ Google-Suche.

Wird die Trefferquote bei deutschen Worship-Titeln zu dünn, ist der nächste
Schritt die kostenlose, offizielle Genius-Suche als zweite Implementierung des
`LyricsRetriever`-Interfaces — Sortierung, Entdopplung und Erreichbarkeitsprüfung
liegen bewusst dahinter und blieben unverändert.

Beide `POST`-Routen sind auf 10 Aufrufe pro Minute gedrosselt. Das globale
Budget (300/min) schützt den Server; hier geht es um eine fremde Rechnung.

## Erinnerungen vor dem Abend

> **Neun Uhr heißt neun Uhr hier.** Alle `@Cron`-Dekoratoren bekommen
> `timeZone: CRON_TIME_ZONE` aus
> [`local-evening.ts`](src/common/time/local-evening.ts). Ohne die Angabe nimmt
> `@nestjs/schedule` die Zeitzone des Prozesses, und die ist im Container UTC —
> die Neun-Uhr-Erinnerungen kamen im Sommer um elf und im Winter um zehn.
>
> Bewusst nicht über ein `TZ=Europe/Berlin` am Container: das verschöbe die Uhr
> für alles, auch für den pg-Treiber und dessen `@db.Date`-Spalten. Der Parameter
> am Cron verschiebt nur, wann gefeuert wird. Was _innerhalb_ eines Laufs „heute"
> heißt, rechnet weiterhin `GroupClockService` je Gruppe — die Läufe gehen über
> alle Hauskreise, und ein Prozess kann nicht in mehreren Zonen gleichzeitig um
> neun Uhr aufwachen.

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

**Zwei Quellen, eine Antwort.** Der Text steht entweder an der Einheit eines
Themas oder — beim Baustein „Nachbereitung" — am Abend selbst. Welche gilt,
entscheidet [`actionstep-source.ts`](src/meeting/actionstep-source.ts) am
Baustein und nicht am ersten Feld, das gefüllt ist: ein vergangener Abend behält
seine Einheit auch dann, wenn `hasTopicSlot` danach abgeschaltet wurde, und ein
`??` spielte dort den Text eines Themas aus, das nicht mehr dazugehört. Dieselbe
Datei benutzt der Startbildschirm — zwei Stellen, die dieselbe Frage verschieden
beantworten, wären ein Fehler, den niemand meldet, weil beide Seiten für sich
plausibel aussehen.

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

**Erst ab Abendbeginn**, sonst `400`. Die Grenze war einmal der Kalendertag, und
damit ließ sich der Vorsatz für die kommende Woche am Termintag um acht Uhr
morgens abhaken — zehn Stunden bevor die Gruppe ihn ausgesprochen hatte.
Maßgeblich ist die Treffpunktzeit **dieses** Abends
(`eveningReached(date, now, startMinutes)`), derselbe Helfer, der auch
entscheidet, wann der Inhalt einer Einheit allen gehört. Zwei Rechnungen für
„hat der Abend angefangen" wären eine zu viel; eine Gruppe, die sich um 20 Uhr
trifft, gibt entsprechend zwei Stunden später frei als eine mit 18 Uhr.

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

Vier Benachrichtigungen hängen nicht am Kalender, sondern an einer Änderung.
Sie werden aus `MeetingService` heraus ausgelöst, **nachdem** geschrieben wurde —
eine Absage-Meldung zu einem Speichern, das dann fehlschlägt, wäre schlimmer als
eine späte.

**`MEETING_CANCELLED`** geht an alle, sobald ein Abend abgesagt wird. Ausgelöst
wird das am Übergang des Status, nicht am Endpunkt: absagen geht über
`POST …/cancel` **und** über `PATCH { "status": "CANCELLED" }`, und beide Wege
sollen sich gleich verhalten. Ein bereits abgesagter Abend bleibt still, ein
vergangener auch — dass Dienstag vor drei Wochen nicht stattgefunden hat, ist
Buchhaltung und keine Nachricht.

**`ATTENDANCE_DECLINED`** sind **zwei** Nachrichten unter einem Schalter. Die
erste geht an den Host dieses Abends, der schließlich einkauft. Nur beim
Übergang nach „abwesend" — dieselbe Antwort nochmal zu speichern löst nichts
aus, und dass man selbst abgesagt hat, muss einem niemand mitteilen.

Die zweite geht an **alle anderen**, wenn die Absage eine Rolle freigemacht hat:
„Antonia kann am 4. August nicht. Das Thema ist wieder frei." Das ist die
einzige Absage, die etwas zu tun übrig lässt, und deshalb kein eigener Schalter
— wer „jemand sagt ab" abonniert hat, will gerade diese erfahren.

Aufgezählt wird, was `RoleReleaseService` zurückgemeldet hat, und **das Thema
gehört dazu**. Es fehlte in `describeReleased`, obwohl es längst freigegeben
wurde: wer nur dafür zugeteilt war und absagte, ließ den Satz auf `null` fallen
und der ganze Zweig schwieg. Ein Fehler, den man nur daran merkt, dass nichts
passiert.

**`MEETING_TIME_CHANGED`** geht raus, wenn sich `startMinutes` ändert — aber
**nur beim nächsten** geplanten Abend der Gruppe (dieselbe Abfrage wie der
Startbildschirm). Eine Uhrzeit in fünf Wochen zu verschieben ändert für heute
nichts; man liest es, wenn man ohnehin hinschaut. Der nächste dagegen ist der,
vor dessen Tür man sonst zur falschen Zeit steht.

Im Text stehen **beide** Zeiten — „fängt jetzt um 19:30 an, nicht um 18:00" —,
weil „wir fangen um 19:30 an" allein offenlässt, ob sich überhaupt etwas
verschoben hat. Nicht an die Person, die es geändert hat: sie hat es gerade
getippt. Der `notificationLog`-Merkposten wird vorher weggeräumt, sonst
verschluckt `hasBeenSent` die zweite Verschiebung als Dublette der ersten —
dieselbe Überlegung wie bei Absage und Wiederbelebung.

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
- **`AUTO`** — aus „ich bin grundsätzlich dabei" vorab zugesagt. Weicht einem
  Zeitraum, siehe unten.

Ohne diese Spalte ginge ein „doch, ich komme an dem Abend" verloren, sobald der
Urlaub später bearbeitet wird. Eine Antwort von Hand beansprucht die Zeile
deshalb auch dann, wenn ein Zeitraum sie angelegt hat.

### „Ich bin grundsätzlich dabei"

Wer jeden Dienstag kommt, tippte bisher jeden Dienstag dasselbe — und wer es
vergaß, stand als „weiß noch nicht" da, was für den Gastgeber beim Einkaufen
dasselbe ist wie ein Nein. `Person.autoAttend` sagt kommende Abende im Voraus zu.

**`AUTO` ist eine eigene Quelle, und darin steckt der ganze Punkt.** Als `SELF`
gespeichert wäre die Zusage unantastbar — und ein eingetragener Urlaub bliebe
still wirkungslos, weil der Abend weiter auf „dabei" stünde. Die Rangfolge ist
deshalb: `SELF` schlägt `ABSENCE` schlägt `AUTO`.

Gebaut als **Auffüllen, nicht als Ereignis** (`AutoAttendanceService.apply`):
statt an jeder Stelle, an der ein Termin entsteht, an die Zusagen zu denken, gibt
es einen wiederholbaren Lauf, der die Lücken schließt. `skipDuplicates` gegen den
Schlüssel `(meeting, person)` ist die ganze Regel — eine vorhandene Antwort wird
nie überschrieben, egal woher sie kam. Angestoßen vom Termin-Generator, vom
Anlegen eines Termins von Hand, vom Umlegen des Schalters und vom
Abwesenheits-Abgleich; ein verpasster Aufruf heilt beim nächsten.

Der Schalter wirkt **rückwirkend**: wer ihn umlegt, meint die sieben Dienstage,
die er gerade vor sich sieht, nicht erst den achten. Beim **Ausschalten**
passiert dagegen nichts — was zugesagt ist, bleibt zugesagt. Eine Zusage
stillschweigend zurückzunehmen wäre eine Absage, die niemand ausgesprochen hat.

> `AutoAttendanceService` liegt in einem eigenen Modul mit genau einem Dienst.
> Läge er im `MeetingModule`, müsste `PersonModule` dieses importieren —
> `MeetingModule` importiert aber seinerseits `PersonModule`, und der Kreis wäre
> da. Ein Modul, das außer Prisma nichts braucht, kann jeder importieren.

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

### Wenn sich die Gruppe ändert

Die Teilnehmerliste war eine **Momentaufnahme**: gelesen wurde sie beim Bauen
einer Runde und danach nie wieder. Wer den Hauskreis verließ, stand noch in bis
zu fünf geplanten Runden; wer dazukam, wartete auf seine ersten Buddys, bis alle
fünf abgelaufen waren. `replanAfterMembershipChange` zieht beides nach, und
zwar für die zwei Zeiträume unterschiedlich.

**Die laufende Runde wird repariert, nicht neu gewürfelt** (`repairGroups` in
[`grouping.ts`](src/prayer-buddy/grouping.ts)). Sie läuft schon; alle neu zu
verteilen nähme jedem etwas weg, um das Problem von zweien zu lösen. Drei
Regeln, und die Reihenfolge trägt:

1. Wer nicht mehr dabei ist, fällt heraus.
2. Wer neu dabei ist, kommt in die **kleinste** Gruppe.
3. Wer danach noch allein dasteht, zieht in die kleinste andere.

Zuzug **vor** Auflösung, weil das genau den häufigsten Fall auffängt: geht einer
und kommt einer, wird aus zwei halben Problemen eine ganze Zweiergruppe, statt
dass erst jemand umzieht und der Neuzugang danach eine Dreier erzwingt. Bleibt
am Ende nur eine Person übrig, endet die Runde still — eine Gruppe aus einem
Menschen wäre eine Behauptung, keine Zuteilung.

**Künftige Runden werden verworfen und neu geplant.** Sie sind gegen eine Gruppe
gebaut, die es nicht mehr gibt. Verworfen heißt hier **gelöscht** — anders als
beim Weiterschalten von Hand, wo die abgelehnte Aufteilung ja gerade die
Information ist. Diese Paarungen haben nie stattgefunden; blieben sie als
Historie stehen, mieden sich zwei Menschen wegen einer Runde, die keiner von
beiden erlebt hat.

Benachrichtigt wird **nur die berührte Gruppe**. Dafür muss die
`notification_log`-Zeile zu `(PRAYER_BUDDY_ASSIGNED, related_group_id)` weg,
sonst verschluckt `hasBeenSent` die zweite Nachricht als Dublette der ersten —
dasselbe Muster wie bei `announceStatusChange`.

Aufgerufen wird das überall, wo sich die Menge der aktiven Menschen ändert:
`MembershipService.leave` sowie `PersonService.create`, `invite`, `remove` und
`update`, wenn `active` umspringt. Beim Annehmen einer Einladung ausdrücklich
**nicht**: die Zeile ist seit dem Einladen `active`, in der Rotation steht die
Person also längst.

> `PersonService` schlägt den Generator über `ModuleRef` nach, statt ihn sich
> hineinreichen zu lassen. `NotificationModule` braucht `PersonModule`,
> `PrayerBuddyModule` braucht `NotificationModule` — importierte `PersonModule`
> seinerseits `PrayerBuddyModule`, stünde der Kreis und Nest käme beim
> Hochfahren nicht mehr durch. `forwardRef` an beiden Kanten wäre die andere
> Antwort; sie verteilte die Erklärung aber auf drei Dateien, von denen eine mit
> Gebetsbuddys nichts zu tun hat.

### Warum das Notification-Log eine Spalte mehr hat

`notification_log` deduplizierte über `(person, typ, termin)`. Gebetsbuddy-
Zuteilungen hängen an keinem Termin, also wäre jede Rotation als „schon
geschickt" durchgefallen — **nur die allererste** wäre je angekündigt worden.
`related_group_id` macht jede Rotation zu ihrer eigenen Nachricht.

Nebenbei festgehalten: der Unique-Index kann das ohnehin nicht erzwingen.
Postgres behandelt Zeilen mit einem NULL im Tupel als verschieden, und beide
Bezugsspalten sind nullable. Die echte Prüfung ist die Query in
`hasBeenSent` — der Index macht sie nur schnell.

## Geburtstage und Geschenke

[`src/birthday/`](src/birthday/). Vier Tabellen, und die Aufteilung ist die
eigentliche Entscheidung.

### Eine offene Runde je Person

`birthday_occasion` ist **ein** Geburtstag in **einem** Jahr. Je Person gibt es
genau eine offene Zeile — ihr nächster Geburtstag —, ältere bleiben als
Geschichte stehen. Deshalb gibt es keine „vergangenen Geburtstage" im UI: Wer
gestern gefeiert hat, steht ab heute wieder unten unter „Kommende", mit dem
Termin in einem Jahr.

`BirthdayPlannerService.plan()` ist der einzige Schreibweg. Er legt fehlende
Runden an, räumt Runden weg, deren Datum nicht mehr stimmt, und setzt die
Zuständigkeiten. Angestoßen wird er nächtlich (`15 4 * * *`) und von allem, was
die Grundlage ändert: ein eingetragener Geburtstag, ein Zu- oder Abgang, eine
andere Einstellung, eine geänderte feste Zuteilung.

### Die Reihe _ist_ der Geburtstag

`rotate()` in [`rotation.ts`](src/birthday/rotation.ts) sortiert alle
Geburtstage durchs Jahr und macht jede:n für den zuständig, der als nächstes
dran ist. Drei Eigenschaften fallen dabei von selbst ab, ohne dass sie geprüft
werden müssten: in einem Jahr ist jede:r genau einmal dran, niemand ist für sich
selbst zuständig, und wer gerade beschenkt wurde, ist als nächstes an der Reihe.

**Wer keinen Geburtstag eingetragen hat, steht nicht in der Reihe** — weder als
Beschenkter noch als Schenkender. Das ist keine Strafe, sondern die Bauart: Der
Platz in der Reihe ist der Geburtstag.

### Warum die Zuständigkeit gespeichert wird

Sie wird gerechnet **und** gespeichert. Rechnen allein könnte die Vergangenheit
nicht festhalten („wen hattest du in den letzten Runden") und würde jede nahe
Zuteilung noch umwerfen; Speichern allein zöge nicht nach, wenn jemand seinen
Geburtstag nachträgt.

`frozen()` entscheidet, was der Planer in Ruhe lässt: Die Frist läuft (Vorgabe
14 Tage), oder es steht schon ein **Preis** dran. Der zweite Fall ist der
wichtigere — wer das Geschenk hat, darf die Zuständigkeit nicht mehr verlieren,
weil jemand anders sein Geburtsdatum korrigiert hat.

### Vorschläge gehören der Person, nicht dem Geburtstag

`gift_idea.for_person_id`, nicht `occasion_id`. Was letztes Jahr übrig blieb,
ist dieses Jahr immer noch eine gute Idee; was genommen wurde, muss man kennen,
um es nicht zweimal zu schenken. `gift_idea_vote` ist eine Zustimmung als bloße
Zeile, wie `meeting_actionstep_done`.

### Wer Geburtstag hat, bekommt nichts geschickt

Die Regel steht in `BirthdayService.shapeOccasion()` und gilt für **jede**
Antwort — Übersicht, Detail, Terminliste. Ist der Betrachter das
Geburtstagskind, sind `gift`, `price_cents` und `gift_decided` leer und `ideas`
ist `null`. Nicht ausgeblendet: nie verschickt. Eine Überraschung, die nur eine
Entwicklerkonsole weit weg ist, ist keine.

Dazu passt, dass keine Route eine Personen-Id trägt. Wer fragt, kommt aus dem
Token — es gibt nichts zu fälschen.

### `related_occasion_id`

Dieselbe Geschichte wie bei `related_group_id`, eine Ebene weiter: Ohne diese
Spalte wäre „du besorgst das Geschenk für Mira" in jedem Jahr dieselbe
Nachricht wie im ersten und käme genau einmal im Leben an. `related_person_id`
reicht nicht — Mira hat jedes Jahr Geburtstag.

Wie beim Gebetsbuddy-Generator werden die Log-Zeilen einer Runde **gelöscht**,
bevor neu gemeldet wird: Person, Art und Runde bleiben sonst gleich, und die
Entdopplung verschluckte jede zweite Nachricht.

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
| Themen                 | `GET …/topics?scope=public&search=…`       |
| Nur die eigenen        | `GET …/topics?scope=mine`                  |
| Song-Datenbank         | `GET …/songs?sort=popular&playedOnly=true` |

### Suche

Bei Terminen läuft sie über **alle** Textfelder — Titel und Info-Zeile des
Abends, dazu Titel, Zusammenfassung und Actionstep der Einheit, die daran hing,
und den Titel ihres Themas. Die Archivfrage lautet
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
cp .env.prod.example .env.prod && chmod 600 .env.prod   # ausfüllen
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
./scripts/setup-keycloak.sh --production
```

Alles, was **außerhalb** der Container liegt — Server härten, nginx, TLS,
Backups, Restore, der Weg in die Datenbank —, steht im
[Betriebs-Handbuch](../deploy/README.md). Hier steht nur, was der Stack selbst
tut.

[`.env.prod.example`](.env.prod.example) ist die Liste aller Schlüssel an einer
Stelle. Sie ist getrennt von `.env.example`: die dort beschreibt die
Entwicklung und nur das, was der Nest-Prozess selbst liest. Produktiv kommen die
Werte für Compose (Datenbank-Passwörter, Keycloaks Bootstrap-Konto) und für
`setup-keycloak.sh` (`FRONTEND_URL`, `SMTP_*`) dazu — sie lagen vorher an drei
Stellen verstreut, und welche zusammen ein lauffähiges System ergeben, stand
nirgends.

Das [Dockerfile](Dockerfile) ist mehrstufig. `prisma generate` muss **vor**
`nest build` laufen, sonst fehlen die Typen aus `generated/prisma`. Der Container
läuft als `node`, nicht als root, und hat einen `HEALTHCHECK` auf `/api/health`.

**Der Server baut nichts.** Das Image kommt aus
[`.github/workflows/backend.yml`](../.github/workflows/backend.yml) und liegt in
der GHCR; auf dem VPS wird nur gezogen. Neben Keycloak und zwei Postgres einen
Node-Build mit vollem Abhängigkeitsbaum laufen zu lassen geht meist gut und
scheitert dann an dem Abend, an dem man es eilig hat. Zu jedem Build gibt es
einen sha-Tag, ein Rollback ist deshalb `IMAGE_TAG=<sha> … up -d`.

### Das Verzeichnis für Bilder gehört ins Image

`UPLOAD_DIR` zeigt im Container auf `/data/uploads`, und dort hängt ein Volume.
Den Pfad legt seit Kurzem das Dockerfile an — vorher tat es Docker beim
Einhängen, und zwar als `root:root`. Der Prozess läuft als `node`, und
`PhotoService.store()` beginnt mit einem `mkdir`:

```
drwxr-xr-x 2 root root /data/uploads
mkdir: can't create directory '/data/uploads/people': Permission denied
```

**Jeder Bild-Upload wäre in Produktion mit einem 500er gescheitert**, ohne dass
an der Anwendung etwas falsch gewesen wäre. Existiert das Verzeichnis dagegen im
Image, übernimmt das leere Volume beim ersten Start dessen Eigentümer. Nachsehen:

```bash
docker compose exec api ls -ld /data/uploads    # muss `node` gehören
```

### Leere Variablen sind keine gesetzten

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` und `GEMINI_API_KEY` sind optional — ohne
sie startet der Server und schaltet die jeweilige Funktion ab. Das galt aber nur,
solange die Zeile **fehlte**. Eine Zeile `GEMINI_API_KEY=` in der `.env` kommt
als leerer String an, nicht als `undefined`, und Compose reicht jedes `${FOO}`
ohnehin als leeren String weiter, wenn `FOO` nicht gesetzt ist — beides scheiterte
an `.min(1)`, und der Server kam gar nicht erst hoch. Statt einer abgeschalteten
Funktion gab es einen Bootfehler.

`optionalValue` in [`env.schema.ts`](src/config/env.schema.ts) behandelt jetzt
beides gleich, wie es `KEYCLOAK_INTERNAL_URL` und `APP_URL` schon taten.

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
Instanz läuft gibt es kein Rennen.

Er benutzt **dasselbe Image** wie die API, nur mit anderem `command`. Das ging
lange nicht: `prisma` und `dotenv` standen unter `devDependencies`, `--prod` ließ
sie weg, und der Service lief deshalb aus der `build`-Stufe. Solange auf dem
Server gebaut wurde, kostete das nichts — sobald das Image aus der CI kommt,
hieße es zwei Images bauen, pushen und ziehen, für einen Aufruf, der einmal pro
Deploy läuft. Beide stehen jetzt unter `dependencies`, und die Laufzeitstufe
bringt `prisma/` und `prisma.config.ts` mit.

Aufgerufen wird `node_modules/.bin/prisma`, nicht `pnpm exec prisma`: Im Image
ist corepack zwar eingeschaltet, pnpm selbst aber nicht entpackt — der erste
`pnpm`-Aufruf lädt es von registry.npmjs.org nach, bei jedem Deploy.

Zwei Dinge, die man wissen sollte:

- **Eine Instanz, nicht mehr.** Die Cron-Jobs (`@nestjs/schedule`) laufen
  in-process. Mit zwei Instanzen feuern Terminegenerator,
  Gebetsbuddy-Rotation und alle Reminder doppelt. Für neun Leute ist eine
  Instanz richtig — aber es muss dastehen. Ein Reverse Proxy davor verteilt
  deshalb keine Last, er terminiert nur TLS.
- **1,38 GB**, das meiste Prismas Engines. Davon gehen rund 130 MB auf den
  Prisma-CLI, der seit dem Umzug nach `dependencies` bewusst mit im Image liegt
  — der Preis dafür, dass es nur noch ein Image gibt statt zwei.

  Es waren einmal 1,78 GB, wegen eines abschließenden `RUN chown -R node:node
/app`. Ebenen sind unveränderlich: ein rekursives `chown` schreibt jede Datei
  neu und legt damit eine vollständige Kopie des `node_modules`-Baums als
  eigene Ebene an — 423 MB obendrauf, während das Original darunter liegen
  bleibt. Der `chown` ist ersatzlos gestrichen. Nötig war er nie: die Dateien
  gehören root und sind mit `755`/`644` für alle lesbar, und alles, was die
  Anwendung schreibt, geht nach stdout oder ins Uploads-Volume — nie in den
  Anwendungsbaum. Der Prozess läuft weiterhin als `uid=1000(node)`.

Im Prod-Compose läuft Keycloak in `start` statt `start-dev`, Ports hängen an
`127.0.0.1` statt an allen Interfaces, und keine Zugangsdaten stehen in der
Datei.

**`start`, aber ohne `--optimized`** — der Flag stand hier und ließ den ersten
Start scheitern: er verspricht Keycloak, dass `kc.sh build` schon gelaufen ist,
und beim allerersten Mal ist er das nicht („The '--optimized' flag was used for
first ever server start"). Der Container lief dann in einer Neustartschleife,
und zwar genau einmal — beim Aufsetzen, wo man es am wenigsten gebrauchen kann.
Ihn richtig zu nutzen hieße, ein eigenes Keycloak-Image zu bauen und zu pflegen;
für ein paar Sekunden Startzeit bei einem Dienst, der monatelang durchläuft, ist
das nicht der Mühe wert. Am Theme-Caching ändert es nichts.

**Logrotation** steht an allen Diensten (`json-file`, 3 × 10 MB). Ohne sie
schreibt Docker unbegrenzt weiter, und eine volle Platte äußert sich zuerst als
Datenbank, die nicht mehr schreiben kann.

**Postgres hängt an `127.0.0.1:5432`** — nicht für den Betrieb (die API spricht
über das Compose-Netz), sondern damit man per SSH-Tunnel hineinsehen kann. Wie,
steht im [Betriebs-Handbuch](../deploy/README.md#in-die-datenbank-sehen).

### Wie der erste Mensch hineinkommt

**Die Datenbank startet leer, und das bleibt so.** Der `migrate`-Service legt
nur das Schema an, `SEED_ENABLED` steht im Prod-Compose fest auf `false`, und
`--production` legt keine Testkonten an. Es gibt in der Produktion also weder
`testadmin` noch eingesäte Personen, die später wieder weg müssten.

Der Weg hinein ist derselbe, den jede:r geht:

1. Auf der Keycloak-Anmeldeseite **registrieren** (`registrationAllowed` ist an).
2. Die Bestätigungsmail anklicken — ohne bestätigte Adresse weist der
   `AuthGuard` jedes Token ab. Deshalb prüft `--production` vorher, dass echte
   SMTP-Werte gesetzt sind und bricht sonst ab: eine Anmeldeseite, an der sich
   niemand anmelden kann, ist der teuerste Fehler dieser Einrichtung.
3. In der App auf **„Hauskreis gründen"** — die gründende Person wird dabei
   automatisch dessen Admin (`MembershipService.create`).
4. Von dort die anderen acht einladen.

Kein Bootstrap-Skript daneben. Ein zweiter Weg hinein müsste gepflegt werden,
liefe im Alltag nie, und veraltete deshalb still — während dieser hier ohnehin
funktionieren muss.

`--production` bricht ab, solange eine der folgenden Variablen noch auf ihrer
Entwicklungs-Vorgabe steht: `SMTP_HOST`, `SMTP_FROM`, `KEYCLOAK_URL`,
`FRONTEND_URL`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ADMIN_PASSWORD`.

**Das Theme wird in der Produktion zwischengespeichert** (`start --optimized`,
anders als im Entwicklungsmodus). Eine Änderung an Farben oder Texten kostet
dort einen `docker compose restart keycloak`. `docker compose up -d` reicht
**nicht**: Compose legt einen Container nur neu an, wenn sich seine
Konfiguration ändert, und eine eingehängte Datei zählt nicht dazu.
[`deploy/deploy.sh`](../deploy/deploy.sh) erledigt den Neustart inzwischen von
selbst — aber nur, wenn der ausgerollte Commit `keycloak/themes` wirklich
angefasst hat.

#### Warum es von jedem Bündel zwei Fassungen gibt

Keycloak baut das Nachrichtenbündel in **zwei Durchgängen**: erst Englisch über
die ganze Theme-Kette, dann die gewünschte Sprache darüber. Ein Theme, das nur
`messages_de.properties` mitbringt, verliert deshalb _alle_ eigenen Schlüssel,
sobald die aufgelöste Sprache nicht `de` ist — und FreeMarker druckt dann den
Schlüsselnamen ab. Die Einladungsmail kam eine Weile genau so an, mit
„emailBrand" und „executeActionsHeadline" im Text.

Beide Themes tragen deshalb zusätzlich ein `messages_en.properties` mit
**denselben deutschen Texten**. Das ist keine Übersetzung, sondern ein
Sicherungsnetz: Der Realm kennt nur `de`, und eine halbe englische Oberfläche
wäre kein Gewinn. Dass die beiden Dateien nicht auseinanderlaufen, prüft
[`keycloak-theme-messages.spec.ts`](src/auth/keycloak-theme-messages.spec.ts).

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
| `POST`                  | `…/people/:id/resend-invitation`             | `admin`                                      |
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
| `GET`                   | `…/meetings/config`                          | eingeloggt (Wochentag + Uhrzeit der Gruppe)  |
| `PUT`                   | `…/meetings/config`                          | `admin` (`If-Match`), gilt für neue Termine  |
| `POST`                  | `…/meetings/generate`                        | `admin` (manueller Generator-Trigger)        |
| `POST`                  | `…/meetings/host-reminders`                  | `admin` (manueller Reminder-Trigger)         |
| `POST`                  | `…/meetings/actionstep-reminders`            | `admin` (manueller Reminder-Trigger)         |
| `GET`/`PUT`             | `…/meetings/:id/topic-responsibles`          | eingeloggt (PUT ohne If-Match)               |
| `GET`                   | `…/meetings/:id/topic-choices`               | eingeloggt                                   |
| `POST`/`DELETE`         | `…/meetings/:id/topic-session`               | nur zugeteilt                                |
| `GET`                   | `…/topics?scope=…&search=&from=&to=`         | eingeloggt (paginiert)                       |
| `GET`                   | `…/topics/:id`                               | eingeloggt                                   |
| `PATCH`                 | `…/topics/:id`                               | Owner/Mitarbeit                              |
| `DELETE`                | `…/topics/:id`                               | Owner oder `admin`                           |
| `DELETE`                | `…/topics/:id/collaborators/:personId`       | Owner oder `admin`                           |
| `POST`                  | `…/topics/:id/sessions`                      | Owner/Mitarbeit                              |
| `GET`/`PATCH`/`DELETE`  | `…/topic-sessions/:id`                       | Owner/Mitarbeit                              |
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

Eine Einladung ist **Adresse und Rolle** — mehr nicht. Ob jemand ein Instrument
spielt, wo er wohnt und ob er gerade hosten möchte, weiß nur er selbst; das
steht im Profil. Wer es im Einladungsformular ausfüllte, träfe Annahmen über
einen Menschen, der noch gar nicht da ist.

**Auch keinen Namen.** Bis Phase H tippte der Admin einen ein, und der stand
danach als Anzeigename in der App — auch dann, wenn die Person sich beim
Aktivieren ihres Kontos ganz anders genannt hat. Zwei Leute benannten denselben
Menschen, und der Betroffene gewann nicht. Bis zur ersten Anmeldung steht jetzt
der lokale Teil der Adresse da, damit die Zeile überhaupt etwas anzeigt; danach
übernimmt `resolveForUser` den selbst gewählten Namen.

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

### Wenn die Mail nicht rausgeht

`sendInvitationEmail` fängt jeden Fehler ab und antwortet mit
`invitationEmailSent: false`. Das ist Absicht: Konto und Person stehen, es fehlt
nur die Mail — ein Fehlschlag würde beides wieder abräumen, obwohl bloß der
Mailserver klemmte.

Sichtbar machen und **erneut senden** können ist die Antwort darauf:
`POST …/people/:id/resend-invitation` schickt dieselben drei Schritte noch
einmal. Sie sind wiederholbar; wer sein Passwort inzwischen gesetzt hat, wird
nur ein zweites Mal danach gefragt, und das ist harmlos gegenüber „kommt gar
nicht herein".

> Das Frontend zeigte hier bis Phase H einen **grünen Haken für etwas, das nicht
> passiert war**: `invitationEmailSent` wurde gelesen, aber beide Fälle liefen
> durch `toast.success`. Das Backend war richtig, gelesen hat es nur niemand
> richtig.

### Profilbilder

Datei im Volume, Zeitstempel in der Datenbank. Das Bild kommt **nicht** in eine
Spalte: es ist kein Datensatz, den man abfragt, sondern ein Blob, den man
ausliefert — in der Datenbank machte er jede Personen-Abfrage schwerer und jedes
Backup größer, ohne dass irgendwer je `WHERE bild = …` schriebe.

|           |                                                                          |
| --------- | ------------------------------------------------------------------------ |
| Ablage    | `UPLOAD_DIR/people/{id}.webp`, mittig zugeschnitten auf 512 px (`sharp`) |
| Hochladen | `POST /api/me/photo`, Multipart, Feld `file`, max. 5 MB                  |
| Abrufen   | `GET …/people/:id/photo` — `image/webp`, `ETag`, `private, max-age=3600` |
| Entfernen | `DELETE /api/me/photo`; ein Austritt tut dasselbe                        |

Der **Dateiname folgt der Id** statt in einer Spalte zu stehen: eine zweite
Wahrheit über etwas, das ohnehin feststeht, könnte auseinanderlaufen.
Gespeichert wird stattdessen `photoUpdatedAt` — und der ist mehr als
Buchhaltung, er **ist** die Bild-URL. Die App hängt ihn als Query-Parameter an
und erledigt damit das Zwischenspeichern im Browser; ohne ihn zeigte nach einem
Wechsel weiter das alte Bild.

`photoUpdatedAt` steht deshalb auch an **`personRefSchema`**, nicht nur an der
vollen Person: ein Avatar taucht überall dort auf, wo jemand _benannt_ wird — als
Gastgeber, als Themen-Zuständige, als Gebetsbuddy. Damit die zwölf
handgeschriebenen `select`-Blöcke dazu nicht auseinanderlaufen, steht direkt
neben dem Schema ein `personRefSelect`. Das Schema **filtert**: was im Select
fehlt, fehlt in der Antwort, und die Antwort scheitert dann an ihrem eigenen
Schema — mit 500, nicht mit einem Typfehler.

Zwei Dinge, die man dabei leicht übersieht:

- **`crossOriginResourcePolicy`** muss in `helmet()` auf `cross-origin` stehen.
  Helmets Vorgabe `same-origin` lässt den Browser das Bild verwerfen,
  **nachdem** es geladen wurde: im Netz-Tab steht 200, im `<img>` steht nichts.
- **Ein `<img src>` schickt kein Bearer-Token.** Die App holt das Bild deshalb
  über den Fetch-Wrapper und macht daraus eine Data-URL. Der Umweg ist der
  Preis dafür, dass es keine Cookie-Sitzung gibt — und die will man hier nicht.

### Kopfbilder der Bildschirme

Dieselbe Mechanik wie bei den Profilbildern, nur eine Ebene höher: Startbildschirm,
Gebet, Archiv und Profil tragen im Kopfbereich ein Hintergrundbild. **Termine
bewusst nicht** — dort liest man eine Liste über Wochen und sucht eine Zeile.

|           |                                                                                 |
| --------- | ------------------------------------------------------------------------------- |
| Ablage    | `UPLOAD_DIR/headers/{hauskreisId}-{screen}.webp`, mittig auf 1280×640 (`sharp`) |
| Auflisten | `GET …/header-images` — `[{ screen, updatedAt }]`, ein Aufruf für alle vier     |
| Abrufen   | `GET …/header-images/:screen` — `image/webp`, `ETag`, `private, max-age=3600`   |
| Hochladen | `POST …/header-images/:screen`, Multipart, Feld `file`, max. **10 MB**          |
| Entfernen | `DELETE …/header-images/:screen`                                                |

Drei Unterschiede zum Profilbild, jeder mit einem Grund:

- **Ein Bild gilt für die ganze Gruppe, und jede:r darf es tauschen.** Kein
  `@HauskreisAdmin()`: bei neun Leuten, die sich kennen, ist das Hintergrundbild
  keine Verwaltungsangelegenheit — und ein Knopf, der für die meisten nur eine
  Fehlermeldung erzeugt, wäre schlimmer als keiner.
- **Zehn Megabyte statt fünf.** Beim Profilbild schneidet man einen Kopf aus,
  hier lädt jemand ein Landschaftsfoto vom Handy hoch, und das sprengt fünf
  regelmäßig. Verkleinert wird ohnehin serverseitig.
- **Keine Zeile heißt „Vorgabe".** Entfernen löscht die Zeile, statt ein Feld
  auf `null` zu setzen: es gibt keinen Zustand „ausdrücklich abgewählt", der
  sich von „noch keins" sinnvoll unterscheiden ließe. In der App steht dann ein
  Verlauf, je Bildschirm ein eigener.

Die Selbstheilung aus `PhotoService` ist mitgenommen: fehlt die **Datei**,
obwohl die Zeile steht (Volume weg, Backup zurückgespielt), verschwindet die
Zeile und der Verlauf ist zurück — statt dass ein `404` auf ein versprochenes
Bild für immer stehen bliebe.

### Nutzername und Anzeigename

Zwei Felder, eine klare Richtung — und der Grund ist nicht Ordnungsliebe:
Keycloak normalisiert Nutzernamen auf **Kleinschreibung**. Ein einziges Feld
hieße, dass „niko" auf jeder Karte, jedem Avatar und in jeder Benachrichtigung
steht.

| Feld       | Was es ist                         | Wer es setzt                            |
| ---------- | ---------------------------------- | --------------------------------------- |
| `username` | womit man sich anmeldet            | die Person, in Keycloak — und im Profil |
| `name`     | was auf Karten und in Texten steht | die Person, im Profil                   |

`username` ist **global** eindeutig, nicht je Hauskreis: Keycloak erzwingt es
realmweit, und ein Datenmodell mit der schwächeren Regel kann sie nur verletzen.
Wer geht, gibt ihn wie die `keycloakUserId` wieder frei.

**Beim ersten Anmelden** übernimmt `resolveForUser` den Namen aus
`preferred_username` und belegt den Anzeigenamen damit vor. Nur beim ersten Mal:
danach ist der Anzeigename entweder selbst gewählt oder von dort, und ihn bei
jeder Anmeldung neu zu setzen nähme eine Entscheidung aus dem Profil zurück.

**Bei einer Änderung im Profil** geht sie zuerst nach Keycloak und erst dann in
die Datenbank (`KeycloakAdminService.changeUsername`). Andersherum hießen die
beiden verschieden, sobald Keycloak ablehnt — genau der Zustand, den das Feld
beendet. Erlaubt sind `^[a-z0-9._-]{3,30}$`.

> Dafür musste `request()` den **Statuscode durchreichen**, statt alles auf 500
> abzubilden. Vorher sah ein belegter Nutzername (409) genauso aus wie ein
> Serverfehler, und der echte Grund eines Mailfehlers — etwa eine ungültige
> `redirect_uri` (400) — verschwand in der SMTP-Warnung.

Damit das Feld in Keycloak überhaupt beschreibbar ist, setzt
`setup-keycloak.sh` am Realm `editUsernameAllowed`. Daraus folgt eine Regel für
`changeEmail`: der Nutzername wird dort **nicht** mitgeschrieben — das PUT
schickt nur `email` und `emailVerified`, und was nicht darin steht, lässt
Keycloak in Ruhe.

Verknüpft bleibt trotzdem die Adresse: `resolveForUser` findet die Person über
`person.email`, nicht über den Nutzernamen.

### Selbst registrieren — und warum die Bestätigung Pflicht ist

`registrationAllowed` am Realm, plus „Kein Account? Registrieren" im
Anmeldebildschirm (`auth.signinRedirect({ prompt: 'create' })`). Wer so
hereinkommt, gehört zu keinem Hauskreis — ein gültiger Zustand, den der
vorhandene Bildschirm „Hauskreis gründen / eingeladen werden" auffängt.

**`verifyEmail` ist dabei kein Komfort, sondern die Absicherung.**
`resolveForUser` verknüpft ein frisches Konto über die **E-Mail-Adresse** mit
einer offenen Einladung. Ohne Bestätigung könnte sich jemand mit der Adresse
einer eingeladenen Person registrieren und deren Platz übernehmen. Der Realm
verlangt sie deshalb, und `AuthGuard` weist zusätzlich jedes Token ohne
`email_verified` ab — die Tür, die uns gehört, unabhängig von einer
Realm-Einstellung, die jemand versehentlich zurückdreht.

`loginWithEmailAllowed` lässt beides zur Anmeldung zu, Nutzername oder Adresse.
`registrationEmailAsUsername` bleibt **aus**: sonst gäbe es das Feld
„Nutzername" gar nicht, und genau der soll in der App stehen.

> **Produktiv braucht das einen echten Mailserver.** Ohne Mailversand kommt mit
> `verifyEmail` niemand mehr herein, und auch die Einladung besteht aus einer
> Mail. `setup-keycloak.sh` nimmt dafür `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`
> sowie `SMTP_AUTH`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SSL` und
> `SMTP_STARTTLS` aus der Umgebung; die Vorgaben passen zu Mailpit, ein echter
> Server braucht Anmeldung und Verschlüsselung. In `docker-compose.prod.yml`
> stehen sie bewusst **nicht** beim Keycloak-Dienst: Keycloak liest den
> Mailversand aus der Realm-Konfiguration, nicht aus der Umgebung, und
> Variablen dort sähen nach Einrichtung aus und wären wirkungslos.

Ebenfalls am Realm: `resetPasswordAllowed`. Ohne das wäre ein vergessenes
Passwort eine Sackgasse — die App kennt keinen Weg, eine Einladung noch einmal
zu schicken.

> **Jede Realm-Einstellung wird erst durch einen erneuten Lauf von
> `setup-keycloak.sh` scharf.** Steht die Zeile im Skript und ist der Realm
> älter, gilt weiterhin der Keycloak-Standard — bei `registrationAllowed`
> äußert sich das als **400 „Registrierung nicht erlaubt"** auf der
> Registrierungsseite, ohne eine Spur im Backend. Das Skript ist deshalb dazu
> gedacht, wiederholt zu laufen, und fasst bestehende Konten nicht mehr an:
> Nutzername, Passwort und Profil gehören ab dem Anlegen den Menschen davor.
> Wer ein verkonfiguriertes Testkonto zurücksetzen will, ruft
> `./scripts/setup-keycloak.sh --reset-users` auf.

### Unbestätigt heißt draußen — und darf keine Schleife werden

`AuthGuard` weist ein Token mit unbestätigter Adresse ab. Das ist richtig, hat
aber eine Falle, in die diese App einmal getappt ist: mit **401** beantwortet,
heißt die Abweisung für jeden Client „dein Token ist alt, hol ein neues". Genau
das tat das Frontend — und Keycloaks Refresh-Grant führt keine Required Actions
aus, das neue Token trug dieselbe unbestätigte Adresse, und aus Abweisung und
Erneuerung wurde eine Schleife, die den ganzen Cache mitriss.

Deshalb ist es ein **403 mit `code: "EMAIL_NOT_VERIFIED"`** im Fehlerkörper
(`errorSchema`). Der Statuscode sagt, was gemeint ist: das Token ist in
Ordnung, dieser Mensch darf trotzdem nicht herein. Ein `code` und keine
Meldung, weil der deutsche Satz daneben sich ändern darf.

Ausgelöst wird der Zustand auf zwei Wegen — nach einer Selbstregistrierung und
nach `PATCH /api/me/email`, denn ein Adresswechsel setzt `emailVerified` in
Keycloak zurück. Die App zeigt dann einen eigenen Bildschirm mit „Mail erneut
senden" und „Ich habe bestätigt". Das zweite führt über eine echte Anmeldung
und nicht über ein Neuladen: nur sie stellt ein Token mit dem neuen Stand aus.

`POST /api/me/resend-verification` ist die **einzige** Route, die eine
unbestätigte Adresse durchlässt (`@AllowUnverifiedEmail`). Ohne sie wäre der
Zustand eine Sackgasse. Sie löst deshalb auch keine Person auf und schreibt
nichts — bei jemandem, der sich eben erst registriert hat, gibt es noch gar
keine Zeile.

### Zwei Mails, zwei Endpunkte

Keycloak wählt die Vorlage nach dem **Endpunkt**, nicht nach den Aktionen im
Rumpf. `execute-actions-email` rendert immer `executeActions` — bei uns die
Einladung („Du bist im Hauskreis dabei"). Ein Adresswechsel verschickte damit
lange eine Einladung an jemanden, der längst dabei war; der Link stimmte, der
Text nicht.

| Anlass                         | Endpunkt                | Vorlage             |
| ------------------------------ | ----------------------- | ------------------- |
| Einladung, Einladung erneut    | `execute-actions-email` | `executeActions`    |
| Adresswechsel, Bestätigung neu | `send-verify-email`     | `emailVerification` |

Die Einladung bleibt bei `execute-actions-email`, weil sie drei Schritte
braucht (`UPDATE_PROFILE`, `UPDATE_PASSWORD`, `VERIFY_EMAIL`) und es dafür
keinen anderen Weg gibt. Beide Endpunkte bekommen dieselben Query-Parameter
(`actionsEmailQuery`), sonst endet der Ablauf auf einer Keycloak-Seite ohne
Ausgang. Festgehalten in `keycloak-admin.service.spec.ts` — an einer Signatur
ist der Unterschied nicht zu erkennen, beide Aufrufe liefern eine Mail ab.

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
