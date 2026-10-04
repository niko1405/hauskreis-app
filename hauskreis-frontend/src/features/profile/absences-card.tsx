'use client';

/**
 * Abwesenheiten. Wer einen Zeitraum einträgt, wird für die betroffenen
 * Termine automatisch abgesagt und bei der Host-Vorschlagslogik
 * zurückgestellt — deshalb ist das mehr als ein Kalendereintrag.
 */
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useAbsenceList,
  useCreateAbsence,
  useDeleteAbsence,
} from '@/lib/api/hooks';
import { addDays, formatDayRange, today } from '@/lib/date';

export function AbsencesCard({ personId }: { personId: string }) {
  const [adding, setAdding] = useState(false);

  const list = useAbsenceList({ personId, scope: 'upcoming' });
  const remove = useDeleteAbsence();

  return (
    <section>
      <SectionTitle>Abwesenheiten</SectionTitle>
      <Card className="space-y-4">
        {list.isLoading && <Skeleton className="h-12 w-full" />}

        {!list.isLoading && list.items.length === 0 && (
          <EmptyState
            title="Nichts eingetragen"
            hint="Trag Urlaub oder Reisen ein — dann sagt die App die Termine für dich ab."
          />
        )}

        <ul className="space-y-2">
          {list.items.map((absence) => (
            <li
              key={absence.id}
              className="flex items-center gap-3 rounded-md border border-line p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-stone-800">
                  {formatDayRange(absence.startDate, absence.endDate)}
                </p>
                {absence.reason && (
                  <p className="truncate text-[11px] text-stone-400">
                    {absence.reason}
                  </p>
                )}
              </div>
              <IconButton
                label="Abwesenheit löschen"
                onClick={() => remove.mutate(absence.id)}
              >
                <Trash2 size={15} />
              </IconButton>
            </li>
          ))}
        </ul>

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setAdding(true)}
        >
          <Plus size={14} />
          Abwesenheit eintragen
        </Button>
      </Card>

      <AbsenceSheet
        open={adding}
        personId={personId}
        onClose={() => setAdding(false)}
      />
    </section>
  );
}

/**
 * Einen Zeitraum eintragen — im Sheet und nicht mehr in der Karte.
 *
 * Inline klappte das Formular unter der Liste auf, und auf dem Telefon lag es
 * damit hinter der Tastatur, sobald man den Grund tippte. Das Sheet steht
 * unten fest und trägt seine Knöpfe außerhalb des Scrollbereichs.
 *
 * **Im Untertitel steht, was passiert.** Eine Abwesenheit ist mehr als ein
 * Kalendereintrag: Die App sagt die Abende für einen ab und gibt die Rollen
 * daran frei. Das stand bisher nirgends am Formular, nur im Kommentar darüber.
 */
function AbsenceSheet({
  open,
  personId,
  onClose,
}: {
  open: boolean;
  personId: string;
  onClose: () => void;
}) {
  const [start, setStart] = useState(() => today());
  const [end, setEnd] = useState(() => addDays(today(), 7));
  const [reason, setReason] = useState('');
  const create = useCreateAbsence();
  const toast = useToast();

  // Bei jedem Öffnen ab heute für eine Woche — der häufigste Fall, und ein
  // Zeitraum von letzter Woche wäre als Vorgabe ein Stolperstein.
  useEffect(() => {
    if (!open) return;
    setStart(today());
    setEnd(addDays(today(), 7));
    setReason('');
  }, [open]);

  const submit = () => {
    if (end < start) {
      toast.error('Das Ende liegt vor dem Anfang.');
      return;
    }
    create.mutate(
      {
        personId,
        startDate: start,
        endDate: end,
        reason: reason.trim() === '' ? null : reason.trim(),
      },
      {
        onSuccess: () => {
          toast.success('Abwesenheit eingetragen.');
          onClose();
        },
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Abwesenheit eintragen"
      subtitle="Die App sagt die Abende in dem Zeitraum für dich ab und gibt deine Aufgaben daran frei."
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={create.isPending}
            disabled={start === '' || end === ''}
            onClick={submit}
          >
            Eintragen
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Von">
            <TextInput
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </Field>
          <Field label="Bis">
            <TextInput
              type="date"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Grund" hint="Optional">
          <TextInput
            value={reason}
            placeholder="z. B. Urlaub"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  );
}
