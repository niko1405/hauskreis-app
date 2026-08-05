import { z } from 'zod';

/**
 * `z.url()` allein akzeptiert auch `keycloak:8080` — das ist eine gültige URL
 * mit dem Schema `keycloak:`. Genau der Tippfehler, den man macht, wenn man
 * eine Adresse von `localhost` auf einen Compose-Namen umstellt und dabei das
 * `http://` vergisst. Der Server startet dann und wirft erst beim ersten
 * Request eine Fetch-Fehlermeldung, die nicht nach der Ursache aussieht.
 */
const httpUrl = z.url({ protocol: /^https?$/ });

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  /// Die **öffentliche** Keycloak-Adresse — die, unter der der Browser sich
  /// anmeldet. Daraus wird der Issuer gebildet, und der muss exakt dem `iss`
  /// im Token entsprechen. Keycloak setzt `iss` auf seinen `KC_HOSTNAME`,
  /// unabhängig davon, über welche Adresse das Token geholt wurde.
  KEYCLOAK_URL: httpUrl,
  /// Die Adresse, über die *dieser Prozess* Keycloak erreicht — JWKS-Abruf und
  /// Admin-API. Im Compose-Setup ist das `http://keycloak:8080`, denn im
  /// Container zeigt `localhost` auf den Container selbst.
  ///
  /// Getrennt von `KEYCLOAK_URL`, weil die beiden nur lokal dieselbe Adresse
  /// sind: Der Issuer muss öffentlich sein, der Abruf muss erreichbar sein.
  /// Leer lassen heißt "dieselbe wie KEYCLOAK_URL" — richtig für alles, was
  /// nicht in einem Container läuft. `.optional()` allein reichte dafür nicht:
  /// eine Zeile `KEYCLOAK_INTERNAL_URL=` in der .env kommt als leerer String
  /// an, nicht als `undefined`, und wäre dann keine gültige URL.
  KEYCLOAK_INTERNAL_URL: z
    .union([httpUrl, z.literal('')])
    .optional()
    .transform((value) => value || undefined),
  /// Wohin Profilbilder geschrieben werden. Relativ zum Arbeitsverzeichnis,
  /// im Container ein eingehängtes Volume — sonst wären die Bilder nach jedem
  /// `docker compose up` weg, und niemand lädt sein Bild zweimal hoch.
  UPLOAD_DIR: z.string().min(1).default('./uploads'),
  KEYCLOAK_REALM: z.string().min(1),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
  /// Der Client, unter dem sich der Browser anmeldet. Gebraucht wird er nur
  /// für die Einladungsmail: ein `execute-actions-email` ohne Client endet auf
  /// einer Keycloak-Seite, mit Client führt es zurück in die App.
  KEYCLOAK_FRONTEND_CLIENT_ID: z.string().min(1).default('hauskreis-app'),
  /// Wohin die Einladung zurückführt, wenn Nutzername und Passwort stehen.
  /// Muss zu einer Redirect-URI des Frontend-Clients passen, sonst weist
  /// Keycloak den Link ab. Leer heißt: kein Rücksprung, der Ablauf endet auf
  /// Keycloaks eigener Schlussseite — unschön, aber nicht kaputt.
  APP_URL: z
    .union([httpUrl, z.literal('')])
    .optional()
    .transform((value) => value || undefined),
  /// What the token's `aud` must contain. Keycloak only sets it when an
  /// audience mapper says so — `scripts/setup-keycloak.sh` adds one to both
  /// clients. Without this check any token from the realm would be accepted,
  /// including one minted for a completely different application.
  KEYCLOAK_AUDIENCE: z.string().min(1).default('hauskreis-backend'),
  /// Which clients may issue tokens for this API, matched against `azp`.
  /// Comma-separated; empty means "do not check", which is the honest default
  /// for a setup that has not been told about its clients yet.
  KEYCLOAK_ALLOWED_AZP: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((clientId) => clientId.trim())
        .filter(Boolean),
    ),
  // Gate for the CSV seed script. Note: z.coerce.boolean() would turn the
  // string "false" into true, so parse the literal instead.
  SEED_ENABLED: z.stringbool().default(false),

  // Web Push (VAPID). Generate a pair with `npx web-push generate-vapid-keys`.
  // Optional so the app still boots without them — push is then disabled and
  // logged once, rather than taking the whole server down.
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  /// Contact address the push service can reach you at, per the VAPID spec.
  VAPID_SUBJECT: z.string().min(1).default('mailto:admin@hauskreis.local'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
