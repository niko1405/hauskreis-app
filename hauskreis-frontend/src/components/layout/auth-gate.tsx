'use client';

/**
 * Alles hinter der Anmeldung.
 *
 * Drei Zustände, die sich unterscheiden müssen: nicht angemeldet (Login),
 * angemeldet aber unbekannt (`/api/me` → 404: der Mensch hat ein
 * Keycloak-Konto, aber keine Person im Hauskreis) und angemeldet und bekannt.
 */
import { LogIn, Mail } from 'lucide-react';
import { useAuth } from 'react-oidc-context';
import { useMe } from '@/lib/api/hooks';
import { useSessionRestore } from '@/lib/auth/use-session-restore';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { useSlow } from '@/lib/use-slow';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const restore = useSessionRestore();
  const me = useMe();
  const hauskreis = useHauskreis();

  const starting =
    auth.isLoading || Boolean(auth.activeNavigator) || restore !== 'settled';

  if (starting) {
    return (
      <FullScreenHint
        text={
          restore === 'restoring'
            ? 'Sitzung wird wiederhergestellt …'
            : 'Einen Moment …'
        }
        // Hängt der Aufruf an Keycloak (kein Timeout in der Bibliothek),
        // bekommt man sonst einen Ladebildschirm ohne Ausweg.
        slowHint="Das dauert länger als üblich — vermutlich ist die Verbindung gerade schlecht."
      />
    );
  }

  // Ein gescheiterter stiller Weg ist kein Anmeldefehler, sondern ein
  // abgelaufenes Token — die richtige Antwort darauf ist der Login-Bildschirm,
  // keine rote Meldung. `auth.error` bleibt sonst stehen, bis eine Anmeldung
  // gelingt (der Reducer löscht ihn nur bei INITIALISED/USER_LOADED), und
  // verdeckt den Anmelde-Knopf dauerhaft.
  const silentFailure =
    auth.error?.source === 'signinSilent' ||
    auth.error?.source === 'renewSilent';

  if (auth.error && !silentFailure) {
    return (
      <FullScreen>
        <ErrorState
          error={new Error(`Anmeldung fehlgeschlagen: ${auth.error.message}`)}
          onRetry={() => void auth.signinRedirect()}
        />
      </FullScreen>
    );
  }

  if (!auth.isAuthenticated) return <LoginScreen />;

  if (me.isLoading) {
    return (
      <FullScreenHint
        text="Lade dein Profil …"
        slowHint="Der Server antwortet nicht. Mit Netz hilft ein neuer Versuch."
      />
    );
  }

  if (me.notInvited)
    return <NotInvitedScreen email={auth.user?.profile.email} />;

  if (me.error) {
    return (
      <FullScreen>
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
        {/* Ausweg, falls die Sitzung kaputt ist: neu anmelden statt festsitzen. */}
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full"
          onClick={() => void auth.signinRedirect()}
        >
          Neu anmelden
        </Button>
      </FullScreen>
    );
  }

  if (hauskreis.isLoading) {
    return (
      <FullScreenHint
        text="Lade deinen Hauskreis …"
        slowHint="Der Server antwortet nicht. Mit Netz hilft ein neuer Versuch."
      />
    );
  }

  if (!hauskreis.hauskreisId) {
    return (
      <FullScreen>
        <ErrorState
          error={
            hauskreis.error ??
            new Error('Zu deinem Konto gehört noch kein Hauskreis.')
          }
        />
      </FullScreen>
    );
  }

  return <>{children}</>;
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-shell p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

/**
 * Wartebildschirm, der nach einer Weile zugibt, dass etwas nicht stimmt, und
 * einen Ausweg anbietet. Ein Ladebalken ohne Ende ist der schlechteste
 * Fehlerzustand — man weiß nicht, ob man warten oder handeln soll.
 */
function FullScreenHint({
  text,
  slowHint,
}: {
  text: string;
  slowHint?: string;
}) {
  const slow = useSlow(true);

  return (
    <FullScreen>
      <p className="text-center text-sm text-stone-400">{text}</p>
      {slow && slowHint && (
        <div className="mt-6 text-center">
          <p className="text-xs leading-relaxed text-stone-400">{slowHint}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => window.location.reload()}
          >
            Erneut versuchen
          </Button>
        </div>
      )}
    </FullScreen>
  );
}

/**
 * Die Anmeldung muss von einem Klick ausgehen — ein automatischer Redirect
 * beim Laden würde die App auf iOS aus dem Home-Bildschirm-Modus werfen.
 */
function LoginScreen() {
  const auth = useAuth();

  return (
    <FullScreen>
      <div className="rounded-card border border-line bg-card p-8 text-center">
        <h1 className="font-serif text-3xl font-bold text-stone-900">
          Hauskreis
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-500">
          Termine, Themen, Songs und Gebetsbuddys — an einem Ort statt in
          fünfzehn WhatsApp-Nachrichten.
        </p>
        <Button
          size="lg"
          className="mt-6 w-full"
          onClick={() => void auth.signinRedirect()}
        >
          <LogIn size={16} />
          Anmelden
        </Button>
      </div>
    </FullScreen>
  );
}

function NotInvitedScreen({ email }: { email: string | undefined }) {
  const auth = useAuth();

  return (
    <FullScreen>
      <div className="rounded-card border border-line bg-card p-8 text-center">
        <Mail size={24} className="mx-auto text-terracotta-500" />
        <h1 className="mt-3 font-serif text-2xl font-bold text-stone-900">
          Noch nicht dabei
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-500">
          Zu {email ? <strong>{email}</strong> : 'deiner Adresse'} gehört noch
          keine Person im Hauskreis. Bitte jemanden mit Admin-Rechten, dich
          einzuladen — danach klappt die Anmeldung sofort.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-5"
          onClick={() => void auth.removeUser()}
        >
          Mit einem anderen Konto anmelden
        </Button>
      </div>
    </FullScreen>
  );
}
