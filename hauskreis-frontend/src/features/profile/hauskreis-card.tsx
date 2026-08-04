'use client';

/**
 * „Dein Hauskreis" — und der Weg heraus.
 *
 * Verlassen ist nicht Abmelden und steht deshalb daneben, nicht darüber: das
 * eine beendet eine Sitzung, das andere eine Mitgliedschaft. Wer geht, dessen
 * Zeile bleibt stehen — vergangene Abende zeigen weiter, wer gehostet hat.
 *
 * Die Nachfolge-Auswahl geht nur auf, wenn sie wirklich nötig ist: als einzige
 * Admin-Person darf man nicht einfach gehen, sonst bliebe eine Gruppe zurück,
 * in der niemand mehr einladen kann. Gefragt wird trotzdem, statt es zu
 * verbieten — sonst säße man für immer in einem Hauskreis fest, den man
 * verlassen will.
 */
import { useState } from 'react';
import { DoorOpen, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { isStatus } from '@/lib/api/errors';
import {
  useAcceptInvitation,
  useInvitations,
  useLeaveHauskreis,
  useMe,
  usePeople,
} from '@/lib/api/hooks';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';

export function HauskreisCard() {
  const { hauskreis, hauskreisId } = useHauskreis();
  const { me } = useMe();
  const [leaving, setLeaving] = useState(false);

  if (!hauskreisId) return null;

  return (
    <section>
      <SectionTitle>Dein Hauskreis</SectionTitle>
      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <Users size={16} className="shrink-0 text-stone-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-stone-800">
              {hauskreis?.name ?? 'Dein Hauskreis'}
            </p>
            <p className="text-[11px] text-stone-400">
              {me?.role === 'ADMIN' ? 'Du bist Admin' : 'Du bist dabei'}
            </p>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-stone-400">
          Ein Mensch gehört zu einem Hauskreis. Für einen Wechsel verlässt du
          diesen zuerst — was du beigetragen hast, bleibt im Archiv stehen.
        </p>

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setLeaving(true)}
        >
          <DoorOpen size={14} />
          Hauskreis verlassen
        </Button>
      </Card>

      <PendingInvitations currentName={hauskreis?.name} />

      {leaving && (
        <LeaveSheet
          hauskreisId={hauskreisId}
          name={hauskreis?.name ?? 'diesen Hauskreis'}
          onClose={() => setLeaving(false)}
        />
      )}
    </section>
  );
}

/**
 * Einladungen, die eintrafen, während man schon woanders dabei war.
 *
 * Sie nehmen der bestehenden Mitgliedschaft nichts weg — bis man sie annimmt.
 * Genau deshalb steht die Rückfrage hier und nicht auf dem Einstiegsbildschirm:
 * dort hat man nichts zu verlieren, hier schon.
 */
function PendingInvitations({ currentName }: { currentName?: string }) {
  const invitations = useInvitations();
  const accept = useAcceptInvitation();
  const toast = useToast();

  const open = invitations.data ?? [];
  if (open.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {open.map((invitation) => (
        <Card
          key={invitation.personId}
          className="space-y-3 border-terracotta-400"
        >
          <div>
            <p className="text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
              Einladung
            </p>
            <p className="mt-0.5 text-sm font-bold text-stone-800">
              {invitation.hauskreis.name}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
              Wenn du annimmst, bist du nicht mehr bei
              {currentName
                ? ` „${currentName}"`
                : ' deinem jetzigen Hauskreis'}{' '}
              dabei.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            loading={accept.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  `Zu „${invitation.hauskreis.name}" wechseln? Du verlässt damit deinen jetzigen Hauskreis.`,
                )
              ) {
                return;
              }

              accept.mutate(
                { personId: invitation.personId },
                {
                  onSuccess: () => {
                    toast.success(
                      `Du bist bei „${invitation.hauskreis.name}".`,
                    );
                    window.location.assign('/');
                  },
                },
              );
            }}
          >
            Wechseln
          </Button>
        </Card>
      ))}
    </div>
  );
}

function LeaveSheet({
  hauskreisId,
  name,
  onClose,
}: {
  hauskreisId: string;
  name: string;
  onClose: () => void;
}) {
  const leave = useLeaveHauskreis(hauskreisId);
  const people = usePeople();
  const { me } = useMe();
  const toast = useToast();

  /**
   * Erst nach dem ersten Versuch. Ob eine Nachfolge nötig ist, weiß nur der
   * Server — hier stünde sonst eine Auswahl im Weg, die meistens überflüssig
   * ist.
   */
  const [successorNeeded, setSuccessorNeeded] = useState(false);
  const [successor, setSuccessor] = useState('');

  const others = (people.data ?? []).filter(
    (person) => person.active && person.id !== me?.id,
  );

  const submit = () =>
    leave.mutate(
      { successorPersonId: successor === '' ? undefined : successor },
      {
        onSuccess: (result) => {
          toast.success(
            result.hauskreisDeleted
              ? `„${name}" ist damit aufgelöst.`
              : `Du bist raus aus „${name}".`,
          );
          // Der Cache ist beim Verlassen ohnehin geleert; ein Neuladen bringt
          // die App auf dem kürzesten Weg zum Einstiegsbildschirm.
          window.location.assign('/');
        },
        onError: (error) => {
          // Der `400` ist keine Panne, sondern die Aufforderung zu wählen.
          if (isStatus(error, 400)) setSuccessorNeeded(true);
        },
      },
    );

  return (
    <Sheet
      open
      onClose={onClose}
      title={`„${name}" verlassen?`}
      subtitle="Deine Einträge bleiben im Archiv stehen"
    >
      <div className="space-y-4">
        {successorNeeded && (
          <div className="space-y-2 rounded-md border border-topic-line bg-topic-bg p-3">
            <p className="text-xs leading-relaxed text-topic">
              Du bist die einzige Person mit Admin-Rechten. Bestimme, wer
              übernimmt — sonst kann danach niemand mehr einladen.
            </p>
            <Select
              value={successor}
              aria-label="Nachfolge"
              onChange={(event) => setSuccessor(event.target.value)}
            >
              <option value="">Bitte wählen</option>
              {others.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Doch nicht
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={successorNeeded && successor === ''}
            loading={leave.isPending}
            onClick={submit}
          >
            Verlassen
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
