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
import { useConfirm } from '@/components/ui/confirm';
import { Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { isStatus } from '@/lib/api/errors';
import {
  useAcceptInvitation,
  useDeleteAccount,
  useInvitations,
  useLeaveHauskreis,
  useMe,
  usePeople,
} from '@/lib/api/hooks';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';

/**
 * Ob mein Weggehen den ganzen Hauskreis mitnähme.
 *
 * Dieselbe Rechnung wie im Server (`membership.service.ts`): Es zählt nicht,
 * wer noch aktiv in der Liste steht, sondern wer schon **einmal da war**.
 * Offene Einladungen und eingesäte Zeilen sind Menschen, die diesen Hauskreis
 * nie gesehen haben — sie können ihn nicht weiterführen, und der Server löst
 * deshalb trotzdem auf.
 *
 * `undefined` heißt „weiß ich noch nicht": `every` auf einer leeren Liste ist
 * `true`, und solange geladen wird, ist die Liste leer. Ein `false` daraus zu
 * machen wäre bequem und ergäbe eine Warnung, die manchmal fehlt; wer diesen
 * Wert benutzt, muss den dritten Zustand aushalten.
 */
export function useDissolvesOnLeave(): boolean | undefined {
  const people = usePeople();
  const { me } = useMe();

  if (people.data === undefined) return undefined;

  return people.data
    .filter((person) => person.active && person.id !== me?.id)
    .every((person) => person.acceptedAt === null);
}

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
          Um einem anderen Hauskreis beizutreten, musst du zunächst diesen
          Hauskreis verlassen — was du beigetragen hast, bleibt im Archiv
          stehen. Du kannst in diesen Hauskreis jederzeit wieder eingeladen
          werden.
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
          mode="leave"
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
  const confirm = useConfirm();

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
            onClick={async () => {
              const ok = await confirm({
                title: `Zu „${invitation.hauskreis.name}" wechseln?`,
                body: currentName
                  ? `Du bist danach nicht mehr bei „${currentName}" dabei. Was du dort beigetragen hast, bleibt im Archiv stehen.`
                  : 'Du verlässt damit deinen jetzigen Hauskreis. Was du dort beigetragen hast, bleibt im Archiv stehen.',
                confirmLabel: 'Wechseln',
              });
              if (!ok) return;

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

/**
 * Gehen oder ganz weg — zwei Wege, ein Sheet.
 *
 * Die Nachfolgeregelung ist bei beiden dieselbe, und sie ist der ganze
 * unangenehme Teil: als einzige Admin-Person darf man nicht einfach
 * verschwinden. Sie zweimal zu schreiben hieße, sie beim nächsten Mal einmal
 * zu ändern.
 */
export function LeaveSheet({
  hauskreisId,
  name,
  mode,
  onClose,
}: {
  hauskreisId: string;
  name: string;
  mode: 'leave' | 'delete';
  onClose: () => void;
}) {
  const leave = useLeaveHauskreis(hauskreisId);
  const remove = useDeleteAccount(hauskreisId);
  const people = usePeople();
  const { me } = useMe();
  const toast = useToast();
  const confirm = useConfirm();

  const action = mode === 'delete' ? remove : leave;

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

  const dissolves = useDissolvesOnLeave();

  /**
   * Die zweite Rückfrage, und sie stellt eine andere Frage als die erste.
   *
   * „Verlassen?" heißt sonst: du bist raus, die anderen machen weiter. Ist man
   * der letzte Mensch hier, heißt derselbe Knopf etwas ganz anderes — dann
   * verschwinden Termine, Themen, Lieder und das Archiv mit. Das erfuhr man
   * bisher erst danach, aus dem Toast („… ist damit aufgelöst"), also zu einem
   * Zeitpunkt, an dem nichts mehr zu entscheiden war.
   *
   * Sie steht **zusätzlich** zum Hinweis im Sheet, nicht an seiner Stelle: der
   * Hinweis sagt es, bevor man drückt, die Rückfrage lässt es einen bestätigen.
   */
  const submit = async () => {
    if (dissolves) {
      const ok = await confirm({
        title: `„${name}" wird damit aufgelöst`,
        body: 'Du bist die letzte Person, die hier war. Mit diesem Schritt verschwindet der Hauskreis selbst — Termine, Themen, Lieder und das ganze Archiv. Das lässt sich nicht rückgängig machen.',
        confirmLabel: 'Auflösen',
        tone: 'danger',
      });
      if (!ok) return;
    }

    action.mutate(
      { successorPersonId: successor === '' ? undefined : successor },
      {
        onSuccess: (result) => {
          toast.success(
            mode === 'delete'
              ? result.hauskreisDeleted
                ? `Dein Konto ist gelöscht — „${name}" damit auch.`
                : 'Dein Konto ist gelöscht.'
              : result.hauskreisDeleted
                ? `„${name}" ist damit aufgelöst.`
                : `Du bist raus aus „${name}".`,
          );
          // Der Cache ist ohnehin geleert; ein Neuladen bringt die App auf dem
          // kürzesten Weg zum Einstiegsbildschirm.
          window.location.assign('/');
        },
        onError: (error) => {
          // Der `400` ist keine Panne, sondern die Aufforderung zu wählen.
          if (isStatus(error, 400)) setSuccessorNeeded(true);
        },
      },
    );
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={mode === 'delete' ? 'Konto löschen?' : `„${name}" verlassen?`}
      subtitle={
        mode === 'delete'
          ? 'Das lässt sich nicht rückgängig machen'
          : 'Deine Einträge bleiben im Archiv stehen'
      }
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Doch nicht
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            // Solange die Liste lädt, weiß niemand, ob dieser Schritt den
            // Hauskreis mitnimmt — und `every` auf einer leeren Liste sagt
            // fälschlich ja. Lieber eine Sekunde warten als ohne Warnung
            // auflösen.
            disabled={
              people.data === undefined || (successorNeeded && successor === '')
            }
            loading={action.isPending}
            onClick={() => void submit()}
          >
            {mode === 'delete' ? 'Endgültig löschen' : 'Verlassen'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Der wichtigste Satz zuerst, und zwar bevor jemand drückt. Ohne ihn
            stand die Auflösung nur in der Rückfrage danach — ein Dialog über
            einem Sheet, an einer Stelle, an der man schon entschieden zu haben
            glaubte. */}
        {dissolves && (
          <div className="rounded-md border border-alert-line bg-alert-bg p-3">
            <p className="text-xs leading-relaxed text-alert">
              <strong className="font-bold">
                Damit verschwindet „{name}" selbst.
              </strong>{' '}
              Du bist die letzte Person, die hier war — mit diesem Schritt gehen
              Termine, Themen, Lieder und das ganze Archiv mit. Das lässt sich
              nicht rückgängig machen.
            </p>
          </div>
        )}

        {mode === 'delete' && (
          <div className="space-y-3 text-xs leading-relaxed text-stone-500">
            <p>
              <strong className="text-stone-700">Weg sind</strong> alle deine
              persönlichen Daten. Du bist dann nicht mehr Teil dieses
              Hauskreises und kannst dich mit dem bestehenden Konto nicht mehr
              anmelden.
            </p>
            <p>
              <strong className="text-stone-700">Bleiben</strong> die
              vergangenen Abende, so wie sie waren — als Gastgeber, in einem
              Thema oder unter einem Actionstep stehst du dort dann als
              „Ehemaliges Mitglied".
            </p>
          </div>
        )}

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
      </div>
    </Sheet>
  );
}
