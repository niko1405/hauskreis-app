'use client';

/**
 * „Termine" — vier Sichten: Liste, Mehrwochen-Planung, Kalender, Geburtstage.
 * Alles außer der Liste wird erst geladen, wenn man es auswählt.
 *
 * **Gesucht wird in einem eigenen Modus**, wie im Archiv: In Ruhe steht nur
 * eine Lupe neben dem Umschalter, ein Tipp darauf holt das Feld nach oben,
 * klappt Kopf und Register ein und schickt die Kopfleiste weg. Ein Suchfeld,
 * das immer dasteht, nahm einer Liste Platz, in der man meistens nur den
 * nächsten Dienstag sucht.
 */
import { CalendarCheck, CalendarClock, Plus, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { PageHeader } from '@/components/layout/app-shell';
import { suppressHeader } from '@/components/layout/header-suppress';
import { MeetingCard } from '@/components/domain/meeting-card';
import { Button, IconButton, PRESSABLE } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { BirthdayCard } from '@/features/birthdays/birthday-card';
import {
  useBirthdays,
  useMeetingList,
  usePrefetchMeeting,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { useBlurOnTouchMove } from '@/lib/use-blur-on-touch-move';
import type { BirthdayOccasion, MeetingListItem } from '@/lib/api/types';

const AssignmentTable = dynamic(
  () => import('./assignment-table').then((m) => m.AssignmentTable),
  { loading: () => <CardSkeleton /> },
);
const BirthdaysScreen = dynamic(
  () =>
    import('@/features/birthdays/birthdays-screen').then(
      (m) => m.BirthdaysScreen,
    ),
  { loading: () => <CardSkeleton /> },
);

const MeetingCalendar = dynamic(
  () => import('./meeting-calendar').then((m) => m.MeetingCalendar),
  { loading: () => <CardSkeleton /> },
);
// `loading: () => null` ist die eigene Suspense-Grenze des Sheets — ohne sie
// zeigte beim ersten Öffnen die Liste dahinter ihre Skeletons (siehe
// `meeting-detail-screen.tsx`).
const CreateMeetingSheet = dynamic(
  () => import('./create-meeting-sheet').then((m) => m.CreateMeetingSheet),
  { loading: () => null },
);

type View = 'liste' | 'planung' | 'kalender' | 'geburtstage';

const VIEWS: { key: View; label: string }[] = [
  { key: 'liste', label: 'Liste' },
  { key: 'planung', label: 'Planung' },
  { key: 'kalender', label: 'Kalender' },
  // Zuletzt, weil man hierher gezielt kommt und nicht beim Durchblättern: Wer
  // „Termine" öffnet, sucht meistens einen Abend.
  { key: 'geburtstage', label: 'Geburtstage' },
];

/**
 * Ob die Adresse ein bestimmtes Register meint.
 *
 * Nur beim ersten Rendern gelesen — gebraucht für den Weg von außen (eine
 * Benachrichtigung) und für den Weg **zurück**: Das gewählte Register schreibt
 * `selectView` in die Adresse, also kommt man von einem Geburtstag dorthin
 * zurück, wo man ihn angetippt hat — Liste oder Register.
 */
function initialView(tab: string | null): View {
  return VIEWS.some((view) => view.key === tab) ? (tab as View) : 'liste';
}

/** Die Feder, mit der der Kopf ein- und ausklappt — dieselbe wie im Archiv. */
const HEAD_SPRING = { type: 'spring', damping: 30, stiffness: 260 } as const;

export function MeetingsScreen() {
  const tab = useSearchParams().get('tab');
  const [view, setView] = useState<View>(() => initialView(tab));
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  // Wer sucht, will oben das Feld sehen und nicht Glocke und Gruppe darüber.
  useEffect(() => {
    if (!searching) return;
    return suppressHeader();
  }, [searching]);

  useBlurOnTouchMove(searching);

  /**
   * In den Suchmodus — **mit der Tastatur im selben Tipp**.
   *
   * iOS öffnet sie nur, wenn der Fokus noch in der Geste gesetzt wird. Also
   * synchron: `flushSync` zeichnet das Feld, und es steht dann schon oben —
   * es ist das erste Element der Seite, und gescrollt wird vorher nach ganz
   * oben. Ein Feld, das schon oben liegt, verschiebt iOS beim Fokussieren
   * nicht. Das Hilfsfeld aus dem Archiv braucht es deshalb hier nicht: Dort
   * steht das Feld in Ruhe unter dem Kopf und muss erst hinauf.
   */
  const enterSearch = () => {
    flushSync(() => setSearching(true));
    window.scrollTo({ top: 0 });
    field.current?.focus({ preventScroll: true });
  };

  // Abbrechen heißt auch: Der Begriff ist weg. Ein Filter, der danach weiter
  // wirkt, sähe aus wie eine Liste, in der Termine fehlen.
  const leaveSearch = () => {
    setSearch('');
    setSearching(false);
    field.current?.blur();
    window.scrollTo({ top: 0 });
  };

  // Escape beendet den Modus, Enter nur die Eingabe — gesucht wird ohnehin
  // schon beim Tippen.
  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') leaveSearch();
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  /**
   * Das Register wechseln — und es in die Adresse schreiben, **ohne** einen
   * Eintrag in der Historie.
   *
   * Ohne die Adresse fiel jeder Rückweg auf die Liste zurück, und der
   * Geburtstag führte deshalb fest ins Register „Geburtstage", auch wer aus
   * der Liste kam. `replaceState` und nicht `push`: Das Register ist eine
   * Ansicht und kein Ort — wer viermal umschaltet, soll mit „zurück" nicht
   * viermal auf derselben Seite landen. Next gleicht den nativen Aufruf mit
   * seinem Router ab.
   */
  const selectView = (key: View) => {
    setView(key);
    window.history.replaceState(
      null,
      '',
      key === 'liste' ? '/termine' : `/termine?tab=${key}`,
    );
  };

  return (
    <div>
      {/* Das Feld steht **vor** dem Kopf und nicht an seiner Stelle: So ist es
          vom ersten Bild an oben, während der Kopf darunter einklappt
          (`enterSearch`). Es klebt, damit es beim Scrollen durch die Treffer
          stehen bleibt. */}
      <AnimatePresence initial={false}>
        {searching && (
          <motion.div
            key="search"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="sticky top-0 z-30 flex items-center bg-canvas px-5 pt-safe-4 pb-3"
          >
            <div className="relative flex-1">
              <Search
                size={15}
                className="absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-300"
              />
              <TextInput
                ref={field}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={onSearchKey}
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Termine durchsuchen …"
                className="pl-9"
                aria-label="Termine durchsuchen"
              />
            </div>
            <button
              type="button"
              onClick={leaveSearch}
              className={cn(
                'pl-3 text-sm font-semibold whitespace-nowrap text-terracotta-600',
                PRESSABLE,
              )}
            >
              Abbrechen
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Höhe statt Verschiebung, wie im Archiv: Ein `transform` am
          Seiteninhalt würde zum Bezugsrahmen der `fixed`-Sheets darin. */}
      <motion.div
        initial={false}
        animate={
          searching ? { height: 0, opacity: 0 } : { height: 'auto', opacity: 1 }
        }
        transition={HEAD_SPRING}
        inert={searching}
        aria-hidden={searching}
        className="overflow-hidden"
      >
        <PageHeader
          title="Termine"
          action={
            <IconButton
              label="Termin anlegen"
              onClick={() => setCreating(true)}
              className="bg-terracotta-500 text-white hover:bg-terracotta-700 hover:text-white"
            >
              <Plus size={18} />
            </IconButton>
          }
        />

        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-4">
          {VIEWS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => selectView(key)}
              aria-pressed={view === key}
              className={cn(
                'shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold transition-colors',
                PRESSABLE,
                view === key
                  ? 'border-terracotta-500 bg-terracotta-500 text-white'
                  : 'border-line bg-card text-stone-500 hover:border-line-strong',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </motion.div>

      <div className="px-5">
        {view === 'liste' && (
          <MeetingListView
            search={search}
            searching={searching}
            onSearch={enterSearch}
          />
        )}
        {view === 'planung' && <AssignmentTable />}
        {view === 'kalender' && <MeetingCalendar />}
        {view === 'geburtstage' && <BirthdaysScreen />}
      </div>

      {creating && (
        <CreateMeetingSheet
          open={creating}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

/**
 * Ein Eintrag in der Liste — ein Abend oder ein Geburtstag.
 *
 * Ein ausgezeichneter Verbund statt zweier Listen untereinander: Beides steht
 * chronologisch, und „was kommt als nächstes" ist eine Frage, die man nicht
 * zweimal stellen will.
 */
type ListEntry =
  | { kind: 'meeting'; date: string; meeting: MeetingListItem }
  | { kind: 'birthday'; date: string; occasion: BirthdayOccasion };

function MeetingListView({
  search,
  searching,
  onSearch,
}: {
  search: string;
  searching: boolean;
  onSearch: () => void;
}) {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const deferredSearch = useDeferredValue(search);

  const query = useMeetingList({
    scope,
    search: deferredSearch.trim() || undefined,
  });
  const prefetch = usePrefetchMeeting();
  const birthdays = useBirthdays();

  /**
   * Termine und Geburtstage in einer Liste, nach Datum.
   *
   * **Nur so weit, wie Termine geladen sind.** Der letzte geladene Abend ist
   * die Grenze — sonst hingen unten fünf Geburtstage im Leeren, für Wochen,
   * die noch gar nicht geplant sind. Wer „Mehr laden" drückt, schiebt die
   * Grenze mit, und die Geburtstage rücken nach.
   *
   * Keine bei „Vergangene" und keine bei aktiver Suche: Dort sucht man einen
   * Abend, und ein Geburtstag dazwischen wäre ein Treffer, den niemand gesucht
   * hat.
   */
  const entries = useMemo<ListEntry[]>(() => {
    const meetings: ListEntry[] = query.items.map((meeting) => ({
      kind: 'meeting',
      date: meeting.date,
      meeting,
    }));

    const horizon = query.items.at(-1)?.date;
    if (scope !== 'upcoming' || deferredSearch.trim() || !horizon) {
      return meetings;
    }

    const occasions: ListEntry[] = (birthdays.data?.upcoming ?? [])
      .filter((occasion) => occasion.occursOn <= horizon)
      .map((occasion) => ({
        kind: 'birthday',
        date: occasion.occursOn,
        occasion,
      }));

    return [...meetings, ...occasions].toSorted((a, b) =>
      a.date.localeCompare(b.date),
    );
  }, [query.items, birthdays.data, scope, deferredSearch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {/* Das Wort zum Umschalter daneben: Der trägt nur Symbole, und die Zeile
            sagt so auch beim Suchen, worin gerade gesucht wird. */}
        <p className="min-w-0 flex-1 truncate px-1 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
          {scope === 'upcoming' ? 'Kommende' : 'Vergangene'}
        </p>
        {/* Zwei Symbole statt eines Worts: So stehen beide Richtungen da — die
            Uhr für „steht noch an", der Haken für „war schon" —, und die
            gewählte ist hervorgehoben. */}
        <Segmented
          iconOnly
          label="Welche Termine"
          value={scope}
          onChange={setScope}
          options={[
            {
              value: 'upcoming',
              label: 'Kommende Termine',
              icon: <CalendarClock size={16} />,
            },
            {
              value: 'past',
              label: 'Vergangene Termine',
              icon: <CalendarCheck size={16} />,
            },
          ]}
        />
        {!searching && (
          <IconButton
            label="Termine durchsuchen"
            onClick={onSearch}
            className="border border-line bg-card"
          >
            <Search size={16} />
          </IconButton>
        )}
      </div>

      {query.isLoading && (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {query.error && (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      )}

      {!query.isLoading && query.items.length === 0 && (
        <EmptyState
          title={
            deferredSearch
              ? 'Nichts gefunden'
              : scope === 'upcoming'
                ? 'Keine kommenden Termine'
                : 'Noch keine vergangenen Termine'
          }
          hint={
            scope === 'upcoming'
              ? 'Die wöchentlichen Abende werden automatisch angelegt — du kannst auch hier einen eigenen anlegen.'
              : undefined
          }
        />
      )}

      <ul className="space-y-3">
        {entries.map((entry) =>
          entry.kind === 'meeting' ? (
            <li key={entry.meeting.id}>
              <MeetingCard meeting={entry.meeting} onPrefetch={prefetch} />
            </li>
          ) : (
            <li key={entry.occasion.id}>
              <BirthdayCard occasion={entry.occasion} />
            </li>
          ),
        )}
      </ul>

      {query.hasNextPage && (
        <Button
          variant="secondary"
          className="w-full"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Mehr laden ({query.items.length} von {query.total})
        </Button>
      )}
    </div>
  );
}
