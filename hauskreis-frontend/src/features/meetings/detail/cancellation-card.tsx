'use client';

/**
 * Ein abgesagter Abend soll wie einer aussehen — und sagen, warum er ausfällt.
 *
 * Drei Stücke: die Seite eines abgesagten Abends (`CancelledView`), der
 * Absage-Knopf ganz unten an einem stattfindenden — **nur für Admins** —, und
 * das Löschen. Den ganzen Abend abzusagen ist etwas anderes, als selbst nicht
 * zu kommen; letzteres steht in „Wer kommt".
 *
 * Absagen und Löschen sind ebenfalls nicht dasselbe: ein Dienstag, der
 * ausfällt, gehört in die Geschichte der Gruppe. Ein Termin, den jemand
 * versehentlich angelegt hat, war nie da.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, CalendarX, Check, RotateCcw, Trash2 } from 'lucide-react';
import Link from '@/components/ui/link';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import {
  useCancelMeeting,
  useDeleteMeeting,
  useMe,
  useSetAttendance,
  useUncancelMeeting,
} from '@/lib/api/hooks';
import { formatDayFull, formatDayRange, formatWeekday } from '@/lib/date';
import { isMeetingPast, meetingHeadline } from '@/lib/meeting';
import { markBackNavigation } from '@/lib/page-transition';
import type { Meeting } from '@/lib/api/types';

/**
 * Die Seite eines abgesagten Abends — und nichts sonst.
 *
 * **Eine eigene Ansicht statt der gedämpften Terminseite.** Was an dem Abend
 * geplant war — Ort, Rollen, Lieder, Anwesenheit —, ist keine Auskunft mehr,
 * auf die jemand hinarbeitet, und unter einem Hinweis stand es trotzdem in
 * voller Länge da. Übrig bleibt die eine Nachricht, mittig: dass er ausfällt,
 * welcher es ist, wer ihn abgesagt hat. Kein „Bearbeiten": An einem Abend,
 * den es nicht gibt, ändert man nichts. Oben rechts nur das Löschen, für
 * Admins — ein abgesagter Termin ist oft genau der, den man loswerden will.
 *
 * **Zwei Fassungen**, nach dem Weg in die Absage (`cancelSource`):
 *
 * - **Von Hand** sagt, wer es war, und den Grund. Zurücknehmen dürfen Admins.
 * - **Alle haben abgesagt** sagt das, und der Weg zurück ist eine Zusage, für
 *   jede:n — kein Admin-Eingriff: Der Server erkennt beim Abgleich, dass nicht
 *   mehr alle abgesagt haben, und holt den Abend von selbst zurück. Ist der
 *   Abend vorbei, bewirkt eine Zusage nichts mehr (der Abgleich lässt
 *   vergangene aus); dann bleibt Admins das Zurücknehmen wie bei der anderen
 *   Fassung.
 */
export function CancelledView({ meeting }: { meeting: Meeting }) {
  const { isAdmin, me } = useMe();
  const uncancel = useUncancelMeeting(meeting.id);
  const attend = useSetAttendance(meeting.id);
  const remove = useDeleteMeetingFlow(meeting);
  const toast = useToast();

  const automatic = meeting.cancelSource === 'ALL_DECLINED';
  const past = isMeetingPast(meeting);

  const mayAttend = automatic && !past && Boolean(me);
  const mayUncancel = isAdmin && (!automatic || past);

  // Wie im Kopf der Terminseite: bei einem Zeitraum von wann bis wann.
  const when = meeting.endDate
    ? formatDayRange(meeting.date, meeting.endDate)
    : `${formatWeekday(meeting.date)}, ${formatDayFull(meeting.date)}`;

  return (
    <div className="flex min-h-[calc(100dvh-var(--safe-top)-4rem)] flex-col px-5 pt-safe-4 pb-10">
      <div className="flex items-center justify-between gap-2">
        {/* Ein Link vorwärts auf die Liste, gemeint ist zurück — so geht die
            Seite nach rechts hinaus (`markBackNavigation`). */}
        <Link href="/termine" onClick={markBackNavigation}>
          <IconButton label="Zurück">
            <ArrowLeft size={18} />
          </IconButton>
        </Link>
        {remove.allowed && (
          <IconButton
            label="Termin löschen"
            className="text-alert hover:bg-alert-bg hover:text-alert"
            disabled={remove.pending}
            onClick={() => void remove.ask()}
          >
            <Trash2 size={17} />
          </IconButton>
        )}
      </div>

      <div className="flex flex-1 animate-panel-in flex-col items-center justify-center px-2 pb-12 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-alert-line bg-alert-bg px-3 py-1 text-[11px] font-bold tracking-wider text-alert uppercase">
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {past ? 'Fiel aus' : 'Fällt aus'}
        </span>

        <h1 className="mt-4 font-serif text-3xl leading-tight font-bold text-stone-900">
          {meetingHeadline(meeting)}
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          {when} · {meeting.startTime} Uhr
        </p>

        <span aria-hidden className="my-6 h-px w-12 bg-line-strong" />

        {automatic ? (
          <>
            <p className="text-sm font-semibold text-stone-800">
              Alle haben abgesagt.
            </p>
            {!past && (
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-stone-500">
                Sagt jemand doch zu, findet der Abend wieder statt.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-stone-600">
            {meeting.cancelledBy ? (
              <>
                Abgesagt von{' '}
                <span className="font-bold text-stone-900">
                  {meeting.cancelledBy.name}
                </span>
              </>
            ) : (
              'Abgesagt'
            )}
          </p>
        )}

        {meeting.cancelReason && (
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-stone-500">
            „{meeting.cancelReason}"
          </p>
        )}

        {mayAttend && me && (
          <Button
            variant="outline"
            className="mt-6 text-terracotta-500"
            loading={attend.isPending}
            onClick={() =>
              attend.mutate(
                { personId: me.id, status: 'ATTENDING' },
                {
                  onSuccess: () =>
                    toast.success(
                      'Der Abend findet wieder statt — du bist dabei.',
                    ),
                },
              )
            }
          >
            <Check size={15} />
            Ich bin doch dabei
          </Button>
        )}

        {mayUncancel && (
          <Button
            variant="outline"
            className="mt-6 text-terracotta-500"
            loading={uncancel.isPending}
            onClick={() =>
              uncancel.mutate(undefined, {
                onSuccess: () =>
                  toast.success('Der Abend findet wieder statt.'),
              })
            }
          >
            <RotateCcw size={14} />
            Absage zurücknehmen
          </Button>
        )}
      </div>
    </div>
  );
}

export function CancelMeetingBlock({
  meeting,
  past,
}: {
  meeting: Meeting;
  past: boolean;
}) {
  const { isAdmin } = useMe();
  const cancel = useCancelMeeting(meeting.id);
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');

  // Der Server lässt es ohnehin nicht zu; der Knopf wäre nur eine Einladung in
  // einen 403. Wer selbst nicht kann, sagt das unter „Wer kommt".
  if (!isAdmin) return null;

  const submit = () =>
    cancel.mutate(
      { reason: reason.trim() === '' ? null : reason.trim() },
      {
        onSuccess: () => {
          setAsking(false);
          setReason('');
          toast.success(past ? 'Als abgesagt vermerkt.' : 'Termin abgesagt.');
        },
      },
    );

  if (!asking) {
    return (
      <div>
        <Button
          variant="danger"
          className="w-full"
          onClick={() => setAsking(true)}
        >
          <CalendarX size={15} />
          {past ? 'Als abgesagt markieren' : 'Termin absagen'}
        </Button>
      </div>
    );
  }

  return (
    <Card className="space-y-3 border-alert-line">
      <p className="text-sm font-bold text-stone-800">
        {past ? 'Als abgesagt vermerken?' : 'Den ganzen Abend absagen?'}
      </p>
      {/* Freiwillig, aber der eigentliche Grund für diesen Zwischenschritt:
          ein „fällt aus" ohne Erklärung erzeugt genau die Rückfragen in
          WhatsApp, die die App abschaffen sollte. */}
      <TextInput
        value={reason}
        placeholder="Warum? (freiwillig)"
        aria-label="Grund für die Absage"
        onChange={(event) => setReason(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && submit()}
      />
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => setAsking(false)}
        >
          Zurück
        </Button>
        <Button
          variant="danger"
          className="flex-1"
          loading={cancel.isPending}
          onClick={submit}
        >
          Absagen
        </Button>
      </div>
    </Card>
  );
}

/**
 * „Termin löschen" — nur für Admins, an jedem Termin.
 *
 * Der Unterschied zum Absagen ist kein technischer: Ein Abend, der ausfällt,
 * bleibt Teil der Geschichte und der Vorschlagslogik, und alle erfahren es.
 * Gelöscht wird, was es nie hätte geben sollen — ein versehentlich angelegter
 * Termin, oder ein Dienstag in den Ferien, über den niemand eine Absage lesen
 * will. Deshalb geht dafür auch keine Nachricht raus.
 *
 * Einen **erzeugten** Abend legt der Terminplaner danach nicht wieder an: Der
 * Server merkt sich das Datum. Das sagt die Rückfrage, denn es ist der
 * Unterschied, den man sonst erst nächste Woche bemerkt.
 *
 * Ein Ablauf, zwei Knöpfe: unten an einem stattfindenden Termin
 * (`DeleteMeetingBlock`), oben rechts an einem abgesagten (`CancelledView`).
 */
function useDeleteMeetingFlow(meeting: Meeting) {
  const router = useRouter();
  const { isAdmin } = useMe();
  const remove = useDeleteMeeting();
  const confirm = useConfirm();
  const toast = useToast();

  const ask = async () => {
    const ok = await confirm({
      title: `„${meetingHeadline(meeting)}" löschen?`,
      body: meeting.generated
        ? 'Der Abend verschwindet ganz — auch aus dem Archiv —, und die App legt ihn nicht wieder an. Zusagen, Liedvorschläge und Zuteilungen gehen mit. Niemand bekommt eine Nachricht.'
        : 'Zusagen, Liedvorschläge und Zuteilungen dieses Termins gehen mit. Niemand bekommt eine Nachricht darüber.',
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;

    remove.mutate(meeting.id, {
      onSuccess: () => {
        toast.success('Termin gelöscht.');
        // `replace`, nicht `push`: der Zurück-Knopf führte sonst auf eine
        // Detailseite, die es nicht mehr gibt.
        router.replace('/termine');
      },
    });
  };

  return { allowed: isAdmin, ask, pending: remove.isPending };
}

export function DeleteMeetingBlock({ meeting }: { meeting: Meeting }) {
  const remove = useDeleteMeetingFlow(meeting);

  if (!remove.allowed) return null;

  return (
    <div>
      <Button
        variant="ghost"
        className="w-full text-alert"
        loading={remove.pending}
        onClick={() => void remove.ask()}
      >
        <Trash2 size={15} />
        Termin löschen
      </Button>
    </div>
  );
}
