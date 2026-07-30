import { z } from 'zod';

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
  KEYCLOAK_URL: z.url(),
  KEYCLOAK_REALM: z.string().min(1),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
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
