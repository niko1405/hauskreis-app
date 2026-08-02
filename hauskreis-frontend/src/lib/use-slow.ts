'use client';

import { useEffect, useState } from 'react';

/**
 * Meldet, wenn ein Zustand ungewöhnlich lange dauert.
 *
 * Gedacht für Wartebildschirme, hinter denen etwas steckt, das keine eigene
 * Frist hat — das Laden der OIDC-Metadaten etwa. Bricht die Verbindung
 * mittendrin ab, wird daraus sonst ein Ladebalken ohne Ende und ohne Ausweg.
 */
export function useSlow(active: boolean, delayMs = 12_000): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return slow;
}
