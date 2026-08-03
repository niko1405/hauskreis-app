/**
 * Keycloak, OpenID Connect, Authorization Code + PKCE.
 *
 * Verwendet wird der **öffentliche** Client `hauskreis-app`. Nicht
 * `hauskreis-backend`: der hat ein Secret und einen Service-Account mit
 * Rechten auf der Realm-Admin-API und gehört nirgends in Frontend-Code.
 */
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { UserManagerSettings } from 'oidc-client-ts';

export const OIDC_AUTHORITY =
  process.env.NEXT_PUBLIC_OIDC_AUTHORITY ??
  'http://localhost:8080/realms/hauskreis';

export const OIDC_CLIENT_ID =
  process.env.NEXT_PUBLIC_OIDC_CLIENT_ID ?? 'hauskreis-app';

/** Muss zur Redirect-URI des Keycloak-Clients passen (`FRONTEND_URL`, Port 3001). */
export const REDIRECT_PATH = '/auth/callback';

function buildSettings(): UserManagerSettings {
  const origin = window.location.origin;

  return {
    authority: OIDC_AUTHORITY,
    client_id: OIDC_CLIENT_ID,
    redirect_uri: `${origin}${REDIRECT_PATH}`,
    post_logout_redirect_uri: origin,
    response_type: 'code',

    /**
     * `offline_access` ist der Unterschied zwischen „bleibt angemeldet" und
     * „muss sich alle halbe Stunde neu anmelden".
     *
     * Ohne den Scope hängt das Refresh-Token an der SSO-Sitzung von Keycloak,
     * und die ist im Realm auf **30 Minuten Leerlauf / 10 Stunden insgesamt**
     * eingestellt. Mit dem Scope stellt Keycloak ein Offline-Token aus: es
     * liegt in der Datenbank statt im Sitzungs-Cache, läuft erst nach 30 Tagen
     * ohne Benutzung ab und hat kein hartes Maximum.
     *
     * Der Preis: das Refresh-Token liegt dauerhaft im localStorage. Wer ein
     * XSS in die App bekommt, hat damit langlebigen Zugriff. Für einen
     * Hauskreis mit neun Leuten auf ihren eigenen Telefonen ist das die
     * richtige Abwägung — die Alternative wäre, sich ständig neu anzumelden.
     */
    scope: 'openid profile email offline_access',

    // Das Access-Token hält fünf Minuten. Ohne Erneuerung kippt die App
    // mitten in der Benutzung auf 401.
    automaticSilentRenew: true,
    // 60 Sekunden vor Ablauf erneuern, damit ein laufender Aufruf nicht
    // ausgerechnet in die Lücke fällt.
    accessTokenExpiringNotificationTimeInSeconds: 60,

    // Beim Abmelden werden die Tokens auch bei Keycloak zurückgezogen. Sonst
    // bliebe ein Offline-Token gültig, obwohl sich jemand abgemeldet hat.
    revokeTokensOnSignout: true,

    // Sitzung übersteht Reload **und** Schließen des Browsers. Mit
    // sessionStorage (der Vorgabe) wäre nach jedem Schließen Schluss.
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  };
}

/**
 * Schickt zu Keycloak, um dort etwas am Konto zu ändern, und kommt danach
 * hierher zurück.
 *
 * Keycloak nennt das eine „application-initiated action": derselbe
 * Anmeldevorgang wie sonst, nur mit einem Zwischenschritt. Das ist der Grund,
 * warum das Passwort nicht über die Keycloak-Account-Konsole geändert wird —
 * so bekommt man dieselbe Seite zu sehen wie beim Einstieg, im Theme der App,
 * und landet danach wieder da, wo man losgelaufen ist.
 */
export function accountActionArgs(action: 'UPDATE_PASSWORD', returnTo: string) {
  return {
    extraQueryParams: { kc_action: action },
    // Kommt als `user.state` zurück; die Callback-Seite liest den Pfad daraus.
    state: { returnTo },
  };
}

/** Wohin nach dem Rücksprung — nur eigene Pfade, kein offener Redirect. */
export function returnPathOf(state: unknown): string {
  if (
    typeof state === 'object' &&
    state !== null &&
    'returnTo' in state &&
    typeof state.returnTo === 'string' &&
    state.returnTo.startsWith('/')
  ) {
    return state.returnTo;
  }
  return '/';
}

/** Der Ausgang einer `accountActionArgs`-Aktion, wie Keycloak ihn meldet. */
export const ACTION_STATUS_PARAM = 'done';

/**
 * Nimmt `code` und `state` aus der Adresszeile, sobald der Tausch durch ist.
 *
 * Solange die Parameter dort stehen, ist jede weitere Ladung dieser Seite ein
 * zweiter Einlöseversuch desselben Codes — ein wiederhergestellter Tab, ein
 * Neuladen, Zurück-und-Neuladen. Keycloak weist den zweiten korrekt ab
 * (`CODE_TO_TOKEN_ERROR`, die Sitzung des ersten bleibt heil), aber es gibt
 * keinen Grund, ihn überhaupt zu ermöglichen.
 *
 * Der Pfad bleibt dabei stehen. Ein `replaceState` auf `/` würde nur die
 * Adresszeile ändern, während Next weiter die Callback-Seite rendert — die
 * Weiterleitung macht dort der Router.
 *
 * Einzige Ausnahme ist `kc_action_status`: die Antwort auf „hat der
 * Passwortwechsel geklappt?". Die wandert in die neue Adresse, statt in eine
 * Modulvariable — so übersteht sie ein zweites Ausführen des Effekts, ohne
 * dass jemand mitzählen muss.
 */
export function clearSigninParams(): void {
  const status = new URLSearchParams(window.location.search).get(
    'kc_action_status',
  );
  const path = status
    ? `${REDIRECT_PATH}?${ACTION_STATUS_PARAM}=${encodeURIComponent(status)}`
    : REDIRECT_PATH;

  window.history.replaceState({}, '', path);
}

let cached: UserManager | undefined;

/**
 * Der UserManager wird selbst gebaut und dem `AuthProvider` übergeben, statt
 * ihn aus Einstellungen erzeugen zu lassen. Grund: nur so kommt man vor dem
 * ersten Rendern an den gespeicherten Stand heran — und genau den braucht die
 * Wiederherstellung, um „abgelaufen, aber erneuerbar" von „wirklich
 * abgemeldet" zu unterscheiden.
 *
 * Auf dem Server gibt es kein `window`; dort bleibt er `undefined`.
 */
export function getUserManager(): UserManager | undefined {
  if (typeof window === 'undefined') return undefined;
  cached ??= new UserManager(buildSettings());
  return cached;
}
