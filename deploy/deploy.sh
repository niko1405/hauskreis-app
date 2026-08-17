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
THEME_PATH='hauskreis-backend/keycloak/themes'
themes_changed=0

if [ "${TAG}" != "latest" ]; then
  log "Quelltext auf ${TAG}"
  before=$(git -C "${STACK_DIR}" rev-parse HEAD)
  git -C "${STACK_DIR}" fetch --quiet origin
  git -C "${STACK_DIR}" checkout --quiet --force "${TAG}"
  after=$(git -C "${STACK_DIR}" rev-parse HEAD)

  # Ob die Keycloak-Themes von diesem Deploy berührt wurden. Siehe unten,
  # warum das eine eigene Frage ist.
  if [ "${before}" != "${after}" ] &&
    ! git -C "${STACK_DIR}" diff --quiet "${before}" "${after}" -- "${THEME_PATH}"; then
    themes_changed=1
  fi
fi

cd "${COMPOSE_DIR}"
compose() {
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"
}

log "Image holen"
IMAGE_TAG="${TAG}" compose pull --quiet api

# `up -d` startet den `migrate`-Service von selbst vorweg und wartet, bis
# Postgres gesund ist. Schlägt eine Migration fehl, kommt die API gar nicht
# erst hoch — und dieses Skript endet mit einem Fehler, statt einen halben
# Stand als Erfolg zu melden.
log "Stack starten"
IMAGE_TAG="${TAG}" compose up -d --remove-orphans

# ---------------------------------------------------------------------------
# Keycloak neu starten, wenn sich sein Theme geändert hat.
#
# `up -d` tut das nicht: Compose legt einen Container nur neu an, wenn sich
# **seine Konfiguration** ändert — Image, Umgebung, Netz. Eine eingehängte
# Datei zählt nicht dazu. In Produktion liest Keycloak Themes aber genau
# einmal, beim Start (`docker-compose.prod.yml` sagt es an der Einhängung
# selbst), und behält sie danach im Zwischenspeicher.
#
# Ohne diesen Schritt lief ein Theme-Deploy also ins Leere, und zwar
# geräuschlos: die Dateien lagen richtig auf der Platte, der Dienst benutzte
# weiter die alten. Genau so kamen die Einladungsmails eine Weile mit den Namen
# ihrer Textbausteine statt mit den Sätzen an.
#
# Nur bei echter Änderung, nicht bei jedem Deploy: Ein Neustart wirft alle
# laufenden Anmeldevorgänge weg, und das ist ein zu hoher Preis für ein Deploy,
# das mit Keycloak nichts zu tun hatte.
# ---------------------------------------------------------------------------
if [ "${themes_changed}" -eq 1 ]; then
  log "Keycloak-Theme hat sich geändert — Dienst neu starten"
  compose restart keycloak
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
