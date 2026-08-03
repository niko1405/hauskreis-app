'use client';

/**
 * „Gebet" — die laufende Runde, was danach kommt und was war.
 *
 * Neun Personen gehen nicht glatt in Zweiergruppen auf; die Aufteilung in
 * Zweier und Dreier macht der Server. Hier wird sie nur gezeigt.
 *
 * Kein „Schreiben"-Knopf mehr. Er baute eine WhatsApp-Nachricht mit einem
 * vorformulierten Satz — nur ohne Nummer, also landete man in der
 * Kontaktauswahl und suchte die Person, die auf dem Bildschirm daneben stand.
 * Wer seine Gebetsbuddys anschreiben will, hat den Chat ohnehin offen.
 */
import { useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  useCurrentPrayerBuddies,
  useMe,
  usePrayerBuddyRounds,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDayRange, formatRelativeDay } from '@/lib/date';
import type { PrayerBuddyGroup, PrayerBuddyRound } from '@/lib/api/types';

type Scope = 'upcoming' | 'past';

const SCOPE_LABEL: Record<Scope, string> = {
  upcoming: 'Kommend',
  past: 'Vorbei',
};

const SCOPE_EMPTY: Record<Scope, string> = {
  upcoming: 'Weiter voraus ist noch nichts geplant.',
  past: 'Noch keine Runde vorbei — ihr fangt gerade erst an.',
};

export function PrayerScreen() {
  const me = useMe();
  const current = useCurrentPrayerBuddies();
  const [scope, setScope] = useState<Scope>('upcoming');
  const rounds = usePrayerBuddyRounds({ scope });

  const myGroup = current.data?.groups.find((group) =>
    group.members.some((member) => member.id === me.me?.id),
  );

  // Die laufende Runde steht schon oben; unter „Kommend" wäre sie doppelt.
  const others = rounds.items.filter(
    (round) => round.periodStart !== current.data?.periodStart,
  );

  return (
    <div>
      <PageHeader
        title="Gebet"
        subtitle={
          current.data
            ? `Aktuelle Runde: ${formatDayRange(
                current.data.periodStart,
                current.data.periodEnd,
              )}`
            : undefined
        }
      />

      <div className="space-y-6 px-5">
        {current.isLoading && <CardSkeleton />}
        {current.error && (
          <ErrorState
            error={current.error}
            onRetry={() => void current.refetch()}
          />
        )}

        {current.data && !myGroup && (
          <EmptyState
            title="Du bist in dieser Runde keiner Gruppe zugeteilt"
            hint="Bei der nächsten Rotation bist du wieder dabei."
          />
        )}

        {myGroup && (
          <section>
            <SectionTitle>Du betest mit</SectionTitle>
            <Card className="space-y-3">
              {myGroup.members
                .filter((member) => member.id !== me.me?.id)
                .map((member) => (
                  <div key={member.id} className="flex items-center gap-3">
                    <Avatar person={member} />
                    <span className="flex-1 font-bold text-stone-800">
                      {member.name}
                    </span>
                  </div>
                ))}
              {myGroup.members.length <= 1 && (
                <p className="text-sm text-stone-400 italic">
                  Diese Runde bist du allein in deiner Gruppe.
                </p>
              )}
            </Card>
          </section>
        )}

        {current.data && current.data.groups.length > 0 && (
          <section>
            <SectionTitle>Alle Gruppen dieser Runde</SectionTitle>
            <ul className="space-y-2">
              {current.data.groups.map((group) => (
                <li key={group.id}>
                  <GroupRow
                    group={group}
                    highlight={group.id === myGroup?.id}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <SectionTitle
            action={
              <div className="flex gap-1">
                {(['upcoming', 'past'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={scope === option}
                    onClick={() => setScope(option)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-[11px] font-bold transition-colors',
                      scope === option
                        ? 'border-terracotta-100 bg-terracotta-50 text-terracotta-700'
                        : 'border-line text-stone-400 hover:border-line-strong',
                    )}
                  >
                    {SCOPE_LABEL[option]}
                  </button>
                ))}
              </div>
            }
          >
            Weitere Runden
          </SectionTitle>

          {rounds.isLoading && <CardSkeleton />}
          {rounds.error && <ErrorState error={rounds.error} />}

          {!rounds.isLoading && others.length === 0 && (
            <p className="text-sm text-stone-400 italic">
              {SCOPE_EMPTY[scope]}
            </p>
          )}

          <ul className="space-y-3">
            {others.map((round) => (
              <li key={round.periodStart}>
                <RoundCard round={round} />
              </li>
            ))}
          </ul>

          {rounds.hasNextPage && (
            <Button
              variant="secondary"
              className="mt-3 w-full"
              loading={rounds.isFetchingNextPage}
              onClick={() => void rounds.fetchNextPage()}
            >
              {scope === 'past' ? 'Ältere Runden laden' : 'Weiter voraus'}
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}

function RoundCard({ round }: { round: PrayerBuddyRound }) {
  return (
    <Card className="space-y-2">
      <p className="flex items-center gap-2 text-xs font-bold text-stone-500">
        {formatDayRange(round.periodStart, round.periodEnd)}
        <span className="text-[10px] font-semibold text-stone-400">
          {/* Der Anfang, nicht das Ende: „in 2 Wochen" ist die Antwort auf
              „wann bin ich dran", „vor 6 Wochen" auf „wann war das". */}
          ab {formatRelativeDay(round.periodStart)}
        </span>
      </p>
      <ul className="space-y-1.5">
        {round.groups.map((group) => (
          <li key={group.id}>
            <GroupRow group={group} compact />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function GroupRow({
  group,
  highlight = false,
  compact = false,
}: {
  group: PrayerBuddyGroup;
  highlight?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md border px-3 py-2',
        highlight
          ? 'border-terracotta-100 bg-terracotta-50/40'
          : 'border-line bg-card',
        compact && 'border-transparent bg-canvas',
      )}
    >
      <div className="flex -space-x-2">
        {group.members.map((member) => (
          <Avatar
            key={member.id}
            person={member}
            size="xs"
            className="ring-2 ring-card"
          />
        ))}
      </div>
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-600">
        {group.members.map((member) => member.name).join(' & ')}
      </span>
    </div>
  );
}
