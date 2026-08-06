#!/usr/bin/env bash
# Setzt die **gesamte** Entwicklungsumgebung zurück: beide Datenbanken, alle
# Profilbilder, alle Keycloak-Konten. Danach steht wieder genau das da, was in
# prisma/seed-data/ und in diesem Skript steht.
#
# Usage: ./scripts/reset-stack.sh [--yes]
#
# Die Reihenfolge ist nicht beliebig:
#
#   1. Volumes weg, Dienste hoch — sonst schreibt die Migration in die alte DB.
#   2. Migrationen, dann Client — der Seed braucht beides.
#   3. Keycloak einrichten, DANN säen. `GET /api/me` verknüpft ein Konto über
#      die E-Mail-Adresse mit einer Personenzeile; wäre der Seed zuerst dran,
#      ginge es zwar auch, aber der Fehlerfall (Keycloak noch nicht bereit)
#      hinterließe eine halb eingerichtete Umgebung.
#
# Termine legt der Seed **nicht** an — die entstehen durch den Generator.
# Nach dem Lauf also einmal Verwaltung → Wartung → „Termine erzeugen", sonst
# steht der Plan bis zum nächsten nächtlichen Lauf leer.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "${1:-}" != "--yes" ]; then
  echo "Das löscht:"
  echo "  - die Anwendungsdatenbank (Termine, Themen, Lieder, Personen)"
  echo "  - die Keycloak-Datenbank (ALLE Konten samt Passwörtern)"
  echo "  - alle hochgeladenen Profilbilder"
  echo ""
  read -r -p "Wirklich? Tippe 'ja': " answer
  [ "${answer}" = "ja" ] || { echo "Abgebrochen."; exit 1; }
fi

echo "==> Dienste und Volumes weg"
docker compose down -v

echo "==> Profilbilder weg"
# Der Ordner selbst bleibt: UPLOAD_DIR zeigt darauf, und ihn neu anzulegen ist
# die Aufgabe des Servers beim ersten Bild.
rm -rf uploads/*

echo "==> Dienste hoch"
docker compose up -d

echo "==> Warten, bis Postgres antwortet"
until docker compose exec -T postgres pg_isready -U hauskreis -d hauskreis >/dev/null 2>&1; do
  sleep 1
done

echo "==> Schema einspielen"
pnpm db:deploy
pnpm db:generate

echo "==> Warten, bis Keycloak antwortet"
until curl -sf "${KEYCLOAK_URL:-http://localhost:8080}/realms/master" >/dev/null 2>&1; do
  sleep 2
done

echo "==> Keycloak einrichten"
./scripts/setup-keycloak.sh

echo "==> Testdaten einsäen"
pnpm db:seed

echo ""
echo "Fertig."
echo "  Anmelden:  testadmin / test1234   (Admin im Hauskreis)"
echo "             testmember / test1234"
echo "  Mailpit:   http://localhost:8025"
echo ""
echo "  Termine gibt es noch keine — der Generator legt sie an."
echo "  In der App: Verwaltung -> Wartung -> 'Termine erzeugen'."
