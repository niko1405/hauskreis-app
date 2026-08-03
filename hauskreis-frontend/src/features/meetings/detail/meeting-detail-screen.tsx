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
  CalendarX,
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
import { InlineEdit, Select, TextInput } from '@/components/ui/field';
import {
  CardSkeleton,
  ConflictBanner,
  ErrorState,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/api/errors';
import {
  useCancelMeeting,
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
  formatRelativeDay,
  formatWeekday,
  isPast,
} from '@/lib/date';
import { isSelectableWithoutHost } from '@/lib/location';
import {
  MEETING_TYPE_LABEL,
  ROLE_LABEL,
  actionstepProgress,
  hasTestimonySlot,
  hasTopicSlot,
  mapsUrl,
  meetingHeadline,
} from '@/lib/meeting';
import type { AssignmentRole, Meeting, PersonRef } from '@/lib/api/types';
import { AttendanceCard } from './attendance-card';
import { SongsCard } from './songs-card';
import { useRoleAssignment } from './use-role-assignment';

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
  const cancel = useCancelMeeting(meetingId);
  const locations = useLocations();
  const songLeaders = useSongLeaders(meetingId);
  const roles = useRoleAssignment(meeting);
  const toast = useToast();

  const cancelled = meeting.status === 'CANCELLED';
  const past = isPast(meeting.date);

  const patch = (input: Parameters<typeof update.mutate>[0]) =>
    update.mutate(input, {
      onError: (error) => toast.error(errorMessage(error)),
    });

  const selectedFor = (role: SheetRole): string[] => {
    if (role === 'HOST')
      return meeting.hostPersonId ? [meeting.hostPersonId] : [];
    if (role === 'TOPIC') return roles.topicPeople.map((p) => p.id);
    return (songLeaders.data ?? []).map((p) => p.id);
  };

  const submitFor = (role: SheetRole) => {
    if (role === 'HOST') return roles.assignHost;
    if (role === 'TOPIC') return roles.assignTopicResponsibles;
    return roles.assignSongLeaders;
  };

  /**
   * Rückfrage, bevor an einem vergangenen Abend etwas umgetragen wird. Das ist
   * fast immer ein Fehlgriff aus dem Archiv heraus — und in den seltenen
   * Fällen, in denen es keiner ist, kostet ein Klick nichts.
   */
  const openSheet = (role: SheetRole) => {
    if (
      past &&
      !window.confirm(
        `Dieser Abend ist vorbei. Möchtest du wirklich nachtragen, wer ${ROLE_LABEL[role].toLowerCase()} war?`,
      )
    ) {
      return;
    }
    setSheet(role);
  };

  const treffpunkte = (locations.data ?? []).filter(isSelectableWithoutHost);

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
          {formatDayFull(meeting.date)} · {MEETING_TYPE_LABEL[meeting.type]}
        </p>
      </header>

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

      <Card className="divide-y divide-line">
        <div className="pb-4">
          <p className="mb-1.5 text-[11px] font-semibold text-stone-500">Ort</p>

          {meeting.host ? (
            <>
              <p className="text-sm font-bold text-stone-800">
                {meeting.location?.name ?? 'Noch offen'}
              </p>
              <p className="mt-0.5 text-[11px] text-stone-400">
                Ergibt sich aus dem Gastgeber. Für einen anderen Ort nimm unten
                den Gastgeber heraus.
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
          onEdit={() => openSheet('HOST')}
        />

        {hasTopicSlot(meeting.type) && (
          <RoleRow
            label={ROLE_LABEL.TOPIC}
            people={roles.topicPeople}
            emptyLabel="Noch niemand"
            onEdit={() => openSheet('TOPIC')}
          />
        )}

        <RoleRow
          label={ROLE_LABEL.SONG}
          people={songLeaders.data ?? []}
          emptyLabel="Noch niemand — oder ein Abend ohne Lieder"
          onEdit={() => openSheet('SONG')}
        />
      </Card>

      {hasTestimonySlot(meeting.type) && (
        <section>
          <SectionTitle>Testimony</SectionTitle>
          <Card>
            <InlineEdit
              label="Testimony"
              multiline
              value={meeting.testimonyText}
              emptyLabel="Noch kein Testimony — an dem Abend geht es vielleicht nur um Lobpreis."
              saving={update.isPending}
              onSave={(next) => patch({ testimonyText: next })}
            />
          </Card>
        </section>
      )}

      <SongsCard meetingId={meetingId} readOnly={past} />

      <AttendanceCard meeting={meeting} readOnly={past} />

      <section>
        <SectionTitle>Zusammenfassung</SectionTitle>
        <Card>
          <InlineEdit
            label="Zusammenfassung"
            multiline
            value={meeting.summaryText}
            emptyLabel="Noch keine Zusammenfassung — hilft allen, die nicht da waren."
            saving={update.isPending}
            onSave={(next) => patch({ summaryText: next })}
          />
        </Card>
      </section>

      <section>
        <SectionTitle>Actionstep</SectionTitle>
        <Card className="space-y-4">
          <InlineEdit
            label="Actionstep"
            value={meeting.actionstepText}
            emptyLabel="Noch kein Actionstep für die Woche"
            saving={update.isPending}
            onSave={(next) => patch({ actionstepText: next })}
          />
          {meeting.actionstepText && <ActionstepDoneBlock meeting={meeting} />}
        </Card>
      </section>

      {!cancelled && (
        <div>
          <Button
            variant="danger"
            className="w-full"
            loading={cancel.isPending}
            onClick={() =>
              cancel.mutate(undefined, {
                onSuccess: () =>
                  toast.success(
                    past ? 'Als abgesagt vermerkt.' : 'Termin abgesagt.',
                  ),
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          >
            <CalendarX size={15} />
            {past ? 'Als abgesagt markieren' : 'Termin absagen'}
          </Button>
          <p className="mt-2 text-center text-[11px] text-stone-400">
            {past
              ? 'Nur ein Vermerk fürs Archiv — es geht keine Benachrichtigung raus.'
              : 'Alle bekommen eine Benachrichtigung.'}
          </p>
        </div>
      )}

      {sheet && (
        <AssignmentSheet
          open
          onClose={() => setSheet(null)}
          kind={sheet}
          meetingId={meetingId}
          selectedIds={selectedFor(sheet)}
          multiple={sheet !== 'HOST'}
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
 * der Normalfall und nicht der Fehlgriff.
 */
function ActionstepDoneBlock({ meeting }: { meeting: Meeting }) {
  const me = useMe();
  const people = usePeople();
  const setDone = useSetActionstepDone(meeting.id);
  const toast = useToast();

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
        disabled={setDone.isPending || !me.me}
        onClick={() =>
          setDone.mutate(!doneByMe, {
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
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
  onEdit: () => void;
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

      <IconButton label={`${label} eintragen`} onClick={onEdit}>
        <Pencil size={14} />
      </IconButton>
    </div>
  );
}
