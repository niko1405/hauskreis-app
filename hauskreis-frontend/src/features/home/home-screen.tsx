'use client';

/**
 * „Heute" — der Startbildschirm, aus **einem** Aufruf gebaut (`…/home`).
 * Nächster Termin samt Ort, eigene Rollen der nächsten acht Wochen, offener
 * Actionstep, aktuelle Gebetsbuddys.
 */
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleCheckBig,
  Clock,
  Map,
  MapPin,
} from 'lucide-react';
import Link from 'next/link';
import { Card, SectionTitle } from '@/components/ui/card';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { RoleChip } from '@/components/domain/role-badge';
import {
  useHome,
  useMe,
  useSetActionstepDone,
  useSetAttendance,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDay, formatRelativeDay, groupNow } from '@/lib/date';
import { actionstepProgress, mapsUrl, meetingHeadline } from '@/lib/meeting';
import { firstName } from '@/lib/person';
import { ScreenHeader } from '@/components/layout/screen-header';
import { ReleaseBanner } from '@/features/releases/release-banner';
import { greetingOf } from './greeting';
import { MyRoles } from './my-roles';
import { OwnerWelcomeSheet } from './owner-welcome-sheet';
import { PrayerBuddyCard } from './prayer-buddy-card';
import type { HomeActionstep, HomeNextMeeting } from '@/lib/api/types';

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

  const {
    currentMeeting,
    nextMeeting,
    myRoles,
    openActionstep,
    prayerBuddies,
  } = home.data;

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
      {/* Nur beim allerersten Start nach dem Gründen, und nur auf dem Gerät,
          auf dem gegründet wurde. */}
      <OwnerWelcomeSheet />

      <ScreenHeader screen="home" title={gruß.hallo} subtitle={gruß.zeile} />

      <div className="space-y-8 px-5">
        {/* Ganz oben und nur einmal: Wer es angesehen oder weggeklickt hat,
            sieht hier nichts mehr. */}
        <ReleaseBanner />

        <ActionstepCard step={openActionstep} />

        <PrayerBuddyCard buddies={prayerBuddies} myId={me.me?.id} />

        <section>
          <SectionTitle>Deine Rollen</SectionTitle>
          {/* Der Abend, um den es gerade geht: der laufende, sonst der
              nächste. Ohne den Vorrang fiele die eigene Rolle **an dem Abend,
              an dem man sitzt** aus dem Register „Nächstes" heraus und stünde
              unter „Zukünftige" — genau verkehrt herum. */}
          <MyRoles
            roles={myRoles}
            nextMeetingId={currentMeeting?.id ?? nextMeeting?.id ?? null}
          />
        </section>

        {/* Zwei Fragen und zwei Karten: „wo bin ich jetzt" und „was kommt".
            Vorher gab es nur eine, und die zeigte den laufenden Abend unter der
            Überschrift „Nächstes Treffen" — keine Auskunft mehr, wenn man schon
            dort sitzt. Läuft nichts, bleibt alles wie bisher. */}
        {currentMeeting && (
          <section>
            <SectionTitle>Aktueller Termin</SectionTitle>
            {/* Grün wie das „Läuft"-Abzeichen am Termin und wie der abgehakte
                Actionstep darüber: die Farbe von „gilt gerade". */}
            <NextMeetingCard
              meeting={currentMeeting}
              className="border-music-line bg-music-bg/30"
            />
          </section>
        )}

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
            {/* „Nächstes Treffen" hieß es, solange es nur eine Karte gab.
                Unter „Aktueller Termin" liest sich „Nächster Termin" als das
                Gegenstück — zwei Wörter für dieselbe Sache untereinander wären
                eines zu viel. */}
            Nächster Termin
          </SectionTitle>
          {nextMeeting ? (
            <NextMeetingCard meeting={nextMeeting} />
          ) : (
            <Card>
              <p className="text-sm text-stone-400 italic">
                {currentMeeting
                  ? 'Danach ist noch nichts geplant.'
                  : 'Gerade ist kein Termin geplant.'}
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
function ActionstepCard({ step }: { step: HomeActionstep | null }) {
  if (!step) {
    return (
      <Card className="border-dashed bg-transparent shadow-none">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-canvas text-stone-300">
            <CircleCheckBig size={24} />
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

function NextMeetingCard({
  meeting,
  className,
}: {
  meeting: HomeNextMeeting;
  /** Der laufende Abend bekommt hier seine grüne Tönung. */
  className?: string;
}) {
  const attendance = useSetAttendance(meeting.id);
  const me = useMe();

  const setStatus = (status: 'ATTENDING' | 'ABSENT') => {
    if (!me.me) return;
    attendance.mutate({ personId: me.me.id, status });
  };

  return (
    <Card className={cn('space-y-4', className)}>
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

      {/* Alle Rollen des Abends, in derselben Form wie auf der Terminkarte —
          sonst heißt „noch kein Host" auf zwei Bildschirmen zweierlei. Der Link
          führt aufs Detail, weil dort das „+ … eintragen" auch einlösbar ist. */}
      <Link
        href={`/termin?id=${meeting.id}`}
        className="flex flex-wrap items-center gap-2"
      >
        {meeting.location && !meeting.location.requiresHost ? (
          <p
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors',
              'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
              'bg-terracotta-50 text-terracotta-700 border-terracotta-100',
            )}
          >
            <MapPin size={12} className="shrink-0" />
            <span>{meeting.location.name}</span>
          </p>
        ) : (
          meeting.host && (
            <RoleChip kind="HOST" people={meeting.host ? [meeting.host] : []} />
          )
        )}
        {meeting.hasTopicSlot && meeting.topicResponsibles.length > 0 && (
          <RoleChip kind="TOPIC" people={meeting.topicResponsibles} />
        )}
        {meeting.hasTestimonySlot && meeting.testimonyPerson && (
          <RoleChip kind="TESTIMONY" people={[meeting.testimonyPerson]} />
        )}
        {meeting.hasSongSlot && meeting.songLeaders.length > 0 && (
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
