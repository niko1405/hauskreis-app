# Acts2 Frontend

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
| `pnpm start`   | den Bau aus `out/` auf 3001 ausliefern — siehe Warnung unten |
| `pnpm gen:api` | Typen aus `../hauskreis-backend/openapi.json` erzeugen       |
| `pnpm check`   | Lint, Formatprüfung und Typecheck in einem                   |

`pnpm start` ist **nicht** `next start`: Das kann `output: 'export'` nicht
ausliefern und bricht mit einem Hinweis auf `serve` ab. Genau das tut das
Skript, damit „bauen und ansehen" zwei Befehle bleiben und nicht drei.

> **Nach einer Vorschau den Service Worker abmelden.** Er wird nur in
> Produktionsbauten eingehängt, gehört danach aber dem **Origin** und nicht dem
> Server: Wer anschließend `pnpm dev` auf demselben Port startet, bekommt
> weiterhin die zwischengespeicherte App-Hülle des Baus ausgeliefert — samt der
> Adressen, die zur **Bauzeit** in ihm gelandet sind. Das sieht aus, als
> ignoriere der Dev-Server die `.env`, und ist in Wahrheit eine Seite, die gar
> nicht von ihm kommt. In den DevTools: _Application → Service Workers →
> Unregister_, dann _Storage → Clear site data_, danach alle Tabs auf `:3001`
> schließen und neu öffnen.

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

Einige Routen wollen ausdrücklich **keine** Vorbedingung (Anwesenheit, der
Actionstep-Haken, Song-Leiter, Lieder eines Termins,
Benachrichtigungs-Einstellungen, eigene Wohnung und E-Mail). Sie übergeben das
Symbol `UNCONDITIONAL` — es zwingt an jeder Schreibstelle zu einer bewussten
Entscheidung, statt das Feld einfach weglassen zu können.

**Rollen.** `@Roles('admin')` hinterlässt keine Spur in der Spec. Die Liste der
18 Admin-Routen steht deshalb in `lib/auth/roles.ts` — sie steuert nur, welche
Bedienelemente erscheinen; durchgesetzt wird sie weiterhin vom Server.

### Schalter greifen vor

Ein Ja/Nein am Termin ist ein Schalter, kein Formular: er soll umspringen, wenn
man ihn antippt, nicht wenn der Server antwortet — auf einem Handy im Zug dauert
die Runde zum Server mehrere Sekunden, in denen sich der Knopf anfühlt wie
kaputt.

`lib/api/hooks/use-optimistic.ts` ist dafür ein Baustein, kein Rahmenwerk:
`patch` setzt einen Cache-Eintrag vorläufig und merkt sich den vorherigen Stand;
geht der Aufruf schief, dreht `rollback` alles zurück. `useApiMutation` nimmt es
über die Option `optimistic` entgegen.

Vorgreifend sind die vier Tipp-Schalter: Anwesenheit (Termin-Detail und
Terminliste — beide zeigen dieselbe Antwort), der Actionstep-Haken, die
Lied-Auswahl und die Benachrichtigungs-Einstellungen.
**Nicht** vorgreifend sind Anlegen, Löschen und alles mit ETag: ein optimistisch
angelegter Termin ohne Id ist mehr Buchhaltung als Nutzen, und bei
ETag-Schreibvorgängen ist die Serverantwort die Quelle des nächsten ETags.

Zwei Dinge gehören zwingend dazu:

- **Fehler melden sich von selbst.** `useApiMutation` und `useResourceUpdate`
  zeigen bei einem Fehlschlag einen Toast, statt es jeder Aufrufstelle zu
  überlassen — dort vergäße man es, und ein misslungener Tipper bliebe stumm.
  Ein Rückfall ohne Erklärung sähe aus wie ein Geist. `silent: true` ist
  für die Fälle, in denen der Aufrufer etwas Besseres anzuzeigen hat; ein `412`
  bleibt dem `ConflictBanner` vorbehalten.
- **Wer vorgreift, sperrt nicht.** `disabled={…isPending}` an einem vorgreifenden
  Schalter ist genau verkehrt herum: die Anzeige stimmt schon, aber der Knopf
  wäre noch eine Sekunde tot und ein Fehlgriff nicht sofort zurückzunehmen.

### Dein Hauskreis

Ein Mensch gehört zu genau einem Hauskreis; ein Wechsel ist ein Umzug. Damit ist
`hauskreis-context.tsx` fast leer: die Id kommt aus `me.hauskreisId`, und mehr
braucht es nicht — eine im `localStorage` gemerkte Wahl überlebte sonst die
Sitzung und landete im nächsten Konto.

**„Kein Hauskreis" ist kein Fehler, sondern der Anfang.**
`features/onboarding/no-hauskreis-screen.tsx` bietet die zwei Wege an, die es gibt: einen eigenen gründen (man wird dort
Admin) oder sich einladen lassen, mit der eigenen Adresse zum Weitergeben.
Erreicht wird er beim allerersten Öffnen, nach dem Verlassen, und wenn mehrere
Einladungen offen sind.

Im Profil steht `hauskreis-card.tsx`: Name, eigene Rolle, „Hauskreis
verlassen". Das ist nicht „Abmelden" — das eine beendet eine Sitzung, das andere
eine Mitgliedschaft — und steht deshalb darüber, nicht daneben.

Die **Nachfolge-Auswahl** geht erst nach dem ersten Versuch auf. Ob eine nötig
ist, weiß nur der Server (`400`, wenn man die einzige Admin-Person ist); vorab
gefragt stünde meistens eine überflüssige Auswahl im Weg.

Eine **Einladung, die eintrifft, während man schon dabei ist**, erscheint als
Karte im Profil — mit Rückfrage, weil sie die bestehende Mitgliedschaft beendet.
Auf dem Einstiegsbildschirm gibt es die Rückfrage nicht: dort hat man nichts zu
verlieren.

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

### Wenn eine Datei der App nicht ankommt

Next lädt den Code einer Seite erst beim Hingehen. Bricht die Verbindung mitten
drin ab, wirft der Browser einen `ChunkLoadError` — auf einem Handy mit
wackligem Netz der wahrscheinlichste Fehler überhaupt, und nach jedem Deploy
für ein paar Minuten auch in jedem noch offenen Tab.

Ohne `error.tsx` landet das in Next.js' eingebauter Fehlerseite: in der
Entwicklung im Overlay mit Stacktrace, in Produktion auf einer weißen Seite mit
„Application error" — und in der installierten PWA steht daneben kein
Browser-Menü zum Neuladen. Deshalb gibt es zwei Auffangnetze:

| Datei                  | fängt                                                         |
| ---------------------- | ------------------------------------------------------------- |
| `app/(app)/error.tsx`  | Fehler beim Rendern einer Seite; die Navigation bleibt stehen |
| `app/global-error.tsx` | Fehler im Wurzel-Layout selbst — ersetzt das ganze Dokument   |

`global-error.tsx` arbeitet mit **Inline-Styles**: wenn ausgerechnet das
Stylesheet nicht ankam, wäre eine Fehlerseite ohne Aussehen der zweite Fehler.

**`reset()` hilft gegen einen Ladefehler nicht.** Der gescheiterte Chunk bleibt
im Modul-Cache des Browsers als gescheitert stehen, ein erneutes Rendern läuft
in genau denselben Fehler. Nur ein vollständiges Neuladen holt die Datei
wirklich noch einmal — deshalb erkennt `lib/chunk-error.ts` diesen Fall und
lädt selbst neu, mit einer **Sperre von 30 Sekunden** gegen die Neulade-Schleife
bei dauerhaft kaputtem Netz. Greift die Sperre, bleibt die Fehlerseite mit ihrem
Knopf stehen: dann gehört die Entscheidung dem Menschen.

Bei allen anderen Fehlern gibt es beides — „Nochmal versuchen" (`reset()`) und
„Neu laden" — plus die Fehlermeldung im Klartext. Die ist meist englisch, steht
aber trotzdem da, weil sie das Einzige ist, womit man nachfragen kann.

**In Produktion tritt das seltener auf**, weil der Service Worker die Chunks
vorab in den Cache legt und `reloadOnOnline` (in `next.config.mjs`) neu lädt,
sobald die Verbindung zurück ist. In der Entwicklung ist der Worker aus — dort
ist ein `ChunkLoadError` bei schlechter Verbindung normal und mit einem
Neuladen erledigt.

### Wenn die App gar nicht erst anläuft

Beide Netze oben brauchen ein laufendes React. Es gibt aber einen Fall, in dem
es das nie gibt — und der sieht harmlos aus:

„Einen Moment …" kommt vom **Server**. `useSessionRestore` startet auf
`'checking'` und `auth.isLoading` ist anfangs `true`, der Satz steht also schon
im ausgelieferten HTML (nachprüfbar mit `curl http://localhost:3001/`). Bricht
danach ein Chunk ab, hydratisiert React nie. Dann greift nichts: `useSlow` mit
seinen zwölf Sekunden liegt in genau dem JavaScript, das fehlt, und eine
Fehlergrenze hat nichts, worin sie sitzen könnte. Der Bildschirm bleibt für
immer bei „Einen Moment …", ohne Fehler, ohne Ausweg.

Dagegen steht `components/layout/boot-watchdog.tsx`, eingehängt im Root-Layout
**außerhalb** von `Providers`. Alles daran liegt im HTML selbst: ein
Inline-Skript, das nichts nachlädt, und ein versteckter Kasten, der nur sichtbar
gemacht wird. Er geht auf, wenn nach zehn Sekunden niemand `data-hk-ready`
gesetzt hat — oder schon nach 1,5 Sekunden, wenn vorher ein `<script>` oder
`<link>` gescheitert ist (der `error`-Listener in der Capture-Phase ist die
einzige Stelle, an der fehlgeschlagene Dateien überhaupt auftauchen). Die
Gnadenfrist ist da, weil manchmal etwas Entbehrliches fehlt und die App trotzdem
hochkommt; ist sie um und React lebt, bleibt der Kasten zu.

Das Lebenszeichen setzt ein `useEffect` in `app/providers.tsx` — Effekte laufen
erst nach der Hydratisierung, und genau das ist die Frage.

**Kein automatisches Neuladen.** `chunk-error.ts` darf das, weil dort React
läuft und der Fehler einen Namen hat. Hier weiß niemand, ob ein zweiter Versuch
besser ausgeht.

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

**„Heute" ist der Tag der Gruppe, nicht der des Geräts.** `today()` und
`hasStarted()` rechnen über `groupNow()` in der Zeitzone aus der
Termin-Konfiguration — derselben, in der der Server rechnet, nicht in der
Gerätezone: Wer aus dem Urlaub hereinschaut, sähe sonst einen Abend als
begonnen, den der Server noch nicht freigegeben hat.

Die Zone steht als **Modulvariable** in `lib/date.ts` (`setGroupZone`), nicht in
einem Kontext: `today()` und `isPast(day)` werden an über zwanzig Stellen mitten
im Rendern aufgerufen, und ein Hook daraus zu machen hieße, jede davon
anzufassen. Dasselbe Muster wie `handleUnauthorized` in `api/client.ts`.

Gesetzt wird sie in `AuthGate`, zusammen mit `useMe` und dem Hauskreis — und die
App wartet darauf. Eine Sekunde Warten ist besser als eine Terminliste, die
gleich danach umspringt.

`parseDay`/`toDay` bleiben absichtlich gerätelokal: `addDays`, `daysBetween` und
`startOfWeek` sind symmetrisch und rechnen dadurch in jeder Zone richtig.

**Ein Termin hat drei Zustände, nicht zwei** (`meetingPhase` in
`lib/meeting.ts`): `upcoming`, `running`, `past`. „Vorbei" wurde überall aus
`isPast(meeting.date)` gelesen — also aus dem **ersten** Tag —, und das war an
zwei Enden falsch: Eine Freizeit von Freitag bis Sonntag stand ab Samstag als
„Vorbei" da, obwohl sie lief, und ein ganz normaler Dienstag sah um 20 Uhr aus
wie um 8 Uhr morgens. Die Grenzen sind dieselben, die der Server zieht: der
**letzte** Tag für „vorbei", die **Treffpunktzeit** für „läuft". Wer nur die
häufigste der drei Fragen hat, nimmt `isMeetingPast(meeting)` — dafür braucht ein
Termin `date`, `endDate` und `startTime`.

### Leere Felder

Ein Termin ohne Host ist ein Treffen im Schlosspark. Ein Thema ohne Titel ist
eines, für das noch niemand einen festgelegt hat. Ein Lobpreisabend hat gar kein
Thema. Solche Zustände bekommen ihren eigenen Text — nicht `—` und nicht die
Fehlerdarstellung.

## Vier Farben, die etwas bedeuten — und keine für Rollen

In `globals.css`, hell und dunkel:

| Token     | heißt                  | steht an                                                 |
| --------- | ---------------------- | -------------------------------------------------------- |
| `success` | fertig, gewählt, läuft | „Läuft", Erfolgs-Toast, Actionstep-Haken, gewähltes Lied |
| `warn`    | Hinweis                | Fehlerkarte, Hinweis-Kästen, KI-Vorschlag                |
| `info`    | Nebenbemerkung         | Info-Kästen im Zuteilungs-Sheet                          |
| `alert`   | Konflikt und Gefahr    | „Abgesagt", Löschen-Knöpfe, Versionskonflikt             |

Dazu **terracotta** für die _Auswahl_ (aktiver Tab, gewählter Chip, erster Platz
einer Rangliste) und die sieben Avatar-Paletten für Personen.

**Rollen haben keine eigene Farbe.** Auf einer Terminkarte stehen bis zu drei
nebeneinander, auf „Heute" bis zu fünf — trüge jede eine eigene Farbe,
bedeutete am Ende keine mehr etwas. `RoleChip` hat deshalb genau zwei Zustände:
besetzt (neutral) und leer (gestrichelt, terracotta — die Einladung, jemanden
zu wählen).

Die Bedeutungsfarben heißen nach dem, was sie sagen (`success`, `warn`), nicht
nach einer Rolle — ein Token, das nach einer Rolle heißt, die keine Farbe hat,
zeigte auf nichts, und der Nächste vermutete darin wieder eine Rollenfarbe.

## Eine Klasse, die den Rechner rettet

`app-shell.tsx`: Die Inhaltsspalte ist ab `md` ein Flex-Kind einer Zeile
(Seitenleiste plus Inhalt) und trägt `flex-1` — aber ohne `min-w-0` verbietet
`min-width: auto` ihr, unter ihre Inhaltsbreite zu schrumpfen. Eine einzige
breite Zeile — eine Pillenreihe, eine Tabelle, ein langes Wort — drückte damit
die **ganze** Spalte auf, und die Karten liefen darüber hinaus; das
`overflow-x-clip` an `<main>` schneidet danach nur noch ab, was längst zu breit
war. **`clip` und nicht `hidden`:** `overflow-x: hidden` macht aus `overflow-y`
ein `auto`, und damit wird `main` ein Scroll-Container, der selbst nie scrollt —
jedes `sticky` darin klebte an ihm statt am Fenster, also gar nicht. Aufgefallen
ist das am Suchmodus im Archiv, dessen Feld wegscrollte. Dieselbe Klasse steht aus demselben Grund in `CONTROL` (`ui/field.tsx`):
Die Mindestbreite eines Eingabefelds ist seine eingebaute Feldbreite, und
`w-full` allein kommt dagegen nicht an.

## Die Kopfleiste über den Tabs

`components/layout/smart-header.tsx`. Sie gibt es, weil die Leiste **unten** mit
fünf Zielen voll ist: Der Gruppen-Bildschirm musste irgendwo hin, und ein
sechster Tab machte sie eng. Ein starrer Balken oben wäre aber das Ende der
Kopfbilder, die auf drei Bildschirmen die halbe Gestaltung tragen — also eine
Leiste, die sich zum Scrollen verhält.

**Abschaltbar** (Profil → Darstellung). Die Wahl liegt im Gerät
(`lib/header-preference.ts`, gebaut wie `lib/theme.ts`) und hängt an genau einer
Zeile in `useHasSmartHeader` — von dort fällt alles andere ab: `SmartHeader`
rendert nichts, `PageHeader` nimmt wieder `pt-safe-6` statt `pt-header-6`, und
die Nachrichten-Box verschwindet mit der Glocke, die sie öffnet. Der Weg zur
Gruppe steht dann als Knopf im Profil. `useInboxDeeplink` bleibt trotzdem in der
Hülle: Der Haken „angetippt heißt gelesen" muss auch dann greifen, wenn es keine
Box gibt, in der die Zeile stünde.

**Zwei Zustände** (`use-header-scroll.ts` beantwortet beide getrennt, und das
ist kein Zufall — beim Zurückwischen mitten in der Seite ist sie da und trotzdem
nicht oben):

|        | ganz oben (`atTop`)                      | gescrollt                               |
| ------ | ---------------------------------------- | --------------------------------------- |
| Fläche | `.header-veil` — zwei Lagen, siehe unten | Terracotta-Verlauf, `/95` + `blur`      |
| Links  | **nichts** — das Foto trägt sich selbst  | Bild + Name, weiß auf dem Balken        |
| Knöpfe | Glas: `bg-black/25…30` + `backdrop-blur` | Glocke `bg-white/15`, `Gruppe` Leinwand |

**Über dem Foto steht nur, was man drückt.** Vier Dinge über einem Bild, das
selbst schon sagt, wo man ist, wären zu viel. Bild und Name blenden mit dem
Balken ein, und dort tragen sie auch etwas bei: Er hat kein Foto
unter sich, das ihn einer Seite zuordnet. Ausgeblendet (`opacity-0` +
`pointer-events-none`) und **nicht entfernt** — der Block trägt `flex-1` und hält
die beiden Knöpfe rechts; nähme man ihn heraus, sprängen sie beim Umschalten.
Einen `text-shadow` braucht der Name nicht: Er steht nur da, wo eine Kante ist.

**Der Schleier hat zwei Lagen, und die Reihenfolge ist die Aussage.**
`.header-veil` in `globals.css` stapelt zwei `linear-gradient`:

1. **Schwarz obenauf.** Er trägt die Lesbarkeit von Name und Knöpfen — und er
   ist die Fläche, die dem `StatusBarScrim` begegnet. Der liegt im Wurzel-Layout
   auf **derselben** z-Ebene darüber und ist ebenfalls schwarz. Zwei schwarze
   Verläufe werden zusammen dunkler, eine schwarze über einer farbigen Fläche
   wird schmutzig; als die Leiste flächig in Terracotta lag, stand oben ein
   trüber Braunton.
2. **Terracotta darunter**, gut ein Fünftel Deckkraft, auf halber Höhe
   verschwunden. Er **färbt** das Foto, statt es zuzudecken.

Rein schwarz sähe es aus, als gehörten Bild, Name und Knöpfe zur Seite statt zu
einer Leiste — die Farbe ist das, was sie zusammenhält. Als eigene CSS-Regel und nicht als Utilities: Zwei Verläufe
übereinander kennt `bg-gradient-to-b` nicht, und `color-mix` auf
`--color-header-bar-deep` nimmt den Dunkelmodus von selbst mit.

**Links steht kein Knopf, ganz rechts die Glocke.** Bild und Name sind
Identität, ohne eigene Pille — die wäre eine zweite Fläche über dem Foto;
daneben der hervorgehobene `Gruppe`-Knopf. Die äußerste Ecke gehört der Glocke: Sie ist die
wiederkehrende Aktion, auf allen fünf Bildschirmen dieselbe, und der Platz, den
der Daumen ohne Hinsehen findet. Zur Gruppe geht man einmal.

Drei Dinge daran sind es wert, aufgeschrieben zu werden:

- **`sticky`, nicht `fixed`.** Ab `md` ist die App eine zentrierte Spalte mit
  Seitenleiste; `fixed` müsste diese Geometrie ein zweites Mal nachbauen. Die
  Höhe im Fluss nimmt ihr eine negative Untermarge (`.header-inset` in
  `globals.css`), sodass das Kopfbild nahtlos darunter durchläuft.
- **Die Nachrichten-Blase steht _neben_ der Leiste, nicht darin.** Ein
  `transform` macht ein Element zum Bezugsrahmen für jedes `position: fixed`
  darin — dieselbe Eigenschaft, wegen der `pull-to-refresh.tsx` den Inhalt nie
  verschiebt. Sonst säße sie in einem 56 Pixel hohen Kasten statt unter der
  Glocke.
- **Weg ohne Übergang, zurück mit.** `DIRECTION_THRESHOLD` (6 px) versteckt
  sie, **bevor** `TOP_THRESHOLD` (8 px) das Aussehen umschaltet — sonst gäbe es
  ein Fenster, in dem sie sichtbar _und_ schon im Balken-Zustand ist. Die
  Reihenfolge der beiden Konstanten ist die Regel. Dazu fällt die Transform-Transition beim
  Verstecken weg, damit man das Hinausschieben gar nicht erst sieht.

`PageHeader` fragt selbst, ob er darunter steht (`useHasSmartHeader`), und
wählt `pt-header-6` statt `pt-safe-6`. Über eine Prop ginge es auch — dann
müssten Termine und Archiv es sich merken und Verwaltung, Hilfe und „Was ist
neu" das Gegenteil.

**Ein Bildschirm kann sie wegschicken** (`header-suppress.ts`), und das ist
die eine Ausnahme von „weg ohne Übergang": Der Suchmodus im Archiv
(`archive-screen.tsx`) bittet sie zu gehen, und dort fährt sie sichtbar hinaus.
Beim Scrollen sähe man dabei den Balken, den man nicht sehen soll — beim Tipp
ins Suchfeld scrollt niemand, man sieht den Schleier gehen, und das ist die
Antwort auf den Tipp. Gebaut wie `overlay-lock.ts`: ein Zähler, eine Rücknahme
im Aufräumteil des Effekts. Damit kommt sie auch dann zurück, wenn man mitten in
der Suche den Tab wechselt.

## Der Kopfbereich mit Bild

`components/layout/screen-header.tsx` trägt vier Bildschirme: Heute, Gebet,
Archiv, Profil. **Termine bewusst nicht** — dort liest man eine Liste über
Wochen und sucht eine Zeile, ein Foto darüber wäre nur Weg bis zur ersten. Für
Termine und die Verwaltung bleibt der schlichte `PageHeader` aus `app-shell.tsx`.

Drei Schichten, von unten nach oben:

1. **Das Bild**, als `background` und nicht als `<img>`: es hat keinen Inhalt,
   den jemand vorgelesen bekommen müsste. Ohne eigenes Bild steht ein Verlauf
   da — je Bildschirm ein anderer, damit man beim Umschalten sieht, wo man ist.
   Ein Verlauf und kein Stockfoto: ehrlicher, und er zeigt dasselbe Layout.
2. **Der Schleier**, `from-canvas via-canvas/85 to-canvas/25` nach oben. Er ist
   der Grund, warum die Überschrift auf **jedem** Foto lesbar bleibt — auch auf
   einem dunklen, auch auf einem unruhigen — und warum der Übergang in die
   Leinwand keine Kante hat.
3. **Titel und Untertitel**, Wort für Wort wie in `PageHeader`.

Das `-mt-2` am `<header>` frisst das `pt-2`, das `AppShell` seinem `<main>`
gibt: sonst bliebe über dem Bild ein Streifen Leinwand stehen.

Das Bild gilt für die **ganze Gruppe**, und jede:r darf es tauschen. Der Knopf
**unten rechts** öffnet `header-image-sheet.tsx` — ein Sheet und nicht direkt der
Dateidialog, weil es zwei Sachen sind: auswählen und wieder wegnehmen. Dass es
für alle gilt, steht als Untertitel dabei.

Nicht oben rechts: Dort liegt die Glocke der Kopfleiste, und zwei runde Knöpfe
übereinander wären eine Verwechslung mit Ansage.

Geladen wird wie ein Profilbild (`useHeaderImage`): eine Liste der Zeitstempel,
und der Zeitstempel wandert in den Schlüssel der Datei-Abfrage. Ein neues Bild
ist damit ein neuer Schlüssel, und der alte Eintrag verfällt von selbst.

## Der Gruppen-Bildschirm

`/hauskreis` — Bild, Beschreibung, Ideen, Mitglieder. Erreichbar über die Pille
in der Kopfleiste, **kein Tab**: Deshalb trägt er einen Zurück-Pfeil wie die
Detailseiten und keine zweite Navigationsleiste darüber.

Die Gruppe hat einen eigenen Ort und gehört nicht ins Profil, das von _dir_
handelt. `members-card.tsx` liegt deshalb in `features/group/`; `HauskreisCard`
bleibt im Profil, denn sie ist der Austritt aus einer
**Mitgliedschaft** und nicht die Gruppe selbst.

**Ändern darf jede:r** — Bild, Name, Beschreibung —, wie beim Kopfbild: Bei
neun Leuten ist die Selbstbeschreibung keine Verwaltungsangelegenheit.

**Ein Knopf für Name und Beschreibung, oben rechts.** Es sind zwei Felder
derselben Sache: wer ihr seid. Also ein Knopf, ein Sheet
(`GroupEditSheet`) und **ein** `update.mutate({ name, description })`; zwei
getrennte Schreiber auf dieselbe Zeile wären zwei Gelegenheiten für einen
Versionskonflikt. Er steht neben dem Zurück-Pfeil, wo auf den anderen
Unterseiten das Bearbeiten steht, und `Identity` zeigt nur an.

Leerer Name heißt „unverändert" — einen Hauskreis ohne Namen gibt es nicht;
leere Beschreibung heißt `null`, denn dort ist Leeren eine Aussage. Der
`key={hauskreis.version}` am Sheet wirft den Entwurf weg, sobald von außen eine
neue Fassung kommt: Sonst stünde nach dem Speichern der eigene Text noch im
Zustand und beim nächsten Öffnen wieder da.

Die Ideen sind eine Liste mit Haken und nichts weiter: kein Zustimmen, keine
Kommentare. Ein Kommentarfaden wäre ein zweiter Chat neben WhatsApp, und gegen
den ist diese App gebaut. Anlegen, abhaken und **ändern** darf jede:r — wer beim
Grillen dabei war, darf sagen, dass es stattgefunden hat; **löschen** nur der
Urheber oder ein Admin. Die Regel steht im Frontend ein zweites Mal, weil der
Papierkorb sonst dastünde und mit `403` antwortete.

**Stift und Papierkorb liegen hinter einem Wisch nach links**
(`SwipeActions`, siehe unten), genau wie an den Treffpunkten: Dauerhafte Ziele
am Rand einer Liste, durch die man scrollt, träfe der Daumen zuverlässiger als
den Text. Anlegen und Ändern teilen sich `IdeaForm` — zwei Formulare wären zwei
Meinungen darüber, was eine Idee ausmacht.

Der Zuschnitt des Gruppenbilds benutzt `AVATAR_CROP` — rund, quadratisch, 512.
Eine eigene Konstante daneben wäre dieselbe Zahlenreihe mit einem zweiten Namen.

Eine Besonderheit in der Datenschicht: `useUpdateIdea` baut die Vorbedingung mit
`etagOfVersion` aus dem Listeneintrag, statt sie wie sonst über
`useResourceUpdate` aus dem Cache zu lesen. Ideen haben keinen Detail-Endpunkt,
und acht davon einzeln zu laden, nur um acht Haken setzen zu können, wäre die
falsche Antwort darauf. Der ETag ist bei dieser App ohnehin kein Hash, sondern
die Fassungsnummer.

### Das Bild groß, überall wo es frei ist

`components/ui/avatar.tsx` kennt eine Prop `zoomable`, **voreingestellt an**.
Antippen öffnet ein `Sheet` mit demselben Bild in voller Breite — es liegt
ohnehin schon da (`usePersonPhoto`, Data-URL, `staleTime: Infinity`), und der
Server kennt gar keine zweite Größe: eine Datei, 512×512, WebP.

Ein Bild, das sich hier öffnen lässt und dort nicht, liest sich als Fehler.
Deshalb überall, und `zoomable={false}` nur, **wo die Fläche schon eine
Aktion hat**: Terminkarte und Geburtstagskarte (Links), die Buddy-Karte auf
„Heute", die Zellen der Planung, das eigene Bild im Profil (öffnet die
Dateiauswahl) und die Auswahllisten in den Sheets. Dort wäre der Avatar ein
Knopf im Knopf, und der Tipp gehört der Aktion. `AvatarStack` reicht die Prop
durch.

Drei Dinge sind daran Absicht:

- **Ohne Bild ist der Avatar kein Knopf** — ein Fenster, das zwei Buchstaben
  vergrößert, zeigt nichts, was die Zeile nicht schon zeigt.
- **Das Sheet hängt an `document.body`** (`createPortal`). `Sheet` rendert
  sonst ohne Portal, und ein Avatar in einem Vorfahren mit `transform` — eine
  gedrückte Karte, eine wischbare Zeile — machte diesen zum Bezugsrahmen für
  `position: fixed`. Erzeugt wird es erst beim ersten Öffnen: vorher braucht
  es niemand, und auf dem Server gibt es kein `document`.
- Groß steht es **quadratisch** da (`rounded-card`), nicht rund. Gespeichert ist
  ein quadratischer Zuschnitt (`AVATAR_CROP`); in klein ist die runde Form
  Schmuck, in groß wäre sie ein zweiter Beschnitt.

## Der Startbildschirm

Ein Aufruf (`…/home`), vier Blöcke. Drei Entscheidungen darin sind es wert,
aufgeschrieben zu werden.

**Der obere Platz sagt, wo man herkommt, der untere, was kommt.** Läuft ein
Abend, steht er oben als „Aktueller Termin", grün getönt; läuft keiner, steht
dort der **letzte vergangene** als „Letzter Termin", gedämpft und ohne eigene
Farbe. Darunter immer „Nächster Termin" — „Nächstes Treffen: heute" wäre keine
Auskunft, wenn man schon dort sitzt.

Der letzte Abend kam dazu, weil am Mittwochmorgen genau er die interessantere
Karte ist: Seine Nachbereitung fehlt noch, seine Zusammenfassung will man
nachlesen — und oben stand stattdessen der Dienstag in einer Woche.

**Welches der beiden Felder gefüllt ist, entscheidet der Server**
(`currentMeeting` / `lastMeeting`, nie beide). Ob ein Abend läuft, hängt an
seiner Treffpunktzeit in der Zone der Gruppe (`eveningReached`), und diese Frage
im Frontend ein zweites Mal zu beantworten wäre eine Antwort zu viel. Ein
abgesagter Abend zählt dabei nicht — den liest niemand nach.

Alle drei kommen aus derselben Antwort und derselben Komponente; die Tönung ist
der einzige Unterschied. `formatRelativeDay` sagt bei vergangenen Tagen von
selbst „gestern" oder „vor 3 Tagen".

Der letzte Abend liegt auf `bg-canvas` und ohne Schatten — flach, also genau
eine Stufe ruhiger, und in beiden Themen gleich. `bg-shell` wäre falsch: Das ist
der Grund eine Ebene _unter_ der Leinwand und im Dunkelmodus fast schwarz
(`#14100d` gegen `#26201b` der Karte); dort sah der Abend nicht gedämpft aus,
sondern wie ein Loch in der Seite. Eine Farbe, die nur im Hellen „leiser"
bedeutet, ist keine.

„Deine Rollen" richtet sich nach **demselben** Abend (`currentMeeting?.id ??
nextMeeting?.id`): Sonst fiele die eigene Rolle an dem Abend, an dem man sitzt,
aus dem Register „Nächstes" heraus und stünde unter „Zukünftige". Und der
optimistische Patch von `useSetAttendance` fasst beide Karten an — wer während
des Abends antwortet, tut es auf der oberen.

**Die Begrüßung wechselt** — einen Satz, den man jeden Tag liest, liest man
irgendwann nicht mehr. `features/home/greeting.ts` wählt aus **fünf Grüßen,
ohne Mundart**: „Hallo" und „Servus" passen immer, „Guten Morgen" (bis 10:30),
„Mahlzeit" (11:30–14:00) und „Guten Abend" (ab 17:00) nur zu ihrer Tageszeit.

Welcher es ist, kommt aus `hash(tag + personId)`, nicht aus `Math.random`: er
soll pro Tag feststehen und nicht bei jeder Query-Aktualisierung unter dem
Daumen wegspringen. Die Personen-Id geht mit ein, damit nicht alle neun am
selben Tag denselben Satz lesen. Tag und Uhrzeit kommen aus `groupNow()` —
dieselbe Uhr wie überall.

**„Deine Rollen" sind zwei Register, nicht acht Wochen am Stück**
(`features/home/my-roles.tsx`).

|                      |                                                                                   |
| -------------------- | --------------------------------------------------------------------------------- |
| **„Nächstes"**       | alle eigenen Rollen am nächsten Abend — die Vorgabe                               |
| **„Zukünftige (n)"** | je Kategorie (Host, Thema, Musik, Testimony, Geschenk) nur die **nächste** danach |

Kein „Weitere (n)"-Balken am Fuß der Karte: Der stellte die beiden Hälften
untereinander, als wäre die zweite ein Anhang der ersten — es sind aber zwei
gleichrangige Fragen: „Was ist am Dienstag?" und
„Was kommt danach?". Als Register stehen sie nebeneinander, und die Zahl
daneben beantwortet die zweite schon halb, ohne dass man umschaltet.

Der Bezugspunkt des ersten Registers ist der **Termin**, nicht die
Kalenderwoche. Der Hauskreis ist dienstags: ab Mittwoch wäre eine Kalenderwoche
fast immer leer, und ausgerechnet der Abend, um den es geht, stünde hinten.
Gefiltert wird deshalb über `nextMeeting.id` aus derselben Antwort — der Server
entscheidet einmal, welcher Abend der nächste ist, und beide Abschnitte des
Bildschirms folgen ihm.

Im zweiten Register steht bewusst nur die nächste je Kategorie. Wer dreimal in
acht Wochen hostet, muss das hier nicht dreimal lesen — die zweite und dritte
Zeile ändern nichts an dem, was man heute tun kann. Der vollständige Vorlauf
steht in der Planungstabelle.

Jedes Register hat **seinen eigenen** Leerzustand, gestrichelt wie der leere
Actionstep. Drei, nicht zwei: „Du hast frei!" wäre ohne geplanten Termin eine
Aussage über einen Abend, den es gar nicht gibt — dort steht stattdessen „Kein
Termin geplant".

Die Zeile nennt erst die Rolle, dann den Zusatz: „**Host** · Bei Chris" — „Bei
Chris" allein verriete nicht, dass _du_ derjenige bist, der aufschließt.

**Gebetsbuddys tauchen unter „Deine Rollen" nicht auf.** Sie haben ihren eigenen
Abschnitt weiter oben und ihren eigenen Bildschirm, und mit jemandem zu beten
ist keine Aufgabe, die man abarbeitet. Weggelassen werden sie schon vom Server,
nicht erst hier — siehe `myRoles` im Backend-README.

**Und sie haben Gesichter** (`features/home/prayer-buddy-card.tsx`). Zu dritt
sind es zwei Karten nebeneinander, denn es sind zwei verschiedene Dinge: Für
wen du betest, ist ein Auftrag; wer für dich betet, ein Zuspruch.
Untereinander in einer Karte lasen sie sich als Aufzählung, obwohl sie keine
sind. Zu zweit bleibt es eine Karte — „füreinander", und eine Richtung
auszuschreiben, die auf sich selbst zeigt, wäre eine Unterscheidung ohne
Unterschied.

Das Bild kostet keine Zusatzabfrage: `personRefSchema` liefert `photoUpdatedAt`
überall dort mit, wo jemand benannt wird, genau dafür. Gerechnet wird mit
`circleOf` — dieselbe Funktion wie auf dem Gebets-Bildschirm, weil zwei Kopien
derselben Rechnung irgendwann zwei verschiedene Dinge sagen.

**Der Actionstep hat einen Haken — pro Person.** Ein Häkchen am Termin hätte
geheißen „einer hakt ab, für alle"; den Vorsatz nimmt sich aber jede:r selbst.
Daneben steht, wie es der Gruppe damit geht („5 von 9 haben's geschafft"), bei
null Abgehakten aber keine Statistik, sondern „Noch niemand hat abgehakt" —
„0 von 9" liest sich wie ein Vorwurf an alle, dabei hat die Woche vielleicht
gerade erst angefangen.

Die Karte verschwindet beim Abhaken **nicht**: sonst ließe sich der Haken nicht
zurücknehmen. Still wird nur die Erinnerung — der Reminder überspringt, wer
abgehakt hat.

Und sie verschwindet auch nicht, wenn es gar keinen gibt; dann steht dort in
Grau „Für diese Woche ist keiner geplant." Ein Platz, der mal da ist und mal
nicht, verschiebt jedes Mal alles darunter — und die Frage „habe ich diese Woche
etwas vergessen?" bleibt unbeantwortet, statt ein Nein zu bekommen.

Derselbe Haken steht auf der **Themenseite** unter dem Actionstep jeder
gehaltenen Einheit ([`ActionstepCheck`](src/components/domain/actionstep-check.tsx)).
Er hängt am Termin (`meeting_actionstep_done`), der Text an der Einheit — wer
den Text liest, will ihn dort auch abhaken können, statt erst den Abend zu
suchen. Eine Komponente für beide Stellen, damit „5 von 9" nicht zweimal
verschieden gezählt wird.

**„Nächstes Treffen" nennt alle drei Rollen** in denselben `RoleChip`s wie die
Terminkarte. Sonst hieße „noch kein Host" auf zwei Bildschirmen zweierlei. Die
Chips verlinken aufs Detail, weil dort das „+ Musik eintragen" auch einlösbar
ist — und der Link ist auch der Weg zum Zusagen. Die Karte selbst fragt nicht
danach: Der Startbildschirm ist die Übersicht
(„was steht an"), nicht die Entscheidung.

## Die Termin-Detailseite

Zwei Regeln prägen den Aufbau, beide inhaltlich und nicht kosmetisch.

**Ganz oben steht die Uhrzeit.** Die erste Frage an einen Termin ist „wann":
Jeder Abend trägt eine (`meeting.startTime`, `"19:30"`), und sie steht als
Kästchen neben dem Datum direkt unter dem Titel. Geändert wird sie zusammen mit
Titel, Infos und Bausteinen in
[`MeetingEditSheet`](src/features/meetings/detail/meeting-edit-sheet.tsx).

Das Formular hat einen eigenen Zustand und einen Speichern-Knopf, statt bei
jedem Tastendruck zu schreiben: `<input type="time">` liefert zwischendurch
leere und halbe Werte, und jeder davon wäre ein `PATCH` samt Benachrichtigung an
die Gruppe. Leeren lässt sich das Feld nicht — ein Abend ohne Uhrzeit ist kein
Zustand, den es geben soll. Und geschickt wird **nur, was sich geändert hat**:
An der Uhrzeit des nächsten Termins hängt die Nachricht an alle, und wer den
Titel korrigiert, löste sie sonst mit aus.

Die Zeit steht außerdem auf den Terminkarten — das Datums-Kästchen trägt den
Tag, die Zeile darunter ist frei dafür. Im Kalender und in der
Planungstabelle steht sie weiter nicht: dort ist die Zeile drei Zeilen hoch bzw.
eine Zelle breit, und bei wöchentlich gleicher Zeit stünde dieselbe Zahl
fünfzehnmal untereinander. Die Vorgabe für neue Abende kommt aus `…/meetings/config` und
lässt sich in der Verwaltung zusammen mit dem Wochentag umstellen; das
Anlege-Formular belegt sein Feld damit vor, damit niemand jede Woche dasselbe
tippt.

**Die Gebetsanliegen sind Sprechblasen.** Was dort steht, ist ein Satz, den
jemand der Gruppe sagt; als Kasten mit Rahmen sah er aus wie ein Datenfeld. Der
Zipfel ist ein gedrehtes Quadrat in derselben Fläche und Randfarbe — kein SVG
und keine zweite Farbe, die beim Umschalten auf Dunkel nachgezogen werden
müsste. Das **eigene** Anliegen bleibt sichtbar davon unterschieden: Es ist das
einzige, das man bearbeitet. Die Blase steht in `components/ui/speech-bubble.tsx`
(`surface: 'shell' | 'card'` — in einer Karte oder direkt auf der Seite);
`PersonBubble` in `components/domain/` setzt Gesicht, Name und Satz hinein und
zeigt am Thema und an der Einheit, wer daran arbeitet.

**In der Thema-Karte stehen zwei Aussagen an zwei Plätzen**: links, wo man zu
lesen anfängt, das Überthema mit seinem Link; rechts das wievielte Stück davon
dieser Abend ist („Einheit 2/4"). Eine Hülle hat links nichts stehen und rechts „Einzelne
Einheit". Der **Actionstep** steht außerhalb des Links auf die Einheit, damit
der Haken „Für mich abhaken" in denselben Kasten passt — in einem Link darf kein
Knopf sitzen.

**Ort und Zuständigkeiten sind zwei Sektionen**: „wo treffen wir uns" gegen
„wer macht was". „Ort & Anreise" zeigt die **Adresse** (`location.address`);
ohne Ort steht dort **kein** Maps-Knopf statt eines ausgegrauten.

„Zuständigkeiten" trägt im `action`-Slot der `SectionTitle` einen Zähler
(„2 von 4 besetzt") und je Rolle eine eigene abgerundete Fläche statt einer
Zeile hinter `divide-y`.

**Eine Rollenzeile ist zwei Zeilen.** Alles nebeneinander ließe auf dem
Telefon für die Namen rund 130 Pixel — schon der zweite rutschte darunter. Dabei
sind gerade die Rollen mit mehreren die häufigen: Musik, Thema, Snacks. Oben
stehen Symbol, Name und der Knopf, darunter über die volle Breite die Menschen,
eingerückt auf die Höhe der Bezeichnung.

**Welche Rollen ein Abend hat, steht einmal**: `meetingRoles` in
`lib/meeting.ts`. Die Aufstellung stand dreimal da — als Kette von `&&` in
`planningComplete`, als Liste von Zellen in der Planungstabelle und als Folge
von `{slot && <RoleRow …>}` hier. Drei Antworten auf dieselbe Frage laufen
irgendwann auseinander, und dann stünde über einer Liste mit vier Zeilen „3 von
5 besetzt". Sie unterscheidet **fehlt** von **gibt es hier nicht**: Ein Abend im
Schlosspark hat keine Gastgeber-Rolle, also steht sie dort gar nicht.

**Ort und Gastgeber sind eine Entscheidung** — und haben deshalb **ein**
Bedienelement: [`VenueSheet`](src/components/domain/venue-sheet.tsx), mit zwei
Registern. Die Ort-Zeile auf der Seite ist reine Anzeige.

| Register        | Was drinsteht                                      | Was geschickt wird                                              |
| --------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| **Zuhause**     | der `AssignmentPicker` mit dem Host-Ranking        | `{ hostPersonId }` — den Ort setzt der Server aus ihrer Wohnung |
| **Treffpunkte** | Orte mit `isSelectableWithoutHost`, plus „anlegen" | `{ hostPersonId: null, locationId }` — **beides**, sonst 400    |
| darunter        | „Noch offen"                                       | `{ hostPersonId: null, locationId: null }`                      |

Jede Wahl schickt beide Felder auf einmal, und die Regel ist keine
Fehlermeldung, sondern das Register, in dem man steht. Durchgesetzt wird sie im
Backend (`resolveVenue`).

Ein Zuhause taucht unter „Treffpunkte" nie auf: es kommt über seine
Bewohner:innen an den Termin, nie über eine Liste. „Treffpunkt anlegen" ist ein
**Schritt im selben Sheet**, kein zweites — aus demselben Grund wie beim
Wahl-Sheet. Der Formularrumpf dafür ist als
[`useLocationForm`](src/components/domain/location-form.tsx) herausgelöst, wie
`AssignmentPicker` aus `AssignmentSheet`.

**Ein vergangener Abend ist ein eigener Zustand**, kein ausgegrauter kommender:

|                 |                                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| Ansicht         | zuerst **zum Lesen**; „Bearbeiten" unten öffnet den Modus (siehe unten)       |
| Rolle eintragen | im Modus, und ohne Vorschläge (`withoutSuggestions`)                          |
| Lieder          | unveränderlich — sonst verrutschen `timesPlayed` und `lastPlayedAt` im Archiv |
| Absage          | heißt „als abgesagt markieren" und verschickt nichts                          |

Dazu drei kleinere Umbauten:

- **Der Titel sitzt am Überschriftstext**, nicht in einem Feld weiter unten.
  Der Termin heißt dabei **nach sich selbst** (`meetingHeadline`), nicht nach
  dem Titel seiner Einheit: „Teil 2: Was Petrus tat" ist der Name der Einheit,
  nicht der des Abends. Ohne eigenen Titel steht dort `meetingKindLabel`, der
  Name aus den Bausteinen; wer will, trägt am Termin etwas anderes ein. Das
  Thema bleibt sichtbar, nur nicht als Überschrift: als Rollen-Chip auf der
  Karte, als Themen-Kasten hier, im Archiv unter „Themen". So sagen alle
  Bildschirme dasselbe.
- **Der Info-Text steht oben.** Dort steht, was man _vor_ dem Abend wissen muss.
- **„Wer kommt" beantwortet „mit wie vielen rechne ich?"** — siehe den eigenen
  Abschnitt unten.

### Das Thema: zuteilen, dann wählen

Titel, Zusammenfassung und Actionstep lagen über die ganze Seite verteilt: der
Titel oben in der Überschrift, die Zusammenfassung ganz unten, der Actionstep
darunter, das Thema selbst als Rollen-Zeile dazwischen. Vier Orte für eine
Sache, und keiner sagte, dass sie zusammengehören. `topic-card.tsx` fasst sie
zusammen — und zeigt seither vier Zustände statt zwei:

| Zustand                        | Was dasteht                                            |
| ------------------------------ | ------------------------------------------------------ |
| Baustein aus                   | die Sektion gibt es nicht                              |
| niemand zugeteilt              | „Noch kein Zuständiger — trag oben jemanden ein."      |
| zugeteilt, noch nichts gewählt | wer dran ist: **„Thema wählen"**; alle anderen: nichts |
| gewählt                        | das Thema, darunter dieser Abend                       |

**Der dritte Zustand ist der Punkt**: zugeteilt, aber noch nichts gewählt. Eine
Zuteilung legt kein leeres Thema an; es sind zwei Schritte — `PUT …/topic-responsibles` sagt „du bist
dran", `POST …/topic-session` sagt „und zwar damit".

Den Knopf sieht **nur, wer an dem Abend zugeteilt ist** — auch kein Admin. Die
Wahl ist kein Verwaltungsakt, sondern die Aussage „ich bereite das vor". Steht
schon etwas, heißt er „Anderes Thema wählen" und fragt vorher nach: die bisherige
Einheit löst sich vom Abend und wartet als Entwurf.

**Die Hierarchie ist der Aufbau.** Oben das Thema, als Überschrift und als Link
auf seine Seite; darunter, in einem eigenen Rahmen mit „Einheit 2 von 2", dieser
eine Abend mit Titel, Zusammenfassung und Actionstep. Titel und
Zusammenfassung des **Themas** ändert man nur auf seiner Seite — es steht über
mehreren Abenden und nicht über diesem einen. Darunter lassen sich die anderen
Abende desselben Themas ausklappen; geladen werden sie erst dann, über
`GET …/topics/:id`, wo die Sichtbarkeitsregeln schon stehen.

### Das Wahl-Sheet

`topic-choice-sheet.tsx` sind **vier Schritte in einem Sheet**, nicht vier
Sheets: `Sheet` rendert ohne Portal auf derselben Ebene und registriert je einen
eigenen Escape-Handler, gestapelt schließen sie sich gegenseitig.

1. neues Thema · Angefangenes aufnehmen (nach Thema gebündelt) · ein eigenes
   Thema öffnen
2. dessen Einheiten mit „gehalten" und „offen" — offene lassen sich direkt
   nehmen, darunter geht es zu einer neuen
3. Titel (Pflicht), Actionstep, Zusammenfassung und mit wem zusammen
4. der Personen-Picker aus der Rollenzuteilung

Schritt 4 ist eine **Abkürzung**: was er einträgt, ist die Rolle „Thema" an
diesem Abend, und daraus macht der Server die Mitwirkenden. So gibt es genau
einen Weg, Mitarbeiter:in eines Themas zu werden — und die Regel „wer die Rolle
verliert, verliert das Schreibrecht" bleibt widerspruchsfrei. Dafür ist der
Rumpf von `assignment-sheet.tsx` als `assignment-picker.tsx` herausgelöst; das
Sheet ist seither nur noch die Hülle.

Eine offene Einheit, die an einem **anderen kommenden** Abend hängt, steht
ebenfalls zur Wahl und bringt ihr Datum mit — sie zu nehmen kostet jenen Abend
seine Auswahl, deshalb erst die Frage, dann die Tat.

Der Entwurf aus Schritt 3 liegt **im Sheet**, nicht in `CreateStep`. Die
Schritte lösen einander an derselben Stelle im Baum ab, ein Wechsel ist also ein
Unmount: wer zu den Mitwirkenden abbiegt und zurückkommt, fände sein Formular
sonst leer vor. Ein `key` hilft dagegen nicht, es gibt keine gemeinsame Position, an
der die Felder gemountet bleiben könnten.

### Warum `Sheet` seinen Fokus nur beim Öffnen setzt

Ein Fehler, der wie ein Tastatur-Problem aussah: in „Treffpunkt anlegen" und
„Lied anlegen" sprang der Fokus nach **jedem getippten Buchstaben** aus dem
Feld. Ursache war der Effekt in `sheet.tsx`, der `onClose` in den Abhängigkeiten
hatte **und** `panel.focus()` rief. Die meisten Aufrufer übergeben dort einen
frischen Pfeil — ein `close`, das erst Felder leert und dann schließt, entsteht
bei jedem Render neu —, also lief der Effekt bei jedem Tastendruck erneut.

`onClose` liegt in einer Ref, der Effekt hängt nur an `[open]`. Zwölf
Aufrufstellen mit `useCallback` abzusichern wäre zwölfmal dieselbe Regel, und
die dreizehnte vergäße sie.

**Sichtbarkeit und Bearbeitbarkeit sind zwei Fragen** — und beide beantwortet
der **Server**, nicht das Frontend:

|              | vor Beginn des Abends | danach                 |
| ------------ | --------------------- | ---------------------- |
| Zuständige   | sehen und schreiben   | sehen und schreiben    |
| alle anderen | sehen **nichts**      | sehen, schreiben nicht |

„Beginn des Abends" ist die Uhrzeit **dieses** Termins (`meeting.startTime`),
nicht pauschal 18 Uhr: eine Gruppe, die sich um 20 Uhr trifft, gäbe ihren
Actionstep sonst zwei Stunden vorher frei.

Die Karte liest dafür zwei Felder aus der Antwort: `contentVisible` (sind die
Textfelder gefüllt oder zurückgehalten?) und `mayEdit` (darf ich schreiben?).
Beide vom Server, damit die Regel nicht ein zweites Mal aufgeschrieben wird —
und nicht anders ausgelegt. Ist `contentVisible` falsch, kommen Titel,
Actionstep und Zusammenfassung als `null` an; sie im Frontend auszublenden hieße,
sie trotzdem über die Leitung zu schicken.

Das Verstecken davor ist kein Datenschutz, sondern der Sinn der Sache: ein
Actionstep, den alle eine Woche vorher lesen, ist keiner mehr. Umgekehrt sollen
die Zuständigen vorbereiten dürfen, auch vor dem Termintag.

### Lesen ist der Normalfall — aber nicht über einen Modus

Die **Themenseite** hat unten einen „Bearbeiten"-Schalter; erst danach
erscheinen die Stifte an ihren Texten. Die **Termin-Detailseite** hat am
kommenden Abend keinen.

Ein Schalter dort schaltete fünf verschiedene Dinge auf einmal an, und jede
Möglichkeit steckte hinter einem Ort, den man erst kennen müsste; derselbe
Schalter hieße an jeder Stelle etwas anderes, von „dieses Feld ist
beschreibbar" bis „hier darf gelöscht werden". Stattdessen hat jede Sache die
Form, die sie ohnehin hat:

| Was                      | Wo es steht                                                |
| ------------------------ | ---------------------------------------------------------- |
| Titel, Uhrzeit, Infos    | `MeetingEditSheet`, hinter „Bearbeiten" oben rechts        |
| Bausteine                | im Bearbeiten-Sheet, gespeichert mit „Speichern"           |
| eigenes Gebetsanliegen   | Stift und „entfernen" am eigenen Kasten, ohne Vorbedingung |
| Löschen eines Vorschlags | `SwipeActions`, wie an jeder anderen Liste der App         |
| Nachbereitung            | `notesOpen` — ein Merker für „gerade angelegt, noch leer"  |

**Die Rollen-Zuteilung lag schon immer außerhalb.** Ihre Knöpfe stehen immer da.
Sie ist der Grund, aus dem man diese Seite überhaupt aufmacht — „wer hostet
nächste Woche" trägt man im Vorbeigehen ein. Versehentlich passieren kann dabei
nichts: jede Zuteilung geht über ein Sheet, in dem man ausdrücklich bestätigt.
Gesperrt ist sie nur an einem abgesagten Abend, an dem es nichts einzuteilen
gibt.

Es gibt außerhalb des Formulars bewusst **kein „Speichern"**: jede Änderung geht
sofort raus. Ein Sammel-Speichern hieße, einen zweiten Zustand zu führen, der
mit dem Server auseinanderläuft, und den Verlust bei einem versehentlichen
Zurück in Kauf zu nehmen. Das Formular ist die Ausnahme, und zwar eine mit
Grund: Titel, Uhrzeit und Infos sind drei Angaben derselben Sache, und drei
Schreibvorgänge wären drei Gelegenheiten für einen Versionskonflikt.

Anwesenheit und Actionstep-Haken bleiben ebenfalls immer bedienbar — das ist
Teilnahme, keine Bearbeitung. Absagen und Löschen stehen dauerhaft ganz unten:
sie sind keine Bearbeitung, sondern eine Entscheidung über den Abend als Ganzes.

**Am vergangenen Abend gibt es einen Modus** — aus dem Grund, aus dem die
Themenseite ihren hat: Dort ist Bearbeiten der Ausnahmefall.
Man kommt zum Nachlesen her, meistens aus dem Archiv, und Stifte an jeder
Rolle, ein Maps-Knopf und zwölf Liedvorschläge bedienen dort eine Frage, die
sich nicht mehr stellt. Unten steht statt der Tab-Leiste ein Balken
„Bearbeiten"/„Fertig" (`edit-bar.tsx`, über `BottomSlot` wie der
Antwort-Balken). Die Leseansicht (`reading` in der Detailseite) lässt weg:

| Weg in der Leseansicht         | Warum                                                |
| ------------------------------ | ---------------------------------------------------- |
| „Bearbeiten" oben rechts       | erst im Modus; zwei Wege dorthin wären einer zu viel |
| Stifte an den Rollen           | nachgetragen wird im Modus                           |
| Maps                           | „wie komme ich hin" fragt nach dem Abend niemand     |
| Liedvorschläge (`setlistOnly`) | nur, was gesungen wurde; ohne Setlist keine Sektion  |
| Thema-Kasten ohne Einheit      | eine Lücke im Protokoll, keine offene Aufgabe        |
| Absagen und Löschen            | Entscheidungen über den Abend, also Bearbeiten       |

**Auch die Nachbereitung ist nur unter „Bearbeiten" beschreibbar** — eine
Leseansicht, in der genau ein Block Stift und Löschknopf trägt, wäre keine.
Fehlt sie noch, steht oben weiter der Hinweis, und ein Tipp darauf schaltet
gleich in „Bearbeiten" (`addNotes`); dorthin führt auch `NOTES_REMINDER`. Der
eigene Actionstep-Haken bleibt erreichbar. Eine **Rückfrage vor dem
Nachtragen** gibt es nicht: Den Fehlgriff aus dem Archiv fängt der Modus ab,
und zwei Schranken hintereinander wären eine zu viel.

`InlineEdit` hat ein optionales `onSave`: fehlt es, gibt es keinen Stift. Ihn zu
zeigen und dann mit `403` zu antworten wäre eine Einladung ins Leere. Dasselbe
gilt für `RoleRow` und `onEdit` — die Themenseite baut ihren Modus noch immer
darauf.

**Abhaken bleibt für alle**, auch für die, die den Text nicht ändern dürfen —
es ist der eigene Vorsatz.

### Lieder abhaken: vorher Entscheidung, hinterher Protokoll

`readOnly` und `mayPick` sind an der `SongsCard` bewusst getrennt. `readOnly`
gilt dem Vorschlagen und Löschen an einem vergangenen oder abgesagten Abend;
`mayPick` dem Haken:

- **vor dem Abend** nur die Musik-Zuständigen — das Abhaken ist dann eine
  Entscheidung („das singen wir"), und die trifft, wer die Lieder übt;
- **danach** jede:r — dann ist es ein Protokoll, und daran erinnert sich jede:r
  gleich gut;
- **an einem abgesagten Abend** niemand, da gibt es nichts zu protokollieren.

Streng wie beim Wählen eines Themas: kein Admin-Freifahrtschein, und ein Abend
ohne Musik-Zuteilung ist keiner, an dem alle bestimmen dürfen. Wer die Auswahl
treffen will, trägt sich eine Zeile weiter oben ein. Der Server hält dieselbe
Grenze.

**Wer nicht darf, sieht den Haken gar nicht** — ein toter Knopf ist kein
Hinweis, sondern ein Fehler. Ersetzt wird er durch nichts: In welcher Gruppe eine Zeile steht, sagt schon die Überschrift darüber,
und die Setlist ist zusätzlich getönt. Unter der Karte steht statt der
verschlossenen Tür die Erklärung von der Leserseite her — „Das Musik-Team wählt
aus diesen Vorschlägen die finale Setlist".

**Setlist und Vorschläge stehen getrennt**, je mit Überschrift und Zahl — „was
singen wir" und „was wurde vorgeschlagen" sind zwei Fragen, und die erste
ist die, mit der die meisten die Karte aufmachen. Die zweite Gruppe lässt sich
zuklappen, ist aber offen voreingestellt: Ein Vorschlag ist zum Lesen da.

**Die Setlist steht auch dann da, wenn sie leer ist** — sobald es überhaupt
Lieder gibt. Sie erschien zuerst erst mit dem ersten Haken, und damit fehlte die
Frage genau in dem Zustand, in dem sie offen ist: Man sah zwölf Vorschläge und
musste selbst darauf kommen, dass noch nichts gewählt ist. Was an ihrer Stelle
steht, hängt daran, wer liest — für das Musik-Team eine Aufforderung, für alle
anderen eine Auskunft.

**Zwei Karten, zwei Ordnungen.** Die Setlist hat eine **Reihenfolge**, die
das Musik-Team macht (`meeting_song.position`), die Vorschläge haben
**Stimmen**, nach denen sie stehen (`meeting_song_vote`). Beides in einer Karte
sah aus wie eine Liste mit einem Bruch in der Mitte. Die Setlist trägt einen
Rand in Terracotta, weil sie die Auswahl ist, und keinen Schein — der ließe sie
aus dem Rest der App heraustreten statt aus der Seite. Sie heißt „Setlist".

- **Gezogen wird nur am Griff** (`Reorder` aus `motion/react`,
  `dragListener={false}` plus `useDragControls`). Titel und Interpret sind ein
  Link auf die Seite des Lieds, und ein Tipp darauf soll sie öffnen, nicht das
  Verschieben beginnen. Der Griff hört **nativ** auf `pointerdown` und hält
  den Druck an: Die Wisch-Zeile darüber hört ebenfalls nativ zu und finge sonst
  an, waagerecht mitzugehen, während die Zeile nach oben gezogen wird.
- **Gespeichert wird beim Loslassen**, einmal je Zug — die ganze Setlist, damit
  der Server ablehnen kann, wenn inzwischen jemand ein Lied dazugenommen hat.
  Optimistisch, sonst spränge die Zeile bis zur Antwort an den alten Platz.
- **Herausnehmen heißt zurück zu den Vorschlägen**, samt Stimmen: Setlist-Zeile
  nach links wischen, „−" (`SwipeActions`, am Rechner beim Überfahren). Ein
  **Vorschlag** wischt ebenso und gibt den Papierkorb frei, der ihn ohne
  Rückfrage vom Abend nimmt — außer am vergangenen oder abgesagten Abend
  (`readOnly`). Steckt ein Link in der Zeile, schluckt `SwipeActions` den Klick
  nach einem Zug, sonst öffnete ein Maus-Zug die Liedseite.
- **Ein Tipp auf ein Lied führt auf seine Seite** (`/lied?id=…&termin=…`).
  Bearbeiten darf dort jede:r — gemeint ist der kaputte Link, den irgendwer beim
  Üben bemerkt —, und danach lädt die Seite die Liederliste des Termins neu, die
  ihren eigenen Zwischenspeicher hat. Vom Abend nehmen steht dort unten als
  „Entfernen"; wer ein Setlist-Lied herausnehmen darf, fragt sie
  `mayPickSongs` (`lib/meeting.ts`), dieselbe Funktion wie die Terminseite.
- **Ein kleines Notenblatt neben dem Titel** heißt: Du hast eine eigene Version
  (`useOwnSongIds`).
- **Die Stimmen-Pille** ist gefüllt, wenn die eigene Stimme dabei ist. Am
  vergangenen Abend bleibt nur die Zahl, ohne Knopf.

**Das Gewählte ist terracotta.** „Im Set" ist eine **Auswahl**, und Auswahl ist
überall terracotta: der aktive Tab, der gewählte Chip, der erste Platz einer
Rangliste. Grün (`success`) bedeutet dagegen „fertig, gewählt, läuft".

Vergangene Abende sind fürs Abhaken damit wieder bedienbar, obwohl sie sonst
gesperrt bleiben. Das ist Absicht: wer am nächsten Tag nachträgt, was
tatsächlich dran war, tut der Liederdatenbank einen Gefallen.

„Danach" heißt dabei **am nächsten Tag der Gruppe**, nicht ab der
Treffpunktzeit — `isPast(day)`, dieselbe Rechnung wie das „Vorbei"-Abzeichen
daneben. App und Server rechnen beide in der Zone der Gruppe — sonst zeigte die
App um halb eins nachts die Kästchen frei, während der Server mit `403`
antwortet.

### „Wer kommt": mit wie vielen rechne ich?

`detail/attendance-card.tsx`, zwei Teile — die Liste und, zugeklappt, wer fehlt.
Die **eigene** Antwort steht unten am Bildschirm (`detail/answer-bar.tsx`,
eigener Abschnitt weiter unten); hier steht, was die Karte über die anderen
sagt.

**„Weiß noch nicht" zählt in die Planung.** Der Server rechnet für die
Kapazitätsregel mit `groupSize − declined` (`countExpectedAttendance`), und die
Überschrift sagt dasselbe: „Geplant für 8 Personen". Als Gastgeber plant man
lieber mit einem zu viel als mit einem zu wenig.

**Eine Liste statt eines Rasters.** Wer plant, will sie nebeneinander sehen:
oben die Zusagen, darunter die Unentschiedenen. Die **Abgesagten** stehen für
sich in einer zugeklappten Gruppe (dasselbe Muster wie `OtherSessions` im
Themen-Kasten) — sie beantworten eine andere Frage.

**Am vergangenen Abend** heißt die Liste „Wer war da" und zeigt nur die
Zusagen; die zugeklappte Gruppe heißt **„War nicht da"** und enthält Abgesagte
**und** Unsichere (auch wer nie geantwortet hat), jede Zeile mit ihrem eigenen
Status. Das gilt für jeden `readOnly`-Abend, also auch einen abgesagten.

An einem vergangenen oder abgesagten Abend heißt die Überschrift weiter „Wer war
da" und zählt nur die Zusagen: „geplant für" ist keine Aussage über gestern.

**Zu jeder Antwort gehört ein Satz** — genau das, was sonst in WhatsApp stünde.
Eine Spalte für alle drei Status (`meeting_attendance.note`) und nicht drei: Es
ist immer dieselbe Sache, was jemand den anderen zu diesem Abend noch sagen
will. Nur die Beschriftung wechselt:

| Status      | Beschriftung                           | Beispiel                            |
| ----------- | -------------------------------------- | ----------------------------------- |
| `ATTENDING` | Info (optional)                        | „Bringe noch jemanden mit"          |
| `UNKNOWN`   | Woran liegt's? (hilft bei der Planung) | „Muss schauen, wann Feierabend ist" |
| `ABSENT`    | Grund (optional)                       | „Bin im Urlaub, euch viel Spaß!"    |

**Bei einer Zusage ist eine Verspätung keine Info.** Über dem Feld steht ein
Umschalter „Info | Verspätung"; bei „Verspätung" wählt man ca. 15, 30, 45 oder
60 Minuten (`LATE_OPTIONS`), und der Satz darunter bleibt optional. Gespeichert
wird das getrennt (`lateMinutes`), damit die Liste es erkennt statt zu raten:
Eine Verspätung steht dort als eigene Zeile mit Uhr in Terracotta („ca. 30 Min
später") — sie ändert etwas am Abend selbst —, jeder Satz darunter neutral.
Formular und Anzeige stehen einmal: `AttendanceNoteFields` für Balken und
`AnswerNoteSheet`, `ownAnswerLine` für die eigene Zeile in Balken, Karte und
Kalender.

**Der Status schreibt sofort, die Notiz auf Knopfdruck.** Ein Tipp auf „Dabei"
ist überall sonst — Terminkarte, Kalender — augenblicklich
verbindlich; erst nach einem zweiten Knopf zu speichern hieße, man könnte
antippen, weggehen und nichts gesagt haben. Die Notiz braucht den Knopf dagegen,
sonst ginge bei jedem Buchstaben eine Anfrage raus. Er steht immer da und ist
nur untätig, solange nichts zu speichern ist — ihn verschwinden zu lassen ließe
den Balken beim ersten Buchstaben springen.

**Der optimistische Patch kennt die Regel des Servers.** Fehlen Notiz oder
Verspätung im Aufruf, bleiben sie stehen, solange der Status derselbe ist, und
fallen weg, sobald er wechselt — eine Verspätung gehört nicht auf eine Absage. Die Rechnung steht
trotzdem in `useSetAttendance` und nicht im Balken: Sie beschreibt, was der
Server tut, und das ändert sich nicht dadurch, wer gerade fragt.

Die eigene Antwort ist außerdem der einzige Weg, für einen **einzelnen** Abend
abzusagen — Abwesenheiten im Profil decken Zeiträume ab.

**„Weiß noch nicht" gibt die eigenen Rollen dieses Abends frei** — deshalb läuft
der Statuswechsel über `components/domain/use-attendance-answer.ts` und nicht
direkt über `useSetAttendance`. Der Hook fragt vorher nach, und zwar nur, wenn
wirklich etwas dranhängt; die Rollen stehen in jeder Termin-Antwort, es braucht
also keine zweite Abfrage. Die Rückfrage gilt dem **ganzen Schritt**: Abbrechen
lässt Status und Rolle stehen.

Ein `UNKNOWN` entsteht an zwei Stellen: am Termin (`answer-bar.tsx`) und auf der
Terminkarte in der Liste. Beide gehen durch denselben Hook — die Rückfrage ist
eine Regel über die Daten und nicht über einen Bildschirm.

Die **Notiz** geht weiter direkt raus: Sie ändert am Status nichts.

Farben, Beschriftungen, Symbole und Kurzformen stehen in
`components/domain/attendance-answers.ts` — Anwesenheitsliste, Balken und
Terminkarte brauchen sie alle drei, und Kopien wären Meinungen darüber, welche
Farbe „abgesagt" hat. **`label` ist ein Verb, `short` ein Zustand**: `label`
steht auf einem Knopf, den man drückt („Zusagen"), `short` in einer Zeile über
jemand anderen, die etwas feststellt („Dabei"). Die zustimmende Antwort steht
**rechts**, wie in jeder Rückfrage der App.

### Die Terminkarte

`components/domain/meeting-card.tsx`.

**Links ein Datums-Kästchen** — Wochentag, Tag, Monat (`dayParts` in
`lib/date.ts`). Das Datum stand als Kleinschrift-Zeile über dem Titel und war
damit das Unauffälligste an einer Karte, die man genau danach durchsucht. Ein
**Zeitraum** bekommt keins: „14.–16." passt nicht hinein, und eine Freizeit ist
kein Tag; dort steht die Spanne als Zeile. Der Tag steht **zweistellig**: Im
Kästchen stehen die Zahlen untereinander wie in einer Spalte, und eine
einstellige säße dort schmal in der Mitte.

Weil das Kästchen den Tag trägt, steht die **Uhrzeit** auch hier, in der Zeile
darunter. Uhrzeit und Ort trennt
ein **Punkt**, und ihre Symbole sind terracotta: Es sind zwei Antworten auf zwei
Fragen, die sich mit bloßem Abstand als eine läsen, und graue Symbole
verschwämmen mit dem Text, den sie beschriften.

**Kästchen und Zeile stehen in `components/domain/date-box.tsx`**, nicht hier —
die `NextMeetingCard` auf „Heute" braucht sie auch, und zwei Kopien wären zwei
Meinungen darüber, wie ein Termin aussieht. Der einzige Unterschied ist ein Schalter: Auf „Heute" führt
der Ort nach Maps, in der Liste nicht, denn dort ist die ganze Karte schon ein
Link auf den Termin.

**Rollen-Chips sind neutral** (`RoleChip`). Sie trugen je eine eigene Farbe, und
auf einer Karte standen davon drei nebeneinander — weil jede für sich etwas
bedeutete, bedeutete am Ende keine mehr etwas. Unterschieden werden sie durch
Symbol und Name. Der gestrichelte terracotta Rand des **leeren** Chips bleibt:
Er ist die Einladung, jemanden zu wählen, und Auswahl ist überall terracotta.

Braucht der Ort keinen Gastgeber, steht **kein** Host-Chip da. Der Ort selbst
steht schon in der Zeile darüber; als Chip stand er ein zweites Mal und
behauptete eine Rolle, die es an dem Abend nicht gibt — dieselbe Regel wie
`meetingRoles` am Termin.

### Die Antwort in Liste und Kalender

`components/domain/answer-buttons.tsx` plus
`components/domain/answer-note-sheet.tsx`.

Es sind die **drei Antworten mit dem Satz dahinter**: „komme 20 Min später" ist
das, was sonst in WhatsApp stünde. Man liest quer über Wochen — dort fällt einem
ein, dass man am 15. nicht kann.

**Auch im Kalender**: Den macht man auf, um einen Tag zu suchen, aber dabei fällt
einem auf, dass man nicht kann; und zwei Bildschirme,
auf denen dieselbe Zeile einmal fragt und einmal nicht, sind schwerer zu
erklären als einer mehr, der fragt. Dort stehen die Knöpfe **neben** dem Termin
(`compact`) und tragen unter `sm` nur ihr Symbol: Die Kachel ist schon drei
Zeilen hoch, eine vierte hätte den Monat auf zwei Bildschirmhöhen gebracht.

Vier Dinge sind daran zu beachten:

- **Die drei Antworten sind ein Schalter, nicht drei Knöpfe** — es ist _eine_
  Frage, von deren drei Antworten genau eine gilt. Der Rahmen liegt außen herum,
  gefüllt ist nur die gewählte.
- **Die Karte ist ein `<Link>`.** Jeder Knopf darin braucht `preventDefault()`
  **und** `stopPropagation()`, sonst führt der Tipp zusätzlich auf die
  Detailseite — und die Antwort wäre nicht mehr zu sehen. Im Kalender umfasst
  der Link nur die linke Hälfte, aber die Knöpfe halten dieselbe Regel ein: Sie
  wissen nicht, wo sie hängen.
- **Das Sheet gehört dem Aufrufer, nicht den Knöpfen.** `Sheet` rendert sein
  Overlay als `position: fixed` ohne Portal, und die Terminkarte trägt
  `active:scale` — das macht sie zum Bezugsrahmen für `fixed`, und der Schleier
  säße dann in der Karte statt über der Seite. `AnswerButtons` meldet über
  `onAnswered` nur, dass geantwortet wurde; wo das Notizfeld hängt, entscheidet
  die Stelle, die es einbaut.
- **Untereinander, ohne Trennstriche.** Nebeneinander läse sich die Antwort im
  Fenster wie ein weiterer Chip. Und die Karte hat schon einen Rahmen: Was
  Striche sagen sollten, sagen die Formen — Chips sind Pillen mit Namen darin,
  die Antwort ein umrandeter Schalter. Getrennt wird über den Abstand.

Der Ablauf ist derselbe wie im Balken: **Der Status schreibt sofort** (über
`useAttendanceAnswer`, also mit der Rollen-Rückfrage), **die Notiz auf
Knopfdruck**. Bricht jemand die Rückfrage ab, öffnet sich kein Fenster für eine
Notiz, die zu nichts gehört. Nachzurüsten war nichts: `useSetAttendance` patcht
die Listen im Cache schon optimistisch.

Daneben steht auf der Karte oben rechts die **Teilnehmerzahl**, und sie zählt
**dieselbe Menge wie diese Seite**: Zusagen plus Unentschiedene. An einem
vergangenen
oder abgesagten Abend steht dort „3 dabei"; „geplant für" ist keine Aussage
über gestern, und diese Unterscheidung trifft auch der Abschnitt hier.

Gerechnet wird beides in `attendanceCounts` (`lib/meeting.ts`) — **die
Personenliste ist die Grundmenge, die Anwesenheit nur ein Nachschlagewerk**.
Andersherum ginge es nicht: Eine Zeile in `attendances` bekommt nur, wer eine
hat, und eine mit `UNKNOWN` entsteht fast nur beim aktiven Zurücknehmen einer
Zusage. Über `attendances` gezählt wären die Unentschiedenen also meistens null.
`usePeople` liegt mit `STALE.reference` im Cache — eine Abfrage für die ganze
Liste, nicht eine je Karte.

Die **Kalenderzeile** bekommt weder Zahl noch Knöpfe — sie ist schon drei Zeilen
hoch und beantwortet „was ist wann".

### Die eigene Antwort ersetzt die Tab-Leiste

`detail/answer-bar.tsx`. Sie war eine Karte mitten in der Seite, zwischen
Anwesenheitsliste und Gebetsanliegen — gut zwei Bildschirmhöhen unter dem Kopf,
obwohl sie das Einzige ist, das jede:r bei jedem Besuch tut. Alles andere auf
dieser Seite liest man; das hier beantwortet man.

Unten war dafür Platz, der auf dieser Seite nichts sagte: Die Leiste führt zu
fünf Zielen, von denen man gerade keins meint — man ist _in_ einem Termin, und
der Weg heraus ist der Zurück-Pfeil oben links.

**Nur wo es etwas zu antworten gibt.** An einem vergangenen oder abgesagten
Abend rendert die Terminseite den Balken gar nicht (`!locked`), und unten steht
die Leiste wie überall sonst. Die Navigation aufzugeben lohnt nur da, wo etwas
Nützlicheres an ihrer Stelle steht.

**Wie „unten" funktioniert** (`layout/bottom-slot.tsx`): `AppShell` rendert
statt `<TabBar />` einen `BottomSlotOutlet`, der die Leiste zeigt, solange
niemand den Platz beansprucht. Der Balken wird von der Terminseite gerendert —
also tief in `<main>` — und **portiert** sich dorthin. Er **ersetzt** die
Leiste, und die ist ein Geschwister von `main`; stünden beide in verschiedenen
Kästen, gäbe es beim Wechsel zwei Balken übereinander. Dasselbe tut am
vergangenen Abend der Balken „Bearbeiten"
(`edit-bar.tsx`).

Der Ziel-Kasten trägt `display: contents`, sonst wäre er der Elternkasten des
Balkens und exakt so hoch wie er — `sticky` hätte keinen Weg zu kleben. Und der
Anspruch ist ein **Zähler**, kein Schalter: React montiert Effekte im Strict
Mode doppelt, und ein Boolean, das einmal zu früh zurückfällt, blendet die
Navigation mitten im Betrieb wieder ein.

**Zwei Zustände.** Eingeklappt die drei Antworten und der eigene Satz einzeilig,
falls einer dasteht — ohne Schleier und ohne Sperre, damit die Seite
weiterscrollt und „Ziehen zum Aktualisieren" scharf bleibt. Ausgeklappt kommt
das Notizfeld dazu, und dann ist es ein Sheet wie jedes andere: `lockOverlay()`,
Schleier, Escape, ein Tipp daneben. Zwei Sorten Overlay wären eine zu viel.

Ein Druck auf eine Antwort klappt auf. Dafür gibt `useAttendanceAnswer` seit
diesem Umbau `Promise<boolean>` zurück: `false`, wenn die Rollen-Rückfrage
abgebrochen wurde. Wer sie abbricht, hat nichts geantwortet — ein Feld für eine
Notiz zu einer nicht gegebenen Antwort wäre die falsche Frage.

**Drei Lagen, und die Reihenfolge trägt.** Der Wirt ist `sticky bottom-0` und
hält im Fluss die Höhe des _eingeklappten_ Balkens frei (gemessen, nicht
gerechnet — sie hängt an Schriftart, Notizzeile und Umbruch). Das Panel liegt
darin `absolute bottom-0` und wächst nach oben: So schiebt das Ausklappen nichts
weg, und am unteren Ende der Seite rutscht es nicht aus dem Bild. Der Schleier
ist ein **Geschwister** des Panels und nicht sein Kind — das Panel trägt beim
Ziehen ein `transform`, und ein transformiertes Element wird zum Bezugsrahmen
für jedes `position: fixed` darin.

Der sichere Rand steckt im Panel (`pb-safe`), die Höhe des Wirts zählt ihn per
`calc()` mit: Als Polsterung am Wirt zöge `box-sizing: border-box` ihn von der
Höhe ab, und der Balken deckte auf einem Gerät mit Home-Indikator genau diesen
Streifen Inhalt zu.

**Auf „Heute" wird nicht geantwortet.** Der Startbildschirm ist die Übersicht,
nicht die Entscheidung — und eine vierte Fassung derselben Frage hätte eigene
Regeln, etwa keine Rückfrage vor dem Abgeben einer Rolle. `myAttendance` wird
deshalb nicht optimistisch gepflegt: Ein Feld zu pflegen, das niemand anzeigt,
veraltet stillschweigend. Die Entwertung von `keys.home` bleibt — wer eine Rolle
abgibt, ändert „Deine Rollen".

### Sheets wischt man weg

`components/ui/sheet.tsx`. Jedes Sheet trägt oben einen Griff — genau das
Zeichen, das überall „zieh mich weg" heißt, und hier tut er das auch. Ein
Zeichen, das ein Versprechen gibt und es nicht einlöst, wäre schlimmer als
keins.

**Gezogen wird am Kopf.** Griff und Titelzeile sind der Ziehbereich
(`dragListener={false}` plus `useDragControls`, gestartet aus einem
`onPointerDown`), alles darunter bleibt reines Scrollen. Warum nicht das ganze
Panel: Der Körper ist ein Scroller (`overflow-y-auto overscroll-contain`), und in
`image-cropper.tsx` steckt darin `react-easy-crop` mit eigenem Schieben und
Zoomen samt Bereichsregler. Zwei Gesten auf derselben Fläche brauchen eine Regel,
welche gewinnt — und die hieße „nur wenn ganz oben gescrollt ist", also eine, die
je nach Scrollstand etwas anderes tut. Am Kopf gibt es die Frage nicht.

Das X hält den Zeiger mit `stopPropagation` an, sonst begänne jeder Druck darauf
eine Geste. Der **Griff** tut das bewusst nicht: Er ist die Fläche, an der man
zieht, und ein sauberer Tipp kommt trotzdem als Klick an.

**Die Schwelle steht einmal** (`components/ui/swipe-dismiss.ts`): Strecke
**oder** Schwung — wer weit zieht, hat es sich überlegt, wer schnippt ebenfalls;
nur kurz und langsam ist ein Verrutschen. Sie liegt über der von „Ziehen zum
Aktualisieren": Ein Sheet ist größer als ein Kringel, und es wegzuwischen
verwirft mehr. `raised()` ist dasselbe nach oben, für den Antwort-Balken — ein
Balken, der leichter aufgeht als zu, wäre eine Ungleichheit, die niemand
entschieden hat.

Damit gilt die Geste an **allen** 25 Sheets ohne eine Änderung am Aufrufer,
`ConfirmProvider` eingeschlossen: Dort ist Wegwischen dasselbe wie Escape oder
ein Tipp daneben — Abbrechen. An `pull-to-refresh.tsx` war nichts zu tun; es
steigt aus, sobald ein Overlay angemeldet ist, und das Sheet meldet sich seit
jeher über `lockOverlay()` an.

### Die Nachbereitung entsteht am Abend, nicht davor

Zusammenfassung und Actionstep eines Abends **ohne** Thema hängen am Baustein
`hasNotesSlot` — dem einzigen, der nicht im Bausteinkasten steht. Dort hätte man
ihn _vor_ dem Abend angehakt, also als es noch nichts nachzubereiten gab.

**Der Hinweis steht ganz oben, die Karte unten.** Ab Terminbeginn ist er die
Hauptsache dieses Bildschirms — wer vom Abend heimkommt, soll ihn sehen, ohne an
Anwesenheit, Gebetsanliegen und Thema vorbeizuscrollen. Die Karte steht unten:
Sobald etwas
drinsteht, ist es Inhalt und gehört zum Nachklang des Abends. Beides zugleich
gibt es nie — `showNotes` und `mayAddNotes` schließen einander aus.

Stattdessen ein Ablauf in drei Zuständen, und keiner davon zeigt ein leeres Feld:

| Was dasteht   | Wann                                                 |
| ------------- | ---------------------------------------------------- |
| nichts        | vor der Treffpunktzeit, oder der Abend hat ein Thema |
| `NotesPrompt` | ab Terminbeginn, solange nichts geschrieben ist      |
| `NotesCard`   | sobald etwas drinsteht — oder gerade angelegt        |

Der Hinweis schaltet den Baustein an **und** macht die Karte auf (`notesOpen`):
er ist die Aufforderung, etwas zu schreiben, und eine Karte, die erst beim
ersten gespeicherten Satz erschiene, gäbe es nicht, in den man ihn tippt. Bleibt
sie leer, steht beim nächsten Aufmachen wieder der Hinweis da.
Innerhalb der Karte ist jedes der beiden Stücke
einzeln: ein Knopf legt das fehlende an und öffnet gleich das Feld (`startOpen`
an `InlineEdit`), bleibt es leer, nimmt `onDiscard` es wieder weg. So gibt es
kein Feld ohne Inhalt — und manchmal gibt es eben nur einen Vorsatz und nichts
zusammenzufassen.

Wegnehmen geht über „Nachbereitung entfernen" am Fuß der Karte, mit derselben
Rückfrage wie bei den anderen Bausteinen: gelöscht werden beide Texte und die
Haken darunter. Danach steht wieder der Hinweis da, als wäre nichts gewesen.

### Absagen: die eigene und die des ganzen Abends

Für sich absagen und den Abend für alle absagen sind zwei Dinge. Der zweite
Knopf ist Admin-Sache (`ADMIN_ONLY_ROUTES` in `lib/auth/roles.ts`,
durchgesetzt vom Server) und fragt nach einem Grund. Der ist freiwillig, aber
der eigentliche Zweck des Zwischenschritts: ein „fällt aus" ohne Erklärung
erzeugt genau die Rückfragen in WhatsApp, die die App abschaffen soll.

Ein abgesagter Abend sieht dann auch danach aus (`detail/cancellation-card.tsx`):
oben eine `alert`-Karte mit Grund, Person und Zeitpunkt, darunter alles gedämpft
und schreibgeschützt (`locked = past || cancelled`) — einem Termin, den es nicht
mehr gibt, weist man keine Lieder und Rollen zu. Für Admins steht in der Karte
„Absage zurücknehmen".

**Der Abend, den niemand absagt und der trotzdem ausfällt.** Haben alle aktiven
Personen abgesagt, setzt das Backend den Termin von selbst auf `CANCELLED`;
sagt danach jemand doch zu, lebt er wieder auf. Beides schickt eine
Benachrichtigung. Wer noch nicht geantwortet hat, verhindert die Absage — die
Einzelheiten stehen im Backend-README.

Dafür steht in der „Fällt aus"-Karte ein Knopf **„Ich bin doch dabei"** — für
alle, nicht nur für Admins: Die Karte verspricht „sagt jemand doch zu, findet er
wieder statt", aber „Wer kommt" ist an einem abgesagten Abend schreibgeschützt
und die Karten in Liste und Kalender blenden ihren Schalter aus. Der
Admin-Knopf „Absage zurücknehmen" nimmt die selbst gegebenen Absagen mit
zurück.

In der Planungstabelle steht ein abgesagter Abend blass da, statt zu
verschwinden: dass er ausfällt, ist die Antwort auf „was ist am 12. Mai" —
seine Zeile wegzulassen wäre keine.

### Lieder: zwei Wege, und der zweite fehlte

Am Termin gab es nur das Eintragen: tippen, warten, aus höchstens acht Treffern
wählen. Wer wissen wollte, was die Gruppe eigentlich singt, musste ins Archiv —
und von dort führte kein Weg zurück an den Abend.

`components/domain/song-picker-body.tsx` ist dieselbe Datenbank mit demselben
Suchfeld und denselben drei Sortierungen wie im Archiv, nur mit dem Knopf
daneben. Was schon am Abend hängt, steht mit Haken da und lässt sich nicht
doppeln. Er steht **vor** dem Eintrag-Formular, weil er meistens der richtige
ist — die Gruppe singt vieles wieder.

**Beide Wege liegen hinter einem Knopf** — ein Knopf für **eine** Absicht.
`song-suggest-sheet.tsx` fragt zuerst, worum es geht: ein Lied aus dem Archiv
oder ein neues.

Drei Dinge daran sind Absicht:

- **Ein `Sheet` mit Schritten, keine gestapelten.** `Sheet` rendert ohne Portal
  auf derselben Ebene und meldet seinen eigenen Escape-Handler an; zwei
  übereinander schließen einander und fangen den Fokus im falschen Panel.
  Dieselbe Lösung wie in `venue-sheet.tsx` und `topic-choice-sheet.tsx`.
- **Ein Element und nicht drei.** Würde je Schritt ein eigenes `Sheet` gerendert,
  verschwände es beim Schließen aus einem Schritt heraus schlagartig —
  `AnimatePresence` braucht das Element, um es hinausfahren zu können. Deshalb
  kommt der Formular-Rumpf als Haken herein (`useNewSongForm`), wie bei
  `useLocationForm` und aus demselben Grund: Er füllt Inhalt **und** Fußzeile,
  und das sind zwei Attribute.
- **Die Suche ist an den Schritt gebunden** (`active`). Das Sheet bleibt
  geschlossen mit im Baum; ein Titelfeld, das jemand beim Zurückgehen stehen
  lässt, fragte sonst weiter.

Nebenbei: die Suche im Eintrag-Formular feuerte pro Tastendruck ab zwei Zeichen.
Ein `useDeferredValue` bringt sie auf dieselbe Hausregel wie Archiv und
Terminliste.

**Der Songtext-Link steht auf der Seite des Lieds** ganz oben, und die Zeile
führt hin; `lyrics-link.tsx` hält nur `isHttpUrl` und den Prüf-Knopf neben dem
Eingabefeld.

**Der zweite Druck auf „Link suchen" heißt „Weitere suchen".** Dabei geht
`more: true` mit, die bisherigen
bleiben stehen, und was dazukommt, trägt ein „neu". Die Markierung rechnet
`song-ai-assist.tsx` selbst aus: der Server liefert das Bekannte zuerst, und die
Komponente kennt die vorherige Liste — ein Feld dafür wäre eine Angabe über den
Verlauf _dieser_ Sitzung an einer Stelle, die nichts davon weiß.

Kommt nichts Neues, sagt ein Toast das auch. Sonst sähe der zweite Druck aus,
als hätte er nichts getan.

**„Aus dem Archiv" steht fest hoch** (`Sheet` mit `size="tall"`). Ein Sheet
wächst sonst mit seinem Inhalt, und eine Suche ändert ihre Höhe mit jedem
Buchstaben: Bei drei Treffern sackte es nach unten — genau hinter die Tastatur,
die man zum Tippen offen hat. Feld und Sortierung kleben zudem oben im Körper,
damit man zum Weitertippen nicht erst zurückscrollt.

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

Bei der **Musik** stehen dort keine Leute ohne Instrument — Namen, die für
diese Rolle nie in Frage kommen, sähen aus wie die Fortsetzung der Rangliste.
Wer doch die Musik macht, schaltet im Profil „spielt ein Instrument" ein;
stehen bleibt nur, wer **schon eingetragen** ist, damit er sich austragen lässt.
Gefüllt ist der Abschnitt beim Testimony (wer es schon erzählt hat) und beim Nachtragen („Alle
Personen"). Beim Host bleibt er leer, und das ist richtig: dort _ist_ das
Ranking die vollständige Menge der gültigen Antworten, alles andere lehnt der
Server ab.

**Die Fakten stehen in der Reihenfolge, in der sortiert wird**
(`suggestionFacts`): an diesem Abend schon dran, sonstige Auslastung („hat noch
Musik (18. Aug.) vor sich"), zuletzt dran, wie oft insgesamt. Die kompakte
Zeile unter „Restliche" zeigt nur zwei Fakten, und dort muss das erste
Kriterium stehen, das den Platz erklärt. Die Auslastung ist **eine**
Zeile, nicht eine je Dienst — zwei Zeilen dafür verdrängten in der knappen
Fassung wieder das nächste Kriterium.

Die Knöpfe „Abbrechen" und „Übernehmen" stehen bei Mehrfachauswahl im **Fuß**
des Sheets (`footer`), nicht am Ende der Liste: Bei neun Namen musste man für
den Abschluss sonst erst ans Ende scrollen. Dasselbe im Snack-Sheet.

**Die Planungstabelle ist eine Tabelle**, auch auf dem Telefon, obwohl drei
Spalten auf 390 px eng sind — hier plant man **quer**: „wer hostet in den nächsten sechs Wochen"
ist eine Spalte, keine sechs Zeilen. Also bleibt das Raster, scrollt waagerecht
in seinem eigenen Kasten, und zwei Knöpfe verkleinern es in drei Stufen.

Kein Pinch-Zoom: der kollidiert auf Mobilgeräten mit dem Seiten-Zoom des
Browsers und lässt sich davon nicht zuverlässig trennen.

Die Zellen sind nicht nur Anzeige — antippen öffnet dasselbe Sheet wie das
Detail. Die Tabelle ist der Ort, an dem man merkt, dass etwas fehlt, also
gehört das Eintragen auch dorthin. Dafür lädt sie den Termin beim Antippen
einzeln nach: `useRoleAssignment` braucht seinen ETag zum Schreiben, und den
bringt eine paginierte Liste nicht mit.

**Ihre Zeilen kommen aus den Terminen, nicht aus `…/assignments`.** Diese Route
beantwortet „wer ist wofür dran" — eine Zeile je zugeteilter Person. Ein Abend,
an dem noch niemand steht, erzeugt dort also nichts und fehlte in der Tabelle;
genau der ist aber der, den man dort sucht. Die Terminliste bringt Gastgeber,
Thema, Testimony und Musik ohnehin mit, es kostet also keine zweite Abfrage.

**Thema und Testimony haben eigene Spalten**, obwohl sie einander ausschließen.
Zusammengelegt sparte das eine Spalte und kostete die Auskunft: unter der
Überschrift „Thema" stand dann ein Name, der zum Testimony gehörte. Getrennt
sagt der Strich in der einen Spalte, was für ein Abend das ist.

Die Reihenfolge ist **Host, Thema, Musik, Testimony**: die Musik wird an fast
jedem Abend zugeteilt, ein Testimony einmal im Monat. Was öfter gebraucht wird,
steht näher am Datum — auf dem Telefon entscheidet das darüber, was man ohne
Wischen sieht. Sie steht an zwei Stellen, die nur positionell zusammenhängen
(Kopfzeile und `cells` in `Row`); wer eine ändert, ändert beide.

Eine leere Zelle hat drei Bedeutungen, und sie sehen verschieden aus:

| Was steht da | Was es heißt                                             |
| ------------ | -------------------------------------------------------- |
| _offen_      | Hier fehlt jemand                                        |
| `–`          | Der Baustein ist an diesem Abend abgeschaltet            |
| nichts       | Kein Host nötig — der Ort steht schon und braucht keinen |

Der Unterschied zwischen _fehlt_ und _gibt es hier nicht_ ist die ganze Frage,
die man an so eine Tabelle stellt: Ein Schlosspark-Abend ist nicht „offen",
er ist geklärt.
Anklickbar bleibt die Zelle trotzdem — wer doch bei sich einlädt, trägt sich
dort ein, und der Ort zieht mit.

**Ort und Gastgeber öffnen dasselbe Sheet.** Die Host-Spalte führt auf
[`VenueSheet`](src/components/domain/venue-sheet.tsx) mit zwei Registern,
„Zuhause" und „Treffpunkte" — so lässt sich auch in der Tabelle sagen „wir sind
draußen".

## Das Archiv

Fünf Register als Pillen: **Themen, Lieder, Orte, Notizen, Termine** — in dieser
Reihenfolge, weil man hier meistens ein Thema oder ein Lied sucht und nur
manchmal einen Abend. Das Register steht in der Adresse (`?register=…`, per
`replaceState`), sonst führte „zurück" von einer Liedseite auf „Themen".

### Themen

Die Themenliste ist eine **Liste**: Titel, Zusammenfassung, wer daran arbeitet,
wie viele Abende. Jede Karte (`TopicEntry`) ist gebaut wie der Kopf der
Themenseite, nur knapp — Symbol in einer Kachel, daneben in einer Spalte Titel,
eine Zeile Zusammenfassung, Gesichter und die Zahl der Einheiten (bei einer
einzelnen ihr Abend). Die Abende selbst stehen auf der eigenen Seite des Themas
(`/thema?id=…`) — ein Thema mit fünf Einheiten machte die Liste sonst zu einer
Wand.

Zwei Register, **„Eigene Themen (n)" und „Alle Themen (n)"**, unterstrichen und
nicht als Pillen: darüber steht schon eine Pillen-Leiste, und zwei gleich
aussehende Leisten übereinander liest man als eine.

„Alle" ist, was **gehalten** wurde: ein Thema erscheint, sobald einer seiner
Abende vorbei ist, und bleibt dann drin — auch für alles, was danach noch
dazukommt. „Eigene" (`scope=mine`) nimmt zusätzlich die dazu, die noch vor sich
haben, gehalten zu werden; die Zahl daneben ist deshalb **keine** Teilmenge der
anderen. Sie kommt aus `…/archive` und nicht aus einer zweiten Listenabfrage.

Die Pille darüber zeigt `totals.topicsTotal`, die **Vereinigung** beider
Register — sonst stünde über „Eigene (1)" ein „Themen (0)", weil ein selbst
angelegter Entwurf noch keinen Abend hat. Die Summe wäre auch falsch: ein
eigenes, gehaltenes Thema steht in beiden Registern.

Auf der Themenseite stehen die Einheiten als **Zeitstrahl**, die Nummern an der
Linie sagen, dass hier etwas aufeinander folgt; Entwürfe ohne Termin liefert
der Server nur Owner und Mitarbeitenden aus — das ist keine Ausblendung im UI,
sondern eine Entscheidung eine Ebene tiefer. Jede Zeile führt auf die Seite
ihrer Einheit (`/einheit?id=…`), und dort wird sie geschrieben. Ob Knöpfe
überhaupt erscheinen, sagen `mayEdit` und `mayDelete` aus der Antwort — das
Frontend rechnet die Regel nicht nach.

### Lieder, Orte, Notizen, Termine

**Ein Lied öffnet seine Seite** — siehe „Lieder haben eine eigene Seite" weiter
unten. Auf dem Telefon stehen dort oben an „Deine Version" Symbole statt Wörtern
(Text, Akkorde, Tonart) und das Vollbild als großer Knopf ohne Wort; `Segmented`
kann dafür je Option ein `icon` tragen, das Wort bleibt für Screenreader.
„Lieder" teilt sich in „Meine Lieder" (mit eigener Version, aus dem Gerät) und
„Alle Lieder" (`?register=lieder&lieder=meine`).

**Orte** und **Notizen** haben eigene Abschnitte weiter unten. **Termine** zeigt
je vergangenem Abend die Art, den Zeitpunkt samt Uhrzeit und die Nachbereitung —
egal ob sie vom Thema oder vom Baustein kommt (`meetings-archive.tsx`, über
`…/meetings?scope=past`). Abgesagte Abende blendet eine Checkbox ein.

**Angelegt wird über das „+" unten rechts** (`components/layout/floating-action.tsx`),
für Themen, Lieder, Treffpunkte und Notizen. Es hängt an einem Anker im Fuß des
Gerüsts, der mit der Leiste unten zusammen klebt (`app-shell.tsx`) — so schwebt
es über der Tab-Leiste, am Rechner über dem unteren Rand, und muss deren Höhe
nicht kennen. Bei offener Tastatur geht es weg. Für Themen fragt es zuerst, ob
es ein Thema über mehrere Abende wird oder eine einzelne Einheit.

### Der Suchmodus

Wer ins Suchfeld tippt, will suchen und nicht lesen, was das Archiv ist. Also
gehen Kopf und Kopfleiste, das Feld rückt mit den Registern nach oben und bleibt
dort kleben, darunter scrollen die Treffer — wie bei Spotify. Was daran zählt:

- **Er klebt wirklich**, weil `main` `overflow-x-clip` trägt und kein
  Scroll-Container ist (siehe „Eine Klasse, die den Rechner rettet").
- **Die Leiste klebt auch ohne Suchmodus.** Wer nach unten scrollt, behält das
  Feld oben; solange es klebt, bleibt die Kopfleiste weg, und zurück kommt sie
  erst über die Leiste hinweg beim Kopf. Nur in diesem Zustand trägt die Leiste
  einen Haarstrich — im Suchmodus sind Feld und Treffer eins.
- **Der Einstieg ist eine Bewegung.** Die Leiste trägt ihren sicheren Rand
  immer (`pt-safe-4` mit `-mt-safe-4`, die sich im Fluss aufheben), und es
  bewegt sich allein die Höhe des Kopfs — zwei Bewegungen gegeneinander ließen
  das Feld über seinen Platz hinausschießen. Höhe statt `transform`, weil ein `transform` am Seiteninhalt
  zum Bezugsrahmen der Sheets darin würde (dieselbe Regel wie in
  `pull-to-refresh.tsx`).
- **Die Tastatur geht oben auf.** Per Finger bekommt das Feld beim ersten Tipp
  keinen Fokus (`mousedown` wird verhindert), sondern ein unsichtbares
  Hilfsfeld an der Endposition — in derselben Geste, sonst bliebe die Tastatur
  zu. Ist der Kopf eingeklappt, wandert der Fokus ins echte Feld; zwischen zwei
  Feldern bleibt die Tastatur offen. Der Grund: iOS schiebt beim Fokussieren
  den sichtbaren Ausschnitt gegen das Layout, um das Feld über der Tastatur zu
  zentrieren, und rechnet mit der Lage beim Tipp. Führe das Feld danach hoch,
  stünde es mit offener Tastatur halb unter der Uhr. Was man tippt, bevor der
  Fokus übergeben ist, landet über denselben Zustand schon im echten Feld.
  Darunter liegt ein Netz über `visualViewport`, das zurückscrollt, falls iOS
  doch verschiebt.
- **Er endet nur über „Abbrechen"** (oder Escape), nicht wenn das Feld den Fokus
  verliert. Auf dem Telefon schließt schon das Scrollen durch die Treffer die
  Tastatur, und dann spränge der Kopf mitten in der Liste zurück. Enter schließt
  nur die Tastatur.
- **Abbrechen leert das Feld.** Ein Filter, der nach dem Verlassen weiter wirkt,
  sähe aus wie ein Archiv, in dem etwas fehlt.

## Wischen statt Drücken

`components/ui/swipe-actions.tsx`. Drei Listen geben Stift und Papierkorb frei:
die Treffpunkte, die Ideen der Gruppe und die Geschenk-Vorschläge. Lieder haben
eine eigene Seite, dort steht beides unter „Bearbeiten", und die Zeile führt
hin; nur am Termin wischen sie (Setlist „−", Vorschlag Papierkorb).

**Was es ersetzt.** Erst standen die Knöpfe dauerhaft da — zwei Ziele am Rand
jeder Zeile einer Liste, durch die man scrollt, und beide traf der Daumen
zuverlässiger als die Zeile. Dann lagen sie hinter einem langen Druck. Der war
nicht zu erraten: Wer die Geste nicht kennt, hält die Liste für
schreibgeschützt, und nichts belehrt ihn eines Besseren. Ein Wisch zeigt sich
beim ersten versehentlichen Ansatz.

**Am Rechner fahren dieselben Knöpfe beim Überfahren ein.** Wischen gibt es dort
nicht, und eine Liste, die auf dem Telefon bearbeitbar ist und im Fenster nicht,
wäre kein Entwurf, sondern ein Versäumnis. Gefragt wird nach
`pointerType === 'mouse'`: Ein Touchscreen schickt beim Tippen ebenfalls ein
`pointerenter`, und die Zeile ginge schon beim Antippen auf.

**Immer nur eine offen.** Ein winziger Speicher wie in `overlay-lock.ts`
(`useSyncExternalStore`, eine Id) hält fest, welche Zeile offen ist; wer aufgeht,
schließt die andere. Einen „Fertig"-Knopf je Zeile braucht es deshalb nicht.

**Die Box hinter der Glocke wischt ohne Knöpfe.** Dort gibt es genau eine Sache
zu tun (gelesen), und sie ist umkehrbar — ein Knopf, der sie erst noch anbietet,
wäre ein Schritt zu viel. Sie benutzt deshalb nicht `SwipeActions`, wohl aber
dieselbe Schwelle aus `swipe.ts`.

**Die Breite wird gemessen, nicht gerechnet.** Sie hängt an der Zahl der Knöpfe,
und die ist je Zeile verschieden: Bei den Ideen darf nicht jede:r löschen, bei
den Treffpunkten nur ein aktiver. Eine feste Zahl käme bei jeder zweiten Zeile
zu weit oder zu kurz.

`touch-action: pan-y` auf der ziehenden Ebene: Senkrecht scrollt die Seite wie
immer, waagerecht gehört die Geste uns. Ohne das entscheidet der Browser, und er
entscheidet für sich. `dragDirectionLock` hält die Richtung, sobald sie
feststeht — sonst nähme jeder senkrechte Wisch die Zeile ein Stück mit.

Die Schwellen stehen bei den senkrechten (`components/ui/swipe.ts`,
`pulledLeft`/`pulledRight` neben `dismissed`/`raised`): Ein waagerechter Wisch,
der bei anderen Werten auslöste als ein senkrechter, wäre eine Unterscheidung,
die niemand getroffen hat.

## Orte: wer was sieht, und wer was ändert

Ein Ort hat vier Zahlen und Wörter, und jedes gehört woandershin — nicht aus
Ordnungsliebe, sondern weil jede eine andere Frage an eine andere Person ist.

| Feld      | Wo                              | Weil                                                                        |
| --------- | ------------------------------- | --------------------------------------------------------------------------- |
| Anschrift | Profil (eigene Wohnung)         | „wo wohnst du" beantwortet nur, wer dort wohnt                              |
| Kapazität | Profil (eigene Wohnung)         | „wie viele passen bei dir rein" ebenso                                      |
| Name      | abgeleitet bzw. Treffpunkt-Form | eine Wohnung heißt nach ihren Bewohner:innen, ein Park nach sich selbst     |
| Gewicht   | **Verwaltung**                  | „wie oft wollen wir bei dir sein" ist eine Aussage der Gruppe, keine Angabe |

Im Archiv sind Orte **zwei Register**, „Zuhause" und „Treffpunkte" (`ListTab`
aus `list-tab.tsx`, in der Adresse als `&orte=treffpunkte`), statt zwei Karten
untereinander. Auf „Treffpunkte" legt das „+" unten rechts einen an; Wohnungen
entstehen im Profil. **Stillgelegte stehen nicht da**, auch nicht hinter einem
Haken — ein ehemaliges Zuhause pro Umzug wüchse mit den Jahren zu.

Eine Wohnung steht dort nur: Name, Anschrift, Link zur
Karte. Kein Stift, weil es dort nichts zu ändern gäbe, und kein Gewicht, weil
eine 0,5 neben dem eigenen Namen, die man nicht ändern kann und deren Herkunft
man nicht kennt, nur Fragen aufwirft. Treffpunkte bleiben frei bearbeitbar —
Name und Anschrift, mehr hat ein Park nicht.

Das Ausblenden ist **keine Sicherheitsgrenze**: `PATCH …/locations/:id` steht
weiterhin jedem Mitglied offen, weil Orte zu pflegen ausdrücklich niemandes
Vorrecht ist. Es so zu behandeln wäre eine Sicherheit, die keine ist.

## Der Gebets-Bildschirm

Oben die laufende Runde, darunter „Weitere Runden" mit einem Umschalter
zwischen **Kommend** und **Vorbei**. Der Umschalter setzt `scope` in der
Anfrage, filtert also nicht im Browser — der Server dreht dabei auch die
Reihenfolge um: kommende Runden vorwärts, vergangene rückwärts. Der Knopf zum
Nachladen heißt entsprechend „Weiter voraus" oder „Ältere Runden laden".

Kommende Runden gibt es, weil das Backend fünf Runden vorhält — so ist „mit wem
bete ich ab übernächster Woche" beantwortbar.

Die laufende Runde fällt aus der Liste heraus — sie steht schon oben, unter
„Kommend" wäre sie doppelt.

**Es gibt keinen „Schreiben"-Knopf.** Ohne Telefonnummer landete eine
`wa.me`-Adresse nur in WhatsApps Kontaktauswahl, und wer seine Gebetsbuddys
anschreiben will, hat den Chat ohnehin offen.

## Ausgeliefert wird ein statischer Export

`pnpm build` schreibt nach `out/`, und von dort liefert Cloudflare Pages aus —
kein Node-Prozess, kein Adapter, kein Runtime.

Das ist keine Sparmaßnahme, sondern das, was diese App ohnehin ist: Es gibt
keinen Route Handler, keine Server Action, kein `next/headers`, keine
`middleware.ts` und kein ISR. Daten holt durchweg der Browser, weil das Token
dort lebt. Next ist Anwendungsgerüst und Router, und ein Router braucht zur
Laufzeit keinen Server.

**Was der Export verlangt hat: die beiden Detailseiten tragen ihre Id in der
Query.** `/termin?id=<uuid>` statt `/termine/<uuid>`, `/thema?id=<uuid>` statt
`/archiv/themen/<uuid>`. Ein Pfadsegment `[id]` braucht beim Export
`generateStaticParams` — eine zur Bauzeit bekannte Liste aller Adressen. Die gibt
es nicht: Ids entstehen im Betrieb und liegen hinter einem Token, das der
Bauprozess nicht hat.

Beide Seiten lesen die Id mit `useSearchParams` und nicht aus
`window.location.search`. Von einem Termin führt ein Link auf einen anderen (die
Themen-Karte zeigt auf den vorigen Abend desselben Themas); dabei wechselt die
Query, ohne dass die Seite neu montiert wird, und ein einmal ausgelesener Wert
bliebe auf der alten Id stehen. Das `<Suspense>` darum verlangt Next: zur Bauzeit
hat `useSearchParams` noch keine Antwort, also steht der Fallback im HTML.

Das Backend kennt diese Pfade an genau einer Stelle —
`src/notification/app-paths.ts` —, weil Push-Benachrichtigungen dorthin springen.

**Drei Variablen setzt Cloudflare zur Bauzeit** (Settings → Environment
Variables): `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_OIDC_AUTHORITY`,
`NEXT_PUBLIC_OIDC_CLIENT_ID`. Fehlt eine, greifen die Vorgaben im Code, und die
zeigen auf `localhost` — kein Fehler beim Bauen, kein Fehler beim Laden, nur eine
App, die nichts anzeigt.

Als Build-Kommando gehört dort `pnpm build` hinterlegt, nicht `next build`: Im
Skript steckt `--webpack`, und ohne das bricht der Bau ab (siehe unten).

[`public/_headers`](public/_headers) reist mit nach `out/` und regelt das
Caching am Rand. Der Grund dafür ist `sw.js`: Cachte ein CDN den Service Worker,
könnte eine installierte PWA ihren eigenen Worker nicht mehr erneuern — ein
Fehler, der sich nicht durch ein Deploy beheben lässt, weil das Deploy nicht
ankommt.

Der ganze Ablauf steht im [Betriebs-Handbuch](../deploy/README.md).

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

### Die Box hinter der Glocke

Eine Push-Nachricht ist weg, sobald jemand sie wegwischt. Dieselbe Nachricht
steht deshalb auch in der Box (`notification-inbox.tsx`) — und zwar **auch
dann, wenn die Art in den Einstellungen abgeschaltet ist**. In der Box zu stehen
stört niemanden. Sie liegt darum unter `/api/notifications` und nicht unter
`/api/push`.

Gelesenes verschwindet aus der Box, aber nicht aus der Welt: Es wandert nach
„Früher", aufklappbar, die letzten dreißig.

**Wer nur wegräumen will, wischt nach links.** „Alle gelesen" ist ein grobes
Werkzeug: Wer sieben Nachrichten hat und sechs davon erledigt, will die siebte
stehen lassen.

Der Wisch ist **kein `SwipeActions`**, obwohl die App den überall sonst
benutzt. Die Listen dort geben rechts Stift und Papierkorb frei, weil zwei Dinge
zur Wahl stehen und eines davon löscht. Hier gibt es genau eine Sache zu tun,
und sie ist umkehrbar — der Eintrag wandert nach „Früher", nicht aus der Welt.
Ein Knopf, den man danach noch treffen muss, wäre ein Schritt zu viel; unter der
Zeile steht deshalb nur ein Haken auf `success-bg`, also was gleich passiert.
Die Schwelle kommt trotzdem aus `swipe.ts` (`pulledLeft`) — es gibt eine
Meinung darüber, ab wann jemand etwas gemeint hat. Gewischt wird nur an den
**ungelesenen**: An einer gelesenen gibt es nichts wegzuräumen, und eine Zeile,
die nachgibt und dann nichts tut, ist ein Versprechen, das die Liste nicht
hält.

**Sie ist eine Sprechblase unter der Glocke, kein Sheet von unten.** Ein
Bottom-Sheet beantwortet „wähle etwas aus", nicht „was ist neu" — und es käme
aus der Ecke gegenüber dem Knopf, den man gerade gedrückt hat.

Dafür ist **keine Positionierungs-Bibliothek** dazugekommen, und es fehlt auch
keine: Die App kennt weder Portale noch `getBoundingClientRect`, braucht hier
aber beides nicht. Die Glocke sitzt in einer Leiste über die volle Breite, ihr
Mittelpunkt liegt damit fest bei 2,125 rem vom rechten Rand (`px-4` der Leiste
plus halbe Knopfbreite). Das Panel steht bei `right-3`, der Zipfel bei
`right-[1.375rem]` — dieselbe Kante, eine Subtraktion, keine Messung. Ein
allgemeines `Popover` wäre eine Positionierungs-Maschine für genau einen
Aufrufer.

Vom `Sheet` übernommen ist, was dieselbe Frage beantwortet: Escape schließt,
`role="dialog"` mit Fokus beim Öffnen, und `lockOverlay()`. Das sagt hier drei
Dinge auf einmal — der Hintergrund scrollt nicht, „Ziehen zum Aktualisieren"
hört nicht zu, und **die Kopfleiste bleibt stehen** (`useHeaderScroll` fragt
`useOverlayOpen`). Ohne das führe sie beim ersten Wischen weg und ließe die
Blase samt Zipfel im Nichts hängen.

Zwei Wege dorthin, und der zweite ist der interessante:

1. **Antippen in der Box** — `markRead`, dann `router.push(url)`.
2. **Antippen der Push-Nachricht.** Der Service Worker hat kein Token und kann
   den Eintrag nicht selbst schreiben. Er hängt deshalb `gelesen=<id>` an die
   Ziel-Adresse (die `notificationId` kommt in der Payload mit), und
   `use-inbox-deeplink.ts` löst das beim Start ein — auch aus dem geschlossenen
   Zustand, denn dann steht der Parameter in der allerersten Adresse. Danach
   räumt ein `history.replaceState` ihn weg: Es ist Aufräumen und kein
   Ortswechsel, ein Eintrag in der Verlaufsliste dafür wäre einer zu viel.

Gelesen wird er aus `window.location` und **nicht** mit `useSearchParams`: Das
verlangt beim statischen Export eine `<Suspense>`-Hülle um jede Seite, die es
benutzt — und dieser Haken hängt im Gerüst, beträfe also alle.

Kommt eine Nachricht an, während die App offen ist, meldet sich der Worker per
`postMessage`; `useInboxLiveUpdates` invalidiert daraufhin die Box. Ohne das
stünde die alte Zahl bis zum nächsten Ziehen-zum-Aktualisieren da — das
`push`-Ereignis erreicht die Seite nicht.

Dieselbe Zahl steht über `navigator.setAppBadge` am App-Symbol, in `try/catch`:
Die Schnittstelle gibt es nur in installierten Apps, und in manchen Browsern
wirft schon der Zugriff.

## Was die Gruppe benutzt, entscheidet, was dasteht

Drei weitere Schalter stehen in der Karte „Termin-Rhythmus"
(`maintenance-admin.tsx`) und kommen **nicht** über `features`, sondern über
`GET …/meetings/config` — die Antwort holt sich diese Seite ohnehin, und ein
Schalter, den nur die Verwaltung braucht, muss nicht an jedem Bildschirm hängen.
„Termine automatisch anlegen" steht über allem anderen, denn er entscheidet, ob
das Übrige eine Frage ist; ist er aus, verschwinden Wochentag, Abstand, Uhrzeit,
Zone und die Lobpreisabende mit. Die beiden **Haken** schreiben sofort, das
**Formular** dazwischen auf Knopfdruck: Ein Haken ist eine Entscheidung, ein
Formular sind vier. `useUpdateMeetingSchedule` entwertet seit diesem Umbau auch
`keys.meetings.all` — wer die Erzeugung wieder anschaltet, soll die neuen Abende
sehen, ohne die App neu zu laden.

Zwei Bausteine sind abschaltbar (Verwaltung), und beide kommen als `features` an
der **Hauskreis-Antwort** — also aus dem Kontext, den ohnehin jeder Bildschirm
hat (`useHauskreis`). Kein eigener Hook, keine zweite Abfrage: ein zweiter
Ladezustand für ein Ja/Nein wäre einer zu viel.

**Gebetsbuddys aus** nimmt den Tab weg, die Karte auf „Heute" (der Server
schickt dann `prayerBuddies: null`), die Benachrichtigungsart und die
Hilfe-Antworten dazu.

`NAV_ITEMS` bleibt dabei die **vollständige** Liste — sie beantwortet noch eine
zweite Frage, nämlich ob ein Bildschirm die Kopfleiste trägt
(`useHasSmartHeader`). Filterte man dort, verlöre `/gebet` sie in dem Moment, in
dem jemand mit einem Lesezeichen darauf landet, und zwar auf einer Seite, die
das dann erklären müsste. Gefiltert wird deshalb erst in `useNavItems`, das nur
`TabBar` und `Sidebar` benutzen; der Bildschirm selbst zeigt einen `EmptyState`
statt einer leeren Runden-Liste, denn „noch nichts geplant" wäre dort eine
Behauptung statt einer Auskunft.

**Actionstep der Woche aus** nimmt nur die Karte auf „Heute" und die
wöchentliche Erinnerung. An der Einheit und über die Nachbereitung bleibt er,
wie er war. Die Karte fragt dafür `home.weeklyActionstep` und nicht
`openActionstep: null` — das hieße auch „diese Woche keiner", und dann steht
dort ein Platzhalter. Die beiden Admin-Mutationen entwerten Hauskreis, „Heute"
und die Benachrichtigungsarten, damit ein Schalter sofort überall wirkt.

## Die Anleitung zum Weiterschicken

`features/help/guide-screen.tsx`, Route `/anleitung`. Wer gründet, steht vor
einer leeren App und acht Leuten, denen er erklären soll, was sie damit sollen —
und „lies mal die Hilfe" ist keine Erklärung.

**Aus den vorhandenen Texten**: die `start`-Einträge aus `faq-content.ts`,
dieselben, die in der Hilfe stehen. Ein zweiter Text, der dasselbe erklärt,
liegt beim nächsten Umbau daneben. Dafür ist der Absatz-Renderer aus dem
Hilfe-Bildschirm in `features/help/faq-answer.tsx` gezogen — zwei Abschriften
wären zwei Gelegenheiten, dass ein Absatz hier fett wird und dort mit Sternchen
dasteht.

**Gedruckt statt heruntergeladen.** Eine feste PDF müsste jemand von Hand
nachziehen; der Druckdialog erzeugt sie aus dieser Seite, und iOS wie Android
bieten darin „In Dateien sichern" an. Die Regeln stehen im `@media print`-Block
in `globals.css`: Navigation, Kopfleiste, Zurück-Pfeil und der Druckknopf selbst
verschwinden — ein Knopf auf Papier ist ein Fehler —, Rahmen und Schatten fallen
weg, und `break-inside: avoid` hält einen Abschnitt zusammen.

## Der erste Start nach dem Gründen

`features/home/owner-welcome-sheet.tsx` plus `lib/owner-welcome.ts`. Nach dem
Gründen war der Admin-Bereich ein Knopf im Profil — zwei Ebenen tief, und nichts
sagte, dass es ihn gibt. Das Sheet nennt die zwei Wege heraus: einladen und
einstellen, und den anderen erklären, worum es geht.

Ein **Einmal-Merker** und kein „schon gesehen": Das Gründen stellt ihn scharf
(`armOwnerWelcome`), das Anzeigen verbraucht ihn (`dismiss`). `useLocalFlag`
kann nur setzen und nie zurücknehmen — beides in dieselbe Bauart zu zwängen
hieße, zwei Merker zu führen („soll noch" und „schon gehabt") und beim Lesen zu
raten, welcher gemeint ist. Er steht trotzdem im `localStorage` und nicht bloß im
Zustand: Zwischen Gründen und Ankommen liegt ein Seitenwechsel, und wer die App
dazwischen zuklappt, soll den Hinweis trotzdem bekommen.

Die **Verwaltung trägt einen Punkt**, bis man einmal drin war
(`features/admin/use-unread-admin.ts`, wortgleich zu `use-unread-help.ts`).
Weggenommen wird er von `MarkAdminSeen` — einem Bauteil, das nichts zeichnet,
weil die Seite selbst ein Server-Bauteil ist und `useEffect` nicht kennt; die
Aussage bleibt so an einer Stelle: **diese Seite** wurde gesehen, nicht „die
Läufe wurden gesehen". Weil der Merker im Gerät liegt und nichts über Rollen
weiß, stimmt er für später Ernannte von selbst. In der Tab-Leiste läuft er mit
„Was ist neu" und „Erste Schritte" in **einen** Punkt zusammen, aber nur bei
Admins: Ein Punkt, der auf etwas Unsichtbares zeigt, bliebe für immer stehen.

## Ein Link, der weiß, was ungespeichert ist

`components/ui/link.tsx` und `components/ui/unsaved.ts`.

Ungespeichertes geht nicht still verloren: Ein Tipp auf die Tab-Leiste fragt
nach, solange ein Formular `dirty` ist.

**Jeder Link und nicht ausgewählte.** Alle Wege aus einem Bildschirm heraus sind
Links: Tab-Leiste, Seitenspalte, Kopfleiste, jede Zeile im Profil. Bewachte man
nur die, die es heute gibt, wäre bei jedem neuen Formular die Frage „ist dieser
Link eigentlich bewacht?" neu zu beantworten — und beim ersten Nein still eine
Antwort verloren. `next/link` wird deshalb nirgends mehr direkt importiert; der
eine Link der App liegt in `components/ui/link.tsx` und liest den Zähler selbst.

**Ein Zähler und kein Schalter** (`unsaved.ts`, gebaut wie `overlay-lock.ts`):
Im Profil stehen zwei Formulare nebeneinander — „Deine Angaben" und „Wo du
wohnst" —, und ein gemeinsames Ja/Nein wäre gelöscht, sobald eines davon sauber
wird. Angemeldet wird mit einer Zeile: `useUnsavedGuard(dirty)`, direkt neben
der Bedingung, die ohnehin schon am Speichern-Knopf steht. Sie muss **vor**
einem vorzeitigen `return` stehen — es ist ein Hook.

Technisch hängt es an `onNavigate` (Next 16): Der Link sagt ab, fragt über
`useConfirm` nach und geht bei einem Ja per `router.push` weiter — das läuft an
`onNavigate` vorbei und fragt deshalb nicht zweimal. Dazu ein `beforeunload`,
solange etwas offen ist; das ist der Weg hinaus, den ein Link-Handler nie sieht.

**Was er nicht kann:** Der Zurück-Knopf des Browsers und die Wischgeste zurück
lassen sich im App Router nicht abfangen. Dafür gibt es keine Schnittstelle, nur
Eingriffe in den Verlauf, die ihn verbiegen. Abgedeckt sind alle Wege _in_ der
App plus Neuladen und Schließen — das ist die ehrliche Reichweite, und sie steht
im Doc-Kommentar.

## Das Profil trägt, was man einstellt

Zwei Blöcke sind ausgezogen, und beide aus demselben Grund: Sie standen als
Karten zwischen lauter Einstellungen, die man umlegt, obwohl man sie zweimal im
Jahr anfasst.

**Die Benachrichtigungs-Arten** (`features/profile/notification-preferences-screen.tsx`,
Route `/benachrichtigungen`). Zwanzig Schalter untereinander sind keine Liste
mehr, sondern eine Wand — man findet den einen nicht, den man sucht. Der
Bildschirm ist gebaut wie die Hilfe: Suchfeld, Kategorie-Pillen, Gruppen mit
Überschrift. Gefiltert wird **im Gerät** (dieselbe `normalize`-Rechnung: klein,
ohne Akzente); die zwanzig Einträge liegen ohnehin im Cache, und eine Anfrage pro
Tastendruck für eine Liste, die auf einen Bildschirm passt, wäre Aufwand ohne
Gegenwert.

Die **Kategorie kommt vom Server** (`NOTIFICATION_CATALOG`, Feld `category`).
Eine zweite Aufzählung hier wäre die, die beim nächsten neuen Eintrag vergessen
wird — der Schalter stünde dann unter „Sonstiges" oder gar nicht. Im Profil
bleibt, was zum Gerät gehört: an/aus, Blocker-Hinweis, Test-Benachrichtigung —
und eine Zeile dorthin mit der Zahl „n von 20 an", die die eine Frage
beantwortet, für die man sonst scrollt.

**Das Konto** (`features/profile/account-screen.tsx`, Route `/konto`) steht in
der Liste unter „Rechtliches & Über die App", als deren **erste** Zeile: Von
allem dort ist es das einzige, hinter dem etwas zu tun ist. Der Bildschirm lädt
seine Person selbst, statt sie als Prop zu bekommen.

**„Unterstützen"** steht am Fuß derselben Karte, unter „Gebaut von Niko" und
nicht davor: Das ist die Reihenfolge, in der man es liest — erst wer, dann
warum. Der Knopf hängt an einer Konstante (`PAYPAL_URL`) und nicht an einem
`disabled`-Attribut: Solange dort `null` steht, gibt es einen grauen Knopf und
darunter den Satz, warum nichts passiert; steht eine Adresse da, wird derselbe
Knopf ein `<a>` mit denselben Klassen (`Button` rendert immer ein `<button>` —
dieselbe Bauform wie „In Maps öffnen" am Termin). So ist das Freischalten später
eine Zeile, und es gibt keinen Zwischenzustand, in dem ein Link ins Leere zeigt.
Ein wortlos ausgegrauter Knopf wäre kein Hinweis, sondern ein Fehler.

**Was an oder aus ist und sofort gilt, ist ein Schalter** (`components/ui/switch.tsx`,
`Switch` und `SwitchRow`). Das Häkchen (`Checkbox`) bleibt für das, was man
auswählt oder abhakt, und für Angaben in einem Formular mit Speichern-Knopf —
Bausteine eines Abends, der Entwurf der Geschenk-Verwaltung, erledigte Ideen,
Filter. `SwitchRow` ist ein `<label>` über die ganze Zeile, und weil
ein `button` beschriftbar ist, schaltet ein Tipp auf den Text mit.

**„Deine Angaben" sind zwei Karten.** „Über dich" (Name, Geburtstag) speichert
ein Knopf, der erst erscheint, wenn sich etwas geändert hat. „Was du
übernimmst" sind vier Schalter, die sofort schreiben, und jeder schickt nur sich
selbst (das PATCH ist partiell, siehe `UpdatePersonInput`). Während eine Anfrage
läuft, zeigt der Schalter schon den neuen Stand (`update.variables`), nimmt aber
keinen weiteren Klick an: Jeder Schreibvorgang trägt den ETag des vorigen. Unter
jedem Schalter steht, **was er gerade bewirkt**, nicht eine Erklärung beider
Fälle. Name und Geburtstag übernimmt
das Formular **je Feld** vom Server, sonst löschte ein umgelegter Schalter einen
halb getippten Namen.

**Jede Unterseite hat einen Zurück-Pfeil** (`PageHeader` mit `back`, dahinter
`components/layout/back-button.tsx`): Präferenzen, Konto, Hilfe, „Was ist neu",
Verwaltung, Gruppe und Anleitung. Ohne ihn wäre der Weg hinaus ein Sprung
woandershin statt zurück. Er geht zurück, wohin man kam (`router.back()`), und nur ohne
Vorgeschichte — eine Push-Nachricht, die direkt auf `/neu` führt — auf das Ziel
in `back`. Und er fragt nach Ungespeichertem wie jeder Link.

## Lieder haben eine eigene Seite

`/lied?id=…` (`features/songs/song-detail-screen.tsx`), vom Termin aus mit
`&termin=…`. Oben, was alle sehen: Titel, „8× gesungen · zuletzt am …" und
„Zum Liedtext". Die Zahlen kommen mit dem einzelnen Lied (`timesPlayed`,
`lastPlayedAt`, dazu `meetingCount` — Löschen geht nur, wenn es an keinem Abend
steht, nur für Admins und nur aus dem Archiv; die Seite sagt das, statt einen
Knopf anzubieten, der mit `400` antwortet). Darunter „Deine Version", als Text;
Akkorde sind ein Umschalter entfernt.

Unten steht statt der Tab-Leiste `EditBar` (`components/layout/edit-bar.tsx`,
dieselbe wie am vergangenen Termin): „Bearbeiten" für Angaben (`SongFields`),
eigene Version und Löschen. Vom Termin aus steht daneben „Entfernen"
(`EveningBar`) — bei einem Setlist-Lied mit der Frage „zurück zu den
Vorschlägen oder ganz vom Termin?". Das Sheet dafür steht in der Seite und nicht
im Balken: Der hängt im Fuß des Gerüsts, und dessen `backdrop-blur` machte ihn
zum Bezugsrahmen eines `fixed`-Panels darin.

Vom Termin aus blättert man (`useEveningPager`): oben rechts „‹ Setlist · Platz
2 ›", auf Touch-Geräten auch per Wisch (`useHorizontalSwipe`, eigene
Touch-Ereignisse — ab 72 px, doppelt so weit waagerecht wie senkrecht, nicht in
einer Ebene darüber und nicht vom linken Rand, der Zurück-Geste des Systems).
Geblättert wird in der Liste, aus der man kam, mit `router.replace`; die
Nachbarn lädt `useSong` vor. Das neue Lied gleitet als Web Animation ohne `fill`
herein — ein bleibendes `transform` machte den Kasten zum Bezugsrahmen von
Editor und Vollbild darin.

Ohne Link gibt es keine eigene Version; die Karte sagt „Link eintragen" und
schaltet in „Bearbeiten". Beim Anlegen (Archiv und Termin) sperrt
`useOwnVersionDraft` (`own-version-draft.tsx`) die Karte genauso.

### Eigene Versionen — nur im Gerät

Text und Akkorde hinterlegt jede:r **für sich**. Sie gehören dem, der sie
geschrieben hat, und die App hat kein Recht, sie zu verbreiten — deshalb gibt es
dafür keinen Endpunkt, kein Teilen, kein Vorausfüllen und keine Sicherung.

- **Speicher:** IndexedDB (`lib/own-songs/store.ts`), ohne Bibliothek. Schlüssel
  `[personId, songId]`, Index auf `[personId, hauskreisId]` — zwei Konten auf
  einem Gerät sehen einander nichts. Beim ersten Speichern einmal
  `navigator.storage.persist()`. Ohne IndexedDB (manches private Fenster) eine
  Meldung statt eines Absturzes.
- **Abfrage:** `use-own-songs.ts`, **eine** TanStack-Abfrage für alle Versionen
  — viele Zeilen fragen gleichzeitig „hat dieses Lied eine?", und ein Lesevorgang
  beantwortet alle. `networkMode: 'always'`, sonst hielte TanStack sie ohne Netz
  an; `staleTime: Infinity`, denn ändern kann sie nur dieses Gerät, und das
  schreibt den Zwischenspeicher selbst. Titel und Interpret liegen als
  Schnappschuss daneben, für „Meine Lieder" ohne Netz; die Liedseite zieht sie
  nach.
- **Format:** ChordPro (`lib/chords/chordpro.ts`). „Akkorde über Text" hängt die
  Stelle eines Akkords an Leerzeichen und kann zwei enge Akkorde gar nicht
  hinschreiben. Die Zusage ist die **Rundreise** `parseSheet(toChordPro(s))`.
- **Erkennen** (`lib/chords/parse.ts`): beide Formate ohne Auswahl; geschützte
  Leerzeichen, Tabulatoren und `[ch]`-Marken werden weggeräumt, „Capo 2" und
  „Key: A" werden Angaben, „Page 1/3" verschwindet. Ein Abschnitt in Klammern
  bleibt einer, auch mit etwas dahinter („[Chorus]:", „[Intro] G D",
  `bracketOf`); `chordsOf` liefert nur Akkorde, die `parseChord` versteht —
  in ChordPro ist sonst alles in eckigen Klammern einer. Eine Akkordzeile braucht
  70 % Akkorde, sodass „Am I worthy" Text bleibt. Ein H macht das Blatt deutsch (B = Bb). Die Tonart
  (`key.ts`) zählt Stufen über alle zwölf Dur-Tonarten, Anfang und Ende doppelt.
- **Anzeige** (`chord-sheet-view.tsx`, `ChordLyricLine`): jede Zeile in
  Segmente „Akkord über Textstück" zerlegt (`layout.ts`), damit sie auf dem
  Telefon samt Akkorden umbricht; Segmente eines Wortes bleiben zusammen. Die
  Akkorde stehen **absolut** über ihrem Stück und haben keine Breite — sonst
  riss ein Akkord, der breiter ist als seine Silbe, eine Lücke in den Text.
  `useChordSpacing` misst danach je Zeile und rückt per `translate` auseinander,
  was sich berühren würde (bei jedem Rendern und über `ResizeObserver`). Das
  letzte Segment einer Zeile behält seine Akkorde im Fluss, damit sie nicht aus
  der Karte ragen; ein leeres Stück trägt `\u200b`, sonst stünde ein Akkord
  hinter dem letzten Wort auf Texthöhe.

Der Kern in `lib/chords` hat keine React- und keine `@/`-Importe. Es gibt im
Frontend keine Test-Infrastruktur; geprüft wurde er, indem er mit `tsc` als
CommonJS übersetzt und mit Beispielen gefüttert wurde (eine Kopie von Ultimate
Guitar, ChordPro, H-Notation, Rundreise, Transponieren, Bearbeiten).

### Der Editor

`features/songs/own-version-editor.tsx`, nach dem Entwurf: Liedtext öffnen,
einfügen, Vorschau mit „Akkorde erkannt" und der Tonart. Nach dem Einfügen
klappt das Feld ein („Quelltext"), und die Vorschau steht oben. Gespeichert wird
oben rechts, denn unten steht dauerhaft eine Leiste (`editor-toolbars.tsx`) —
am Rechner (`lg`) als Seitenleiste rechts, mit umbrochenen Akkorden und Suche
und Knöpfen oben (`order`).

- **Der Text ist die einzige Quelle.** Die Vorschau ist `parseSheet` davon;
  eine Änderung in der Vorschau läuft über die reinen Funktionen in `edit.ts`
  und schreibt `toChordPro` zurück. „Rückgängig" ist ein Stapel alter Stände.
- **Das Format ist Zustand** (`{ text, format }`): Was aus der Vorschau kommt,
  ist `chordpro`; Einfügen und Tippen ins leere Feld setzen `auto`. Würde
  geraten, läse sich ein Blatt ohne Akkorde nach der ersten Änderung als
  „Akkorde über Text". Bei `chordpro` zieht
  `tidy` Leerzeilen nicht zusammen — selbst gesetzte bleiben.
- **Zwei Leisten, je nach Ansicht.** Unter „Akkorde" (`ChordToolbar`): die
  Akkorde des Lieds und der Tonart, eine Suche (`searchChords`), und ein Tipp
  schaltet den Setzen-Modus ein (`armed`) — Rahmen um die Vorschau, Banner,
  jeder Tipp auf Text setzt. Ist ein Akkord im Text angetippt, benennt die
  Leiste ihn um, schiebt ihn oder entfernt ihn. Unter „Text" (`LineToolbar`):
  Zeile ändern (`setLineText` — die Akkorde wandern mit), löschen, Leerzeile
  oder neue Zeile darunter.
- **Ziehen:** Pointer-Events mit Capture am Chip (`touch-none`), ab sechs Pixeln
  ist es ein Zug. Ein Klon folgt dem Finger (bei Touch 28 px darüber, sonst
  verdeckt ihn der Finger), ein Strich zeigt das Ziel. Getroffen wird über
  `caretPositionFromPoint`/`caretRangeFromPoint` in der Textreihe unter dem
  Klon; die Textstücke tragen `data-start`, die Zeilen `data-line`. In einer
  reinen Akkordzeile zählt der Platz in der Reihe. Während des Ziehens steht das
  Layout still; übernommen wird beim Loslassen, am alten Platz gar nicht.
- **Tippen** auf Text setzt nur im Setzen-Modus einen Akkord, sonst nimmt es die
  Auswahl zurück; mit der Maus zeigt der Strich schon beim Überfahren, wo er
  landet. Ein Tipp auf einen Akkord wählt ihn für die Leiste.
- **Eine Ebene im Baum, kein Portal**: `fixed inset-0 z-50`. `ConfirmProvider`
  rendert seine Rückfrage hinter allen Kindern; ein Portal ans Ende von `body`
  läge über ihr. Aus einem Anlege-Sheet heraus (Archiv und Termin) schließt das
  Sheet, solange der Editor offen ist (`open && !editing`) — zwei Ebenen auf
  Escape schlössen einander.

### Das Vollbild

`features/songs/sheet-fullscreen.tsx`. **Oben** eine Karte „Akkorde" mit allen
Akkorden des Lieds als Griffbild (`ChordStrip` in `chord-panels.tsx`, auf dem
Telefon seitwärts zu scrollen), dazu Text/Akkorde, Transponieren (`transposer`
in `key.ts` — die Vorzeichen richten sich nach der Ziel-Tonart) und „Anpassen"
(Gitarre oder Klavier). Sie scrollt mit weg. **Unten** nur Schrift („Aa" klappt
die Größe auf) und Autoscroll mit Tempo. Der Autoscroll ist eine
`requestAnimationFrame`-Schleife, die Bruchteile von Pixeln aufspart;
`touchstart` hält ihn an. Wo es sie gibt: `requestFullscreen` und
`navigator.wakeLock` (bei `visibilitychange` neu angefordert).

**Ein Tipp auf einen Akkord** — oben oder im Text (`ChordSheetView` mit
`onChord`) — öffnet ihn im Detail, mit allen Varianten zum Durchblättern. Detail
und Anpassen sind Flächen **in** der Ebene des Vollbilds (`Panel`) und keine
Sheets: Zwei Ebenen, die beide auf Escape hören, schlössen einander; das
Vollbild fragt selbst, ob eine offen ist. Die gewählte Variante gilt für jede
Stelle mit genau diesem Akkord und steht an der eigenen Version
(`voicings: Record<"guitar:C", number>`), wie Transposition und Tempo;
Schriftgröße und Instrument stehen in `localStorage`.

**Die Griffe sind gerechnet** (`lib/chords/voicing.ts`):

- `chordTones` liest aus dem Namen die nötigen und die verzichtbaren Intervalle
  (Terz, Quinte, Septime, `sus`, `add`, Optionen, Alterationen, Powerchord,
  Slash-Bass). Unbekanntes fällt auf den Dreiklang zurück.
- `guitarVoicings` sucht in Vier-Bund-Fenstern vom offenen Akkord bis zum
  zwölften Bund: je Saite stumm, leer (nur unten am Hals) oder ein Bund, der
  einen Akkordton trifft. Gültig ist, was alle nötigen Töne hat, den Grundton
  bzw. Slash-Bass unten, stumme Saiten nur als Block von unten (plus höchstens
  die oberste) und höchstens vier Finger — sonst ein Barré auf dem tiefsten Bund
  über alle Saiten dazwischen. Leere Saiten nur, solange kein Bund über dem
  dritten liegt und der Bass nicht im ersten (sonst entstehen gültige Formen wie
  x10331 für Bb, die niemand spielt).
- Die **Wertung** (niedriger ist besser): Lage am Hals, stumme Saiten (die
  oberste extra), leere Saiten als Bonus, Barré, Finger, Spreizung, fehlende
  verzichtbare Töne, eine Sekunde ganz unten, klingende Saiten als Bonus. Geprüft
  im Prüfskript gegen die Liederbuchformen (C x32010, G 320003, D xx0232, F
  133211, Bm x24432, G/B x20003, Cadd9 x32030, Bb x13331 …).
- `pianoVoicings`: Grundstellung und Umkehrungen; Optionen liegen eine Oktave
  über dem Kern, ein Slash-Bass eine Oktave unter dem Akkord.

`chord-diagram.tsx` zeichnet beides als SVG aus den Farb-Tokens, damit das dunkle
Thema ohne Sonderfall mitgeht.

## Notizen

Ein eigenes Register im Archiv (`?register=notizen`, `features/notes/`), hinter
„Orte"; das „+" unten rechts öffnet `NewNoteSheet` (Titel und „Nur
ich | Ganze Gruppe | Auswählen"), danach geht es auf `/notiz?id=…&neu=1`
direkt ins Schreiben. `&neu=1` wird nach dem Öffnen aus der Adresse genommen,
damit ein Neuladen nicht wieder dorthin springt.

**Text:** `lib/notes/markdown.ts`, rein und ohne `@/`, geprüft im Skript wie die
Akkorde. `parseNote` liest Zeile für Zeile — jede Zeile bleibt eine Zeile, anders
als `prose.tsx` für die Rechtstexte —, `parseInline` fett, Links (nur
`http(s)`) und nackte Adressen. `applyFormat` und `continueList` stehen hinter
den Knöpfen und der Enter-Taste im `NoteEditor`; die Knöpfe nehmen dem Feld
den Fokus nicht (`preventDefault` beim Herunterdrücken), sonst ginge auf dem
Telefon die Tastatur zu. `NoteBody` zeichnet die Blöcke; ein Checklistenpunkt
ist ein `div role="checkbox"`, weil darin ein Link stehen darf.

**Abhaken** (`useCheckNote`) greift im Einzelstand vor und schreibt danach die
Antwort samt ETag in den Cache (`apiPostWithPrecondition` mit `UNCONDITIONAL`).
**Schreiben** (`useUpdateNote`) merkt sich den Stand beim Öffnen (`base`) und
schickt nur, was sich dagegen geändert hat. Bei 412 bleibt der Entwurf; der
Hinweis bietet „Meine Fassung speichern" (`resolveConflict`, dann noch einmal)
und „Ihre übernehmen".

**Leute** (`NotePeopleSheet`) nutzen `PeopleListEditor` aus
`components/domain/` — dieselbe Liste wie die Vorbereiter einer Einheit, mit
„×", „Person hinzufügen" und einem Grund, wo jemand bleiben muss.

## Die Leiste unten gibt es nur auf den Tabs

`isTabRoute` in `nav.tsx` beantwortet „ist das einer der fünf Tabs" einmal, für
die Kopfleiste (`useHasSmartHeader`) und für die Leiste unten
(`app-shell.tsx`). Auf einer Unterseite steht an ihrer Stelle nur ein Kasten mit
`pb-safe`, damit das Seitenende nicht unter dem Home-Balken liegt; Termin, Lied,
Thema und Einheit stellen über `BottomSlot` ihre eigenen Balken hinein.

**Thema und Einheit** haben unten `EditBar`, nur für die, die schreiben dürfen
(`mayEdit`). Auf der Themenseite schaltet er den Bearbeitungsmodus; Titel,
Zusammenfassung und Status liegen darin hinter „Bearbeiten" oben rechts in
`TopicEditSheet`, geschickt wird nur, was sich geändert hat. „Einheit
hinzufügen" (`AddSessionSheet`, ein Sheet mit Schritten) legt neu an oder holt
eine eigene einzelne Einheit herein (`useAdoptableSessions`, `useAdoptSession`);
ohne Einheit steht der Knopf auch außerhalb des Modus. Die Einheit hat keinen
Modus mehr: `EditBar editing={false}` öffnet `SessionEditSheet` mit Text, den
Leuten (eine Liste mit „×" und „Person hinzufügen", das die übrigen im selben
Sheet aufklappt), Überthema entfernen und Löschen — gespeichert mit
`mutateAsync` erst der Text (If-Match), dann die Crew. Bei einer einzelnen
Einheit fragt es dort auch nach dem Überthema (`onName` schließt es und öffnet
`NameTopicSheet`, nach Rückfrage, wenn etwas ungespeichert ist). Oben rechts steht, wozu
die Einheit gehört (`TopicLink`, „Teil von · 1 von 3"), auf der Themenseite an
derselben Stelle der Stand; eine weitere Einheit legt nur die Themenseite an.

## Tastatur und Seitenspalte

**Solange getippt wird, ist die Tab-Leiste weg** — auf Touch-Geräten
(`lib/use-keyboard-open.ts`). Liegt ein Feld weiter unten, schiebt iOS den
Ausschnitt an den Seitenfuß, und dann stand die Leiste direkt über der Tastatur.
Eine Frage „ist die Tastatur offen" kennt das Web nicht; die Antwort ist der
Fokus eines Textfelds und, sobald einmal eine Tastatur zu sehen war, der
geschrumpfte `visualViewport` — für Android, wo die Zurück-Taste die Tastatur
schließt und den Fokus lässt. Die Leiste wird nach unten verschoben (`inert`,
`translate-y-full`), nicht entfernt: Sie klebt im Fluss, und `hidden` kürzte
das Dokument um ihre Höhe. Der Antwort-Balken im `BottomSlot` bleibt stehen —
in ihm steht das Feld selbst.

**Am Rechner bleibt die Seitenspalte stehen** (`md:sticky md:top-0 md:h-dvh`).
Sie war ein gewöhnliches Kind der Zeile, so hoch wie die Seite, und scrollte mit
dem Inhalt aus dem Bild.

## Was das Frontend bewusst nicht tut

- **Kein SSR für Daten.** Das Token lebt im Browser; serverseitiges Vorladen
  hieße, es dorthin zu reichen. Next dient als Anwendungsgerüst und Router.
- **Keine Hauskreis-Id in der URL.** In der Praxis gibt es eine Gruppe, und
  Adressen mit UUID darin sind für die, die sie sich schicken, unlesbar.
- **Kein Dunkelmodus.** Die Anmutung des Entwurfs ist durchweg warm und hell;
  eine halbherzige zweite Palette hätte sie nur beschädigt.
