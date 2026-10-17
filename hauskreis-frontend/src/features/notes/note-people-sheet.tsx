'use client';

import { Check, Users } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { PeopleListEditor } from '@/components/domain/people-list-editor';
import { useMe, usePeople, useSetNotePeople } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import type { Note, PersonRef } from '@/lib/api/types';

/**
 * Wer mitschreibt — einzeln oder die ganze Gruppe.
 *
 * Ein Entwurf und **ein** Speichern, wie bei den Vorbereitern einer Einheit.
 * „Ganze Gruppe" ist ein Haken und kein Schalter: Er gilt erst mit dem
 * Speichern, wie alles in diesem Sheet. Angehakt verschwindet die Liste —
 * sie bleibt aber im Entwurf, und wer den Haken wieder wegnimmt, hat dieselben
 * Leute wie vorher.
 */
export function NotePeopleSheet({
  note,
  onClose,
}: {
  note: Note;
  onClose: () => void;
}) {
  const toast = useToast();
  const me = useMe();
  const people = usePeople();
  const save = useSetNotePeople(note.id);

  const [everyone, setEveryone] = useState(note.forEveryone);
  const [ids, setIds] = useState(() =>
    note.members.map((row) => row.person.id),
  );

  const creator = note.createdBy;
  const byId = new Map<string, PersonRef>(
    [...note.members.map((row) => row.person), ...(people.data ?? [])].map(
      (person) => [person.id, person],
    ),
  );
  const chosen = [
    ...(creator ? [creator] : []),
    ...ids.flatMap((id) => byId.get(id) ?? []),
  ];
  // Eingeladene zählen nicht: Wer sich noch nie angemeldet hat, liest nichts.
  const candidates = (people.data ?? []).filter(
    (person) =>
      person.acceptedAt !== null &&
      person.id !== creator?.id &&
      !ids.includes(person.id),
  );

  const speichern = () =>
    save.mutate(
      { forEveryone: everyone, personIds: ids },
      {
        onSuccess: () => {
          toast.success('Gespeichert.');
          onClose();
        },
      },
    );

  return (
    <Sheet
      open
      onClose={onClose}
      title="Wer schreibt mit?"
      subtitle={note.title}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={save.isPending}
            onClick={speichern}
          >
            Speichern
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <button
          type="button"
          role="checkbox"
          aria-checked={everyone}
          onClick={() => setEveryone((current) => !current)}
          className={cn(
            'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
            everyone
              ? 'border-terracotta-400/60 bg-terracotta-50/50'
              : 'border-line bg-card hover:border-line-strong',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
              everyone
                ? 'border-terracotta-500 bg-terracotta-500 text-white'
                : 'border-line-strong bg-card',
            )}
          >
            {everyone && <Check size={13} strokeWidth={3} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
              <Users size={14} className="text-terracotta-500" />
              Ganze Gruppe
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">
              Alle lesen und schreiben mit — auch, wer später dazukommt.
            </span>
          </span>
        </button>

        {!everyone && (
          <div>
            <FieldLabel>Einzeln</FieldLabel>
            <p className="-mt-0.5 mb-2 text-[11px] leading-relaxed text-stone-400">
              Wer hier steht, sieht die Notiz und darf mitschreiben. Alle
              anderen sehen sie gar nicht.
            </p>
            <PeopleListEditor
              chosen={chosen}
              candidates={candidates}
              fixed={(person) =>
                person.id === creator?.id
                  ? person.id === me.me?.id
                    ? 'du — hast sie angelegt'
                    : 'hat sie angelegt'
                  : null
              }
              onAdd={(personId) => setIds((current) => [...current, personId])}
              onRemove={(personId) =>
                setIds((current) => current.filter((id) => id !== personId))
              }
            />
          </div>
        )}
      </div>
    </Sheet>
  );
}
