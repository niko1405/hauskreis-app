'use client';

/**
 * Das Zuteilungs-Sheet: Vorschläge oben, alle Personen darunter, „niemand"
 * ganz unten.
 *
 * Die App teilt niemanden zwangsweise ein — sie schlägt vor und begründet,
 * eingetragen wird von Hand (CLAUDE.md §4). Deshalb ist auch „Niemand (leer
 * lassen)" eine gleichberechtigte Option und kein Zurücksetzen.
 */
import { Guitar, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { ROLE_QUESTION } from '@/lib/meeting';
import {
  useHostSuggestions,
  usePeople,
  useSongLeaderSuggestions,
  useTopicSuggestions,
} from '@/lib/api/hooks';
import type {
  AssignmentRole,
  HostSuggestion,
  RoleSuggestion,
} from '@/lib/api/types';
import { SuggestionRow } from './suggestion-row';

export interface AssignmentSheetProps {
  open: boolean;
  onClose: () => void;
  kind: Exclude<AssignmentRole, 'PRAYER_BUDDY'>;
  meetingId: string;
  /** Wer aktuell eingetragen ist. */
  selectedIds: string[];
  /** Host ist einer, Thema und Musik können mehrere sein. */
  multiple?: boolean;
  /**
   * Für vergangene Abende: keine Vorschläge, nur die Personenliste.
   *
   * Ein Vorschlag beantwortet „wer wäre als Nächstes dran" — an einem Abend,
   * der vorbei ist, gibt es diese Frage nicht. Was hier nachgetragen wird, ist
   * eine Erinnerung, und die weiß man oder man weiß sie nicht.
   */
  withoutSuggestions?: boolean;
  onSubmit: (personIds: string[]) => void;
  saving?: boolean;
}

export function AssignmentSheet({
  open,
  onClose,
  kind,
  meetingId,
  selectedIds,
  multiple = false,
  withoutSuggestions = false,
  onSubmit,
  saving = false,
}: AssignmentSheetProps) {
  const [draft, setDraft] = useState<string[]>(selectedIds);

  // Beim Öffnen den aktuellen Stand übernehmen — nicht den von letztem Mal.
  useEffect(() => {
    if (open) setDraft(selectedIds);
  }, [open, selectedIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const people = usePeople();
  const suggestions = useSuggestions(
    kind,
    meetingId,
    open && !withoutSuggestions,
  );

  const toggle = (personId: string) => {
    if (!multiple) {
      onSubmit([personId]);
      onClose();
      return;
    }
    setDraft((current) =>
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId],
    );
  };

  const clear = () => {
    if (multiple) {
      setDraft([]);
      return;
    }
    onSubmit([]);
    onClose();
  };

  const suggested = new Set((suggestions.data ?? []).map((s) => s.personId));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={ROLE_QUESTION[kind]}
      subtitle={multiple ? 'Mehrere möglich' : undefined}
    >
      {withoutSuggestions ? (
        <p className="rounded-md border border-line bg-canvas px-4 py-3 text-xs leading-relaxed text-stone-500">
          Der Abend ist vorbei — hier wird nur nachgetragen, wer es war. Deshalb
          steht hier kein Vorschlag: die Frage „wer wäre als Nächstes dran"
          stellt sich rückwärts nicht.
        </p>
      ) : (
        <section>
          <h3 className="mb-3 text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
            Vorschläge
          </h3>

          {suggestions.isLoading && <CardSkeleton />}
          {suggestions.error && <ErrorState error={suggestions.error} />}

          <div className="space-y-3">
            {(suggestions.data ?? []).slice(0, 3).map((suggestion) => (
              <SuggestionRow
                key={suggestion.personId}
                suggestion={suggestion}
                selected={draft.includes(suggestion.personId)}
                onSelect={() => toggle(suggestion.personId)}
              />
            ))}
          </div>

          {suggestions.data?.length === 0 && (
            <p className="text-xs text-stone-400 italic">
              Gerade kein Vorschlag — such unten selbst jemanden aus.
            </p>
          )}
        </section>
      )}

      <section>
        <h3 className="mb-3 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
          Alle Personen
        </h3>
        <ul className="space-y-2">
          {(people.data ?? []).map((person) => {
            const selected = draft.includes(person.id);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => toggle(person.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border bg-card p-3.5 shadow-sm transition-colors',
                    selected ? 'border-terracotta-500' : 'border-transparent',
                    suggested.has(person.id) && 'opacity-70',
                    'hover:border-line-strong focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Avatar person={person} size="sm" />
                    <span className="font-bold text-stone-800">
                      {person.name}
                    </span>
                    {person.playsInstrument && (
                      <Guitar
                        size={14}
                        className="text-music"
                        aria-label="spielt ein Instrument"
                      />
                    )}
                    {!person.active && (
                      <span className="text-[10px] text-stone-400">
                        inaktiv
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full border',
                      selected
                        ? 'border-terracotta-500 bg-terracotta-500'
                        : 'border-line-strong',
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <button
        type="button"
        onClick={clear}
        className="flex w-full items-center gap-4 rounded-md border-2 border-dashed border-terracotta-100 bg-terracotta-50/30 p-4 text-left transition-colors hover:bg-terracotta-50"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-stone-400 shadow-sm">
          <X size={18} />
        </span>
        <span>
          <span className="block font-bold text-terracotta-700">
            Niemand (leer lassen)
          </span>
          <span className="block text-[11px] text-stone-400">
            Offen für die Gruppe — ein gültiger Zustand, kein Versäumnis
          </span>
        </span>
      </button>

      {multiple && (
        <div className="flex gap-2 border-t border-line pt-4">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            loading={saving}
            onClick={() => {
              onSubmit(draft);
              onClose();
            }}
          >
            Übernehmen
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/** Je Rolle ein eigener Endpunkt; geladen wird nur, solange das Sheet offen ist. */
function useSuggestions(
  kind: AssignmentSheetProps['kind'],
  meetingId: string,
  active: boolean,
): {
  data: (RoleSuggestion | HostSuggestion)[] | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const host = useHostSuggestions(meetingId, active && kind === 'HOST');
  const topic = useTopicSuggestions(meetingId, active && kind === 'TOPIC');
  const song = useSongLeaderSuggestions(meetingId, active && kind === 'SONG');

  if (kind === 'HOST') return host;
  if (kind === 'TOPIC') return topic;
  return song;
}
