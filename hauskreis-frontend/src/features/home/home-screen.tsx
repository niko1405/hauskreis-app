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
  Navigation,
  ScrollText,
} from 'lucide-react';
import Link from '@/components/ui/link';
import { PRESSABLE } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { RoleChip } from '@/components/domain/role-badge';
import { DateBox, TimeAndPlace } from '@/components/domain/date-box';
import { useHome, useMe, useSetActionstepDone } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import {
  formatDay,
  formatDayRange,
  formatRelativeDay,
  groupNow,
} from '@/lib/date';
import { mapsUrl, meetingHeadline } from '@/lib/meeting';
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
    lastMeeting,
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

        {/* Drei Abschnitte in der Reihenfolge, in der man sie braucht: der
            Abend, an dem man gerade sitzt — der nächste — der letzte.

            Ganz oben nur, wenn wirklich einer läuft; „Nächstes Treffen: heute"
            war keine Auskunft mehr, wenn man schon dort saß. Ganz unten der
            vergangene: Am Mittwochmorgen will man nachlesen, was war, und die
            Nachbereitung fehlt noch — aber gefragt ist zuerst, was kommt.

            `currentMeeting` und `lastMeeting` schließen einander aus, und das
            entscheidet der Server: Ob ein Abend läuft, hängt an seiner
            Treffpunktzeit in der Zone der Gruppe, und diese Frage zweimal zu
            beantworten wäre eine Antwort zu viel. */}
        {currentMeeting && (
          <section>
            <SectionTitle>Aktueller Termin</SectionTitle>
            {/* Grün wie das „Läuft"-Abzeichen am Termin und wie der abgehakte
                Actionstep darüber: die Farbe von „gilt gerade". */}
            <PastOrCurrentMeeting
              meeting={currentMeeting}
              className="border-success-line bg-success-bg/30"
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
                Zwischen „Aktueller Termin" und „Letzter Termin" liest sich
                „Nächster Termin" als das mittlere Glied — drei Wörter für
                dieselbe Sache untereinander wären zwei zu viel. */}
            Nächster Termin
          </SectionTitle>
          {nextMeeting ? (
            <NextMeetingCard meeting={nextMeeting} />
          ) : (
            <Card>
              <p className="text-sm text-stone-400 italic">
                {/* „Danach" braucht ein Davor — den laufenden Abend. Der
                    letzte zählt hier **nicht**: Er steht unter dieser Karte,
                    und „danach ist nichts geplant" liest sich als Aussage über
                    das, was darüber steht. */}
                {currentMeeting
                  ? 'Danach ist noch nichts geplant.'
                  : 'Gerade ist kein Termin geplant.'}
              </p>
            </Card>
          )}
        </section>

        {lastMeeting && (
          <section>
            <SectionTitle>Letzter Termin</SectionTitle>
            {/* Gedämpft und ohne eigene Farbe: Er ist vorbei, nicht aktuell.
                Eine zweite Tönung neben dem Grün würde behaupten, hier gälte
                auch gerade etwas.

                `bg-canvas` und nicht `bg-shell`: Die Leinwand ist der Grund,
                auf dem die Karten liegen — die Karte wird damit flach und
                bleibt in beiden Themen genau eine Stufe ruhiger. Die Schale
                liegt eine Ebene tiefer und ist im Dunkelmodus fast schwarz
                (`#14100d` gegen `#26201b`); dort sah der Abend nicht gedämpft
                aus, sondern wie ein Loch in der Seite. Ohne Schatten aus
                demselben Grund: Was flach liegt, wirft keinen. */}
            <PastOrCurrentMeeting
              meeting={lastMeeting}
              className="bg-canvas shadow-none"
            />
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * Der Actionstep der Woche, mit dem eigenen Haken.
 *
 * Die Karte verschwindet beim Abhaken **nicht**. Erstens ließe sich der Haken
 * dann nicht zurücknehmen, zweitens ist „geschafft" auch eine Nachricht. Wie
 * es den anderen damit geht, steht hier nicht mehr — nur der eigene Haken
 * (siehe `ActionstepCheck`). Still wird es bei der Erinnerung: der Reminder
 * überspringt, wer abgehakt hat.
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
          ? 'border-success-line bg-success-bg/40'
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
              ? 'bg-success-bg text-success'
              : 'bg-card text-stone-300 hover:text-terracotta-500',
          )}
        >
          {step.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
        </button>
        <div className="min-w-0">
          <p
            className={cn(
              'text-[10px] font-bold tracking-widest uppercase',
              step.done ? 'text-success' : 'text-terracotta-500',
            )}
          >
            Actionstep der Woche
          </p>
          <p className="text-sm leading-snug font-bold text-stone-800">
            {step.text}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-400">
            vom {formatDay(step.date)}
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * Der laufende oder der letzte Abend — als Rückblick, sobald es einen gibt.
 *
 * Am Mittwochmorgen ist „was war" die Nachricht und nicht „wo war es": Datum,
 * Uhrzeit und Ort des Abends von gestern kennt man, die Zusammenfassung hat
 * man vielleicht verpasst. Steht eine da, tritt sie **an die Stelle** der
 * Karte, und darunter führt ein Knopf zum Termin. Ohne Zusammenfassung bleibt
 * es die Karte wie immer — eine leere Rückblick-Fläche wäre eine Aufforderung
 * an alle, die nichts schreiben dürfen.
 */
function PastOrCurrentMeeting({
  meeting,
  className,
}: {
  meeting: HomeNextMeeting;
  className?: string;
}) {
  if (!meeting.summaryText) {
    return <NextMeetingCard meeting={meeting} className={className} />;
  }

  return (
    <div className="space-y-3">
      {/* Dieselbe Kante wie die Infos am Termin: terracotta links heißt in
          der App „hier steht, was jemand der Gruppe sagt". */}
      <Card
        // Die Kante nach der Tönung: Ein `border-…`-Farbton für alle Seiten
        // (das Grün des laufenden Abends) schlüge sonst auch die linke.
        className={cn(
          'bg-card',
          className,
          'border-l-[3px] border-l-terracotta-500',
        )}
      >
        <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
          <ScrollText size={12} />
          Zusammenfassung
        </p>
        <p className="mt-0.5 text-[11px] text-stone-400">
          {meeting.endDate
            ? formatDayRange(meeting.date, meeting.endDate)
            : formatRelativeDay(meeting.date)}{' '}
          · {meetingHeadline(meeting)}
        </p>
        {/* Nach acht Zeilen ist Schluss: Der Rest steht am Termin, und der
            Startbildschirm soll darunter noch etwas zeigen. */}
        <p className="mt-3 line-clamp-8 text-sm leading-relaxed whitespace-pre-line text-stone-700">
          {meeting.summaryText}
        </p>
      </Card>

      <Link
        href={`/termin?id=${meeting.id}`}
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-terracotta-50 px-4 py-2 text-sm font-semibold text-terracotta-700 transition-colors hover:bg-terracotta-100',
          PRESSABLE,
        )}
      >
        Zum Termin <ChevronRight size={15} />
      </Link>
    </div>
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
  return (
    <Card className={cn('space-y-4', className)}>
      {/* Dieselbe Kopfzeile wie auf der Terminkarte: Datums-Kästchen links,
          Titel, darunter Uhrzeit und Ort. Sie sahen vorher verschieden aus —
          hier Datum und Countdown in einer Zeile, dort eine andere Anordnung —,
          obwohl es dasselbe ist. Ein Zeitraum bekommt kein Kästchen; eine
          Freizeit ist kein Tag. */}
      <div className="flex items-start gap-3">
        {meeting.endDate === null && <DateBox day={meeting.date} />}

        <div className="min-w-0 flex-1">
          <Link href={`/termin?id=${meeting.id}`} className="block min-w-0">
            <span className="text-[10px] font-semibold text-stone-400">
              {meeting.endDate
                ? formatDayRange(meeting.date, meeting.endDate)
                : formatRelativeDay(meeting.date)}
            </span>
            <h3 className="mt-0.5 font-serif text-xl font-bold text-stone-900">
              {meetingHeadline(meeting)}
            </h3>
          </Link>

          {/* Hier führt der Ort nach Maps, in der Terminliste nicht: Dort ist
              die ganze Karte ein Link auf den Abend. */}
          <TimeAndPlace
            startTime={meeting.startTime}
            location={meeting.location}
            linkToMaps
          />
        </div>

        {/* Der runde Maps-Knopf bleibt: Auf **dieser** Karte geht man auf einen
            Abend zu, und „wie komme ich hin" ist dort die nächste Frage. In der
            Terminliste liest man quer über Wochen — da wäre er an jeder Zeile
            ein Ziel, das niemand meint. */}
        {meeting.location && (
          <a
            href={mapsUrl(meeting.location)}
            target="_blank"
            rel="noreferrer"
            aria-label="In Maps öffnen"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-terracotta-600 text-white transition-colors hover:bg-terracotta-700"
          >
            <Navigation size={17} />
          </a>
        )}
      </div>

      {/* Alle Rollen des Abends, in derselben Form wie auf der Terminkarte —
          sonst heißt „noch kein Host" auf zwei Bildschirmen zweierlei. Der Link
          führt aufs Detail, weil dort das „+ … eintragen" auch einlösbar ist. */}
      <Link
        href={`/termin?id=${meeting.id}`}
        className="flex flex-wrap items-center gap-2"
      >
        {/* Braucht der Ort keinen Gastgeber — Schlosspark, Café —, steht hier
            **nichts**. Der Ort selbst steht schon in der Kopfzeile darüber;
            hier stand er ein zweites Mal, als terracotta Chip, und behauptete
            damit eine Rolle, die es an dem Abend gar nicht gibt. Dieselbe
            Regel wie in den Zuständigkeiten am Termin (`meetingRoles`). */}
        {meeting.host && <RoleChip kind="HOST" people={[meeting.host]} />}
        {meeting.hasTopicSlot && meeting.topicResponsibles.length > 0 && (
          <RoleChip kind="TOPIC" people={meeting.topicResponsibles} />
        )}
        {meeting.hasTestimonySlot && meeting.testimonyPerson && (
          <RoleChip kind="TESTIMONY" people={[meeting.testimonyPerson]} />
        )}
        {meeting.hasSongSlot && meeting.songLeaders.length > 0 && (
          <RoleChip kind="SONG" people={meeting.songLeaders} />
        )}
        {meeting.hasSnackSlot && meeting.snackResponsibles.length > 0 && (
          <RoleChip kind="SNACK" people={meeting.snackResponsibles} />
        )}
      </Link>
    </Card>
  );
}
