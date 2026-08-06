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
 * Deshalb gibt es keine freie Ortsauswahl, solange ein Gastgeber eingetragen
 * ist — der Ort steht dann einfach da. Ohne Gastgeber wird er wählbar, aber
 * nur unter den Treffpunkten ohne Gastgeber. Durchgesetzt wird das im Backend
 * (`MeetingService.resolveVenue`); hier steht nur, was man davon sieht.
 *
 * **Ein vergangener Abend ist ein eigener Zustand**, nicht ein ausgegrauter
 * kommender. Nachtragen geht, aber mit Rückfrage und ohne Vorschläge; Lieder
 * stehen fest; und „absagen" heißt dort „hat nicht stattgefunden" und schickt
 * niemandem mehr eine Benachrichtigung.
 */
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ExternalLink,
  MapPin,
  Pencil,
  Plus,
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
import { InlineEdit, Select, TextInput } from '@/components/ui/field';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { cn } from '@/lib/cn';
import {
  useLocations,
  useMe,
  useMeeting,
  usePeople,
  useSetActionstepDone,
  useSongLeaders,
  useUpdateMeeting,
} from '@/lib/api/hooks';
import {
  formatDayFull,
  formatDayRange,
  formatRelativeDay,
  formatWeekday,
  isFuture,
  isPast,
} from '@/lib/date';
import { isSelectableWithoutHost } from '@/lib/location';
import {
  MEETING_SLOTS,
  MEETING_TYPE_LABEL,
  ROLE_LABEL,
  actionstepProgress,
  applySlotToggle,
  mapsUrl,
  meetingHeadline,
} from '@/lib/meeting';
import { SlotCard } from '@/components/domain/slot-toggles';
import type { MeetingSlotKey } from '@/lib/meeting';
import type { AssignmentRole, Meeting, PersonRef } from '@/lib/api/types';
import { AttendanceCard } from './attendance-card';
import { CancelledNotice, CancelMeetingBlock } from './cancellation-card';
import { SongsCard } from './songs-card';
import { TopicCard } from './topic-card';
import { useRoleAssignment } from './use-role-assignment';

const SLOT_LABEL = Object.fromEntries(
  MEETING_SLOTS.map((slot) => [slot.key, slot.label]),
) as Record<MeetingSlotKey, string>;

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
      meeting.topic || meeting.summaryText || meeting.actionstepText
        ? 'Thema, Zusammenfassung und Actionstep dieses Abends fallen weg. Das Thema selbst bleibt und läuft weiter.'
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
  };

const AssignmentSheet = dynamic(() =>
  import('@/components/domain/assignment-sheet').then((m) => m.AssignmentSheet),
);

const LocationSheet = dynamic(() =>
  import('@/components/domain/location-sheet').then((m) => m.LocationSheet),
);

type SheetRole = Exclude<AssignmentRole, 'PRAYER_BUDDY'>;

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
  const [creatingLocation, setCreatingLocation] = useState(false);

  const update = useUpdateMeeting(meetingId);
  const locations = useLocations();
  const songLeaders = useSongLeaders(meetingId);
  const roles = useRoleAssignment(meeting);
  const confirm = useConfirm();

  const cancelled = meeting.status === 'CANCELLED';
  const past = isPast(meeting.date);
  /** Der Abend liegt noch vor uns — es gibt noch nichts nachzubereiten. */
  const ahead = isFuture(meeting.date);

  /**
   * Ein abgesagter Abend ist kein Entwurf mehr. Vorher hing der Schreibschutz
   * allein an `past` — man konnte einem Termin, den es nicht mehr gibt, noch
   * Lieder und Rollen zuweisen.
   */
  const locked = past || cancelled;

  const patch = (input: Parameters<typeof update.mutate>[0]) =>
    update.mutate(input);

  const selectedFor = (role: SheetRole): string[] => {
    if (role === 'HOST')
      return meeting.hostPersonId ? [meeting.hostPersonId] : [];
    if (role === 'TESTIMONY')
      return meeting.testimonyPersonId ? [meeting.testimonyPersonId] : [];
    if (role === 'TOPIC') return roles.topicPeople.map((p) => p.id);
    return (songLeaders.data ?? []).map((p) => p.id);
  };

  const submitFor = (role: SheetRole) => {
    if (role === 'HOST') return roles.assignHost;
    if (role === 'TESTIMONY') return roles.assignTestimony;
    if (role === 'TOPIC') return roles.assignTopicResponsibles;
    return roles.assignSongLeaders;
  };

  /**
   * Rückfrage, bevor an einem vergangenen Abend etwas umgetragen wird. Das ist
   * fast immer ein Fehlgriff aus dem Archiv heraus — und in den seltenen
   * Fällen, in denen es keiner ist, kostet ein Klick nichts.
   */
  const openSheet = async (role: SheetRole) => {
    if (past) {
      const ok = await confirm({
        title: 'Dieser Abend ist vorbei',
        body: `Möchtest du wirklich nachtragen, wer ${ROLE_LABEL[role].toLowerCase()} war?`,
        confirmLabel: 'Nachtragen',
      });
      if (!ok) return;
    }
    setSheet(role);
  };

  const treffpunkte = (locations.data ?? []).filter(isSelectableWithoutHost);

  const me = useMe();

  /**
   * Ob die eigene Person am Thema dieses Abends schreiben darf.
   *
   * Dieselbe Regel wie im Backend (`edit-rights.ts`), hier nur, um den Stift
   * gar nicht erst anzubieten. Durchgesetzt wird sie dort — eine
   * Bedienoberfläche ist keine Sicherheitsgrenze.
   */
  const mayDo = (responsibles: readonly string[]) =>
    me.isAdmin ||
    responsibles.length === 0 ||
    (me.me ? responsibles.includes(me.me.id) : false);

  const mayEditTopic = mayDo(roles.topicPeople.map((person) => person.id));

  /**
   * Abhaken darf vor dem Abend, wer die Musik macht — danach jede:r. Nur an
   * einem **abgesagten** Abend gar niemand: dort gibt es nichts zu protokollieren.
   */
  const mayPickSongs =
    !cancelled &&
    (past || mayDo((songLeaders.data ?? []).map((person) => person.id)));

  /**
   * Einen Baustein dazu- oder wegnehmen.
   *
   * Wegnehmen räumt auf dem Server auf — Thema, Lieder, Testimony fallen mit.
   * Das ist richtig so (ein Feld, das niemand mehr setzen kann und trotzdem
   * einen Wert trägt, ist eine Falle), aber es darf niemanden überraschen.
   * Deshalb die Rückfrage, und nur dann, wenn wirklich etwas verlorengeht: bei
   * einem leeren Baustein wäre sie eine Frage ohne Inhalt.
   *
   * `applySlotToggle` kann **zwei** Schalter zurückgeben: Thema und Testimony
   * schließen einander aus, und wer das eine anhakt, meint damit ersichtlich
   * „statt des anderen". Deshalb geht auch dessen Verlust in die Rückfrage ein.
   */
  const toggleSlot = async (key: MeetingSlotKey, value: boolean) => {
    const next = applySlotToggle(meeting, key, value);

    const losses = MEETING_SLOTS.filter(
      (slot) => meeting[slot.key] && !next[slot.key],
    )
      .map((slot) => SLOT_LOSSES[slot.key](meeting))
      .filter((loss): loss is string => loss !== null);

    if (losses.length > 0) {
      const ok = await confirm({
        title: value
          ? `${SLOT_LABEL[key]} statt ${SLOT_LABEL[key === 'hasTopicSlot' ? 'hasTestimonySlot' : 'hasTopicSlot']}?`
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
          onSave={(next) => patch({ title: next })}
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
              onSave={(next) => patch({ infoText: next })}
            />
          </Card>
        </section>

        {/* Ort und Gastgeber stehen an jedem Termin: man trifft sich immer
            irgendwo, auch an einem Geburtstag. Dass niemand eingetragen ist,
            ist ein gültiger Zustand — das Treffen im Schlosspark. */}
        <Card className="divide-y divide-line">
          <div className="pb-4">
            <p className="mb-1.5 text-[11px] font-semibold text-stone-500">
              Ort
            </p>

            {meeting.host ? (
              <>
                <p className="text-sm font-bold text-stone-800">
                  {meeting.location?.name ?? 'Noch offen'}
                </p>
                <p className="mt-0.5 text-[11px] text-stone-400">
                  Ergibt sich aus dem Gastgeber. Für einen anderen Ort nimm
                  unten den Gastgeber heraus.
                </p>
              </>
            ) : (
              <>
                <Select
                  value={meeting.locationId ?? ''}
                  disabled={update.isPending}
                  onChange={(event) =>
                    patch({
                      locationId:
                        event.target.value === '' ? null : event.target.value,
                    })
                  }
                >
                  <option value="">Noch offen</option>
                  {treffpunkte.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => setCreatingLocation(true)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-terracotta-600 hover:underline"
                >
                  <Plus size={12} />
                  Treffpunkt anlegen
                </button>
              </>
            )}

            {meeting.location && (
              <a
                href={mapsUrl(meeting.location)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex items-center gap-1 text-xs font-semibold text-terracotta-600 hover:underline"
              >
                <MapPin size={12} />
                In Maps öffnen
                <ExternalLink size={11} />
              </a>
            )}
          </div>

          <RoleRow
            label={ROLE_LABEL.HOST}
            people={meeting.host ? [meeting.host] : []}
            emptyLabel="Noch niemand — dann wird ein Treffpunkt gebraucht"
            onEdit={cancelled ? undefined : () => openSheet('HOST')}
          />

          {meeting.hasTopicSlot && (
            <RoleRow
              label={ROLE_LABEL.TOPIC}
              people={roles.topicPeople}
              emptyLabel="Noch niemand"
              onEdit={cancelled ? undefined : () => openSheet('TOPIC')}
            />
          )}

          {meeting.hasTestimonySlot && (
            <RoleRow
              label={ROLE_LABEL.TESTIMONY}
              people={meeting.testimonyPerson ? [meeting.testimonyPerson] : []}
              emptyLabel="Noch niemand — wer erzählt seine Geschichte?"
              onEdit={cancelled ? undefined : () => openSheet('TESTIMONY')}
            />
          )}

          {meeting.hasSongSlot && (
            <RoleRow
              label={ROLE_LABEL.SONG}
              people={songLeaders.data ?? []}
              emptyLabel="Noch niemand — oder ein Abend ohne Lieder"
              onEdit={cancelled ? undefined : () => openSheet('SONG')}
            />
          )}
        </Card>

        {meeting.hasSongSlot && (
          <SongsCard
            meetingId={meetingId}
            readOnly={locked}
            mayPick={mayPickSongs}
          />
        )}

        <AttendanceCard meeting={meeting} readOnly={locked} />

        {/* Nachbereitung. Vor dem Abend gibt es dazu nichts zu sagen — die
            Felder erscheinen erst am Termintag, der Server lehnt es davor
            ohnehin ab. Und ohne Thema gar nicht: was an einem Abend besprochen
            wurde, ist die Zusammenfassung eines Themas. */}
        {/* Vor dem Abend sieht die Sektion nur, wer hier schreiben darf: der
            Actionstep der nächsten Woche eine Woche zu früh für alle wäre genau
            das Gegenteil von dem, wozu ein Actionstep da ist. Ab dem Termintag
            sehen ihn alle — da ist er ja gesagt worden. */}
        {meeting.hasTopicSlot && (!ahead || mayEditTopic) && (
          <TopicCard
            meeting={meeting}
            editable={mayEditTopic}
            saving={update.isPending || roles.saving}
            onTitle={roles.renameTopic}
            onSummary={(next) => patch({ summaryText: next })}
            onActionstep={(next) => patch({ actionstepText: next })}
          >
            {/* Abhaken darf jede:r für sich, auch wer den Text nicht ändern
                darf — es ist der eigene Vorsatz. Erst ab dem Abend: einen
                Vorsatz für nächste Woche hakt man heute nicht ab. */}
            {!ahead && <ActionstepDoneBlock meeting={meeting} />}
          </TopicCard>
        )}

        {/* Ganz unten, weil man das einmal beim Anlegen entscheidet und danach
            selten. Aber erreichbar, denn „ach, Lieder hätten wir doch gern"
            fällt einem erst auf der Terminseite ein. */}
        {!locked && (
          <SlotCard
            slots={meeting}
            disabled={update.isPending}
            onToggle={toggleSlot}
          />
        )}
      </div>

      {!cancelled && <CancelMeetingBlock meeting={meeting} past={past} />}

      {sheet && (
        <AssignmentSheet
          open
          onClose={() => setSheet(null)}
          kind={sheet}
          meetingId={meetingId}
          selectedIds={selectedFor(sheet)}
          multiple={sheet !== 'HOST' && sheet !== 'TESTIMONY'}
          withoutSuggestions={past}
          onSubmit={submitFor(sheet)}
          saving={roles.saving}
        />
      )}

      {creatingLocation && (
        <LocationSheet
          open
          onClose={() => setCreatingLocation(false)}
          onCreated={(location) => patch({ locationId: location.id })}
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
/**
 * Der eigene Haken plus die Namen der anderen.
 *
 * Namen statt nur einer Zahl: „5 von 9" sagt, wie es der Gruppe geht, die
 * Namen sagen, wen man fragen kann, wie es lief. Für neun Leute passt beides
 * nebeneinander.
 *
 * Auch an einem vergangenen Abend abhakbar — hier ist „vorbei" gerade kein
 * Grund zu sperren: der Actionstep gilt _nach_ dem Abend, das Nachtragen ist
 * der Normalfall und nicht der Fehlgriff. Der Block erscheint deshalb ab dem
 * Termintag und danach für immer; nur davor gibt es nichts abzuhaken.
 */
function ActionstepDoneBlock({ meeting }: { meeting: Meeting }) {
  const me = useMe();
  const people = usePeople();
  const setDone = useSetActionstepDone(meeting.id);

  const doneByMe = meeting.actionstepDone.some(
    (row) => row.person.id === me.me?.id,
  );
  const activeCount = (people.data ?? []).filter((p) => p.active).length;
  const others = meeting.actionstepDone
    .map((row) => row.person)
    .filter((person) => person.id !== me.me?.id);

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <button
        type="button"
        aria-pressed={doneByMe}
        disabled={!me.me}
        onClick={() => setDone.mutate(!doneByMe)}
        className={cn(
          'flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-50',
          'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
          doneByMe
            ? 'border-music-line bg-music-bg/40 text-music'
            : 'border-line text-stone-500 hover:border-line-strong',
        )}
      >
        {doneByMe ? <CheckCircle2 size={17} /> : <Circle size={17} />}
        <span className="text-sm font-bold">
          {doneByMe ? 'Du hast es geschafft' : 'Für mich abhaken'}
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-stone-400">
          {actionstepProgress(meeting.actionstepDone.length, activeCount)}
        </span>
        {others.length > 0 && (
          <span className="flex items-center gap-1.5">
            {others.map((person) => (
              <span key={person.id} title={person.name}>
                <Avatar person={person} size="xs" />
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

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
  onSave: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title ?? '');

  const commit = () => {
    const trimmed = draft.trim();
    setEditing(false);
    const next = trimmed === '' ? null : trimmed;
    if (next !== title) onSave(next);
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
}: {
  label: string;
  people: PersonRef[];
  emptyLabel: string;
  /** Fehlt an einem abgesagten Abend: dort gibt es nichts mehr einzuteilen. */
  onEdit?: () => void;
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
          <Pencil size={14} />
        </IconButton>
      )}
    </div>
  );
}
