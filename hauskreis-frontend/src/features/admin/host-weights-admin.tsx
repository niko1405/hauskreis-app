'use client';

/**
 * Wie oft die Gruppe bei wem sein möchte.
 *
 * Die Zahl ist keine Eigenschaft der Wohnung, sondern eine Aussage der Gruppe
 * über ihre Gastgeber:innen — „bei dir sind wir gern öfter" liest sich neben
 * dem eigenen Namen anders als in einer Verwaltungsliste. Und eine 0,5 zu
 * sehen, die man nicht ändern kann und deren Herkunft man nicht kennt, wirft
 * nur Fragen auf.
 *
 * Deshalb hier, hinter `RequireAdmin`. Der Server erzwingt das nicht —
 * `PATCH …/locations/:id` steht jedem Mitglied offen, weil Orte anzulegen und
 * zu pflegen ausdrücklich niemandes Vorrecht ist. Das ist eine Frage der
 * Oberfläche, keine Sicherheitsgrenze, und sie so zu behandeln wäre eine
 * Sicherheit, die keine ist.
 *
 * **Stufen statt einer Zahl.** „1,5" sagt niemandem etwas, „oft" schon. Die
 * vier Stufen decken ab, was eine Gruppe tatsächlich meint; wer es genauer
 * will, nimmt „Benutzerdefiniert" und bekommt das Zahlenfeld zurück.
 */
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Home,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Card, SectionTitle } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { useLocations, useSetHostWeight } from '@/lib/api/hooks';
import { isHome } from '@/lib/location';
import type { Location } from '@/lib/api/types';
import { useAdminDraftSection } from './admin-draft';

type Level = 'never' | 'rare' | 'normal' | 'often' | 'custom';

/** Die vier Stufen und ihr Gewicht — „Normal" ist die Vorgabe jeder Wohnung. */
const PRESETS: {
  level: Exclude<Level, 'custom'>;
  label: string;
  weight: number;
}[] = [
  { level: 'never', label: 'Nie', weight: 0 },
  { level: 'rare', label: 'Selten', weight: 0.5 },
  { level: 'normal', label: 'Normal', weight: 1 },
  { level: 'often', label: 'Oft', weight: 2 },
];

/**
 * Wie eine abweichende Zeile aussieht — **je Stufe anders**.
 *
 * Normal ist neutral, damit die Ausnahmen auffallen. „Nie" tritt zurück wie
 * etwas, das ausgeschaltet ist. Die übrigen tragen die Richtung im Symbol und
 * eine Kante in `info` — es ist eine Auskunft („hier weicht etwas ab"), keine
 * Warnung und keine Auswahl; Terracotta bleibt dem gewählten Segment.
 */
const LOOKS: Record<
  Level,
  { icon: LucideIcon; row: string; iconTone: string }
> = {
  normal: { icon: Home, row: 'border-line', iconTone: 'text-stone-300' },
  never: {
    icon: Ban,
    row: 'border-dashed border-line-strong bg-canvas',
    iconTone: 'text-stone-400',
  },
  rare: { icon: ArrowDown, row: 'border-info-line', iconTone: 'text-info' },
  often: { icon: ArrowUp, row: 'border-info-line', iconTone: 'text-info' },
  custom: {
    icon: SlidersHorizontal,
    row: 'border-info-line',
    iconTone: 'text-info',
  },
};

/**
 * Die Farben des Verteilungsbalkens, in fester Reihenfolge der Wohnungen.
 *
 * **Die Farbe folgt der Wohnung, nicht ihrem Anteil**: Wer eine auf „Nie"
 * stellt, nimmt ihr Segment weg, aber die übrigen behalten ihre Farbe. Acht
 * sind geprüft (`--color-chart-*`); eine neunte Wohnung bekommt keine
 * erfundene, sondern Grau — die Zahl daneben sagt trotzdem, wer es ist.
 */
const CHART = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
  'bg-chart-6',
  'bg-chart-7',
  'bg-chart-8',
];
const chartColor = (index: number) => CHART[index] ?? 'bg-stone-300';

interface Choice {
  level: Level;
  /** Der Text im Zahlenfeld — auch bei einer Stufe, damit er beim Umschalten bleibt. */
  custom: string;
}

function choiceOf(weight: number): Choice {
  const preset = PRESETS.find((entry) => entry.weight === weight);
  return { level: preset?.level ?? 'custom', custom: formatWeight(weight) };
}

/** Das Gewicht einer Wahl — `null`, wenn im Zahlenfeld keine gültige Zahl steht. */
function weightOf(choice: Choice): number | null {
  const preset = PRESETS.find((entry) => entry.level === choice.level);
  if (preset) return preset.weight;

  const text = choice.custom.trim().replace(',', '.');
  const value = Number(text);
  return text !== '' && Number.isFinite(value) && value >= 0 && value <= 99
    ? value
    : null;
}

function formatWeight(weight: number): string {
  return weight.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

export function HostWeightsAdmin() {
  const locations = useLocations();
  const setWeight = useSetHostWeight();
  /** Nur die Zeilen, die angefasst wurden. */
  const [draft, setDraft] = useState<Record<string, Choice>>({});

  // Nur bewohnte Wohnungen: eine leere steht in keiner Rotation, und ein
  // Treffpunkt gehört gar nicht erst hinein — er ist eine wetterabhängige
  // Möglichkeit, nicht jemand, der mal wieder dran wäre.
  const homes = (locations.data ?? []).filter(
    (location) => isHome(location) && location.active,
  );

  const choiceFor = (location: Location) =>
    draft[location.id] ?? choiceOf(location.hostWeight);

  const changed = homes.filter((location) => {
    const weight = weightOf(choiceFor(location));
    return weight !== null && weight !== location.hostWeight;
  });
  const broken = homes.some(
    (location) => weightOf(choiceFor(location)) === null,
  );

  useAdminDraftSection('weights', {
    dirty: changed.length > 0 || broken,
    invalid: broken
      ? 'Bei der Gewichtung fehlt eine Zahl zwischen 0 und 99.'
      : undefined,
    save: async () => {
      // Je Wohnung ein Schreibvorgang — das Gewicht steht am Ort, und jeder
      // hat seinen eigenen ETag.
      for (const location of changed) {
        await setWeight.mutateAsync({
          locationId: location.id,
          hostWeight: weightOf(choiceFor(location))!,
        });
      }
      // Erst den neuen Stand holen, dann den Entwurf verwerfen — sonst stünde
      // einen Augenblick lang wieder das alte Gewicht da.
      await locations.refetch();
      setDraft({});
    },
    reset: () => setDraft({}),
  });

  const weights = homes.map((location) => weightOf(choiceFor(location)) ?? 0);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  return (
    <section>
      <SectionTitle
        info={
          <>
            <strong className="font-semibold">Nie</strong> heißt: Die App
            schlägt die Wohnung nicht vor, sie bleibt aber in der Liste.{' '}
            <strong className="font-semibold">Selten</strong> ist halb so oft
            wie normal, <strong className="font-semibold">Oft</strong> doppelt
            so oft. Mit „Benutzerdefiniert“ gibst du eine eigene Zahl ein — 1
            ist normal. Wer zusammen wohnt, teilt sich den Wert. Der Balken
            zeigt, wie sich die Vorschläge damit ungefähr verteilen.
          </>
        }
      >
        Gewichtung
      </SectionTitle>
      <Card className="space-y-4">
        <p className="text-[11px] leading-relaxed text-stone-400">
          Gib an, wie oft die App den jeweiligen Ort vorschlagen soll.
        </p>

        {locations.isLoading && <Skeleton className="h-24 w-full" />}

        {homes.length > 0 && (
          <Distribution homes={homes} weights={weights} total={total} />
        )}

        <ul className="space-y-2">
          {homes.map((location, index) => (
            <WeightRow
              key={location.id}
              location={location}
              choice={choiceFor(location)}
              color={chartColor(index)}
              share={total > 0 ? (weights[index] ?? 0) / total : null}
              onChange={(choice) =>
                setDraft((current) => ({ ...current, [location.id]: choice }))
              }
            />
          ))}
        </ul>
      </Card>
    </section>
  );
}

/**
 * Wie sich die Vorschläge auf die Wohnungen verteilen — ein gestapelter
 * Balken, gerechnet aus dem **Entwurf**, damit man beim Umstellen sieht, was
 * es bewirkt.
 *
 * Ein Anteil ist keine Zusage: Die Rangfolge der Vorschläge rechnet auch mit,
 * wann jemand zuletzt dran war. Der Balken zeigt das Verhältnis, auf das sie
 * auf Dauer hinausläuft — deshalb „ungefähr".
 *
 * Zwischen den Segmenten liegt ein Spalt in Kartenfarbe; die Zahl je Wohnung
 * steht in ihrer Zeile neben einem Punkt in derselben Farbe. So hängt nichts
 * an der Farbe allein.
 */
function Distribution({
  homes,
  weights,
  total,
}: {
  homes: Location[];
  weights: number[];
  total: number;
}) {
  if (total === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-strong p-3 text-center text-[11px] text-stone-400">
        Alle Wohnungen stehen auf „Nie“ — die App schlägt niemanden vor.
      </p>
    );
  }

  return (
    <div>
      <div
        role="img"
        aria-label={`Ungefähre Verteilung: ${homes
          .map(
            (location, index) =>
              `${location.name} ${percent((weights[index] ?? 0) / total)}`,
          )
          .join(', ')}`}
        className="flex h-3 gap-0.5 overflow-hidden rounded-full"
      >
        {homes.map((location, index) => {
          const weight = weights[index] ?? 0;
          if (weight === 0) return null;

          return (
            <span
              key={location.id}
              title={`${location.name} · ${percent(weight / total)}`}
              style={{ flexGrow: weight }}
              className={cn(
                'min-w-1 basis-0 transition-[flex-grow] duration-300',
                chartColor(index),
              )}
            />
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] font-semibold tracking-wider text-stone-400 uppercase">
        Ungefähre Verteilung der Vorschläge
      </p>
    </div>
  );
}

function percent(share: number): string {
  return `${Math.round(share * 100)} %`;
}

function WeightRow({
  location,
  choice,
  color,
  share,
  onChange,
}: {
  location: Location;
  choice: Choice;
  color: string;
  /** Anteil am Balken, `null`, wenn alle auf „Nie“ stehen. */
  share: number | null;
  onChange: (choice: Choice) => void;
}) {
  const look = LOOKS[choice.level];
  const Icon = look.icon;
  const invalid = weightOf(choice) === null;

  return (
    <li
      className={cn(
        'space-y-2.5 rounded-md border p-3 transition-colors',
        look.row,
      )}
    >
      <div className="flex items-center gap-2.5">
        <Icon size={15} className={cn('shrink-0', look.iconTone)} aria-hidden />

        <p
          className={cn(
            'min-w-0 truncate text-sm font-bold',
            choice.level === 'never' ? 'text-stone-400' : 'text-stone-800',
          )}
        >
          {location.name}
        </p>

        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-stone-500 tabular-nums">
          {share !== null && share > 0 ? (
            <>
              <span aria-hidden className={cn('size-2 rounded-full', color)} />
              {percent(share)}
            </>
          ) : (
            <span className="text-stone-400">nie</span>
          )}
        </span>
      </div>

      <Segmented<Level>
        fill
        size="sm"
        label={`Wie oft bei ${location.name}`}
        value={choice.level}
        onChange={(level) => onChange({ ...choice, level })}
        options={[
          ...PRESETS.map(({ level, label }) => ({ value: level, label })),
          {
            value: 'custom',
            label: 'Benutzerdefiniert',
            icon: <SlidersHorizontal size={12} />,
          },
        ]}
      />

      {choice.level === 'custom' && (
        <label className="flex items-center gap-2 text-[11px] text-stone-500">
          Gewicht
          <input
            type="text"
            inputMode="decimal"
            value={choice.custom}
            aria-label={`Gewicht für ${location.name}`}
            aria-invalid={invalid}
            onChange={(event) =>
              onChange({ ...choice, custom: event.target.value })
            }
            className={cn(
              'w-20 rounded-md border bg-card px-2 py-1 text-right text-sm font-bold text-stone-800 tabular-nums focus:ring-2 focus:ring-terracotta-100 focus:outline-none',
              invalid
                ? 'border-alert'
                : 'border-line focus:border-terracotta-400',
            )}
          />
          <span className="text-stone-400">1 = normal</span>
        </label>
      )}
    </li>
  );
}
