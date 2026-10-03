'use client';

/**
 * Ein Termin im Detail. Eigene Route, echte URL — der Zurück-Knopf des
 * Browsers funktioniert, und man kann den Link teilen.
 *
 * Jede Änderung geht als `PATCH` mit `If-Match` raus. Kommt ein `412` zurück,
 * erscheint das Konfliktbanner: dann hat jemand anders in der Zwischenzeit
 * gespeichert, und das gehört gesehen.
 *
 * Zwei Dinge prägen den Aufbau:
 *
 * **Ort und Gastgeber sind eine Entscheidung.** Wer hostet, hostet bei sich.
 * Deshalb gibt es dafür auch nur **ein** Bedienelement: `VenueSheet` mit zwei
 * Registern, „Zuhause" und „Treffpunkte". Die Ort-Zeile hier ist reine Anzeige.
 * Vorher waren es zwei Stellen — ein Auswahlfeld für den Treffpunkt und
 * daneben das Personen-Sheet —, und die Kopplung konnte sich nur als
 * Fehlermeldung äußern („nimm erst den Gastgeber heraus"). Durchgesetzt wird
 * sie weiterhin im Backend (`MeetingService.resolveVenue`).
 *
 * **Ein vergangener Abend ist ein eigener Zustand**, nicht ein ausgegrauter
 * kommender. Nachtragen geht, aber mit Rückfrage und ohne Vorschläge; Lieder
 * stehen fest; und „absagen" heißt dort „hat nicht stattgefunden" und schickt
 * niemandem mehr eine Benachrichtigung.
 */
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  ExternalLink,
  Info,
  MapPin,
  Navigation,
  Pencil,
  UserPen,
} from 'lucide-react';
import Link from '@/components/ui/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton, PRESSABLE } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { namesOf, shortName } from '@/lib/person';
import {
  useMe,
  useMeeting,
  useSetSnackResponsibles,
  useSongLeaders,
  useUpdateMeeting,
} from '@/lib/api/hooks';
import {
  formatDayFull,
  formatDayRange,
  formatRelativeDay,
  formatWeekday,
  hasStarted,
} from '@/lib/date';
import {
  MEETING_SLOT_KEYS,
  meetingKindLabel,
  ROLE_LABEL,
  SLOT_LABEL,
  activeMeetingRoles,
  applySlotToggle,
  mapsUrl,
  meetingHeadline,
  meetingPhase,
} from '@/lib/meeting';
import { ROLE_ICON } from '@/components/domain/role-badge';
import { ActionstepCheck } from '@/components/domain/actionstep-check';
import { SlotCard } from '@/components/domain/slot-toggles';
import type { MeetingRole, MeetingSlotKey } from '@/lib/meeting';
import type { AssignmentRole, Meeting, PersonRef } from '@/lib/api/types';
import { AnswerBar } from './answer-bar';
import { AttendanceCard } from './attendance-card';
import {
  CancelledNotice,
  CancelMeetingBlock,
  DeleteMeetingBlock,
} from './cancellation-card';
import { MeetingEditSheet } from './meeting-edit-sheet';
import { NotesCard, NotesPrompt } from './notes-card';
import { PrayerRequestsCard } from './prayer-requests-card';
import { SongsCard } from './songs-card';
import { TopicCard } from './topic-card';
import { useRoleAssignment } from './use-role-assignment';
import { useTopicSessionActions } from './use-topic-session';

/**
 * Was beim Wegnehmen eines Bausteins verlorengeht — als Satz, oder `null`,
 * wenn nichts dranhängt.
 *
 * Die Rückfrage soll benennen, was sie kostet. „Bist du sicher?" ohne Inhalt
 * ist eine Frage, die man wegklickt, ohne sie gelesen zu haben.
 */
const SLOT_LOSSES: Record<MeetingSlotKey, (meeting: Meeting) => string | null> =
  {
    hasTopicSlot: (meeting) =>
      meeting.topicSession
        ? 'Der Abend verliert sein Thema. Vorbereitetes geht nicht verloren — es wird nur wieder ein Entwurf, den du jederzeit aufnehmen kannst.'
        : null,
    // Als einziger immer: die Liedvorschläge liegen in einer eigenen Abfrage,
    // dieser Bildschirm sieht von hier aus nicht, ob welche da sind. Und etwas
    // zu löschen, das jemand getippt hat, ohne zu fragen, ist der schlechtere
    // Fehler als eine Rückfrage zu viel.
    hasSongSlot: () =>
      'Alle Liedvorschläge dieses Abends und die Musik-Zuteilung werden gelöscht.',
    hasTestimonySlot: (meeting) =>
      meeting.testimonyPerson
        ? `${meeting.testimonyPerson.name} erzählt an dem Abend dann nichts mehr.`
        : null,
    // Namentlich, wie beim Testimony: Wer eingetragen ist, steht in der Antwort
    // des Termins, und „die Snack-Zuteilung wird gelöscht" sagt weniger als der
    // Name, um den es geht.
    hasSnackSlot: (meeting) =>
      meeting.snackResponsibles.length > 0
        ? `${namesOf(meeting.snackResponsibles.map((row) => row.person))} ${
            meeting.snackResponsibles.length === 1 ? 'bringt' : 'bringen'
          } an dem Abend dann nichts mehr mit.`
        : null,
    // Wie bei den Liedern immer: Die Anliegen liegen in einer eigenen Abfrage,
    // dieser Bildschirm sieht von hier aus nicht, ob welche da sind. Und was
    // hier verlorengeht, sind Sätze, die Menschen über sich selbst geschrieben
    // haben — dafür ist eine Rückfrage zu viel besser als eine zu wenig.
    hasPrayerSlot: () => 'Alle Gebetsanliegen dieses Abends werden gelöscht.',
    // Hier wird wirklich gelöscht, anders als beim Thema: die beiden Texte
    // gehören diesem einen Abend und warten nirgends als Entwurf.
    hasNotesSlot: (meeting) =>
      meeting.summaryText || meeting.actionstepText
        ? 'Zusammenfassung und Actionstep dieses Abends werden gelöscht, die Haken dazu auch.'
        : null,
  };

const AssignmentSheet = dynamic(() =>
  import('@/components/domain/assignment-sheet').then((m) => m.AssignmentSheet),
);

const VenueSheet = dynamic(() =>
  import('@/components/domain/venue-sheet').then((m) => m.VenueSheet),
);

const TopicChoiceSheet = dynamic(() =>
  import('./topic-choice-sheet').then((m) => m.TopicChoiceSheet),
);

const SnackSheet = dynamic(() =>
  import('@/components/domain/snack-sheet').then((m) => m.SnackSheet),
);

/** Der Host fehlt: er steckt im Ort-Sheet, weil er dieselbe Frage beantwortet. */
// Gastgeber hat sein eigenes Sheet (mit Wohnungen statt Personen); Gebetsbuddys
// und Geschenke teilt der Server zu und nicht ein Mensch an einem Abend. Und
// Snacks haben keine Rangliste — dort führt eine schlichte Auswahl hin.
type SheetRole = Exclude<
  AssignmentRole,
  'PRAYER_BUDDY' | 'HOST' | 'BIRTHDAY_GIFT' | 'SNACK'
>;

export function MeetingDetailScreen({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const meetingQuery = useMeeting(meetingId);
  const meeting = meetingQuery.data?.data;

  if (meetingQuery.isLoading) {
    return (
      <div className="space-y-4 px-5 pt-safe-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (meetingQuery.error || !meeting) {
    return (
      <div className="px-5 pt-safe-6">
        <ErrorState
          error={meetingQuery.error ?? new Error('Termin nicht gefunden')}
          onRetry={() => void meetingQuery.refetch()}
        />
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => router.push('/termine')}
        >
          Zurück zu den Terminen
        </Button>
      </div>
    );
  }

  return <Loaded meetingId={meetingId} meeting={meeting} />;
}

function Loaded({
  meetingId,
  meeting,
}: {
  meetingId: string;
  meeting: NonNullable<ReturnType<typeof useMeeting>['data']>['data'];
}) {
  const [sheet, setSheet] = useState<SheetRole | null>(null);
  /**
   * Eigener Zustand statt eines Werts in `sheet`: Die Snack-Auswahl ist ein
   * anderes Sheet mit anderen Eigenschaften. Sie in `SheetRole` mitzuführen
   * hieße, an jeder Stelle, die den Wert auspackt, eine Ausnahme zu schreiben.
   */
  const [choosingSnacks, setChoosingSnacks] = useState(false);
  const [choosingVenue, setChoosingVenue] = useState(false);
  const [choosingTopic, setChoosingTopic] = useState(false);

  /**
   * Ob das Formular für Titel, Uhrzeit und Infos offensteht.
   *
   * **Hier stand einmal ein Modus für die ganze Seite.** Ein Schalter ganz
   * unten schaltete überall Stifte an: am Titel, an der Uhrzeit, an den Infos,
   * an den Gebetsanliegen, an den Papierkörben der Lieder. Das kostete zwei
   * Dinge. Erstens war jede dieser Möglichkeiten hinter einem Ort versteckt,
   * den man erst kennen musste — die Bausteine sah gar nicht, wer nicht bis
   * zum Seitenende scrollte. Zweitens hieß derselbe Schalter an fünf Stellen
   * fünf verschiedene Dinge, von „dieses Feld ist beschreibbar" bis „hier darf
   * gelöscht werden".
   *
   * Übrig bleibt ein gewöhnliches Formular hinter einem gewöhnlichen Knopf.
   * Alles andere steht jetzt für sich: Die Bausteine tragen ihren eigenen
   * Aufklapper, das Löschen eines Liedes liegt hinter dem Wisch, mit dem man
   * überall in dieser App löscht, und die Textfelder haben ihren Stift ohnehin
   * selbst (`InlineEdit`).
   */
  const [editing, setEditing] = useState(false);

  /**
   * Ob die Nachbereitungs-Karte gerade offensteht, obwohl noch nichts
   * drinsteht.
   *
   * Der Hinweis „Nachbereitung hinzufügen" legt den Baustein an und öffnet die
   * Karte; bleibt sie leer, soll beim nächsten Aufmachen wieder der Hinweis
   * dastehen und keine leere Karte. Das hing vorher am Seitenmodus — wer ihn
   * verließ, bekam den Hinweis zurück. Ein eigener Merker sagt dasselbe, ohne
   * dafür einen Modus zu brauchen.
   */
  const [notesOpen, setNotesOpen] = useState(false);

  const update = useUpdateMeeting(meetingId);
  const songLeaders = useSongLeaders(meetingId);
  const roles = useRoleAssignment(meeting);
  const session = useTopicSessionActions(meetingId);
  const setSnacks = useSetSnackResponsibles(meetingId);
  const confirm = useConfirm();

  const cancelled = meeting.status === 'CANCELLED';
  /**
   * Drei Zustände und nicht zwei — siehe `meetingPhase`.
   *
   * `past` hieß bisher `isPast(meeting.date)`, also „der **erste** Tag ist
   * vorbei". Eine Freizeit von Freitag bis Sonntag stand damit ab Samstag als
   * „Vorbei" da, obwohl sie lief: Lieder waren plötzlich für alle abhakbar,
   * Rollen ließen sich nicht mehr freigeben, der Inhalt eines Themas stand
   * offen. Der Server rechnete längst mit dem ganzen Zeitraum.
   */
  const phase = meetingPhase(meeting);
  const past = phase === 'past';
  /**
   * Hat der Abend angefangen? Entscheidet, ob sich der Actionstep abhaken lässt.
   *
   * Tagesgenau reichte hier nicht: `isFuture` sagt am Termintag „nein, liegt
   * nicht in der Zukunft", und damit ließ sich der Vorsatz für den Abend um acht
   * Uhr morgens abhaken. Maßgeblich ist die Treffpunktzeit; der Server hält
   * dieselbe Grenze.
   */
  const started = hasStarted(meeting.date, meeting.startTime);

  /**
   * Ein abgesagter Abend ist kein Entwurf mehr. Vorher hing der Schreibschutz
   * allein an `past` — man konnte einem Termin, den es nicht mehr gibt, noch
   * Lieder und Rollen zuweisen.
   */
  const locked = past || cancelled;

  /**
   * Welche Rollen dieser Abend hat und wer sie trägt.
   *
   * Aus `meetingRoles` und nicht aus fünf `{slot && <RoleRow …>}` in der
   * Ausgabe: Dieselbe Aufstellung entscheidet in der Planungstabelle über
   * „fertig geplant". Stünde sie hier ein zweites Mal, könnte über einer Liste
   * mit vier Zeilen „3 von 5 besetzt" stehen.
   */
  const rollen = activeMeetingRoles(meeting);
  const besetzt = rollen.filter((slot) => slot.people.length > 0).length;

  const patch = (input: Parameters<typeof update.mutate>[0]) =>
    update.mutate(input);

  const selectedFor = (role: SheetRole): string[] => {
    if (role === 'TESTIMONY')
      return meeting.testimonyPersonId ? [meeting.testimonyPersonId] : [];
    if (role === 'TOPIC') return roles.topicPeople.map((p) => p.id);
    return (songLeaders.data ?? []).map((p) => p.id);
  };

  const submitFor = (role: SheetRole) => {
    if (role === 'TESTIMONY') return roles.assignTestimony;
    if (role === 'TOPIC') return assignTopic;
    return roles.assignSongLeaders;
  };

  /**
   * Rückfrage, bevor an einem vergangenen Abend etwas umgetragen wird. Das ist
   * fast immer ein Fehlgriff aus dem Archiv heraus — und in den seltenen
   * Fällen, in denen es keiner ist, kostet ein Klick nichts.
   */
  const nachtragenErlaubt = async (was: string) => {
    if (!past) return true;

    return confirm({
      title: 'Dieser Abend ist vorbei',
      body: `Möchtest du wirklich nachtragen, ${was}?`,
      confirmLabel: 'Nachtragen',
    });
  };

  const openSheet = async (role: SheetRole) => {
    const ok = await nachtragenErlaubt(
      `wer ${ROLE_LABEL[role].toLowerCase()} war`,
    );
    if (ok) setSheet(role);
  };

  const openVenue = async () => {
    const ok = await nachtragenErlaubt('wo ihr wart');
    if (ok) setChoosingVenue(true);
  };

  /**
   * Ein Eingang für fünf Zeilen — jede führt woandershin.
   *
   * Der Gastgeber ins Ort-Sheet, weil er *ist* der Ort; die Snacks in ihre
   * schlichte Auswahl, weil es dort nichts vorzuschlagen gibt; die übrigen drei
   * ins Zuteilungs-Sheet mit Rangfolge. Die Zeile selbst weiß davon nichts —
   * sie kennt nur ihre Rolle.
   */
  const openRole = (role: MeetingRole) => {
    if (role === 'HOST') return void openVenue();
    if (role === 'SNACK') return void setChoosingSnacks(true);

    return void openSheet(role);
  };

  /**
   * Rückfrage, bevor ein bereits gewähltes Thema ersetzt wird.
   *
   * Verloren geht nichts — die bisherige Einheit löst sich vom Abend und wartet
   * als Entwurf. Aber sie verschwindet von dieser Seite, und das darf niemanden
   * überraschen, der nur nachsehen wollte, was es sonst noch gäbe.
   */
  const openTopicChoice = async () => {
    const bisher = meeting.topicSession;

    if (bisher) {
      const ok = await confirm({
        title: 'Anderes Thema wählen?',
        body: `„${bisher.topic.title ?? 'Das bisherige Thema'}" löst sich von diesem Abend. Was daran vorbereitet ist, bleibt als Entwurf erhalten und lässt sich jederzeit wieder aufnehmen.`,
        confirmLabel: 'Weiter',
      });
      if (!ok) return;
    }

    setChoosingTopic(true);
  };

  const me = useMe();

  /**
   * Ob die eigene Person eine Auswahl treffen darf.
   *
   * Hier gilt die Hausregel **nicht**: kein Admin-Freifahrtschein, und „niemand
   * zugeteilt heißt jede:r darf" auch nicht. Die Wahl ist kein Verwaltungsakt,
   * sondern die Aussage „ich bereite das vor" — die kann niemand für einen
   * anderen treffen. Wer wählen will, trägt sich eine Zeile weiter oben als
   * zuständig ein. Der Server hält dieselbe Grenze.
   *
   * Was danach *in* der Einheit geändert werden darf, entscheidet sich nicht
   * mehr hier: Das steht auf ihrer eigenen Seite, und dort fragt der Server mit
   * `mayEdit` — ein Thema gehört seinen Leuten und nicht dem Abend.
   *
   * **`!cancelled` und nicht `!locked`:** Ein vergangener Abend lässt sich
   * nachtragen. Man hält ihn, kommt vor lauter Abend nicht zum Eintragen, und
   * holt es hinterher nach — ein Protokoll entsteht nun einmal danach. Ein
   * abgesagter Abend bleibt gesperrt: dort gibt es nichts zu protokollieren.
   */
  const mayChooseTopic =
    !cancelled &&
    Boolean(me.me) &&
    roles.topicPeople.some((person) => person.id === me.me?.id);

  /**
   * Der einzige Automatismus, der von dieser Zuteilung noch ausgeht.
   *
   * Hier standen einmal zwei ganz andere Sätze: Wer dazukam, setzte die
   * Themenwahl zurück — es sei denn, der Owner trug ihn selbst ein. Das ist
   * weggefallen, und mit ihm die Erklärungsnot. Zugeteilt zu sein heißt, an dem
   * Abend dafür einzustehen; es gibt kein Schreibrecht mehr, vor dem eine
   * fremde Vorbereitung geschützt werden müsste.
   *
   * Übrig bleibt die Kehrseite: Hängt am Abend etwas, das keiner der
   * Zuständigen anfassen darf, ist er in Wahrheit ungeplant — dann löst sich
   * die Einheit und wartet als Entwurf. Das steht als Hinweis **vor** der
   * Entscheidung, weil es beim Übernehmen ohne Nachfrage geschieht.
   *
   * Am **vergangenen** Abend ist es umgekehrt: Dort geschieht von allein gar
   * nichts, und die Rolle zu leeren heißt fast immer „der hatte gar kein
   * Thema". Danach wird also gefragt (`assignTopic`) — der Hinweis sagt hier
   * nur an, dass die Frage kommt.
   */
  const topicHint = past
    ? // Damit die Rückfrage niemanden überrumpelt: Sie kommt erst nach dem
      // Übernehmen, also steht hier schon an, dass sie kommt. Ohne „der Abend
      // ist vorbei" — das sagt der Picker eine Zeile weiter unten schon.
      'Lässt du niemanden stehen, fragen wir, ob der Abend gar kein Thema hatte. Dann fällt der Baustein weg und du kannst stattdessen eine Nachbereitung eintragen.'
    : meeting.topicSession
      ? 'Bleibt am Ende niemand zuständig, der diese Einheit vorbereitet, löst sie sich vom Abend — vorbereitet bleibt sie. Wer sie mit vorbereitet, steht auf ihrer eigenen Seite.'
      : undefined;

  /**
   * Die Thema-Rolle eintragen — mit einer Rückfrage für den vergangenen Abend.
   *
   * Sie dort zu **leeren** heißt fast immer „der hatte gar kein Thema"; sonst
   * stünde ein anderer Name darin. Rückwärts wird nicht geplant, sondern
   * protokolliert, und ein Abend ohne Thema braucht seine Nachbereitung — die
   * es aber nur gibt, solange der Baustein „Thema" aus ist.
   *
   * Gefragt wird **auch ohne gebundene Einheit**: Das Ziel ist dasselbe, und
   * eine leere Rolle unter einem eingeschalteten Baustein ist an einem Abend,
   * der vorbei ist, ein Zustand, den niemand gemeint haben kann.
   *
   * Ein einziger `PATCH` erledigt danach beides — das Abschalten löscht die
   * Zuteilung und löst die Einheit (`TopicLinkService.detach`). Ein `PUT` mit
   * leerer Liste davor wäre derselbe Vorgang ein zweites Mal.
   */
  const assignTopic = async (personIds: string[]) => {
    if (!past || personIds.length > 0) {
      roles.assignTopicResponsibles(personIds);
      return;
    }

    const bisher = meeting.topicSession;

    const ok = await confirm({
      title: 'Hatte der Abend gar kein Thema?',
      body: bisher
        ? `„${bisher.topic.title ?? bisher.title ?? 'Die bisherige Einheit'}" löst sich von diesem Abend und wartet als Entwurf — vorbereitet bleibt sie. Danach kannst du stattdessen eine Nachbereitung eintragen.`
        : 'Der Baustein „Thema" fällt weg. Danach kannst du stattdessen eine Nachbereitung eintragen.',
      confirmLabel: 'Thema wegnehmen',
    });

    // Abgelehnt heißt: gar nichts. Die Rolle bleibt, wie sie war — eine
    // geleerte Rolle unter einem weiter eingeschalteten Baustein wäre genau
    // der Zustand, den die Frage vermeiden soll.
    if (ok) patch({ hasTopicSlot: false });
  };

  /**
   * Ob die Nachbereitungs-Karte dasteht — und nicht bloß, ob der Baustein an
   * ist.
   *
   * Eine Karte, in der nichts steht, ist keine Nachbereitung, sondern ein
   * Formular mit zwei unerledigten Zeilen. Solange nichts geschrieben ist,
   * steht deshalb der Hinweis da — es sei denn, jemand hat ihn gerade gedrückt
   * (`notesOpen`): dann ist die Karte der Ort, an dem die beiden Stücke
   * überhaupt erst entstehen.
   */
  const notesContent = Boolean(meeting.summaryText || meeting.actionstepText);
  const showNotes = meeting.hasNotesSlot && (notesContent || notesOpen);

  /**
   * Ob der Hinweis „Nachbereitung hinzufügen" dasteht.
   *
   * Erst **ab Terminbeginn** — vorher gibt es nichts nachzubereiten, und der
   * Server lehnt das Anschalten dann auch ab. Nicht an einem Abend mit
   * **Thema**: dort trägt die Einheit Zusammenfassung und Actionstep, zwei
   * davon gibt es nicht. Und nicht an einem **abgesagten**: da war nichts.
   */
  const mayAddNotes =
    started && !cancelled && !meeting.hasTopicSlot && !showNotes;

  /**
   * Der Hinweis legt die Karte an und macht sie auf — er ist ja die
   * Aufforderung, etwas zu schreiben, und eine Karte, die erst beim ersten
   * gespeicherten Satz erschiene, gäbe es nicht, in den man ihn tippt. Den
   * Baustein schaltet er nur an, wenn er aus war: nach einer Karte, die leer
   * geblieben ist, steht er noch.
   */
  const addNotes = () => {
    if (!meeting.hasNotesSlot) patch({ hasNotesSlot: true });
    setNotesOpen(true);
  };

  /**
   * Die Nachbereitung ganz wegnehmen — danach steht wieder der Hinweis da, als
   * wäre nichts gewesen. Mit derselben Rückfrage wie beim Wegnehmen eines
   * Bausteins: gelöscht werden beide Texte und die Haken darunter.
   */
  const removeNotes = async () => {
    const loss = SLOT_LOSSES.hasNotesSlot(meeting);

    if (loss) {
      const ok = await confirm({
        title: 'Nachbereitung entfernen?',
        body: loss,
        confirmLabel: 'Entfernen',
        tone: 'danger',
      });
      if (!ok) return;
    }

    setNotesOpen(false);
    patch({ hasNotesSlot: false });
  };

  /**
   * Abhaken darf vor dem Abend, wer die Musik macht — danach jede:r. Nur an
   * einem **abgesagten** Abend gar niemand: dort gibt es nichts zu protokollieren.
   *
   * Streng wie beim Thema: kein Admin-Freifahrtschein, und ein Abend ohne
   * Musik-Zuteilung ist keiner, an dem alle bestimmen dürfen. Wer die Auswahl
   * treffen will, trägt sich eine Zeile weiter oben ein. Der Server hält
   * dieselbe Grenze.
   */
  const mayPickSongs =
    !cancelled &&
    (past ||
      (songLeaders.data ?? []).some((person) => person.id === me.me?.id));

  /**
   * Einen Baustein dazu- oder wegnehmen.
   *
   * Wegnehmen räumt auf dem Server auf — Thema, Lieder, Testimony fallen mit.
   * Das ist richtig so (ein Feld, das niemand mehr setzen kann und trotzdem
   * einen Wert trägt, ist eine Falle), aber es darf niemanden überraschen.
   * Deshalb die Rückfrage, und nur dann, wenn wirklich etwas verlorengeht: bei
   * einem leeren Baustein wäre sie eine Frage ohne Inhalt.
   *
   * `applySlotToggle` kann **mehrere** Schalter zurückgeben: Thema schließt
   * Testimony und Nachbereitung aus, und wer eines davon anhakt, meint damit
   * ersichtlich „statt des anderen". Deshalb gehen auch deren Verluste in die
   * Rückfrage ein — und die Überschrift nennt, was wirklich weicht, statt eine
   * Paarung zu raten.
   */
  const toggleSlot = async (key: MeetingSlotKey, value: boolean) => {
    const next = applySlotToggle(meeting, key, value);

    // Über **alle vier** Schlüssel, nicht über die sichtbaren Schalter: die
    // Nachbereitung ist keiner mehr, fällt beim Anhaken des Themas aber mit —
    // und genau das muss die Rückfrage sagen.
    const abgeschaltet = MEETING_SLOT_KEYS.filter(
      (slot) => meeting[slot] && !next[slot],
    );

    const losses = abgeschaltet
      .map((slot) => SLOT_LOSSES[slot](meeting))
      .filter((loss): loss is string => loss !== null);

    if (losses.length > 0) {
      const statt = abgeschaltet.map((slot) => SLOT_LABEL[slot]).join(' und ');

      const ok = await confirm({
        title: value
          ? `${SLOT_LABEL[key]} statt ${statt}?`
          : `${SLOT_LABEL[key]} wegnehmen?`,
        body: losses.join(' '),
        confirmLabel: value ? 'Umstellen' : 'Wegnehmen',
        tone: 'danger',
      });
      if (!ok) return;
    }

    patch(next);
  };

  return (
    <div className="space-y-6 px-5 pt-safe-4 pb-10">
      <div className="flex items-center justify-between gap-2">
        <Link href="/termine">
          <IconButton label="Zurück">
            <ArrowLeft size={18} />
          </IconButton>
        </Link>
        <div className="flex items-center gap-2">
          {past && <Badge>Vorbei</Badge>}
          {/* Grün wie überall, wo etwas gerade gilt. Ein kommender Abend trägt
              weiterhin kein Abzeichen — dass er noch kommt, steht schon im
              Datum darüber. */}
          {phase === 'running' && <Badge variant="success">Läuft</Badge>}
          {cancelled && <Badge variant="alert">Abgesagt</Badge>}

          {/* **Oben, wo man ankommt** — und nicht mehr als Schalter am
              Seitenende. Er meint Titel, Uhrzeit und Infos zusammen: drei
              Angaben derselben Sache, hinter einem Knopf und einem Formular. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} /> Bearbeiten
          </Button>
        </div>
      </div>

      {(roles.conflict || update.conflict) && (
        <ConflictBanner
          onResolve={async () => {
            // Zwei Schreibwege auf denselben Abend, und man weiß nicht, welcher
            // sich beschwert hat — also beide auffrischen.
            await Promise.all([
              roles.resolveConflict(),
              update.resolveConflict(),
            ]);
          }}
        />
      )}

      <header>
        <p className="text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
          {formatWeekday(meeting.date)} · {formatRelativeDay(meeting.date)}
        </p>
        <h1 className="mt-1 font-serif text-3xl leading-tight font-bold text-stone-900">
          {meetingHeadline(meeting)}
        </h1>

        {/* **Datum und Uhrzeit als zwei Kästchen, direkt unter dem Titel.** Die
            Uhrzeit hatte vorher eine eigene Sektion mitten in der Seite, mit
            Überschrift, Karte und Stift — für eine Angabe aus fünf Zeichen, die
            zur ersten Frage an einen Termin gehört: „wann". Sie steht jetzt
            dort, wo man sie sucht, und geändert wird sie im Formular oben. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-[13px] font-semibold text-stone-700">
            <CalendarDays size={15} className="shrink-0 text-terracotta-500" />
            {/* Bei einem Zeitraum ist das volle Datum die falsche Auskunft: was
                man wissen will, ist von wann bis wann. */}
            {meeting.endDate
              ? formatDayRange(meeting.date, meeting.endDate)
              : formatDayFull(meeting.date)}
          </span>
          <span className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-[13px] font-semibold text-stone-700">
            <Clock size={15} className="shrink-0 text-terracotta-500" />
            {meeting.startTime} Uhr
          </span>
        </div>

        {/* Die Infos gehören hierher und nicht in eine eigene Sektion weiter
            unten: Es ist das, was man **vor** dem Abend wissen muss — „bringt
            eure Bibeln mit", „wir fangen später an". Steht nichts drin, steht
            hier auch nichts: Eine Karte mit „Nichts Besonderes zu beachten" ist
            eine Zeile, die nichts sagt. */}
        {meeting.infoText && (
          <div className="mt-4 flex gap-3 rounded-lg border border-line border-l-[3px] border-l-terracotta-500 bg-canvas p-3">
            <Info size={16} className="mt-0.5 shrink-0 text-terracotta-500" />
            <p className="text-sm leading-relaxed whitespace-pre-line text-stone-700">
              {meeting.infoText}
            </p>
          </div>
        )}
      </header>

      {/* Direkt unter dem Kopf und außerhalb des gedämpften Teils: das ist die
          Nachricht der Seite, nicht eine Randnotiz. */}
      {cancelled && <CancelledNotice meeting={meeting} />}

      {/* Gedämpft, aber nicht versteckt: was an dem Abend geplant war, bleibt
          lesbar — es ist bloß nichts mehr, worauf man hinarbeitet. */}
      <div className={cn('space-y-6', cancelled && 'opacity-55')}>
        {/* **Ganz oben**, und nicht mehr am Ende der Seite. Ab Terminbeginn ist
            das die Hauptsache dieses Bildschirms: Wer gerade vom Abend
            heimkommt, soll die Frage sehen, ohne an Uhrzeit, Ort, Rollen,
            Liedern und Anwesenheit vorbeizuscrollen.

            Die **Karte** bleibt unten, wo sie war. Sobald etwas drinsteht, ist
            es Inhalt und gehört zum Nachklang des Abends — hier steht nur die
            Frage. Beides zugleich gibt es nie: `showNotes` und `mayAddNotes`
            schließen einander aus.

            Ein Klick genügt: eine Zusammenfassung schreibt man in dem Moment,
            in dem man vom Abend kommt, und nicht nachdem man erst einen
            Schalter gefunden hat. */}
        {mayAddNotes && (
          <NotesPrompt saving={update.isPending} onAdd={addNotes} />
        )}

        {/* **Zwei Sektionen, nicht eine.** Der Ort stand bisher als namenloser
            Block über den Rollen, in derselben Karte — dabei beantwortet er eine
            andere Frage: „wo treffen wir uns" gegen „wer macht was". Und die
            Adresse, die in der Antwort längst mitkommt, stand auf dieser Seite
            überhaupt nirgends. */}
        <section>
          <SectionTitle>Ort & Anreise</SectionTitle>
          <Card className="flex items-center gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-terracotta-100 bg-terracotta-50 text-terracotta-600">
              <MapPin size={20} />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-lg font-bold text-stone-800">
                {meeting.location?.name ?? 'Noch offen'}
              </p>
              {/* Der Satz darunter ist die Adresse, wenn es eine gibt. Vorher
                  stand hier „Ergibt sich aus dem Gastgeber." — eine Erklärung
                  der Mechanik statt einer Auskunft — und „Öffentlicher
                  Treffpunkt" auch dann, wenn schlicht noch kein Ort feststand. */}
              <p className="mt-0.5 truncate text-sm text-stone-500">
                {meeting.location?.address ??
                  (meeting.location
                    ? 'Keine Adresse hinterlegt'
                    : 'Trag oben einen Gastgeber oder Treffpunkt ein')}
              </p>
            </div>

            {/* Ohne Ort steht hier **kein** Knopf. Er war vorher ein
                deaktivierter Anker in `bg-gray-300` — den einzigen
                Nicht-Token-Farben dieser Seite, die im Dunkelmodus falsch
                aussehen. Ein toter Knopf ist kein Hinweis. */}
            {meeting.location && (
              <a
                href={mapsUrl(meeting.location)}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full bg-terracotta-600 px-4 py-2 text-sm font-semibold text-white transition-colors',
                  'hover:bg-terracotta-700 focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
                  PRESSABLE,
                )}
              >
                <Navigation size={15} />
                Maps
                <ExternalLink size={13} />
              </a>
            )}
          </Card>
        </section>

        {/* Eine Zeile je Rolle, die es an **diesem** Abend gibt — dieselbe
            Aufstellung, nach der auch die Planungstabelle „fertig geplant"
            entscheidet (`meetingRoles`). Ein Baustein, der aus ist, steht gar
            nicht da; der Gastgeber steht immer, denn man trifft sich immer
            irgendwo. */}
        <section>
          <SectionTitle
            action={
              <span className="text-[11px] font-semibold text-stone-400 normal-case">
                {besetzt} von {rollen.length} besetzt
              </span>
            }
          >
            Zuständigkeiten
          </SectionTitle>

          <div className="space-y-2">
            {rollen.map((slot) => (
              <RoleRow
                key={slot.role}
                role={slot.role}
                people={slot.people}
                emptyLabel={
                  slot.role === 'HOST' && !meeting.locationId
                    ? 'Host oder Treffpunkt fehlt'
                    : 'Noch niemand'
                }
                onEdit={cancelled ? undefined : () => openRole(slot.role)}
              />
            ))}
          </div>
        </section>

        {meeting.hasSongSlot && (
          <SongsCard
            meetingId={meetingId}
            readOnly={locked}
            mayPick={mayPickSongs}
          />
        )}

        {/* Thema samt Nachbereitung. Ohne den Baustein gar nicht: was an einem
            Abend besprochen wurde, ist die Zusammenfassung eines Themas.
            Wer den Inhalt sehen darf, entscheidet der Server — vor 18 Uhr am
            Termintag gehört er denen, die ihn vorbereiten. Der Actionstep der
            nächsten Woche eine Woche zu früh für alle wäre genau das Gegenteil
            von dem, wozu er da ist. */}
        {meeting.hasTopicSlot && (
          <TopicCard
            meeting={meeting}
            responsibles={roles.topicPeople}
            mayChoose={mayChooseTopic}
            saving={update.isPending || roles.saving || session.saving}
            onChoose={openTopicChoice}
          >
            {/* Abhaken darf jede:r für sich, auch wer den Text nicht ändern
                darf — es ist der eigene Vorsatz. Erst ab Abendbeginn: einen
                Vorsatz für heute Abend hakt man heute früh nicht ab. */}
            {started && (
              <ActionstepCheck
                meetingId={meeting.id}
                done={meeting.actionstepDone}
              />
            )}
          </TopicCard>
        )}

        {/* Direkt hinter dem Thema: Die Anliegen entstehen am Abend selbst
            und gehören zu seinem Inhalt. Die Anwesenheitsliste steht danach —
            sie beantwortet, wer da war, und das schlägt man nach, statt es
            zwischen Thema und Anliegen zu lesen. */}
        {meeting.hasPrayerSlot && (
          <PrayerRequestsCard meetingId={meetingId} locked={locked} />
        )}

        <AttendanceCard meeting={meeting} readOnly={locked} />

        {/* Unten am Bildschirm statt hier in der Seite — und nur, solange es
            etwas zu antworten gibt. An einem vergangenen oder abgesagten Abend
            steht dort die Tab-Leiste wie überall sonst: Die Navigation
            aufzugeben lohnt nur, wo etwas Nützlicheres an ihrer Stelle steht. */}
        {!locked && <AnswerBar meeting={meeting} />}

        {/* Dieselben zwei Felder ohne Thema, jedes einzeln und optional. Beide
            Bausteine schließen einander aus, es steht also nie beides da. */}
        {showNotes && (
          <NotesCard
            meeting={meeting}
            editable={!cancelled}
            started={started}
            saving={update.isPending}
            onSummary={(next) => patch({ summaryText: next })}
            onActionstep={(next) => patch({ actionstepText: next })}
            onRemove={cancelled ? undefined : removeNotes}
          />
        )}

        {/* Ganz unten, weil man das einmal beim Anlegen entscheidet und danach
            selten. Aber erreichbar, denn „ach, Lieder hätten wir doch gern"
            fällt einem erst auf der Terminseite ein.

            **Auch an einem vergangenen Abend**, und nur ein abgesagter bleibt
            gesperrt. Der Server konnte es längst (`assertNotesSlotNotAhead`
            sperrt allein die Richtung nach vorn); was fehlte, war der Weg
            dorthin. Wem hinterher auffällt, dass am Dienstag doch Lieder
            waren, kam bisher nicht mehr heran. An einem **abgesagten** Abend
            gibt es dagegen nichts umzubauen. */}
        {!cancelled && (
          <SlotCard
            slots={meeting}
            disabled={update.isPending}
            onToggle={toggleSlot}
          />
        )}
      </div>

      {!cancelled && <CancelMeetingBlock meeting={meeting} past={past} />}

      <DeleteMeetingBlock meeting={meeting} />

      <MeetingEditSheet
        open={editing}
        meeting={meeting}
        placeholder={meetingKindLabel(meeting)}
        saving={update.isPending}
        onSave={patch}
        onClose={() => setEditing(false)}
      />

      {sheet && (
        <AssignmentSheet
          open
          onClose={() => setSheet(null)}
          kind={sheet}
          meetingId={meetingId}
          selectedIds={selectedFor(sheet)}
          multiple={sheet !== 'TESTIMONY'}
          withoutSuggestions={past}
          hint={sheet === 'TOPIC' ? topicHint : undefined}
          onSubmit={submitFor(sheet)}
          saving={roles.saving}
        />
      )}

      {choosingSnacks && (
        <SnackSheet
          open
          onClose={() => setChoosingSnacks(false)}
          selectedIds={meeting.snackResponsibles.map((row) => row.person.id)}
          attendances={meeting.attendances}
          onSubmit={setSnacks.mutate}
          saving={setSnacks.isPending}
        />
      )}

      {choosingVenue && (
        <VenueSheet
          open
          onClose={() => setChoosingVenue(false)}
          meetingId={meetingId}
          hostPersonId={meeting.hostPersonId}
          locationId={meeting.locationId}
          withoutSuggestions={past}
          onSubmit={roles.assignVenue}
        />
      )}

      {choosingTopic && (
        <TopicChoiceSheet
          open
          meetingId={meeting.id}
          responsibles={roles.topicPeople}
          hasSession={Boolean(meeting.topicSession)}
          past={past}
          onUnlink={session.unlink}
          onClose={() => setChoosingTopic(false)}
        />
      )}
    </div>
  );
}

/**
 * Eine Rolle als eigene Fläche: oben Symbol, Name und der Knopf zum Eintragen,
 * darunter die Menschen.
 *
 * **Zwei Zeilen und nicht eine.** Vorher stand alles nebeneinander: Symbol,
 * eine 4,5rem breite Spalte für die Bezeichnung, die Namen, der Knopf. Auf dem
 * Telefon blieben für die Namen rund 130 Pixel — ein einziger passte hinein,
 * der zweite rutschte darunter, der dritte machte die Zeile dreistöckig. Dabei
 * sind gerade die Rollen mit mehreren die häufigen: Musik, Thema, Snacks.
 * Unten über die volle Breite stehen zwei bequem, meistens drei.
 *
 * Davor standen die Rollen einmal als Chips nebeneinander. Die sahen nach
 * Anzeige aus, nicht nach „hier trägst du ein"; deshalb ist der Knopf oben
 * rechts geblieben und nicht die ganze Fläche antippbar geworden — er sagt, wo
 * man drückt.
 */
function RoleRow({
  role,
  people,
  emptyLabel,
  onEdit,
}: {
  role: MeetingRole;
  people: PersonRef[];
  emptyLabel: string;
  /** Fehlt an einem abgesagten Abend: dort gibt es nichts mehr einzuteilen. */
  onEdit?: () => void;
}) {
  const Icon = ROLE_ICON[role];
  const label = ROLE_LABEL[role];

  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-terracotta-600">
          <Icon size={15} />
        </span>

        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-stone-700">
          {label}
        </span>

        {onEdit && (
          <IconButton label={`${label} eintragen`} onClick={onEdit}>
            <UserPen size={16} />
          </IconButton>
        )}
      </div>

      {/* Eingerückt auf die Höhe der Bezeichnung — Symbol (2rem) plus Abstand
          (0,75rem) —, damit die Namen unter ihr beginnen und nicht unter dem
          Symbol. Ohne den Knopf daneben bleibt hier die ganze Kartenbreite. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-11">
        {people.length === 0 ? (
          <span className="text-sm text-stone-400 italic">{emptyLabel}</span>
        ) : (
          people.map((person) => (
            <span
              key={person.id}
              title={person.name}
              className="flex max-w-full items-center gap-1.5 rounded-full bg-canvas py-0.5 pr-2.5 pl-0.5"
            >
              <Avatar person={person} size="xs" />
              {/* Gekürzt wie in den Chips der Terminkarte (`shortName`): Bei
                  drei Leuten für die Musik passen so alle in eine Zeile. */}
              <span className="truncate text-[13px] font-bold text-stone-800">
                {shortName(person.name)}
              </span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
