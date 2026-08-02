'use client';

/**
 * Abwesenheiten. Wer einen Zeitraum einträgt, wird für die betroffenen
 * Termine automatisch abgesagt und bei der Host-Vorschlagslogik
 * zurückgestellt — deshalb ist das mehr als ein Kalendereintrag.
 */
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Field, TextInput } from '@/components/ui/field';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import {
  useAbsenceList,
  useCreateAbsence,
  useDeleteAbsence,
} from '@/lib/api/hooks';
import { addDays, formatDayRange, today } from '@/lib/date';

export function AbsencesCard({ personId }: { personId: string }) {
  const [adding, setAdding] = useState(false);
  const [start, setStart] = useState(() => today());
  const [end, setEnd] = useState(() => addDays(today(), 7));
  const [reason, setReason] = useState('');

  const list = useAbsenceList({ personId, scope: 'upcoming' });
  const create = useCreateAbsence();
  const remove = useDeleteAbsence();
  const toast = useToast();

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
          setReason('');
          setAdding(false);
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <section>
      <SectionTitle>Abwesenheiten</SectionTitle>
      <Card className="space-y-4">
        {list.isLoading && <Skeleton className="h-12 w-full" />}

        {!list.isLoading && list.items.length === 0 && !adding && (
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
                onClick={() =>
                  remove.mutate(absence.id, {
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              >
                <Trash2 size={15} />
              </IconButton>
            </li>
          ))}
        </ul>

        {adding ? (
          <div className="space-y-3 border-t border-line pt-4">
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
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => setAdding(false)}
              >
                Abbrechen
              </Button>
              <Button
                size="sm"
                className="flex-1"
                loading={create.isPending}
                onClick={submit}
              >
                Eintragen
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setAdding(true)}
          >
            <Plus size={14} />
            Abwesenheit eintragen
          </Button>
        )}
      </Card>
    </section>
  );
}
