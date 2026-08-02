'use client';

/**
 * Die Mehrwochen-Planung (CLAUDE.md §9).
 *
 * Quelle ist `…/assignments` **ohne** `personId` — dieselbe Route, aus der
 * auch die eigenen Badges kommen, damit die zwei Ansichten nicht
 * unterschiedlicher Meinung sein können, wer dran ist.
 *
 * Auf dem Telefon ist das keine Tabelle: fünf Spalten auf 390 px sind
 * unlesbar. Stattdessen eine Zeile je Termin mit Rollen-Chips; ab `md` wird
 * daraus ein echtes Raster mit Spaltenköpfen.
 */
import Link from 'next/link';
import { useMemo } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { useAssignments } from '@/lib/api/hooks';
import { addDays, formatDay, formatRelativeDay, today } from '@/lib/date';
import { ROLE_LABEL } from '@/lib/meeting';
import type { Assignment, AssignmentRole } from '@/lib/api/types';

const COLUMNS: AssignmentRole[] = ['HOST', 'TOPIC', 'SONG'];

export function AssignmentTable({ weeks = 8 }: { weeks?: number }) {
  const from = today();
  const to = addDays(from, weeks * 7);
  const query = useAssignments({ from, to });

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

  return (
    <div className="space-y-3">
      <div className="hidden gap-3 px-4 md:grid md:grid-cols-[10rem_repeat(3,1fr)]">
        <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">
          Termin
        </span>
        {COLUMNS.map((role) => (
          <span
            key={role}
            className="text-[10px] font-bold tracking-widest text-stone-400 uppercase"
          >
            {ROLE_LABEL[role]}
          </span>
        ))}
      </div>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.date}>
            <Row row={row} />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Row {
  date: string;
  meetingId: string | null;
  byRole: Map<AssignmentRole, Assignment[]>;
}

function Row({ row }: { row: Row }) {
  const inner = (
    <div className="grid gap-2 md:grid-cols-[10rem_repeat(3,1fr)] md:items-center md:gap-3">
      <div>
        <span className="text-sm font-bold text-stone-800">
          {formatDay(row.date)}
        </span>
        <span className="ml-2 text-[11px] text-stone-400">
          {formatRelativeDay(row.date)}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 md:contents">
        {COLUMNS.map((role) => {
          const people = (row.byRole.get(role) ?? []).map((a) => a.person);
          return (
            <div key={role} className="flex items-center gap-1.5">
              {people.length === 0 ? (
                <span className="text-[11px] text-stone-300 italic">
                  <span className="md:hidden">{ROLE_LABEL[role]}: </span>offen
                </span>
              ) : (
                people.map((person) => (
                  <span
                    key={person.id}
                    className="flex items-center gap-1.5 rounded-full bg-stone-50 py-0.5 pr-2.5 pl-0.5"
                  >
                    <Avatar person={person} size="xs" />
                    <span className="text-[11px] font-semibold text-stone-700">
                      {person.name}
                    </span>
                  </span>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const className =
    'block rounded-md border border-line bg-card p-3 transition-colors hover:border-line-strong';

  return row.meetingId ? (
    <Link href={`/termine/${row.meetingId}`} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
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
