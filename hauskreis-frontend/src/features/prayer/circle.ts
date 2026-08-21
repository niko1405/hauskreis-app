import type { PersonRef } from '@/lib/api/types';

/** Wer für wen betet — aus der Sicht einer Person in der Gruppe. */
export interface Circle {
  size: number;
  /** Die Person, für die du betest. */
  betestFuer: PersonRef;
  /**
   * Die Person, die für dich betet. Beim Paar ist das dieselbe wie
   * `betestFuer` — ein Kreis aus zweien heißt „füreinander".
   */
  betetFuerDich: PersonRef;
}

/**
 * Die Richtung im Kreis: **Wer auf `i` steht, betet für den auf `(i + 1) % n`.**
 *
 * Die Reihenfolge der Mitglieder *ist* der Kreis — so kommt sie aus der
 * Datenbank (`PrayerBuddyGroupMember.position`) und so steht es in beiden
 * Antwort-Schemata. Hier steht sie einmal, statt an jeder Stelle, die sie
 * anzeigt: Gebet-Bildschirm und Startbildschirm sagen sonst mit zwei Kopien
 * derselben Rechnung irgendwann zwei verschiedene Dinge.
 *
 * `null`, wenn der Betrachter nicht dabei ist oder allein in seiner Gruppe
 * steht — beides Zustände ohne Gegenüber.
 */
export function circleOf(
  members: readonly PersonRef[],
  myId: string | undefined,
): Circle | null {
  const index = members.findIndex((member) => member.id === myId);

  if (index < 0 || members.length <= 1) {
    return null;
  }

  const betestFuer = members[(index + 1) % members.length];
  const betetFuerDich = members[(index - 1 + members.length) % members.length];

  // Beides ist nach der Rechnung oben immer besetzt; `noUncheckedIndexedAccess`
  // weiß das nicht.
  if (!betestFuer || !betetFuerDich) {
    return null;
  }

  return { size: members.length, betestFuer, betetFuerDich };
}
