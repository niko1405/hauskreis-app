# Hauskreis Frontend

Noch leer. Hier kommt die Next.js-PWA hin (siehe [CLAUDE.md](../CLAUDE.md) §3
und §9). Diese Datei hält fest, was das Backend bereits bereitstellt, damit beim
Anlegen nichts nachgeraten werden muss.

## Eigene Installation

`pnpm install` läuft **hier**, nicht im Repo-Root — Begründung im
[Root-README](../README.md).

## Anmeldung

Keycloak-Client `hauskreis-app`: public, PKCE (`S256`), Standard Flow.
`scripts/setup-keycloak.sh` im Backend legt ihn an, mit Redirect-URI und
Web-Origin auf `http://localhost:3001` (über `FRONTEND_URL` änderbar).

**Nicht** `hauskreis-backend` verwenden: der hat ein Secret und einen
Service-Account mit Rechten auf der Realm-Admin-API. Im Browser wäre beides
öffentlich.

Läuft das Frontend auf einem anderen Port, muss der an drei Stellen stimmen:
`FRONTEND_URL` beim Setup-Skript (Redirect-URI), `CORS_ORIGINS` in der `.env`
des Backends, und die eigene Konfiguration hier.

## API

Basis `http://localhost:3000/api`. Vollständige Endpunkt-Tabelle im
[Backend-README](../hauskreis-backend/README.md); zum Ausprobieren die
[Bruno-Collection](../bruno/).

Zwei Eigenheiten, die den Client betreffen:

- **Jedes `PATCH` verlangt `If-Match`** mit dem ETag aus dem vorangehenden
  `GET`. Fehlt der Header, antwortet die API `428`; ist er veraltet, `412` —
  dann hat jemand anders in der Zwischenzeit gespeichert. Der Fetch-Wrapper
  sollte den ETag beim Lesen also gleich mitführen.
- **`GET …/home`** liefert den ganzen Home-Screen in einem Request. Nicht in
  vier Einzelabfragen zerlegen.

## Push

Die Voraussetzungen stehen in [CLAUDE.md](../CLAUDE.md) §8. Was das Frontend
konkret beitragen muss, steht im Backend-README unter *„Offen: was das Frontend
noch beitragen muss"*.
