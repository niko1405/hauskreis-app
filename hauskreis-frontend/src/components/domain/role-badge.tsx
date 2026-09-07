'use client';

/**
 * Ein Rollen-Chip: „Host: Lukas". Ist niemand eingetragen, wird daraus die
 * Einladung „+ Host eintragen" — nicht ein leeres Feld oder ein Gedankenstrich.
 */
import { BookOpen, Cookie, Gift, House, Mic, Music, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AssignmentRole, PersonRef } from '@/lib/api/types';

export const ROLE_ICON: Record<AssignmentRole, LucideIcon> = {
  HOST: House,
  TOPIC: BookOpen,
  SONG: Music,
  TESTIMONY: Mic,
  SNACK: Cookie,
  PRAYER_BUDDY: Users,
  BIRTHDAY_GIFT: Gift,
};

/**
 * **Rollen haben keine Farbe.**
 *
 * Hier standen einmal zwei `Record<AssignmentRole, string>` mit je sechs
 * Einträgen: Thema und Testimony amber, Musik grün, Gebetsbuddy blau, Geschenk
 * rot, Gastgeber terracotta. Auf einer Terminkarte standen davon drei
 * nebeneinander, auf „Heute" bis zu fünf — und weil jede Farbe für sich etwas
 * bedeutete, bedeutete am Ende keine mehr etwas.
 *
 * Unterschieden werden die Rollen durch das, was sie ohnehin unterscheidet:
 * ihr Symbol und ihren Namen. Beides steht im Chip.
 *
 * Terracotta bleibt der gestrichelte Rand des leeren Chips, und das ist
 * dieselbe Aussage wie überall: die Farbe der **Auswahl** — der aktive Tab, das
 * gewählte Lied, der erste Platz einer Rangliste. „Hier fehlt noch jemand" ist
 * die Einladung, etwas zu wählen.
 */
const FILLED_STYLE = 'border-line bg-canvas text-stone-600';

const EMPTY_STYLE =
  'border-dashed border-terracotta-200 bg-terracotta-50/40 text-terracotta-700';

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
      <span className="font-extrabold">
        {people.map((p) => p.name).join(', ')}
      </span>
    </>
  ) : (
    <>
      <Icon size={12} className="shrink-0" />
      <span>{emptyLabel ?? `+ `}</span>
    </>
  );

  const classes = cn(
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors',
    filled ? FILLED_STYLE : EMPTY_STYLE,
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
