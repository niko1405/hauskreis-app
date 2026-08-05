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
import {
  setAccessTokenGetter,
  setAuthorizedHandler,
  setUnauthorizedHandler,
} from '../api/client';

/** Wie oft eine stille Erneuerung es versuchen darf, bevor wir es lassen. */
const MAX_RECOVERIES = 3;
/** Und wie viel Zeit dazwischen liegen muss. */
const RECOVERY_COOLDOWN_MS = 10_000;

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
  // Und eine zweite Bremse für den Fall, dass die Erneuerung zwar gelingt, das
  // Ergebnis aber nichts ändert. Genau so entstand einmal eine Schleife ohne
  // Ende: der Server wies das Token wegen einer unbestätigten Adresse ab, die
  // Erneuerung lieferte brav ein neues, und das trug denselben Mangel. Ein
  // neues Token kann nur helfen, wenn das alte zu alt war — hilft es dreimal
  // hintereinander nicht, liegt es an etwas anderem, und dann gehört der Fehler
  // sichtbar gemacht statt in Anfragen übersetzt.
  const attempts = useRef(0);
  const lastAttemptAt = useRef(0);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (recovering.current) return;
      if (attempts.current >= MAX_RECOVERIES) return;
      if (Date.now() - lastAttemptAt.current < RECOVERY_COOLDOWN_MS) return;

      recovering.current = true;
      attempts.current += 1;
      lastAttemptAt.current = Date.now();

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
    if (!token || !previous || token === previous) return;
    // Nur solange wir noch daran glauben. Ohne diese Bedingung wäre die Bremse
    // oben wirkungslos: `automaticSilentRenew` erneuert alle fünf Minuten von
    // selbst, und jede Erneuerung stieße wieder den ganzen Cache an.
    if (attempts.current >= MAX_RECOVERIES) return;
    void queryClient.invalidateQueries();
  }, [token, queryClient]);

  // Sobald wieder etwas durchkommt, ist der Zähler seine Sache los.
  useEffect(() => setAuthorizedHandler(() => (attempts.current = 0)), []);

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
