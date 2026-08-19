import { Prisma } from '../../generated/prisma/client';
import { TopicStatus } from '../../generated/prisma/enums';

/**
 * Hebt die Revision eines Themas an — und nimmt es bei Bedarf wieder auf.
 *
 * Dasselbe wie `touchMeeting`, eine Ebene höher: `TopicResponseDto.sessions`
 * ändert sich, sobald irgendwo eine Einheit entsteht, verschwindet oder umzieht,
 * die Themenzeile selbst aber wird dabei nie angefasst — auch `@updatedAt` nicht,
 * das nur beim Schreiben *dieser* Zeile feuert. Ohne diesen Griff läge derselbe
 * 304-Fehler auf der Themen-Detailseite.
 *
 * `reopen` erledigt nebenbei eine Fachregel: **ein Thema, das einen Abend
 * dazubekommt, läuft wieder.** Wer ein abgeschlossenes Thema fortsetzt, sagt
 * damit, dass es doch nicht fertig war; ihn danach noch einen Schalter suchen zu
 * lassen wäre eine Frage nach etwas, das er gerade beantwortet hat. `RUNNING`
 * über `RUNNING` zu schreiben kostet nichts, deshalb steht keine Bedingung davor.
 */
export async function touchTopic(
  db: Prisma.TransactionClient,
  topicId: string,
  options: { reopen?: boolean } = {},
): Promise<void> {
  await db.topic.updateMany({
    where: { id: topicId },
    data: {
      ...(options.reopen ? { status: TopicStatus.RUNNING } : {}),
      version: { increment: 1 },
    },
  });
}

/**
 * Dasselbe eine Ebene tiefer: die Revision **einer Einheit**.
 *
 * Gebraucht für den einen Fall, in dem sich ihre Antwort ändert, ohne dass die
 * Zeile angefasst wird: `responsibles` steht in einer eigenen Tabelle. Wer
 * dazukommt oder herausfällt, ändert damit `TopicSessionDto` — die Version
 * bliebe aber stehen, der ETag auch, und der Server antwortete beim nächsten
 * Aufruf mit `304`.
 *
 * Das war kein theoretisches Problem: „Ich habe jemanden zur Rolle
 * hinzugefügt, aber auf der Seite der Einheit steht weiter nur ich" — und
 * ebenso beim Entfernen, wo er einfach stehen blieb. Beide Male stimmte die
 * Datenbank und log die Anzeige.
 */
export async function touchSession(
  db: Prisma.TransactionClient,
  sessionId: string,
): Promise<void> {
  await db.topicSession.updateMany({
    where: { id: sessionId },
    data: { version: { increment: 1 } },
  });
}
