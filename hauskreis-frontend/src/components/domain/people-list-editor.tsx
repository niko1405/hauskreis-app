'use client';

import { Plus, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import type { PersonRef } from '@/lib/api/types';

/**
 * Wer dabei ist, als Liste — mit „×" zum Herausnehmen und „Person
 * hinzufügen", das die übrigen im selben Sheet aufklappt.
 *
 * Gebraucht, wo ein Entwurf von Leuten mit **einem** Speichern geschrieben
 * wird: die Vorbereiter einer Einheit, die Mitschreibenden einer Notiz. Eine
 * Liste der ganzen Gruppe zum Anhaken beantwortete „wer könnte" — gefragt ist
 * aber „wer macht es".
 *
 * Ein zweites Sheet für die Auswahl gibt es bewusst nicht: Es hätte ein
 * zweites Escape und einen zweiten Schleier, und der Entwurf darunter wäre
 * aus dem Blick.
 *
 * `fixed` sagt je Person, warum sie bleiben muss — dann fehlt ihr „×", und der
 * Grund steht darunter, statt als Fehlermeldung nach dem Speichern zu kommen.
 */
export function PeopleListEditor({
  chosen,
  candidates,
  fixed,
  onAdd,
  onRemove,
}: {
  chosen: PersonRef[];
  /** Wer dazukommen kann — ohne die, die schon dabei sind. */
  candidates: PersonRef[];
  fixed?: (person: PersonRef) => string | null;
  onAdd: (personId: string) => void;
  onRemove: (personId: string) => void;
}) {
  const [waehlen, setWaehlen] = useState(false);

  return (
    <div>
      {chosen.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-card">
          {chosen.map((person) => {
            const reason = fixed?.(person) ?? null;
            return (
              <li key={person.id} className="flex items-center gap-3 p-2.5">
                <Avatar person={person} size="sm" zoomable={false} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-stone-700">
                    {person.name}
                  </span>
                  {reason && (
                    <span className="block text-[11px] text-stone-400">
                      {reason}
                    </span>
                  )}
                </span>
                {!reason && (
                  <IconButton
                    label={`${person.name} herausnehmen`}
                    className="size-8"
                    onClick={() => onRemove(person.id)}
                  >
                    <X size={15} />
                  </IconButton>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {waehlen ? (
        <div className="mt-2 rounded-lg border border-terracotta-100 bg-terracotta-50/30 p-1.5">
          <div className="flex items-center justify-between px-1.5 pb-1">
            <span className="text-[11px] font-semibold text-terracotta-700">
              Wen nimmst du dazu?
            </span>
            <IconButton
              label="Doch niemanden"
              className="size-7"
              onClick={() => setWaehlen(false)}
            >
              <X size={14} />
            </IconButton>
          </div>
          <ul>
            {candidates.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(person.id);
                    setWaehlen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-card"
                >
                  <Avatar person={person} size="sm" zoomable={false} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-700">
                    {person.name}
                  </span>
                  <Plus size={15} className="shrink-0 text-terracotta-500" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        candidates.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setWaehlen(true)}
          >
            <UserPlus size={15} />
            Person hinzufügen
          </Button>
        )
      )}
    </div>
  );
}
