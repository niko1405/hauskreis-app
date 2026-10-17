'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldLabel, TextInput } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { PeopleListEditor } from '@/components/domain/people-list-editor';
import { useCreateNote, useMe, usePeople } from '@/lib/api/hooks';

type Kreis = 'ich' | 'alle' | 'auswahl';

const HINWEIS: Record<Kreis, string> = {
  ich: 'Nur du siehst sie. Leute nimmst du später über „Leute" dazu.',
  alle: 'Alle in der Gruppe sehen sie und schreiben mit — auch, wer später dazukommt.',
  auswahl: 'Nur, wer hier steht, sieht sie und schreibt mit.',
};

/**
 * Eine Notiz anlegen: ein Titel und wer mitschreibt. Der Text kommt danach —
 * die neue Notiz öffnet sich gleich zum Schreiben (`&neu=1`), statt hier ein
 * zweites, kleineres Textfeld anzubieten.
 */
export function NewNoteSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const me = useMe();
  const people = usePeople();
  const create = useCreateNote();

  const [title, setTitle] = useState('');
  const [kreis, setKreis] = useState<Kreis>('ich');
  const [ids, setIds] = useState<string[]>([]);

  // Jedes Öffnen fängt leer an.
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setKreis('ich');
    setIds([]);
  }, [open]);

  const self = (people.data ?? []).find((person) => person.id === me.me?.id);
  const chosen = [
    ...(self ? [self] : []),
    ...(people.data ?? []).filter((person) => ids.includes(person.id)),
  ];
  const candidates = (people.data ?? []).filter(
    (person) =>
      person.acceptedAt !== null &&
      person.id !== me.me?.id &&
      !ids.includes(person.id),
  );

  const trimmed = title.trim();

  const anlegen = () =>
    create.mutate(
      {
        title: trimmed,
        forEveryone: kreis === 'alle',
        personIds: kreis === 'auswahl' ? ids : [],
      },
      {
        onSuccess: (note) => {
          onClose();
          router.push(`/notiz?id=${note.id}&neu=1`);
        },
      },
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Neue Notiz"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={create.isPending}
            disabled={trimmed === ''}
            onClick={anlegen}
          >
            Anlegen
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <FieldLabel>Titel</FieldLabel>
          <TextInput
            aria-label="Titel der Notiz"
            value={title}
            placeholder="Packliste Freizeit, Ideen für den Kurs …"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div>
          <FieldLabel>Wer schreibt mit?</FieldLabel>
          <Segmented
            label="Wer schreibt mit?"
            size="sm"
            value={kreis}
            onChange={setKreis}
            options={[
              { value: 'ich', label: 'Nur ich' },
              { value: 'alle', label: 'Ganze Gruppe' },
              { value: 'auswahl', label: 'Auswählen' },
            ]}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
            {HINWEIS[kreis]}
          </p>
        </div>

        {kreis === 'auswahl' && (
          <PeopleListEditor
            chosen={chosen}
            candidates={candidates}
            fixed={(person) =>
              person.id === me.me?.id ? 'du — legst sie an' : null
            }
            onAdd={(personId) => setIds((current) => [...current, personId])}
            onRemove={(personId) =>
              setIds((current) => current.filter((id) => id !== personId))
            }
          />
        )}
      </div>
    </Sheet>
  );
}
