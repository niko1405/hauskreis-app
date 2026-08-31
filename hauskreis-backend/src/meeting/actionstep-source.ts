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
import { MeetingStatus, MeetingType } from '../../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';
import { finishedBefore } from './meeting-schedule';

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
 * können gleichzeitig gefüllt sein, und ein `??` spielte dann den Text eines
 * Themas aus, das an diesem Abend gar nicht mehr dazugehört.
 *
 * Der Weg dorthin ist enger geworden — `TopicLinkService.detach` löst beim
 * Abschalten des Bausteins inzwischen auch vergangene Abende —, aber es gibt
 * ihn noch: Abende, an denen das früher unterblieben ist, tragen ihre Einheit
 * weiterhin. Die Entscheidung am Baustein wäre ohnehin die richtige, auch wenn
 * der Fall gar nicht mehr entstünde: Sie liest die Aussage des Abends statt zu
 * raten, welches Feld gemeint ist.
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

/**
 * Wie viele vergangene Abende zurück gesucht wird, bis aufgegeben wird.
 *
 * Zehn, und die Zahl ist großzügig: Gebraucht werden sie nur, wenn hintereinander
 * lauter besondere Termine ohne Actionstep standen. Bei wöchentlichen Treffen
 * sind zehn Zeilen zweieinhalb Monate — jede Pause, die länger ist, ist ohnehin
 * ein anderes Thema.
 */
const LOOKBACK = 10;

const stepSelect = {
  id: true,
  date: true,
  type: true,
  ...actionstepSelect,
  // Nur die Ids: Der Startbildschirm zeigt eine Zahl und den eigenen Haken, die
  // Erinnerung überspringt damit, wer schon abgehakt hat. Die Namen stehen auf
  // der Detailseite.
  actionstepDone: { select: { personId: true } },
} satisfies Prisma.MeetingSelect;

export type LatestActionstep = Prisma.MeetingGetPayload<{
  select: typeof stepSelect;
}> & { text: string };

/**
 * Der Actionstep, der **diese Woche** gilt — oder keiner.
 *
 * Die Regel liest sich von hinten nach vorn: Gehe die vergangenen Abende
 * rückwärts durch, überspringe dabei einen **besonderen** Termin ohne
 * Actionstep, und bleib beim ersten stehen, der übrig bleibt. Hat der einen,
 * gilt er; hat er keinen, gilt keiner.
 *
 * **Warum überhaupt stehen bleiben.** Gesucht wurde bisher „der jüngste
 * vergangene Abend, *der einen hat*" — ein leerer Dienstag wurde also
 * übersprungen, und der Vorsatz von vorletzter Woche stand eine Woche zu lang
 * da, als wäre er frisch. Ein neuer Abend beendet den alten Vorsatz, auch wenn
 * er selbst keinen hinterlässt: Was besprochen wurde, ist besprochen.
 *
 * **Warum der besondere Termin die Ausnahme ist.** Ein Geburtstag oder eine
 * Freizeit ist kein Hauskreis-Abend im Sinne dieses Vorsatzes. Zwischen zwei
 * Dienstagen einen Kuchen zu essen beendet nicht, was man sich am Dienstag
 * vorgenommen hat. Bringt der besondere Termin selbst einen Actionstep mit,
 * gilt er dagegen wie jeder andere — dann war es ein Abend, an dem etwas
 * beschlossen wurde.
 *
 * Steht hier und nicht zweimal, weil `DashboardService` und
 * `ActionstepReminderService` dieselbe Frage stellen: Beantworteten sie sie
 * verschieden, stünde auf dem Startbildschirm ein anderer Vorsatz als in der
 * Benachrichtigung — ein Fehler, den niemand meldet, weil beide Seiten für sich
 * plausibel aussehen.
 */
export async function latestActionstep(
  prisma: PrismaService,
  hauskreisId: string,
  today: Date,
): Promise<LatestActionstep | null> {
  const meetings = await prisma.meeting.findMany({
    where: {
      hauskreisId,
      ...finishedBefore(today),
      status: { not: MeetingStatus.CANCELLED },
    },
    orderBy: { date: 'desc' },
    take: LOOKBACK,
    select: stepSelect,
  });

  for (const meeting of meetings) {
    const text = actionstepOf(meeting);

    if (text) return { ...meeting, text };
    // Nur der besondere Termin wird übersprungen. Jeder andere leere Abend
    // beendet den Vorsatz von davor.
    if (meeting.type !== MeetingType.CUSTOM) return null;
  }

  return null;
}
