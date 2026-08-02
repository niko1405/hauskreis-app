'use client';

/**
 * Verbindet die OIDC-Sitzung mit dem Fetch-Wrapper.
 *
 * Der Wrapper kennt weder React noch `oidc-client-ts`; er fragt nur einen
 * Getter nach dem aktuellen Token. Hier wird dieser Getter gesetzt — und der
 * Umgang mit einem `401`, das auch nach einer stillen Erneuerung bleibt.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuth } from 'react-oidc-context';
import { setAccessTokenGetter, setUnauthorizedHandler } from '../api/client';

export function AuthBridge({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const authRef = useRef(auth);
  authRef.current = auth;

  // Der Getter wird beim **Rendern** gesetzt, nicht in einem Effekt: Effekte
  // laufen von innen nach außen, die Abfragen weiter unten im Baum starten
  // also vor diesem hier. Ohne das ginge der allererste Aufruf ohne
  // Authorization-Header raus und käme mit 401 zurück.
  const installed = useRef(false);
  if (!installed.current) {
    installed.current = true;
    setAccessTokenGetter(() => authRef.current.user?.access_token);
  }

  // Ein 401 kann mehrere parallele Aufrufe gleichzeitig treffen. Ohne diese
  // Sperre liefen daraus mehrere Anmeldeversuche nebeneinander.
  const recovering = useRef(false);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (recovering.current) return;
      recovering.current = true;

      void authRef.current
        .signinSilent()
        .then((user) => {
          if (!user) return authRef.current.signinRedirect();
          return undefined;
        })
        .catch(() => authRef.current.signinRedirect())
        .finally(() => {
          recovering.current = false;
        });
    });
  }, []);

  // Nach einer stillen Erneuerung liegt ein neues Token vor. Abfragen, die
  // vorher mit 401 gescheitert sind, werden nicht von selbst neu geladen —
  // ein 4xx wird bewusst nicht wiederholt. Deshalb hier einmal alles anstoßen.
  const lastToken = useRef<string | undefined>(undefined);
  const token = auth.user?.access_token;

  useEffect(() => {
    const previous = lastToken.current;
    lastToken.current = token;
    if (token && previous && token !== previous) {
      void queryClient.invalidateQueries();
    }
  }, [token, queryClient]);

  return <>{children}</>;
}

/**
 * Ob überhaupt schon eine Anfrage sinnvoll ist.
 *
 * Angemeldet zu sein reicht nicht: `react-oidc-context` stellt die Sitzung
 * asynchron aus dem Speicher wieder her, und bis das Token wirklich da ist,
 * würde jede Abfrage nur einen 401 einsammeln. Daran hängt das `enabled`
 * der beiden Abfragen, die außerhalb des `AuthGate` laufen.
 */
export function useApiReady(): boolean {
  const auth = useAuth();
  return auth.isAuthenticated && Boolean(auth.user?.access_token);
}
