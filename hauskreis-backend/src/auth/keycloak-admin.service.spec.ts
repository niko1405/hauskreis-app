/**
 * Welchen Endpunkt eine Mail nimmt — und warum das mehr als eine URL ist.
 *
 * Keycloak wählt die Vorlage nach dem Endpunkt, nicht nach den Aktionen im
 * Rumpf. `execute-actions-email` rendert deshalb **immer** `executeActions`,
 * bei uns die Einladung. Genau daran hing der Fehler, dass ein Adresswechsel
 * eine Einladung verschickte, und der ist an keiner Signatur zu erkennen:
 * beide Aufrufe geben `true` zurück und liefern eine Mail ab. Nur die falsche.
 */
import { KeycloakAdminService } from './keycloak-admin.service';
import type { AppConfigService } from '../config/config.service';

const CONFIG: Record<string, string> = {
  KEYCLOAK_URL: 'http://keycloak:8080',
  KEYCLOAK_REALM: 'hauskreis',
  KEYCLOAK_CLIENT_ID: 'hauskreis-backend',
  KEYCLOAK_CLIENT_SECRET: 'secret',
  KEYCLOAK_FRONTEND_CLIENT_ID: 'hauskreis-app',
  APP_URL: 'http://localhost:3001',
};

/** Alle Aufrufe an Keycloak, in der Reihenfolge, in der sie passiert sind. */
function setup() {
  const calls: { url: string; method: string; body?: string }[] = [];

  const fetchMock = jest.fn((url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    });

    // Der Token-Abruf ist der einzige Aufruf mit einem Rumpf, den der Dienst
    // selbst auswertet.
    if (url.includes('/protocol/openid-connect/token')) {
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: 'tok', expires_in: 300 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    if (url.includes('/users?email=')) {
      return Promise.resolve(
        new Response(JSON.stringify([{ id: 'kc-1' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    return Promise.resolve(new Response(null, { status: 204 }));
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  const service = new KeycloakAdminService({
    get: (key: string) => CONFIG[key],
  } as unknown as AppConfigService);

  return { service, calls };
}

/** Die Aufrufe ohne den Token-Abruf, der jede Runde einleitet. */
const withoutToken = (calls: { url: string }[]) =>
  calls.filter((call) => !call.url.includes('/protocol/openid-connect/'));

describe('KeycloakAdminService — Bestätigungsmail', () => {
  it('nimmt send-verify-email, nicht execute-actions-email', async () => {
    const { service, calls } = setup();

    await service.resendVerification('kc-1');

    const mail = withoutToken(calls).at(-1);
    expect(mail?.url).toContain('/users/kc-1/send-verify-email');
    expect(mail?.url).not.toContain('execute-actions-email');
  });

  /** Ohne den Rückweg landet man am Ende auf einer Keycloak-Seite. */
  it('nimmt den Rückweg in die App mit', async () => {
    const { service, calls } = setup();

    await service.resendVerification('kc-1');

    const mail = withoutToken(calls).at(-1);
    expect(mail?.url).toContain('client_id=hauskreis-app');
    expect(mail?.url).toContain(
      `redirect_uri=${encodeURIComponent('http://localhost:3001')}`,
    );
    expect(mail?.url).toContain('lifespan=604800');
  });

  it('schickt sie auch beim Adresswechsel', async () => {
    const { service, calls } = setup();

    await service.changeEmail('kc-1', 'neu@example.com');

    const urls = withoutToken(calls).map((call) => call.url);
    expect(urls.some((url) => url.includes('/send-verify-email'))).toBe(true);
    expect(urls.some((url) => url.includes('execute-actions-email'))).toBe(
      false,
    );
  });

  /**
   * Die Einladung bleibt, wo sie war: sie braucht drei Schritte, und dafür
   * gibt es nur `execute-actions-email`.
   */
  it('lässt die Einladung bei execute-actions-email', async () => {
    const { service, calls } = setup();

    await service.resendInvitation('wer@example.com');

    const mail = withoutToken(calls).at(-1);
    expect(mail?.url).toContain('execute-actions-email');
    expect(mail?.body).toBe(
      JSON.stringify(['UPDATE_PROFILE', 'UPDATE_PASSWORD', 'VERIFY_EMAIL']),
    );
  });
});
