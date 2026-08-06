'use client';

/**
 * Ein abgesagter Abend soll wie einer aussehen.
 *
 * Vorher blieb davon ein kleines Abzeichen oben in der Ecke übrig, während
 * darunter alles weiter bedienbar war — man konnte einem Termin, den es nicht
 * mehr gibt, noch Lieder und Rollen zuweisen. Und es stand nirgends, warum er
 * ausfällt.
 *
 * Deshalb hier drei Stücke: der Hinweis, der ganz oben steht und die Fragen
 * beantwortet (seit wann, von wem, warum), der Absage-Knopf ganz unten —
 * **nur für Admins** —, und daneben das Löschen für einen besonderen Termin.
 * Den ganzen Abend abzusagen ist etwas anderes, als selbst nicht zu kommen;
 * letzteres steht in „Wer kommt".
 *
 * Absagen und Löschen sind ebenfalls nicht dasselbe: ein Dienstag, der
 * ausfällt, gehört in die Geschichte der Gruppe. Ein Geburtstag, den jemand
 * versehentlich angelegt hat, war nie da.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarX, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import {
  useCancelMeeting,
  useDeleteMeeting,
  useMe,
  useUncancelMeeting,
} from '@/lib/api/hooks';
import { formatTimestamp } from '@/lib/date';
import { meetingHeadline } from '@/lib/meeting';
import type { Meeting } from '@/lib/api/types';

export function CancelledNotice({ meeting }: { meeting: Meeting }) {
  const { isAdmin } = useMe();
  const uncancel = useUncancelMeeting(meeting.id);
  const toast = useToast();

  const automatic = meeting.cancelSource === 'ALL_DECLINED';

  return (
    <Card className="space-y-3 border-alert-line bg-alert-bg">
      <div className="flex items-start gap-3">
        <CalendarX size={18} className="mt-0.5 shrink-0 text-alert" />
        <div className="min-w-0">
          <p className="font-serif text-lg font-bold text-alert">Fällt aus</p>
          <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
            {automatic
              ? 'Alle hatten für diesen Abend abgesagt. Sagt jemand doch zu, findet er wieder statt.'
              : meeting.cancelledBy
                ? `Abgesagt von ${meeting.cancelledBy.name}.`
                : 'Abgesagt.'}
            {meeting.cancelledAt && ` ${formatTimestamp(meeting.cancelledAt)}`}
          </p>
        </div>
      </div>

      {meeting.cancelReason && (
        <p className="rounded-md bg-card/70 px-3 py-2 text-sm leading-relaxed text-stone-700">
          {meeting.cancelReason}
        </p>
      )}

      {isAdmin && (
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          loading={uncancel.isPending}
          onClick={() =>
            uncancel.mutate(undefined, {
              onSuccess: () => toast.success('Der Abend findet wieder statt.'),
            })
          }
        >
          <RotateCcw size={14} />
          Absage zurücknehmen
        </Button>
      )}
    </Card>
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
        <p className="mt-2 text-center text-[11px] text-stone-400">
          {past
            ? 'Nur ein Vermerk fürs Archiv — es geht keine Benachrichtigung raus.'
            : 'Alle bekommen eine Benachrichtigung.'}
        </p>
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
 * „Termin löschen" — nur bei einem besonderen, nur für Admins.
 *
 * Der Unterschied zum Absagen ist kein technischer: ein Hauskreis-Abend, der
 * ausfällt, bleibt Teil der Geschichte und der Vorschlagslogik, und der
 * Terminplaner legte ihn ohnehin wieder an. Ein versehentlich angelegter
 * Geburtstag dagegen war nie da — deshalb geht dafür auch keine Nachricht
 * raus, während eine Absage alle erreicht.
 *
 * Auch an einem abgesagten Termin sichtbar: ein abgesagter besonderer Termin
 * ist genau der, den man loswerden will.
 */
export function DeleteMeetingBlock({ meeting }: { meeting: Meeting }) {
  const router = useRouter();
  const { isAdmin } = useMe();
  const remove = useDeleteMeeting();
  const confirm = useConfirm();
  const toast = useToast();

  if (!isAdmin || meeting.type !== 'CUSTOM') return null;

  const ask = async () => {
    const ok = await confirm({
      title: `„${meetingHeadline(meeting)}" löschen?`,
      body: 'Zusagen, Liedvorschläge und Zuteilungen dieses Termins gehen mit. Niemand bekommt eine Nachricht darüber.',
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

  return (
    <div>
      <Button
        variant="ghost"
        className="w-full text-alert"
        loading={remove.isPending}
        onClick={ask}
      >
        <Trash2 size={15} />
        Termin löschen
      </Button>
      <p className="mt-2 text-center text-[11px] text-stone-400">
        Weg ist weg — und niemand bekommt eine Nachricht.
      </p>
    </div>
  );
}
