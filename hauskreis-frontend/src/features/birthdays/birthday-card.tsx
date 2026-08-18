'use client';

/**
 * Ein Geburtstag als Karte — dieselbe an drei Orten.
 *
 * Im Register „Geburtstage", in der Terminliste zwischen den Abenden und als
 * eigene Rolle. Dieselbe Karte, weil es dieselbe Frage ist: **wer hat wann
 * Geburtstag, wer besorgt das Geschenk, und steht schon fest was.**
 *
 * **Was das Geburtstagskind sieht, entscheidet nicht diese Datei.** `gift`,
 * `priceCents` und `giftDecided` kommen für die eigene Runde gar nicht erst
 * vom Server (`isOwn`). Hier steht deshalb kein `if (!isOwn)` um die
 * Geschenk-Zeile, sondern nur die Prüfung, ob überhaupt etwas da ist — die
 * Überraschung hängt nicht an einer Zeile Anzeigelogik.
 */
import { Cake, Gift, Lock } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDayMonth } from '@/lib/date';
import { cn } from '@/lib/cn';
import type { BirthdayOccasion } from '@/lib/api/types';

export function BirthdayCard({
  occasion,
  className,
}: {
  occasion: BirthdayOccasion;
  className?: string;
}) {
  return (
    <Link href={`/geburtstag?id=${occasion.id}`} className="block">
      <Card
        className={cn(
          'transition-colors hover:border-terracotta-400',
          occasion.daysUntil === 0 &&
            'border-terracotta-400 bg-terracotta-50/50',
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <Avatar person={occasion.person} size="md" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-stone-800">
              {occasion.person.name}
              {occasion.age !== null && (
                <span className="ml-1.5 font-normal text-stone-400">
                  wird {occasion.age}
                </span>
              )}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-400">
              <Cake size={11} />
              {formatDayMonth(occasion.occursOn)} ·{' '}
              {countdown(occasion.daysUntil)}
            </p>
          </div>

          {occasion.daysUntil === 0 && (
            <Badge variant="terracotta">heute</Badge>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3">
          <Duty occasion={occasion} />
          <GiftLine occasion={occasion} />
        </div>
      </Card>
    </Link>
  );
}

/** Wer das Geschenk besorgt — oder dass es niemand tut. */
function Duty({ occasion }: { occasion: BirthdayOccasion }) {
  if (!occasion.responsible) {
    return (
      <span className="text-[11px] text-stone-400">
        Niemand für das Geschenk eingeteilt
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-[11px] text-stone-500">
      <Avatar person={occasion.responsible} size="xs" />
      <span className="font-semibold text-stone-700">
        {occasion.responsible.name}
      </span>
      besorgt das Geschenk
      {/* Das Schloss steht nur dabei, wenn es etwas bedeutet: Ab hier ändert
          sich nichts mehr, auch nicht, wenn jemand seinen Geburtstag nachträgt. */}
      {occasion.frozen && (
        <Lock size={10} className="text-stone-300" aria-label="steht fest" />
      )}
    </span>
  );
}

/**
 * Was es wird — oder dass es noch offen ist.
 *
 * Für den eigenen Geburtstag steht hier gar nichts. Nicht einmal „noch offen":
 * Auch das wäre schon eine Auskunft über etwas, das eine Überraschung sein soll.
 */
function GiftLine({ occasion }: { occasion: BirthdayOccasion }) {
  if (occasion.isOwn) return null;

  return (
    <span
      className={cn(
        'flex items-center gap-1.5 text-[11px]',
        occasion.giftDecided ? 'text-stone-500' : 'text-stone-400',
      )}
    >
      <Gift size={11} />
      {occasion.gift ? (
        <span className="truncate font-semibold text-stone-700">
          {occasion.gift.text}
        </span>
      ) : (
        'Noch nichts ausgesucht'
      )}
    </span>
  );
}

/** „heute", „morgen", „in 12 Tagen" — der Ton aus CLAUDE.md §9. */
function countdown(days: number): string {
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days < 0) return 'vorbei';
  if (days < 31) return `in ${days} Tagen`;

  const months = Math.round(days / 30);
  return months === 1 ? 'in einem Monat' : `in ${months} Monaten`;
}
