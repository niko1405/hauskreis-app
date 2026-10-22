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
import { formatDayGap, formatDayShort } from '@/lib/date';
import { cn } from '@/lib/cn';
import { ROLE_LABEL } from '@/lib/meeting';
import type {
  HostHomeFacts,
  HostSuggestion,
  RoleSuggestion,
  UpcomingCommitment,
} from '@/lib/api/types';

type AnySuggestion = RoleSuggestion | HostSuggestion;

function isHostSuggestion(s: AnySuggestion): s is HostSuggestion {
  return 'away' in s.facts;
}

/**
 * Nur die zwei, die wirklich nicht gehen.
 *
 * Dass jemand an dem Abend schon etwas hat, ist kein solcher Grund: Das sagen
 * die Fakten in denselben Worten wie überall („an diesem Abend schon Thema");
 * im Ranking rutscht er dafür nach unten, aber zurückgestellt wird er nicht.
 */
const DEFERRED_REASON: Record<string, string> = {
  AWAY: 'ist in dem Zeitraum weg',
  TOO_SMALL: 'Wohnung zu klein für die erwartete Runde',
};

/**
 * Die Fakten als kurze Sätze — **in der Reihenfolge, in der sortiert wird.**
 *
 * In der knappen Fassung sind nur zwei Zeilen zu sehen, und dort muss das
 * **erste** Sortierkriterium stehen, das den Platz erklärt. Die Zeilen folgen
 * deshalb `compare` in `ranking.ts` — an diesem Abend, sonstige Auslastung,
 * zuletzt, wie oft.
 */
export function suggestionFacts(suggestion: AnySuggestion): string[] {
  const facts = suggestion.facts;
  const lines: string[] = [];

  // **Zuerst**, was an diesem Abend schon ansteht. Das ist der schärfste Grund,
  // jemanden nicht zu nehmen.
  const heute = facts.upcomingCommitments.filter((c) => c.thisEvening);
  const spaeter = facts.upcomingCommitments.filter((c) => !c.thisEvening);

  for (const commitment of heute) {
    lines.push(`an diesem Termin schon ${ROLE_LABEL[commitment.role]}`);
  }

  // Die übrige Auslastung als **eine** Zeile und nicht als eine je Dienst: Sie
  // ist ein Kriterium, und in der knappen Fassung verdrängten zwei Zeilen dafür
  // das nächste. Fehlt sie, steht hier nichts — „hat sonst nichts vor sich"
  // unter jedem zweiten Namen wäre eine Zeile, die man überliest.
  const load = loadLine(spaeter);
  if (load) lines.push(load);

  // **Gemessen am Abend, nicht an heute.** `formatRelativeDay` rechnet gegen
  // den heutigen Tag: Wer in vier Tagen die Musik macht, läse sich beim
  // Einteilen für einen Abend in vier Wochen als „zuletzt in vier Tagen" — ein
  // Dienst, der aus Sicht dieses Abends dreieinhalb Wochen zurückliegt. Den
  // Abstand rechnet der Server.
  if (facts.lastAssignedAt && facts.daysSinceLastAssignment !== null) {
    lines.push(
      `zuletzt ${formatDayGap(facts.daysSinceLastAssignment)} vor diesem Termin`,
    );
  } else {
    lines.push('war noch nie dran');
  }

  if (facts.timesAssigned > 0) {
    lines.push(`${facts.timesAssigned}× insgesamt`);
  }

  if (isHostSuggestion(suggestion)) {
    const home = suggestion.facts.home;

    const share = shareLine(home);
    if (share) lines.push(share);

    // Nur wenn die Größe überhaupt eine Frage aufwirft — „Platz für 12,
    // erwartet werden 7" nennt zwei Zahlen und sagt nichts.
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
 * „hat noch Musik (18. Aug.) und Host (25. Aug.) vor sich" — oder ab drei
 * Diensten die Zahl vorneweg, weil die dann mehr sagt als die Liste.
 */
function loadLine(commitments: UpcomingCommitment[]): string | null {
  if (commitments.length === 0) return null;

  const named = commitments
    .slice(0, 2)
    .map((c) => `${ROLE_LABEL[c.role]} (${formatDayShort(c.date)})`);

  if (commitments.length <= 2) {
    return `hat noch ${named.join(' und ')} vor sich`;
  }

  return `hat noch ${commitments.length} Aufgaben vor sich: ${named.join(', ')} …`;
}

/**
 * Wie dieses Zuhause zu seinem Anteil steht — **als Urteil, ohne Zahlen**.
 *
 * Unter einem Namen in einer Liste rechnet niemand nach — Prozentwerte oder
 * „3 von 14, üblich wären 5" wären eine Zeile zu viel. Es steht der Schluss
 * da.
 *
 * Er kommt aus `credit`, weil die Rangfolge daraus entsteht: Zwei Größen für
 * dieselbe Aussage liefen früher oder später auseinander, und dann stünde
 * „öfter als üblich" über dem obersten Vorschlag.
 */
function shareLine(home: HostHomeFacts): string | null {
  // Ohne Historie gibt es nichts zu vergleichen — ein Urteil wäre hier eine
  // Behauptung über nichts. Dass noch nie jemand dort war, steht ohnehin schon
  // in der Zeile darüber („war noch nie dran").
  if (home.meetingsCounted === 0) return null;

  // Eine halbe Runde: ungestört bleibt das Guthaben unter ±0,8, der Deckel
  // liegt bei ±1,5 — dazwischen ist „merklich daneben" und alles darunter
  // Rauschen, über das man kein Urteil fällen sollte. Im Soll steht gar nichts:
  // „genau richtig" ist keine Information, nach der man jemanden auswählt.
  if (home.credit >= 0.5) return `${home.locationName}: seltener als üblich`;
  if (home.credit <= -0.5) return `${home.locationName}: öfter als üblich`;

  return null;
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
        {/* Der Platz in der Rangfolge, als Zahl.

            Ohne ihn las sich die Rangliste wie eine Liste: dass die oberste
            Person die ist, die am ehesten dran wäre, stand nirgends — und ein
            Satz, der es erklärt, wäre eine Zeile, die man einmal liest und
            danach überspringt. Die Ziffern laufen bewusst über beide
            Abschnitte durch (`rank` kommt vom Server), damit auch „Restliche"
            als das erkennbar bleibt, was sie sind: Plätze weiter unten. Für
            die Zahl selbst reicht eine schmale Spalte — ein Abzeichen wäre so
            groß wie die Aussage nicht ist. */}
        <span
          aria-hidden
          className={cn(
            'mt-0.5 w-4 shrink-0 text-center font-serif font-bold tabular-nums',
            compact ? 'text-xs' : 'text-sm',
            suggestion.rank === 1 ? 'text-terracotta-500' : 'text-stone-300',
          )}
        >
          {suggestion.rank}
        </span>
        <Avatar
          zoomable={false}
          person={{
            id: suggestion.personId,
            name: suggestion.name,
            photoUpdatedAt: suggestion.photoUpdatedAt,
          }}
          size={compact ? 'sm' : 'md'}
        />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-bold text-stone-800">
            {/* Ein farbloser Zähler ist für den Screenreader nichts. Hier
                steht, was die Ziffer daneben meint. */}
            <span className="sr-only">Platz {suggestion.rank}:</span>
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
            <p className="mt-1 text-[11px] font-semibold text-warn">
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
