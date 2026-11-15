'use client';

/**
 * Was der Bildschirm der Gruppe zum Zeichnen braucht — für ihn selbst, der
 * erst erscheint, wenn alles da ist, und fürs Vorladen (`WarmUp`). Wie
 * `features/admin/admin-data.ts`.
 */
import { useHauskreisDetail, useIdeas, usePeople } from '@/lib/api/hooks';

export function useGroupData() {
  return [useHauskreisDetail(), useIdeas(), usePeople()] as const;
}
