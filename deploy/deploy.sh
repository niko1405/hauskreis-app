#!/usr/bin/env bash
#
# Rollt eine Image-Version aus. Aufgerufen wird das Skript **nicht** von Hand,
# sondern von GitHub Actions über einen SSH-Schlüssel, der nichts anderes darf:
#
#   command="/root/hauskreis-app/deploy/deploy.sh",no-agent-forwarding,no-port-forwarding,
#   no-pty,no-user-rc,no-X11-forwarding ssh-ed25519 AAAA… github-deploy
#
# Das `command=` ist der Kern der Sache. Ein Deploy-Schlüssel in einem
# GitHub-Secret ist ein Schlüssel, den jeder mit Schreibrechten am Repository
# benutzen kann — und ohne diese Fessel hätte er eine Shell auf dem Server.
# Damit kann er genau das hier, und der Wunsch der Gegenseite steht in
# `SSH_ORIGINAL_COMMAND`, wo er als Datum behandelt wird und nicht als Befehl.
#
# Von Hand deployen geht weiterhin über das Handbuch (docker compose pull && up).
set -euo pipefail

STACK_DIR="${STACK_DIR:-/root/hauskreis-app}"
COMPOSE_DIR="${STACK_DIR}/hauskreis-backend"
COMPOSE_FILE=docker-compose.prod.yml
ENV_FILE=.env.prod

# Wie lange auf `healthy` gewartet wird, bevor der Deploy als gescheitert gilt.
# Der HEALTHCHECK im Image hat 20 s Anlauf und prüft dann alle 30 s.
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

log() { printf '[deploy] %s\n' "$*"; }

# ---------------------------------------------------------------------------
# Was ausgerollt werden soll, kommt von außen — also prüfen, nicht glauben.
#
# `SSH_ORIGINAL_COMMAND` ist alles, was der Aufrufer hinter dem Hostnamen
# geschrieben hat. Ohne diese Prüfung stünde hier eine fremde Zeichenkette in
# einer Befehlszeile, und `command=` hätte nur die Hälfte gebracht.
# ---------------------------------------------------------------------------
TAG="${SSH_ORIGINAL_COMMAND:-}"
TAG="${TAG:-latest}"

if ! [[ "${TAG}" =~ ^([0-9a-f]{40}|latest)$ ]]; then
  echo "[deploy] Ungültige Version: '${TAG}'" >&2
  echo "[deploy] Erlaubt sind eine 40-stellige Commit-Sha oder 'latest'." >&2
  exit 2
fi

log "Version ${TAG}"

# ---------------------------------------------------------------------------
# Erst der Quelltext, dann das Image.
#
# Ausgecheckt wird **genau der Commit**, aus dem das Image gebaut wurde, nicht
# der Kopf von main: Compose-Datei und Image gehören zusammen. Ein Deploy, bei
# dem das Image von gestern und die Compose-Datei von heute ist, scheitert
# entweder sofort oder — schlimmer — erst beim nächsten Neustart.
#
# Danach steht das Arbeitsverzeichnis auf einem losgelösten HEAD. Das ist
# Absicht: der Server spiegelt einen Stand, er entwickelt nicht.
# ---------------------------------------------------------------------------
THEME_PATH="${STACK_DIR}/hauskreis-backend/keycloak/themes"
# Woran der Server sich merkt, welchen Theme-Stand sein Keycloak gelesen hat.
# Außerhalb des Arbeitsverzeichnisses, damit `git checkout --force` ihn nicht
# wegräumt.
THEME_STAMP="${THEME_STAMP:-/var/lib/hauskreis-deploy/keycloak-theme.sha}"

if [ "${TAG}" != "latest" ]; then
  log "Quelltext auf ${TAG}"
  git -C "${STACK_DIR}" fetch --quiet origin
  git -C "${STACK_DIR}" checkout --quiet --force "${TAG}"
fi

cd "${COMPOSE_DIR}"
compose() {
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"
}

# ---------------------------------------------------------------------------
# Secrets: .env.prod entsteht aus der verschlüsselten Fassung im Repo.
#
# Die Wahrheit ist `.env.prod.sops.env`, mit age verschlüsselt und im selben
# Commit wie Compose-Datei und Image — ein Rollback nimmt die Secrets dieses
# Stands also mit. `.env.prod` ist nur noch abgeleitet und wird bei jedem
# Deploy neu geschrieben; wer sie hier von Hand ändert, verliert es beim
# nächsten. Ändern: deploy/README.md, „Secrets ändern".
#
# Fehlt die verschlüsselte Datei, ist das ein Commit von vor der Umstellung:
# dann bleibt, was da ist. Liegt sie da und lässt sich nicht entschlüsseln —
# kein sops, kein Schlüssel, Schlüssel nicht unter den Empfängern —, bricht der
# Deploy ab, statt mit einem Stand weiterzulaufen, den niemand gewählt hat.
#
# Der vorige Stand bleibt als `.env.prod.prev` liegen. Geht nach einer Änderung
# an den Secrets etwas schief, ist das der Weg zurück, ohne erst einen Commit
# rückgängig zu machen und auf die CI zu warten.
# ---------------------------------------------------------------------------
SOPS_FILE=.env.prod.sops.env
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-/root/.config/sops/age/keys.txt}"

if [ -f "${SOPS_FILE}" ]; then
  if ! command -v sops >/dev/null; then
    echo "[deploy] ${SOPS_FILE} liegt im Repo, aber 'sops' fehlt auf dem Server." >&2
    echo "[deploy] Einrichtung: deploy/README.md, „Stack ablegen\"." >&2
    exit 2
  fi

  log "Secrets entschlüsseln"
  # In eine eigene Datei und erst danach an ihren Platz: Scheitert sops
  # mittendrin, steht sonst eine halbe .env.prod da, und der nächste
  # `compose`-Aufruf von Hand liest sie.
  if ! (
    umask 077
    {
      printf '# Erzeugt von deploy.sh aus %s. Änderungen hier gehen beim\n' "${SOPS_FILE}"
      printf '# nächsten Deploy verloren — siehe deploy/README.md, „Secrets ändern".\n'
      sops decrypt --input-type dotenv --output-type dotenv "${SOPS_FILE}"
    } >"${ENV_FILE}.neu"
  ); then
    rm -f "${ENV_FILE}.neu"
    echo "[deploy] ${SOPS_FILE} ließ sich nicht entschlüsseln (Schlüssel: ${SOPS_AGE_KEY_FILE})." >&2
    exit 1
  fi

  if [ -f "${ENV_FILE}" ]; then
    cp -p "${ENV_FILE}" "${ENV_FILE}.prev"
  fi
  mv -f "${ENV_FILE}.neu" "${ENV_FILE}"
else
  log "Kein ${SOPS_FILE} in diesem Stand — ${ENV_FILE} bleibt, wie sie ist"
fi

log "Image holen"
IMAGE_TAG="${TAG}" compose pull --quiet api

# `up -d` startet den `migrate`-Service von selbst vorweg und wartet, bis
# Postgres gesund ist. Schlägt eine Migration fehl, kommt die API gar nicht
# erst hoch — und dieses Skript endet mit einem Fehler, statt einen halben
# Stand als Erfolg zu melden.
log "Stack starten"
IMAGE_TAG="${TAG}" compose up -d --remove-orphans

# ---------------------------------------------------------------------------
# Keycloak neu starten, wenn sein Theme nicht mehr das ist, das er gelesen hat.
#
# **Warum überhaupt.** `up -d` startet Keycloak nicht neu: Compose legt einen
# Container nur neu an, wenn sich **seine Konfiguration** ändert — Image,
# Umgebung, Netz. Eine eingehängte Datei zählt nicht dazu. In Produktion
# (`command: start`) liest Keycloak Themes aber genau einmal, beim Start, und
# behält sie danach im Zwischenspeicher. Ohne diesen Schritt läuft ein
# Theme-Deploy geräuschlos ins Leere: die Dateien liegen richtig auf der
# Platte, der Dienst benutzt weiter die alten.
#
# **Warum eine Prüfsumme und kein `git diff`.** Ein Vergleich der beiden
# Commits eines Deploys verpasst Änderungen: wenn er im selben Commit kommt wie
# die Theme-Datei (dann läuft noch die alte Fassung dieses Skripts), und bei
# einem Deploy desselben Commits von Hand (`before == after`).
#
# Eine Prüfsumme über das Verzeichnis vergleicht dagegen, was **auf der Platte
# liegt**, mit dem, was der laufende Dienst
# zuletzt gelesen hat — unabhängig von Commits, Reihenfolge und davon, welche
# Fassung dieses Skripts gerade läuft. Fehlt die Marke (erster Lauf), wird
# einmal neu gestartet. Das ist genau richtig: dann *weiß*
# niemand, was der Dienst gelesen hat.
#
# Neu gestartet wird nur bei echter Änderung. Ein Neustart wirft alle
# laufenden Anmeldevorgänge weg, und das ist ein zu hoher Preis für ein Deploy,
# das mit Keycloak nichts zu tun hatte.
# ---------------------------------------------------------------------------
theme_hash=$(
  find "${THEME_PATH}" -type f -exec sha256sum {} + |
    sort -k 2 |
    sha256sum |
    cut -d' ' -f1
)

if [ "$(cat "${THEME_STAMP}" 2>/dev/null || true)" != "${theme_hash}" ]; then
  log "Keycloak-Theme ist nicht der gelesene Stand — Dienst neu starten"
  compose restart keycloak
  mkdir -p "$(dirname "${THEME_STAMP}")"
  printf '%s\n' "${theme_hash}" >"${THEME_STAMP}"
fi

# ---------------------------------------------------------------------------
# Warten, bis die API wirklich antwortet.
#
# Ohne das wäre jeder Deploy grün, sobald Docker den Container angelegt hat —
# auch der, bei dem die Anwendung zwei Sekunden später an einer fehlenden
# Variable stirbt. Der Wert dieses Schrittes ist, dass ein roter Haken in
# GitHub etwas bedeutet.
# ---------------------------------------------------------------------------
log "Auf healthy warten (max. ${HEALTH_TIMEOUT}s)"
deadline=$(( SECONDS + HEALTH_TIMEOUT ))
while true; do
  state=$(docker inspect --format '{{.State.Health.Status}}' "$(compose ps -q api)" 2>/dev/null || echo 'unbekannt')

  case "${state}" in
    healthy)
      log "healthy"
      break
      ;;
    unhealthy)
      echo "[deploy] Die API meldet sich als unhealthy." >&2
      compose logs --tail 50 api >&2
      exit 1
      ;;
  esac

  if [ "${SECONDS}" -ge "${deadline}" ]; then
    echo "[deploy] Zeitüberschreitung, Zustand: ${state}" >&2
    compose logs --tail 50 api >&2
    exit 1
  fi

  sleep 3
done

# Alte Ebenen sammeln sich sonst bis zur vollen Platte. `-f` ohne `-a`: was
# gerade läuft und was als `latest` markiert ist, bleibt liegen.
log "Aufräumen"
docker image prune -f >/dev/null

log "fertig: $(compose ps --format '{{.Service}} {{.Status}}' | tr '\n' '; ')"
