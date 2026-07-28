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

## API (Stand: Phase 6)

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
| `GET`                   | `…/topics?status=RUNNING\|COMPLETED`         | eingeloggt (paginiert)                   |
| `GET`                   | `…/topics/:id`                               | eingeloggt                               |
| `POST`                  | `…/topics`                                   | eingeloggt                               |
| `PATCH`                 | `…/topics/:id`                               | eingeloggt                               |
| `DELETE`                | `…/topics/:id`                               | `admin`                                  |
| `POST`                  | `…/topics/carry-over`                        | `admin` (manuelle Themen-Übernahme)      |
| `GET`                   | `…/songs?search=`                            | eingeloggt (paginiert)                   |
| `GET`                   | `…/songs/:id`                                | eingeloggt                               |
| `POST`                  | `…/songs`                                    | eingeloggt (legt an oder gibt zurück)    |
| `PATCH`                 | `…/songs/:id`                                | eingeloggt                               |
| `DELETE`                | `…/songs/:id`                                | `admin` (nur wenn nirgends verwendet)    |
| `GET`/`POST`            | `…/meetings/:id/songs`                       | eingeloggt                               |
| `PATCH`/`DELETE`        | `…/meetings/:id/songs/:entryId`              | eingeloggt                               |
| `GET`/`PUT`             | `…/meetings/:id/song-leaders`                | eingeloggt                               |
| `GET`                   | `…/meetings/:id/song-leader-suggestions`     | eingeloggt                               |

Alle `GET`s beantworten `If-None-Match` mit `304`. Die `PATCH`-Endpunkte auf
Personen, Locations, Terminen, Themen und Songs sowie `…/meetings/:id/cancel` **verlangen**
`If-Match` (`428` ohne, `412` bei veralteter Version) — Details siehe
[Conditional Requests](#conditional-requests-etag-304-412).

> Der Invite-Endpunkt legt den Keycloak-Account an, weist die Realm-Rolle zu und
> verschickt die Einladung. Lokal landet die Mail in Mailpit (<http://localhost:8025>).
> Schlägt nur der Mailversand fehl, antwortet er mit `invitationEmailSent: false` —
> der Account existiert dann trotzdem und die Einladung kann erneut gesendet werden.
> Scheitert dagegen ein früherer Schritt, wird der Keycloak-Account wieder gelöscht,
> damit kein verwaister Account zurückbleibt.
