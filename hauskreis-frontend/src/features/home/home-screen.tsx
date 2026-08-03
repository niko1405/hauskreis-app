'use client';

/**
 * „Heute" — der Startbildschirm, aus **einem** Aufruf gebaut (`…/home`).
 * Nächster Termin samt Ort, eigene Rollen der nächsten acht Wochen, offener
 * Actionstep, aktuelle Gebetsbuddys.
 */
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  MapPin,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, SectionTitle } from '@/components/ui/card';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { ROLE_ICON, RoleChip } from '@/components/domain/role-badge';
import { useHome, useMe, useSetAttendance } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDay, formatDayMonth, formatRelativeDay } from '@/lib/date';
import {
  ROLE_LABEL,
  hasTopicSlot,
  mapsUrl,
  meetingHeadline,
} from '@/lib/meeting';
import { firstName } from '@/lib/person';
import type {
  Assignment,
  AssignmentRole,
  HomeNextMeeting,
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

  return (
    <div className="space-y-6 px-5 pt-6">
      <header>
        <h1 className="font-serif text-3xl leading-tight font-bold text-stone-900">
          Hallo {me.me ? firstName(me.me.name) : ''}!
        </h1>
        <p className="mt-0.5 text-sm text-stone-400">
          Schön, dass du da bist. Das steht bei dir an.
        </p>
      </header>

      {openActionstep && (
        <Card className="border-terracotta-100 bg-terracotta-50/40">
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-terracotta-50 text-terracotta-500">
              <CheckCircle2 size={22} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
                Actionstep der Woche
              </p>
              <p className="text-sm leading-snug font-bold text-stone-800">
                {openActionstep.text}
              </p>
              <p className="mt-0.5 text-[11px] text-stone-400">
                vom {formatDay(openActionstep.date)}
              </p>
            </div>
          </div>
        </Card>
      )}

      {prayerBuddies && (
        <Link href="/gebet" className="block">
          <Card className="transition-colors hover:border-line-strong">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">
                  Deine Gebetsbuddys
                </p>
                <p className="text-[15px] font-bold text-stone-800">
                  {prayerBuddies.withNames.join(' & ')}
                </p>
                <p className="mt-1 text-[11px] font-medium text-stone-500">
                  noch bis {formatDayMonth(prayerBuddies.until)}
                </p>
              </div>
              <Users size={20} className="shrink-0 text-terracotta-500" />
            </div>
          </Card>
        </Link>
      )}

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
  );
}

/** Host, Thema, Musik — die Gebetsbuddys lässt schon der Server weg. */
const CATEGORIES: Exclude<AssignmentRole, 'PRAYER_BUDDY'>[] = [
  'HOST',
  'TOPIC',
  'SONG',
];

/**
 * Die eigenen Aufgaben, in zwei Stufen.
 *
 * **Beim nächsten Treffen** sind die Rollen an genau dem Abend, der als
 * Nächstes ansteht — nicht die der laufenden Kalenderwoche. Der Hauskreis ist
 * dienstags: ab Mittwoch wäre eine Kalenderwoche fast immer leer, und der
 * Abend, um den es tatsächlich geht, stünde unter „Weitere". Der Bezugspunkt
 * ist deshalb der Termin, nicht der Wochenwechsel.
 *
 * **Weitere** ist bewusst kein vollständiger Kalender, sondern je Kategorie die
 * *nächste* danach. Wer dreimal in acht Wochen hostet, muss das hier nicht
 * dreimal lesen — die zweite und dritte Zeile ändern an nichts, was man heute
 * tun kann. Der ganze Vorlauf steht in der Planungstabelle.
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
    <div className="space-y-4">
      {atNextMeeting.length > 0 && (
        <RoleGroup title="Beim nächsten Treffen" roles={atNextMeeting} urgent />
      )}
      {later.length > 0 && <RoleGroup title="Weitere" roles={later} />}
    </div>
  );
}

function RoleGroup({
  title,
  roles,
  urgent = false,
}: {
  title: string;
  roles: Assignment[];
  urgent?: boolean;
}) {
  return (
    <div>
      <h3
        className={cn(
          'mb-2 px-1 text-[10px] font-bold tracking-widest uppercase',
          urgent ? 'text-terracotta-500' : 'text-stone-400',
        )}
      >
        {title}
      </h3>
      <ul className="space-y-2">
        {roles.map((role) => (
          <li key={`${role.role}-${role.date}-${role.meetingId}`}>
            <RoleRow role={role} urgent={urgent} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoleRow({ role, urgent }: { role: Assignment; urgent: boolean }) {
  const Icon = ROLE_ICON[role.role];

  const content = (
    <span className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
            urgent
              ? 'bg-terracotta-100 text-terracotta-700'
              : 'bg-terracotta-50 text-terracotta-600',
          )}
        >
          <Icon size={15} />
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

  if (!role.meetingId) {
    return (
      <div className="rounded-md border border-line bg-card p-3">{content}</div>
    );
  }

  return (
    <Link
      href={`/termine/${role.meetingId}`}
      className={cn(
        'block rounded-md border bg-card p-3 transition-colors hover:border-line-strong',
        urgent ? 'border-terracotta-100' : 'border-line',
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
      <Link href={`/termine/${meeting.id}`} className="block">
        <span className="text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
          {formatDay(meeting.date)} · {formatRelativeDay(meeting.date)}
        </span>
        <h3 className="mt-0.5 font-serif text-lg font-bold text-stone-900">
          {meetingHeadline({ ...meeting, topic: meeting.topic })}
        </h3>
      </Link>

      <div className="text-xs font-medium text-stone-500">
        {meeting.location ? (
          <a
            href={mapsUrl(meeting.location)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-terracotta-600"
          >
            <MapPin size={12} className="text-stone-400" />
            {meeting.location.name}
            <ExternalLink size={11} className="text-stone-300" />
          </a>
        ) : (
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} className="text-stone-400" />
            Ort noch offen
          </span>
        )}
      </div>

      {/* Alle drei Rollen, in derselben Form wie auf der Terminkarte — sonst
          heißt „noch kein Host" auf zwei Bildschirmen zweierlei. Der Link führt
          aufs Detail, weil dort das „+ … eintragen" auch einlösbar ist. */}
      <Link
        href={`/termine/${meeting.id}`}
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
        {hasTopicSlot(meeting.type) && (
          <RoleChip kind="TOPIC" people={meeting.topic?.responsibles ?? []} />
        )}
        <RoleChip kind="SONG" people={meeting.songLeaders} />
      </Link>

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <span className="mr-auto text-[11px] font-semibold text-stone-400">
          Bist du dabei?
        </span>
        <AttendanceButton
          active={meeting.myAttendance === 'ATTENDING'}
          onClick={() => setStatus('ATTENDING')}
          disabled={attendance.isPending}
        >
          Ja
        </AttendanceButton>
        <AttendanceButton
          active={meeting.myAttendance === 'ABSENT'}
          tone="alert"
          onClick={() => setStatus('ABSENT')}
          disabled={attendance.isPending}
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
