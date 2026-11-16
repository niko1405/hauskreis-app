'use client';

/**
 * Die Mehrwochen-Planung (CLAUDE.md §9).
 *
 * **Eine Tabelle in einer Karte, in zwei Größen.** Hier plant man **quer** —
 * „wer hostet in den nächsten sechs Wochen" ist eine Spalte, keine sechs
 * Zeilen. Voreingestellt ist **„Alle Spalten"**: alles auf einen Blick, auch
 * auf dem Telefon, mit Kurzformen im Kopf und kleinen Gesichtern. Wer mehr
 * lesen will, nimmt **„Reinzoomen"**: breitere Spalten und die volle
 * Bezeichnung — das Raster scrollt dann waagerecht, und die Datumsspalte bleibt
 * links stehen. **Die Datumsspalte ist in beiden so knapp wie möglich** —
 * „17.11", darunter „Di, in 2d": Sie steht dauerhaft im Bild, und jeder Pixel
 * darin fehlt den Rollen daneben. Zwei Stufen statt eines Reglers: Es ist eine Frage
 * („alles sehen oder genauer hinsehen"), und drei Zwischengrößen beantworteten
 * sie nicht besser.
 *
 * Kein Pinch-Zoom: der kollidiert auf Mobilgeräten mit dem Seiten-Zoom des
 * Browsers und lässt sich nicht zuverlässig davon trennen.
 *
 * Und: die Zellen sind nicht nur Anzeige. Antippen öffnet dasselbe
 * Zuteilungs-Sheet wie die Detailseite — die Tabelle ist der Ort, an dem man
 * merkt, dass etwas fehlt, also gehört das Eintragen auch dorthin.
 *
 * **Die Zeilen kommen aus den Terminen, nicht aus `…/assignments`.** Diese
 * Route beantwortet „wer ist wofür dran", und das tut sie richtig: eine Zeile
 * je zugeteilter Person. Ein Abend, an dem noch niemand steht, erzeugt dort
 * also nichts — und genau der Abend ist der, den man in einer Planungstabelle
 * sucht. Die Terminliste liefert ohnehin schon Gastgeber,
 * Thema, Musik, Testimony und Snacks mit, es kostet also keine zweite Abfrage.
 */
import { CheckCircle2, Plus, ZoomIn, ZoomOut } from 'lucide-react';
import Link from '@/components/ui/link';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { AvatarStack } from '@/components/ui/avatar';
import { PRESSABLE } from '@/components/ui/button';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  useMeeting,
  useMeetingList,
  useSetSnackResponsibles,
  useSongLeaders,
} from '@/lib/api/hooks';
import {
  addDays,
  dayParts,
  formatDay,
  formatDayDistance,
  formatDayNumeric,
  today,
} from '@/lib/date';
import {
  MEETING_ROLE_ORDER,
  ROLE_LABEL,
  meetingRoles,
  planningComplete,
  type MeetingRole,
} from '@/lib/meeting';
import { cn } from '@/lib/cn';
import type { MeetingListItem, PersonRef } from '@/lib/api/types';
import { useHauskreis } from '@/lib/hauskreis/hauskreis-context';
import { useRoleAssignment } from './detail/use-role-assignment';

/*
 * Die Sheets werden erst beim ersten Öffnen geladen — mit `loading: () => null`
 * als eigener Suspense-Grenze. Ohne `loading` setzt `next/dynamic` **keine**
 * und das ladende Sheet hält die nächste Grenze darüber an: die ganze Seite,
 * die dann hinter dem aufgehenden Sheet ihre Skeletons zeigt.
 */
const AssignmentSheet = dynamic(
  () =>
    import('@/components/domain/assignment-sheet').then(
      (m) => m.AssignmentSheet,
    ),
  { loading: () => null },
);

const VenueSheet = dynamic(
  () => import('@/components/domain/venue-sheet').then((m) => m.VenueSheet),
  { loading: () => null },
);

const SnackSheet = dynamic(
  () => import('@/components/domain/snack-sheet').then((m) => m.SnackSheet),
  { loading: () => null },
);

/**
 * Die Spalten der Mehrwochen-Planung — die Rollen, die an einem Abend hängen.
 *
 * Gebetsbuddys und Geschenke fallen heraus: Beide hängen an keinem Termin, und
 * eine Spalte, die in jeder Zeile leer bliebe, wäre keine Information.
 *
 * `MeetingRole` aus `lib/meeting.ts` — dieselbe Menge, die auch die
 * Zuständigkeiten am Termin auflisten und `planningComplete` prüft. Sie ist
 * weiter als `AssignmentKind`: Jener Typ beantwortet „welche Rollen haben eine
 * Rangliste", diese Tabelle „welche Rollen hängen an einem Abend". Bei vier
 * Rollen fällt beides zusammen, bei den Snacks nicht — sie stehen hier, weil
 * ein Abend ohne sie nicht fertig geplant ist, und im Sheet nicht, weil es
 * nichts vorzuschlagen gibt.
 */
type Column = MeetingRole;

/**
 * Die Spaltenköpfe in „Alle Spalten". Fünf Rollen und ein Datum auf 350
 * Pixeln: „Testimony" passt dort nicht, „Testim." schon. Ausgeschrieben steht
 * es im `title` und für Screenreader.
 */
const SHORT_LABEL: Record<Column, string> = {
  HOST: 'Host',
  TOPIC: 'Thema',
  SONG: 'Musik',
  TESTIMONY: 'Testim.',
  SNACK: 'Snacks',
};

/**
 * Die grüne Tönung eines fertig geplanten Abends — **deckend** gemischt und
 * nicht durchscheinend: Beim Reinzoomen klebt die Datumsspalte, und unter einer
 * halb durchsichtigen Fläche schöben sich die Zellen sichtbar hindurch.
 */
const DONE_BG =
  'bg-[color-mix(in_srgb,var(--color-success-bg)_45%,var(--color-card))]';

/**
 * Was in einer Zelle steht — oder warum nichts darin steht.
 *
 * Der Unterschied zwischen *fehlt* und *gibt es hier nicht* ist die ganze
 * Frage, die man an so eine Tabelle stellt. Ein Geburtstagsabend ohne Thema
 * ist nicht offen, er hat keins; das mit „offen" zu beschriften hieße, jede
 * Woche an eine Lücke zu erinnern, die niemand füllen will.
 */
interface Cell {
  role: Column;
  people: PersonRef[];
  /**
   * Warum die Zelle leer ist, wenn niemand darin steht.
   *
   * `null` heißt **offen** — hier fehlt jemand. Die beiden anderen heißen, dass
   * nichts fehlt, und sehen deshalb verschieden aus:
   *
   * - `slot-off`: der Baustein ist an diesem Abend abgeschaltet. Ein Strich,
   *   damit die Spalte trotzdem erkennbar bleibt und man sieht, was für ein
   *   Abend das ist — an einem Lobpreisabend steht unter „Thema" ein Strich und
   *   unter „Testimony" ein Name.
   * - `not-needed`: der Gastgeber-Platz, wenn der Ort schon feststeht und keinen
   *   braucht. Da ist nichts abgeschaltet und nichts offen, es ist geklärt —
   *   also ein leeres Feld, kein Zeichen.
   */
  absent: 'slot-off' | 'not-needed' | null;
}

export function AssignmentTable({ weeks = 8 }: { weeks?: number }) {
  const from = today();
  const to = addDays(from, weeks * 7);
  const query = useMeetingList({ scope: 'upcoming', from, to, take: 100 });

  /**
   * Die Spalten — ohne Testimony, wenn die Gruppe es abgeschaltet hat. Die
   * Tabelle zeigt nur Kommende, und dort hat das Abschalten es abgeräumt; eine
   * Spalte mit lauter Strichen wäre nur Platz, der den übrigen fehlt.
   */
  const testimony = useHauskreis().hauskreis?.features.testimony ?? true;
  const columns = MEETING_ROLE_ORDER.filter(
    (role) => testimony || role !== 'TESTIMONY',
  );

  /** `false` heißt „Alle Spalten" — die Vorgabe. */
  const [zoom, setZoom] = useState(false);
  const [editing, setEditing] = useState<{
    meetingId: string;
    role: Column;
  } | null>(null);

  if (query.isLoading) return <CardSkeleton />;
  if (query.error) {
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  if (query.items.length === 0) {
    return (
      <EmptyState
        title="Für die nächsten Wochen stehen noch keine Termine"
        hint="Der Terminplaner legt sie im Voraus an."
      />
    );
  }

  const head = cn(
    'py-3 font-bold text-stone-400 uppercase',
    zoom
      ? 'px-3 text-[10px] tracking-widest'
      : 'px-1 text-[9px] tracking-wider',
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate px-1 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
          Nächste {weeks} Wochen
        </p>
        {/* Der Knopf nennt, wohin er führt — nicht, wo man gerade ist. */}
        <button
          type="button"
          onClick={() => setZoom((current) => !current)}
          aria-pressed={zoom}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-bold text-stone-700 transition-colors hover:border-line-strong',
            'focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
            PRESSABLE,
          )}
        >
          {zoom ? (
            <ZoomOut size={14} className="text-terracotta-500" />
          ) : (
            <ZoomIn size={14} className="text-terracotta-500" />
          )}
          {zoom ? 'Alle Spalten' : 'Reinzoomen'}
        </button>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-card shadow-sm shadow-stone-200/40">
        <div className={cn(zoom && 'no-scrollbar overflow-x-auto')}>
          <table
            className={cn(
              'w-full border-collapse',
              zoom ? 'min-w-[46rem]' : 'table-fixed',
            )}
          >
            {!zoom && (
              <colgroup>
                <col className="w-[5.25rem]" />
                {columns.map((role) => (
                  <col key={role} />
                ))}
              </colgroup>
            )}
            <thead>
              <tr className="border-b border-line">
                <th
                  scope="col"
                  className={cn(
                    head,
                    'pl-4 text-left',
                    zoom &&
                      'sticky left-0 z-10 w-px border-r border-line bg-card pr-3 whitespace-nowrap',
                  )}
                >
                  Termin
                </th>
                {/* Aus derselben Aufstellung wie die Zellen darunter — warum,
                    steht bei `MEETING_ROLE_ORDER`. */}
                {columns.map((role) => (
                  <th
                    key={role}
                    scope="col"
                    title={ROLE_LABEL[role]}
                    className={cn(head, 'text-center')}
                  >
                    {zoom ? (
                      ROLE_LABEL[role]
                    ) : (
                      <>
                        <span aria-hidden>{SHORT_LABEL[role]}</span>
                        <span className="sr-only">{ROLE_LABEL[role]}</span>
                      </>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {query.items.map((meeting) => (
                <Row
                  key={meeting.id}
                  meeting={meeting}
                  columns={columns}
                  zoom={zoom}
                  onEdit={(role) => setEditing({ meetingId: meeting.id, role })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <CellSheet
          meetingId={editing.meetingId}
          role={editing.role}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Row({
  meeting,
  columns,
  zoom,
  onEdit,
}: {
  meeting: MeetingListItem;
  /** Welche Spalten die Tabelle zeigt — dieselben wie im Kopf. */
  columns: readonly Column[];
  zoom: boolean;
  onEdit: (role: Column) => void;
}) {
  const cancelled = meeting.status === 'CANCELLED';
  /**
   * Jede Rolle vergeben, die es an diesem Abend gibt.
   *
   * Genau die Frage, für die man diese Tabelle aufmacht — ohne die Markierung
   * müsste man die Zellen einzeln absuchen.
   */
  const fertig = planningComplete(meeting);

  // Dieselbe Aufstellung, die auch die Zuständigkeiten am Termin zeichnen und
  // `planningComplete` prüft — zwei Antworten auf „welche Rollen hat dieser
  // Abend" liefen irgendwann auseinander.
  const cells: Cell[] = meetingRoles(meeting).filter((cell) =>
    columns.includes(cell.role),
  );

  return (
    <tr
      className={cn(
        'align-middle',
        fertig && DONE_BG,
        cancelled && 'opacity-50',
      )}
    >
      {/* `th scope="row"`, nicht `td`: das Datum ist die Überschrift der Zeile,
          und ein Screenreader liest damit „Host, 11. August" statt nur
          „Host" — sonst weiß man in der dritten Spalte nicht mehr, um welchen
          Abend es geht. */}
      <th
        scope="row"
        className={cn(
          'py-3 pr-1 pl-4 text-left font-normal',
          zoom &&
            cn(
              'sticky left-0 z-10 border-r border-line pr-3',
              fertig ? DONE_BG : 'bg-card',
            ),
        )}
      >
        <Link
          href={`/termin?id=${meeting.id}`}
          // Der sichtbare Text steht in zwei `span`s, und die statische
          // Prüfung sieht darin keinen Namen. Ausgesprochen ist er ohnehin
          // besser als „11. Aug. in 3 Tagen" am Stück.
          aria-label={`Termin am ${formatDay(meeting.date)} öffnen${
            cancelled ? ' — fällt aus' : fertig ? ' — fertig geplant' : ''
          }`}
          className="block rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none"
        >
          <span
            className={cn(
              'flex items-center gap-1 font-bold whitespace-nowrap text-stone-800',
              zoom ? 'text-sm' : 'text-[13px]',
            )}
          >
            {/* **In Ziffern, in beiden Größen** („17.11") — die Spalte steht
                neben fünf Rollen, und jeder Pixel darin fehlt ihnen. */}
            {formatDayNumeric(meeting.date)}
            {/* Nicht nur die Farbe: wer sie nicht unterscheidet, sieht das
                Zeichen. Der Titel sagt dasselbe noch einmal in Worten. */}
            {fertig && (
              <CheckCircle2
                size={12}
                className="shrink-0 text-success"
                aria-hidden
              />
            )}
          </span>
          {/* Darunter Wochentag und Abstand, knapp: „Di, in 2d". Ausgeschrieben
              („in einer Woche") passte es nicht in die schmale Spalte. */}
          <span
            className={cn(
              'block truncate whitespace-nowrap',
              zoom ? 'text-[11px]' : 'text-[10px]',
              cancelled ? 'font-semibold text-alert' : 'text-stone-400',
            )}
          >
            {cancelled
              ? 'Fällt aus'
              : `${dayParts(meeting.date).weekday}, ${formatDayDistance(meeting.date)}`}
          </span>
        </Link>
      </th>

      {cells.map((cell) => (
        <td
          key={cell.role}
          className={cn('text-center', zoom ? 'px-3 py-2.5' : 'px-0.5 py-2')}
        >
          <CellButton
            cell={cell}
            zoom={zoom}
            // An einem abgesagten Abend gibt es nichts einzuteilen.
            onEdit={cancelled ? undefined : () => onEdit(cell.role)}
            label={`${ROLE_LABEL[cell.role]} am ${formatDay(meeting.date)}`}
          />
        </td>
      ))}
    </tr>
  );
}

/**
 * Eine Zelle zeigt Gesichter, keinen Namen — sonst passen fünf Spalten auf
 * keinem Telefon nebeneinander. Der Name steht im Vorlese-Etikett.
 *
 * **Offen ist ein gestrichelter Kreis mit Plus**: Er sagt zugleich „fehlt" und
 * „hier antippen", ohne ein Wort, für das in der Spalte kein Platz ist.
 */
function CellButton({
  cell,
  zoom,
  onEdit,
  label,
}: {
  cell: Cell;
  zoom: boolean;
  onEdit?: () => void;
  label: string;
}) {
  const circle = zoom ? 'size-9' : 'size-7';

  if (cell.absent === 'slot-off') {
    return (
      <span
        className="inline-flex justify-center text-sm text-stone-300"
        title={`${label}: gehört an diesem Abend nicht dazu`}
      >
        –
      </span>
    );
  }

  // Kein Zeichen, nicht einmal ein Strich: der Ort steht, es fehlt niemand.
  // Anklickbar bleibt die Zelle trotzdem — wer doch bei sich einlädt, trägt
  // sich hier ein, und der Ort zieht dann mit.
  if (cell.absent === 'not-needed' && cell.people.length === 0) {
    return (
      <MaybeButton onEdit={onEdit} label={`${label}: kein Host nötig`}>
        <span className={cn('inline-block', circle)} />
      </MaybeButton>
    );
  }

  const content =
    cell.people.length === 0 ? (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full border border-dashed border-line-strong text-terracotta-500 transition-colors group-hover:border-terracotta-400',
          circle,
        )}
      >
        <Plus size={zoom ? 15 : 13} strokeWidth={2.5} />
      </span>
    ) : (
      <AvatarStack
        people={cell.people}
        size={zoom ? 'sm' : 'xs'}
        max={zoom ? 3 : 2}
        zoomable={false}
      />
    );

  return (
    <MaybeButton
      onEdit={onEdit}
      label={`${label}: ${cell.people.map((p) => p.name).join(', ') || 'offen'}`}
    >
      {content}
    </MaybeButton>
  );
}

/** Anklickbar, wenn es etwas zu ändern gibt — sonst nur ein Feld. */
function MaybeButton({
  onEdit,
  label,
  children,
}: {
  onEdit?: () => void;
  label: string;
  children: React.ReactNode;
}) {
  if (!onEdit) {
    return <span className="flex justify-center py-1">{children}</span>;
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${label} — antippen zum Eintragen`}
      className={cn(
        'group flex w-full items-center justify-center rounded-md py-1 transition-colors hover:bg-terracotta-500/5 focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
        PRESSABLE,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Lädt den Termin einzeln nach.
 *
 * `useRoleAssignment` braucht den ETag des Termins zum Schreiben, und den hat
 * die Liste nicht — sie kommt aus einer paginierten Antwort ohne
 * Einzel-ETags. Eine Anfrage beim Antippen ist der ehrlichere Preis, als alle
 * Termine einzeln vorzuladen für den Fall, dass jemand eine Zelle öffnet.
 */
function CellSheet({
  meetingId,
  role,
  onClose,
}: {
  meetingId: string;
  role: Column;
  onClose: () => void;
}) {
  const meeting = useMeeting(meetingId);

  if (!meeting.data?.data) return null;

  return (
    <LoadedCellSheet
      meeting={meeting.data.data}
      role={role}
      onClose={onClose}
    />
  );
}

function LoadedCellSheet({
  meeting,
  role,
  onClose,
}: {
  meeting: NonNullable<ReturnType<typeof useMeeting>['data']>['data'];
  role: Column;
  onClose: () => void;
}) {
  const roles = useRoleAssignment(meeting);
  const songLeaders = useSongLeaders(meeting.id);
  const setSnacks = useSetSnackResponsibles(meeting.id);

  // Der Gastgeber führt aufs Ort-Sheet: er *ist* der Ort. So lässt sich auch
  // in der Tabelle sagen „wir sind draußen".
  if (role === 'HOST') {
    return (
      <VenueSheet
        open
        onClose={onClose}
        meetingId={meeting.id}
        hostPersonId={meeting.hostPersonId}
        locationId={meeting.locationId}
        onSubmit={roles.assignVenue}
      />
    );
  }

  // Snacks führen in ihre eigene Auswahl: Es gibt nichts vorzuschlagen, und
  // die Abgesagten sollen gar nicht erst dastehen.
  if (role === 'SNACK') {
    return (
      <SnackSheet
        open
        onClose={onClose}
        selectedIds={meeting.snackResponsibles.map((row) => row.person.id)}
        attendances={meeting.attendances}
        onSubmit={setSnacks.mutate}
        saving={setSnacks.isPending}
      />
    );
  }

  const selectedIds =
    role === 'TESTIMONY'
      ? meeting.testimonyPersonId
        ? [meeting.testimonyPersonId]
        : []
      : role === 'TOPIC'
        ? roles.topicPeople.map((p) => p.id)
        : (songLeaders.data ?? []).map((p) => p.id);

  const onSubmit =
    role === 'TESTIMONY'
      ? roles.assignTestimony
      : role === 'TOPIC'
        ? roles.assignTopicResponsibles
        : roles.assignSongLeaders;

  return (
    <AssignmentSheet
      open
      onClose={onClose}
      kind={role}
      meetingId={meeting.id}
      selectedIds={selectedIds}
      multiple={role !== 'TESTIMONY'}
      onSubmit={onSubmit}
      saving={roles.saving}
    />
  );
}
