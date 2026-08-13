import { z } from 'zod';

/**
 * `z.url()` allein akzeptiert auch `keycloak:8080` — das ist eine gültige URL
 * mit dem Schema `keycloak:`. Genau der Tippfehler, den man macht, wenn man
 * eine Adresse von `localhost` auf einen Compose-Namen umstellt und dabei das
 * `http://` vergisst. Der Server startet dann und wirft erst beim ersten
 * Request eine Fetch-Fehlermeldung, die nicht nach der Ursache aussieht.
 */
const httpUrl = z.url({ protocol: /^https?$/ });

/**
 * Ein Wert, den es geben darf und nicht geben muss — und bei dem „gibt es
 * nicht" auch dann gilt, wenn die Zeile dasteht und leer bleibt.
 *
 * `.optional()` allein reicht dafür nicht, und das ist kein Detail: In einer
 * `.env`-Datei ist `GEMINI_API_KEY=` die naheliegende Art, „habe ich nicht"
 * auszudrücken, und Compose reicht jedes `${FOO}` ohnehin als leere
 * Zeichenkette weiter, wenn `FOO` nicht gesetzt ist. Beides kommt hier als `''`
 * an, nicht als `undefined` — und scheiterte an `.min(1)`.
 *
 * Der Effekt war das Gegenteil dessen, was diese Felder versprechen: Statt
 * einer abgeschalteten Funktion gab es einen Server, der gar nicht erst
 * hochkam. Beim ersten Start in Produktion ist das die unfreundlichste Art,
 * „kein Push-Schlüssel hinterlegt" zu sagen.
 *
 * Dieselbe Behandlung wie bei `KEYCLOAK_INTERNAL_URL` und `APP_URL`, nur für
 * Zeichenketten ohne Format.
 */
const optionalValue = z
  .union([z.string().min(1), z.literal('')])
  .optional()
  .transform((value) => value || undefined);

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
  VAPID_PUBLIC_KEY: optionalValue,
  VAPID_PRIVATE_KEY: optionalValue,
  /// Contact address the push service can reach you at, per the VAPID spec.
  VAPID_SUBJECT: z.string().min(1).default('mailto:admin@hauskreis.local'),

  /// Gemini (Google AI Studio) für die beiden Hilfen beim Lied-Anlegen: aus
  /// einem Link Titel und Interpret lesen, und umgekehrt zu Titel und
  /// Interpret einen Link suchen.
  ///
  /// Optional wie die VAPID-Keys und aus demselben Grund: ohne Schlüssel soll
  /// der Server starten und die Funktion sich abschalten, statt die ganze App
  /// an einer Bequemlichkeit scheitern zu lassen.
  ///
  /// Der Schlüssel braucht ein Projekt mit **aktivierter Abrechnung**. Die
  /// Suche nach einem Link läuft über `google_search`-Grounding, und das gibt
  /// es im kostenlosen Tarif nicht.
  GEMINI_API_KEY: optionalValue,
  /// Bewusst das kleinste Modell: Beide Aufgaben sind Ablesen und Auswählen,
  /// nicht Nachdenken. `gemini-3.6-flash` kostet 1,50/7,50 $ je Mio. Tokens
  /// und denkt von Haus aus mit; flash-lite liegt bei 0,25/1,50 $ — sechs- bzw.
  /// fünfmal günstiger, und nebenbei schneller.
  ///
  /// Nicht `gemini-2.5-flash-lite`, obwohl das noch einmal deutlich billiger
  /// wäre: Google nimmt dafür keine neuen Nutzer mehr an, ein frischer
  /// Schlüssel bekommt dort nur einen 404.
  GEMINI_MODEL: z.string().min(1).default('gemini-3.1-flash-lite'),
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
