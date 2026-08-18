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

/**
 * Alle Aufrufe an Keycloak, in der Reihenfolge, in der sie passiert sind.
 *
 * `credentials` sagt, ob das Konto schon ein Passwort hat — daran hängt, ob die
 * Einladung eines verlangt.
 */
function setup({ credentials = [] as unknown[] } = {}) {
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

    if (url.includes('/credentials')) {
      return Promise.resolve(
        new Response(JSON.stringify(credentials), {
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
   * Die Einladung bleibt, wo sie war: sie braucht mehrere Schritte, und dafür
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

/**
 * Wer schon ein Passwort hat, soll keines neu setzen müssen.
 *
 * Der Fall kommt öfter vor, als er klingt: jemand wechselt den Hauskreis, oder
 * eine zweite Einladung geht raus, weil die erste nicht ankam. Beide Male
 * verlangte der Link ein neues Passwort — um irgendwo hinzukommen, wo die
 * Person längst hineinkam. Das ist nicht bloß lästig, es sieht aus wie ein
 * Angriff.
 */
describe('KeycloakAdminService — was die Einladung verlangt', () => {
  it('fragt nach einem Passwort, solange keines da ist', async () => {
    const { service, calls } = setup({ credentials: [] });

    await service.resendInvitation('neu@example.com');

    expect(withoutToken(calls).at(-1)?.body).toBe(
      JSON.stringify(['UPDATE_PROFILE', 'UPDATE_PASSWORD', 'VERIFY_EMAIL']),
    );
  });

  it('lässt den Schritt weg, wenn das Konto schon eines hat', async () => {
    const { service, calls } = setup({ credentials: [{ type: 'password' }] });

    await service.resendInvitation('alt@example.com');

    expect(withoutToken(calls).at(-1)?.body).toBe(
      JSON.stringify(['UPDATE_PROFILE', 'VERIFY_EMAIL']),
    );
  });

  /**
   * `VERIFY_EMAIL` bleibt in beiden Fällen drin: Ist die Adresse bestätigt, ist
   * die Aktion beim Öffnen sofort erledigt und niemand sieht sie. Fehlt sie,
   * kommt niemand herein — der AuthGuard weist jedes Token ohne
   * `email_verified` ab.
   */
  it('fragt im Zweifel lieber nach — eine unlesbare Antwort sperrt niemanden aus', async () => {
    // Keycloak antwortet mit 204 und leerem Rumpf; `request` gibt dann
    // `undefined` zurück, kein leeres Feld.
    const { service, calls } = setup({
      credentials: undefined as unknown as unknown[],
    });

    await service.resendInvitation('unklar@example.com');

    const mail = withoutToken(calls).at(-1);
    expect(mail?.url).toContain('execute-actions-email');
    expect(mail?.body).toBe(
      JSON.stringify(['UPDATE_PROFILE', 'UPDATE_PASSWORD', 'VERIFY_EMAIL']),
    );
  });

  /**
   * **Ein bestehendes Konto bekommt trotzdem eine Mail.** Vorher stieg
   * `inviteUser` wortlos aus — die eingeladene Person erfuhr nichts und
   * wartete, während in der Verwaltung „eingeladen" stand.
   */
  it('meldet sich auch bei einem Konto, das es schon gibt', async () => {
    const { service, calls } = setup({ credentials: [{ type: 'password' }] });

    const result = await service.inviteUser({ email: 'alt@example.com' });

    expect(result).toEqual({ created: false, invitationEmailSent: true });
    // Kein zweites Konto: der POST auf /users bleibt aus.
    expect(
      withoutToken(calls).some(
        (call) => call.method === 'POST' && call.url.endsWith('/users'),
      ),
    ).toBe(false);
    expect(withoutToken(calls).at(-1)?.url).toContain('execute-actions-email');
  });
});
