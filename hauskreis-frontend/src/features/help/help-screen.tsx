'use client';

/**
 * „Hilfe" — was die App tut und warum sie es so tut.
 *
 * Die größte Lücke bisher: Das Baukasten-System, die Vorschlagslogik und das
 * Themen-System sind ohne Erklärung nicht zu erraten. Neun Leute sehen nur die
 * Oberfläche, und wer nicht versteht, warum ein Feld grau ist, hält es für
 * kaputt.
 *
 * **Gefiltert wird hier im Gerät**, nicht auf dem Server — anders als im
 * Archiv, das nach oben fragt. Der ganze Text liegt in `faq-content.ts` und ist
 * damit auch ohne Netz da, was für eine Hilfeseite das halbe Argument ist.
 *
 * `<details>` statt eigener Auf-und-Zu-Zustand: Tastatur, Vorlesesoftware und
 * die Suchfunktion des Browsers kommen damit umsonst. Bei aktiver Suche stehen
 * die Treffer offen — wer sucht, will lesen, nicht nochmal klicken.
 */
import { ChevronDown, Search, Shield } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { TextInput } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/states';
import { useMe } from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import {
  FAQ_CATEGORIES,
  FAQ_ENTRIES,
  FIRST_STEPS_ID,
  type FaqCategory,
  type FaqEntry,
} from './faq-content';
import { useUnreadFirstSteps } from './use-unread-help';

/**
 * Vergleichsform: klein und ohne Akzente.
 *
 * Wer „vorschlage" tippt, meint „Vorschläge", und wer auf dem Telefon schreibt,
 * lässt Umlaute gern weg. `NFD` zerlegt „ä" in „a" und ein Zeichen aus dem
 * Bereich der Akzente; das zweite fällt hier weg. Für gut achtzig Einträge ist
 * das billig genug, um es bei jedem Tastendruck zu tun.
 */
function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function haystack(entry: FaqEntry): string {
  return normalize(
    [entry.question, entry.answer, ...(entry.keywords ?? [])].join(' '),
  );
}

export function HelpScreen() {
  const me = useMe();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FaqCategory | 'all'>('all');
  const deferred = useDeferredValue(search).trim();

  // Solange unklar ist, ob jemand Admin ist, gilt „nein". Andersherum blitzte
  // ein Bereich auf, der gleich wieder verschwindet.
  const isAdmin = me.isAdmin;

  const visible = useMemo(
    () => FAQ_ENTRIES.filter((entry) => isAdmin || !entry.adminOnly),
    [isAdmin],
  );

  // Eine Kategorie, von der nichts übrig ist, hat auch keine Pille verdient.
  const categories = useMemo(
    () =>
      FAQ_CATEGORIES.filter((item) =>
        visible.some((entry) => entry.category === item.id),
      ),
    [visible],
  );

  const results = useMemo(() => {
    const needle = normalize(deferred);
    return visible.filter(
      (entry) =>
        (category === 'all' || entry.category === category) &&
        (needle === '' || haystack(entry).includes(needle)),
    );
  }, [visible, category, deferred]);

  const searching = deferred !== '';

  // Bei aktiver Suche eine durchgehende Liste: Treffer über Kategorien hinweg
  // in Grüppchen zu zerlegen versteckt das Ergebnis, statt es zu zeigen.
  const groups = searching
    ? [{ id: 'results' as const, label: null, entries: results }]
    : categories
        .filter((item) => category === 'all' || item.id === category)
        .map((item) => ({
          id: item.id,
          label: item.label,
          entries: results.filter((entry) => entry.category === item.id),
        }))
        .filter((group) => group.entries.length > 0);

  // ── Der Wegweiser vom Punkt am Profil ───────────────────────────────────
  //
  // `guide` bleibt für diesen Besuch stehen, `unread` nicht: `markSeen()`
  // löscht den Merker sofort, und hinge das Aufklappen daran, fiele die Frage
  // im selben Wimpernschlag wieder zu, in dem sie aufging.
  const { unread: firstStepsUnread, markSeen } = useUnreadFirstSteps();
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    if (!firstStepsUnread) return;
    setGuide(true);
    markSeen();
  }, [firstStepsUnread, markSeen]);

  useEffect(() => {
    if (!guide) return;
    // Nach dem Render, in dem der Eintrag offen steht — vorher hat er die
    // Höhe einer Zeile und das Springen zielte auf die falsche Stelle.
    document
      .getElementById(`faq-${FIRST_STEPS_ID}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [guide]);

  return (
    <div>
      <PageHeader title="Hilfe" subtitle="Wie die App funktioniert" />

      <div className="space-y-4 px-5">
        <div className="relative">
          <Search
            size={15}
            className="absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-300"
          />
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Wonach suchst du?"
            className="pl-9"
            aria-label="Hilfe durchsuchen"
          />
        </div>

        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          <Pill
            active={category === 'all'}
            onClick={() => setCategory('all')}
            label="Alle"
          />
          {categories.map((item) => (
            <Pill
              key={item.id}
              active={category === item.id}
              onClick={() => setCategory(item.id)}
              label={item.label}
              icon={item.id === 'admin' ? <Shield size={11} /> : undefined}
            />
          ))}
        </div>

        {results.length === 0 ? (
          <EmptyState
            title="Dazu steht hier nichts"
            hint="Versuch es mit einem anderen Wort — oder schreib Niko, dann kommt die Antwort dazu."
          />
        ) : (
          <div className="space-y-6 pb-4">
            {groups.map((group) => (
              <section key={group.id}>
                {group.label && (
                  <h2 className="mb-2 px-1 text-xs font-bold tracking-wider text-stone-400 uppercase">
                    {group.label}
                  </h2>
                )}
                <div className="space-y-2">
                  {group.entries.map((entry) => (
                    <Entry
                      // Der Schlüssel trägt Suchbegriff und Wegweiser mit: Er
                      // baut den Eintrag neu auf, sobald sich einer der beiden
                      // ändert, und damit greift das `open` unten auch beim
                      // zweiten Wort. Ohne das bliebe `open` die
                      // Anfangsstellung eines längst montierten `<details>`.
                      key={`${entry.id}-${searching}-${guide}`}
                      entry={entry}
                      open={searching || (guide && entry.id === FIRST_STEPS_ID)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-bold transition-colors',
        active
          ? 'border-terracotta-500 bg-terracotta-500 text-white'
          : 'border-line bg-card text-stone-500 hover:border-line-strong',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Entry({ entry, open }: { entry: FaqEntry; open: boolean }) {
  return (
    <details
      // Der Anker, den der Wegweiser anspringt. Am `<details>` und nicht am
      // `<summary>`, damit `block: 'center'` den aufgeklappten Text mittig
      // stellt und nicht nur seine Überschrift.
      id={`faq-${entry.id}`}
      open={open}
      className="group rounded-card border border-line bg-card shadow-sm shadow-stone-200/40 open:border-line-strong"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-sm font-bold text-stone-800 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{entry.question}</span>
        <ChevronDown
          size={16}
          className="shrink-0 text-stone-400 transition-transform group-open:rotate-180"
        />
      </summary>
      {/* Leerzeile trennt Absätze, einzelner Umbruch trennt Zeilen — das
          erledigt `whitespace-pre-line`, damit Aufzählungen nicht zu einem
          Fließtext zusammenlaufen und es dafür keinen zweiten Mechanismus
          braucht.

          Der Index als Schlüssel ist hier genau richtig: Die Absätze eines
          Antworttextes stehen fest, sie kommen nicht dazu, gehen nicht weg und
          tauschen nie den Platz. */}
      <div className="space-y-3 px-5 pb-5 text-sm leading-relaxed text-stone-500">
        {entry.answer.split('\n\n').map((paragraph, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <p key={index} className="whitespace-pre-line">
            <Emphasised text={paragraph} />
          </p>
        ))}
      </div>
    </details>
  );
}

/**
 * `**fett**` im Antworttext.
 *
 * Ein ganzer Markdown-Übersetzer wäre für eine Auszeichnung zu viel Gepäck —
 * und Fettdruck ist die einzige, die diese Texte brauchen: Sie tragen die
 * Sätze, auf die es ankommt.
 */
function Emphasised({ text }: { text: string }) {
  return (
    <>
      {/* Auch hier ist der Index der richtige Schlüssel — und mehr noch: Er
          *ist* die Information. `split` mit Gruppe liefert abwechselnd Text und
          Auszeichnung, ungerade Stellen sind die fetten. */}
      {text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
        index % 2 === 1 ? (
          // eslint-disable-next-line react/no-array-index-key
          <strong key={index} className="font-semibold text-stone-700">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}
