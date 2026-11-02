'use client';

/**
 * Geschenk-Anteile, die man noch nicht abgehakt hat — im Register
 * „Geburtstage" und auf „Heute".
 *
 * **Auch für vergangene Geburtstage**, und genau um die geht es: Ist der Tag
 * vorbei, zeigt das Register schon den nächsten, und der Preis stand nirgends
 * mehr. Wer das Überweisen verpasst hatte, fand ihn nicht wieder. Die Zeile
 * bleibt, bis man auf der Seite des Geburtstags „bezahlt" abhakt — oder drei
 * Monate um sind (`OPEN_PAYMENT_DAYS` im Backend).
 *
 * Ohne Einträge zeichnet sie nichts, auch keine Überschrift: Ein „Nichts
 * offen" wäre eine Nachricht über etwas, das niemand vermisst.
 */
import { ChevronRight } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { PRESSABLE } from '@/components/ui/button';
import Link from '@/components/ui/link';
import { cn } from '@/lib/cn';
import { formatDayMonth } from '@/lib/date';
import type { OpenGiftPayment } from '@/lib/api/types';
import { formatCents } from '@/lib/money';

export function OpenPayments({ items }: { items: OpenGiftPayment[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.occasionId}>
          <Link
            href={`/geburtstag?id=${item.occasionId}`}
            className={cn(
              'flex items-center gap-3 rounded-card border border-warn-line bg-warn-bg/40 p-3.5',
              PRESSABLE,
              'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
            )}
          >
            <Avatar person={item.person} size="sm" zoomable={false} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-stone-800">
                Geschenk für {item.person.name}
              </p>
              <p className="truncate text-[11px] text-stone-500">
                {item.shareCents !== null
                  ? `${formatCents(item.shareCents)} · dein Anteil`
                  : 'Dein Anteil'}
                {' · '}
                {formatDayMonth(item.occursOn)}
              </p>
            </div>
            <ChevronRight size={15} className="shrink-0 text-stone-300" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
