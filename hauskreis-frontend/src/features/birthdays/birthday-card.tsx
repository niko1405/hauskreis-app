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
import { formatDayFull, formatDayMonth } from '@/lib/date';
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

/**
 * „heute", „morgen", „in 5 Tagen", „in 3 Wochen", „in 4 Monaten".
 *
 * Der Ton aus CLAUDE.md §9 — und die Einheit wächst mit dem Abstand. „in 89
 * Tagen" ist eine Zahl, die niemand in einen Kalender übersetzt; drei Monate
 * sind eine Auskunft. Umgekehrt wäre „in einer Woche" für neun Tage zu
 * ungenau, deshalb bleiben die ersten beiden Wochen bei Tagen.
 */
export function countdown(days: number): string {
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days < 0) return 'vorbei';
  if (days < 14) return `in ${days} Tagen`;

  if (days < 31) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? 'in einer Woche' : `in ${weeks} Wochen`;
  }

  const months = Math.round(days / 30);
  return months === 1 ? 'in einem Monat' : `in ${months} Monaten`;
}

/**
 * Die eigene Aufgabe — **kein** zweiter Aufguss von `BirthdayCard`.
 *
 * Unter „Kommende" steht der Geburtstag und daneben, wer sich kümmert; hier
 * steht die Aufgabe und daneben, um wen es geht. Dieselbe Karte an beiden
 * Orten hieße, dass man zweimal dasselbe liest und beim zweiten Mal nicht
 * merkt, dass es einen betrifft.
 *
 * Die Zeitspanne steht als Abzeichen rechts, weil sie hier die eigentliche
 * Nachricht ist: „in drei Monaten" heißt Ruhe, „in zwei Wochen" heißt losgehen.
 */
export function MyDutyCard({ occasion }: { occasion: BirthdayOccasion }) {
  return (
    <Link href={`/geburtstag?id=${occasion.id}`} className="block">
      <Card
        className={cn(
          'border-terracotta-200 transition-colors hover:border-terracotta-400',
          occasion.daysUntil === 0 &&
            'border-terracotta-400 bg-terracotta-50/50',
        )}
      >
        <div className="flex items-center gap-3">
          <Avatar person={occasion.person} size="md" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-stone-800">
              Du schenkst{' '}
              <span className="text-terracotta-700">
                {occasion.person.name}
              </span>{' '}
              etwas
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-400">
              <Cake size={11} />
              {formatDayFull(occasion.occursOn)}
              {occasion.age !== null && ` · wird ${occasion.age}`}
            </p>
          </div>

          <Badge variant="terracotta">{countdown(occasion.daysUntil)}</Badge>
        </div>

        {/* Ob die Aufgabe schon erledigt ist. Für den eigenen Geburtstag steht
            hier nichts — aber der Fall kommt nicht vor: Für sich selbst ist
            niemand zuständig. */}
        <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-[11px]">
          <Gift size={11} className="shrink-0 text-stone-300" />
          {occasion.gift ? (
            <span className="truncate text-stone-500">
              Ausgesucht:{' '}
              <span className="font-semibold text-stone-700">
                {occasion.gift.text}
              </span>
            </span>
          ) : (
            <span className="text-stone-400">
              Noch nichts ausgesucht — hier stehen die Vorschläge
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
