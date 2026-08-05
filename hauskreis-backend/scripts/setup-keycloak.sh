#!/usr/bin/env bash
# Idempotent local Keycloak setup: realm, roles, both clients, test users.
# Usage: ./scripts/setup-keycloak.sh
set -euo pipefail

KC_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${KEYCLOAK_REALM:-hauskreis}"
CLIENT_ID="${KEYCLOAK_CLIENT_ID:-hauskreis-backend}"
CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-local-dev-secret}"
# The browser-facing client. Public, because a Single Page App has nowhere to
# keep a secret; PKCE is what protects the code exchange instead.
FRONTEND_CLIENT_ID="${KEYCLOAK_FRONTEND_CLIENT_ID:-hauskreis-app}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3001}"
# What the API insists on finding in the token's `aud`.
API_AUDIENCE="${KEYCLOAK_AUDIENCE:-hauskreis-backend}"
KC_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KC_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
# 'mailpit' is the compose service name — Keycloak reaches it on the shared network.
SMTP_HOST="${SMTP_HOST:-mailpit}"
SMTP_PORT="${SMTP_PORT:-1025}"
SMTP_FROM="${SMTP_FROM:-noreply@hauskreis.local}"
# Mailpit braucht weder Verschlüsselung noch Anmeldung; ein echter Mailserver
# beides. Die Vorgaben passen zur Entwicklung, produktiv setzt man sie in der
# Umgebung — siehe README, „Produktion".
SMTP_AUTH="${SMTP_AUTH:-false}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASSWORD="${SMTP_PASSWORD:-}"
SMTP_SSL="${SMTP_SSL:-false}"
SMTP_STARTTLS="${SMTP_STARTTLS:-false}"

echo "==> Requesting admin token from ${KC_URL}"
TOKEN=$(curl -sf -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=${KC_ADMIN}" \
  -d "password=${KC_ADMIN_PASSWORD}" \
  -d "grant_type=password" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).access_token')

auth=(-H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json")

api_status() { curl -s -o /dev/null -w '%{http_code}' "${auth[@]}" "$@"; }

echo "==> Ensuring realm '${REALM}'"
if [ "$(api_status "${KC_URL}/admin/realms/${REALM}")" = "404" ]; then
  curl -sf -X POST "${KC_URL}/admin/realms" "${auth[@]}" \
    -d "{\"realm\":\"${REALM}\",\"enabled\":true}" >/dev/null
  echo "    created"
else
  echo "    already exists"
fi

# Without an SMTP sender address Keycloak aborts every outgoing mail with
# "Invalid sender address 'null'", which breaks the invite flow. Point the realm
# at the local Mailpit container so invitations are catchable at :8025.
echo "==> Configuring realm SMTP (Mailpit)"
curl -sf -X PUT "${KC_URL}/admin/realms/${REALM}" "${auth[@]}" -d "{
    \"smtpServer\": {
      \"host\": \"${SMTP_HOST}\",
      \"port\": \"${SMTP_PORT}\",
      \"from\": \"${SMTP_FROM}\",
      \"fromDisplayName\": \"Hauskreis App\",
      \"ssl\": \"${SMTP_SSL}\",
      \"starttls\": \"${SMTP_STARTTLS}\",
      \"auth\": \"${SMTP_AUTH}\",
      \"user\": \"${SMTP_USER}\",
      \"password\": \"${SMTP_PASSWORD}\"
    },
    \"emailTheme\": \"hauskreis\",
    \"loginTheme\": \"hauskreis\",
    \"editUsernameAllowed\": true,
    \"resetPasswordAllowed\": true,
    \"registrationAllowed\": true,
    \"registrationEmailAsUsername\": false,
    \"loginWithEmailAllowed\": true,
    \"verifyEmail\": true,
    \"internationalizationEnabled\": true,
    \"supportedLocales\": [\"de\"],
    \"defaultLocale\": \"de\"
  }" >/dev/null
echo "    sender: ${SMTP_FROM} via ${SMTP_HOST}:${SMTP_PORT}"
# Ohne internationalizationEnabled greift Keycloak zu messages_en und die
# deutschen Texte in den Themes blieben unbenutzt.
echo "    Themes: 'hauskreis' für Login und Mail, Sprache de"
# editUsernameAllowed schaltet das Nutzername-Feld im Profilschritt frei. Ohne
# das zeigt die Einladung zwar UPDATE_PROFILE, aber nur Vor- und Nachname —
# der Nutzername bliebe die E-Mail-Adresse aus dem Anlegen.
echo "    Nutzername: selbst wählbar"
# Ohne resetPasswordAllowed ist ein vergessenes Passwort eine Sackgasse.
echo "    Passwort vergessen: möglich"
# registrationAllowed: man kann sich selbst ein Konto anlegen und landet danach
# auf „Hauskreis gründen / eingeladen werden" — ohne dass jemand einen kennen
# muss, der schon drin ist.
#
# verifyEmail ist dabei **kein Komfort, sondern die Absicherung**:
# `PersonService.resolveForUser` verknüpft ein frisches Konto über die
# E-Mail-Adresse mit einer offenen Einladung. Ohne Bestätigung könnte sich
# jemand mit der Adresse einer eingeladenen Person registrieren und deren Platz
# übernehmen. Das Backend weist zusätzlich Token ohne `email_verified` ab — die
# Tür, die uns gehört.
#
# registrationEmailAsUsername bleibt aus, sonst gäbe es das Feld „Nutzername"
# gar nicht, und genau der soll in der App stehen.
echo "    Registrierung: offen, E-Mail-Bestätigung Pflicht"
echo "    Anmeldung: mit Nutzername oder E-Mail"

echo "==> Ensuring realm roles: member, admin"
for role in member admin; do
  if [ "$(api_status "${KC_URL}/admin/realms/${REALM}/roles/${role}")" = "404" ]; then
    curl -sf -X POST "${KC_URL}/admin/realms/${REALM}/roles" "${auth[@]}" \
      -d "{\"name\":\"${role}\"}" >/dev/null
    echo "    created ${role}"
  else
    echo "    ${role} already exists"
  fi
done

client_uuid() {
  curl -sf "${auth[@]}" \
    "${KC_URL}/admin/realms/${REALM}/clients?clientId=$1" \
    | node -pe 'const a=JSON.parse(require("fs").readFileSync(0,"utf8")); a.length ? a[0].id : ""'
}

# The API refuses tokens without the right `aud`, and Keycloak only puts one
# there when a mapper says so. Both clients get it: the frontend issues the
# tokens people use, the backend client issues the ones scripts and the Bruno
# collection use.
ensure_audience_mapper() {
  local uuid="$1" name="hauskreis-api-audience"

  local existing
  existing=$(curl -sf "${auth[@]}" \
    "${KC_URL}/admin/realms/${REALM}/clients/${uuid}/protocol-mappers/models" \
    | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).filter(m => m.name === '${name}').length")

  if [ "${existing}" = "0" ]; then
    curl -sf -X POST "${auth[@]}" \
      "${KC_URL}/admin/realms/${REALM}/clients/${uuid}/protocol-mappers/models" -d "{
        \"name\": \"${name}\",
        \"protocol\": \"openid-connect\",
        \"protocolMapper\": \"oidc-audience-mapper\",
        \"config\": {
          \"included.client.audience\": \"${API_AUDIENCE}\",
          \"access.token.claim\": \"true\",
          \"id.token.claim\": \"false\"
        }
      }" >/dev/null
    echo "    audience mapper added"
  else
    echo "    audience mapper already there"
  fi
}

# Two clients on purpose. A browser cannot keep a secret, so the frontend gets a
# public client with PKCE; the confidential one keeps the service account that
# drives the Admin API for invitations. Rolling both jobs into one client would
# mean either shipping the secret to the browser or handing the browser client a
# service account with realm-admin.
echo "==> Ensuring backend client '${CLIENT_ID}' (Admin API, no browser flow)"
EXISTING=$(client_uuid "${CLIENT_ID}")

if [ -z "${EXISTING}" ]; then
  curl -sf -X POST "${KC_URL}/admin/realms/${REALM}/clients" "${auth[@]}" -d "{
      \"clientId\": \"${CLIENT_ID}\",
      \"enabled\": true,
      \"protocol\": \"openid-connect\",
      \"publicClient\": false,
      \"secret\": \"${CLIENT_SECRET}\",
      \"serviceAccountsEnabled\": true,
      \"standardFlowEnabled\": false,
      \"directAccessGrantsEnabled\": true
    }" >/dev/null
  echo "    created"
  EXISTING=$(client_uuid "${CLIENT_ID}")
else
  echo "    already exists (${EXISTING})"
fi

ensure_audience_mapper "${EXISTING}"

echo "==> Ensuring frontend client '${FRONTEND_CLIENT_ID}' (public, PKCE)"
FRONTEND_UUID=$(client_uuid "${FRONTEND_CLIENT_ID}")

if [ -z "${FRONTEND_UUID}" ]; then
  curl -sf -X POST "${KC_URL}/admin/realms/${REALM}/clients" "${auth[@]}" -d "{
      \"clientId\": \"${FRONTEND_CLIENT_ID}\",
      \"enabled\": true,
      \"protocol\": \"openid-connect\",
      \"publicClient\": true,
      \"serviceAccountsEnabled\": false,
      \"directAccessGrantsEnabled\": false,
      \"standardFlowEnabled\": true,
      \"redirectUris\": [\"${FRONTEND_URL}/*\"],
      \"webOrigins\": [\"${FRONTEND_URL}\"],
      \"attributes\": { \"pkce.code.challenge.method\": \"S256\" }
    }" >/dev/null
  echo "    created"
  FRONTEND_UUID=$(client_uuid "${FRONTEND_CLIENT_ID}")
else
  echo "    already exists (${FRONTEND_UUID})"
fi

ensure_audience_mapper "${FRONTEND_UUID}"

# Grant the service account permission to manage users (needed for the invite flow).
echo "==> Granting realm-management roles to service account"
SA_USER_ID=$(curl -sf "${auth[@]}" \
  "${KC_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8"))[0].id' \
  | xargs -I{} curl -sf "${auth[@]}" "${KC_URL}/admin/realms/${REALM}/clients/{}/service-account-user" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')

RM_CLIENT_ID=$(curl -sf "${auth[@]}" \
  "${KC_URL}/admin/realms/${REALM}/clients?clientId=realm-management" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8"))[0].id')

# 'realm-admin' is the composite that also covers reading realm roles and
# mapping them onto users, which the invite flow needs. manage-users alone
# yields a 403 on the role-mapping call.
ROLES_JSON=$(curl -sf "${auth[@]}" \
  "${KC_URL}/admin/realms/${REALM}/clients/${RM_CLIENT_ID}/roles" \
  | node -pe '
    const all = JSON.parse(require("fs").readFileSync(0,"utf8"));
    const want = ["realm-admin"];
    JSON.stringify(all.filter(r => want.includes(r.name)).map(r => ({id:r.id,name:r.name})));
  ')

curl -sf -X POST "${auth[@]}" \
  "${KC_URL}/admin/realms/${REALM}/users/${SA_USER_ID}/role-mappings/clients/${RM_CLIENT_ID}" \
  -d "${ROLES_JSON}" >/dev/null
echo "    granted realm-admin"

create_user() {
  local username="$1" email="$2" password="$3" role="$4"
  echo "==> Ensuring user '${username}' (role: ${role})"

  local uid
  uid=$(curl -sf "${auth[@]}" \
    "${KC_URL}/admin/realms/${REALM}/users?username=${username}&exact=true" \
    | node -pe 'const a=JSON.parse(require("fs").readFileSync(0,"utf8")); a.length ? a[0].id : ""')

  if [ -z "${uid}" ]; then
    curl -sf -X POST "${KC_URL}/admin/realms/${REALM}/users" "${auth[@]}" -d "{
        \"username\": \"${username}\",
        \"email\": \"${email}\",
        \"firstName\": \"${username}\",
        \"lastName\": \"Test\",
        \"emailVerified\": true,
        \"enabled\": true,
        \"requiredActions\": [],
        \"credentials\": [{\"type\":\"password\",\"value\":\"${password}\",\"temporary\":false}]
      }" >/dev/null
    uid=$(curl -sf "${auth[@]}" \
      "${KC_URL}/admin/realms/${REALM}/users?username=${username}&exact=true" \
      | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8"))[0].id')
    echo "    created"
  else
    echo "    already exists"
  fi

  # Keycloak's default user profile requires firstName/lastName; without them
  # the token endpoint rejects logins with "Account is not fully set up".
  curl -sf -X PUT "${KC_URL}/admin/realms/${REALM}/users/${uid}" "${auth[@]}" -d "{
      \"email\": \"${email}\",
      \"firstName\": \"${username}\",
      \"lastName\": \"Test\",
      \"emailVerified\": true,
      \"enabled\": true,
      \"requiredActions\": []
    }" >/dev/null
  curl -sf -X PUT "${KC_URL}/admin/realms/${REALM}/users/${uid}/reset-password" "${auth[@]}" \
    -d "{\"type\":\"password\",\"value\":\"${password}\",\"temporary\":false}" >/dev/null

  local role_json
  role_json=$(curl -sf "${auth[@]}" "${KC_URL}/admin/realms/${REALM}/roles/${role}" \
    | node -pe 'const r=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify([{id:r.id,name:r.name}])')

  curl -sf -X POST "${auth[@]}" \
    "${KC_URL}/admin/realms/${REALM}/users/${uid}/role-mappings/realm" \
    -d "${role_json}" >/dev/null
  echo "    role '${role}' assigned"
}

# The e-mail addresses deliberately match rows in prisma/seed-data/person.csv.
# GET /api/me links a Keycloak account to a person row by e-mail, so this is
# what makes `pnpm db:seed` + this script produce a login that actually maps
# onto a seeded member instead of a dead end.
create_user "testadmin" "niko@example.com" "test1234" "admin"
create_user "testmember" "toni@example.com" "test1234" "member"

# Ein Realm lässt sich anstandslos auf ein Theme setzen, das es gar nicht gibt —
# Keycloak fällt dann still auf die Vorgabe zurück. Genau das ist hier über
# Wochen unbemerkt geblieben: der Realm zeigte auf 'hauskreis', der Server kannte
# nur 'keycloak.v2', und die Anmeldeseite sah einfach aus wie von der Stange.
# Deshalb wird hier nachgesehen, ob das Theme wirklich angekommen ist.
echo "==> Prüfen, ob das Theme '${REALM}' installiert ist"
THEME_CHECK=$(curl -sf "${auth[@]}" "${KC_URL}/admin/serverinfo" | node -pe '
  const themes = JSON.parse(require("fs").readFileSync(0,"utf8")).themes ?? {};
  const has = (kind) => (themes[kind] ?? []).some(t => t.name === "hauskreis");
  ["login","email"].filter(kind => !has(kind)).join(",");
')

if [ -n "${THEME_CHECK}" ]; then
  echo ""
  echo "FEHLER: Keycloak kennt kein Theme 'hauskreis' für: ${THEME_CHECK}"
  echo ""
  echo "  Der Realm zeigt darauf, der Server hat es nicht — dann nimmt Keycloak"
  echo "  wortlos die Standardseite. Die Dateien liegen in"
  echo "  keycloak/themes/hauskreis und werden per Volume eingehängt."
  echo ""
  echo "  Nachsehen, was im Container ankommt:"
  echo "    docker compose exec keycloak ls /opt/keycloak/themes/hauskreis"
  echo ""
  echo "  Ist der Ordner dort leer, kommt der Daemon nicht an das Dateisystem:"
  echo "    - unter WSL: in Docker Desktop unter Einstellungen > Resources >"
  echo "      WSL Integration diese Distribution einschalten. Ohne das legt"
  echo "      Docker für den Mount einen leeren Ordner an, statt zu scheitern."
  echo "    - sonst: docker compose up -d --force-recreate keycloak"
  echo ""
  exit 1
fi
echo "    login und email: da"

echo ""
echo "Keycloak setup complete."
echo "  Realm:   ${REALM}"
echo "  Client:  ${CLIENT_ID} (secret: ${CLIENT_SECRET})"
echo "  Users:   testadmin / testmember  (password: test1234)"
