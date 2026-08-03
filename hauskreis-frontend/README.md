# Hauskreis Frontend

Next.js 16 (App Router) + React 19, TanStack Query, Tailwind 4, Keycloak über
PKCE, PWA mit Web Push. Was die App fachlich leisten soll, steht in
[CLAUDE.md](../CLAUDE.md); wie die API sich verhält, in
[docs/api-fuer-frontend.md](../docs/api-fuer-frontend.md).

## Loslegen

```bash
cp .env.example .env.local
pnpm install                  # hier, nicht im Repo-Root (siehe Root-README)
pnpm dev                      # http://localhost:3001
```

Vorher muss das Backend laufen — Anleitung im
[Backend-README](../hauskreis-backend/README.md), kurz:

```bash
cd ../hauskreis-backend
docker compose up -d          # Postgres, Keycloak, Mailpit
./scripts/setup-keycloak.sh   # Realm, Clients, Testnutzer
pnpm db:migrate && pnpm db:seed
pnpm start:dev                # http://localhost:3000/api
```

Testnutzer: `testadmin` und `testmember`, Passwort jeweils `test1234`.

| Was      | Wo                                        |
| -------- | ----------------------------------------- |
| Frontend | `http://localhost:3001`                   |
| API      | `http://localhost:3000/api`               |
| Keycloak | `http://localhost:8080`                   |
| Mailpit  | `http://localhost:8025` (Einladungsmails) |

Die **3001** ist nicht beliebig: `scripts/setup-keycloak.sh` trägt sie als
Redirect-URI und Web-Origin ein, und `CORS_ORIGINS` im Backend erlaubt sie.
Ein anderer Port muss an allen drei Stellen geändert werden.

## Befehle

| Befehl         | Was                                                          |
| -------------- | ------------------------------------------------------------ |
| `pnpm dev`     | Entwicklungsserver auf 3001 (Turbopack, ohne Service Worker) |
| `pnpm build`   | Produktionsbau **mit** `--webpack` — siehe unten             |
| `pnpm start`   | gebaute App auf 3001                                         |
| `pnpm gen:api` | Typen aus `../hauskreis-backend/openapi.json` erzeugen       |
| `pnpm check`   | Lint, Formatprüfung und Typecheck in einem                   |

## Architektur

```
src/
├─ app/                    Routen (App Router) + Service Worker
│  ├─ (app)/               alles hinter der Anmeldung
│  └─ auth/callback/       Ziel der Keycloak-Umleitung
├─ components/
│  ├─ ui/                  Bausteine ohne Fachwissen (Card, Sheet, Avatar …)
│  ├─ layout/              Gerüst, Navigation, AuthGate
│  └─ domain/              Bausteine mit Fachwissen (MeetingCard, RoleChip …)
├─ features/               Bildschirme, aus den Bausteinen zusammengesetzt
└─ lib/
   ├─ api/                 Transport, Typen, Query-Hooks
   ├─ auth/                OIDC-Konfiguration, Rollen
   ├─ hauskreis/           welcher Hauskreis gerade offen ist
   ├─ push/                Abonnement-Lebenszyklus
   └─ date.ts              Kalendertage ≠ Zeitpunkte
```

### Die API-Schicht

Erzeugt wird nur die **Typdatei**: `pnpm gen:api` schreibt
`src/lib/api/schema.d.ts` aus der OpenAPI-Spec des Backends (eingecheckt, damit
CI nicht davon abhängt, dass das Backend danebenliegt). `types.ts` gibt den
verschachtelten Formen lesbare Namen.

Der Transport ist von Hand geschrieben (`client.ts`), weil die Spec zwei Dinge
nicht beschreibt, die für jeden Aufruf gelten:

**ETags.** Jedes `PATCH`/`PUT` auf eine Einzelressource verlangt `If-Match` mit
dem ETag aus dem vorangehenden `GET`. Deshalb liefert `apiGetResource` immer
`{ data, etag }`, und der ETag landet **neben den Daten im Query-Cache** — nicht
in einer globalen Map, die Invalidierungen überlebt und irgendwann einen ETag zu
längst anderen Daten hält. `useResourceUpdate` holt ihn von dort und behandelt
`412` als das, was es ist: jemand anders war schneller. Angezeigt wird das als
`ConflictBanner`, nie stillschweigend erneut versucht.

Vier Routen wollen ausdrücklich **keine** Vorbedingung (Anwesenheit,
Song-Leiter, Lieder eines Termins, Benachrichtigungs-Einstellungen). Sie
übergeben das Symbol `UNCONDITIONAL` — es zwingt an jeder Schreibstelle zu einer
bewussten Entscheidung, statt das Feld einfach weglassen zu können.

**Rollen.** `@Roles('admin')` hinterlässt keine Spur in der Spec. Die Liste der
18 Admin-Routen steht deshalb in `lib/auth/roles.ts` — sie steuert nur, welche
Bedienelemente erscheinen; durchgesetzt wird sie weiterhin vom Server.

### Anmeldung und Sitzung

Man bleibt angemeldet, bis man sich abmeldet. Das ist keine Selbstverständlichkeit
und hängt an drei Entscheidungen:

**`offline_access` im Scope.** Ohne den Scope hängt das Refresh-Token an der
SSO-Sitzung von Keycloak, und die steht im Realm auf 30 Minuten Leerlauf und
10 Stunden Maximum — man müsste sich also mehrmals täglich neu anmelden. Mit dem
Scope stellt Keycloak ein Offline-Token aus: es liegt in der Datenbank statt im
Sitzungs-Cache, überlebt einen Keycloak-Neustart, läuft erst nach 30 Tagen ohne
Benutzung ab und hat kein hartes Maximum. Der Preis ist ein langlebiges
Refresh-Token im `localStorage`; bei einem XSS wäre das ein dauerhafter Zugang.
Für neun Leute auf ihren eigenen Telefonen ist das die richtige Abwägung.

**Wiederherstellung beim Start** (`lib/auth/use-session-restore.ts`).
`react-oidc-context` meldet `isAuthenticated: false`, sobald das **Access**-Token
abgelaufen ist — und das ist nach fünf Minuten der Fall. `automaticSilentRenew`
hilft dann nicht mehr: der Erneuerungs-Timer wird aus der Restlaufzeit gestellt
und bei einem bereits abgelaufenen Token gar nicht erst gesetzt. Ohne diesen
Schritt sähe man deshalb nach jeder längeren Pause den Login-Bildschirm, obwohl
ein gültiges Refresh-Token danebenliegt. Der Hook schaut vor dem Rendern in den
Speicher: liegt dort ein Refresh-Token, wird still erneuert; liegt keins da, ist
es eine echte Abmeldung und der Login-Bildschirm richtig.

**Ein toter Refresh-Token ist kein Fehler, sondern eine Abmeldung.**
`signinSilent` wirft nicht: der Provider fängt den Fehler selbst, schreibt ihn
nach `auth.error` und gibt `null` zurück. Und `auth.error` bleibt stehen, bis
eine Anmeldung gelingt. Ohne Unterscheidung nach `error.source` verdeckte
deshalb ein abgelaufenes Token dauerhaft den Anmelde-Knopf mit einer roten
Meldung — bei einem Offline-Token der Normalfall nach 30 Tagen Pause, nach
einem neu eingespielten Realm oder nach dem Abmelden auf einem anderen Gerät.
Das gescheiterte Token fliegt zusätzlich aus dem Speicher; sonst versucht es
jeder weitere Start erneut, ohne dass es je gelingen könnte.

**Nach dem Tausch fliegen `code` und `state` aus der Adresszeile**
(`clearSigninParams`). Solange sie dort stehen, ist jede weitere Ladung dieser
Seite ein zweiter Einlöseversuch desselben Codes — ein wiederhergestellter Tab
genügt. Keycloak weist den zweiten korrekt ab und lässt die Sitzung des ersten
unangetastet (nachgestellt, auch mit zwei gleichzeitigen Anfragen), aber es
gibt keinen Grund, ihn zu ermöglichen.

**Abmelden zieht die Tokens zurück** (`revokeTokensOnSignout`). Sonst bliebe ein
Offline-Token gültig, obwohl sich jemand abgemeldet hat. `signoutRedirect`
entfernt zusätzlich den gespeicherten Stand, bevor es zu Keycloak weitergeht —
sonst würde die Wiederherstellung von oben einen gerade Abgemeldeten sofort
wieder hereinlassen.

### Passwort ändern, ohne die App zu verlassen

Der Knopf in der Konto-Karte führt nicht in die Keycloak-Account-Konsole,
sondern schickt eine gewöhnliche Anmeldung mit `kc_action=UPDATE_PASSWORD`
los (`accountActionArgs`). Keycloak nennt das eine _application-initiated
action_: derselbe Ablauf wie beim Anmelden, nur mit einem Zwischenschritt. Das
ist genau die Seite, die man beim Einstieg schon gesehen hat, im Theme der App
— die Konsole wäre ein Bruch mitten im Vorgang.

Zurück kommt die Antwort in zwei Teilen, und beide brauchen ein bisschen
Sorgfalt:

- **Wohin.** `signinRedirect` bekommt ein `state` mit dem Rückweg; die
  Callback-Seite liest ihn über `returnPathOf`. Das prüft, dass es ein eigener
  Pfad ist — ein `state` aus fremder Hand wäre sonst eine offene Weiterleitung.
- **Ob es geklappt hat.** `kc_action_status` steht in der Adresszeile, aber
  `clearSigninParams` räumt die gerade auf. Statt den Wert in einer
  Modulvariable zwischenzulagern, schreibt `clearSigninParams` ihn in die neue
  Adresse (`?done=success`). Die Callback-Seite liest ihn dort, zeigt die
  Meldung und entfernt ihn — dadurch darf der Effekt doppelt laufen, ohne dass
  zwei Meldungen erscheinen.

### Wenn nichts antwortet

Unter WSL reißen Verbindungen gern mal ab, und die betroffenen Stellen haben von
sich aus keine Frist:

- **Der Fetch-Wrapper** bricht nach 20 Sekunden mit einem `TimeoutError` ab.
  Ohne das hinge eine Anfrage, die nie ankommt, für immer im Ladezustand — kein
  Fehler, kein Ausweg. Zeitüberschreitungen und Netzfehler werden (anders als
  4xx) einmal wiederholt.
- **Wartebildschirme** geben nach zwölf Sekunden zu, dass etwas nicht stimmt,
  und bieten einen Knopf an (`lib/use-slow.ts`). Das betrifft vor allem die
  Anmeldung: das Laden der OIDC-Metadaten und der Tausch von Code gegen Token
  haben in `oidc-client-ts` keinen Timeout.

### Caching

`lib/api/cache.ts` legt fest, wie lange was frisch ist: Stammdaten zehn Minuten,
Listen und Home eine Minute, Einzelressourcen dreißig Sekunden — und Vorschläge
**gar nicht**, weil sie die Entscheidungsgrundlage beim Eintragen sind.

Nachgeladen wird per `useInfiniteList` über `skip`/`take`; verzweigt wird auf
`hasMore` aus der Antwort, nicht auf selbst gerechnetem `skip + take < total`.
Detailseiten werden beim Antippen der Karte vorgeladen, Kalender, Tabelle und
Sheets liegen hinter `next/dynamic`.

### Datumsfelder

Ein Kalendertag ist `2026-08-11` und **kein** Zeitpunkt. `new Date('2026-08-11')`
liest ihn als UTC-Mitternacht; lokal formatiert wird daraus westlich von UTC der 10. August. `lib/date.ts` zerlegt den String stattdessen (`parseDay`). Für
`createdAt`/`updatedAt`/`sentAt` — die einzigen echten Zeitstempel — gibt es
`formatTimestamp`.

### Leere Felder

Ein Termin ohne Host ist ein Treffen im Schlosspark. Ein Thema ohne Titel ist
eines, für das noch niemand einen festgelegt hat. Ein Lobpreisabend hat gar kein
Thema. Solche Zustände bekommen ihren eigenen Text — nicht `—` und nicht die
Fehlerdarstellung.

## Der Startbildschirm

Ein Aufruf (`…/home`), vier Blöcke. Zwei Entscheidungen darin sind es wert,
aufgeschrieben zu werden.

**„Deine Rollen" zeigt zwei Stufen, nicht acht Wochen am Stück.**

|                           |                                                              |
| ------------------------- | ------------------------------------------------------------ |
| **Beim nächsten Treffen** | alle eigenen Rollen an genau diesem Abend                    |
| **Weitere**               | je Kategorie (Host, Thema, Musik) nur die **nächste** danach |

Der Bezugspunkt der ersten Gruppe ist der **Termin**, nicht die Kalenderwoche.
Der Hauskreis ist dienstags: ab Mittwoch wäre eine Kalenderwoche fast immer
leer, und ausgerechnet der Abend, um den es geht, stünde unter „Weitere".
Gefiltert wird deshalb über `nextMeeting.id` aus derselben Antwort — der Server
entscheidet einmal, welcher Abend der nächste ist, und beide Abschnitte des
Bildschirms folgen ihm.

Hat man an dem Abend nichts zu tun, verschwindet die Gruppe ganz, statt „nichts
geplant" zu behaupten. Dasselbe gilt für Kategorien ohne Zuteilung: eine Zeile
„Musik: nichts" hilft niemandem.

Bei „Weitere" steht bewusst nur die nächste je Kategorie. Wer dreimal in acht
Wochen hostet, muss das hier nicht dreimal lesen — die zweite und dritte Zeile
ändern nichts an dem, was man heute tun kann. Der vollständige Vorlauf steht in
der Planungstabelle.

Die Zeile nennt erst die Rolle, dann den Zusatz: „**Host** · Bei Chris". Vorher
stand da nur „Bei Chris", was nicht verrät, dass _du_ derjenige bist, der
aufschließt.

**Gebetsbuddys tauchen unter „Deine Rollen" nicht mehr auf.** Sie haben ihre
eigene Karte weiter oben und ihren eigenen Bildschirm, und mit jemandem zu
beten ist keine Aufgabe, die man abarbeitet. Weggelassen werden sie schon vom
Server, nicht erst hier — siehe `myRoles` im Backend-README.

**„Nächstes Treffen" nennt alle drei Rollen** in denselben `RoleChip`s wie die
Terminkarte. Sonst hieße „noch kein Host" auf zwei Bildschirmen zweierlei. Die
Chips verlinken aufs Detail, weil dort das „+ Musik eintragen" auch einlösbar
ist. „Bist du dabei?" bleibt unverändert und gilt weiterhin nur für genau
diesen einen Abend.

## Die Termin-Detailseite

Zwei Regeln prägen den Aufbau, beide inhaltlich und nicht kosmetisch.

**Ort und Gastgeber sind eine Entscheidung.** Solange ein Gastgeber eingetragen
ist, gibt es keine Ortsauswahl — der Ort steht einfach da. Ohne Gastgeber wird
er wählbar, aber nur unter den Treffpunkten ohne Gastgeber
(`isSelectableWithoutHost`), plus „Treffpunkt anlegen" über das
`LocationSheet`. Ein Zuhause taucht dort nie auf: es kommt über seine
Bewohner:innen an den Termin, nie über eine Liste. Durchgesetzt wird das im
Backend; die Oberfläche bildet es nur ab.

**Ein vergangener Abend ist ein eigener Zustand**, kein ausgegrauter kommender:

|                 |                                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| Rolle eintragen | nur nach Rückfrage, und ohne Vorschläge (`withoutSuggestions`)                |
| Lieder          | unveränderlich — sonst verrutschen `timesPlayed` und `lastPlayedAt` im Archiv |
| Absage          | heißt „als abgesagt markieren" und verschickt nichts                          |

Dazu drei kleinere Umbauten:

- **Der Titel sitzt am Überschriftstext**, nicht in einem Feld weiter unten.
  Angezeigt wird die fertige Überschrift (eigener Titel, sonst das Thema, sonst
  die Terminart); bearbeitet wird aber nur `meeting.title`. Würde der Entwurf
  mit der Überschrift starten, machte das erste Speichern aus dem geerbten
  Themen-Titel einen eigenen — und der Termin löste sich still vom Thema ab.
- **Der Info-Text steht oben.** Dort steht, was man _vor_ dem Abend wissen muss;
  unten zwischen Zusammenfassung und Actionstep las es niemand rechtzeitig.
- **„Wer kommt" ist eine Liste.** Vorher ließ sich für jede Person durchtippen,
  was wie eine Anwesenheitskontrolle aussah und mit einem Fehlgriff wildfremd
  absagte. Die eigene Antwort ist deshalb nicht verschwunden, sondern eine
  eigene Zeile darunter — ohne die gäbe es für einen Abend in drei Wochen gar
  keinen Weg zuzusagen, denn „Bist du dabei?" auf dem Home-Screen gilt nur
  fürs nächste Treffen.

## Zuteilen: Sheet und Tabelle

**Das Sheet zeigt das ganze Ranking, nicht nur die Spitze.** Der Endpunkt
bewertet ohnehin jede in Frage kommende Person und liefert die Fakten mit —
darunter noch eine alphabetische Namensliste zu stellen hieß, ab Platz vier
die Begründung wegzuwerfen. Und wer nicht den ersten Vorschlag nimmt, ist
genau die Person, die eine Begründung braucht (CLAUDE.md §4).

Drei Abschnitte, und der dritte ist kein Beiwerk:

|                      |                                                  |
| -------------------- | ------------------------------------------------ |
| **Vorschläge**       | die ersten drei, mit allen Fakten                |
| **Restliche**        | Platz 4 aufwärts, dieselbe Zeile in kompakt      |
| **Nicht im Ranking** | wen der Endpunkt gar nicht bewertet — samt Grund |

Am lebenden Datenstand: Host 3 + 6 + 0, Thema 3 + 7 + 0, **Musik 3 + 1 + 6**.
Die Musikzeile ist der Grund für den dritten Abschnitt — nur vier von zehn
spielen ein Instrument, und ohne ihn wären die anderen sechs gar nicht
eintragbar. Beim Host bleibt der Abschnitt leer, und das ist richtig: dort
_ist_ das Ranking die vollständige Menge der gültigen Antworten, alles andere
lehnt der Server ab.

**Die Planungstabelle ist jetzt eine Tabelle**, auch auf dem Telefon. Vorher
war sie dort eine Liste mit Chips, weil drei Spalten auf 390 px nicht lesbar
sind — aber hier plant man **quer**: „wer hostet in den nächsten sechs Wochen"
ist eine Spalte, keine sechs Zeilen. Also bleibt das Raster, scrollt waagerecht
in seinem eigenen Kasten, und zwei Knöpfe verkleinern es in drei Stufen.

Kein Pinch-Zoom: der kollidiert auf Mobilgeräten mit dem Seiten-Zoom des
Browsers und lässt sich davon nicht zuverlässig trennen.

Die Zellen sind nicht nur Anzeige — antippen öffnet dasselbe Sheet wie das
Detail. Die Tabelle ist der Ort, an dem man merkt, dass etwas fehlt, also
gehört das Eintragen auch dorthin. Dafür lädt sie den Termin beim Antippen
nach: `useRoleAssignment` braucht ihn ganz (wegen `topicId`), die
Assignments-Route liefert nur Datum, Rolle und Person.

## PWA und Push

Der Service Worker entsteht aus `src/app/sw.ts` (Serwist) und landet in
`public/sw.js`. Er ist **nur im Produktionsbau** aktiv; in der Entwicklung wäre
er beim Debuggen von API-Aufrufen im Weg.

`@serwist/next` arbeitet mit webpack, Next 16 baut standardmäßig mit Turbopack
und bricht ab, sobald eine webpack-Konfiguration vorliegt. Deshalb hängt
`next.config.mjs` das Plugin nur für Produktion ein, und `pnpm build` läuft mit
`--webpack`. `pnpm dev` bleibt dadurch auf Turbopack.

Die Symbole unter `public/icons/` stammen aus `node scripts/make-icons.mjs` —
einmal laufen lassen und einchecken, zur Bauzeit wird das Skript nicht gebraucht.

Push braucht: HTTPS (oder localhost), das Manifest mit `display: standalone`,
einen registrierten Service Worker — und **auf iOS zusätzlich**, dass die App
über „Zum Home-Bildschirm hinzufügen" installiert wurde. Das Einschalten geht
nur per Klick; die Oberfläche sagt, woran es liegt, wenn es nicht geht.

## Was das Frontend bewusst nicht tut

- **Kein SSR für Daten.** Das Token lebt im Browser; serverseitiges Vorladen
  hieße, es dorthin zu reichen. Next dient als Anwendungsgerüst und Router.
- **Keine Hauskreis-Id in der URL.** In der Praxis gibt es eine Gruppe, und
  Adressen mit UUID darin sind für die, die sie sich schicken, unlesbar.
- **Kein Dunkelmodus.** Die Anmutung des Entwurfs ist durchweg warm und hell;
  eine halbherzige zweite Palette hätte sie nur beschädigt.
