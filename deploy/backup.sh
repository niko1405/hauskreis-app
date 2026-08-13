#!/usr/bin/env bash
#
# Sichert beide Datenbanken und das Uploads-Volume.
#
# Aufruf von Hand oder über acts2-backup.timer. Erwartet, dass der
# Compose-Stack läuft — `pg_dump` geht durch den laufenden Container, damit weder
# ein Client auf dem Host installiert sein noch ein Port offen stehen muss.
#
# **Die drei Teile gehören zusammen.** Ein `person`-Datensatz trägt
# `photoUpdatedAt`, die zugehörige Datei liegt daneben im Volume. Kommt nur eines
# zurück, zeigt die App auf ein Bild, das es nicht gibt. Sie heilt sich dann
# selbst und räumt den Zeitstempel ab — das Bild ist trotzdem weg. Deshalb ein
# Lauf, ein Ordner, ein Zeitstempel.
#
# Was hier bewusst *nicht* gesichert wird: die Container-Images (kommen aus der
# CI) und .env.prod (gehört in einen Passwortspeicher, nicht in ein Backup, das
# jede Nacht irgendwohin kopiert wird).
set -euo pipefail

STACK_DIR="${STACK_DIR:-/srv/acts2}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/acts2}"
KEEP_DAYS="${KEEP_DAYS:-14}"

# Off-site. Leer lassen heißt: nur lokal sichern. Ein Backup auf derselben
# Platte hilft gegen einen Fehlgriff, nicht gegen einen kaputten Server.
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
# Öffentlicher age-Schlüssel des Empfängers. In den Dumps stehen Namen,
# E-Mail-Adressen, Geburtsdaten und Gebetsanliegen von echten Menschen; die
# gehören nicht unverschlüsselt in fremden Speicher. Ohne Schlüssel wird nicht
# hochgeladen — lieber gar kein Off-Site als ein offenes.
AGE_RECIPIENT="${AGE_RECIPIENT:-}"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
DEST="${BACKUP_ROOT}/${STAMP}"

log() { printf '[backup] %s\n' "$*"; }

cd "${STACK_DIR}"
compose() { docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"; }

mkdir -p "${DEST}"

# -Fc ist das eigene Format von pg_dump: komprimiert, und `pg_restore` kann
# daraus einzelne Tabellen holen statt nur alles.
log "Anwendungsdatenbank"
compose exec -T postgres pg_dump -U hauskreis -Fc hauskreis > "${DEST}/hauskreis.dump"

# Ohne die hier wäre nach einem Totalverlust zwar jeder Termin da, aber niemand
# könnte sich anmelden: Konten, Passwörter und der Realm liegen allein hier.
log "Keycloak-Datenbank"
compose exec -T keycloak-db pg_dump -U keycloak -Fc keycloak > "${DEST}/keycloak.dump"

# Der Volume-Name ist der aus `docker volume ls`, also mit Projekt-Präfix. Er
# wird aus dem laufenden Container gelesen statt geraten — das Präfix hängt am
# Verzeichnisnamen und ändert sich, wenn jemand den Stack woanders auscheckt.
log "Profil- und Kopfbilder"
UPLOADS_VOLUME="$(
  docker inspect "$(compose ps -q api)" \
    --format '{{ range .Mounts }}{{ if eq .Destination "/data/uploads" }}{{ .Name }}{{ end }}{{ end }}'
)"
docker run --rm \
  -v "${UPLOADS_VOLUME}:/quelle:ro" \
  -v "${DEST}:/ziel" \
  alpine:3 tar czf /ziel/uploads.tgz -C /quelle .

# Woran man später erkennt, wogegen man zurückspielt.
compose config --images > "${DEST}/images.txt"
du -sh "${DEST}" | cut -f1 > "${DEST}/groesse.txt"

log "fertig: ${DEST} ($(cat "${DEST}/groesse.txt"))"

if [ -n "${RCLONE_REMOTE}" ]; then
  if [ -z "${AGE_RECIPIENT}" ]; then
    log "AGE_RECIPIENT fehlt — kein Off-Site-Upload (unverschlüsselt wäre schlimmer als gar nicht)"
  else
    log "verschlüsseln und hochladen"
    tar cf - -C "${BACKUP_ROOT}" "${STAMP}" \
      | age -r "${AGE_RECIPIENT}" \
      | rclone rcat "${RCLONE_REMOTE}/${STAMP}.tar.age"
    log "hochgeladen: ${RCLONE_REMOTE}/${STAMP}.tar.age"
  fi
fi

# Erst aufräumen, wenn alles davor gutgegangen ist — `set -e` sorgt dafür, dass
# ein gescheiterter Lauf die alten Sicherungen nicht mitnimmt.
log "älter als ${KEEP_DAYS} Tage entfernen"
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime "+${KEEP_DAYS}" -exec rm -rf {} +
