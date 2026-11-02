'use client';

/**
 * „Gebet" — die laufende Runde, was danach kommt und was war.
 *
 * Neun Personen gehen nicht glatt in Zweiergruppen auf; die Aufteilung in
 * Zweier und Dreier macht der Server. Hier wird sie nur gezeigt.
 *
 * **Oben die eigene Gruppe, hervorgehoben**, darunter alle anderen als Listen.
 * Wer diesen Bildschirm öffnet, will zuerst wissen, mit wem er betet — der
 * Rest ist Nachschlagen. Die Listen sind zusammenhängende Karten mit
 * Trennlinien statt einer Pille je Gruppe: Neun Pillen untereinander waren
 * neun gleich laute Flächen, und dazwischen ging die eigene unter.
 *
 * Kein „Schreiben"-Knopf mehr. Er baute eine WhatsApp-Nachricht mit einem
 * vorformulierten Satz — nur ohne Nummer, also landete man in der
 * Kontaktauswahl und suchte die Person, die auf dem Bildschirm daneben stand.
 * Wer seine Gebetsbuddys anschreiben will, hat den Chat ohnehin offen.
 */
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck,
  CalendarClock,
  HeartHandshake,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { ScreenHeader } from '@/components/layout/screen-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  useCurrentPrayerBuddies,
  useMe,
  usePrayerBuddyRounds,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDayMonth, formatDayRange, formatRelativeDay } from '@/lib/date';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { circleOf } from './circle';
import type {
  PersonRef,
  PrayerBuddyGroup,
  PrayerBuddyRound,
} from '@/lib/api/types';

type Scope = 'upcoming' | 'past';

const SCOPE_EMPTY: Record<Scope, string> = {
  upcoming: 'Weiter voraus ist noch nichts geplant.',
  past: 'Noch keine Runde vorbei — ihr fangt gerade erst an.',
};

export function PrayerScreen() {
  const { hauskreis } = useHauskreis();

  // Ohne Gebetsbuddys steht dieser Bildschirm nicht in der Leiste — aber ein
  // Lesezeichen führt trotzdem hierher, und dort ist eine leere Runden-Liste
  // eine Behauptung („noch nichts geplant") statt einer Auskunft.
  if (hauskreis && !hauskreis.features.prayerBuddies) {
    return <PrayerBuddiesOff />;
  }

  return <Rounds />;
}

function PrayerBuddiesOff() {
  return (
    <div>
      <ScreenHeader screen="prayer" title="Gebet" />
      <div className="px-5">
        <EmptyState
          title="Gebetsbuddys sind ausgeschaltet"
          hint="Euer Hauskreis arbeitet gerade ohne feste Gebetspartner. Ein Admin kann sie in der Verwaltung wieder einschalten."
        />
      </div>
    </div>
  );
}

function Rounds() {
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

        {current.data && myGroup && (
          <MyGroup
            group={myGroup}
            myId={me.me?.id}
            until={current.data.periodEnd}
          />
        )}

        {current.data && current.data.groups.length > 0 && (
          <section>
            <SectionTitle>Alle Gruppen dieser Runde</SectionTitle>
            <GroupList groups={current.data.groups} mine={myGroup?.id} />
          </section>
        )}

        <section>
          {/* Eine eigene Zeile statt `SectionTitle`: Die richtet an der
              Grundlinie aus, und ein Umschalter aus Symbolen hat keine. */}
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h2 className="text-xs font-bold tracking-wider text-stone-400 uppercase">
              Weitere Runden
            </h2>
            {/* Dieselben zwei Symbole wie in der Terminliste: die Uhr für
                „steht noch an", der Haken für „war schon". */}
            <Segmented
              iconOnly
              label="Welche Runden"
              value={scope}
              onChange={setScope}
              options={[
                {
                  value: 'upcoming',
                  label: 'Kommende Runden',
                  icon: <CalendarClock size={16} />,
                },
                {
                  value: 'past',
                  label: 'Vergangene Runden',
                  icon: <CalendarCheck size={16} />,
                },
              ]}
            />
          </div>

          {rounds.isLoading && <CardSkeleton />}
          {rounds.error && <ErrorState error={rounds.error} />}

          {!rounds.isLoading && others.length === 0 && (
            <p className="px-1 text-sm text-stone-400 italic">
              {SCOPE_EMPTY[scope]}
            </p>
          )}

          <div className="space-y-5">
            {others.map((round) => (
              <RoundBlock key={round.periodStart} round={round} />
            ))}
          </div>

          {rounds.hasNextPage && (
            <Button
              variant="secondary"
              className="mt-4 w-full"
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

/**
 * Eine Runde wie ein Abschnitt in den iOS-Einstellungen: die Zeitspanne als
 * kleine Kopfzeile, darunter die Gruppen in einer Karte.
 */
function RoundBlock({ round }: { round: PrayerBuddyRound }) {
  return (
    <div>
      <p className="mb-2 flex items-baseline gap-2 px-1 text-xs font-bold text-stone-500">
        {formatDayRange(round.periodStart, round.periodEnd)}
        <span className="text-[11px] font-semibold text-stone-400">
          {/* Der Anfang, nicht das Ende: „in 2 Wochen" ist die Antwort auf
              „wann bin ich dran", „vor 6 Wochen" auf „wann war das". */}
          ab {formatRelativeDay(round.periodStart)}
        </span>
      </p>
      <GroupList groups={round.groups} />
    </div>
  );
}

/**
 * Die eigene Gruppe — hervorgehoben, und der einzige Ort, an dem die Richtung
 * persönlich wird.
 *
 * Getönt wie der Kopf eines Geburtstags: Es ist das, weswegen man hier ist,
 * und unter den Listen darunter ging es sonst unter.
 *
 * Zu **zweit** bleibt es schlicht: Ihr betet füreinander, die Richtung trägt
 * keine Information, und sie auszuschreiben wäre eine Unterscheidung ohne
 * Unterschied — man liest sie dann beim Trio auch nicht mehr.
 *
 * Zu **dritt** wird reihum gebetet: Aus „Anna und Ben" müsste sich jede:r
 * selbst zusammenreimen, für wen er betet. Deshalb stehen beide Rollen mit
 * eigener Beschriftung da, denn beide sind gleich wichtig — die eine ist ein
 * Auftrag, die andere ein Zuspruch.
 */
function MyGroup({
  group,
  myId,
  until,
}: {
  group: PrayerBuddyGroup;
  myId: string | undefined;
  until: string;
}) {
  const kreis = circleOf(group.members, myId);

  return (
    <section className="relative overflow-hidden rounded-card border border-terracotta-100 bg-gradient-to-br from-terracotta-50 via-card to-card p-5 shadow-sm">
      {/* Groß und blass in der Ecke: Schmuck, keine Information. */}
      <HeartHandshake
        aria-hidden
        size={120}
        strokeWidth={1}
        className="pointer-events-none absolute -right-6 -bottom-8 text-terracotta-100"
      />

      <div className="relative">
        <h2 className="text-[10px] font-bold tracking-widest text-terracotta-600 uppercase">
          {kreis && kreis.size > 2 ? 'Ihr betet reihum' : 'Du betest mit'}
        </h2>

        {kreis === null ? (
          <p className="mt-2 text-sm text-stone-500 italic">
            Diese Runde bist du allein in deiner Gruppe.
          </p>
        ) : kreis.size === 2 ? (
          <div className="mt-3 flex items-center gap-4">
            <Avatar
              person={kreis.betestFuer}
              size="lg"
              className="shrink-0 ring-4 ring-card"
            />
            <p className="min-w-0 font-serif text-2xl leading-tight font-bold break-words text-stone-900">
              {kreis.betestFuer.name}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <Direction
              icon={ArrowUpRight}
              label="Du betest für"
              person={kreis.betestFuer}
            />
            <div className="border-t border-terracotta-100" />
            <Direction
              icon={ArrowDownLeft}
              label="Für dich betet"
              person={kreis.betetFuerDich}
            />
          </div>
        )}

        <p className="mt-4 text-[11px] font-medium text-stone-400">
          noch bis {formatDayMonth(until)}
        </p>
      </div>
    </section>
  );
}

/** Eine Richtung im Trio — Auftrag oder Zuspruch. */
function Direction({
  icon: Icon,
  label,
  person,
}: {
  icon: LucideIcon;
  label: string;
  person: PersonRef;
}) {
  return (
    <div className="flex items-center gap-4">
      <Avatar person={person} size="lg" className="shrink-0 ring-4 ring-card" />
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
          <Icon size={12} strokeWidth={2.5} />
          {label}
        </p>
        <p className="mt-0.5 font-serif text-xl leading-tight font-bold break-words text-stone-900">
          {person.name}
        </p>
      </div>
    </div>
  );
}

/** Gruppen als **eine** Karte mit Trennlinien — nicht eine Pille je Gruppe. */
function GroupList({
  groups,
  mine,
}: {
  groups: PrayerBuddyGroup[];
  mine?: string;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <ul className="divide-y divide-line">
        {groups.map((group) => (
          <li key={group.id}>
            <GroupRow group={group} mine={group.id === mine} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function GroupRow({ group, mine }: { group: PrayerBuddyGroup; mine: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3',
        mine && 'bg-terracotta-50/50',
      )}
    >
      <div className="flex shrink-0 -space-x-2">
        {group.members.map((member) => (
          <Avatar
            key={member.id}
            person={member}
            size="xs"
            className="ring-2 ring-card"
          />
        ))}
      </div>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[13px] font-semibold',
          mine ? 'text-stone-800' : 'text-stone-600',
        )}
      >
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
      {mine && (
        <span className="shrink-0 text-[10px] font-bold tracking-wider text-terracotta-600 uppercase">
          Deine
        </span>
      )}
    </div>
  );
}
