'use client';

/**
 * Sitzung beim Start wiederherstellen.
 *
 * `react-oidc-context` meldet `isAuthenticated: false`, sobald das
 * **Access-Token** abgelaufen ist — und das ist es nach fünf Minuten. Ohne
 * diesen Schritt sähe man deshalb schon nach kurzer Pause wieder den
 * Login-Bildschirm, obwohl ein voll gültiges Refresh-Token danebenliegt.
 *
 * `automaticSilentRenew` hilft hier nicht: der Erneuerungs-Timer wird aus der
 * Restlaufzeit des Tokens gestellt, und bei einem bereits abgelaufenen Token
 * wird er gar nicht erst gesetzt (`AccessTokenEvents.load`: „canceling
 * existing expiring timer because we're past expiration").
 */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { getUserManager } from './oidc-config';

export type RestoreState =
  /** Noch nicht entschieden — nichts anzeigen, was flackert. */
  | 'checking'
  /** Ein Refresh-Token ist da, das Token wird gerade erneuert. */
  | 'restoring'
  /** Fertig: entweder angemeldet oder wirklich abgemeldet. */
  | 'settled';

export function useSessionRestore(): RestoreState {
  const auth = useAuth();
  const [state, setState] = useState<RestoreState>('checking');
  const attempted = useRef(false);

  useEffect(() => {
    // Erst wenn der Provider seinen gespeicherten Stand geladen hat.
    if (auth.isLoading || attempted.current) return;
    attempted.current = true;

    if (auth.isAuthenticated) {
      setState('settled');
      return;
    }

    const manager = getUserManager();
    if (!manager) {
      setState('settled');
      return;
    }

    void manager.getUser().then((stored) => {
      // Kein Refresh-Token: dann ist es eine echte Abmeldung, und der
      // Login-Bildschirm ist richtig. Ohne diese Prüfung würde
      // `signinSilent` auf den iframe-Weg ausweichen und dort in einen
      // Timeout laufen.
      if (!stored?.refresh_token) {
        setState('settled');
        return;
      }

      setState('restoring');
      void auth
        .signinSilent()
        .then((user) => {
          // `signinSilent` wirft nicht. Der Provider fängt den Fehler selbst,
          // schreibt ihn nach `auth.error` und gibt `null` zurück — ein
          // `catch` hier wäre toter Code. `null` heißt: das Refresh-Token
          // trägt nicht mehr (30 Tage ungenutzt, Realm neu eingespielt,
          // woanders abgemeldet).
          //
          // Dann muss es aus dem Speicher: sonst versucht es jeder weitere
          // Start erneut und erzeugt jedes Mal einen REFRESH_TOKEN_ERROR bei
          // Keycloak, ohne dass es je gelingen könnte.
          if (!user) void auth.removeUser();
        })
        .finally(() => setState('settled'));
    });
  }, [auth, auth.isLoading, auth.isAuthenticated]);

  return state;
}
