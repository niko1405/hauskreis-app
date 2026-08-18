'use client';

/**
 * Der dünne Strich oben, solange etwas unterwegs ist.
 *
 * **Er beantwortet die Frage, die der gedrückte Zustand offen lässt.** Ein
 * Knopf, der beim Antippen nachgibt, sagt „ich habe dich gehört"; er sagt
 * nicht, ob noch etwas läuft. Bei schlechter Verbindung war genau das die
 * Lücke: Man tippte, es passierte sichtbar nichts, und eine Sekunde später
 * sprang die Ansicht um. Aus Sicht des Menschen davor war die App eingefroren.
 *
 * **Erst nach einer Verzögerung.** Fast jede Abfrage ist in unter 200 ms
 * durch — ein Balken, der dabei aufblitzt, wäre Flackern und keine Auskunft.
 * Nach der Wartezeit ist er ein Hinweis auf etwas, das wirklich dauert.
 *
 * Bewusst ohne Fortschritt: Wie weit eine Anfrage ist, weiß niemand. Der
 * Balken läuft deshalb in einer Schleife, statt einen Prozentsatz zu
 * behaupten.
 */
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/** Kürzer wäre Flackern, länger käme zu spät. */
const DELAY_MS = 300;

export function GlobalProgress() {
  const busy = useIsFetching() + useIsMutating() > 0;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!busy) {
      setShown(false);
      return;
    }

    const timer = setTimeout(() => setShown(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  return (
    <div
      // `aria-hidden`: Für Bildschirmleser sagen die Ladezustände der
      // einzelnen Bereiche mehr als ein Strich am Seitenrand.
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden"
    >
      <div
        className={`h-full w-2/5 rounded-full bg-terracotta-500 transition-opacity duration-200 ${
          shown ? 'animate-progress opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}
