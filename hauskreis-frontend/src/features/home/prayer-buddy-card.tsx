'use client';

/**
 * Die Gebetsbuddys auf dem Startbildschirm — mit Gesichtern.
 *
 * **Zu dritt sind es zwei Karten nebeneinander**, denn es sind zwei
 * verschiedene Dinge: Für wen du betest, ist ein Auftrag; wer für dich betet,
 * ist ein Zuspruch. Untereinander in einer Karte lasen sie sich als eine
 * Aufzählung, obwohl sie das nicht sind.
 *
 * **Zu zweit bleibt es eine Karte** — „ihr betet füreinander", und eine
 * Richtung auszuschreiben, die auf sich selbst zeigt, wäre eine Unterscheidung
 * ohne Unterschied (dieselbe Überlegung wie auf dem Gebets-Bildschirm).
 *
 * Das Bild kostet keine zusätzliche Abfrage: `personRefSchema` liefert
 * `photoUpdatedAt` überall dort mit, wo jemand benannt wird — genau dafür steht
 * es dort.
 *
 * Gerechnet wird mit `circleOf`, wie auf dem Gebets-Bildschirm. Zwei Kopien
 * derselben Rechnung sagen irgendwann zwei verschiedene Dinge (CLAUDE.md §6.5).
 */
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import Link from '@/components/ui/link';
import { Avatar } from '@/components/ui/avatar';
import { Card, SectionTitle } from '@/components/ui/card';
import { formatDayMonth } from '@/lib/date';
import type { HomePrayerBuddies, PersonRef } from '@/lib/api/types';
import { circleOf } from '@/features/prayer/circle';

export function PrayerBuddyCard({
  buddies,
  myId,
}: {
  buddies: HomePrayerBuddies | null;
  myId: string | undefined;
}) {
  if (!buddies) return null;

  const kreis = circleOf(buddies.members, myId);

  return (
    <section>
      {/* Die Überschrift stand einmal **in** der Karte. Beim Trio gibt es jetzt
          zwei davon, und in welche von beiden sie dann gehörte, ist keine
          Frage mit einer guten Antwort. */}
      <SectionTitle
        action={
          <span className="text-[11px] font-medium text-stone-400">
            noch bis {formatDayMonth(buddies.until)}
          </span>
        }
      >
        Deine Gebetsbuddys
      </SectionTitle>

      {kreis === null ? (
        <Card>
          <p className="text-sm text-stone-400 italic">
            Diese Runde bist du allein in deiner Gruppe.
          </p>
        </Card>
      ) : kreis.size > 2 ? (
        <div className="grid grid-cols-2 gap-3">
          <BuddyCard
            label="Du betest für"
            icon={<ArrowUpRight size={12} strokeWidth={2.5} />}
            person={kreis.betestFuer}
          />
          <BuddyCard
            label="Für dich betet"
            icon={<ArrowDownLeft size={12} strokeWidth={2.5} />}
            person={kreis.betetFuerDich}
          />
        </div>
      ) : (
        <BuddyCard label="Du betest mit" person={kreis.betestFuer} wide />
      )}
    </section>
  );
}

/**
 * Eine Person mit ihrer Rolle im Kreis.
 *
 * `wide` dreht das Layout: Zu zweit steht das Bild links neben dem Namen und
 * darf groß sein, zu dritt teilen sich zwei Karten die Breite eines Telefons —
 * dort geht nur untereinander.
 */
function BuddyCard({
  label,
  icon,
  person,
  wide = false,
}: {
  label: string;
  icon?: React.ReactNode;
  person: PersonRef;
  wide?: boolean;
}) {
  return (
    <Link href="/gebet" className="block">
      <Card
        className={
          wide
            ? 'flex items-center gap-4 transition-colors hover:border-line-strong'
            : 'h-full transition-colors hover:border-line-strong'
        }
      >
        <Avatar person={person} size="lg" className={wide ? '' : 'mb-3'} />
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
            {icon}
            {label}
          </p>
          <p className="mt-0.5 truncate text-[15px] leading-snug font-bold text-stone-800">
            {person.name}
          </p>
        </div>
      </Card>
    </Link>
  );
}
