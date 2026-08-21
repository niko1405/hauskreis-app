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
 * **Unten steht nur, wen der Server auch annähme.** Das war einmal weiter
 * gefasst und darum falsch: Wer für den Abend abgesagt hatte, fiel aus dem
 * Ranking und tauchte darunter wieder auf — mit dem Hinweis, eintragen ginge
 * trotzdem. Ging es nicht; `assertAvailable` lehnt genau das ab. Beim Host fiel
 * es nie auf, weil es dort gar keine Liste darunter gibt.
 *
 * Übrig bleibt der eine Grund, der wirklich nur ein Vorschlags-Filter ist: **bei
 * Musik, wer kein Instrument spielt.** Die Gruppe darf eintragen, worauf sie
 * sich geeinigt hat, und `setLeaders` fragt nicht nach Instrumenten. Bei Thema
 * und Testimony bleibt danach niemand übrig — dort ist jede:r bewertet, der an
 * dem Abend kann —, und der Abschnitt verschwindet von selbst.
 */
import { X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { CardSkeleton, ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import {
  useHostSuggestions,
  useMeeting,
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

/**
 * Die Rollen, die ein Mensch an einem Abend einträgt.
 *
 * Gebetsbuddys und Geschenke stehen bewusst nicht dabei: Beide teilt der
 * Server zu — die einen gewürfelt, die anderen der Reihe nach —, und beide
 * hängen an keinem Termin. Ein Sheet „wer besorgt das Geschenk" gibt es
 * deshalb nicht; die Zuteilung ändert man in der Verwaltung, nicht hier.
 */
export type AssignmentKind = Exclude<
  AssignmentRole,
  'PRAYER_BUDDY' | 'BIRTHDAY_GIFT'
>;

/**
 * Warum jemand nicht bewertet wurde. Steht da, damit ein fehlender Name nicht
 * wie ein Fehler aussieht — und damit klar ist, dass er trotzdem geht.
 */
const UNRANKED_HINT: Record<AssignmentKind, string> = {
  HOST: '',
  TOPIC: '',
  SONG: 'Vorgeschlagen wird nur, wer ein Instrument spielt. Eintragen kann man jede:n — die Gruppe weiß besser, wer den Abend trägt.',
  TESTIMONY: '',
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
  const meeting = useMeeting(meetingId);
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
   * der gültigen Antworten. Bei der Musik ist es, wer kein Instrument spielt —
   * eintragen darf die Gruppe trotzdem, worauf sie sich geeinigt hat. Bei Thema
   * und Testimony bleibt niemand übrig, und der Abschnitt fällt weg.
   *
   * **Eingeladene stehen hier nicht**, auch nicht beim Nachtragen. Der Server
   * lehnt sie ab — eine offene Einladung ist niemand, dem man einen Abend
   * anvertrauen kann —, und ein Name, der ausnahmslos in einer Fehlermeldung
   * endet, ist eine Einladung ins Leere.
   */
  const assignable = (people.data ?? []).filter(
    (person) => person.acceptedAt !== null,
  );

  /**
   * Wer für diesen Abend abgesagt hat.
   *
   * Aus dem Termin, der auf dieser Seite ohnehin schon geladen ist — eine
   * eigene Abfrage bekäme dieselbe Antwort. Der Server rechnet daneben noch die
   * Abwesenheitszeiträume dazu; die schreibt `AbsenceSyncService` aber in genau
   * diese Zeilen um, es bleibt also höchstens das schmale Fenster zwischen
   * einem frisch erzeugten Termin und dem nächsten Abgleich.
   */
  const abgesagt = new Set(
    (meeting.data?.data.attendances ?? [])
      .filter((row) => row.status === 'ABSENT')
      .map((row) => row.personId),
  );

  const rankedIds = new Set(ranked.map((s) => s.personId));

  const unranked = withoutSuggestions
    ? // Ein vergangener Abend: hier wird nachgetragen, was war. Der Server
      // prüft die Anwesenheit dann auch nicht mehr, also stehen alle da — wer
      // damals absagte, kann trotzdem gehostet haben.
      assignable
    : kind === 'HOST'
      ? []
      : assignable.filter(
          (person) =>
            !rankedIds.has(person.id) &&
            !abgesagt.has(person.id) &&
            // Der einzige Grund, der bleibt: ein Vorschlags-Filter und keine
            // Regel. Alles andere, was jemanden aus dem Ranking hält, hält ihn
            // auch aus der Zuteilung.
            (kind === 'SONG' ? !person.playsInstrument : true),
        );

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
          {/* Nur wo es etwas zu erklären gibt — bei Musik. Sonst stand hier
              ein leerer Absatz mit Abstand darüber und darunter. */}
          {!withoutSuggestions && UNRANKED_HINT[kind] && (
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
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar person={person} size="sm" />
                      <span className="min-w-0 text-left">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-bold text-stone-800">
                            {person.name}
                          </span>
                          {!person.active && (
                            <span className="shrink-0 text-[10px] text-stone-400">
                              inaktiv
                            </span>
                          )}
                        </span>
                        {/* Warum diese Person nicht bewertet wurde — als Satz
                            und nicht als Symbol. Hier hing eine Gitarre an
                            allen, die eins spielen, in **jeder** Rolle: beim
                            Thema war sie nur ein Rätsel, und bei der Musik
                            markierte sie ausgerechnet die Falschen, denn oben
                            steht ja, wer spielt. */}
                        {kind === 'SONG' && !person.playsInstrument && (
                          <span className="block text-[11px] leading-snug text-stone-400">
                            spielt kein Instrument
                          </span>
                        )}
                      </span>
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
