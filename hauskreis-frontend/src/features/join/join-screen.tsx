'use client';

/**
 * Beitreten über einen Einladungslink — `/beitreten#<code>`.
 *
 * Außerhalb von `AuthGate`, weil hier oft jemand ankommt, der noch gar kein
 * Konto hat: Die erste Frage ist „wofür lege ich das gerade an?", und die
 * beantwortet der Name des Hauskreises, bevor irgendwer sich anmeldet.
 *
 * Danach hängt alles daran, wer davorsitzt:
 *
 * - **nicht angemeldet** — anmelden, registrieren oder weiter mit Google; alle
 *   Wege kommen hierher zurück (`returnTo`, und zur Sicherheit der Merker in
 *   `pending-join.ts`);
 * - **ohne Hauskreis** — ein Knopf, keine Rückfrage: Es gibt nichts zu verlieren;
 * - **schon dabei** — nichts zu tun;
 * - **in einem anderen Hauskreis** — die Rückfrage, ob man wechseln will. Sie
 *   steht auch im Server: Ohne Bestätigung antwortet er mit `409`.
 *
 * Über den Link kommt man immer als Mitglied herein; das sagt die Seite nicht
 * eigens, weil es für den, der beitritt, keine Frage ist.
 */
import { useEffect, useState } from 'react';
import { DoorOpen, HousePlus, LinkIcon, LogIn } from 'lucide-react';
import { useAuth } from 'react-oidc-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  FullScreen,
  TermsScreen,
  VerifyEmailScreen,
} from '@/components/layout/auth-gate';
import { IdpButtons } from '@/components/layout/idp-buttons';
import { LegalFooter } from '@/components/layout/legal-footer';
import { useJoinViaLink, useMe, useResolveInviteLink } from '@/lib/api/hooks';
import {
  errorMessage,
  isEmailUnverified,
  isStatus,
  isSwitchNotConfirmed,
  isTermsNotAccepted,
} from '@/lib/api/errors';
import { useSessionRestore } from '@/lib/auth/use-session-restore';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import {
  codeFromHash,
  forgetPendingJoin,
  rememberPendingJoin,
  usePendingJoin,
} from '@/lib/pending-join';
import { useDissolvesOnLeave } from '@/features/profile/hauskreis-card';
import { SuccessorPicker } from '@/features/profile/successor-picker';

/** Hierher kommt jeder Anmeldeweg zurück; der Code steht im Merker. */
const RETURN_TO = '/beitreten';

export function JoinScreen() {
  const auth = useAuth();
  const restore = useSessionRestore();
  const code = useInviteCode();
  const target = useResolveInviteLink(code.value);

  const starting =
    !code.checked ||
    auth.isLoading ||
    Boolean(auth.activeNavigator) ||
    restore !== 'settled';

  if (starting || (code.value && target.isLoading)) {
    return <Hint text="Einen Moment …" />;
  }

  if (!code.value) {
    return (
      <Dead
        title="Kein Einladungslink"
        text="Hier fehlt etwas. Öffne den Link noch einmal aus der Nachricht, in der er kam."
      />
    );
  }

  if (target.gone) {
    return (
      <Dead
        title="Dieser Link gilt nicht mehr"
        text="Er ist abgelaufen oder wurde erneuert. Frag im Hauskreis nach einem neuen."
        onLeave={forgetPendingJoin}
      />
    );
  }

  if (target.error || !target.data) {
    return (
      <FullScreen>
        <ErrorState
          error={target.error}
          onRetry={() => void target.refetch()}
        />
      </FullScreen>
    );
  }

  const name = target.data.hauskreis.name;

  if (!auth.isAuthenticated) return <SignedOut name={name} />;

  return (
    <SignedIn
      code={code.value}
      targetId={target.data.hauskreis.id}
      name={name}
      email={auth.user?.profile.email}
    />
  );
}

/**
 * Der Code — beim ersten Öffnen aus dem `#`, danach aus dem Merker.
 *
 * Aus der Adresszeile genommen, sobald er gemerkt ist: Was dort steht, landet
 * in der Historie, in Screenshots und beim nächsten Weiterleiten. `checked`
 * hält den Bildschirm so lange zurück, bis das passiert ist — sonst stünde
 * beim ersten Rendern kurz „kein Einladungslink" da.
 */
function useInviteCode(): { value: string | null; checked: boolean } {
  const pending = usePendingJoin();
  const [fromHash, setFromHash] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const found = codeFromHash(window.location.hash);
    if (found) {
      rememberPendingJoin(found);
      setFromHash(found);
      window.history.replaceState(null, '', window.location.pathname);
    }
    setChecked(true);
  }, []);

  return { value: fromHash ?? pending, checked };
}

function SignedOut({ name }: { name: string }) {
  const auth = useAuth();

  return (
    <FullScreen>
      <InviteHeader name={name} />
      <div className="mt-4 rounded-card border border-line bg-card p-6">
        <p className="text-sm leading-relaxed text-stone-500">
          Melde dich an oder leg dir ein Konto an — danach geht es hier mit
          einem Tipp weiter.
        </p>

        <IdpButtons returnTo={RETURN_TO} className="mt-5 space-y-2" />

        <Button
          size="lg"
          className="mt-2 w-full"
          onClick={() =>
            void auth.signinRedirect({ state: { returnTo: RETURN_TO } })
          }
        >
          <LogIn size={16} />
          Mit bestehendem Konto anmelden
        </Button>

        <Button
          variant="ghost"
          className="mt-2 w-full"
          onClick={() =>
            void auth.signinRedirect({
              prompt: 'create',
              state: { returnTo: RETURN_TO },
            })
          }
        >
          Neues Konto erstellen
        </Button>
      </div>
      <LegalFooter className="mt-6" />
    </FullScreen>
  );
}

function SignedIn({
  code,
  targetId,
  name,
  email,
}: {
  code: string;
  targetId: string;
  name: string;
  email?: string;
}) {
  const me = useMe();
  const current = useHauskreis();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const join = useJoinViaLink();
  const dissolves = useDissolvesOnLeave();
  const [successorNeeded, setSuccessorNeeded] = useState(false);
  const [successor, setSuccessor] = useState('');

  if (me.isLoading) return <Hint text="Lade dein Profil …" />;

  if (isEmailUnverified(me.error)) return <VerifyEmailScreen email={email} />;
  if (isTermsNotAccepted(me.error)) return <TermsScreen returnTo={RETURN_TO} />;

  if (me.error && !me.notInvited) {
    return (
      <FullScreen>
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </FullScreen>
    );
  }

  const leaveForApp = () => {
    forgetPendingJoin();
    router.replace('/');
  };

  if (me.me?.hauskreisId === targetId) {
    return (
      <FullScreen>
        <InviteHeader name={name} />
        <div className="mt-4 rounded-card border border-line bg-card p-6 text-center">
          <p className="text-sm leading-relaxed text-stone-500">
            Du bist schon dabei.
          </p>
          <Button size="lg" className="mt-5 w-full" onClick={leaveForApp}>
            Zur App
          </Button>
        </div>
      </FullScreen>
    );
  }

  /** Wer schon woanders ist — sonst gibt es nichts zu verlieren. */
  const switching = Boolean(me.me);
  const currentName = current.hauskreis?.name;

  const submit = () =>
    join.mutate(
      {
        code,
        ...(switching ? { switchConfirmed: true } : {}),
        ...(successor !== '' ? { successorPersonId: successor } : {}),
      },
      {
        onSuccess: () => {
          forgetPendingJoin();
          toast.success(`Du bist bei „${name}".`);
          // Ein Neuladen statt einer Navigation: Hauskreis, Rolle und jede
          // Liste sind andere, und der Cache ist gerade geleert worden.
          window.location.assign('/');
        },
        onError: (error) => {
          // Die Antworten, die Fragen sind, und keine Fehler.
          if (isStatus(error, 400)) {
            setSuccessorNeeded(true);
            return;
          }
          if (isSwitchNotConfirmed(error)) {
            // Der Stand hier war alt: Man ist inzwischen woanders dabei. Mit
            // frischem Profil stellt der Bildschirm die Frage selbst.
            void me.refetch();
            return;
          }
          toast.error(errorMessage(error));
        },
      },
    );

  const ask = async () => {
    if (switching && !successorNeeded) {
      const from = currentName
        ? `„${currentName}"`
        : 'deinen jetzigen Hauskreis';
      const ok = await confirm({
        title: dissolves
          ? `${from} wird damit aufgelöst`
          : `Zu „${name}" wechseln?`,
        body: dissolves
          ? `Du bist die letzte Person, die dort war. Mit dem Wechsel verschwindet ${from} selbst — Termine, Themen, Lieder und das ganze Archiv. Das lässt sich nicht rückgängig machen.`
          : `Du bist danach nicht mehr bei ${from} dabei. Was du dort beigetragen hast, bleibt im Archiv stehen.`,
        confirmLabel: dissolves ? 'Auflösen und wechseln' : 'Wechseln',
        tone: dissolves ? 'danger' : 'neutral',
      });
      if (!ok) return;
    }
    submit();
  };

  return (
    <FullScreen>
      <InviteHeader name={name} />
      <div className="mt-4 space-y-4 rounded-card border border-line bg-card p-6">
        {switching ? (
          <p className="text-sm leading-relaxed text-stone-500">
            Du bist noch bei{' '}
            <strong className="font-semibold text-stone-700">
              {currentName ? `„${currentName}"` : 'einem anderen Hauskreis'}
            </strong>
            . Wenn du „{name}" beitrittst, verlässt du ihn — was du dort
            beigetragen hast, bleibt im Archiv stehen.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-stone-500">
            Schön, dass du dazukommst. Ein Tipp, und du bist dabei.
          </p>
        )}

        {successorNeeded && (
          <SuccessorPicker value={successor} onChange={setSuccessor} />
        )}

        <div className="flex gap-2">
          {switching && (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={leaveForApp}
            >
              Abbrechen
            </Button>
          )}
          <Button
            className="flex-1"
            size={switching ? 'md' : 'lg'}
            loading={join.isPending}
            disabled={successorNeeded && successor === ''}
            onClick={() => void ask()}
          >
            {switching ? (
              <>
                <DoorOpen size={15} />
                Wechseln
              </>
            ) : (
              <>
                <HousePlus size={15} />
                Beitreten
              </>
            )}
          </Button>
        </div>
      </div>
    </FullScreen>
  );
}

/** „Du bist eingeladen" — derselbe Kopf in jedem Zustand mit gültigem Link. */
function InviteHeader({ name }: { name: string }) {
  return (
    <header className="text-center">
      <p className="text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
        Einladung
      </p>
      <h1 className="mt-1 font-serif text-3xl leading-tight font-bold text-stone-900">
        {name}
      </h1>
      <p className="mt-1.5 text-sm text-stone-500">
        Du bist eingeladen, bei diesem Hauskreis mitzumachen.
      </p>
    </header>
  );
}

function Dead({
  title,
  text,
  onLeave,
}: {
  title: string;
  text: string;
  onLeave?: () => void;
}) {
  const router = useRouter();

  return (
    <FullScreen>
      <div className="rounded-card border border-line bg-card p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-500">
          <LinkIcon size={22} />
        </div>
        <h1 className="mt-4 font-serif text-2xl font-bold text-stone-900">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-500">{text}</p>
        <Button
          variant="secondary"
          className="mt-6 w-full"
          onClick={() => {
            onLeave?.();
            router.replace('/');
          }}
        >
          Zur App
        </Button>
      </div>
    </FullScreen>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <FullScreen>
      <p className="text-center text-sm text-stone-400">{text}</p>
    </FullScreen>
  );
}
