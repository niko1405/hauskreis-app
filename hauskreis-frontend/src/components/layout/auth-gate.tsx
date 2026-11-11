'use client';

/**
 * Alles hinter der Anmeldung.
 *
 * Drei Zustände, die sich unterscheiden müssen: nicht angemeldet (Login),
 * angemeldet aber unbekannt (`/api/me` → 404: der Mensch hat ein
 * Keycloak-Konto, aber keine Person im Hauskreis) und angemeldet und bekannt.
 */
import { LogIn, MailCheck, ShieldCheck, WifiOff } from 'lucide-react';
import { useAuth } from 'react-oidc-context';
import {
  useMe,
  useMeetingSchedule,
  useResendVerification,
} from '@/lib/api/hooks';
import { isEmailUnverified, isTermsNotAccepted } from '@/lib/api/errors';
import { accountActionArgs } from '@/lib/auth/oidc-config';
import { useSessionRestore } from '@/lib/auth/use-session-restore';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { useOnline } from '@/lib/use-online';
import { useSlow } from '@/lib/use-slow';
import { IdpButtons } from './idp-buttons';
import { LegalFooter } from './legal-footer';
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

  // Dieselbe Bauart: nichts kaputt, es fehlt ein Haken. Die Prüfung steht im
  // Server (`KEYCLOAK_REQUIRE_TERMS`), hier nur der Weg zu Keycloaks Seite.
  if (isTermsNotAccepted(me.error)) return <TermsScreen />;

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

export function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-shell p-6">
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
  const online = useOnline();

  /**
   * Offline ist kein „dauert länger" — es dauert nicht länger, es kommt nichts.
   * Deshalb sofort und nicht erst nach den zwölf Sekunden von `useSlow`.
   *
   * Die App kommt ohne Netz aus dem Zwischenspeicher des Service Workers hoch,
   * findet den Server nicht — und sagt das hier.
   *
   * Kein Knopf: Serwist lädt die Seite von selbst neu, sobald das Netz
   * zurückkommt (`reloadOnOnline`).
   */
  if (!online) {
    return (
      <FullScreen>
        <div className="rounded-card border border-line bg-card p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-500">
            <WifiOff size={22} />
          </div>
          <h1 className="mt-4 font-serif text-2xl font-bold text-stone-900">
            Keine Verbindung
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            Acts2 holt Termine, Themen und Lieder vom Server — dafür brauchst du
            Internet. Sobald du wieder online bist, geht es hier von selbst
            weiter.
          </p>
        </div>
      </FullScreen>
    );
  }

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
export function VerifyEmailScreen({ email }: { email?: string }) {
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
 * „Stimm einmal zu."
 *
 * Der Server lässt niemanden herein, dessen Token die Einwilligung nicht trägt
 * — die zweite Tür neben der bestätigten Adresse. Gefragt wird sie in Keycloak,
 * und zwar über eine Konto-Aktion (`kc_action=TERMS_AND_CONDITIONS`) und nicht
 * über eine bloße Anmeldung: Steht die Aktion am Konto gar nicht aus — etwa bei
 * einem Konto, das vor der Einwilligung angelegt wurde —, zeigte Keycloak beim
 * Anmelden nichts, das neue Token wäre so leer wie das alte, und man stünde
 * wieder hier.
 *
 * `returnTo`, weil derselbe Bildschirm beim Beitreten über einen Link
 * auftaucht — dort soll es danach mit dem Beitreten weitergehen.
 */
export function TermsScreen({ returnTo = '/' }: { returnTo?: string }) {
  const auth = useAuth();

  return (
    <FullScreen>
      <div className="rounded-card border border-line bg-card p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-500">
          <ShieldCheck size={22} />
        </div>
        <h1 className="mt-4 font-serif text-2xl font-bold text-stone-900">
          Noch ein Schritt
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-500">
          In einem Hauskreis geht es auch um Glauben und Gebetsanliegen — das
          sind besonders geschützte Angaben. Bevor es losgeht, brauchen wir
          deshalb einmal deine Zustimmung.
        </p>

        <Button
          size="lg"
          className="mt-6 w-full"
          onClick={() =>
            void auth.signinRedirect(
              accountActionArgs('TERMS_AND_CONDITIONS', returnTo),
            )
          }
        >
          Zur Zustimmung
        </Button>

        <button
          type="button"
          className="mt-5 text-xs text-stone-400 underline underline-offset-2"
          onClick={() => void auth.signoutRedirect()}
        >
          Abmelden
        </button>
      </div>
      <LegalFooter className="mt-6" />
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
      {/* Dieselbe Marke wie auf dem Home-Bildschirm und über Keycloaks
          Anmeldeseite. Sie steht über der Karte statt darin, weil das der
          einzige Bildschirm ohne Kopfbereich ist: ohne sie fängt die App mit
          einem weißen Kasten an, auf dem „Willkommen" steht, und man sieht
          erst im Fließtext, wo man gelandet ist.

          `icon-192.png` bringt seinen Grund schon mit, deshalb die runden
          Ecken — ein Quadrat säße sonst als heller Fleck auf der Leinwand. Als
          `<img>` und nicht über `next/image`: der Export kennt keinen
          Bild-Server, und die Datei liegt ohnehin fertig in `public/` — in der
          Größe, in der sie hier steht. Es gäbe nichts zu optimieren. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-192.png"
        alt="Acts2"
        width={80}
        height={80}
        className="mx-auto mb-5 size-20 rounded-2xl shadow-sm"
      />
      <div className="rounded-card border border-line bg-card p-8 text-center">
        <h1 className="font-serif text-3xl font-bold text-stone-900">
          Willkommen
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-500">
          Schön, dass du da bist! Inspiriert von der allerersten christlichen
          Gemeinschaft aus Apostelgeschichte 2, steht bei uns das Miteinander im
          Mittelpunkt. Acts2 ist eine Hauskreis-App, die deine Kleingruppe bei
          der Organisation unterstützt. Sie hilft euch, Termine zu planen,
          Themen und Lieder zu teilen sowie vieles mehr. Probier es aus und leg
          los!
        </p>
        <Button
          size="lg"
          className="mt-6 w-full"
          onClick={() => void auth.signinRedirect()}
        >
          <LogIn size={16} />
          Anmelden
        </Button>

        <IdpButtons className="mt-2 space-y-2" />

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

      {/* Hier und nicht im Profil: Wer abgemeldet ist, kommt an das Profil
          nicht heran — und genau dieser Bildschirm ist der erste, den jemand
          von Acts2 sieht. */}
      <LegalFooter className="mt-6" />
    </FullScreen>
  );
}
