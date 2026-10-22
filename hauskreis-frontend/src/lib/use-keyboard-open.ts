'use client';

import { useEffect, useState } from 'react';

/**
 * Um so viel muss der Ausschnitt schrumpfen, damit es eine Tastatur ist —
 * eine Adressleiste, die ein- und ausfährt, ist deutlich kleiner.
 */
const KEYBOARD_MIN = 120;

/** Eingabetypen, für die eine Bildschirmtastatur aufgeht. */
const TEXT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
]);

function takesText(element: Element | null): boolean {
  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly && !element.disabled;
  }
  if (element instanceof HTMLInputElement) {
    return (
      TEXT_TYPES.has(element.type) && !element.readOnly && !element.disabled
    );
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

/**
 * Ob gerade eine Bildschirmtastatur offen ist — so gut der Browser es verrät.
 *
 * **Wozu.** Die Tab-Leiste klebt am unteren Rand des Layouts. Liegt ein Feld
 * weiter unten, schiebt iOS beim Tippen den sichtbaren Ausschnitt bis an den
 * Seitenfuß, und dann stünde die Leiste direkt über der Tastatur: fünf Ziele,
 * die man beim Schreiben nicht meint, auf dem knappsten Platz des Bildschirms.
 *
 * **Woran es erkannt wird.** Eine Frage „ist die Tastatur offen" kennt das Web
 * nicht. Die Antwort setzt sich aus zwei Hälften zusammen:
 * - **Ein Textfeld hat den Fokus.** Das stimmt sofort, noch während die
 *   Tastatur einfährt, und auf iOS geht sie auch nur mit dem Fokus wieder zu.
 * - **Der sichtbare Ausschnitt ist geschrumpft.** Das braucht es für Android:
 *   Dort schließt die Zurück-Taste die Tastatur, und das Feld behält den
 *   Fokus. Deshalb folgt der Zustand der Höhe, sobald einmal eine Tastatur zu
 *   sehen war — vorher gilt der Fokus allein, sonst blitzte die Leiste beim
 *   Einfahren auf. Tippt man danach wieder ins Feld, geht die Tastatur ohne
 *   neuen Fokus auf, und die Höhe holt das nach.
 *
 * Nur auf Touch-Geräten: Am Rechner gibt es keine Bildschirmtastatur, und in
 * einem schmalen Fenster soll die Leiste beim Tippen nicht verschwinden.
 *
 * **Was es nicht kann:** Eine Hardware-Tastatur am iPad lässt den Ausschnitt
 * stehen, dort gilt also der Fokus — die Leiste ist weg, solange ein Feld
 * aktiv ist. Das ist ein kleinerer Fehler als der umgekehrte.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const touch = window.matchMedia('(hover: none) and (pointer: coarse)');
    const viewport = window.visualViewport;

    /** Die größte Höhe je Breite — also je Ausrichtung — ohne Tastatur. */
    const tallest = new Map<number, number>();
    /** Ob seit dem Fokus schon eine Tastatur zu sehen war. */
    let seen = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const shrunk = (): boolean => {
      if (!viewport) return false;
      const width = Math.round(viewport.width);
      const full = Math.max(tallest.get(width) ?? 0, viewport.height);
      tallest.set(width, full);
      return viewport.height < full - KEYBOARD_MIN;
    };

    const update = () => {
      const small = shrunk();

      if (!touch.matches || !takesText(document.activeElement)) {
        seen = false;
        setOpen(false);
        return;
      }

      if (small) seen = true;
      setOpen(seen ? small : true);
    };

    const onFocusIn = () => {
      clearTimeout(timer);
      seen = false;
      update();
    };

    // Erst im nächsten Takt: Beim Wechsel von Feld zu Feld steht in diesem
    // Moment noch `body` im Fokus, und die Leiste blitzte kurz auf.
    const onFocusOut = () => {
      clearTimeout(timer);
      timer = setTimeout(update);
    };

    update();
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    viewport?.addEventListener('resize', update);
    touch.addEventListener('change', update);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      viewport?.removeEventListener('resize', update);
      touch.removeEventListener('change', update);
    };
  }, []);

  return open;
}
