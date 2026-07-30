import { internalKeycloakUrl, trimSlashes } from './keycloak-url';
import { validateEnv } from '../config/env.schema';
import type { AppConfigService } from '../config/config.service';
import type { Env } from '../config/env.schema';

function configWith(values: Partial<Env>): AppConfigService {
  return {
    get: (key: keyof Env) => values[key],
  } as unknown as AppConfigService;
}

const baseEnv = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
  KEYCLOAK_URL: 'http://localhost:8080',
  KEYCLOAK_REALM: 'hauskreis',
  KEYCLOAK_CLIENT_ID: 'hauskreis-backend',
  KEYCLOAK_CLIENT_SECRET: 'secret',
};

describe('trimSlashes', () => {
  it('leaves a plain URL alone', () => {
    expect(trimSlashes('http://keycloak:8080')).toBe('http://keycloak:8080');
  });

  it('drops trailing slashes so joined paths do not double up', () => {
    expect(trimSlashes('http://keycloak:8080//')).toBe('http://keycloak:8080');
  });
});

describe('internalKeycloakUrl', () => {
  it('falls back to the public URL when no internal one is configured', () => {
    const config = configWith({
      KEYCLOAK_URL: 'https://auth.example.com',
      KEYCLOAK_INTERNAL_URL: undefined,
    });

    expect(internalKeycloakUrl(config)).toBe('https://auth.example.com');
  });

  // The compose case: the issuer stays public, the lookup goes over the
  // compose network. Getting this wrong means every request answers 401.
  it('prefers the internal URL when one is set', () => {
    const config = configWith({
      KEYCLOAK_URL: 'https://auth.example.com',
      KEYCLOAK_INTERNAL_URL: 'http://keycloak:8080',
    });

    expect(internalKeycloakUrl(config)).toBe('http://keycloak:8080');
  });
});

describe('KEYCLOAK_INTERNAL_URL in the env schema', () => {
  // `KEYCLOAK_INTERNAL_URL=` in a .env file arrives as an empty string, not as
  // `undefined` — and an empty string is not a URL. Without the union the
  // server would refuse to boot on the documented default.
  it('treats an empty value as "not set"', () => {
    const env = validateEnv({ ...baseEnv, KEYCLOAK_INTERNAL_URL: '' });

    expect(env.KEYCLOAK_INTERNAL_URL).toBeUndefined();
  });

  it('accepts an absent value', () => {
    expect(validateEnv(baseEnv).KEYCLOAK_INTERNAL_URL).toBeUndefined();
  });

  it('keeps a real URL', () => {
    const env = validateEnv({
      ...baseEnv,
      KEYCLOAK_INTERNAL_URL: 'http://keycloak:8080',
    });

    expect(env.KEYCLOAK_INTERNAL_URL).toBe('http://keycloak:8080');
  });

  it('still rejects something that is not a URL', () => {
    expect(() =>
      validateEnv({ ...baseEnv, KEYCLOAK_INTERNAL_URL: 'keycloak:8080' }),
    ).toThrow(/KEYCLOAK_INTERNAL_URL/);
  });
});
