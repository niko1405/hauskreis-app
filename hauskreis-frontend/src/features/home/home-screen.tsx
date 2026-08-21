'use client';

/**
 * „Heute" — der Startbildschirm, aus **einem** Aufruf gebaut (`…/home`).
 * Nächster Termin samt Ort, eigene Rollen der nächsten acht Wochen, offener
 * Actionstep, aktuelle Gebetsbuddys.
 */
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Map,
  MapPin,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { PRESSABLE } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import {
  ROLE_ICON,
  ROLE_STYLE,
  RoleChip,
} from '@/components/domain/role-badge';
import {
  useHome,
  useMe,
  useSetActionstepDone,
  useSetAttendance,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import {
  formatDay,
  formatDayMonth,
  formatRelativeDay,
  groupNow,
} from '@/lib/date';
import {
  ROLE_LABEL,
  actionstepProgress,
  mapsUrl,
  meetingHeadline,
} from '@/lib/meeting';
import { firstName } from '@/lib/person';
import { ScreenHeader } from '@/components/layout/screen-header';
import { ReleaseBanner } from '@/features/releases/release-banner';
import { circleOf } from '@/features/prayer/circle';
import { greetingOf } from './greeting';
import type {
  Assignment,
  AssignmentRole,
  HomeActionstep,
  HomeNextMeeting,
  HomePrayerBuddies,
} from '@/lib/api/types';

export function HomeScreen() {
  const me = useMe();
  const home = useHome();

  if (home.isLoading) {
    return (
      <div className="space-y-4 px-5 pt-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (home.error || !home.data) {
    return (
      <div className="px-5 pt-6">
        <ErrorState error={home.error} onRetry={() => void home.refetch()} />
      </div>
    );
  }

  const { nextMeeting, myRoles, openActionstep, prayerBuddies } = home.data;

  // Wechselt täglich und passt zur Tageszeit. Die Personen-Id geht mit ein,
  // damit nicht alle neun am selben Tag denselben Satz lesen.
  const jetzt = groupNow();
  const gruß = greetingOf(
    jetzt.day,
    jetzt.minutes,
    me.me?.id ?? '',
    me.me ? firstName(me.me.name) : '',
  );

  return (
    <div>
      <ScreenHeader screen="home" title={gruß.hallo} subtitle={gruß.zeile} />

      <div className="space-y-6 px-5">
        {/* Ganz oben und nur einmal: Wer es angesehen oder weggeklickt hat,
            sieht hier nichts mehr. */}
        <ReleaseBanner />

        <ActionstepCard step={openActionstep} />

        <PrayerBuddyCard buddies={prayerBuddies} myId={me.me?.id} />

        <section>
          <SectionTitle>Deine Rollen</SectionTitle>
          <MyRoles roles={myRoles} nextMeetingId={nextMeeting?.id ?? null} />
        </section>

        <section>
          <SectionTitle
            action={
              <Link
                href="/termine"
                className="flex items-center gap-0.5 text-xs font-bold text-terracotta-500 hover:underline"
              >
                Alle Termine <ChevronRight size={14} />
              </Link>
            }
          >
            Nächstes Treffen
          </SectionTitle>
          {nextMeeting ? (
            <NextMeetingCard meeting={nextMeeting} />
          ) : (
            <Card>
              <p className="text-sm text-stone-400 italic">
                Gerade ist kein Termin geplant.
              </p>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Der Actionstep der Woche, mit dem eigenen Haken.
 *
 * Die Karte verschwindet beim Abhaken **nicht**. Erstens ließe sich der Haken
 * dann nicht zurücknehmen, zweitens ist „geschafft" auch eine Nachricht — und
 * daneben steht, wie es der Gruppe damit geht. Still wird es nur bei der
 * Erinnerung: der Reminder überspringt, wer abgehakt hat.
 *
 * Und sie verschwindet auch nicht, wenn es gar keinen gibt. Ein Platz, der mal
 * da ist und mal nicht, verschiebt jedes Mal alles darunter — und die Frage
 * „habe ich diese Woche etwas vergessen?" bleibt unbeantwortet, statt ein Nein
 * zu bekommen.
 */
/**
 * Die Gebetsbuddys — und ab dreien auch die Richtung.
 *
 * Zu zweit steht dort ein Name, wie eh und je: „füreinander" ist beim Paar die
 * ganze Aussage. Zu dritt wird reihum gebetet, und dann sind es zwei Zeilen mit
 * eigener Beschriftung — dieselbe Unterscheidung wie auf dem Gebet-Bildschirm,
 * und aus derselben Rechnung (`circleOf`).
 *
 * Ohne Kreis — allein in der Gruppe, oder gar nicht darin — bleibt es bei den
 * Namen. Eine Richtung, die auf sich selbst zeigt, ist keine.
 */
function PrayerBuddyCard({
  buddies,
  myId,
}: {
  buddies: HomePrayerBuddies | null;
  myId: string | undefined;
}) {
  if (!buddies) return null;

  const kreis = circleOf(buddies.members, myId);

  return (
    <Link href="/gebet" className="block">
      <Card className="transition-colors hover:border-line-strong">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">
              Deine Gebetsbuddys
            </p>

            {kreis && kreis.size > 2 ? (
              <div className="mt-0.5 space-y-0.5">
                <p className="text-[15px] leading-snug font-bold text-stone-800">
                  <span className="font-medium text-stone-500">
                    Du betest für{' '}
                  </span>
                  {kreis.betestFuer.name}
                </p>
                <p className="text-[15px] leading-snug font-bold text-stone-800">
                  <span className="font-medium text-stone-500">
                    Für dich betet{' '}
                  </span>
                  {kreis.betetFuerDich.name}
                </p>
              </div>
            ) : (
              <p className="text-[15px] font-bold text-stone-800">
                {buddies.members
                  .filter((member) => member.id !== myId)
                  .map((member) => member.name)
                  .join(' & ')}
              </p>
            )}

            <p className="mt-1 text-[11px] font-medium text-stone-500">
              noch bis {formatDayMonth(buddies.until)}
            </p>
          </div>
          <Users size={20} className="shrink-0 text-terracotta-500" />
        </div>
      </Card>
    </Link>
  );
}

function ActionstepCard({ step }: { step: HomeActionstep | null }) {
  if (!step) {
    return (
      <Card className="border-dashed bg-transparent shadow-none">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-canvas text-stone-300">
            <Circle size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">
              Actionstep der Woche
            </p>
            <p className="text-sm leading-snug font-medium text-stone-400">
              Für diese Woche ist keiner geplant.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return <OpenActionstepCard step={step} />;
}

function OpenActionstepCard({ step }: { step: HomeActionstep }) {
  const setDone = useSetActionstepDone(step.meetingId);

  return (
    <Card
      className={cn(
        'transition-colors',
        step.done
          ? 'border-music-line bg-music-bg/40'
          : 'border-terracotta-100 bg-terracotta-50/40',
      )}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-pressed={step.done}
          aria-label={
            step.done ? 'Haken wieder wegnehmen' : 'Actionstep abhaken'
          }
          onClick={() => setDone.mutate(!step.done)}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
            'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
            step.done
              ? 'bg-music-bg text-music'
              : 'bg-card text-stone-300 hover:text-terracotta-500',
          )}
        >
          {step.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
        </button>
        <div className="min-w-0">
          <p
            className={cn(
              'text-[10px] font-bold tracking-widest uppercase',
              step.done ? 'text-music' : 'text-terracotta-500',
            )}
          >
            Actionstep der Woche
          </p>
          <p className="text-sm leading-snug font-bold text-stone-800">
            {step.text}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-400">
            vom {formatDay(step.date)} ·{' '}
            {actionstepProgress(step.doneCount, step.peopleCount)}
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * Was unter „Weitere" auftauchen kann — je Sorte die nächste.
 *
 * Die Gebetsbuddys lässt schon der Server weg (mit jemandem gepaart zu sein ist
 * keine Aufgabe). Der **Geschenk-Termin** steht dagegen bewusst dabei: Er hängt
 * an keinem Abend, kann also nie in der oberen Liste landen, und ohne diesen
 * Eintrag wäre er auf dem Startbildschirm gar nicht zu sehen — obwohl er die
 * Rolle mit der längsten Vorlaufzeit ist.
 */
const CATEGORIES: Exclude<AssignmentRole, 'PRAYER_BUDDY'>[] = [
  'HOST',
  'TOPIC',
  'SONG',
  'BIRTHDAY_GIFT',
];

/**
 * Die eigenen Aufgaben — **eine** Karte, zwei Stufen.
 *
 * **Oben** stehen die Rollen an genau dem Abend, der als Nächstes ansteht —
 * nicht die der laufenden Kalenderwoche. Der Hauskreis ist dienstags: ab
 * Mittwoch wäre eine Kalenderwoche fast immer leer, und der Abend, um den es
 * tatsächlich geht, stünde unter „Weitere". Der Bezugspunkt ist deshalb der
 * Termin, nicht der Wochenwechsel.
 *
 * **Weitere** ist bewusst kein vollständiger Kalender, sondern je Kategorie die
 * *nächste* danach. Wer dreimal in acht Wochen hostet, muss das hier nicht
 * dreimal lesen — die zweite und dritte Zeile ändern an nichts, was man heute
 * tun kann. Der ganze Vorlauf steht in der Planungstabelle.
 *
 * Eingeklappt, weil es sonst zwei Listen wären, die gleich aussehen und
 * verschieden dringend sind. Was zählt, ist der nächste Dienstag; der Rest ist
 * zum Nachsehen da, nicht zum Lesen.
 *
 * Steht nichts an, ist das eine gute Nachricht und wird auch so formuliert.
 */
function MyRoles({
  roles,
  nextMeetingId,
}: {
  roles: Assignment[];
  nextMeetingId: string | null;
}) {
  const [showRest, setShowRest] = useState(false);

  // Der Vergleich nur mit gesetztem `nextMeetingId`: sonst würde `null === null`
  // eine terminlose Rolle zur Rolle „am nächsten Treffen" machen.
  const atNextMeeting = nextMeetingId
    ? roles.filter((role) => role.meetingId === nextMeetingId)
    : [];
  // `roles` kommt chronologisch — das erste Vorkommen *ist* das nächste.
  const later = CATEGORIES.map((kind) =>
    roles.find(
      (role) => role.meetingId !== nextMeetingId && role.role === kind,
    ),
  ).filter((role) => role !== undefined);

  if (atNextMeeting.length === 0 && later.length === 0) {
    return (
      <Card>
        <p className="text-sm text-stone-500">
          In den nächsten Wochen bist du nirgends eingeteilt. Genieß es.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      {atNextMeeting.length > 0 ? (
        <ul className="divide-y divide-line">
          {atNextMeeting.map((role) => (
            <li key={roleKey(role)}>
              <RoleRow role={role} urgent />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3.5 text-sm text-stone-400">
          Beim nächsten Treffen bist du nicht eingeteilt.
        </p>
      )}

      {later.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showRest}
            onClick={() => setShowRest((current) => !current)}
            className="flex w-full items-center justify-between gap-3 border-t border-line bg-canvas px-4 py-2.5 text-left transition-colors hover:bg-stone-100"
          >
            <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">
              Weitere ({later.length})
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-stone-400 transition-transform',
                showRest && 'rotate-180',
              )}
            />
          </button>

          {showRest && (
            <ul className="divide-y divide-line border-t border-line">
              {later.map((role) => (
                <li key={roleKey(role)}>
                  <RoleRow role={role} urgent={false} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

/** Rolle *und* Abend: dieselbe Rolle kann an mehreren Terminen dranstehen. */
function roleKey(role: Assignment): string {
  return `${role.role}-${role.date}-${role.meetingId ?? role.occasionId}`;
}

function RoleRow({ role, urgent }: { role: Assignment; urgent: boolean }) {
  const Icon = ROLE_ICON[role.role];
  const Style = ROLE_STYLE[role.role];

  const content = (
    <span className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
            Style,
          )}
        >
          <Icon size={20} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-stone-800">
            {/* Die Rolle zuerst: „Bei Chris" allein sagt nicht, dass *du*
                hostest. Das Label ist der Zusatz, nicht der Ersatz. */}
            {ROLE_LABEL[role.role]}
            {role.label && (
              <span className="font-medium text-stone-500">
                {' '}
                · {role.label}
              </span>
            )}
          </span>
          <span className="block text-[11px] text-stone-500">
            {formatDay(role.date)}
          </span>
        </span>
      </span>
      <Badge variant={urgent ? 'terracotta' : 'neutral'}>
        {formatRelativeDay(role.date)}
      </Badge>
    </span>
  );

  // Die Zeile trägt ihren eigenen Rand nicht mehr — sie liegt jetzt *in* einer
  // Karte, und ein Rahmen im Rahmen war genau das Unruhige daran.
  // Zwei Sorten Ziel: Termin-Rollen führen zum Abend, der Geschenk-Termin zu
  // seinem Geburtstag. Ohne Ziel bleibt es eine Zeile — ein Link ins Nichts
  // wäre schlechter als keiner.
  const href = role.meetingId
    ? `/termin?id=${role.meetingId}`
    : role.occasionId
      ? `/geburtstag?id=${role.occasionId}`
      : null;

  if (!href) {
    return <div className="px-4 py-3.5">{content}</div>;
  }

  return (
    <Link
      href={href}
      className={cn(
        'block px-4 py-3.5 transition-colors hover:bg-canvas active:bg-canvas',
        PRESSABLE,
      )}
    >
      {content}
    </Link>
  );
}

function NextMeetingCard({ meeting }: { meeting: HomeNextMeeting }) {
  const attendance = useSetAttendance(meeting.id);
  const me = useMe();

  const setStatus = (status: 'ATTENDING' | 'ABSENT') => {
    if (!me.me) return;
    attendance.mutate({ personId: me.me.id, status });
  };

  return (
    <Card className="space-y-4">
      {/* Die Uhrzeit steht nur hier — auf dieser einen Karte geht man auf einen
          Abend zu. In den Terminlisten liest man quer über Wochen, dort wäre sie
          an jeder Zeile Rauschen. Seit sich die Zeit einstellen lässt, ist
          „18 Uhr wie immer" keine sichere Annahme mehr. */}
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-stone-500">
          <Link
            href={`/termin?id=${meeting.id}`}
            className="block min-w-0 flex-1 mb-3"
          >
            <span className="text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
              {formatDay(meeting.date)} · {formatRelativeDay(meeting.date)}
            </span>
            <h3 className="mt-0.5 font-serif text-lg font-bold text-stone-900">
              {meetingHeadline(meeting)}
            </h3>
          </Link>
          {meeting.location ? (
            <a
              href={mapsUrl(meeting.location)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-terracotta-600"
            >
              <MapPin size={12} className="text-stone-400" />
              {meeting.location.name}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} className="text-stone-400" />
              Ort noch offen
            </span>
          )}
        </div>

        <div className="flex flex-col shrink-0 items-center justify-center gap-3">
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-xs font-bold text-stone-600">
            <Clock size={13} className="text-terracotta-500" />
            {meeting.startTime} Uhr
          </span>
          {meeting.location && (
            <a
              href={mapsUrl(meeting.location)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center p-3 bg-terracotta-600 rounded-full"
            >
              <Map size={19} className="text-stone-400" color="white" />
            </a>
          )}
        </div>
      </div>

      {/* Alle drei Rollen, in derselben Form wie auf der Terminkarte — sonst
          heißt „noch kein Host" auf zwei Bildschirmen zweierlei. Der Link führt
          aufs Detail, weil dort das „+ … eintragen" auch einlösbar ist. */}
      <Link
        href={`/termin?id=${meeting.id}`}
        className="flex flex-wrap items-center gap-2"
      >
        <RoleChip
          kind="HOST"
          people={meeting.host ? [meeting.host] : []}
          emptyLabel={
            meeting.location && !meeting.location.requiresHost
              ? 'Kein Host nötig'
              : undefined
          }
        />
        {meeting.hasTopicSlot && (
          <RoleChip kind="TOPIC" people={meeting.topicResponsibles} />
        )}
        {meeting.hasSongSlot && (
          <RoleChip kind="SONG" people={meeting.songLeaders} />
        )}
      </Link>

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <span className="mr-auto text-[11px] font-semibold text-stone-400">
          Bist du dabei?
        </span>
        <AttendanceButton
          active={meeting.myAttendance === 'ATTENDING'}
          onClick={() => setStatus('ATTENDING')}
        >
          Ja
        </AttendanceButton>
        <AttendanceButton
          active={meeting.myAttendance === 'ABSENT'}
          tone="alert"
          onClick={() => setStatus('ABSENT')}
        >
          Nein
        </AttendanceButton>
      </div>
    </Card>
  );
}

function AttendanceButton({
  active,
  tone = 'music',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
  tone?: 'music' | 'alert';
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'rounded-full border px-4 py-1.5 text-xs font-bold transition-colors disabled:opacity-50',
        active
          ? tone === 'music'
            ? 'border-music-line bg-music-bg text-music'
            : 'border-alert-line bg-alert-bg text-alert'
          : 'border-line text-stone-400 hover:border-line-strong',
      )}
      {...props}
    >
      {children}
    </button>
  );
}
