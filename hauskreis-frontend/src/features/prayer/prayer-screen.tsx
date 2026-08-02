'use client';

/**
 * „Gebet" — die laufende Runde und die Historie.
 *
 * Neun Personen gehen nicht glatt in Zweiergruppen auf; die Aufteilung in
 * Zweier und Dreier macht der Server. Hier wird sie nur gezeigt.
 */
import { MessageCircle } from 'lucide-react';
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
import { formatDayRange, isPast } from '@/lib/date';
import { firstName } from '@/lib/person';
import type { PrayerBuddyGroup } from '@/lib/api/types';

export function PrayerScreen() {
  const me = useMe();
  const current = useCurrentPrayerBuddies();
  const rounds = usePrayerBuddyRounds();

  const myGroup = current.data?.groups.find((group) =>
    group.members.some((member) => member.id === me.me?.id),
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
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `Hey ${firstName(member.name)}, wofür darf ich diese Woche für dich beten?`,
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button variant="secondary" size="sm">
                        <MessageCircle size={13} />
                        Schreiben
                      </Button>
                    </a>
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
          <SectionTitle>Weitere Runden</SectionTitle>

          {rounds.isLoading && <CardSkeleton />}

          <ul className="space-y-3">
            {rounds.items
              .filter(
                (round) => round.periodStart !== current.data?.periodStart,
              )
              .map((round) => (
                <li key={round.periodStart}>
                  <Card className="space-y-2">
                    <p className="flex items-center gap-2 text-xs font-bold text-stone-500">
                      {formatDayRange(round.periodStart, round.periodEnd)}
                      <span className="text-[10px] font-semibold text-stone-400">
                        {isPast(round.periodEnd) ? 'vorbei' : 'kommt noch'}
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
              Ältere Runden laden
            </Button>
          )}
        </section>
      </div>
    </div>
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
