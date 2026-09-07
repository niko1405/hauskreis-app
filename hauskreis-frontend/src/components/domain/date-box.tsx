'use client';

/**
 * Die Kopfzeile eines Termins — das Datums-Kästchen und die Zeile „wann und
 * wo" darunter.
 *
 * **Warum die beiden hier stehen und nicht in einer der Karten.** Sie standen
 * zweimal da, wortgleich: in `meeting-card.tsx` und in der `NextMeetingCard`
 * auf „Heute". Solange beide nur ein Datum untereinandersetzten, war das
 * verschmerzbar; seit das Kästchen einen eigenen Rahmen, eine eigene Tönung und
 * eine zweistellige Zahl hat, wären es zwei Meinungen darüber, wie ein Termin
 * aussieht — und die eine hätte man beim nächsten Griff vergessen.
 */
import { Clock, MapPin } from 'lucide-react';
import { dayParts } from '@/lib/date';
import { mapsUrl } from '@/lib/meeting';
import type { CalendarDay } from '@/lib/date';

/** Was `mapsUrl` braucht, plus den Namen, der in der Zeile steht. */
interface Place {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Wochentag, Tag, Monat — der Anker links an jeder Terminkarte.
 *
 * Ein Zeitraum bekommt keins: „14.–16." passt nicht hinein, und eine Freizeit
 * ist kein Tag. Das entscheidet die Karte, nicht dieses Kästchen — es kennt nur
 * den einen Tag, den es zeigt.
 */
export function DateBox({ day }: { day: CalendarDay }) {
  const tag = dayParts(day);

  return (
    <span className="flex w-14 shrink-0 flex-col items-center rounded-xl border border-terracotta-100 bg-terracotta-50/60 py-2 leading-none">
      <span className="text-[10px] font-bold tracking-wider text-terracotta-500 uppercase">
        {tag.weekday}
      </span>
      <span className="mt-1.5 font-serif text-2xl font-bold text-stone-800">
        {tag.day}
      </span>
      <span className="mt-1.5 text-[9px] font-semibold tracking-wider text-stone-400 uppercase">
        {tag.month}
      </span>
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
 * „19:30 Uhr · Bei Julian" — die Zeile unter dem Titel.
 *
 * Die beiden Symbole sind **terracotta** und nicht grau: Sie sind die einzigen
 * Farbtupfer der Zeile und sagen auf einen Blick, welche Angabe welche ist —
 * grau verschwammen sie mit dem Text, den sie beschriften.
 */
export function TimeAndPlace({
  startTime,
  location,
  linkToMaps = false,
  extra,
}: {
  startTime: string;
  /** Ein Termin ohne Ort ist kein Fehler — z. B. draußen im Park. */
  location: Place | null;
  /**
   * Ob der Ort nach Maps führt. Auf „Heute" ja — dort geht man auf den Abend
   * zu. In der Liste nicht: Sie ist selbst ein Link auf den Termin, und ein
   * Link im Link ist ein Ziel, das niemand meint.
   */
  linkToMaps?: boolean;
  /** Noch eine Angabe hinten dran, mit eigenem Trenner. */
  extra?: React.ReactNode;
}) {
  const place = (
    <>
      <MapPin size={13} className="shrink-0 text-terracotta-500" />
      {location?.name ?? 'Ort noch offen'}
    </>
  );

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-stone-500">
      <span className="flex items-center gap-1.5">
        <Clock size={13} className="shrink-0 text-terracotta-500" />
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
        <span className="flex items-center gap-1.5">{place}</span>
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
