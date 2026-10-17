'use client';

import { ChevronRight, StickyNote, Users } from 'lucide-react';
import { AvatarStack } from '@/components/ui/avatar';
import { PRESSABLE } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from '@/components/ui/link';
import {
  CardSkeleton,
  EmptyState,
  ErrorState,
  LoadMore,
} from '@/components/ui/states';
import { useNoteList } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDayShort, toDay } from '@/lib/date';
import type { NoteListItem } from '@/lib/api/types';

/**
 * Das Register „Notizen" im Archiv — alle, die man sehen darf, zuletzt
 * geänderte zuerst.
 *
 * Ohne Unterregister „Eigene/Alle" wie bei den Themen: Hier steht ohnehin nur,
 * woran man selbst mitschreibt. Eine Notiz, zu der man nicht dazugenommen
 * wurde, gibt es für einen nicht.
 */
export function NotesArchive({ search }: { search: string }) {
  const query = useNoteList({ search: search || undefined });

  return (
    <div className="space-y-3">
      {query.isLoading && <CardSkeleton />}
      {query.error && <ErrorState error={query.error} />}

      {!query.isLoading && !query.error && query.items.length === 0 && (
        <EmptyState
          title={search ? 'Keine Notiz gefunden' : 'Noch keine Notizen'}
          hint={
            search
              ? 'Gesucht wird in Titel und Text.'
              : 'Leg über das „+" unten rechts eine an — für dich allein, mit ein paar Leuten oder für die ganze Gruppe.'
          }
        />
      )}

      {query.items.length > 0 && (
        <>
          <ul className="space-y-3">
            {query.items.map((note) => (
              <li key={note.id}>
                <NoteEntry note={note} />
              </li>
            ))}
          </ul>
          <LoadMore query={query} label="Ältere Notizen" />
        </>
      )}
    </div>
  );
}

/**
 * Eine Zeile — gebaut wie die Karte eines Themas: Kachel, Titel, eine Zeile
 * Text, darunter wer dabei ist und wie weit die Checkliste ist.
 *
 * Steht eine Checkliste darin, zeigt die Ecke „3/5 erledigt" statt des Datums:
 * Bei einer Packliste ist das die Frage, mit der man die Liste aufmacht.
 */
function NoteEntry({ note }: { note: NoteListItem }) {
  const leute = [
    ...(note.createdBy ? [note.createdBy] : []),
    ...note.members.map((row) => row.person),
  ];
  const { done, total } = note.checklist;

  return (
    <Link href={`/notiz?id=${note.id}`} className={cn('block', PRESSABLE)}>
      <Card className="flex gap-3 p-3.5 transition-colors hover:border-line-strong">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-terracotta-50 text-terracotta-600"
        >
          <StickyNote size={17} />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-serif text-base leading-snug font-bold text-stone-900">
            {note.title}
          </h3>
          {note.preview && (
            <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">
              {note.preview}
            </p>
          )}

          <div className="mt-2.5 flex items-center justify-between gap-3">
            {note.forEveryone ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-terracotta-700">
                <Users size={12} /> Ganze Gruppe
              </span>
            ) : (
              <AvatarStack people={leute} size="xs" zoomable={false} />
            )}
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium',
                total > 0 && done === total ? 'text-success' : 'text-stone-400',
              )}
            >
              {total > 0
                ? `${done}/${total} erledigt`
                : formatDayShort(toDay(new Date(note.updatedAt)))}
              <ChevronRight
                aria-hidden
                size={13}
                className="text-terracotta-500"
              />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
