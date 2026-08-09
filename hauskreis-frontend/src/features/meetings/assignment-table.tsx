'use client';

/**
 * Die Mehrwochen-Planung (CLAUDE.md §9).
 *
 * Vorher war das auf dem Telefon keine Tabelle, sondern eine Liste mit Chips,
 * weil drei Spalten auf 390 px nicht lesbar sind. Der Grund, es trotzdem zur
 * Tabelle zu machen: hier plant man **quer** — „wer hostet in den nächsten
 * sechs Wochen" ist eine Spalte, keine sechs Zeilen. Deshalb bleibt das Raster
 * jetzt auf jeder Breite, scrollt waagerecht in seinem eigenen Kasten, und
 * zwei Knöpfe verkleinern es, wenn man mehr auf einmal sehen will.
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
 * also nichts — und fehlte hier. Genau der Abend ist aber der, den man in einer
 * Planungstabelle sucht. Die Terminliste liefert ohnehin schon Gastgeber,
 * Thema, Testimony und Musik mit, es kostet also keine zweite Abfrage.
 */
import { Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { useMeeting, useMeetingList, useSongLeaders } from '@/lib/api/hooks';
import { addDays, formatDay, formatRelativeDay, today } from '@/lib/date';
import { ROLE_LABEL } from '@/lib/meeting';
import { cn } from '@/lib/cn';
import type {
  AssignmentRole,
  MeetingListItem,
  PersonRef,
} from '@/lib/api/types';
import { useRoleAssignment } from './detail/use-role-assignment';

const AssignmentSheet = dynamic(() =>
  import('@/components/domain/assignment-sheet').then((m) => m.AssignmentSheet),
);

type Column = Exclude<AssignmentRole, 'PRAYER_BUDDY'>;

/**
 * Drei Stufen reichen: ganz, kleiner, klein. Ein stufenloser Regler wäre auf
 * dem Telefon schwerer zu treffen als der Unterschied wert ist.
 */
const ZOOM_STEPS = [1, 0.85, 0.7] as const;

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
  booked: boolean;
}

export function AssignmentTable({ weeks = 8 }: { weeks?: number }) {
  const from = today();
  const to = addDays(from, weeks * 7);
  const query = useMeetingList({ scope: 'upcoming', from, to, take: 100 });

  const [zoom, setZoom] = useState(0);
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

  const scale = ZOOM_STEPS[zoom] ?? 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-stone-400">
          Antippen zum Eintragen · seitlich wischbar
        </p>
        <div className="flex items-center gap-1">
          <IconButton
            label="Kleiner anzeigen"
            disabled={zoom === ZOOM_STEPS.length - 1}
            onClick={() =>
              setZoom((z) => Math.min(z + 1, ZOOM_STEPS.length - 1))
            }
          >
            <Minus size={15} />
          </IconButton>
          <IconButton
            label="Größer anzeigen"
            disabled={zoom === 0}
            onClick={() => setZoom((z) => Math.max(z - 1, 0))}
          >
            <Plus size={15} />
          </IconButton>
        </div>
      </div>

      {/* Der Zoom sitzt auf einem Wrapper, nicht auf der Tabelle selbst:
          `transform` nimmt das Element aus dem Textfluss, der Kasten außen
          würde sonst seine alte Höhe behalten und unten Luft lassen. Die
          Gegenrechnung per Prozent hält ihn passend. */}
      <div className="-mx-5 overflow-x-auto px-5">
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: `${100 / scale}%`,
            marginBottom: `${(scale - 1) * 100}px`,
          }}
        >
          <table className="w-full min-w-[34rem] border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th className="w-32 px-3 pb-1 text-left text-[10px] font-bold tracking-widest text-stone-400 uppercase">
                  Termin
                </th>
                {/* Die mittlere Spalte hat keinen festen Namen: Thema und
                    Testimony schließen einander aus, es steht an einem Abend
                    also immer nur eines davon. Zwei Spalten wären eine davon
                    immer leer. */}
                {['Host', 'Thema', 'Musik'].map((label) => (
                  <th
                    key={label}
                    className="px-3 pb-1 text-left text-[10px] font-bold tracking-widest text-stone-400 uppercase"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.items.map((meeting) => (
                <Row
                  key={meeting.id}
                  meeting={meeting}
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
  onEdit,
}: {
  meeting: MeetingListItem;
  onEdit: (role: Column) => void;
}) {
  const cancelled = meeting.status === 'CANCELLED';

  const cells: Cell[] = [
    { role: 'HOST', people: meeting.host ? [meeting.host] : [], booked: true },
    // Thema **oder** Testimony, nie beides — der Baustein entscheidet, was
    // hier steht.
    meeting.hasTestimonySlot
      ? {
          role: 'TESTIMONY',
          people: meeting.testimonyPerson ? [meeting.testimonyPerson] : [],
          booked: true,
        }
      : {
          role: 'TOPIC',
          people: meeting.topicResponsibles.map((r) => r.person),
          booked: meeting.hasTopicSlot,
        },
    {
      role: 'SONG',
      people: meeting.songLeaders.map((leader) => leader.person),
      booked: meeting.hasSongSlot,
    },
  ];

  return (
    <tr className={cn('align-middle', cancelled && 'opacity-50')}>
      {/* `th scope="row"`, nicht `td`: das Datum ist die Überschrift der Zeile,
          und ein Screenreader liest damit „Host, 11. August" statt nur
          „Host" — sonst weiß man in der dritten Spalte nicht mehr, um welchen
          Abend es geht. */}
      <th
        scope="row"
        className="rounded-l-md border-y border-l border-line bg-card px-3 py-2.5 text-left font-normal"
      >
        <Link
          href={`/termine/${meeting.id}`}
          // Der sichtbare Text steht in zwei `span`s, und die statische
          // Prüfung sieht darin keinen Namen. Ausgesprochen ist er ohnehin
          // besser als „11. Aug. in 3 Tagen" am Stück.
          aria-label={`Termin am ${formatDay(meeting.date)} öffnen`}
          className="block hover:underline"
        >
          <span className="block text-sm font-bold text-stone-800">
            {formatDay(meeting.date)}
          </span>
          <span className="block text-[10px] text-stone-400">
            {cancelled ? 'Fällt aus' : formatRelativeDay(meeting.date)}
          </span>
        </Link>
      </th>

      {cells.map((cell, index) => (
        <td
          key={cell.role}
          className={cn(
            'border-y border-line bg-card p-1',
            index === cells.length - 1 && 'rounded-r-md border-r',
          )}
        >
          <CellButton
            cell={cell}
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
 * Eine Zelle zeigt Avatare, keinen Namen — sonst passen drei Spalten auf
 * keinem Telefon nebeneinander. Der Name steht im `title` und im
 * Vorlese-Etikett, ist also mit Zeigegerät und mit Screenreader erreichbar.
 */
function CellButton({
  cell,
  onEdit,
  label,
}: {
  cell: Cell;
  onEdit?: () => void;
  label: string;
}) {
  if (!cell.booked) {
    return (
      <span
        className="flex px-2 py-1.5 text-[11px] text-stone-200"
        title={`${label}: gehört an diesem Abend nicht dazu`}
      >
        –
      </span>
    );
  }

  const content =
    cell.people.length === 0 ? (
      <span className="text-[11px] text-stone-300 italic">offen</span>
    ) : (
      <span className="flex items-center gap-1">
        {cell.people.map((person) => (
          <span key={person.id} title={person.name}>
            <Avatar person={person} size="xs" />
          </span>
        ))}
      </span>
    );

  if (!onEdit) {
    return <span className="flex px-2 py-1.5">{content}</span>;
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${label}: ${cell.people.map((p) => p.name).join(', ') || 'offen'} — antippen zum Eintragen`}
      className="flex w-full items-center rounded-sm px-2 py-1.5 transition-colors hover:bg-terracotta-50 focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none"
    >
      {content}
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

  const selectedIds =
    role === 'HOST'
      ? meeting.hostPersonId
        ? [meeting.hostPersonId]
        : []
      : role === 'TESTIMONY'
        ? meeting.testimonyPersonId
          ? [meeting.testimonyPersonId]
          : []
        : role === 'TOPIC'
          ? roles.topicPeople.map((p) => p.id)
          : (songLeaders.data ?? []).map((p) => p.id);

  const onSubmit =
    role === 'HOST'
      ? roles.assignHost
      : role === 'TESTIMONY'
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
      multiple={role !== 'HOST' && role !== 'TESTIMONY'}
      onSubmit={onSubmit}
      saving={roles.saving}
    />
  );
}
