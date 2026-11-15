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
import { useEffect, useRef, useState } from 'react';
import { useOverlayOpen } from '@/components/ui/overlay-lock';
import { useHeaderPreference } from '@/lib/header-preference';
import { useHeaderSuppressed } from './header-suppress';
import { isTabRoute } from './nav';

/** Ab hier gilt die Seite nicht mehr als „ganz oben". */
const TOP_THRESHOLD = 8;

/**
 * Bevor eine Richtung gilt, muss sie diese Strecke zurückgelegt haben.
 *
 * Ohne die Schwelle zittert die Leiste: Ein Finger, der beim Scrollen kurz
 * nachgibt, erzeugt ein Pixel Gegenrichtung, und sie führe herein und wieder
 * hinaus.
 *
 * **Kleiner als `TOP_THRESHOLD`, und das ist der Punkt.** Die Leiste ist weg,
 * **bevor** `atTop` überhaupt umschlägt — sonst gäbe es ein Fenster, in dem
 * sie sichtbar *und* schon im Balken-Zustand ist. Den Balken bekommt man nur
 * auf dem Weg nach oben zu Gesicht.
 */
const DIRECTION_THRESHOLD = 6;

/**
 * **Erst ab hier holt das Hochwischen die Leiste zurück.**
 *
 * Darunter ist man fast oben, und die Leiste käme für einen Augenblick, um
 * gleich danach in den Schleier überzugehen — oder auf „Termine" ganz oben
 * wieder zu verschwinden. Ein Balken, der nur kurz aufblitzt, sieht aus wie
 * ein Fehler. Wer weiter unten hochwischt, bekommt sie wie bisher; wer nahe
 * dem Anfang ist, ist ohnehin gleich oben.
 */
const REVEAL_MIN = 240;

/**
 * Wie die Kopfleiste auf einem Tab steht.
 *
 * - `full`: oben als Schleier über dem Kopfbild, beim Zurückwischen als Balken
 *   — Heute, Gebet, Profil.
 * - `scroll`: **nur** beim Zurückwischen, nie ganz oben. Auf „Termine" steht
 *   oben der Titel mit eigenen Knöpfen, und darüber nur „Gruppe" und Glocke
 *   ohne Bild wäre eine leere Zeile.
 * - `none`: gar nicht. Im Archiv klebt beim Scrollen die Kapsel der
 *   Kategorien oben, und eine Leiste, die beim Hochwischen darüberführe,
 *   deckte genau sie zu.
 */
export type HeaderMode = 'full' | 'scroll' | 'none';

export function headerModeOf(pathname: string): HeaderMode {
  if (pathname.startsWith('/archiv')) return 'none';
  if (pathname.startsWith('/termine')) return 'scroll';
  return 'full';
}

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
  /** Für den Scroll-Handler, der nur einmal angemeldet wird. */
  const frozen = useRef(false);

  useEffect(() => {
    frozen.current = overlay;
  }, [overlay]);

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

      // Unter einem Sheet zählt kein Scrollen: iOS lässt die Seite trotz
      // `overflow: hidden` nachfedern, und die Leiste käme hinter dem Sheet
      // hervor. Die Strecke wird trotzdem mitgeführt, sonst zählte nach dem
      // Schließen der ganze Weg als eine Bewegung.
      if (frozen.current) {
        last = y;
        return;
      }

      setAtTop(y < TOP_THRESHOLD);

      // Ganz oben ist sie da (als Schleier), egal woher man kam — auch wenn
      // der letzte Schritt dorthin kleiner war als die Richtungsschwelle.
      if (y < TOP_THRESHOLD) {
        last = y;
        setHidden(false);
        return;
      }

      const delta = y - last;
      if (Math.abs(delta) < DIRECTION_THRESHOLD) return;
      last = y;

      // Nach unten heißt weg, nach oben heißt zurück — aber nur mit Anlauf
      // (`REVEAL_MIN`). Beide `setState` dieses Durchlaufs fasst React zu
      // einem Render zusammen — auch bei einem Fling von 0 auf 300 gibt es kein
      // Zwischenbild, in dem die Leiste schon solide und noch da wäre.
      if (delta > 0) setHidden(true);
      else if (y > REVEAL_MIN) setHidden(false);
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

  // **Liegt ein Sheet darüber, bleibt sie, wie sie war.** War sie
  // weggefahren, kommt sie nicht hervor: Hinter dem Sheet tauchte sonst eine
  // Leiste auf, als hätte man nach oben gewischt — und das hat man nicht.
  //
  // Die Bitte eines Bildschirms sticht das: Im Suchmodus ist sie weg, auch
  // wenn darüber gerade ein Sheet liegt.
  return {
    atTop,
    hidden: hidden || suppressed,
    suppressed,
  };
}

/**
 * Ob dieser Bildschirm die Kopfleiste trägt.
 *
 * Nur die fünf Ziele der Tabbar. Die Detailseiten haben oben links ihren
 * eigenen Zurück-Pfeil, und eine Navigationsleiste darüber wäre eine Ebene zu
 * viel: Dort ist man *in* etwas drin und nicht auf Navigations-Ebene.
 *
 * Gegen `isTabRoute` geprüft und nicht gegen eine zweite Liste — dieselbe
 * Regel wie für die Leiste unten, damit es genau eine Aufzählung der Tabs
 * gibt. `/termin` fällt dabei von selbst heraus: Es ist kein Präfix von
 * `/termine`.
 *
 * **Am Rechner nie** — dort trägt die Seitenspalte, wofür es die Leiste gibt.
 * Das entscheidet CSS und nicht diese Funktion (`md:hidden` an der Leiste,
 * `.pt-header-6` in `globals.css`): Die Seiten werden zur Bauzeit gerendert,
 * und eine Breitenabfrage hier gäbe beim ersten Bild die falsche Antwort.
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

  return shown && isTabRoute(pathname) && headerModeOf(pathname) !== 'none';
}

/**
 * Ob die Leiste **ganz oben** über dem Titel liegt — und der Kopf ihr deshalb
 * Platz lassen muss (`PageHeader`). Auf „Termine" nicht: Dort kommt sie erst
 * beim Zurückwischen, und oben stünde sonst eine leere Fläche über dem Titel.
 */
export function useHeaderOverTitle(): boolean {
  const pathname = usePathname();
  return useHasSmartHeader() && headerModeOf(pathname) === 'full';
}

/**
 * Wo ohne Kopfleiste trotzdem die Glocke steht: auf „Heute" und im Profil,
 * ganz oben und nicht klebend. Die Nachrichten-Box hängt an ihr, und ohne
 * diesen einen Eingang wäre sie mit der Leiste ganz weg.
 */
export function isBellOnlyRoute(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/profil');
}
