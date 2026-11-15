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
 * Kopfleiste sonst nirgends steht. Die Verwaltung ebenso, dazu mit einem
 * Hauch Terracotta in Rand und Fläche und einem etwas größeren Kreis — sie
 * ist für wenige da, und wer sie hat, soll sie in der langen Seite sofort
 * finden. Einen Schein um den Kreis hat sie nicht mehr: Mit der getönten
 * Fläche zusammen war das einmal zu viel. Statt eines „Admin"-Abzeichens sagt die Zeile darunter in
 * Terracotta, was dort wartet.
 */
import { ChevronRight, ShieldCheck, Users } from 'lucide-react';
import Link from '@/components/ui/link';
import { PRESSABLE } from '@/components/ui/button';
import { usePeople } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';

function LinkRow({
  href,
  icon,
  title,
  subtitle,
  className,
  subtitleClassName,
  chevronClassName,
}: {
  href: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: string;
  className?: string;
  subtitleClassName?: string;
  chevronClassName?: string;
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
          <p
            className={cn(
              'mt-0.5 truncate text-xs text-stone-400',
              subtitleClassName,
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full bg-canvas text-stone-400 transition-colors group-hover:text-terracotta-500',
          chevronClassName,
        )}
      >
        <ChevronRight size={16} />
      </span>
    </Link>
  );
}

/**
 * „Zur Gruppe" — darunter, wie viele ihr seid. Die Mitgliederliste liegt
 * ohnehin im Cache.
 */
export function GroupLink() {
  const people = usePeople();

  const count = people.data?.length;
  const subtitle =
    count !== undefined
      ? `${count} ${count === 1 ? 'Mitglied' : 'Mitglieder'}`
      : '';

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
      className="border-terracotta-500/25 bg-linear-to-r from-terracotta-500/[0.07] to-card hover:border-terracotta-500/45"
      icon={
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-terracotta-500 text-white">
          <ShieldCheck size={21} />
        </span>
      }
      title={
        <>
          <span className="text-[17px]">Admin-Bereich</span>
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
      subtitle="Hauskreis verwalten"
      subtitleClassName="font-semibold text-terracotta-500"
      chevronClassName="size-9 border border-line text-terracotta-500"
    />
  );
}
