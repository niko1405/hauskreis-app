'use client';

/**
 * Ein Rollen-Chip: „Host: Lukas". Ist niemand eingetragen, wird daraus die
 * Einladung „+ Host eintragen" — nicht ein leeres Feld oder ein Gedankenstrich.
 */
import { BookOpen, House, Mic, Music, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ROLE_LABEL } from '@/lib/meeting';
import type { AssignmentRole, PersonRef } from '@/lib/api/types';

export const ROLE_ICON: Record<AssignmentRole, LucideIcon> = {
  HOST: House,
  TOPIC: BookOpen,
  SONG: Music,
  TESTIMONY: Mic,
  PRAYER_BUDDY: Users,
};

// Testimony trägt bewusst die Farbe des Themas: die beiden schließen einander
// aus, an einem Abend steht immer nur eines davon. Eine eigene Farbe behauptete
// eine fünfte Sorte Aufgabe, die es nicht gibt — es ist dieselbe Stelle im
// Abend, nur anders gefüllt.

const ROLE_STYLE: Record<AssignmentRole, string> = {
  HOST: 'bg-terracotta-50 text-terracotta-700 border-terracotta-100',
  TOPIC: 'bg-topic-bg text-topic border-topic-line',
  SONG: 'bg-music-bg text-music border-music-line',
  TESTIMONY: 'bg-topic-bg text-topic border-topic-line',
  PRAYER_BUDDY: 'bg-info-bg text-info border-info-line',
};

const ROLE_EMPTY_STYLE: Record<AssignmentRole, string> = {
  HOST: 'text-terracotta-700 border-terracotta-100 bg-terracotta-50/40',
  TOPIC: 'text-topic border-topic-line bg-topic-bg/40',
  SONG: 'text-music border-music-line bg-music-bg/40',
  TESTIMONY: 'text-topic border-topic-line bg-topic-bg/40',
  PRAYER_BUDDY: 'text-info border-info-line bg-info-bg/40',
};

export function RoleChip({
  kind,
  people,
  onClick,
  emptyLabel,
  className,
}: {
  kind: AssignmentRole;
  people: PersonRef[];
  onClick?: () => void;
  /** Eigener Text für den leeren Fall, etwa „Draußen — kein Host nötig". */
  emptyLabel?: string;
  className?: string;
}) {
  const Icon = ROLE_ICON[kind];
  const filled = people.length > 0;

  const content = filled ? (
    <>
      <Icon size={12} className="shrink-0" />
      <span className="opacity-80">{ROLE_LABEL[kind]}:</span>
      <span className="font-extrabold">
        {people.map((p) => p.name).join(', ')}
      </span>
    </>
  ) : (
    <>
      <Icon size={12} className="shrink-0" />
      <span>{emptyLabel ?? `+ ${ROLE_LABEL[kind]} eintragen`}</span>
    </>
  );

  const classes = cn(
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors',
    filled ? ROLE_STYLE[kind] : cn('border-dashed', ROLE_EMPTY_STYLE[kind]),
    onClick && 'hover:opacity-80',
    className,
  );

  if (!onClick) return <span className={classes}>{content}</span>;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        classes,
        'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
      )}
    >
      {content}
    </button>
  );
}
