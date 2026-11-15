'use client';

/**
 * Die Wege aus dem Profil hinaus — zur Gruppe und in die Verwaltung.
 *
 * **Eine Zeile wie in den iOS-Einstellungen und kein grauer Knopf.** Ein Kreis
 * mit Symbol sagt, wohin es geht, der Untertitel, was dort wartet, und der
 * Chevron, dass man hinübergeht statt etwas auszulösen. Als zwei gleiche Knöpfe
 * übereinander sahen sie aus wie Aktionen dieser Seite.
 *
 * Die Gruppe ist **gefüllt in Terracotta**: Sie ist das Ziel, das ohne
 * Kopfleiste sonst nirgends steht. Die Verwaltung bleibt neutral — sie ist für
 * wenige und selten.
 */
import { ChevronRight, Shield, Users } from 'lucide-react';
import Link from '@/components/ui/link';
import { Badge } from '@/components/ui/badge';
import { PRESSABLE } from '@/components/ui/button';
import { usePeople } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { dayParts, daysBetween, formatDayShort, today } from '@/lib/date';
import type { CalendarDay } from '@/lib/date';

/**
 * „heute", „morgen", „Mi." innerhalb der Woche, sonst „3. Dez." — ein
 * Wochentag allein wäre ab sieben Tagen zweideutig.
 */
function whenOf(day: CalendarDay): string {
  const diff = daysBetween(today(), day);
  if (diff <= 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff < 7) return `${dayParts(day).weekday}.`;
  return formatDayShort(day);
}

function LinkRow({
  href,
  icon,
  title,
  subtitle,
  className,
}: {
  href: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-4 rounded-card border border-line bg-card p-4 shadow-sm shadow-stone-200/40 transition-colors hover:border-line-strong',
        'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
        PRESSABLE,
        className,
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-bold text-stone-900">
          {title}
        </div>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-stone-400">{subtitle}</p>
        )}
      </div>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-canvas text-stone-400 transition-colors group-hover:text-terracotta-500">
        <ChevronRight size={16} />
      </span>
    </Link>
  );
}

/**
 * „Zur Gruppe" — mit dem, was man dort zuerst wissen will: wie viele ihr seid
 * und wann ihr euch das nächste Mal seht. Beides liegt ohnehin im Cache
 * (Mitgliederliste, „Heute").
 */
export function GroupLink() {
  const people = usePeople();

  const count = people.data?.length;

  const subtitle = [
    count !== undefined &&
      `${count} ${count === 1 ? 'Mitglied' : 'Mitglieder'}`
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <LinkRow
      href="/hauskreis"
      icon={
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-terracotta-500 text-white">
          <Users size={20} />
        </span>
      }
      title="Zur Gruppe"
      subtitle={subtitle || undefined}
    />
  );
}

/** Der Admin-Bereich — mit Punkt, bis man einmal drin war. */
export function AdminLink({ unread }: { unread: boolean }) {
  return (
    <LinkRow
      href="/admin"
      icon={
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-canvas text-stone-500">
          <Shield size={19} />
        </span>
      }
      title={
        <>
          Admin-Bereich
          <Badge variant="terracotta">Admin</Badge>
          {/* Bis man einmal drin war. Wer gerade ernannt wurde, sieht hier eine
              Zeile mehr und sonst nichts, das ihm sagt, was dahinter steht. */}
          {unread && (
            <span
              aria-label="Neu"
              className="size-1.5 rounded-full bg-terracotta-500"
            />
          )}
        </>
      }
    />
  );
}
