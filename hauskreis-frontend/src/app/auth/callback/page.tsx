'use client';

/**
 * Ziel der Keycloak-Umleitung.
 *
 * `react-oidc-context` erkennt `code` und `state` in der Adresszeile und holt
 * im Hintergrund das Token. Sobald das durch ist, geht es hier per echter
 * Next-Navigation weiter — damit verschwindet auch der `code`-Parameter aus
 * der Adresszeile, ohne dass jemand auf einer toten Seite sitzenbleibt.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hasAuthParams, useAuth } from 'react-oidc-context';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ACTION_STATUS_PARAM, returnPathOf } from '@/lib/auth/oidc-config';
import { useSlow } from '@/lib/use-slow';

export default function AuthCallbackPage() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();

  const done = auth.isAuthenticated && !auth.activeNavigator;
  // Der Tausch von Code gegen Token hat keine eigene Frist. Reißt die
  // Verbindung dabei ab (unter WSL keine Seltenheit), bliebe man ohne diesen
  // Hinweis für immer auf „wird abgeschlossen" sitzen.
  const slow = useSlow(!done && !auth.error);

  useEffect(() => {
    if (done) {
      // Nach einer Konto-Aktion (Passwort ändern) zurück auf den Bildschirm,
      // von dem sie ausging — sonst steht man ohne Erklärung auf der
      // Startseite und weiß nicht, ob etwas passiert ist.
      reportActionStatus(toast);
      router.replace(returnPathOf(auth.user?.state));
      return;
    }
    // Seit die Parameter nach dem Tausch aus der Adresszeile fliegen, ist
    // diese Seite auch ohne sie erreichbar — Neuladen, Lesezeichen, Zurück.
    // Dann gibt es hier nichts abzuschließen, und das Wartefenster wäre eine
    // Sackgasse. `isLoading` bleibt bis zum Abschluss des Tauschs gesetzt,
    // ein laufender Vorgang wird also nicht unterbrochen.
    if (!auth.isLoading && !auth.activeNavigator && !hasAuthParams()) {
      router.replace('/');
    }
  }, [
    done,
    auth.isLoading,
    auth.activeNavigator,
    auth.user?.state,
    router,
    toast,
  ]);

  if (auth.error) {
    return (
      <Centered>
        <ErrorState
          error={new Error(`Anmeldung fehlgeschlagen: ${auth.error.message}`)}
        />
        <Button
          className="mt-3 w-full"
          onClick={() => void auth.signinRedirect()}
        >
          Nochmal anmelden
        </Button>
      </Centered>
    );
  }

  return (
    <Centered>
      <p className="text-center text-sm text-stone-400">
        Anmeldung wird abgeschlossen …
      </p>
      {slow && (
        <div className="mt-6 text-center">
          <p className="text-xs leading-relaxed text-stone-400">
            Das dauert länger als üblich — die Verbindung zu Keycloak ist
            vielleicht abgerissen.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => void auth.signinRedirect()}
          >
            Anmeldung neu starten
          </Button>
        </div>
      )}
    </Centered>
  );
}

/**
 * Sagt, wie eine Konto-Aktion ausgegangen ist, und räumt die Spur hinter sich
 * weg. Das Wegräumen ist kein Kosmetik-Schritt: dadurch darf dieser Aufruf
 * doppelt passieren (React im Entwicklungsmodus tut das), ohne dass zwei
 * Meldungen erscheinen.
 */
function reportActionStatus(toast: ReturnType<typeof useToast>): void {
  const status = new URLSearchParams(window.location.search).get(
    ACTION_STATUS_PARAM,
  );
  if (!status) return;

  window.history.replaceState({}, '', window.location.pathname);

  // `cancelled` bleibt still — wer abbricht, weiß, dass nichts passiert ist.
  if (status === 'success') toast.success('Passwort geändert.');
  if (status === 'error') {
    toast.error('Das hat nicht geklappt — dein Passwort ist unverändert.');
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-shell p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
