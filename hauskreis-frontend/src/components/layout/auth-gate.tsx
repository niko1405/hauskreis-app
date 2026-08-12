'use client';

/**
 * Alles hinter der Anmeldung.
 *
 * Drei Zustände, die sich unterscheiden müssen: nicht angemeldet (Login),
 * angemeldet aber unbekannt (`/api/me` → 404: der Mensch hat ein
 * Keycloak-Konto, aber keine Person im Hauskreis) und angemeldet und bekannt.
 */
import { LogIn, MailCheck } from 'lucide-react';
import { useAuth } from 'react-oidc-context';
import {
  useMe,
  useMeetingSchedule,
  useResendVerification,
} from '@/lib/api/hooks';
import { isEmailUnverified } from '@/lib/api/errors';
import { useSessionRestore } from '@/lib/auth/use-session-restore';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { useSlow } from '@/lib/use-slow';
import { setGroupZone } from '@/lib/date';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { NoHauskreisScreen } from '@/features/onboarding/no-hauskreis-screen';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const restore = useSessionRestore();
  const me = useMe();
  const hauskreis = useHauskreis();
  // Die Uhr der Gruppe. Sie gehört in den Boot-Satz, weil ohne sie nicht
  // feststeht, welchen Tag wir haben — und daran hängen „Kommende" gegen
  // „Vergangene", das „Vorbei"-Abzeichen und jedes Abhaken. Solange sie nicht
  // da ist, wird nichts gezeigt: eine Sekunde Warten ist besser als eine
  // Terminliste, die gleich danach umspringt.
  const schedule = useMeetingSchedule();

  if (schedule.data) setGroupZone(schedule.data.data.timeZone);

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

  // Kein Fehler, sondern der normale Anfang: gründen oder einladen lassen.
  if (me.notInvited)
    return <NoHauskreisScreen email={auth.user?.profile.email} />;

  // Angemeldet, aber die Adresse ist unbestätigt. Ein eigener Zustand und kein
  // Fehler: es ist nichts kaputt, es fehlt ein Klick in einer Mail.
  if (isEmailUnverified(me.error))
    return <VerifyEmailScreen email={auth.user?.profile.email} />;

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
    return <NoHauskreisScreen email={auth.user?.profile.email} />;
  }

  if (schedule.isLoading) {
    return (
      <FullScreenHint
        text="Einen Moment …"
        slowHint="Der Server antwortet nicht. Mit Netz hilft ein neuer Versuch."
      />
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
 * „Bestätige deine Adresse."
 *
 * Der Zustand entsteht auf zwei Wegen: nach einer Selbstregistrierung und nach
 * einem Adresswechsel im Profil. Beide Male ist das Konto in Ordnung und nur
 * die Adresse noch nicht nachgewiesen — `AuthGuard` lässt deshalb niemanden
 * durch, und das ist Absicht: Konten werden über die Adresse mit offenen
 * Einladungen verknüpft.
 *
 * „Ich habe bestätigt" führt bewusst über `signinRedirect` und nicht über ein
 * Neuladen. Das Token im Speicher trägt weiterhin `email_verified: false`, und
 * eine stille Erneuerung ändert daran nichts — Keycloak führt beim
 * Refresh-Grant keine Required Actions aus. Nur eine echte Anmeldung stellt ein
 * Token mit dem neuen Stand aus.
 */
function VerifyEmailScreen({ email }: { email?: string }) {
  const auth = useAuth();
  const resend = useResendVerification();
  const toast = useToast();

  return (
    <FullScreen>
      <div className="rounded-card border border-line bg-card p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-500">
          <MailCheck size={22} />
        </div>
        <h1 className="mt-4 font-serif text-2xl font-bold text-stone-900">
          Bestätige deine Adresse
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-500">
          Wir haben dir eine Mail geschickt
          {email ? ` an ${email}` : ''}. Klick den Link darin — danach geht es
          hier weiter.
        </p>

        <Button
          size="lg"
          className="mt-6 w-full"
          onClick={() => void auth.signinRedirect()}
        >
          Ich habe bestätigt
        </Button>

        <Button
          variant="secondary"
          size="sm"
          className="mt-2 w-full"
          loading={resend.isPending}
          // Kein `onError`: `useApiMutation` meldet einen Fehlschlag selbst.
          // Was es nicht wissen kann, ist der geglückte Aufruf, der trotzdem
          // keine Mail hinterlässt — das sagt erst `verificationEmailSent`.
          onClick={() =>
            resend.mutate(undefined, {
              onSuccess: (result) =>
                result.verificationEmailSent
                  ? toast.success('Mail ist unterwegs.')
                  : toast.error(
                      'Die Mail ging nicht raus — der Mailserver klemmt.',
                    ),
            })
          }
        >
          Mail erneut senden
        </Button>

        <button
          type="button"
          className="mt-5 text-xs text-stone-400 underline underline-offset-2"
          onClick={() => void auth.signoutRedirect()}
        >
          Abmelden
        </button>
      </div>
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

        <p className="mt-5 text-sm text-stone-500">
          Kein Account?{' '}
          <button
            type="button"
            className="font-medium text-stone-900 underline underline-offset-2"
            onClick={() => void auth.signinRedirect({ prompt: 'create' })}
          >
            Registrieren
          </button>
        </p>
      </div>
    </FullScreen>
  );
}
