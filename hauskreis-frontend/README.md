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
man ihn antippt, nicht wenn der Server antwortet. Vorher wartete jede Änderung
die Runde zum Server ab — auf einem Handy im Zug mehrere Sekunden, in denen sich
der Knopf anfühlt wie kaputt.

`lib/api/hooks/use-optimistic.ts` ist dafür ein Baustein, kein Rahmenwerk:
`patch` setzt einen Cache-Eintrag vorläufig und merkt sich den vorherigen Stand;
geht der Aufruf schief, dreht `rollback` alles zurück. `useApiMutation` nimmt es
über die Option `optimistic` entgegen.

Vorgreifend sind die vier Tipp-Schalter: Anwesenheit (zwei Caches — Termin-Detail
**und** Home, wo dieselbe Antwort als „Bist du dabei?" steht), der
Actionstep-Haken, die Lied-Auswahl und die Benachrichtigungs-Einstellungen.
**Nicht** vorgreifend sind Anlegen, Löschen und alles mit ETag: ein optimistisch
angelegter Termin ohne Id ist mehr Buchhaltung als Nutzen, und bei
ETag-Schreibvorgängen ist die Serverantwort die Quelle des nächsten ETags.

Zwei Dinge gehören zwingend dazu:

- **Fehler melden sich von selbst.** `useApiMutation` und `useResourceUpdate`
  zeigen bei einem Fehlschlag einen Toast. Vorher hing das an jeder Aufrufstelle
  einzeln, und zwei hatten es vergessen — dort blieb ein misslungener Tipper
  stumm. Ein Rückfall ohne Erklärung sähe aus wie ein Geist. `silent: true` ist
  für die Fälle, in denen der Aufrufer etwas Besseres anzuzeigen hat; ein `412`
  bleibt dem `ConflictBanner` vorbehalten.
- **Wer vorgreift, sperrt nicht.** `disabled={…isPending}` an einem vorgreifenden
  Schalter ist genau verkehrt herum: die Anzeige stimmt schon, aber der Knopf
  wäre noch eine Sekunde tot und ein Fehlgriff nicht sofort zurückzunehmen.

### Dein Hauskreis

Ein Mensch gehört zu genau einem Hauskreis; ein Wechsel ist ein Umzug. Damit ist
`hauskreis-context.tsx` fast leer geworden: die Id kommt aus `me.hauskreisId`,
und mehr braucht es nicht. Vorher stand dort eine Auswahl aus
`GET /api/hauskreise` mit `available[0]` als Vorgabe — die Route gab damals
_alle_ Gruppen heraus, und die Wahl merkte sich der `localStorage` bis in die
nächste Sitzung und damit ins nächste Konto. Beides ist weg.

**„Kein Hauskreis" ist kein Fehler, sondern der Anfang.** Der Fall endete
bisher in einer roten Meldung („Zu deinem Konto gehört noch kein Hauskreis.") —
zutreffend und nutzlos. `features/onboarding/no-hauskreis-screen.tsx` bietet
stattdessen die zwei Wege an, die es gibt: einen eigenen gründen (man wird dort
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
Termin-Konfiguration — derselben, in der der Server rechnet. Vorher war es die
Gerätezone, und wer aus dem Urlaub hereinschaute, sah einen Abend als begonnen,
den der Server noch nicht freigegeben hatte.

Die Zone steht als **Modulvariable** in `lib/date.ts` (`setGroupZone`), nicht in
einem Kontext: `today()` und `isPast(day)` werden an über zwanzig Stellen mitten
im Rendern aufgerufen, und ein Hook daraus zu machen hieße, jede davon
anzufassen. Dasselbe Muster wie `handleUnauthorized` in `api/client.ts`.

Gesetzt wird sie in `AuthGate`, zusammen mit `useMe` und dem Hauskreis — und die
App wartet darauf. Eine Sekunde Warten ist besser als eine Terminliste, die
gleich danach umspringt.

`parseDay`/`toDay` bleiben absichtlich gerätelokal: `addDays`, `daysBetween` und
`startOfWeek` sind symmetrisch und rechnen dadurch in jeder Zone richtig.

### Leere Felder

Ein Termin ohne Host ist ein Treffen im Schlosspark. Ein Thema ohne Titel ist
eines, für das noch niemand einen festgelegt hat. Ein Lobpreisabend hat gar kein
Thema. Solche Zustände bekommen ihren eigenen Text — nicht `—` und nicht die
Fehlerdarstellung.

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
oben rechts öffnet `header-image-sheet.tsx` — ein Sheet und nicht direkt der
Dateidialog, weil es zwei Sachen sind: auswählen und wieder wegnehmen. Dass es
für alle gilt, steht als Untertitel dabei.

Geladen wird wie ein Profilbild (`useHeaderImage`): eine Liste der Zeitstempel,
und der Zeitstempel wandert in den Schlüssel der Datei-Abfrage. Ein neues Bild
ist damit ein neuer Schlüssel, und der alte Eintrag verfällt von selbst.

## Der Startbildschirm

Ein Aufruf (`…/home`), vier Blöcke. Zwei Entscheidungen darin sind es wert,
aufgeschrieben zu werden.

**Die Begrüßung wechselt.** „Hallo Niko! Schön, dass du da bist." stand dort
jeden Tag, und einen Satz, den man jeden Tag liest, liest man irgendwann nicht
mehr. `features/home/greeting.ts` hält eine Handvoll — hochdeutsch,
österreichisch, schwäbisch, fränkisch —, jede in drei Tageszeiten.

Welche es ist, kommt aus `hash(tag + personId)`, nicht aus `Math.random`: sie
soll pro Tag feststehen und nicht bei jeder Query-Aktualisierung unter dem
Daumen wegspringen. Die Personen-Id geht mit ein, damit nicht alle neun am
selben Tag denselben Satz lesen. Tag und Uhrzeit kommen aus `groupNow()` —
dieselbe Uhr wie überall.

**„Deine Rollen" ist eine Karte mit zwei Stufen, nicht acht Wochen am Stück.**

|                          |                                                              |
| ------------------------ | ------------------------------------------------------------ |
| **oben, immer sichtbar** | alle eigenen Rollen am nächsten Abend                        |
| **„Weitere (n)", zu**    | je Kategorie (Host, Thema, Musik) nur die **nächste** danach |

Eine Karte, nicht zwei: die zweite Stufe klappt in derselben aus, unter einem
grauen Balken mit der Zahl. Vorher standen beide Gruppen als eigene Listen
untereinander, jede Zeile mit eigenem Rahmen — zwei Blöcke, die gleich aussehen
und verschieden dringend sind. Was zählt, ist der nächste Dienstag; der Rest ist
zum Nachsehen da, nicht zum Lesen.

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
ist. „Bist du dabei?" bleibt unverändert und gilt weiterhin nur für genau
diesen einen Abend.

## Die Termin-Detailseite

Zwei Regeln prägen den Aufbau, beide inhaltlich und nicht kosmetisch.

**Ganz oben steht die Uhrzeit.** Die erste Frage an einen Termin ist „wann", und
sie war bisher nur halb beantwortet: es gab ein Datum und keine Uhrzeit, „wir
fangen heute später an" lief über WhatsApp. Jetzt trägt jeder Abend eine
(`meeting.startTime`, `"19:30"`), geändert wird sie im Bearbeitungsmodus.

Das Eingabefeld hat einen eigenen Zustand und einen „Übernehmen"-Knopf, statt
bei jedem Tastendruck zu speichern: `<input type="time">` liefert zwischendurch
leere und halbe Werte, und jeder davon wäre ein `PATCH` samt Benachrichtigung an
die Gruppe. Leeren lässt sich das Feld nicht — ein Abend ohne Uhrzeit ist kein
Zustand, den es geben soll.

Die Zeit steht **nur hier**, nicht auf den Terminkarten, im Kalender oder in der
Planungstabelle: bei wöchentlich gleicher Zeit stünde dieselbe Zahl fünfzehnmal
untereinander. Die Vorgabe für neue Abende kommt aus `…/meetings/config` und
lässt sich in der Verwaltung zusammen mit dem Wochentag umstellen; das
Anlege-Formular belegt sein Feld damit vor, damit niemand jede Woche dasselbe
tippt.

**Ort und Gastgeber sind eine Entscheidung** — und haben deshalb **ein**
Bedienelement: [`VenueSheet`](src/components/domain/venue-sheet.tsx), mit zwei
Registern. Die Ort-Zeile auf der Seite ist reine Anzeige.

| Register        | Was drinsteht                                      | Was geschickt wird                                              |
| --------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| **Zuhause**     | der `AssignmentPicker` mit dem Host-Ranking        | `{ hostPersonId }` — den Ort setzt der Server aus ihrer Wohnung |
| **Treffpunkte** | Orte mit `isSelectableWithoutHost`, plus „anlegen" | `{ hostPersonId: null, locationId }` — **beides**, sonst 400    |
| darunter        | „Noch offen"                                       | `{ hostPersonId: null, locationId: null }`                      |

Vorher waren es zwei Stellen: ein Auswahlfeld für den Treffpunkt und daneben das
Personen-Sheet. Die Kopplung konnte sich dann nur als Fehlermeldung äußern
(„nimm erst den Gastgeber heraus, dann lässt sich ein Treffpunkt wählen"). Jetzt
schickt jede Wahl beide Felder auf einmal, und die Regel ist das Register, in
dem man steht. Durchgesetzt wird sie weiterhin im Backend (`resolveVenue`).

Ein Zuhause taucht unter „Treffpunkte" nie auf: es kommt über seine
Bewohner:innen an den Termin, nie über eine Liste. „Treffpunkt anlegen" ist ein
**Schritt im selben Sheet**, kein zweites — aus demselben Grund wie beim
Wahl-Sheet. Der Formularrumpf dafür ist als
[`useLocationForm`](src/components/domain/location-form.tsx) herausgelöst, wie
`AssignmentPicker` aus `AssignmentSheet`.

**Ein vergangener Abend ist ein eigener Zustand**, kein ausgegrauter kommender:

|                 |                                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| Rolle eintragen | nur nach Rückfrage, und ohne Vorschläge (`withoutSuggestions`)                |
| Lieder          | unveränderlich — sonst verrutschen `timesPlayed` und `lastPlayedAt` im Archiv |
| Absage          | heißt „als abgesagt markieren" und verschickt nichts                          |

Dazu drei kleinere Umbauten:

- **Der Titel sitzt am Überschriftstext**, nicht in einem Feld weiter unten.
  Angezeigt wird die fertige Überschrift (eigener Titel, sonst der Titel des
  Abends im Thema, sonst der des Themas, sonst die Terminart); bearbeitet wird
  aber nur `meeting.title`. Würde der Entwurf mit der Überschrift starten,
  machte das erste Speichern aus dem geerbten Themen-Titel einen eigenen — und
  der Termin löste sich still vom Thema ab. Für alle, die den Inhalt noch nicht
  sehen dürfen, steht dort die Terminart, und das ist genau richtig: zu sehen
  gibt es noch nichts.
- **Der Info-Text steht oben.** Dort steht, was man _vor_ dem Abend wissen muss;
  unten zwischen Zusammenfassung und Actionstep las es niemand rechtzeitig.
- **„Wer kommt" zeigt, wer kommt.** Vorher ließ sich für jede Person
  durchtippen, was wie eine Anwesenheitskontrolle aussah und mit einem Fehlgriff
  wildfremd absagte; danach standen alle neun Kacheln gleich groß nebeneinander,
  Zusagen, Absagen und Schweigen. Das beantwortet die Frage nicht, die man an
  die Karte hat — „mit wie vielen rechne ich?". Jetzt zeigt das Raster die
  Zusagen, Absagen und Unbeantwortete stehen als aufklappbare Zeile darunter.
  Der Nenner zählt nur noch **aktive** Personen.
  Die eigene Antwort ist eine eigene Zeile ganz unten und der einzige Weg, für
  einen einzelnen Abend abzusagen: „Bist du dabei?" auf dem Startbildschirm gilt
  nur fürs nächste Treffen, und Abwesenheiten im Profil decken Zeiträume ab.

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

**Der dritte Zustand ist der Punkt.** Vorher gab es ihn nicht: eine Zuteilung
legte sofort ein leeres Thema an, und der Abend sah aus, als stünde schon etwas
fest. Jetzt sind es zwei Schritte — `PUT …/topic-responsibles` sagt „du bist
dran", `POST …/topic-session` sagt „und zwar damit".

Den Knopf sieht **nur, wer an dem Abend zugeteilt ist** — auch kein Admin. Die
Wahl ist kein Verwaltungsakt, sondern die Aussage „ich bereite das vor". Steht
schon etwas, heißt er „Anderes Thema wählen" und fragt vorher nach: die bisherige
Einheit löst sich vom Abend und wartet als Entwurf.

**Die Hierarchie ist der Aufbau.** Oben das Thema, als Überschrift und als Link
auf seine Seite; darunter, in einem eigenen Rahmen mit „Einheit 2 von 2", dieser
eine Abend mit Titel, Zusammenfassung und Actionstep. Vorher standen beide Titel
gleichrangig, und man musste raten, welcher der größere war. Titel und
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
Unmount: wer zu den Mitwirkenden abbog und zurückkam, fand sein Formular vorher
leer vor. Ein `key` hilft dagegen nicht, es gibt keine gemeinsame Position, an
der die Felder gemountet bleiben könnten.

### Warum `Sheet` seinen Fokus nur beim Öffnen setzt

Ein Fehler, der wie ein Tastatur-Problem aussah: in „Treffpunkt anlegen" und
„Lied anlegen" sprang der Fokus nach **jedem getippten Buchstaben** aus dem
Feld. Ursache war der Effekt in `sheet.tsx`, der `onClose` in den Abhängigkeiten
hatte **und** `panel.focus()` rief. Die meisten Aufrufer übergeben dort einen
frischen Pfeil — ein `close`, das erst Felder leert und dann schließt, entsteht
bei jedem Render neu —, also lief der Effekt bei jedem Tastendruck erneut.

`onClose` liegt jetzt in einer Ref, der Effekt hängt nur noch an `[open]`. Zwölf
Aufrufstellen mit `useCallback` zu reparieren wäre zwölfmal derselbe Fehler
gewesen, und der dreizehnte hätte es vergessen.

**Sichtbarkeit und Bearbeitbarkeit sind zwei Fragen** — und beide beantwortet
inzwischen der **Server**, nicht das Frontend:

|              | vor Beginn des Abends | danach                 |
| ------------ | --------------------- | ---------------------- |
| Zuständige   | sehen und schreiben   | sehen und schreiben    |
| alle anderen | sehen **nichts**      | sehen, schreiben nicht |

„Beginn des Abends" ist die Uhrzeit **dieses** Termins (`meeting.startTime`),
nicht mehr pauschal 18 Uhr: eine Gruppe, die sich um 20 Uhr trifft, gab ihren
Actionstep sonst zwei Stunden vorher frei.

Die Karte liest dafür zwei Felder aus der Antwort: `contentVisible` (sind die
Textfelder gefüllt oder zurückgehalten?) und `mayEdit` (darf ich schreiben?).
Beide vom Server, damit die Regel nicht ein zweites Mal aufgeschrieben wird —
und nicht anders ausgelegt. Ist `contentVisible` falsch, kommen Titel,
Actionstep und Zusammenfassung als `null` an; sie im Frontend auszublenden hieße,
sie trotzdem über die Leitung zu schicken.

Das Verstecken davor ist kein Datenschutz, sondern der Sinn der Sache: ein
Actionstep, den alle eine Woche vorher lesen, ist keiner mehr. Umgekehrt sollen
die Zuständigen vorbereiten dürfen — vorher verbot der Server das Schreiben bis
zum Termintag, und zwar genau der Person, die es am ehesten brauchte.

### Lesen ist der Normalfall

Termin-Detail und Themenseite haben unten einen **„Bearbeiten"**-Schalter. Erst
danach erscheinen die Stifte an den Texten, die Bausteine und die Löschsymbole.
Vorher bot jedes Feld dauerhaft eine Bearbeitung an — auf einer Seite, die man
zehnmal öffnet, um etwas zu wissen, und einmal, um etwas zu ändern.

**Die Rollen-Zuteilung liegt außerhalb.** Ihre Stifte stehen immer da. Sie ist
der Grund, aus dem man diese Seite überhaupt aufmacht — „wer hostet nächste
Woche" trägt man im Vorbeigehen ein, nicht nach dem Umlegen eines Schalters.
Versehentlich passieren kann dabei nichts: jede Zuteilung geht über ein Sheet,
in dem man ausdrücklich bestätigt. Gesperrt ist sie nur an einem abgesagten
Abend, an dem es nichts einzuteilen gibt. Ein Thema zu **wählen** bleibt dagegen
im Bearbeitungsmodus — das ist Inhalt, keine Zuteilung.

Es gibt bewusst **kein „Speichern"**: jede Änderung geht sofort raus, der
Schalter entscheidet nur, ob sie überhaupt angeboten wird. Ein Sammel-Speichern
hieße, einen zweiten Zustand zu führen, der mit dem Server auseinanderläuft, und
den Verlust bei einem versehentlichen Zurück in Kauf zu nehmen.

Anwesenheit und Actionstep-Haken bleiben ebenfalls immer bedienbar — das ist
Teilnahme, keine Bearbeitung. Absagen und Löschen stehen dauerhaft ganz unten:
sie sind keine Bearbeitung, sondern eine Entscheidung über den Abend als Ganzes.

Umgesetzt ist es ohne neue Mechanik: `InlineEdit` und `RoleRow` blenden ihre
Bedienelemente schon von selbst aus, wenn der Handler fehlt. Der Schalter setzt
also nur `editing && berechtigt ? handler : undefined`.

`InlineEdit` hat dafür ein optionales `onSave` bekommen: fehlt es, gibt es
keinen Stift. Ihn zu zeigen und dann mit `403` zu antworten wäre eine Einladung
ins Leere.

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

Vergangene Abende sind fürs Abhaken damit wieder bedienbar, obwohl sie sonst
gesperrt bleiben. Das ist Absicht: wer am nächsten Tag nachträgt, was
tatsächlich dran war, tut der Liederdatenbank einen Gefallen.

„Danach" heißt dabei **am nächsten Tag der Gruppe**, nicht ab der
Treffpunktzeit — `isPast(day)`, dieselbe Rechnung wie das „Vorbei"-Abzeichen
daneben. Dass die beiden auseinanderliefen, war der Fehler: die App rechnete in
der Gerätezone, der Server in UTC, und um halb eins nachts zeigte sie die
Kästchen frei, während er mit `403` antwortete. Beide rechnen jetzt in der Zone
der Gruppe.

### Die Nachbereitung entsteht am Abend, nicht davor

Zusammenfassung und Actionstep eines Abends **ohne** Thema hängen am Baustein
`hasNotesSlot` — dem einzigen, der nicht im Bausteinkasten steht. Dort hätte man
ihn _vor_ dem Abend angehakt, also als es noch nichts nachzubereiten gab.

Stattdessen ein Ablauf in drei Zuständen, und keiner davon zeigt ein leeres Feld:

| Was dasteht   | Wann                                                 |
| ------------- | ---------------------------------------------------- |
| nichts        | vor der Treffpunktzeit, oder der Abend hat ein Thema |
| `NotesPrompt` | ab Terminbeginn, solange nichts geschrieben ist      |
| `NotesCard`   | sobald etwas drinsteht — oder im Bearbeitungsmodus   |

Der Hinweis schaltet den Baustein an **und** den Bearbeitungsmodus: er ist die
Aufforderung, etwas zu schreiben, und eine Karte ohne Eingabemöglichkeit wäre
die falsche Antwort darauf. Innerhalb der Karte ist jedes der beiden Stücke
einzeln: ein Knopf legt das fehlende an und öffnet gleich das Feld (`startOpen`
an `InlineEdit`), bleibt es leer, nimmt `onDiscard` es wieder weg. So gibt es
kein Feld ohne Inhalt — und manchmal gibt es eben nur einen Vorsatz und nichts
zusammenzufassen.

Wegnehmen geht im Bearbeitungsmodus über „Nachbereitung entfernen", mit derselben
Rückfrage wie bei den anderen Bausteinen: gelöscht werden beide Texte und die
Haken darunter. Danach steht wieder der Hinweis da, als wäre nichts gewesen.

### Absagen: die eigene und die des ganzen Abends

Das waren bis eben zwei Dinge an einer Stelle. Unter „Wer kommt" sagte man für
sich ab — und direkt darunter stand ein roter Knopf, der **für alle** absagte,
sichtbar für jedes Mitglied und ohne Rückfrage.

Jetzt ist der Knopf Admin-Sache (`ADMIN_ONLY_ROUTES` in `lib/auth/roles.ts`,
durchgesetzt vom Server) und fragt nach einem Grund. Der ist freiwillig, aber
der eigentliche Zweck des Zwischenschritts: ein „fällt aus" ohne Erklärung
erzeugt genau die Rückfragen in WhatsApp, die die App abschaffen soll.

Ein abgesagter Abend sieht dann auch danach aus (`detail/cancellation-card.tsx`):
oben eine `alert`-Karte mit Grund, Person und Zeitpunkt, darunter alles gedämpft
und schreibgeschützt (`locked = past || cancelled`). Vorher blieb davon ein
kleines Abzeichen in der Ecke übrig, während man dem Termin weiter Lieder und
Rollen zuweisen konnte. Für Admins steht in der Karte „Absage zurücknehmen".

**Der Abend, den niemand absagt und der trotzdem ausfällt.** Haben alle aktiven
Personen abgesagt, setzt das Backend den Termin von selbst auf `CANCELLED`;
sagt danach jemand doch zu, lebt er wieder auf. Beides schickt eine
Benachrichtigung. Wer noch nicht geantwortet hat, verhindert die Absage — die
Einzelheiten stehen im Backend-README.

Dafür steht in der „Fällt aus"-Karte ein Knopf **„Ich bin doch dabei"** — für
alle, nicht nur für Admins. Er fehlte, und damit war die Regel unerreichbar: die
Karte versprach „sagt jemand doch zu, findet er wieder statt", aber „Wer kommt"
ist an einem abgesagten Abend schreibgeschützt und die Karten in Liste und
Kalender blenden ihren Schalter aus. Übrig blieb der Admin-Knopf, der den Status
drehte und die eigene Antwort auf „nicht dabei" stehen ließ — genau das, was man
sah. Er nimmt jetzt die selbst gegebenen Absagen mit zurück.

In der Planungstabelle steht ein abgesagter Abend blass da, statt zu
verschwinden: dass er ausfällt, ist die Antwort auf „was ist am 12. Mai" —
seine Zeile wegzulassen wäre keine.

### Lieder: zwei Wege, und der zweite fehlte

Am Termin gab es nur das Eintragen: tippen, warten, aus höchstens acht Treffern
wählen. Wer wissen wollte, was die Gruppe eigentlich singt, musste ins Archiv —
und von dort führte kein Weg zurück an den Abend.

`components/domain/song-picker-sheet.tsx` ist dieselbe Datenbank mit demselben
Suchfeld und denselben drei Sortierungen wie im Archiv, nur mit dem Knopf
daneben. Was schon am Abend hängt, steht mit Haken da und lässt sich nicht
doppeln. Der Knopf steht **vor** dem Eintrag-Formular, weil er meistens der
richtige ist — die Gruppe singt vieles wieder.

Nebenbei: die Suche im Eintrag-Formular feuerte pro Tastendruck ab zwei Zeichen.
Ein `useDeferredValue` bringt sie auf dieselbe Hausregel wie Archiv und
Terminliste.

**Der Songtext-Link gab es schon**, an beiden Stellen — aber als schmales graues
Symbol ohne Beschriftung, das niemand als Link gelesen hat. Jetzt einmal in
`components/domain/lyrics-link.tsx`: mit Wort, in Terracotta wie alles andere
Anklickbare, und mit einer Trefferfläche, die auf einem Telefon getroffen wird.

**Der zweite Druck auf „Link suchen" heißt „Weitere suchen".** Vorher kam
beliebig oft derselbe Zwischenspeicher zurück — wer einen schlechten Vorschlag
bekommen hatte, war damit fertig. Jetzt geht `more: true` mit, die bisherigen
bleiben stehen, und was dazukommt, trägt ein „neu". Die Markierung rechnet
`song-ai-assist.tsx` selbst aus: der Server liefert das Bekannte zuerst, und die
Komponente kennt die vorherige Liste — ein Feld dafür wäre eine Angabe über den
Verlauf _dieser_ Sitzung an einer Stelle, die nichts davon weiß.

Kommt nichts Neues, sagt ein Toast das auch. Sonst sähe der zweite Druck aus,
als hätte er nichts getan.

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
die man an so eine Tabelle stellt. Die dritte Zeile kam dazu, weil ein
Schlosspark-Abend vorher „offen" zeigte: nichts war offen, es war geklärt.
Anklickbar bleibt die Zelle trotzdem — wer doch bei sich einlädt, trägt sich
dort ein, und der Ort zieht mit.

**Ort und Gastgeber öffnen dasselbe Sheet.** Die Host-Spalte führt auf
[`VenueSheet`](src/components/domain/venue-sheet.tsx) mit zwei Registern,
„Zuhause" und „Treffpunkte". Vorher war der Ort aus der Tabelle gar nicht
erreichbar: man konnte jemanden eintragen, aber nicht sagen „wir sind draußen".

## Das Archiv zeigt Themen

Vier Tabs waren es einmal — Termine, Themen, Lieder, Orte. Die ersten beiden
sahen nebeneinander aus wie zwei Sichten auf dasselbe, und das waren sie fast
auch: was man nachschlägt, ist nicht „der 12. Mai", sondern „wann ging es
nochmal um Vergebung". Der Termine-Tab ist deshalb weg.

Vergangene Termine bleiben in der Datenbank und tragen weiter die
Vorschlagslogik — sie haben nur keine eigene Liste mehr. Erreichbar sind sie
über die Terminliste („Vergangene") und den Kalender.

Die Themenliste ist eine **Liste**: Titel, Zusammenfassung, wer daran arbeitet,
wie viele Abende. Die Abende selbst stehen auf der eigenen Seite des Themas
(`/archiv/themen/[id]`) — ein Thema mit fünf Einheiten machte die Liste sonst zu
einer Wand.

Zwei Register, **„Eigene Themen (n)" und „Alle Themen (n)"**, unterstrichen und
nicht als Pillen: darüber steht schon eine Pillen-Leiste (Themen/Lieder/Orte),
und zwei gleich aussehende Leisten übereinander liest man als eine.

„Alle" ist, was **gehalten** wurde: ein Thema erscheint, sobald einer seiner
Abende vorbei ist, und bleibt dann drin — auch für alles, was danach noch
dazukommt. „Eigene" (`scope=mine`) nimmt zusätzlich die dazu, die noch vor sich
haben, gehalten zu werden; die Zahl daneben ist deshalb **keine** Teilmenge der
anderen. Sie kommt aus `…/archive` und nicht aus einer zweiten Listenabfrage.

Die Pille darüber zeigt `totals.topicsTotal`, die **Vereinigung** beider
Register. Vorher stand dort `topics`, also die Zahl des einen — über „Eigene
(1)" prangte dann „Themen (0)", weil ein selbst angelegter Entwurf noch keinen
Abend hatte. Die Summe wäre auch falsch: ein eigenes, gehaltenes Thema steht in
beiden Registern.

Darunter ein **„Neues Thema"**-Knopf — Titel und optional der Bogen darüber,
danach landet man direkt auf der Themenseite und legt dort die Einheiten an.
Vorher entstand ein Thema ausschließlich beim Wählen an einem Abend; wer eines
vorbereiten wollte, musste erst auf einen Dienstag warten. Der Lieder-Tab hat
denselben Knopf an derselben Stelle, statt eines Plus-Symbols am Rand, das man
suchen musste.

Auf der Themenseite stehen drei Blöcke untereinander: gehaltene Abende, was noch
bevorsteht, und — nur für Owner und Mitarbeitende — die **Entwürfe** ohne Termin.
Die liefert der Server für alle anderen gar nicht erst aus; das ist keine
Ausblendung im UI, sondern eine Entscheidung eine Ebene tiefer.

Jede Abend-Zeile trägt einen **Link auf ihren Abend** — und lässt sich seit dem
Bearbeiten-Modus auch hier ändern und löschen. Der frühere Einwand („ein
zweiter Bearbeitungsweg wäre eine zweite Stelle, an der dieselbe Regel stimmen
muss") ist damit erledigt: das Recht kommt vom Server über `session.mayEdit`,
es gibt keine zweite Regel. Gelöscht wird nur, was noch nicht war.

Umbenennen, Zusammenfassung, Status und Löschen liegen auf der Themenseite. Ob
die Knöpfe überhaupt erscheinen, sagen `mayEdit` und `mayDelete` aus der
Antwort — das Frontend rechnet die Regel nicht nach. `useEditTopicSession` liest
den ETag einer Einheit beim Schreiben selbst: sie steht im Termin-DTO und nicht
als eigene Ressource, ihr ETag liegt also nirgends im Cache. Dasselbe Muster wie
`useSetHostWeight`.

**Die Knöpfe eines Lieds erscheinen erst nach langem Druck.** Stift und
Papierkorb standen an jeder Zeile dauerhaft da — zwei Ziele in einer Liste,
durch die man scrollt, und beide traf der Daumen zuverlässiger als die Zeile.
`useLongPress` arbeitet über Pointer-Events, damit dieselbe Geste mit der Maus
gilt; drei Dinge sind dabei ausdrücklich behandelt: eine Bewegung über zehn
Pixel war Scrollen, `contextmenu` gehört dazu (Android schickt beim langen
Druck genau das), und die Textauswahl muss währenddessen aus, sonst zeigt iOS
seine Auswahl-Lupe.

## Orte: wer was sieht, und wer was ändert

Ein Ort hat vier Zahlen und Wörter, und jedes gehört woandershin — nicht aus
Ordnungsliebe, sondern weil jede eine andere Frage an eine andere Person ist.

| Feld      | Wo                              | Weil                                                                        |
| --------- | ------------------------------- | --------------------------------------------------------------------------- |
| Anschrift | Profil (eigene Wohnung)         | „wo wohnst du" beantwortet nur, wer dort wohnt                              |
| Kapazität | Profil (eigene Wohnung)         | „wie viele passen bei dir rein" ebenso                                      |
| Name      | abgeleitet bzw. Treffpunkt-Form | eine Wohnung heißt nach ihren Bewohner:innen, ein Park nach sich selbst     |
| Gewicht   | **Verwaltung**                  | „wie oft wollen wir bei dir sein" ist eine Aussage der Gruppe, keine Angabe |

Im Archiv steht eine Wohnung deshalb nur noch da: Name, Anschrift, Link zur
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

Dass es überhaupt kommende Runden gibt, ist neu: das Backend hält jetzt fünf
Runden vor statt nur der laufenden. „Mit wem bete ich ab übernächster Woche"
war vorher keine beantwortbare Frage.

Die laufende Runde fällt aus der Liste heraus — sie steht schon oben, unter
„Kommend" wäre sie doppelt.

**Der „Schreiben"-Knopf ist weg.** Er baute eine `wa.me`-Adresse mit einem
vorformulierten Satz, aber ohne Nummer — man landete also in WhatsApps
Kontaktauswahl und suchte dort die Person, die auf dem Bildschirm daneben
stand. Wer seine Gebetsbuddys anschreiben will, hat den Chat ohnehin offen.

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
