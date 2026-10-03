'use client';

/**
 * „Präferenzen" — welche Nachrichten du bekommst, nach Bereichen sortiert.
 *
 * **Warum ein eigener Bildschirm.** Die zwanzig Arten standen als eine
 * ungegliederte Liste mitten im Profil, zwischen Abwesenheiten und Konto. Zwanzig
 * Schalter untereinander sind keine Liste mehr, sondern eine Wand: Man findet
 * den einen nicht, den man sucht, und scrollt an allem anderen vorbei. Im Profil
 * bleibt jetzt das, was man **einmal** einstellt (Gerät an, Test schicken) —
 * hier steht, was man **nachschlägt**.
 *
 * **Die Kategorie kommt vom Server** (`NOTIFICATION_CATALOG`). Eine zweite
 * Aufzählung hier wäre die, die beim nächsten neuen Eintrag vergessen wird, und
 * der Schalter stünde dann unter „Sonstiges" oder gar nicht.
 *
 * **Gefiltert wird im Gerät**, wie in der Hilfe und anders als im Archiv: Die
 * zwanzig Einträge liegen ohnehin schon im Cache, und eine Anfrage pro
 * Tastendruck für eine Liste, die auf einen Bildschirm passt, wäre Aufwand ohne
 * Gegenwert.
 */
import { Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Card } from '@/components/ui/card';
import { Select, TextInput } from '@/components/ui/field';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  useNotificationSettings,
  useUpdateNotificationSetting,
} from '@/lib/api/hooks';
import { cn } from '@/lib/cn';
import type { NotificationSetting } from '@/lib/api/types';

const WEEKDAYS = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];

/**
 * Vergleichsform: klein und ohne Akzente — wie in der Hilfe.
 *
 * Wer „gebetsbuddy" tippt, meint „Neue Gebetsbuddys", und wer auf dem Telefon
 * schreibt, lässt Umlaute gern weg.
 */
function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function NotificationPreferencesScreen() {
  const settings = useNotificationSettings();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | 'all'>('all');
  const deferred = useDeferredValue(search).trim();

  const all = useMemo(() => settings.data ?? [], [settings.data]);

  // Die Reihenfolge des Katalogs ist die Reihenfolge hier: erst, was man selbst
  // zu tun hat, dann der Abend, dann die Gruppe. Deshalb aus den Einträgen
  // gelesen und nicht sortiert.
  const categories = useMemo(
    () => [...new Set(all.map((setting) => setting.category))],
    [all],
  );

  const results = useMemo(() => {
    const needle = normalize(deferred);

    return all.filter(
      (setting) =>
        (category === 'all' || setting.category === category) &&
        (needle === '' ||
          normalize(`${setting.label} ${setting.description}`).includes(
            needle,
          )),
    );
  }, [all, category, deferred]);

  const searching = deferred !== '';

  // Bei aktiver Suche eine durchgehende Liste: Treffer über Bereiche hinweg in
  // Grüppchen zu zerlegen versteckt das Ergebnis, statt es zu zeigen.
  const groups = searching
    ? [{ id: 'results', label: null, entries: results }]
    : categories
        .filter((item) => category === 'all' || item === category)
        .map((item) => ({
          id: item,
          label: item,
          entries: results.filter((setting) => setting.category === item),
        }))
        .filter((group) => group.entries.length > 0);

  const an = all.filter((setting) => setting.enabled).length;

  return (
    <div>
      <PageHeader
        title="Präferenzen"
        subtitle="Welche Nachrichten du bekommst"
        back="/profil"
      />

      <div className="space-y-4 px-5">
        {settings.isLoading && <CardSkeleton />}

        {settings.error && (
          <ErrorState
            error={settings.error}
            onRetry={() => void settings.refetch()}
          />
        )}

        {all.length > 0 && (
          <>
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
                aria-label="Benachrichtigungen durchsuchen"
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
                  key={item}
                  active={category === item}
                  onClick={() => setCategory(item)}
                  label={item}
                />
              ))}
            </div>

            {/* Eine Zahl und kein Balken: Sie beantwortet die eine Frage, die
                man auf diesem Bildschirm sonst nur durch Scrollen beantwortet
                — „habe ich eigentlich etwas abgeschaltet?" */}
            <p className="px-1 text-[11px] text-stone-400">
              {an} von {all.length} Arten sind an.
            </p>
          </>
        )}

        {!settings.isLoading && results.length === 0 && all.length > 0 && (
          <EmptyState
            title="Dazu gibt es keinen Schalter"
            hint="Versuch es mit einem anderen Wort."
          />
        )}

        <div className="space-y-6 pb-4">
          {groups.map((group) => (
            <section key={group.id}>
              {group.label && (
                <h2 className="mb-2 px-1 text-xs font-bold tracking-wider text-stone-400 uppercase">
                  {group.label}
                </h2>
              )}
              <Card className="space-y-5">
                {group.entries.map((setting) => (
                  <SettingRow key={setting.type} setting={setting} />
                ))}
              </Card>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
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
      {label}
    </button>
  );
}

/**
 * Eine Art mit ihrem Schalter — und, wenn es etwas einzustellen gibt, damit.
 *
 * Die Zeitplanung ist je Art anders aufgebaut (`schedule.kind`): Vorlauftage,
 * feste Wochentage oder gar nichts, weil sie an einem Ereignis hängt. Die Spec
 * hat dafür zwar eine Union, aber keinen `discriminator`; unterschieden wird
 * hier von Hand.
 */
function SettingRow({ setting }: { setting: NotificationSetting }) {
  const update = useUpdateNotificationSetting();

  const change = (input: Parameters<typeof update.mutate>[0]['input']) =>
    update.mutate({ type: setting.type, input });

  return (
    <div className="space-y-2">
      <label className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-stone-800">
            {setting.label}
          </span>
          <span className="block text-[11px] leading-relaxed text-stone-400">
            {setting.description}
          </span>
        </span>
        <input
          type="checkbox"
          aria-label={setting.label}
          checked={setting.enabled}
          onChange={(event) => change({ enabled: event.target.checked })}
          className="mt-1 h-5 w-5 shrink-0 rounded border-line-strong text-terracotta-500 focus:ring-terracotta-500"
        />
      </label>

      {setting.enabled && setting.schedule.kind === 'LEAD_TIME' && (
        <Select
          aria-label={`Vorlauf für ${setting.label}`}
          value={String(setting.leadDays ?? setting.schedule.defaultLeadDays)}
          onChange={(event) => change({ leadDays: Number(event.target.value) })}
          className="text-xs"
        >
          {leadDayOptions(
            setting.schedule.minLeadDays,
            setting.schedule.maxLeadDays,
          ).map((days) => (
            <option key={days} value={days}>
              {days === 0
                ? 'am selben Tag'
                : days === 1
                  ? '1 Tag vorher'
                  : `${days} Tage vorher`}
            </option>
          ))}
        </Select>
      )}

      {setting.enabled && setting.schedule.kind === 'WEEKLY' && (
        <WeekdayPicker
          label={setting.label}
          chosen={setting.weekdays}
          onChange={(weekdays) => change({ weekdays })}
        />
      )}
      {/* `kind === 'EVENT'` hat nichts einzustellen — sie kommt, wenn sie kommt. */}
    </div>
  );
}

/**
 * Mehrere Tage statt einem.
 *
 * Ein Actionstep verträgt mehr als eine Nachfrage pro Woche — einmal zur
 * Wochenmitte und einmal kurz vor dem nächsten Abend sind zwei verschiedene
 * Erinnerungen, nicht dieselbe zweimal. Deshalb Schalter statt Auswahlliste:
 * bei sieben kurzen Möglichkeiten sieht man so auf einen Blick, was gilt.
 *
 * Den letzten Tag abzuwählen ist erlaubt und heißt „wieder wie voreingestellt";
 * wer gar nichts hören will, schaltet die Art selbst aus.
 */
function WeekdayPicker({
  label,
  chosen,
  onChange,
}: {
  label: string;
  chosen: number[];
  onChange: (weekdays: number[]) => void;
}) {
  const toggle = (day: number) => {
    const next = chosen.includes(day)
      ? chosen.filter((entry) => entry !== day)
      : [...chosen, day];

    onChange(next.toSorted((a, b) => a - b));
  };

  return (
    <div>
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={`Wochentage für ${label}`}
      >
        {WEEKDAYS.map((day, index) => {
          const active = chosen.includes(index);

          return (
            <button
              key={day}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(index)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors',
                active
                  ? 'border-terracotta-500 bg-terracotta-500 text-white'
                  : 'border-line bg-card text-stone-500 hover:border-line-strong',
              )}
            >
              {day.slice(0, 2)}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-stone-400">
        {chosen.length === 0
          ? 'Kein Tag gewählt — es gilt die Voreinstellung.'
          : `Jeden ${chosen.map((day) => WEEKDAYS[day]).join(' und ')}`}
      </p>
    </div>
  );
}

function leadDayOptions(min: number, max: number): number[] {
  const options: number[] = [];
  for (let day = min; day <= max; day += 1) options.push(day);
  return options;
}
