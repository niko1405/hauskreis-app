'use client';

/**
 * Die Kopfzeile eines Termins — das Datums-Kästchen und die Zeile „wann und
 * wo" darunter.
 *
 * **Warum die beiden hier stehen und nicht in einer der Karten.** Zwei
 * brauchen sie: `meeting-card.tsx` und die `NextMeetingCard` auf „Heute". Zwei
 * Kopien wären zwei Meinungen darüber, wie ein Termin aussieht — und die eine
 * vergäße man beim nächsten Griff.
 */
import { Clock, House, MapPin } from 'lucide-react';
import { cn } from '@/lib/cn';
import { dayParts } from '@/lib/date';
import { mapsUrl } from '@/lib/meeting';
import type { CalendarDay } from '@/lib/date';

/** Was `mapsUrl` braucht, plus den Namen, der in der Zeile steht. */
interface Place {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Ein Zuhause — dort steht der Gastgeber statt des Ortsnamens. */
  requiresHost: boolean;
}

/**
 * Wochentag, Tag, Monat — der Anker links an jeder Terminkarte.
 *
 * Ein Zeitraum bekommt in der Liste keins: „14.–16." passt nicht hinein, und
 * eine Freizeit ist kein Tag. Das entscheidet die Karte, nicht dieses Kästchen.
 *
 * **`size="sm"`** ist die Fassung unter dem Kalender: ohne Monat — der steht
 * groß darüber — und schmaler, damit die Zeile kompakt bleibt. Dort darf es
 * auch einen Zeitraum tragen (`until`, „14–16"): Neben dem Raster ist die
 * Spanne die Auskunft, die man sucht.
 *
 * **`tone="special"`** ist ein besonderer Termin: dasselbe Kästchen in Gold
 * statt Terracotta, passend zum goldenen Rahmen der Karte.
 */
export function DateBox({
  day,
  until,
  size = 'md',
  tone = 'default',
}: {
  day: CalendarDay;
  /** Nur in der kleinen Fassung: der letzte Tag eines Zeitraums. */
  until?: CalendarDay | null;
  size?: 'md' | 'sm';
  tone?: 'default' | 'special';
}) {
  const tag = dayParts(day);
  const small = size === 'sm';
  const special = tone === 'special';

  return (
    <span
      className={cn(
        'flex shrink-0 flex-col items-center rounded-xl border leading-none',
        small ? 'w-11 py-1.5' : 'w-14 py-2',
        special
          ? 'border-special-line bg-special-bg'
          : 'border-terracotta-100 bg-terracotta-50/60',
      )}
    >
      <span
        className={cn(
          'font-bold tracking-wider uppercase',
          small ? 'text-[9px]' : 'text-[10px]',
          special ? 'text-special' : 'text-terracotta-500',
        )}
      >
        {tag.weekday}
      </span>
      <span
        className={cn(
          'font-serif font-bold text-stone-800',
          small ? 'mt-1' : 'mt-1.5 text-2xl',
          small && (until ? 'text-sm' : 'text-lg'),
        )}
      >
        {small && until ? `${tag.day}–${dayParts(until).day}` : tag.day}
      </span>
      {!small && (
        <span className="mt-1.5 text-[9px] font-semibold tracking-wider text-stone-400 uppercase">
          {tag.month}
        </span>
      )}
    </span>
  );
}

/**
 * Der Trenner zwischen zwei Angaben in einer Zeile.
 *
 * Ein Punkt und kein zweiter Abstand: „19:30 Uhr" und „Bei Julian" sind zwei
 * Antworten auf zwei Fragen, und nebeneinander ohne Zeichen liest man sie als
 * eine.
 */
function Dot() {
  return (
    <span aria-hidden className="text-stone-300">
      ·
    </span>
  );
}

/**
 * „19:30 Uhr · ⌂ Julian" — die Zeile unter dem Titel.
 *
 * Die beiden Symbole sind **terracotta** und nicht grau: Sie sind die einzigen
 * Farbtupfer der Zeile und sagen auf einen Blick, welche Angabe welche ist —
 * grau verschwammen sie mit dem Text, den sie beschriften.
 *
 * **Bei jemandem zu Hause steht der Gastgeber, mit einem Haus davor**, bei
 * einem Treffpunkt sein Name mit der Stecknadel. Ort und Gastgeber sind dort
 * dieselbe Auskunft: Neben „Bei Julian" stand sonst noch ein Chip „Host:
 * Julian" — zweimal derselbe Mensch auf einer Karte. Ohne Ort bleibt es bei
 * „Ort noch offen"; ob es ein Zuhause wird, weiß dann noch niemand.
 */
export function TimeAndPlace({
  startTime,
  location,
  host = null,
  linkToMaps = false,
  extra,
  size = 'md',
}: {
  startTime: string;
  /** Ein Termin ohne Ort ist kein Fehler — z. B. draußen im Park. */
  location: Place | null;
  /** Der Gastgeber des Abends; steht bei einem Zuhause statt des Ortsnamens. */
  host?: { name: string } | null;
  /**
   * Ob der Ort nach Maps führt. Auf „Heute" ja — dort geht man auf den Abend
   * zu. In der Liste nicht: Sie ist selbst ein Link auf den Termin, und ein
   * Link im Link ist ein Ziel, das niemand meint.
   */
  linkToMaps?: boolean;
  /** Noch eine Angabe hinten dran, mit eigenem Trenner. */
  extra?: React.ReactNode;
  /** Die knappe Fassung für die Zeilen unter dem Kalender: eine Zeile, kleiner. */
  size?: 'md' | 'sm';
}) {
  const small = size === 'sm';
  const iconSize = small ? 12 : 13;
  const home = location ? location.requiresHost : host !== null;
  const PlaceIcon = home ? House : MapPin;
  const place = (
    <>
      <PlaceIcon size={iconSize} className="shrink-0 text-terracotta-500" />
      <span className={cn(small && 'truncate')}>
        {(home && host?.name) || location?.name || 'Ort noch offen'}
      </span>
    </>
  );

  return (
    <div
      className={cn(
        'flex items-center gap-x-2 font-medium text-stone-500',
        small
          ? 'mt-0.5 min-w-0 text-[12px]'
          : 'mt-1.5 flex-wrap gap-y-1 text-[13px]',
      )}
    >
      <span className="flex shrink-0 items-center gap-1.5">
        <Clock size={iconSize} className="shrink-0 text-terracotta-500" />
        {startTime} Uhr
      </span>

      <Dot />

      {linkToMaps && location ? (
        <a
          href={mapsUrl(location)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 hover:text-terracotta-600"
        >
          {place}
        </a>
      ) : (
        <span className={cn('flex items-center gap-1.5', small && 'min-w-0')}>
          {place}
        </span>
      )}

      {extra && (
        <>
          <Dot />
          <span className="text-stone-400">{extra}</span>
        </>
      )}
    </div>
  );
}
