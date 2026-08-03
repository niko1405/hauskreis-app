'use client';

/**
 * Die Mehrwochen-Planung (CLAUDE.md §9).
 *
 * Quelle ist `…/assignments` **ohne** `personId` — dieselbe Route, aus der
 * auch die eigenen Badges kommen, damit die zwei Ansichten nicht
 * unterschiedlicher Meinung sein können, wer dran ist.
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
 */
import { Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { useAssignments, useMeeting, useSongLeaders } from '@/lib/api/hooks';
import { addDays, formatDay, formatRelativeDay, today } from '@/lib/date';
import { ROLE_LABEL } from '@/lib/meeting';
import { cn } from '@/lib/cn';
import type { Assignment, AssignmentRole } from '@/lib/api/types';
import { useRoleAssignment } from './detail/use-role-assignment';

const AssignmentSheet = dynamic(() =>
  import('@/components/domain/assignment-sheet').then((m) => m.AssignmentSheet),
);

type Column = Exclude<AssignmentRole, 'PRAYER_BUDDY'>;

const COLUMNS: Column[] = ['HOST', 'TOPIC', 'SONG'];

/**
 * Drei Stufen reichen: ganz, kleiner, klein. Ein stufenloser Regler wäre auf
 * dem Telefon schwerer zu treffen als der Unterschied wert ist.
 */
const ZOOM_STEPS = [1, 0.85, 0.7] as const;

export function AssignmentTable({ weeks = 8 }: { weeks?: number }) {
  const from = today();
  const to = addDays(from, weeks * 7);
  const query = useAssignments({ from, to });

  const [zoom, setZoom] = useState(0);
  const [editing, setEditing] = useState<{
    meetingId: string;
    role: Column;
  } | null>(null);

  const rows = useMemo(
    () => groupByDate(query.data?.items ?? []),
    [query.data],
  );

  if (query.isLoading) return <CardSkeleton />;
  if (query.error) {
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Für die nächsten Wochen ist noch nichts eingeteilt"
        hint="Sobald jemand einen Host oder ein Thema einträgt, steht es hier."
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
                {COLUMNS.map((role) => (
                  <th
                    key={role}
                    className="px-3 pb-1 text-left text-[10px] font-bold tracking-widest text-stone-400 uppercase"
                  >
                    {ROLE_LABEL[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date} className="align-middle">
                  <td className="rounded-l-md border-y border-l border-line bg-card px-3 py-2.5">
                    {row.meetingId ? (
                      <Link
                        href={`/termine/${row.meetingId}`}
                        className="block hover:underline"
                      >
                        <DateLabel row={row} />
                      </Link>
                    ) : (
                      <DateLabel row={row} />
                    )}
                  </td>

                  {COLUMNS.map((role, index) => (
                    <td
                      key={role}
                      className={cn(
                        'border-y border-line bg-card p-1',
                        index === COLUMNS.length - 1 && 'rounded-r-md border-r',
                      )}
                    >
                      <Cell
                        people={(row.byRole.get(role) ?? []).map(
                          (a) => a.person,
                        )}
                        onEdit={
                          row.meetingId
                            ? () =>
                                setEditing({
                                  meetingId: row.meetingId as string,
                                  role,
                                })
                            : undefined
                        }
                        label={`${ROLE_LABEL[role]} am ${formatDay(row.date)}`}
                      />
                    </td>
                  ))}
                </tr>
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

function DateLabel({ row }: { row: Row }) {
  return (
    <>
      <span className="block text-sm font-bold text-stone-800">
        {formatDay(row.date)}
      </span>
      <span className="block text-[10px] text-stone-400">
        {formatRelativeDay(row.date)}
      </span>
    </>
  );
}

/**
 * Eine Zelle zeigt Avatare, keinen Namen — sonst passen drei Spalten auf
 * keinem Telefon nebeneinander. Der Name steht im `title` und im
 * Vorlese-Etikett, ist also mit Zeigegerät und mit Screenreader erreichbar.
 */
function Cell({
  people,
  onEdit,
  label,
}: {
  people: { id: string; name: string }[];
  onEdit?: () => void;
  label: string;
}) {
  const content =
    people.length === 0 ? (
      <span className="text-[11px] text-stone-300 italic">offen</span>
    ) : (
      <span className="flex items-center gap-1">
        {people.map((person) => (
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
      aria-label={`${label}: ${people.map((p) => p.name).join(', ') || 'offen'} — antippen zum Eintragen`}
      className="flex w-full items-center rounded-sm px-2 py-1.5 transition-colors hover:bg-terracotta-50 focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none"
    >
      {content}
    </button>
  );
}

/**
 * Lädt den Termin nach, den die Tabelle nicht hat.
 *
 * `useRoleAssignment` braucht den ganzen Termin (für `topicId`), die
 * Assignments-Route liefert nur Datum, Rolle und Person. Eine Anfrage beim
 * Antippen ist der ehrlichere Preis als alle Termine im Voraus zu laden, nur
 * für den Fall, dass jemand eine Zelle öffnet.
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
      : role === 'TOPIC'
        ? roles.topicPeople.map((p) => p.id)
        : (songLeaders.data ?? []).map((p) => p.id);

  const onSubmit =
    role === 'HOST'
      ? roles.assignHost
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
      multiple={role !== 'HOST'}
      onSubmit={onSubmit}
      saving={roles.saving}
    />
  );
}

interface Row {
  date: string;
  meetingId: string | null;
  byRole: Map<AssignmentRole, Assignment[]>;
}

/** Gebetsbuddy-Zeiträume gehören nicht in diese Tabelle — sie hängen an keinem Termin. */
function groupByDate(items: Assignment[]): Row[] {
  const map = new Map<string, Row>();

  for (const item of items) {
    if (item.role === 'PRAYER_BUDDY') continue;

    const existing = map.get(item.date) ?? {
      date: item.date,
      meetingId: item.meetingId,
      byRole: new Map<AssignmentRole, Assignment[]>(),
    };
    existing.meetingId ??= item.meetingId;
    existing.byRole.set(item.role, [
      ...(existing.byRole.get(item.role) ?? []),
      item,
    ]);
    map.set(item.date, existing);
  }

  return [...map.values()].toSorted((a, b) => a.date.localeCompare(b.date));
}
