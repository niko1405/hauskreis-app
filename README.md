# hauskreis-app

Organisation für einen neunköpfigen Hauskreis — Termine, Hosts, Themen, Songs,
Gebetsbuddys, Actionsteps. Was die App fachlich leisten soll, steht in
[CLAUDE.md](CLAUDE.md).

Ein Repo, zwei eigenständige Anwendungen:

| Ordner                                       | Was                                                                     | Stand                    |
| -------------------------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| [`hauskreis-backend/`](hauskreis-backend/)   | NestJS 11 + Prisma 7 + Postgres 17, Auth über Keycloak                  | fertig, 69 Endpunkte     |
| [`hauskreis-frontend/`](hauskreis-frontend/) | Next.js 16 + React 19 + TanStack Query, PWA mit Web Push               | steht                    |
| [`bruno/`](bruno/)                           | API-Collection für beide — 82 Requests, läuft von oben nach unten durch | fertig                   |
| [`docs/`](docs/)                             | [API fürs Frontend](docs/api-fuer-frontend.md), Entwurfsdokumente       | —                        |

## Warum kein pnpm-Workspace

Backend und Frontend werden getrennt installiert und getrennt deployt. Ein
Workspace-Root würde `node_modules` nach oben hoisten — und damit den
Docker-Build brechen, dessen Kontext `hauskreis-backend/` ist und der dort ein
vollständiges `pnpm install --frozen-lockfile` erwartet. Dazu kommt, dass das
Backend seine `pnpm-workspace.yaml` bereits als _Einstellungsdatei_ benutzt
(`allowBuilds`, `overrides`); ein Workspace-Root darüber würde mit ihr
kollidieren.

Also: `pnpm install` immer **im jeweiligen Unterordner**, nie im Root. Ein
`package.json` auf Repo-Ebene ist ein Versehen, kein Feature.

## Loslegen

```bash
cd hauskreis-backend
cp .env.example .env                       # Werte siehe Backend-README
pnpm install
docker compose up -d                       # Postgres, Keycloak, Mailpit
./scripts/setup-keycloak.sh                # Realm, beide Clients, Testnutzer
pnpm db:migrate && pnpm db:seed
pnpm start:dev                             # http://localhost:3000/api
```

Dann in einem zweiten Terminal das Frontend:

```bash
cd hauskreis-frontend
cp .env.example .env.local
pnpm install
pnpm dev                                   # http://localhost:3001
```

Details, Test-Accounts und die vollständige Endpunkt-Tabelle:
[hauskreis-backend/README.md](hauskreis-backend/README.md); Aufbau des
Frontends: [hauskreis-frontend/README.md](hauskreis-frontend/README.md).

## Was das Frontend vom Backend erwarten kann

- **Auth**: public Client `hauskreis-app` mit PKCE (nicht der Backend-Client —
  der hat ein Secret und gehört nicht in den Browser)
- **Home-Screen**: `GET /api/hauskreise/:id/home` — nächster Termin, eigene
  Rollen, offener Actionstep, Gebetsbuddys in _einem_ Request
- **Mehrwochen-Tabelle**: `GET /api/hauskreise/:id/assignments?from=&to=`
- **Schreiben**: jedes `PATCH` verlangt ein `If-Match` mit dem ETag aus dem
  vorherigen `GET`. Ohne kommt `428` — das ist Absicht, nicht kaputt.
- **Beschreibung**: [`hauskreis-backend/openapi.json`](hauskreis-backend/openapi.json)
  (erzeugt mit `pnpm openapi`, alle 69 Endpunkte mit Anfrage- und
  Antwortformen) plus [`docs/api-fuer-frontend.md`](docs/api-fuer-frontend.md)
  für die Regeln, die überall gelten. Beides zusammen ist das, was ein Modell
  braucht, um gegen diese API zu bauen — das Backend-README nicht.
- **CORS**: die Origin des Frontends muss in `CORS_ORIGINS` stehen, sonst
  blockt der Browser schon den Preflight.
