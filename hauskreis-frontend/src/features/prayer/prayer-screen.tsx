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
import { ScreenHeader } from '@/components/layout/screen-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { FieldLabel } from '@/components/ui/field';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  useCurrentPrayerBuddies,
  useMe,
  usePrayerBuddyRounds,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDayRange, formatRelativeDay } from '@/lib/date';
import { circleOf } from './circle';
import type {
  PersonRef,
  PrayerBuddyGroup,
  PrayerBuddyRound,
} from '@/lib/api/types';

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
      <ScreenHeader
        screen="prayer"
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

        {myGroup && <MyGroup group={myGroup} myId={me.me?.id} />}

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

/**
 * Die eigene Gruppe — und der einzige Ort, an dem die Richtung persönlich wird.
 *
 * Zu **zweit** bleibt es schlicht: Ihr betet füreinander, die Richtung trägt
 * keine Information, und sie auszuschreiben wäre eine Unterscheidung ohne
 * Unterschied — man liest sie dann beim Trio auch nicht mehr.
 *
 * Zu **dritt** wird reihum gebetet, und das stand vorher nirgends: Aus „Anna
 * und Ben" musste sich jede:r selbst zusammenreimen, für wen er betet. Jetzt
 * stehen beide Rollen mit eigener Beschriftung da, denn beide sind gleich
 * wichtig — die eine ist ein Auftrag, die andere ein Zuspruch.
 */
function MyGroup({
  group,
  myId,
}: {
  group: PrayerBuddyGroup;
  myId: string | undefined;
}) {
  const kreis = circleOf(group.members, myId);

  if (!kreis) {
    return (
      <section>
        <SectionTitle>Du betest mit</SectionTitle>
        <Card>
          <p className="text-sm text-stone-400 italic">
            Diese Runde bist du allein in deiner Gruppe.
          </p>
        </Card>
      </section>
    );
  }

  if (kreis.size === 2) {
    return (
      <section>
        <SectionTitle>Du betest mit</SectionTitle>
        <Card>
          <Person person={kreis.betestFuer} />
        </Card>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle>Ihr betet reihum</SectionTitle>
      <Card className="space-y-4">
        <div>
          <FieldLabel>Du betest für</FieldLabel>
          <Person person={kreis.betestFuer} />
        </div>
        <div className="border-t border-line pt-4">
          <FieldLabel>Für dich betet</FieldLabel>
          <Person person={kreis.betetFuerDich} />
        </div>
      </Card>
    </section>
  );
}

function Person({ person }: { person: PersonRef | undefined }) {
  if (!person) return null;

  return (
    <div className="flex items-center gap-3">
      <Avatar person={person} />
      <span className="flex-1 font-bold text-stone-800">{person.name}</span>
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
        {/* Zu zweit betet man füreinander — da sagt ein Pfeil nichts, was ein
            `&` nicht auch sagt. Ab dreien wird reihum gebetet, und dann ist die
            Kette die Aussage. Der wiederholte erste Name am Ende schließt den
            Kreis ohne Legende; er steht gedämpft, weil er nur eine Ansage über
            die Form ist — und fällt beim Abschneiden der Zeile als Erstes weg,
            wo er am wenigsten fehlt. */}
        {group.members.length <= 2 ? (
          group.members.map((member) => member.name).join(' & ')
        ) : (
          <>
            {group.members.map((member) => member.name).join(' → ')}
            <span className="text-stone-400">
              {' → '}
              {group.members[0]?.name}
            </span>
          </>
        )}
      </span>
    </div>
  );
}
