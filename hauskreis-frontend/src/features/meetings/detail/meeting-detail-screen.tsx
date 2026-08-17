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
  Check,
  Clock,
  UserPen,
  ExternalLink,
  MapPin,
  Pencil,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { InlineEdit, TextInput } from '@/components/ui/field';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { cn } from '@/lib/cn';
import {
  useMe,
  useMeeting,
  useSongLeaders,
  useUpdateMeeting,
} from '@/lib/api/hooks';
import {
  formatDayFull,
  formatDayRange,
  formatRelativeDay,
  formatWeekday,
  hasStarted,
  isPast,
} from '@/lib/date';
import {
  MEETING_SLOT_KEYS,
  MEETING_TYPE_LABEL,
  ROLE_LABEL,
  SLOT_LABEL,
  applySlotToggle,
  mapsUrl,
  meetingHeadline,
} from '@/lib/meeting';
import { ActionstepCheck } from '@/components/domain/actionstep-check';
import { SlotCard } from '@/components/domain/slot-toggles';
import type { MeetingSlotKey } from '@/lib/meeting';
import type { AssignmentRole, Meeting, PersonRef } from '@/lib/api/types';
import { AttendanceCard } from './attendance-card';
import {
  CancelledNotice,
  CancelMeetingBlock,
  DeleteMeetingBlock,
} from './cancellation-card';
import { NotesCard, NotesPrompt } from './notes-card';
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

/** Der Host fehlt: er steckt im Ort-Sheet, weil er dieselbe Frage beantwortet. */
type SheetRole = Exclude<AssignmentRole, 'PRAYER_BUDDY' | 'HOST'>;

export function MeetingDetailScreen({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const meetingQuery = useMeeting(meetingId);
  const meeting = meetingQuery.data?.data;

  if (meetingQuery.isLoading) {
    return (
      <div className="space-y-4 px-5 pt-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (meetingQuery.error || !meeting) {
    return (
      <div className="px-5 pt-6">
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
  const [choosingVenue, setChoosingVenue] = useState(false);
  const [choosingTopic, setChoosingTopic] = useState(false);

  /**
   * Der Lesemodus ist der Normalfall — für die **Texte**.
   *
   * Vorher bot jedes Feld dauerhaft einen Stift an, auch beim bloßen
   * Nachschauen — auf einer Seite, die man zehnmal öffnet, um etwas zu wissen,
   * und einmal, um etwas zu ändern. Es gibt bewusst **kein** „Speichern": jede
   * Änderung geht sofort raus, der Schalter entscheidet nur, ob man sie
   * überhaupt angeboten bekommt.
   *
   * Was der Schalter **nicht** deckt: die Rollen-Zuteilung. Sie ist der Grund,
   * aus dem man diese Seite überhaupt aufmacht — „wer hostet nächste Woche"
   * trägt man im Vorbeigehen ein, nicht nach dem Umlegen eines Schalters. Sie
   * hängt an einem Sheet, kann also nicht versehentlich passieren, und sie
   * bleibt wie Anwesenheit und Actionstep-Haken immer erreichbar. Gesperrt ist
   * sie nur an einem abgesagten Abend, an dem es nichts einzuteilen gibt.
   */
  const [editing, setEditing] = useState(false);

  const update = useUpdateMeeting(meetingId);
  const songLeaders = useSongLeaders(meetingId);
  const roles = useRoleAssignment(meeting);
  const session = useTopicSessionActions(meeting);
  const confirm = useConfirm();

  const cancelled = meeting.status === 'CANCELLED';
  const past = isPast(meeting.date);
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
    if (role === 'TOPIC') return roles.assignTopicResponsibles;
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
   * Was danach am *Thema* geändert werden darf, sagt der Server über `mayEdit`:
   * ein Thema gehört seinen Leuten und nicht dem Abend.
   */
  const mayChooseTopic =
    !locked &&
    Boolean(me.me) &&
    roles.topicPeople.some((person) => person.id === me.me?.id);

  const mayEditTopic = meeting.topicSession?.mayEdit ?? false;

  /**
   * Ob die Nachbereitungs-Karte dasteht — und nicht bloß, ob der Baustein an
   * ist.
   *
   * Eine Karte, in der nichts steht, ist keine Nachbereitung, sondern ein
   * Formular mit zwei unerledigten Zeilen. Solange nichts geschrieben ist, steht
   * deshalb der Hinweis da; im **Bearbeitungsmodus** dagegen die Karte, denn
   * dort legt man die beiden Stücke überhaupt erst an.
   */
  const notesContent = Boolean(meeting.summaryText || meeting.actionstepText);
  const showNotes = meeting.hasNotesSlot && (notesContent || editing);

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
   * Der Hinweis führt in den Bearbeitungsmodus — er ist ja die Aufforderung,
   * etwas zu schreiben, und die Karte erschiene sonst leer und wieder ohne
   * Eingabemöglichkeit. Den Baustein schaltet er nur an, wenn er aus war: nach
   * einer Karte, die leer geblieben ist, steht er noch.
   */
  const addNotes = () => {
    if (!meeting.hasNotesSlot) patch({ hasNotesSlot: true });
    setEditing(true);
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
    <div className="space-y-6 px-5 pt-4 pb-10">
      <div className="flex items-center justify-between">
        <Link href="/termine">
          <IconButton label="Zurück">
            <ArrowLeft size={18} />
          </IconButton>
        </Link>
        <div className="flex gap-2">
          {past && <Badge>Vorbei</Badge>}
          {cancelled && <Badge variant="alert">Abgesagt</Badge>}
        </div>
      </div>

      {(roles.conflict || update.conflict) && (
        <ConflictBanner
          onReload={() => window.location.reload()}
          onDismiss={() => {
            roles.dismissConflict();
            update.dismissConflict();
          }}
        />
      )}

      <header>
        <p className="text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
          {formatWeekday(meeting.date)} · {formatRelativeDay(meeting.date)}
        </p>
        <HeadlineEdit
          headline={meetingHeadline(meeting)}
          title={meeting.title}
          placeholder={MEETING_TYPE_LABEL[meeting.type]}
          saving={update.isPending}
          onSave={editing ? (next) => patch({ title: next }) : undefined}
        />
        <p className="mt-1 text-sm text-stone-400">
          {/* Bei einem Zeitraum ist das volle Datum die falsche Auskunft: was
              man wissen will, ist von wann bis wann. */}
          {meeting.endDate
            ? formatDayRange(meeting.date, meeting.endDate)
            : formatDayFull(meeting.date)}{' '}
          · {MEETING_TYPE_LABEL[meeting.type]}
        </p>
      </header>

      {/* Direkt unter dem Kopf und außerhalb des gedämpften Teils: das ist die
          Nachricht der Seite, nicht eine Randnotiz. */}
      {cancelled && <CancelledNotice meeting={meeting} />}

      {/* Gedämpft, aber nicht versteckt: was an dem Abend geplant war, bleibt
          lesbar — es ist bloß nichts mehr, worauf man hinarbeitet. */}
      <div className={cn('space-y-6', cancelled && 'opacity-55')}>
        {/* Die erste Frage an einen Termin ist „wann". Sie stand bisher nur im
            Datum, und eine Uhrzeit gab es gar nicht — „wir fangen heute später
            an" lief über WhatsApp. */}
        <section>
          <SectionTitle>Uhrzeit</SectionTitle>
          <Card>
            <TimeRow
              startTime={meeting.startTime}
              saving={update.isPending}
              onSave={
                editing ? (next) => patch({ startTime: next }) : undefined
              }
            />
          </Card>
        </section>

        {/* Ganz oben, weil hier steht, was man vor dem Abend wissen muss —
          „bringt Kuchen mit", „wir fangen später an". Unten zwischen
          Zusammenfassung und Actionstep las es niemand rechtzeitig. */}
        <section>
          <SectionTitle>Infos</SectionTitle>
          <Card>
            <InlineEdit
              label="Infos"
              multiline
              value={meeting.infoText}
              emptyLabel="Nichts Besonderes zu beachten"
              saving={update.isPending}
              onSave={editing ? (next) => patch({ infoText: next }) : undefined}
            />
          </Card>
        </section>

        {/* Ort und Gastgeber stehen an jedem Termin: man trifft sich immer
            irgendwo, auch an einem Geburtstag. Dass niemand eingetragen ist,
            ist ein gültiger Zustand — das Treffen im Schlosspark. */}
        <section>
          <SectionTitle>Zuständigkeiten</SectionTitle>
          <Card className="divide-y divide-line">
            <div className="w-full pb-4">
              {/* Titel */}
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-400">
                Ort & Gastgeber
              </p>

              <div className="flex w-full items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col">
                  <div className="flex items-center gap-1.5 text-lg font-bold text-stone-800">
                    <MapPin
                      size={20}
                      className="shrink-0 text-terracotta-600"
                      fill="currentColor"
                    />
                    <span className="truncate font-serif">
                      {meeting.location?.name ?? 'Noch offen'}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-stone-500">
                    {meeting.host
                      ? 'Ergibt sich aus dem Gastgeber.'
                      : 'Öffentlicher Treffpunkt'}
                  </p>
                </div>

                <a
                  href={
                    meeting?.location ? mapsUrl(meeting.location) : undefined
                  }
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!meeting?.location}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    meeting?.location
                      ? 'bg-terracotta-600 text-white hover:bg-terracotta-700'
                      : 'pointer-events-none cursor-not-allowed bg-gray-300 text-gray-500'
                  }`}
                >
                  <MapPin size={16} />
                  In Maps öffnen
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>

            <RoleRow
              label={ROLE_LABEL.HOST}
              people={meeting.host ? [meeting.host] : []}
              emptyLabel={
                meeting.locationId && !meeting.host
                  ? 'Kein Host nötig'
                  : !meeting.host && !meeting.locationId
                    ? 'Host/Treffpunkt notwendig'
                    : ''
              }
              onEdit={cancelled ? undefined : openVenue}
              EditIcon={UserPen}
              editIconSize={16}
            />

            {meeting.hasTopicSlot && (
              <RoleRow
                label={ROLE_LABEL.TOPIC}
                people={roles.topicPeople}
                emptyLabel="Noch niemand"
                onEdit={cancelled ? undefined : () => openSheet('TOPIC')}
                EditIcon={UserPen}
                editIconSize={16}
              />
            )}

            {meeting.hasTestimonySlot && (
              <RoleRow
                label={ROLE_LABEL.TESTIMONY}
                people={
                  meeting.testimonyPerson ? [meeting.testimonyPerson] : []
                }
                emptyLabel="Noch niemand "
                onEdit={cancelled ? undefined : () => openSheet('TESTIMONY')}
                EditIcon={UserPen}
                editIconSize={16}
              />
            )}

            {meeting.hasSongSlot && (
              <RoleRow
                label={ROLE_LABEL.SONG}
                people={songLeaders.data ?? []}
                emptyLabel="Noch niemand"
                onEdit={cancelled ? undefined : () => openSheet('SONG')}
                EditIcon={UserPen}
                editIconSize={16}
              />
            )}
          </Card>
        </section>

        {meeting.hasSongSlot && (
          <SongsCard
            meetingId={meetingId}
            readOnly={locked}
            mayPick={mayPickSongs}
          />
        )}

        <AttendanceCard meeting={meeting} readOnly={locked} />

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
            editable={editing && mayEditTopic}
            mayChoose={mayChooseTopic}
            saving={update.isPending || roles.saving || session.saving}
            onChoose={openTopicChoice}
            onTitle={(next) => session.patch({ title: next })}
            onSummary={(next) => session.patch({ summaryText: next })}
            onActionstep={(next) => session.patch({ actionstepText: next })}
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

        {/* Dieselben zwei Felder ohne Thema, jedes einzeln und optional. Beide
            Bausteine schließen einander aus, es steht also nie beides da. */}
        {showNotes && (
          <NotesCard
            meeting={meeting}
            editable={editing}
            started={started}
            saving={update.isPending}
            onSummary={(next) => patch({ summaryText: next })}
            onActionstep={(next) => patch({ actionstepText: next })}
            onRemove={editing ? removeNotes : undefined}
          />
        )}

        {/* Und der Weg dorthin. Er steht auch **außerhalb** des
            Bearbeitungsmodus: eine Zusammenfassung schreibt man in dem Moment,
            in dem man vom Abend kommt, nicht nachdem man einen Schalter gefunden
            hat — der Knopf legt ihn deshalb gleich mit um. */}
        {mayAddNotes && (
          <NotesPrompt saving={update.isPending} onAdd={addNotes} />
        )}

        {/* Ganz unten, weil man das einmal beim Anlegen entscheidet und danach
            selten. Aber erreichbar, denn „ach, Lieder hätten wir doch gern"
            fällt einem erst auf der Terminseite ein. */}
        {!locked && editing && (
          <SlotCard
            slots={meeting}
            disabled={update.isPending}
            onToggle={toggleSlot}
          />
        )}
      </div>

      {/* Der Schalter, nicht ein Speichern-Knopf: geschrieben wird sofort, hier
          wird nur entschieden, ob überhaupt etwas angeboten wird. Er deckt die
          Texte und die Bausteine — die Rollen-Zuteilung braucht ihn nicht, die
          steht immer offen. Absagen und Löschen stehen bewusst dahinter und
          dauerhaft da: sie sind keine Bearbeitung, sondern eine Entscheidung
          über den Abend als Ganzes. */}
      <Button
        variant={editing ? 'primary' : 'secondary'}
        className="w-full"
        onClick={() => setEditing((current) => !current)}
      >
        {editing ? (
          <>
            <Check size={16} /> Fertig
          </>
        ) : (
          <>
            <Pencil size={14} /> Bearbeiten
          </>
        )}
      </Button>

      {!cancelled && <CancelMeetingBlock meeting={meeting} past={past} />}

      <DeleteMeetingBlock meeting={meeting} />

      {sheet && (
        <AssignmentSheet
          open
          onClose={() => setSheet(null)}
          kind={sheet}
          meetingId={meetingId}
          selectedIds={selectedFor(sheet)}
          multiple={sheet !== 'TESTIMONY'}
          withoutSuggestions={past}
          onSubmit={submitFor(sheet)}
          saving={roles.saving}
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
          onUnlink={session.unlink}
          onClose={() => setChoosingTopic(false)}
        />
      )}
    </div>
  );
}

/**
 * Der Titel sitzt am Überschriftstext, nicht in einem eigenen Feld weiter
 * unten — dort war er ein Formularfeld unter vielen, obwohl er das Erste ist,
 * was man liest.
 *
 * Was angezeigt wird, ist die fertige Überschrift (eigener Titel, sonst das
 * Thema, sonst die Terminart). Bearbeitet wird aber nur `meeting.title`: würde
 * der Entwurf mit der Überschrift starten, machte das erste Speichern aus dem
 * geerbten Themen-Titel einen eigenen — und der Termin löste sich still vom
 * Thema ab.
 */
function HeadlineEdit({
  headline,
  title,
  placeholder,
  saving,
  onSave,
}: {
  headline: string;
  title: string | null;
  placeholder: string;
  saving: boolean;
  /** Fehlt sie, ist die Überschrift nur Anzeige — wie bei `InlineEdit`. */
  onSave?: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title ?? '');

  const commit = () => {
    const trimmed = draft.trim();
    setEditing(false);
    const next = trimmed === '' ? null : trimmed;
    if (next !== title) onSave?.(next);
  };

  if (editing) {
    return (
      <div className="mt-1 space-y-2">
        {/* Kein autoFocus: auf dem Telefon schöbe die Tastatur die Überschrift
            aus dem Bild, die man gerade bearbeitet. */}
        <TextInput
          value={draft}
          placeholder={placeholder}
          aria-label="Titel des Termins"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') {
              setDraft(title ?? '');
              setEditing(false);
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(title ?? '');
              setEditing(false);
            }}
          >
            Abbrechen
          </Button>
          <Button size="sm" loading={saving} onClick={commit}>
            Übernehmen
          </Button>
        </div>
        <p className="text-[11px] text-stone-400">
          Leer lassen: dann steht dort das Thema, sonst die Art des Termins.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-start gap-2">
      <h1 className="font-serif text-3xl leading-tight font-bold text-stone-900">
        {headline}
      </h1>
      {onSave && (
        <IconButton
          label="Titel bearbeiten"
          onClick={() => {
            setDraft(title ?? '');
            setEditing(true);
          }}
          disabled={saving}
          className="mt-1 shrink-0"
        >
          <Pencil size={15} />
        </IconButton>
      )}
    </div>
  );
}

/**
 * Wann es losgeht — lesen immer, ändern im Bearbeitungsmodus.
 *
 * Ein eigener Zustand für das Eingabefeld und nicht direkt `patch` bei jedem
 * Tastendruck: `<input type="time">` liefert zwischendurch leere und halbe
 * Werte, während man tippt, und jede davon wäre ein Schreibvorgang samt
 * Benachrichtigung an die Gruppe.
 */
function TimeRow({
  startTime,
  saving,
  onSave,
}: {
  startTime: string;
  saving: boolean;
  /** Fehlt außerhalb des Bearbeitungsmodus. */
  onSave?: (next: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <div className="flex items-center gap-3">
        <Clock size={18} className="shrink-0 text-terracotta-600" />
        <span className="flex-1 font-serif text-lg font-bold text-stone-800">
          {startTime} Uhr
        </span>
        {onSave && (
          <IconButton
            label="Uhrzeit ändern"
            onClick={() => setDraft(startTime)}
            disabled={saving}
          >
            <Pencil size={15} />
          </IconButton>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <TextInput
        type="time"
        value={draft}
        aria-label="Uhrzeit des Termins"
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
          Abbrechen
        </Button>
        <Button
          size="sm"
          loading={saving}
          // Ein leeres Feld hieße „keine Uhrzeit", und die gibt es nicht.
          disabled={draft === ''}
          onClick={() => {
            if (draft !== startTime) onSave?.(draft);
            setDraft(null);
          }}
        >
          Übernehmen
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-stone-400">
        Ist das der nächste Termin, bekommen die anderen Bescheid.
      </p>
    </div>
  );
}

/**
 * Eine Rolle als Zeile: Bezeichnung, wer es ist, Stift.
 *
 * Vorher standen die drei als Chips nebeneinander. Die sahen nach Anzeige aus,
 * nicht nach „hier trägst du ein", und wer sie nicht angetippt hat, hat die
 * Zuteilung nie gefunden.
 */
function RoleRow({
  label,
  people,
  emptyLabel,
  onEdit,
  EditIcon,
  editIconSize = 14,
}: {
  label: string;
  people: PersonRef[];
  emptyLabel: string;
  /** Fehlt an einem abgesagten Abend: dort gibt es nichts mehr einzuteilen. */
  onEdit?: () => void;
  EditIcon?: React.ComponentType<{ size: number }>;
  editIconSize?: number;
}) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <span className="w-16 shrink-0 text-[11px] font-semibold text-stone-500">
        {label}
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-2">
        {people.length === 0 ? (
          <span className="truncate text-sm text-stone-400 italic">
            {emptyLabel}
          </span>
        ) : (
          people.map((person) => (
            <span key={person.id} className="flex items-center gap-1.5">
              <Avatar person={person} size="xs" />
              <span className="text-sm font-bold text-stone-800">
                {person.name}
              </span>
            </span>
          ))
        )}
      </span>

      {onEdit && (
        <IconButton label={`${label} eintragen`} onClick={onEdit}>
          {EditIcon ? (
            <EditIcon size={editIconSize} />
          ) : (
            <Pencil size={editIconSize} />
          )}
        </IconButton>
      )}
    </div>
  );
}
