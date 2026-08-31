'use client';

/**
 * Wann ein Zug ein Zug ist.
 *
 * Drei Stellen ziehen: das Bottom-Sheet (`sheet.tsx`, dort heißt es „zu"), der
 * Antwort-Balken am Termin (`answer-bar.tsx`, dort „eingeklappt") und die
 * Listenzeile, die rechts ihre Knöpfe freigibt (`swipe-actions.tsx`). Alle drei
 * müssen sich über die Schwelle einig sein — dreimal `> 96` nebeneinander wären
 * drei Meinungen darüber, ab wann jemand etwas gemeint hat, und eine davon
 * würde beim nächsten Feinschliff verschoben und die anderen nicht.
 *
 * **Strecke oder Geschwindigkeit, nicht beides.** Wer langsam und weit zieht,
 * hat es sich überlegt; wer kurz und schnell schnippt, ebenfalls. Nur die
 * Verbindung aus kurz und langsam ist ein Verrutschen — genau die fällt durch.
 *
 * Die Zahlen liegen bewusst über `THRESHOLD = 72` aus `pull-to-refresh.tsx`:
 * Ein Sheet ist größer als ein Kringel, und es wegzuwischen verwirft mehr als
 * eine überflüssige Abfrage.
 */
import type { PanInfo } from 'motion/react';

/** Ab hier ist das Ziehen eine Absicht und kein Verrutschen. */
const DISTANCE = 96;

/** Ein kurzer Schnipser reicht auch ohne die Strecke — in Pixeln je Sekunde. */
const VELOCITY = 480;

/**
 * Ob dieser Zug schließt (beim Balken: einklappt).
 *
 * `offset` ist die Strecke seit dem Aufsetzen, `velocity` die Geschwindigkeit
 * beim Loslassen; beide zählen nach unten positiv.
 */
export function dismissed(info: PanInfo): boolean {
  return info.offset.y > DISTANCE || info.velocity.y > VELOCITY;
}

/**
 * Dasselbe nach oben — für den Antwort-Balken, der als Einziger auch aufgeht.
 *
 * Steht hier neben seinem Gegenstück und nicht dort, wo es gebraucht wird:
 * Ein Balken, der sich leichter öffnen als schließen lässt, wäre eine
 * Ungleichheit, die niemand entschieden hat.
 */
export function raised(info: PanInfo): boolean {
  return info.offset.y < -DISTANCE || info.velocity.y < -VELOCITY;
}

/**
 * Dasselbe nach links — für die Listenzeile, die rechts ihre Knöpfe freigibt.
 *
 * Dieselben Zahlen wie senkrecht, und das ist die Aussage: Ein waagerechter
 * Wisch, der bei anderen Werten auslöste als ein senkrechter, wäre eine
 * Unterscheidung, die niemand getroffen hat.
 */
export function pulledLeft(info: PanInfo): boolean {
  return info.offset.x < -DISTANCE || info.velocity.x < -VELOCITY;
}

/** Und zurück: die Zeile schließt wieder. */
export function pulledRight(info: PanInfo): boolean {
  return info.offset.x > DISTANCE || info.velocity.x > VELOCITY;
}
