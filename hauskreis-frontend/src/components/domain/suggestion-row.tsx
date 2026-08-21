'use client';

/**
 * Ein Vorschlag — mit den Fakten dahinter.
 *
 * Der Endpunkt liefert eine sortierte Liste **und** die Begründung: wann
 * jemand zuletzt dran war, wie oft schon, was noch ansteht. Ein Frontend, das
 * nur die Reihenfolge übernimmt und die Fakten wegwirft, gibt genau das auf,
 * wofür der Endpunkt gebaut ist (CLAUDE.md §4). Deshalb stehen sie hier
 * ausgeschrieben unter dem Namen, nicht als Tooltip.
 */
import { Check, Plane } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { formatDay, formatRelativeDay } from '@/lib/date';
import { cn } from '@/lib/cn';
import { ROLE_LABEL } from '@/lib/meeting';
import type {
  HostHomeFacts,
  HostSuggestion,
  RoleSuggestion,
} from '@/lib/api/types';

type AnySuggestion = RoleSuggestion | HostSuggestion;

function isHostSuggestion(s: AnySuggestion): s is HostSuggestion {
  return 'away' in s.facts;
}

const DEFERRED_REASON: Record<string, string> = {
  AWAY: 'ist in dem Zeitraum weg',
  TOO_SMALL: 'Wohnung zu klein für die erwartete Runde',
  HOUSEHOLD_BUSY: 'im Haushalt ist schon jemand anders dran',
};

/** Die Fakten als kurze Sätze, in der Reihenfolge ihrer Wichtigkeit. */
export function suggestionFacts(suggestion: AnySuggestion): string[] {
  const facts = suggestion.facts;
  const lines: string[] = [];

  if (facts.lastAssignedAt) {
    lines.push(`zuletzt ${formatRelativeDay(facts.lastAssignedAt)}`);
  } else {
    lines.push('war noch nie dran');
  }

  if (facts.timesAssigned > 0) {
    lines.push(`${facts.timesAssigned}× insgesamt`);
  }

  for (const commitment of facts.upcomingCommitments.slice(0, 2)) {
    lines.push(
      `hat am ${formatDay(commitment.date)} schon ${ROLE_LABEL[commitment.role]}`,
    );
  }

  if (isHostSuggestion(suggestion)) {
    const home = suggestion.facts.home;

    const share = shareLine(home);
    if (share) lines.push(share);

    // Nur wenn die Größe überhaupt eine Frage aufwirft. Bisher stand die Zeile
    // an jedem Zuhause mit gesetzter Kapazität — auch bei „Platz für 12,
    // erwartet werden 7", wo sie zwei Zahlen nennt und nichts sagt.
    if (
      home.capacity !== null &&
      home.capacity < home.groupSize &&
      home.expectedAttendance !== null
    ) {
      lines.push(
        `Platz für ${home.capacity}, erwartet werden ${home.expectedAttendance}`,
      );
    }
  }

  return lines;
}

/**
 * Wie dieses Zuhause zu seinem Anteil steht.
 *
 * Hier standen zwei gerundete Prozentwerte nebeneinander („0 statt 25 % der
 * Abende"), und niemand konnte sagen, was davon gut ist. Jetzt zuerst das
 * Urteil, dahinter die Zahlen — und die sind **Abende**, keine Anteile.
 *
 * Das Urteil kommt aus `credit`, weil die Rangfolge daraus entsteht: Zwei
 * Größen für dieselbe Aussage liefen früher oder später auseinander, und dann
 * stünde „öfter als üblich" über dem obersten Vorschlag. Gedruckt wird die Zahl
 * trotzdem nicht — sie ist auf ±1,5 gedeckelt (`MAX_CREDIT_MEETINGS`) und wäre
 * als „1,5 Abende im Rückstand" eine Aussage über eine Länge, die sie gar nicht
 * misst.
 */
function shareLine(home: HostHomeFacts): string | null {
  // Ohne Historie gibt es nichts zu vergleichen. Dass hier noch nie jemand war,
  // steht schon in der ersten Zeile („war noch nie dran").
  if (home.meetingsCounted === 0) return null;

  const zahlen = `${home.timesUsed} von ${home.meetingsCounted} Abenden`;
  const üblich = Math.round(home.expectedShare * home.meetingsCounted);

  // Eine halbe Runde: ungestört bleibt das Guthaben unter ±0,8, der Deckel
  // liegt bei ±1,5 — dazwischen ist „merklich daneben" und alles darunter
  // Rauschen, über das man kein Urteil fällen sollte.
  if (home.credit >= 0.5) {
    return `${home.locationName}: seltener dran als üblich (${zahlen}, üblich wären ${üblich})`;
  }

  if (home.credit <= -0.5) {
    return `${home.locationName}: öfter dran als üblich (${zahlen}, üblich wären ${üblich})`;
  }

  return `${home.locationName}: ${zahlen}`;
}

export function SuggestionRow({
  suggestion,
  selected,
  onSelect,
  compact = false,
}: {
  suggestion: AnySuggestion;
  selected: boolean;
  onSelect: () => void;
  /**
   * Für alles unterhalb der Spitze: dieselbe Zeile, nur knapper.
   *
   * Die Fakten bleiben — sie sind der Grund, warum es diesen Endpunkt gibt —
   * aber nach dem dritten Vorschlag liest niemand mehr fünf Zeilen pro Person.
   * Die ersten beiden sind die, nach denen sortiert wurde.
   */
  compact?: boolean;
}) {
  const host = isHostSuggestion(suggestion) ? suggestion : null;
  const deferred = host?.facts.deferred ?? false;
  const away = host?.facts.away ?? false;
  const facts = suggestionFacts(suggestion);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start justify-between gap-3 rounded-lg border bg-card text-left shadow-sm transition-colors',
        compact ? 'p-3' : 'p-4',
        selected ? 'border-2 border-terracotta-500' : 'border-line',
        deferred && 'opacity-60',
        'hover:border-terracotta-400 focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Avatar
          person={{
            id: suggestion.personId,
            name: suggestion.name,
            photoUpdatedAt: suggestion.photoUpdatedAt,
          }}
          size={compact ? 'sm' : 'md'}
        />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-bold text-stone-800">
            {suggestion.name}
            {away && (
              <span
                title="ist in dem Zeitraum abwesend"
                className="text-stone-400"
                aria-label="abwesend"
              >
                <Plane size={13} />
              </span>
            )}
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {(compact ? facts.slice(0, 2) : facts).map((fact) => (
              <li
                key={fact}
                className="text-[11px] leading-snug text-stone-500"
              >
                {fact}
              </li>
            ))}
          </ul>
          {deferred && host?.facts.deferredReason && (
            <p className="mt-1 text-[11px] font-semibold text-topic">
              Zurückgestellt: {DEFERRED_REASON[host.facts.deferredReason]}
            </p>
          )}
        </div>
      </div>

      <span
        className={cn(
          'mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected
            ? 'border-terracotta-500 bg-terracotta-500 text-white'
            : 'border-line-strong',
        )}
      >
        {selected && <Check size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}
