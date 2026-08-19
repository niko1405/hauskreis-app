'use client';

/**
 * „Archiv" — vergangene Termine, abgeschlossene Themen und die
 * Song-Datenbank. Gesucht wird serverseitig (`search`), sonst müsste die App
 * mit der Zeit alles laden, nur um clientseitig zu filtern.
 */
import {
  ArrowLeft,
  FileText,
  Layers,
  Music,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Button, IconButton, PRESSABLE } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Field, TextArea, TextInput } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import {
  CardSkeleton,
  EmptyState,
  ErrorState,
  LoadMore,
} from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useLongPress } from '@/components/ui/use-long-press';
import { LyricsLink } from '@/components/domain/lyrics-link';
import { SongSheet } from '@/components/domain/song-sheet';
import { LocationsCard } from './locations-card';
import { MeetingsArchive } from './meetings-archive';
import { errorMessage } from '@/lib/api/errors';
import {
  useArchiveSummary,
  useCreateStandaloneSession,
  useCreateTopic,
  useDeleteSong,
  useSongList,
  useTopicList,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import { formatDay, formatRelativeDay } from '@/lib/date';
import type { SongListParams } from '@/lib/api/params';
import type { SongListItem, TopicListItem } from '@/lib/api/types';

type Tab = 'themen' | 'lieder' | 'orte' | 'termine';

export function ArchiveScreen() {
  const [tab, setTab] = useState<Tab>('themen');
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search).trim();
  const summary = useArchiveSummary();

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
    // `totals.meetings` zählt ohne abgesagte — dasselbe, was die Liste in ihrer
    // Vorgabe zeigt. Eine Zahl, die größer ist als das, was darunter steht,
    // wirft genau die Frage auf, die sie beantworten soll.
    { key: 'termine', label: 'Termine', count: summary.data?.totals.meetings },
  ];

  return (
    <div>
      {/* Ohne Kopfbild, aus demselben Grund wie bei „Termine": hier liest man
          Listen und sucht eine Zeile. Ein Foto darüber wäre nur Weg bis zur
          ersten — und anders als auf „Heute" oder „Gebet" kommt man hierher
          selten zum Verweilen. */}
      <PageHeader
        title="Archiv"
        subtitle="Durchsuche vergangene Termine, Themen, Locations und Lieder."
      />

      <div className="space-y-4 px-5">
        <div className="relative">
          <Search
            size={15}
            className="absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-300"
          />
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Durchsuchen …"
            className="pl-9"
            aria-label="Archiv durchsuchen"
          />
        </div>

        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
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

        {tab === 'themen' && <TopicArchive search={deferred} />}
        {tab === 'lieder' && <SongLibrary search={deferred} />}
        {tab === 'orte' && <LocationsCard />}
        {tab === 'termine' && <MeetingsArchive search={deferred} />}
      </div>
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
  const [anlegen, setAnlegen] = useState(false);
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
        <TopicTab
          active={nurEigene}
          count={summary.data?.totals.topicsMine}
          onSelect={() => setNurEigene(true)}
        >
          Eigene Themen
        </TopicTab>
        <TopicTab
          active={!nurEigene}
          count={summary.data?.totals.topics}
          onSelect={() => setNurEigene(false)}
        >
          Alle Themen
        </TopicTab>
      </div>

      <p className="px-1 text-[11px] text-stone-400">
        {nurEigene
          ? '— auch die, die noch niemand gesehen hat'
          : '— alles, wovon schon ein Abend war'}
      </p>

      {/* Ein Thema entstand lange nur beim Wählen an einem Abend. Wer eines
          vorbereiten wollte, musste also erst auf einen Dienstag warten. */}
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => setAnlegen(true)}
      >
        <Plus size={14} />
        Neu anlegen
      </Button>

      <NewEntrySheet open={anlegen} onClose={() => setAnlegen(false)} />

      {query.isLoading && <CardSkeleton />}
      {query.error && <ErrorState error={query.error} />}

      {!query.isLoading && !query.error && query.items.length === 0 && (
        <EmptyState
          title={nurEigene ? 'Du hast noch kein Thema' : 'Noch keine Themen'}
          hint={
            nurEigene
              ? 'Sobald du für einen Abend zugeteilt bist, kannst du dort eines anfangen.'
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

function TopicTab({
  active,
  count,
  onSelect,
  children,
}: {
  active: boolean;
  count: number | undefined;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        'flex-1 border-b-2 pb-2.5 text-sm font-semibold transition-colors',
        active
          ? 'border-terracotta-500 text-terracotta-600'
          : 'border-transparent text-stone-400 hover:text-stone-600',
      )}
    >
      {children}
      {count !== undefined && (
        <span className="ml-1.5 text-xs opacity-60">({count})</span>
      )}
    </button>
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
          hint="Zieht sich über mehrere Abende. Die Einheiten kommen danach dazu."
          onSelect={() => setArt('thema')}
        />
        <ArtRow
          icon={<FileText size={18} />}
          title="Eine einzelne Einheit"
          hint="Ein Abend für sich, ohne Bogen darüber. Ein Überthema lässt sich später jederzeit ergänzen."
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
      subtitle="Ein Abend für sich. Ein Überthema lässt sich später jederzeit ergänzen."
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
                    toast.success('Angelegt — wählbar an jedem Abend.');
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
          placeholder="Worum geht es an diesem Abend?"
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
 */
function TopicEntry({ topic }: { topic: TopicListItem }) {
  const leute = [
    ...(topic.owner ? [topic.owner] : []),
    ...topic.collaborators.map((c) => c.person),
  ];

  // Bei einer Hülle ist die eine Einheit der ganze Eintrag. Sie kann fehlen,
  // wenn der Server sie zurückhält — dann bleibt die Zeile ohne Inhalt, und das
  // ist richtig so.
  const einzelne = topic.standalone ? topic.sessions[0] : undefined;

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
      <Card className="transition-colors hover:border-line-strong">
        <div className="flex items-start gap-2.5">
          <span
            className="mt-0.5 shrink-0 text-stone-300"
            aria-label={topic.standalone ? 'Einzelne Einheit' : 'Thema'}
          >
            {topic.standalone ? <FileText size={15} /> : <Layers size={15} />}
          </span>

          <h3 className="min-w-0 flex-1 font-serif text-base font-bold text-stone-900">
            {titel}
          </h3>

          {/* Nur für die eigenen: bei einem fremden Thema sagt „läuft" nichts,
              was man tun könnte. */}
          {topic.mine && !topic.standalone && topic.status === 'RUNNING' && (
            <Badge variant="topic">läuft</Badge>
          )}
        </div>

        {text && (
          <p className="mt-1.5 line-clamp-2 pl-[25px] text-xs leading-relaxed text-stone-500">
            {text}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-3 pl-[25px]">
          <AvatarStack people={leute} size="xs" />
          <span className="text-[11px] text-stone-400">
            {topic.standalone
              ? einzelne?.meeting
                ? formatDay(einzelne.meeting.date)
                : 'noch an keinem Abend'
              : topic.sessions.length === 1
                ? '1 Einheit'
                : `${topic.sessions.length} Einheiten`}
          </span>
        </div>
      </Card>
    </Link>
  );
}

function SongLibrary({ search }: { search: string }) {
  const [sort, setSort] =
    useState<NonNullable<SongListParams['sort']>>('popular');
  const [adding, setAdding] = useState(false);

  const query = useSongList({ search: search || undefined, sort });

  const sorts: { key: NonNullable<SongListParams['sort']>; label: string }[] = [
    { key: 'popular', label: 'Am häufigsten' },
    { key: 'recent', label: 'Zuletzt gesungen' },
    { key: 'title', label: 'A–Z' },
  ];

  return (
    <div className="space-y-3">
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

      {/* Bisher wuchs die Liederliste nur über die Vorschläge an einem Abend.
          Ein Lied, das man kennt und erst nächsten Monat singen will, hatte
          keinen Weg hinein — und der Weg, den es dann bekam, war ein
          Plus-Symbol am Rand, das man suchen musste. Jetzt derselbe Knopf an
          derselben Stelle wie „Neues Thema" nebenan. */}
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => setAdding(true)}
      >
        <Plus size={14} />
        Neues Lied
      </Button>

      <SongSheet open={adding} onClose={() => setAdding(false)} />

      {query.isLoading && <CardSkeleton />}
      {query.error && <ErrorState error={query.error} />}
      {!query.isLoading && query.items.length === 0 && (
        <EmptyState
          title="Noch keine Lieder"
          hint="Die Datenbank wächst mit jedem Vorschlag an einem Termin."
        />
      )}

      {query.items.length > 0 && (
        // Einmal über der Liste, nicht an jeder Zeile: eine Geste, die man
        // nicht sieht, muss dastehen
        <p className="px-1 text-[11px] text-stone-400">
          Lange auf ein Lied drücken, um es zu ändern oder zu löschen.
        </p>
      )}

      <ul className="space-y-2">
        {query.items.map((song, index) => (
          <SongRow
            key={song.id}
            song={song}
            rank={sort === 'popular' ? index + 1 : undefined}
          />
        ))}
      </ul>

      <LoadMore query={query} label="Mehr Lieder" />
    </div>
  );
}

/**
 * Eine Liedzeile — und ihre Knöpfe erst nach langem Druck.
 *
 * Stift und Papierkorb standen dauerhaft da: zwei Ziele an jeder Zeile einer
 * Liste, durch die man scrollt, und beide traf der Daumen zuverlässiger als
 * die Zeile selbst. Jetzt liegen sie hinter einer Geste, die man nicht
 * versehentlich macht — lange drücken oder rechtsklicken.
 *
 * **Kein Platzhalter, der sie freihält.** Drei Knöpfe sind auf einem 390px
 * breiten Bildschirm ein Drittel der Zeile; sie dauerhaft freizuhalten nähme
 * dem Titel genau den Platz, den diese Änderung ihm geben soll. Dass die Zeile
 * beim Aufklappen umbricht, ist verkraftbar — sie ist in dem Moment ohnehin
 * hervorgehoben, man sieht also, dass etwas passiert ist.
 */
function SongRow({ song, rank }: { song: SongListItem; rank?: number }) {
  const remove = useDeleteSong();
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const { handlers, selectNone } = useLongPress(() => setRevealed(true));

  const deleteSong = async () => {
    const ok = await confirm({
      title: `„${song.title}" löschen?`,
      // Die Zahl gehört in die Rückfrage: ein Tippfehler von gestern und
      // ein Lied, das an acht Abenden lief, sind nicht dieselbe
      // Entscheidung.
      body:
        song.timesPlayed > 0
          ? `Das Lied lief an ${song.timesPlayed} Abend${song.timesPlayed === 1 ? '' : 'en'}. Es verschwindet auch dort aus der Liste.`
          : 'Das Lied wurde noch nie gesungen — es geht nichts verloren.',
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;

    remove.mutate(song.id, {
      onSuccess: () => toast.success(`„${song.title}" ist weg.`),
    });
  };

  return (
    <li
      {...handlers}
      className={cn(
        'flex items-center gap-3 rounded-md border bg-card p-3 transition-colors',
        revealed ? 'border-terracotta-100 bg-terracotta-50/40' : 'border-line',
        selectNone,
      )}
    >
      {rank !== undefined && (
        <span className="w-6 shrink-0 text-center text-xs font-bold text-stone-300">
          {rank}
        </span>
      )}
      <Music size={15} className="shrink-0 text-stone-300" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-stone-800">
          {song.title}
        </p>
        <p className="truncate text-[11px] text-stone-400">
          {song.artist ?? 'Unbekannt'} · {song.timesPlayed}×
          {song.lastPlayedAt &&
            `, zuletzt ${formatRelativeDay(song.lastPlayedAt)}`}
        </p>
      </div>
      {song.createdBy && !revealed && (
        <Avatar person={song.createdBy} size="xs" />
      )}
      {!revealed && <LyricsLink url={song.lyricsUrl} title={song.title} />}

      {revealed && (
        <>
          <IconButton
            label={`${song.title} bearbeiten`}
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} />
          </IconButton>

          <IconButton label={`${song.title} löschen`} onClick={deleteSong}>
            <Trash2 size={14} />
          </IconButton>

          {/* Ein Weg zurück, ohne die Seite zu verlassen. Ohne ihn bliebe die
              Zeile aufgeklappt, bis die Liste neu lädt. */}
          <IconButton label="Fertig" onClick={() => setRevealed(false)}>
            <X size={14} />
          </IconButton>
        </>
      )}

      {editing && (
        <SongSheet open onClose={() => setEditing(false)} song={song} />
      )}
    </li>
  );
}
