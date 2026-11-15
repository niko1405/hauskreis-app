'use client';

/**
 * „Archiv" — Themen, die Song-Datenbank, Orte und Notizen. Gesucht wird
 * serverseitig (`search`), sonst müsste die App mit der Zeit alles laden, nur
 * um clientseitig zu filtern.
 *
 * Vergangene Abende stehen auf „Termine" unter „Vergangene" und nicht mehr
 * hier: Zwei Orte für dieselbe Liste waren einer zu viel.
 */
import {
  ArrowLeft,
  ChevronRight,
  FileMusic,
  FileText,
  Layers,
  ListFilter as ListFilterIcon,
  Lock,
  Music,
  Plus,
  Search,
  SearchX,
} from 'lucide-react';
import Link from '@/components/ui/link';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { PageHeader } from '@/components/layout/app-shell';
import { suppressHeader } from '@/components/layout/header-suppress';
import { FloatingAction } from '@/components/layout/floating-action';
import { AvatarStack } from '@/components/ui/avatar';
import { Button, IconButton, PRESSABLE } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
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
import { ListFilter } from './list-filter';
import { LocationsCard, type PlaceScope } from './locations-card';
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
import { useBlurOnTouchMove } from '@/lib/use-blur-on-touch-move';
import { useOwnSongIds, useOwnSongs } from '@/lib/own-songs/use-own-songs';
import type { SongListParams } from '@/lib/api/params';
import type { SongListItem, TopicListItem } from '@/lib/api/types';

type Tab = 'themen' | 'lieder' | 'orte' | 'notizen';

/** „Meine Lieder" (mit eigener Version) oder alle der Gruppe. */
type SongScope = 'meine' | 'alle';

const TABS: readonly Tab[] = ['themen', 'lieder', 'orte', 'notizen'];

/**
 * Wo man im Archiv steht, als Adresse.
 *
 * Aus „Lieder" führt ein Weg hinaus auf die Seite eines Lieds — und zurück
 * soll man im selben Register landen. Es steht deshalb in der Adresse, wie die
 * Register auf „Termine"
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

// Ein alter Link auf `?register=termine` landet bei den Themen — das Register
// gibt es nicht mehr.
function initialTab(value: string | null): Tab {
  return TABS.find((tab) => tab === value) ?? 'themen';
}

/** Die Feder, mit der der Kopf ein- und ausklappt — dieselbe wie auf „Termine". */
const HEAD_SPRING = { type: 'spring', damping: 30, stiffness: 260 } as const;

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

  // Der Suchmodus, wie man ihn von Spotify kennt: Wer sucht, will suchen und
  // nicht lesen, was das Archiv ist. Kopf und Kopfleiste gehen, das Feld steht
  // oben und darunter die Kategorien und die Treffer. **Er endet nur über
  // „Abbrechen"**, nicht beim Verlassen des Felds: Auf dem Telefon schließt
  // schon das Scrollen durch die Treffer die Tastatur, und dann spränge der
  // Kopf mitten in der Liste zurück.
  const [searching, setSearching] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  // Wer sucht, will oben das Feld sehen und nicht Glocke und Gruppe darüber.
  useEffect(() => {
    if (!searching) return;
    return suppressHeader();
  }, [searching]);

  // Scrollen durch die Treffer schließt die Tastatur — warum, steht beim Hook.
  useBlurOnTouchMove(searching);

  /**
   * In den Suchmodus — **mit der Tastatur im selben Tipp**, wie auf „Termine".
   *
   * iOS öffnet sie nur, wenn der Fokus noch in der Geste gesetzt wird. Also
   * synchron: `flushSync` zeichnet das Feld, und es steht dann schon oben — es
   * ist das erste Element der Seite, und gescrollt wird vorher nach ganz oben.
   * Ein Feld, das schon oben liegt, verschiebt iOS beim Fokussieren nicht.
   */
  const enterSearch = () => {
    flushSync(() => setSearching(true));
    window.scrollTo({ top: 0 });
    field.current?.focus({ preventScroll: true });
  };

  // Abbrechen heißt auch: Der Begriff ist weg. Ein Filter, der nach dem
  // Verlassen weiter wirkt, sähe aus wie ein Archiv, in dem etwas fehlt.
  const leaveSearch = () => {
    setSearch('');
    setSearching(false);
    field.current?.blur();
    window.scrollTo({ top: 0 });
  };

  // Escape beendet den Modus, Enter nur die Eingabe — gesucht wird ohnehin
  // schon beim Tippen, und den Modus beendet allein „Abbrechen".
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

  // Vergangene Abende stehen hier nicht mehr: Wer einen sucht, findet ihn auf
  // „Termine" unter „Vergangene" — und mit vier statt fünf Kategorien passen
  // sie in eine Kapsel über die volle Breite.
  const tabs: { value: Tab; label: string; count?: number }[] = [
    // `topicsTotal` und nicht `topics`: die Zahl steht über **beiden**
    // Registern — sonst stünde über „Eigene (1)" ein „Themen 0", weil ein
    // eigener Entwurf noch nicht gehalten ist.
    {
      value: 'themen',
      label: 'Themen',
      count: summary.data?.totals.topicsTotal,
    },
    { value: 'lieder', label: 'Lieder', count: summary.data?.totals.songs },
    // Orte gehören hierher und nicht in die Verwaltung: sie sind Teil dessen,
    // was die Gruppe über sich gesammelt hat, und jede:r darf sie pflegen.
    { value: 'orte', label: 'Orte' },
    // Die Zahl zählt nur, was man sehen darf — wie die Liste darunter.
    { value: 'notizen', label: 'Notizen', count: summary.data?.totals.notes },
  ];

  return (
    <div>
      {/* Feld, Kopf und Kategorien sind ein Block. Im Suchmodus klebt er oben:
          Das Feld steht **vor** dem Kopf und nicht an seiner Stelle — so ist
          es vom ersten Bild an oben, während der Kopf darunter einklappt
          (`enterSearch`). Die Kategorien bleiben stehen, denn gesucht wird in
          der gewählten. */}
      <div className={cn(searching && 'sticky top-0 z-30 bg-canvas')}>
        <AnimatePresence initial={false}>
          {searching && (
            <motion.div
              key="search"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center px-5 pt-safe-4 pb-3"
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
                  placeholder="Durchsuchen …"
                  className="pl-9"
                  aria-label="Archiv durchsuchen"
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

        {/* Höhe statt Verschiebung: Ein `transform` am Seiteninhalt würde zum
            Bezugsrahmen der `fixed`-Sheets darin (`pull-to-refresh.tsx`). */}
        <motion.div
          initial={false}
          animate={
            searching
              ? { height: 0, opacity: 0 }
              : { height: 'auto', opacity: 1 }
          }
          transition={HEAD_SPRING}
          inert={searching}
          aria-hidden={searching}
          className="overflow-hidden"
        >
          {/* Die Suche ist eine Lupe neben dem Titel und kein Feld, das immer
              dasteht: Meistens tippt man im Archiv eine Kategorie an und
              blättert. */}
          <PageHeader
            title="Archiv"
            action={
              <IconButton
                label="Archiv durchsuchen"
                onClick={enterSearch}
                className="border border-line bg-card"
              >
                <Search size={18} />
              </IconButton>
            }
          />
        </motion.div>

        {/* Die Kategorien als **eine** Kapsel, wie die Register auf „Termine" —
            vier gleichrangige Teile desselben Archivs, keine Reihe Etiketten. */}
        <div className={cn('px-5', searching ? 'pb-3' : 'pb-4')}>
          <Segmented
            equal
            size="lg"
            label="Kategorie"
            value={tab}
            onChange={selectTab}
            options={tabs}
          />
        </div>
      </div>

      <div
        className={cn(
          'px-5',
          (tab === 'themen' || tab === 'notizen' || tab === 'lieder') &&
            'pb-20',
        )}
      >
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
 * Die Abende eines Themas stehen nicht hier, sondern auf seiner eigenen Seite.
 * Ein Thema mit fünf Einheiten machte diese Liste sonst zu einer Wand.
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
      <ListFilter
        label="Themen filtern"
        value={nurEigene ? 'meine' : 'alle'}
        onChange={(next) => setNurEigene(next === 'meine')}
        options={[
          {
            value: 'meine',
            label: 'Meine',
            count: summary.data?.totals.topicsMine,
          },
          { value: 'alle', label: 'Alle', count: summary.data?.totals.topics },
        ]}
      />

      {query.isLoading && <CardSkeleton />}
      {query.error && <ErrorState error={query.error} />}

      {!query.isLoading && !query.error && query.items.length === 0 && (
        <EmptyState
          icon={search ? <SearchX size={22} /> : <Layers size={22} />}
          title={
            search
              ? 'Nichts gefunden'
              : nurEigene
                ? 'Du hast noch kein Thema'
                : 'Noch keine Themen'
          }
          hint={
            search
              ? `Kein Thema passt zu „${search}".`
              : nurEigene
                ? 'Über das „+" unten rechts fängst du eines an — oder an einem Abend, für den du eingeteilt bist.'
                : 'Hier stehen Themen, sobald ein Abend dazu vorbei ist.'
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
 * will, soll kein Thema erfinden müssen, das nie ein zweites Mal vorkommt.
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
   * abgeleitet, nicht eingetragen (siehe `membershipOf` im Backend). Ohne die
   * Crew stünde auf jeder einzelnen Einheit nur das Gesicht des Erstellers.
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
 * ist die Liederliste der Gruppe.
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
  const [sort, setSort] = useState<SongSort>('popular');

  return (
    <div className="space-y-3">
      <ListFilter
        label="Lieder filtern"
        value={scope}
        onChange={onScope}
        options={[
          { value: 'meine', label: 'Meine', count: own.data?.length },
          { value: 'alle', label: 'Alle', count: summary.data?.totals.songs },
        ]}
        action={
          // Nur bei allen: Die eigenen stehen ohnehin nach Titel, und eine
          // Sortierung nach „gesungen" kennt das Gerät nicht.
          scope === 'alle' && <SortButton sort={sort} onChange={setSort} />
        }
      />

      {scope === 'meine' ? (
        <MySongs search={search} />
      ) : (
        <AllSongs search={search} sort={sort} />
      )}
    </div>
  );
}

type SongSort = NonNullable<SongListParams['sort']>;

/** Die Reihenfolge, in der der Knopf weiterschaltet — und was er dann sagt. */
const SORTS: { key: SongSort; label: string; long: string }[] = [
  { key: 'popular', label: 'Häufigste', long: 'am häufigsten gesungen' },
  { key: 'recent', label: 'Zuletzt', long: 'zuletzt gesungen' },
  { key: 'title', label: 'A–Z', long: 'nach Titel' },
];

/**
 * **Ein Knopf statt drei Pillen.** Die Sortierung ist eine Einstellung, die man
 * selten ändert, und drei Pillen in einer eigenen Zeile nahmen der Liste mehr
 * Platz als die Frage wert ist. Jeder Druck schaltet zur nächsten; was gerade
 * gilt, steht auf dem Knopf.
 */
function SortButton({
  sort,
  onChange,
}: {
  sort: SongSort;
  onChange: (sort: SongSort) => void;
}) {
  const index = SORTS.findIndex((entry) => entry.key === sort);
  const current = SORTS[index] ?? SORTS[0]!;
  const next = SORTS[(index + 1) % SORTS.length] ?? SORTS[0]!;

  return (
    <button
      type="button"
      onClick={() => onChange(next.key)}
      aria-label={`Sortiert ${current.long} — tippen für ${next.long}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-[12px] font-semibold text-stone-600 transition-colors hover:border-line-strong',
        PRESSABLE,
      )}
    >
      <ListFilterIcon size={13} className="text-terracotta-500" aria-hidden />
      {current.label}
    </button>
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
          icon={needle ? <SearchX size={22} /> : <FileMusic size={22} />}
          title={needle ? 'Nichts gefunden' : 'Noch keine eigene Version'}
          hint={
            needle
              ? `Keines deiner Lieder passt zu „${search}".`
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

function AllSongs({ search, sort }: { search: string; sort: SongSort }) {
  const owned = useOwnSongIds();

  const query = useSongList({ search: search || undefined, sort });

  return (
    <>
      {query.isLoading && <CardSkeleton />}
      {query.error && <ErrorState error={query.error} />}
      {!query.isLoading && query.items.length === 0 && (
        <EmptyState
          icon={search ? <SearchX size={22} /> : <Music size={22} />}
          title={search ? 'Nichts gefunden' : 'Noch keine Lieder'}
          hint={
            search
              ? `Kein Lied passt zu „${search}".`
              : 'Die Liste wächst mit jedem Vorschlag an einem Abend — oder über das „+" unten rechts.'
          }
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
 * Ändern und Löschen stehen auf der Seite des Lieds unter „Bearbeiten", der
 * Link ganz oben — die Zeile hat nur eine Aufgabe: dorthin zu führen.
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
