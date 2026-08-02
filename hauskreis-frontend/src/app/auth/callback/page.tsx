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
import { useSlow } from '@/lib/use-slow';

export default function AuthCallbackPage() {
  const auth = useAuth();
  const router = useRouter();

  const done = auth.isAuthenticated && !auth.activeNavigator;
  // Der Tausch von Code gegen Token hat keine eigene Frist. Reißt die
  // Verbindung dabei ab (unter WSL keine Seltenheit), bliebe man ohne diesen
  // Hinweis für immer auf „wird abgeschlossen" sitzen.
  const slow = useSlow(!done && !auth.error);

  useEffect(() => {
    if (done) {
      router.replace('/');
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
  }, [done, auth.isLoading, auth.activeNavigator, router]);

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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-shell p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
