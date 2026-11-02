'use client';

/**
 * Scrollen schließt die Tastatur — im Suchmodus, wie bei Spotify.
 *
 * Nicht nur aus Gewohnheit: Bei offener Tastatur schiebt iOS den sichtbaren
 * Ausschnitt gegen das Layout, und `sticky` klebt am Layout. Ein Suchfeld, das
 * oben „klebt", rutschte damit beim Scrollen durch die Treffer aus dem Bild.
 * Ohne Tastatur sind beide dasselbe.
 *
 * Genommen wird nur der Fokus eines Textfelds, und nur, wenn der Finger
 * außerhalb davon zieht — wer im Feld selbst den Cursor verschiebt, will
 * weitertippen. Den Suchmodus beendet das nicht; weitertippen heißt einmal ins
 * Feld tippen.
 *
 * Gebraucht im Archiv und auf „Termine".
 */
import { useEffect } from 'react';

export function useBlurOnTouchMove(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const onTouchMove = (event: TouchEvent) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLInputElement)) return;
      if (event.target instanceof Node && active.contains(event.target)) return;
      active.blur();
    };

    document.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => document.removeEventListener('touchmove', onTouchMove);
  }, [enabled]);
}
