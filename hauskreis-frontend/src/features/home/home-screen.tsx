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
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, SectionTitle } from '@/components/ui/card';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { ROLE_ICON } from '@/components/domain/role-badge';
import { useHome, useMe, useSetAttendance } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDay, formatDayMonth, formatRelativeDay } from '@/lib/date';
import { ROLE_LABEL, mapsUrl, meetingHeadline } from '@/lib/meeting';
import { firstName } from '@/lib/person';
import type { Assignment, HomeNextMeeting } from '@/lib/api/types';

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
        <MyRoles roles={myRoles} />
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

/**
 * Rollen der nächsten acht Wochen, je Rolle die nächste. Steht nichts an, ist
 * das eine gute Nachricht und wird auch so formuliert.
 */
function MyRoles({ roles }: { roles: Assignment[] }) {
  if (roles.length === 0) {
    return (
      <Card>
        <p className="text-sm text-stone-500">
          In den nächsten Wochen bist du nirgends eingeteilt. Genieß es.
        </p>
      </Card>
    );
  }

  return (
    <ul className="space-y-2">
      {roles.map((role) => {
        const Icon = ROLE_ICON[role.role];
        const content = (
          <span className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-terracotta-50 text-terracotta-600">
                <Icon size={15} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-stone-800">
                  {role.label ?? ROLE_LABEL[role.role]}
                </span>
                <span className="block text-[11px] text-stone-500">
                  {role.endDate
                    ? `${formatDay(role.date)} – ${formatDay(role.endDate)}`
                    : formatDay(role.date)}
                </span>
              </span>
            </span>
            <Badge variant="terracotta">{formatRelativeDay(role.date)}</Badge>
          </span>
        );

        return (
          <li
            key={`${role.role}-${role.date}-${role.meetingId ?? role.groupId}`}
          >
            {role.meetingId ? (
              <Link
                href={`/termine/${role.meetingId}`}
                className="block rounded-md border border-line bg-card p-3 transition-colors hover:border-line-strong"
              >
                {content}
              </Link>
            ) : (
              <div className="rounded-md border border-line bg-card p-3">
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-stone-500">
        {meeting.location ? (
          <a
            href={mapsUrl(meeting.location)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 hover:text-terracotta-600"
          >
            <MapPin size={12} className="text-stone-400" />
            {meeting.location.name}
            <ExternalLink size={11} className="text-stone-300" />
          </a>
        ) : (
          <span className="flex items-center gap-1">
            <MapPin size={12} className="text-stone-400" />
            Ort noch offen
          </span>
        )}

        {meeting.host ? (
          <span className="flex items-center gap-1.5">
            <Avatar person={meeting.host} size="xs" />
            hostet
          </span>
        ) : (
          <span className="text-stone-400 italic">noch kein Host</span>
        )}
      </div>

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
