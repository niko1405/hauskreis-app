/**
 * Woher der Actionstep eines Abends kommt.
 *
 * Seit es den Baustein „Nachbereitung" gibt, sind es **zwei** Orte: die Einheit
 * eines Themas (`TopicSession.actionstepText`) und der Abend selbst
 * (`Meeting.actionstepText`). Welcher gilt, entscheidet der Baustein — die
 * beiden schließen einander aus, ein Abend hat also nie zwei.
 *
 * Warum als eigene Datei und nicht zweimal hingeschrieben: dieselbe Frage
 * stellen der Startbildschirm (`DashboardService`) und die wöchentliche
 * Erinnerung (`ActionstepReminderService`), und sie müssen sie gleich
 * beantworten. Beantworteten sie sie verschieden, stünde auf dem
 * Startbildschirm ein anderer Vorsatz als in der Benachrichtigung — ein Fehler,
 * den niemand meldet, weil beide Seiten für sich plausibel aussehen.
 */
import { Prisma } from '../../generated/prisma/client';

/**
 * „Hat dieser Abend überhaupt einen Actionstep?" — als `where`-Fragment.
 *
 * Bewusst nur auf `not: null` und nicht auf „nicht leer": ob ein einzelnes
 * Leerzeichen zählt, entscheidet `actionstepOf` beim Lesen. Postgres könnte das
 * mit `trim()` nicht ausdrücken, ohne dass es eine Rohabfrage wird.
 */
export const hasActionstep = {
  OR: [
    { topicSession: { actionstepText: { not: null } } },
    { actionstepText: { not: null } },
  ],
} satisfies Prisma.MeetingWhereInput;

/** Die Felder, die `actionstepOf` braucht. */
export const actionstepSelect = {
  hasTopicSlot: true,
  actionstepText: true,
  topicSession: { select: { actionstepText: true } },
} satisfies Prisma.MeetingSelect;

export interface ActionstepSource {
  hasTopicSlot: boolean;
  actionstepText: string | null;
  topicSession: { actionstepText: string | null } | null;
}

/**
 * Der Actionstep dieses Abends, oder `null`.
 *
 * **Entschieden am Baustein**, nicht am ersten Feld, das nicht `null` ist. Beide
 * können gleichzeitig gefüllt sein: `TopicLinkService.detachIfUpcoming` löst nur
 * **kommende** Abende von ihrer Einheit, ein vergangener behält sie also auch
 * dann, wenn der Baustein danach abgeschaltet wurde. Ein `??` würde in dem Fall
 * den Text eines Themas ausspielen, das an diesem Abend gar nicht mehr dazu
 * gehört.
 *
 * Ein leerer Text zählt als keiner: das Feld ist Freitext, und ein Leerzeichen
 * ist niemanden zu unterbrechen wert.
 */
export function actionstepOf(meeting: ActionstepSource): string | null {
  const text = meeting.hasTopicSlot
    ? meeting.topicSession?.actionstepText
    : meeting.actionstepText;

  return text && text.trim() !== '' ? text : null;
}
