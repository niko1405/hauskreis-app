'use client';

/**
 * Die Personen-Auswahl: Vorschläge oben, der Rest des Rankings darunter,
 * „niemand" ganz unten.
 *
 * Der Rumpf ohne Hülle. `AssignmentSheet` steckt ihn in ein `Sheet`, das
 * Auswahl-Sheet beim Thema zeigt ihn als einen seiner Schritte — dort ginge ein
 * eigenes Sheet nicht: `Sheet` rendert ohne Portal auf derselben Ebene und
 * registriert je einen eigenen Escape-Handler, gestapelt schließen sie sich
 * gegenseitig.
 *
 * Die App teilt niemanden zwangsweise ein — sie schlägt vor und begründet,
 * eingetragen wird von Hand (CLAUDE.md §4). Deshalb ist auch „Niemand (leer
 * lassen)" eine gleichberechtigte Option und kein Zurücksetzen.
 *
 * **Warum „Restliche" und nicht „Alle Personen":** der Endpunkt bewertet ohnehin
 * *jede* in Frage kommende Person und liefert die Fakten mit. Darunter noch eine
 * alphabetische Namensliste zu stellen hieß, ab Platz vier die Begründung
 * wegzuwerfen — und wer nicht den ersten Vorschlag nimmt, ist genau die Person,
 * die eine Begründung braucht.
 *
 * Wer im Ranking gar nicht auftaucht, steht trotzdem unten: bei Musik jemand
 * ohne Instrument, beim Thema jemand, der an dem Tag weg ist. Beim Host ist die
 * Liste dagegen vollständig — ohne eigene Adresse geht es nicht, und der Server
 * lehnt es auch ab.
 */
import { Guitar, X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import {
  useHostSuggestions,
  usePeople,
  useSongLeaderSuggestions,
  useTestimonySuggestions,
  useTopicSuggestions,
} from '@/lib/api/hooks';
import type {
  AssignmentRole,
  HostSuggestion,
  RoleSuggestion,
} from '@/lib/api/types';
import { SuggestionRow } from './suggestion-row';

export type AssignmentKind = Exclude<AssignmentRole, 'PRAYER_BUDDY'>;

/**
 * Warum jemand nicht bewertet wurde. Steht da, damit ein fehlender Name nicht
 * wie ein Fehler aussieht — und damit klar ist, dass er trotzdem geht.
 */
const UNRANKED_HINT: Record<AssignmentKind, string> = {
  HOST: '',
  TOPIC:
    'Wer an dem Abend abwesend ist, taucht oben nicht auf — eintragen lässt sich trotzdem, etwa wenn jemand vorbereitet und nur selbst nicht kommt.',
  SONG: 'Vorgeschlagen wird nur, wer ein Instrument spielt. Eintragen kann man jede:n — die Gruppe weiß besser, wer den Abend trägt.',
  TESTIMONY:
    'Wer an dem Abend abwesend ist, taucht oben nicht auf. Eintragen lässt sich trotzdem jede:r — eine Geschichte hat schließlich jede:r.',
};

export function AssignmentPicker({
  kind,
  meetingId,
  active,
  selectedIds,
  withoutSuggestions = false,
  onToggle,
  onClear,
}: {
  kind: AssignmentKind;
  meetingId: string;
  /** Ob geladen werden soll — die Auswahl steht oft hinter einem Schalter. */
  active: boolean;
  selectedIds: string[];
  withoutSuggestions?: boolean;
  onToggle: (personId: string) => void;
  /**
   * „Niemand (leer lassen)". Fehlt er, bleibt der Knopf weg — im Ort-Sheet
   * steht „noch offen" einmal unter beiden Registern, weil es dort dasselbe
   * heißt: kein Gastgeber *und* kein Treffpunkt.
   */
  onClear?: () => void;
}) {
  const people = usePeople();
  const suggestions = useSuggestions(
    kind,
    meetingId,
    active && !withoutSuggestions,
  );

  const ranked = suggestions.data ?? [];
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  /**
   * Wer unter der Rangliste steht.
   *
   * Bei einem vergangenen Abend gibt es keine Rangliste, dann sind es alle.
   * Beim Host ist es niemand: die Rangliste **ist** dort die vollständige Menge
   * der gültigen Antworten. Bei Thema und Musik gibt es welche, weil der
   * Endpunkt nach Instrument filtert und Abwesende weglässt; eintragen darf die
   * Gruppe trotzdem, worauf sie sich geeinigt hat.
   *
   * **Eingeladene stehen hier nicht**, auch nicht beim Nachtragen. Der Server
   * lehnt sie ab — eine offene Einladung ist niemand, dem man einen Abend
   * anvertrauen kann —, und ein Name, der ausnahmslos in einer Fehlermeldung
   * endet, ist eine Einladung ins Leere.
   */
  const assignable = (people.data ?? []).filter(
    (person) => person.acceptedAt !== null,
  );

  const rankedIds = new Set(ranked.map((s) => s.personId));
  const unranked = withoutSuggestions
    ? assignable
    : kind === 'HOST'
      ? []
      : assignable.filter((person) => !rankedIds.has(person.id));

  return (
    <>
      {withoutSuggestions ? (
        <p className="rounded-md border border-line bg-canvas px-4 py-3 text-xs leading-relaxed text-stone-500">
          Der Abend ist vorbei — hier wird nur nachgetragen, wer es war. Deshalb
          steht hier kein Vorschlag: die Frage „wer wäre als Nächstes dran"
          stellt sich rückwärts nicht.
        </p>
      ) : (
        <section>
          <h3 className="mb-3 text-[10px] font-bold tracking-widest text-terracotta-500 uppercase">
            Vorschläge
          </h3>

          {suggestions.isLoading && <CardSkeleton />}
          {suggestions.error && <ErrorState error={suggestions.error} />}

          <div className="space-y-3">
            {top.map((suggestion) => (
              <SuggestionRow
                key={suggestion.personId}
                suggestion={suggestion}
                selected={selectedIds.includes(suggestion.personId)}
                onSelect={() => onToggle(suggestion.personId)}
              />
            ))}
          </div>

          {suggestions.data?.length === 0 && (
            <p className="text-xs text-stone-400 italic">
              Gerade kein Vorschlag — such unten selbst jemanden aus.
            </p>
          )}
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <h3 className="mb-3 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
            Restliche
          </h3>
          <div className="space-y-2">
            {rest.map((suggestion) => (
              <SuggestionRow
                key={suggestion.personId}
                suggestion={suggestion}
                selected={selectedIds.includes(suggestion.personId)}
                onSelect={() => onToggle(suggestion.personId)}
                compact
              />
            ))}
          </div>
        </section>
      )}

      {unranked.length > 0 && (
        <section>
          <h3 className="mb-1 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
            {withoutSuggestions ? 'Alle Personen' : 'Nicht im Ranking'}
          </h3>
          {!withoutSuggestions && (
            <p className="mb-3 text-[11px] leading-relaxed text-stone-400">
              {UNRANKED_HINT[kind]}
            </p>
          )}
          <ul className="space-y-2">
            {unranked.map((person) => {
              const selected = selectedIds.includes(person.id);
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(person.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md border bg-card p-3.5 shadow-sm transition-colors',
                      selected ? 'border-terracotta-500' : 'border-transparent',
                      'hover:border-line-strong focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:outline-none',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Avatar person={person} size="sm" />
                      <span className="font-bold text-stone-800">
                        {person.name}
                      </span>
                      {person.playsInstrument && (
                        <Guitar
                          size={14}
                          className="text-music"
                          aria-label="spielt ein Instrument"
                        />
                      )}
                      {!person.active && (
                        <span className="text-[10px] text-stone-400">
                          inaktiv
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full border',
                        selected
                          ? 'border-terracotta-500 bg-terracotta-500'
                          : 'border-line-strong',
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="flex w-full items-center gap-4 rounded-md border-2 border-dashed border-terracotta-100 bg-terracotta-50/30 p-4 text-left transition-colors hover:bg-terracotta-50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-stone-400 shadow-sm">
            <X size={18} />
          </span>
          <span>
            <span className="block font-bold text-terracotta-700">
              Niemand (leer lassen)
            </span>
            <span className="block text-[11px] text-stone-400">
              Offen für die Gruppe — ein gültiger Zustand, kein Versäumnis
            </span>
          </span>
        </button>
      )}
    </>
  );
}

/** Je Rolle ein eigener Endpunkt; geladen wird nur, solange gefragt ist. */
function useSuggestions(
  kind: AssignmentKind,
  meetingId: string,
  active: boolean,
): {
  data: (RoleSuggestion | HostSuggestion)[] | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const host = useHostSuggestions(meetingId, active && kind === 'HOST');
  const topic = useTopicSuggestions(meetingId, active && kind === 'TOPIC');
  const song = useSongLeaderSuggestions(meetingId, active && kind === 'SONG');
  const testimony = useTestimonySuggestions(
    meetingId,
    active && kind === 'TESTIMONY',
  );

  if (kind === 'HOST') return host;
  if (kind === 'TOPIC') return topic;
  if (kind === 'TESTIMONY') return testimony;
  return song;
}
