'use client';

/**
 * Wie sich die Kopfleiste zum Scrollen verhält.
 *
 * Zwei Antworten, und sie sind verschieden: `atTop` entscheidet über das
 * **Aussehen** (Schleier über dem Kopfbild oder solider Balken), `hidden` über
 * die **Anwesenheit**. Ein Zustand daraus zu machen ginge nicht — beim
 * Zurückwischen mitten in der Seite ist die Leiste da und trotzdem nicht oben.
 */
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useOverlayOpen } from '@/components/ui/overlay-lock';
import { useHeaderPreference } from '@/lib/header-preference';
import { useHeaderSuppressed } from './header-suppress';
import { NAV_ITEMS } from './nav';

/** Ab hier gilt die Seite nicht mehr als „ganz oben". */
const TOP_THRESHOLD = 8;

/**
 * Bevor eine Richtung gilt, muss sie diese Strecke zurückgelegt haben.
 *
 * Ohne die Schwelle zittert die Leiste: Ein Finger, der beim Scrollen kurz
 * nachgibt, erzeugt ein Pixel Gegenrichtung, und sie führe herein und wieder
 * hinaus.
 *
 * **Kleiner als `TOP_THRESHOLD`, und das ist der Punkt.** Hier stand einmal
 * zusätzlich ein `HIDE_AFTER = 96`: „erst ab zwei Leistenhöhen wegfahren",
 * gedacht als Ruhe. In Wahrheit war es ein Fenster von 88 Pixeln, in dem die
 * Leiste sichtbar *und* schon im Balken-Zustand war — beim Runterscrollen
 * blitzte also genau das auf, was man erst beim Zurückwischen sehen soll.
 * Jetzt ist sie weg, **bevor** `atTop` überhaupt umschlägt, und den Balken
 * bekommt man nur auf dem Weg nach oben zu Gesicht.
 */
const DIRECTION_THRESHOLD = 6;

export function useHeaderScroll(): {
  atTop: boolean;
  hidden: boolean;
  /** Ein Bildschirm hat sie weggeschickt (`header-suppress.ts`). */
  suppressed: boolean;
} {
  const [atTop, setAtTop] = useState(true);
  const [hidden, setHidden] = useState(false);
  const pathname = usePathname();
  const overlay = useOverlayOpen();
  const suppressed = useHeaderSuppressed();

  // Ein Wechsel des Ziels beginnt oben — Next scrollt dorthin zurück. Ohne
  // das bliebe die Leiste auf einer frisch geöffneten Seite weggefahren.
  useEffect(() => {
    setAtTop(true);
    setHidden(false);
  }, [pathname]);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;

    const read = () => {
      frame = 0;
      const y = window.scrollY;

      setAtTop(y < TOP_THRESHOLD);

      const delta = y - last;
      if (Math.abs(delta) < DIRECTION_THRESHOLD) return;
      last = y;

      // Nach unten heißt weg, nach oben heißt sofort zurück. Beide `setState`
      // dieses Durchlaufs fasst React zu einem Render zusammen — auch bei
      // einem Fling von 0 auf 300 gibt es kein Zwischenbild, in dem die
      // Leiste schon solide und noch da wäre.
      setHidden(delta > 0 && y > 0);
    };

    // Gedrosselt auf ein Bild: `scroll` feuert auf iOS bei jedem Frame, und
    // zwei `setState` je Ereignis wären zwei Renderdurchläufe zu viel.
    const onScroll = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  // Liegt ein Sheet darüber, bleibt sie stehen. `lockOverlay` friert den
  // Hintergrund ohnehin ein; ohne diese Zeile bliebe sie in dem Zustand
  // hängen, in dem sie beim Öffnen gerade war — meistens weggefahren.
  //
  // Die Bitte eines Bildschirms sticht beides: Im Suchmodus soll sie auch dann
  // weg sein, wenn darüber gerade ein Sheet liegt.
  return { atTop, hidden: (hidden && !overlay) || suppressed, suppressed };
}

/**
 * Ob dieser Bildschirm die Kopfleiste trägt.
 *
 * Nur die fünf Ziele der Tabbar. Die Detailseiten haben oben links ihren
 * eigenen Zurück-Pfeil, und eine Navigationsleiste darüber wäre eine Ebene zu
 * viel: Dort ist man *in* etwas drin und nicht auf Navigations-Ebene.
 *
 * Gegen `NAV_ITEMS` geprüft und nicht gegen eine zweite Liste — dieselbe Regel
 * wie `useIsActive`, damit es genau eine Aufzählung der Tabs gibt. `/termin`
 * fällt dabei von selbst heraus: Es ist kein Präfix von `/termine`.
 *
 * **Und ob man sie überhaupt haben will.** Die Einstellung liegt im Gerät
 * (`useHeaderPreference`) und hängt hier — an genau einer Zeile, von der alles
 * andere abfällt: `SmartHeader` rendert dann nichts, `PageHeader` nimmt wieder
 * seinen eigenen Abstand zur Statusleiste statt des Leisten-Abstands, und die
 * Nachrichten-Box verschwindet mit der Glocke, die sie öffnet. Der Weg zur
 * Gruppe steht dann im Profil.
 */
export function useHasSmartHeader(): boolean {
  const pathname = usePathname();
  const { shown } = useHeaderPreference();

  return (
    shown &&
    NAV_ITEMS.some(({ href }) =>
      href === '/' ? pathname === '/' : pathname.startsWith(href),
    )
  );
}
