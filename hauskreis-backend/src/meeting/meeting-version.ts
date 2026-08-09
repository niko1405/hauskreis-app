import { Prisma } from '../../generated/prisma/client';

/**
 * Hebt die Revision eines Termins an.
 *
 * Der ETag eines Termins entsteht allein aus `meeting.version`
 * (`EtagInterceptor`). Zuteilung und gewählte Einheit stehen aber mit in
 * `MeetingResponseDto` — wer sie ändert, ohne die Version anzuheben, hinterlässt
 * einen ETag, der den Körper nicht mehr beschreibt. Die Folge sah man im
 * Frontend: die Anfrage ging raus, der Server antwortete `304`, und der
 * Bildschirm zeigte weiter den alten Stand. Erst ein Reload half, weil dann kein
 * `If-None-Match` mitkam.
 *
 * Dass damit auch ausstehende `If-Match`-Token ungültig werden, ist kein
 * Nebenschaden, sondern derselbe Satz von der anderen Seite: wer den Termin vor
 * einer Themenänderung gelesen hat, schreibt gegen ein veraltetes Bild.
 *
 * **Nicht** nötig für Lieder und Vorschläge — die kommen von eigenen Sammel-URLs
 * mit eigenem ETag und stehen nicht in `meetingInclude`.
 *
 * `updateMany` statt `update`, damit eine inzwischen gelöschte Zeile keine sonst
 * gute Transaktion mit `P2025` zurückrollt. Und `Prisma.TransactionClient` als
 * Parametertyp, weil `PrismaService` strukturell dazu passt — eine Signatur
 * bedient beide Aufrufarten.
 */
export async function touchMeeting(
  db: Prisma.TransactionClient,
  meetingId: string | null | undefined,
): Promise<void> {
  if (!meetingId) return;

  await db.meeting.updateMany({
    where: { id: meetingId },
    data: { version: { increment: 1 } },
  });
}
