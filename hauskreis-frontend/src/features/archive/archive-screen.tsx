'use client';

/**
 * „Archiv" — vergangene Termine, abgeschlossene Themen und die
 * Song-Datenbank. Gesucht wird serverseitig (`search`), sonst müsste die App
 * mit der Zeit alles laden, nur um clientseitig zu filtern.
 */
import {
  ArrowLeft,
  ChevronRight,
  FileMusic,
  FileText,
  Layers,
  Lock,
  Music,
  Plus,
  Search,
} from 'lucide-react';
import Link from '@/components/ui/link';
import { AnimatePresence, animate, motion } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { suppressHeader } from '@/components/layout/header-suppress';
import { FloatingAction } from '@/components/layout/floating-action';
import { AvatarStack } from '@/components/ui/avatar';
import { Button, PRESSABLE } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import {
  CardSkeleton,
  EmptyState,
  ErrorState,
  LoadMore,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { NewSongSheet } from '@/features/songs/new-song-sheet';
import { LocationSheet } from '@/components/domain/location-sheet';
import { ListTab } from './list-tab';
import { LocationsCard, type PlaceScope } from './locations-card';
import { MeetingsArchive } from './meetings-archive';
import { NewNoteSheet } from '@/features/notes/new-note-sheet';
import { NotesArchive } from '@/features/notes/notes-list';
import { errorMessage } from '@/lib/api/errors';
import {
  useArchiveSummary,
  useCreateStandaloneSession,
  useCreateTopic,
  useSongList,
  useTopicList,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDay } from '@/lib/date';
import { useOwnSongIds, useOwnSongs } from '@/lib/own-songs/use-own-songs';
import type { SongListParams } from '@/lib/api/params';
import type { SongListItem, TopicListItem } from '@/lib/api/types';

type Tab = 'themen' | 'lieder' | 'orte' | 'notizen' | 'termine';

/** „Meine Lieder" (mit eigener Version) oder alle der Gruppe. */
type SongScope = 'meine' | 'alle';

const TABS: readonly Tab[] = ['themen', 'lieder', 'orte', 'notizen', 'termine'];

/**
 * Wo man im Archiv steht, als Adresse.
 *
 * Seit ein Lied eine eigene Seite hat, führt aus „Lieder" ein Weg hinaus — und
 * zurück landete man auf „Themen", weil das Register nur im Zustand stand.
 * Jetzt steht es in der Adresse, wie die Register auf „Termine"
 * (`meetings-screen.tsx`), geschrieben mit `replaceState`: Das Register ist
 * eine Ansicht und kein Ort, und wer viermal umschaltet, soll mit „zurück"
 * nicht viermal hier landen.
 */
function addressOf(tab: Tab, scope: SongScope, place: PlaceScope): string {
  if (tab === 'themen') return '/archiv';
  if (tab === 'lieder' && scope === 'meine') {
    return '/archiv?register=lieder&lieder=meine';
  }
  if (tab === 'orte' && place === 'treffpunkte') {
    return '/archiv?register=orte&orte=treffpunkte';
  }
  return `/archiv?register=${tab}`;
}

function initialTab(value: string | null): Tab {
  return TABS.find((tab) => tab === value) ?? 'themen';
}

/** Die Feder, mit der der Kopf ein- und ausklappt — eine für beide Wege. */
const HEAD_SPRING = { type: 'spring', damping: 30, stiffness: 260 } as const;

/** Welches der Felder gerade den Fokus hat — oder keines. */
function focusedOf(
  ...inputs: (HTMLInputElement | null)[]
): HTMLInputElement | null {
  const active = document.activeElement;
  return inputs.find((input) => input !== null && input === active) ?? null;
}

export function ArchiveScreen() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => initialTab(params.get('register')));
  const [songScope, setSongScope] = useState<SongScope>(() =>
    params.get('lieder') === 'meine' ? 'meine' : 'alle',
  );
  const [placeScope, setPlaceScope] = useState<PlaceScope>(() =>
    params.get('orte') === 'treffpunkte' ? 'treffpunkte' : 'zuhause',
  );
  /** Welches „+" gerade sein Sheet offen hat. */
  const [creating, setCreating] = useState<
    'themen' | 'notizen' | 'lieder' | 'orte' | null
  >(null);
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search).trim();
  const summary = useArchiveSummary();

  // Der Suchmodus, wie man ihn von Spotify kennt: Wer ins Feld tippt, will
  // suchen und nicht lesen, was das Archiv ist. Kopf und Kopfleiste gehen,
  // das Feld rückt nach oben und bleibt dort, darunter die Register und die
  // Treffer. **Er endet nur über „Abbrechen"**, nicht beim Verlassen des
  // Felds: Auf dem Telefon schließt schon das Scrollen durch die Treffer die
  // Tastatur, und dann spränge der Kopf mitten in der Liste zurück.
  const [searching, setSearching] = useState(false);

  /**
   * Ob die Suchleiste gerade oben klebt — auch ohne Suchmodus.
   *
   * Wer im Archiv nach unten scrollt, behält das Feld oben, statt es mit dem
   * Kopf aus dem Bild zu schieben; wer wieder hochscrollt, scrollt über die
   * Leiste hinweg zurück zum Kopf. Das ist nur das Kleben und nicht der
   * Suchmodus: kein „Abbrechen", kein eingeklappter Kopf — der steht weiter
   * oberhalb und ist mit einem Wisch erreichbar.
   */
  const [pinned, setPinned] = useState(false);

  const field = useRef<HTMLInputElement>(null);
  /** Das unsichtbare Feld oben, das beim Tipp die Tastatur bekommt. */
  const proxy = useRef<HTMLInputElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const headAnimation = useRef<ReturnType<typeof animate> | null>(null);
  /** Womit zuletzt aufs Feld gedrückt wurde — Finger oder Maus. */
  const pointer = useRef('mouse');

  // Die Kopfleiste geht im Suchmodus **und** solange die Leiste klebt. Sonst
  // führe sie beim kleinsten Hochwischen über das Feld, das gerade oben
  // stehen soll — zurück kommt sie erst, wenn man über die Leiste hinweg
  // wieder beim Kopf ist.
  const keepHeaderAway = searching || pinned;

  useEffect(() => {
    if (!keepHeaderAway) return;
    return suppressHeader();
  }, [keepHeaderAway]);

  // Klebt sie? Gefragt wird die Leiste selbst: `sticky` hält sie bei 0,
  // sobald sie dort ankommt — und nur dann steht sie genau dort. Gedrosselt
  // auf ein Bild wie in `use-header-scroll.ts`.
  useEffect(() => {
    let frame = 0;

    const read = () => {
      frame = 0;
      const element = bar.current;
      if (!element) return;
      setPinned(Math.abs(element.getBoundingClientRect().top) < 1);
    };

    const onScroll = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  /**
   * Scrollen durch die Treffer schließt die Tastatur — wie bei Spotify.
   *
   * Nicht nur aus Gewohnheit: Bei offener Tastatur schiebt iOS den sichtbaren
   * Ausschnitt gegen das Layout, und `sticky` klebt am Layout. Das Feld
   * rutschte damit beim Scrollen aus dem Bild, obwohl es „oben klebte". Ohne
   * Tastatur sind beide dasselbe. Den Modus beendet das nicht — nur die
   * Eingabe; weitertippen heißt einmal ins Feld tippen.
   */
  useEffect(() => {
    if (!searching) return;

    const onTouchMove = (event: TouchEvent) => {
      const active = focusedOf(field.current, proxy.current);
      if (!active) return;
      if (event.target instanceof Node && active.contains(event.target)) return;
      active.blur();
    };

    document.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => document.removeEventListener('touchmove', onTouchMove);
  }, [searching]);

  /**
   * Das Netz unter dem Hilfsfeld (`enterSearchByTouch`).
   *
   * Schiebt iOS den sichtbaren Ausschnitt trotzdem gegen das Layout, stünde
   * das Feld halb unter der Uhr, bis die Tastatur wieder zugeht — genau das
   * war der Fehler. Dann wird zurückgescrollt. Mit dem Hilfsfeld sollte das
   * nie greifen; es steht hier, weil iOS seine Regeln dafür nicht
   * veröffentlicht. Gegen ein Ziehen in der Liste kämpft es nicht: Das nimmt
   * dem Feld vorher schon den Fokus.
   */
  useEffect(() => {
    if (!searching) return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    const settle = () => {
      if (!focusedOf(field.current, proxy.current)) return;
      if (viewport.offsetTop <= 0.5) return;
      window.scrollTo({
        top: Math.max(0, window.scrollY - viewport.offsetTop),
      });
    };

    viewport.addEventListener('resize', settle);
    viewport.addEventListener('scroll', settle);
    return () => {
      viewport.removeEventListener('resize', settle);
      viewport.removeEventListener('scroll', settle);
    };
  }, [searching]);

  /**
   * In den Suchmodus — mit **einer** Bewegung.
   *
   * Hier liefen einmal zwei gegeneinander: Der Kopf klappte mit einer Feder
   * ein, und gleichzeitig wuchs der sichere Rand der Leiste per Transition von
   * null auf seine volle Höhe. Die Feder war schneller, das Feld schoss über
   * seinen Platz hinaus und kam zurück — am deutlichsten, wenn schon gescrollt
   * war, weil der Kopf dann von einer kleinen Resthöhe startete und fast
   * sofort weg war. Jetzt trägt die Leiste ihren Rand immer
   * (`pt-safe-4 -mt-safe-4`), und es bewegt sich allein die Höhe des Kopfs.
   *
   * Alles synchron im Handler, also im selben Bild gemalt: erst messen, dann
   * nach ganz oben scrollen und dem Kopf genau die Höhe geben, bei der das
   * Feld dort steht, wo es eben stand. Von dort klappt er auf die Höhe ein,
   * bei der die Leiste in Ruhe genau oben liegt — Ruhe- und Klebeplatz sind
   * dann derselbe, und die Treffer liegen nicht unter ihr. Wer schon klebte,
   * hat beide Höhen gleich: Das Feld bleibt stehen, nur die Liste beginnt
   * wieder oben.
   *
   * Zurück kommt die Bewegung selbst, damit `enterSearchByTouch` weiß, wann
   * das Feld angekommen ist.
   */
  const enterSearch = (): Promise<void> => {
    if (searching) return Promise.resolve();
    setSearching(true);

    const headElement = head.current;
    const barElement = bar.current;
    if (!headElement || !barElement) return Promise.resolve();

    const padding = parseFloat(getComputedStyle(barElement).paddingTop) || 0;
    const headTop = headElement.getBoundingClientRect().top + window.scrollY;
    const end = Math.max(padding - headTop, 0);
    const start = Math.max(
      barElement.getBoundingClientRect().top + padding - headTop,
      end,
    );

    // Das Hilfsfeld liegt dort, wo das Feld ankommt: Der Kopf ist das erste
    // Kind der Wurzel, also steht das Feld am Ende genau `end` unter ihr.
    if (proxy.current) proxy.current.style.top = `${end}px`;

    headAnimation.current?.stop();
    headElement.style.height = `${start}px`;
    window.scrollTo({ top: 0 });
    const controls = animate(
      headElement,
      { height: [start, end], opacity: 0 },
      HEAD_SPRING,
    );
    headAnimation.current = controls;
    return controls.then(() => undefined);
  };

  /**
   * Der Einstieg per Finger — mit der Tastatur **erst dort, wo das Feld
   * ankommt**.
   *
   * Bekam das Feld den Fokus beim Tipp selbst, stand es danach mit offener
   * Tastatur halb unter der Uhr, bis man daneben tippte. iOS schiebt beim
   * Fokussieren den sichtbaren Ausschnitt gegen das Layout, um das Feld über
   * der Tastatur zu zentrieren — und rechnet dabei mit der Lage im Moment des
   * Tipps, unten unter dem Kopf. Gleich danach fährt das Feld nach oben, die
   * Verschiebung aber bleibt, und `sticky` klebt am Layout, nicht am
   * Ausschnitt. Ein Feld, das schon oben liegt, verschiebt iOS nicht.
   *
   * Also nimmt den Fokus zuerst das unsichtbare Hilfsfeld an der Endposition,
   * noch in derselben Geste — sonst ginge die Tastatur gar nicht auf. Ist der
   * Kopf eingeklappt, wandert der Fokus ins echte Feld; zwischen zwei Feldern
   * bleibt die Tastatur offen, ohne dass es eine Geste braucht. Was man bis
   * dahin tippt, landet über `search` schon im echten Feld.
   */
  const enterSearchByTouch = () => {
    const stand = proxy.current;
    const arrived = enterSearch();
    if (!stand) return;

    stand.focus({ preventScroll: true });
    void arrived.then(() => {
      const input = field.current;
      if (!input || document.activeElement !== stand) return;
      input.focus({ preventScroll: true });
      const caret = input.value.length;
      input.setSelectionRange(caret, caret);
    });
  };

  // Abbrechen heißt auch: Der Begriff ist weg. Ein Filter, der nach dem
  // Verlassen weiter wirkt, sähe aus wie ein Archiv, in dem etwas fehlt.
  // Der Kopf klappt mit derselben Feder wieder auf; danach steht seine Höhe
  // wieder auf `auto`, damit er mit dem Fenster mitwächst.
  const leaveSearch = () => {
    setSearch('');
    setSearching(false);
    // Von Hand und nicht über den Scroll-Listener: Im Suchmodus steht man
    // schon bei 0, `scrollTo` löst also kein Ereignis aus — und die Leiste
    // gälte weiter als klebend, während der Kopf sie längst nach unten schiebt.
    setPinned(false);
    field.current?.blur();
    proxy.current?.blur();
    window.scrollTo({ top: 0 });

    const headElement = head.current;
    if (!headElement) return;

    headAnimation.current?.stop();
    const from = headElement.offsetHeight;
    headElement.style.height = 'auto';
    const full = headElement.offsetHeight;
    headElement.style.height = `${from}px`;

    const controls = animate(
      headElement,
      { height: [from, full], opacity: 1 },
      HEAD_SPRING,
    );
    headAnimation.current = controls;
    void controls.then(() => {
      if (headAnimation.current === controls) headElement.style.height = '';
    });
  };

  // Escape beendet den Modus, Enter nur die Eingabe — gesucht wird ohnehin
  // schon beim Tippen, und den Modus beendet allein „Abbrechen". Für das
  // Feld und das Hilfsfeld gleich.
  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') leaveSearch();
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const selectTab = (key: Tab) => {
    setTab(key);
    window.history.replaceState(
      null,
      '',
      addressOf(key, songScope, placeScope),
    );
  };

  const selectScope = (scope: SongScope) => {
    setSongScope(scope);
    window.history.replaceState(null, '', addressOf(tab, scope, placeScope));
  };

  const selectPlace = (place: PlaceScope) => {
    setPlaceScope(place);
    window.history.replaceState(null, '', addressOf(tab, songScope, place));
  };

  // „Termine" gab es einmal nicht, und der Grund war gut: nebeneinander
  // gestellt sahen Termine und Themen aus wie zwei Sichten auf dasselbe. Seit
  // es die **Nachbereitung** gibt, stimmt das nicht mehr — ein Abend ohne Thema
  // trägt eigenen Inhalt, den keine Themenseite zeigt. Es steht trotzdem
  // hinten: was man hier sucht, ist meistens ein Thema oder ein Lied.
  const tabs: { key: Tab; label: string; count?: number }[] = [
    // `topicsTotal` und nicht `topics`: die Kachel steht über **beiden**
    // Registern, und hier stand vorher die Zahl des einen. Über „Eigene (1)"
    // prangte dann „Themen (0)" — die Kachel zählte nur, was schon gehalten
    // wurde, und ein eigener Entwurf ist genau das nicht.
    { key: 'themen', label: 'Themen', count: summary.data?.totals.topicsTotal },
    { key: 'lieder', label: 'Lieder', count: summary.data?.totals.songs },
    // Orte gehören hierher und nicht in die Verwaltung: sie sind Teil dessen,
    // was die Gruppe über sich gesammelt hat, und jede:r darf sie pflegen.
    { key: 'orte', label: 'Orte' },
    // Die Zahl zählt nur, was man sehen darf — wie die Liste darunter.
    { key: 'notizen', label: 'Notizen', count: summary.data?.totals.notes },
    // `totals.meetings` zählt ohne abgesagte — dasselbe, was die Liste in ihrer
    // Vorgabe zeigt. Eine Zahl, die größer ist als das, was darunter steht,
    // wirft genau die Frage auf, die sie beantworten soll.
    { key: 'termine', label: 'Termine', count: summary.data?.totals.meetings },
  ];

  return (
    // `overflow-anchor` hält Chrome davon ab, während der Kopf ein- oder
    // ausklappt, selbst nachzuscrollen — das wäre eine zweite Bewegung.
    // `relative` für das Hilfsfeld, das von hier aus gemessen wird.
    <div className="relative [overflow-anchor:none]">
      {/* Unsichtbar und nicht anzutippen; es nimmt nur den ersten Fokus
          (`enterSearchByTouch`). `text-base`, damit iOS nicht hineinzoomt. */}
      <input
        ref={proxy}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={onSearchKey}
        enterKeyHint="search"
        autoComplete="off"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-x-5 h-10 text-base caret-transparent opacity-0"
      />
      {/* Ohne Kopfbild, aus demselben Grund wie bei „Termine": hier liest man
          Listen und sucht eine Zeile. Ein Foto darüber wäre nur Weg bis zur
          ersten — und anders als auf „Heute" oder „Gebet" kommt man hierher
          selten zum Verweilen. */}
      {/* Höhe statt Verschiebung: Ein `transform` am Seiteninhalt würde zum
          Bezugsrahmen der `fixed`-Sheets darin (`pull-to-refresh.tsx`).
          Immer gerendert und von `enterSearch`/`leaveSearch` geführt — im
          Suchmodus ist er nur noch der Abstand, der die Leiste in Ruhe an den
          oberen Rand legt. */}
      <div ref={head} aria-hidden={searching} className="overflow-hidden">
        <PageHeader
          title="Archiv"
          subtitle="Durchsuche Themen, Lieder, Locations, Notizen und Termine."
        />
      </div>

      <div
        className={cn(
          'space-y-1 px-5',
          (tab === 'themen' || tab === 'notizen' || tab === 'lieder') &&
            'pb-20',
        )}
      >
        {/* Feld und Register sind ein Block, der **immer** oben klebt — im
            Suchmodus wie beim gewöhnlichen Scrollen. Er reicht mit `-mx-5`
            über die volle Breite, sonst schauen die Treffer an den Rändern
            darunter hervor.

            **Den sicheren Rand trägt er immer** (`pt-safe-4`), und
            `-mt-safe-4` hebt ihn im Fluss wieder auf. Dadurch liegt der Block
            in Ruhe genau dort, wo er klebt: Das Feld gleitet beim Scrollen mit
            dem Inhalt hoch und bleibt unter der Statusleiste stehen, ohne dass
            irgendetwas wächst oder umspringt. Durchsichtig ist er, solange er
            nicht klebt — dann liegt sein oberer Rand über dem Kopf; erst oben
            braucht er eine Fläche, unter der die Treffer verschwinden.

            Der Haarstrich darunter gehört nur zum Kleben **ohne** Suchmodus:
            Dort trennt er die Leiste vom Archiv, das unter ihr weiterläuft.
            Im Suchmodus sind Feld und Treffer eins, wie bei Spotify. */}
        <div
          ref={bar}
          className={cn(
            'sticky top-0 z-30 -mx-5 -mt-safe-4 space-y-4 px-5 pt-safe-4 pb-3 transition-[background-color,box-shadow] duration-200',
            searching
              ? 'bg-canvas'
              : pinned
                ? 'bg-canvas shadow-[0_1px_0_var(--color-line)]'
                : 'bg-transparent',
          )}
        >
          <div className="flex items-center">
            <div className="relative flex-1">
              <Search
                size={15}
                className="absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-300"
              />
              {/* Per Finger bekommt das Feld beim ersten Tipp keinen Fokus
                  (`mousedown` ist der Weg dorthin, auch beim Tippen), sondern
                  das Hilfsfeld — warum, steht bei `enterSearchByTouch`. Maus
                  und Tab-Taste gehen den gewohnten Weg über `onFocus`. */}
              <TextInput
                ref={field}
                value={search}
                onPointerDown={(event) => {
                  pointer.current = event.pointerType;
                }}
                onMouseDown={(event) => {
                  if (!searching && pointer.current !== 'mouse') {
                    event.preventDefault();
                  }
                }}
                onClick={() => {
                  if (!searching && pointer.current !== 'mouse') {
                    enterSearchByTouch();
                  }
                }}
                onFocus={() => void enterSearch()}
                onChange={(event) => {
                  setSearch(event.target.value);
                  void enterSearch();
                }}
                onKeyDown={onSearchKey}
                enterKeyHint="search"
                placeholder="Durchsuchen …"
                className="pl-9"
                aria-label="Archiv durchsuchen"
              />
            </div>

            <AnimatePresence initial={false}>
              {searching && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                  className="shrink-0 overflow-hidden"
                >
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
          </div>

          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {tabs.map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => selectTab(key)}
                aria-pressed={tab === key}
                className={cn(
                  'shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold transition-colors',
                  PRESSABLE,
                  tab === key
                    ? 'border-terracotta-500 bg-terracotta-500 text-white'
                    : 'border-line bg-card text-stone-500 hover:border-line-strong',
                )}
              >
                {label}
                {count !== undefined && (
                  <span className="ml-1.5 opacity-60">{count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {tab === 'themen' && <TopicArchive search={deferred} />}
        {tab === 'notizen' && <NotesArchive search={deferred} />}
        {tab === 'lieder' && (
          <SongLibrary
            search={deferred}
            scope={songScope}
            onScope={selectScope}
          />
        )}
        {tab === 'orte' && (
          <LocationsCard scope={placeScope} onScope={selectPlace} />
        )}
        {tab === 'termine' && <MeetingsArchive search={deferred} />}
      </div>

      {/* Anlegen über das „+" unten rechts. Es stand als Knopf über der Liste
          und scrollte mit ihr weg; wer weit unten war, musste zurück nach
          oben. Themen und Lieder haben es, weil man beides hier vorarbeitet —
          ein Thema entstand lange nur beim Wählen an einem Abend, ein Lied
          nur über einen Vorschlag. Notizen entstehen nur hier. Und
          Treffpunkte, weil sie hier wohnen; Wohnungen entstehen im Profil. */}
      {tab === 'themen' && (
        <FloatingAction
          label="Thema oder Einheit anlegen"
          icon={<Plus size={24} />}
          onClick={() => setCreating('themen')}
        />
      )}
      {tab === 'notizen' && (
        <FloatingAction
          label="Notiz anlegen"
          icon={<Plus size={24} />}
          onClick={() => setCreating('notizen')}
        />
      )}
      {tab === 'lieder' && (
        <FloatingAction
          label="Lied hinzufügen"
          icon={<Plus size={24} />}
          onClick={() => setCreating('lieder')}
        />
      )}
      {tab === 'orte' && placeScope === 'treffpunkte' && (
        <FloatingAction
          label="Treffpunkt anlegen"
          icon={<Plus size={24} />}
          onClick={() => setCreating('orte')}
        />
      )}
      <LocationSheet
        open={creating === 'orte'}
        onClose={() => setCreating(null)}
      />
      <NewEntrySheet
        open={creating === 'themen'}
        onClose={() => setCreating(null)}
      />
      <NewNoteSheet
        open={creating === 'notizen'}
        onClose={() => setCreating(null)}
      />
      <NewSongSheet
        open={creating === 'lieder'}
        onClose={() => setCreating(null)}
      />
    </div>
  );
}

/**
 * Die Themen des Hauskreises.
 *
 * Gelistet wird, was **gehalten** wurde: ein Thema steht im Archiv, sobald einer
 * seiner Abende vorbei ist — und bleibt dann drin, auch für alles, was danach
 * noch dazukommt. Der Schalter „Nur meine" nimmt zusätzlich die eigenen dazu,
 * die noch vor sich haben, gehalten zu werden.
 *
 * Die Abende eines Themas stehen nicht mehr hier, sondern auf seiner eigenen
 * Seite. Ein Thema mit fünf Einheiten machte diese Liste sonst zu einer Wand.
 */
function TopicArchive({ search }: { search: string }) {
  const [nurEigene, setNurEigene] = useState(false);
  const summary = useArchiveSummary();

  const query = useTopicList({
    scope: nurEigene ? 'mine' : 'public',
    search: search || undefined,
  });

  return (
    <div className="space-y-3">
      {/* Unterstrichene Register statt Pillen: darüber steht schon eine
          Pillen-Leiste (Themen/Lieder/Orte), und zwei gleich aussehende
          Leisten übereinander liest man als eine. */}
      <div
        role="tablist"
        aria-label="Themen filtern"
        className="flex border-b border-line"
      >
        <ListTab
          active={nurEigene}
          count={summary.data?.totals.topicsMine}
          onSelect={() => setNurEigene(true)}
        >
          Eigene Themen
        </ListTab>
        <ListTab
          active={!nurEigene}
          count={summary.data?.totals.topics}
          onSelect={() => setNurEigene(false)}
        >
          Alle Themen
        </ListTab>
      </div>

      {query.isLoading && <CardSkeleton />}
      {query.error && <ErrorState error={query.error} />}

      {!query.isLoading && !query.error && query.items.length === 0 && (
        <EmptyState
          title={nurEigene ? 'Du hast noch kein Thema' : 'Noch keine Themen'}
          hint={
            nurEigene
              ? 'Sobald du für ein Thema zugeteilt bist, kannst du dort eines anfangen.'
              : 'Hier stehen Themen, sobald ein Termin dazu vorbei ist.'
          }
        />
      )}

      {query.items.length > 0 && (
        <>
          <ul className="space-y-3">
            {query.items.map((topic) => (
              <li key={topic.id}>
                <TopicEntry topic={topic} />
              </li>
            ))}
          </ul>
          <LoadMore query={query} label="Ältere Themen" />
        </>
      )}
    </div>
  );
}

/**
 * Zwei Sorten, ein Knopf — und die Frage davor.
 *
 * Ein **Thema** zieht sich über mehrere Abende und hat einen Bogen darüber. Eine
 * **einzelne Einheit** ist ein Abend, mehr nicht. Wer nur einen vorbereiten
 * will, musste vorher ein Thema erfinden, das nie ein zweites Mal vorkommt.
 *
 * Warum die Frage und nicht zwei Knöpfe nebeneinander: Zwei Knöpfe verlangen,
 * dass man den Unterschied schon kennt, bevor man einen drückt. Der Schritt
 * davor kann ihn in einem Satz erklären, und er kostet genau einen Tipp.
 */
function NewEntrySheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [art, setArt] = useState<'frage' | 'thema' | 'einheit'>('frage');

  const close = () => {
    setArt('frage');
    onClose();
  };

  if (art === 'thema') {
    return <NewTopicStep onBack={() => setArt('frage')} onDone={close} />;
  }

  if (art === 'einheit') {
    return <NewSessionStep onBack={() => setArt('frage')} onDone={close} />;
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Neu anlegen"
      subtitle="Was soll es werden?"
    >
      <div className="space-y-2">
        <ArtRow
          icon={<Layers size={18} />}
          title="Ein Thema"
          hint="Zieht sich über mehrere Termine. Die Einheiten kommen danach dazu."
          onSelect={() => setArt('thema')}
        />
        <ArtRow
          icon={<FileText size={18} />}
          title="Eine einzelne Einheit"
          hint="Ein Termin für sich, ohne weitere Termine darüber hinaus. Ein Überthema lässt sich später jederzeit ergänzen."
          onSelect={() => setArt('einheit')}
        />
      </div>
    </Sheet>
  );
}

function ArtRow({
  icon,
  title,
  hint,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border border-line bg-card p-3.5 text-left transition-colors hover:border-line-strong',
        PRESSABLE,
      )}
    >
      <span className="mt-0.5 shrink-0 text-terracotta-500">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-stone-800">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-500">
          {hint}
        </span>
      </span>
    </button>
  );
}

/**
 * Ein Thema anlegen, ohne dass ein Abend dafür feststeht.
 *
 * Nur der Titel und der Bogen darüber — die Einheiten kommen auf der Themenseite
 * dazu, und dorthin führt der Weg direkt nach dem Anlegen.
 */
function NewTopicStep({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateTopic();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');

  const trimmed = title.trim();

  return (
    <Sheet
      open
      onClose={onDone}
      title="Neues Thema"
      subtitle="Zieht sich über mehrere Abende — die Einheiten kommen danach dazu."
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onBack}>
            <ArrowLeft size={14} />
            Zurück
          </Button>
          <Button
            className="flex-1"
            loading={create.isPending}
            disabled={trimmed.length === 0}
            onClick={() =>
              create.mutate(
                {
                  title: trimmed,
                  summaryText: summary.trim() || null,
                },
                {
                  onSuccess: (topic) => {
                    toast.success('Angelegt — jetzt die Einheiten.');
                    onDone();
                    router.push(`/thema?id=${topic.id}`);
                  },
                  onError: (error) => toast.error(errorMessage(error)),
                },
              )
            }
          >
            Erstellen
          </Button>
        </div>
      }
    >
      <Field label="Titel">
        <TextInput
          value={title}
          placeholder="Worum geht es?"
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      <Field
        label="Zusammenfassung"
        hint="Fasst das Überblickende zusammen. Kann auch später kommen."
      >
        <TextArea
          rows={3}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </Field>
    </Sheet>
  );
}

/**
 * Eine einzelne Einheit anlegen — ohne Thema, ohne Abend.
 *
 * Hier stehen Actionstep und Zusammenfassung gleich mit im Formular, anders als
 * beim Thema: Es gibt keine Ebene darunter, auf die man sie schieben könnte,
 * und wer eine Einheit vorbereitet, hat oft beides schon im Kopf.
 */
function NewSessionStep({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateStandaloneSession();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [actionstep, setActionstep] = useState('');

  const trimmed = title.trim();

  return (
    <Sheet
      open
      onClose={onDone}
      title="Neue Einheit"
      subtitle="Ein Termin für sich. Ein Überthema lässt sich später jederzeit ergänzen."
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onBack}>
            <ArrowLeft size={14} />
            Zurück
          </Button>
          <Button
            className="flex-1"
            loading={create.isPending}
            disabled={trimmed.length === 0}
            onClick={() =>
              create.mutate(
                {
                  title: trimmed,
                  summaryText: summary.trim() || null,
                  actionstepText: actionstep.trim() || null,
                },
                {
                  onSuccess: (session) => {
                    toast.success('Angelegt — wählbar an jedem Termin.');
                    onDone();
                    router.push(`/einheit?id=${session.id}`);
                  },
                  onError: (error) => toast.error(errorMessage(error)),
                },
              )
            }
          >
            Erstellen
          </Button>
        </div>
      }
    >
      <Field label="Titel">
        <TextInput
          value={title}
          placeholder="Worum geht es an diesem Termin?"
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      <Field
        label="Zusammenfassung"
        hint="Optional — hilft allen, die nicht da waren."
      >
        <TextArea
          rows={3}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </Field>

      <Field label="Actionstep" hint="Optional — der Vorsatz für die Woche.">
        <TextInput
          value={actionstep}
          onChange={(event) => setActionstep(event.target.value)}
        />
      </Field>
    </Sheet>
  );
}

/**
 * Eine Zeile in der Liste — und sie trägt zwei Sorten.
 *
 * Ein **Thema** und eine **einzelne Einheit** stehen hier nebeneinander, weil
 * man beim Suchen nicht vorher weiß, welches von beidem man sucht. Getrennte
 * Listen hätten die Frage „wo war das noch mal" verdoppelt.
 *
 * Unterschieden wird am Symbol und daran, was in der Zeile steht: Bei einer
 * Hülle gibt es keinen Themen-Titel — dort steht der Titel der Einheit, ihre
 * Zusammenfassung und ihr Abend. Ein „1 Einheit" darunter wäre keine Auskunft,
 * sondern eine Selbstverständlichkeit.
 *
 * **Aufgebaut wie die Kopfzeile der Themenseite**, nur knapp: Symbol in einer
 * Kachel, daneben Titel, eine Zeile Zusammenfassung und darunter, wer daran
 * arbeitet und wie viel es ist. Alles hängt an der Spalte neben der Kachel —
 * eine Kante, kein Trennstrich, keine Pille.
 */
function TopicEntry({ topic }: { topic: TopicListItem }) {
  // Bei einer Hülle ist die eine Einheit der ganze Eintrag. Sie kann fehlen,
  // wenn der Server sie zurückhält — dann bleibt die Zeile ohne Inhalt, und das
  // ist richtig so.
  const einzelne = topic.standalone ? topic.sessions[0] : undefined;

  /**
   * Wer daran arbeitet — und bei einer Hülle ist das die Crew der Einheit.
   *
   * `collaborators` ist dort immer leer: Die Mitwirkenden-Ebene einer Hülle ist
   * abgeleitet, nicht eingetragen (siehe `membershipOf` im Backend). Vorher
   * stand deshalb auf jeder einzelnen Einheit genau ein Gesicht — das des
   * Erstellers —, ganz gleich, mit wie vielen er sie vorbereitet.
   *
   * Der Owner steht in der Crew, das hält der Server; die Reihenfolge kommt
   * darum aus der Crew selbst und nicht aus einer Sonderbehandlung hier.
   */
  const leute = topic.standalone
    ? (einzelne?.responsibles.map((row) => row.person) ?? [])
    : [
        ...(topic.owner ? [topic.owner] : []),
        ...topic.collaborators.map((c) => c.person),
      ];

  const titel = topic.standalone
    ? (einzelne?.title ?? 'Einheit ohne Titel')
    : (topic.title ?? 'Thema ohne Titel');
  const text = topic.standalone ? einzelne?.summaryText : topic.summaryText;

  return (
    <Link
      href={
        topic.standalone && einzelne
          ? `/einheit?id=${einzelne.id}`
          : `/thema?id=${topic.id}`
      }
      className={cn('block', PRESSABLE)}
    >
      <Card className="flex gap-3 p-3.5 transition-colors hover:border-line-strong">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-terracotta-50 text-terracotta-600"
          aria-label={topic.standalone ? 'Einzelne Einheit' : 'Thema'}
        >
          {topic.standalone ? <FileText size={17} /> : <Layers size={17} />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="line-clamp-2 min-w-0 flex-1 font-serif text-base leading-snug font-bold text-stone-900">
              {titel}
            </h3>
            {/* Nur für die eigenen: bei einem fremden Thema sagt „läuft"
                nichts, was man tun könnte. */}
            {topic.mine && !topic.standalone && topic.status === 'RUNNING' && (
              <Badge
                variant="terracotta"
                className="px-2 py-0.5 text-[9px] tracking-wider uppercase"
              >
                Läuft
              </Badge>
            )}
          </div>

          {text && (
            <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">{text}</p>
          )}

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <AvatarStack people={leute} size="xs" zoomable={false} />
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-stone-400">
              {topic.standalone
                ? einzelne?.meeting
                  ? formatDay(einzelne.meeting.date)
                  : 'noch ohne Abend'
                : topic.sessions.length === 1
                  ? '1 Einheit'
                  : `${topic.sessions.length} Einheiten`}
              <ChevronRight
                aria-hidden
                size={13}
                className="text-terracotta-500"
              />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

/**
 * Die Lieder — die eigenen und alle der Gruppe.
 *
 * **„Meine Lieder" sind die mit eigener Version**, also Text und Akkorde, die
 * jemand für sich hinterlegt hat. Sie kommen nicht vom Server, sondern aus dem
 * Gerät (`lib/own-songs`), und stehen deshalb auch ohne Netz da. „Alle Lieder"
 * ist die Liederliste der Gruppe, wie bisher.
 */
function SongLibrary({
  search,
  scope,
  onScope,
}: {
  search: string;
  scope: SongScope;
  onScope: (scope: SongScope) => void;
}) {
  const summary = useArchiveSummary();
  const own = useOwnSongs();

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Lieder filtern"
        className="flex border-b border-line"
      >
        <ListTab
          active={scope === 'meine'}
          count={own.data?.length}
          onSelect={() => onScope('meine')}
        >
          Meine Lieder
        </ListTab>
        <ListTab
          active={scope === 'alle'}
          count={summary.data?.totals.songs}
          onSelect={() => onScope('alle')}
        >
          Alle Lieder
        </ListTab>
      </div>

      {scope === 'meine' ? (
        <MySongs search={search} />
      ) : (
        <AllSongs search={search} />
      )}
    </div>
  );
}

function MySongs({ search }: { search: string }) {
  const own = useOwnSongs();
  const needle = search.toLowerCase();

  const items = (own.data ?? [])
    .filter(
      (song) =>
        needle === '' ||
        song.title.toLowerCase().includes(needle) ||
        (song.artist ?? '').toLowerCase().includes(needle),
    )
    .toSorted((a, b) => a.title.localeCompare(b.title, 'de'));

  if (own.isLoading) return <CardSkeleton />;
  if (own.error) return <ErrorState error={own.error} />;

  return (
    <>
      {items.length === 0 ? (
        <EmptyState
          title={needle ? 'Nichts gefunden' : 'Noch keine eigene Version'}
          hint={
            needle
              ? undefined
              : 'Öffne ein Lied und hinterleg dir Text & Akkorde. Sie bleiben auf diesem Gerät.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {items.map((song) => (
            <li key={song.songId}>
              <Link
                href={`/lied?id=${song.songId}`}
                className={cn(
                  'flex items-center gap-3 rounded-md border border-line bg-card p-3 transition-colors hover:border-line-strong',
                  PRESSABLE,
                )}
              >
                <FileMusic size={15} className="shrink-0 text-terracotta-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-stone-800">
                    {song.title}
                  </p>
                  <p className="truncate text-[11px] text-stone-400">
                    {[
                      song.artist ?? 'Unbekannt',
                      song.key && `Tonart ${song.key}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <ChevronRight size={15} className="shrink-0 text-stone-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Wo die Liste herkommt, steht an ihr selbst: Auf dem nächsten Gerät
          ist sie leer, und das soll niemanden überraschen. */}
      <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-stone-400">
        <Lock size={11} />
        Nur auf diesem Gerät gespeichert — niemand sonst sieht sie.
      </p>
    </>
  );
}

function AllSongs({ search }: { search: string }) {
  const [sort, setSort] =
    useState<NonNullable<SongListParams['sort']>>('popular');
  const owned = useOwnSongIds();

  const query = useSongList({ search: search || undefined, sort });

  const sorts: { key: NonNullable<SongListParams['sort']>; label: string }[] = [
    { key: 'popular', label: 'Am häufigsten' },
    { key: 'recent', label: 'Zuletzt gesungen' },
    { key: 'title', label: 'A–Z' },
  ];

  return (
    <>
      <div className="flex gap-2">
        {sorts.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort(key)}
            aria-pressed={sort === key}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors',
              sort === key
                ? 'bg-inverse text-inverse-fg'
                : 'bg-stone-100 text-stone-500 hover:bg-stone-200',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {query.isLoading && <CardSkeleton />}
      {query.error && <ErrorState error={query.error} />}
      {!query.isLoading && query.items.length === 0 && (
        <EmptyState
          title="Noch keine Lieder"
          hint="Die Datenbank wächst mit jedem Vorschlag an einem Termin."
        />
      )}

      <ul className="space-y-2">
        {query.items.map((song, index) => (
          <SongRow
            key={song.id}
            song={song}
            owned={owned.has(song.id)}
            rank={sort === 'popular' ? index + 1 : undefined}
          />
        ))}
      </ul>

      <LoadMore query={query} label="Mehr Lieder" />
    </>
  );
}

/**
 * Eine Liedzeile — und sie führt auf die Seite des Lieds.
 *
 * Stift und Papierkorb lagen hier erst dauerhaft, dann hinter einem langen
 * Druck, zuletzt hinter einem Wisch nach links. Seit ein Lied eine eigene
 * Seite hat, steht dort beides unter „Bearbeiten", und die Zeile hat nur noch
 * eine Aufgabe: dorthin zu führen. Der Knopf „Text" ist aus demselben Grund
 * weg — der Link steht auf der Seite ganz oben.
 */
function SongRow({
  song,
  owned,
  rank,
}: {
  song: SongListItem;
  owned: boolean;
  rank?: number;
}) {
  return (
    <li>
      <Link
        href={`/lied?id=${song.id}`}
        className={cn(
          'flex items-center gap-3 rounded-md border border-line bg-card p-3 transition-colors hover:border-line-strong',
          PRESSABLE,
        )}
      >
        {rank !== undefined && (
          <span className="w-6 shrink-0 text-center text-xs font-bold text-stone-300">
            {rank}
          </span>
        )}
        <Music size={15} className="shrink-0 text-stone-300" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-stone-800">
              {song.title}
            </span>
            {owned && (
              <FileMusic
                size={13}
                aria-label="Eigene Version vorhanden"
                className="shrink-0 text-terracotta-500"
              />
            )}
          </p>
          <p className="truncate text-[11px] text-stone-400">
            {song.artist ?? 'Unbekannt'} · {song.timesPlayed}×
          </p>
        </div>
        <ChevronRight size={15} className="shrink-0 text-stone-300" />
      </Link>
    </li>
  );
}
