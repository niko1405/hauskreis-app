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

**Abmelden zieht die Tokens zurück** (`revokeTokensOnSignout`). Sonst bliebe ein
Offline-Token gültig, obwohl sich jemand abgemeldet hat. `signoutRedirect`
entfernt zusätzlich den gespeicherten Stand, bevor es zu Keycloak weitergeht —
sonst würde die Wiederherstellung von oben einen gerade Abgemeldeten sofort
wieder hereinlassen.

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
