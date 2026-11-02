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
 *
 * **Wie lange die Runde noch läuft, steht in der Karte** und als Rest in Tagen
 * („Noch 4d"), nicht als Datum über ihr. Auf dem Startbildschirm fragt man
 * „wie lange noch", und ein Datum muss man dafür erst umrechnen; das Datum
 * steht im `title` und auf „Gebet".
 */
import { ArrowDownLeft, ArrowUpRight, Hourglass } from 'lucide-react';
import Link from '@/components/ui/link';
import { Avatar } from '@/components/ui/avatar';
import { Card, SectionTitle } from '@/components/ui/card';
import { addDays, daysBetween, formatDayMonth, today } from '@/lib/date';
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
  const rest = <Remaining until={buddies.until} />;

  return (
    <section>
      {/* Die Überschrift steht über den Karten und nicht darin: Beim Trio gibt
          es zwei davon. */}
      <SectionTitle>Deine Gebetsbuddys</SectionTitle>

      {kreis === null ? (
        <Card className="flex items-center justify-between gap-3">
          <p className="text-sm text-stone-400 italic">
            Diese Runde bist du allein in deiner Gruppe.
          </p>
          {rest}
        </Card>
      ) : kreis.size > 2 ? (
        // Beim Trio steht der Rest in der rechten Karte, oben rechts — dort,
        // wo er beim Paar auch steht. In beiden wäre er doppelt.
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
            badge={rest}
          />
        </div>
      ) : (
        <BuddyCard
          label="Du betest mit"
          person={kreis.betestFuer}
          badge={rest}
          wide
        />
      )}
    </section>
  );
}

/**
 * „Noch 4d" — bis die nächste Runde beginnt.
 *
 * `until` ist der letzte Tag der Runde und zählt mit: Am letzten Tag steht
 * dort „Noch 1d", nie „Noch 0d".
 */
function Remaining({ until }: { until: string }) {
  const days = daysBetween(today(), addDays(until, 1));

  return (
    <span
      title={`Noch bis ${formatDayMonth(until)}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-stone-500 tabular-nums"
    >
      <Hourglass size={11} aria-hidden />
      Noch {days}d
    </span>
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
  badge,
  wide = false,
}: {
  label: string;
  icon?: React.ReactNode;
  person: PersonRef;
  /** Wie lange die Runde noch läuft — oben rechts in der Karte. */
  badge?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Link href="/gebet" className="block">
      <Card
        className={
          wide
            ? 'flex items-center gap-4 transition-colors hover:border-line-strong'
            : 'relative h-full transition-colors hover:border-line-strong'
        }
      >
        <Avatar
          person={person}
          size="lg"
          className={wide ? '' : 'mb-3'}
          zoomable={false}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
            {icon}
            {label}
          </p>
          <p className="mt-0.5 truncate text-[15px] leading-snug font-bold text-stone-800">
            {person.name}
          </p>
        </div>
        {/* Zu zweit steht er im Fluss neben dem Namen und nimmt ihm Platz;
            in der schmalen Trio-Karte steht er über der Ecke, neben dem Bild,
            wo ohnehin nichts steht. */}
        {badge &&
          (wide ? (
            <div className="self-start">{badge}</div>
          ) : (
            <div className="absolute top-4 right-4">{badge}</div>
          ))}
      </Card>
    </Link>
  );
}
