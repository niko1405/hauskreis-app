#!/usr/bin/env bash
# Idempotent local Keycloak setup: realm, roles, backend client, test users.
# Usage: ./scripts/setup-keycloak.sh
set -euo pipefail

KC_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${KEYCLOAK_REALM:-hauskreis}"
CLIENT_ID="${KEYCLOAK_CLIENT_ID:-hauskreis-backend}"
CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-local-dev-secret}"
KC_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KC_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
# 'mailpit' is the compose service name — Keycloak reaches it on the shared network.
SMTP_HOST="${SMTP_HOST:-mailpit}"
SMTP_PORT="${SMTP_PORT:-1025}"
SMTP_FROM="${SMTP_FROM:-noreply@hauskreis.local}"

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
      \"ssl\": \"false\",
      \"starttls\": \"false\",
      \"auth\": \"false\"
    }
  }" >/dev/null
echo "    sender: ${SMTP_FROM} via ${SMTP_HOST}:${SMTP_PORT}"

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

echo "==> Ensuring client '${CLIENT_ID}'"
EXISTING=$(curl -sf "${auth[@]}" \
  "${KC_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
  | node -pe 'const a=JSON.parse(require("fs").readFileSync(0,"utf8")); a.length ? a[0].id : ""')

if [ -z "${EXISTING}" ]; then
  curl -sf -X POST "${KC_URL}/admin/realms/${REALM}/clients" "${auth[@]}" -d "{
      \"clientId\": \"${CLIENT_ID}\",
      \"enabled\": true,
      \"protocol\": \"openid-connect\",
      \"publicClient\": false,
      \"secret\": \"${CLIENT_SECRET}\",
      \"serviceAccountsEnabled\": true,
      \"directAccessGrantsEnabled\": true,
      \"standardFlowEnabled\": true,
      \"redirectUris\": [\"http://localhost:3001/*\"],
      \"webOrigins\": [\"http://localhost:3001\"]
    }" >/dev/null
  echo "    created"
else
  echo "    already exists (${EXISTING})"
fi

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

echo ""
echo "Keycloak setup complete."
echo "  Realm:   ${REALM}"
echo "  Client:  ${CLIENT_ID} (secret: ${CLIENT_SECRET})"
echo "  Users:   testadmin / testmember  (password: test1234)"
