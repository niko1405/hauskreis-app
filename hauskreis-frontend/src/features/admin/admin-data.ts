'use client';

/**
 * Was die Verwaltung zum Zeichnen braucht — an einer Stelle, weil zwei Stellen
 * es brauchen: die Seite selbst, die erst erscheint, wenn alles da ist
 * (`AdminReady`), und das Vorladen, bevor man sie öffnet (`WarmUp`).
 *
 * Die Abschnitte rufen ihre Hooks weiterhin selbst; TanStack Query fragt
 * dieselbe Adresse nur einmal. Kommt ein Abschnitt dazu, der etwas Neues lädt,
 * gehört sein Hook auch hierher — sonst springt er wieder einzeln auf.
 */
import {
  useBirthdayConfig,
  useGiftPairings,
  useLocations,
  usePeople,
  usePrayerBuddyConfig,
} from '@/lib/api/hooks';

export function useAdminData() {
  return [
    usePeople(),
    usePrayerBuddyConfig(),
    useBirthdayConfig(),
    useGiftPairings(),
    useLocations(),
  ] as const;
}
