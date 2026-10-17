import type { Prisma } from '../../generated/prisma/client';

/**
 * Wer an einer Notiz was darf — als reine Funktionen, wie bei den Themen
 * (`topic-visibility.ts`).
 *
 * Zwei Fragen, nicht drei: **Lesen heißt schreiben.** Wen man dazunimmt, nimmt
 * man zum Mitschreiben dazu — eine Notiz, die jemand lesen, aber nicht
 * verbessern darf, wäre ein Aushang, und dafür gibt es die Gruppenseite.
 *
 * **Kein Admin-Weg**, an keiner der beiden. Eine Notiz unter zweien ist keine
 * Verwaltungsangelegenheit, und eine Verwaltung, die mitliest, wäre ein Grund,
 * hier nichts aufzuschreiben.
 */
export interface NoteAccess {
  createdByPersonId: string | null;
  /** Ob, wer sie angelegt hat, noch zur Gruppe gehört. */
  creatorActive: boolean;
  forEveryone: boolean;
  memberIds: readonly string[];
}

/** Dabei ist, wer sie angelegt hat, wer eingetragen ist — oder alle. */
export function mayReadNote(note: NoteAccess, viewerId: string): boolean {
  return (
    note.forEveryone ||
    note.createdByPersonId === viewerId ||
    note.memberIds.includes(viewerId)
  );
}

/**
 * Leute, „Ganze Gruppe" und Löschen gehören dem, der sie angelegt hat.
 *
 * Der **Notausgang** wie bei den Themen: Ist er gegangen oder hat sein Konto
 * gelöscht, darf jede:r, der dabei ist. Sonst gäbe es Notizen, an deren Kreis
 * niemand mehr etwas ändern kann.
 */
export function mayManageNote(note: NoteAccess, viewerId: string): boolean {
  if (note.createdByPersonId === viewerId) return true;
  const orphaned = note.createdByPersonId === null || !note.creatorActive;
  return orphaned && mayReadNote(note, viewerId);
}

/**
 * Dieselbe Regel als Abfrage — für die Liste und jedes Laden.
 *
 * Was jemand nicht lesen darf, gibt es für ihn nicht: Die Antwort ist ein 404
 * und kein 403, sonst verriete schon die Fehlermeldung, dass da etwas ist.
 */
export function visibleNotesWhere(
  hauskreisId: string,
  viewerId: string,
): Prisma.NoteWhereInput {
  return {
    hauskreisId,
    OR: [
      { forEveryone: true },
      { createdByPersonId: viewerId },
      { members: { some: { personId: viewerId } } },
    ],
  };
}
