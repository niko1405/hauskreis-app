import { Prisma } from '../../generated/prisma/client';

/**
 * Hebt die Revision eines Hauskreises an.
 *
 * Der ETag von `GET /hauskreise/:id` entsteht allein aus `hauskreis.version`
 * (`EtagInterceptor`), die Antwort trägt aber auch `features` — und die stehen
 * in zwei anderen Tabellen (`meeting_schedule_config`,
 * `prayer_buddy_cycle_config`). Wer dort einen Schalter umlegt, ohne die
 * Version anzuheben, hinterlässt einen ETag, der den Körper nicht mehr
 * beschreibt: Der Client bekäme `304` und behielte die alten Schalter.
 *
 * `updateMany`, damit eine inzwischen gelöschte Gruppe keinen Fehler wirft.
 */
export async function touchHauskreis(
  db: Prisma.TransactionClient,
  hauskreisId: string,
): Promise<void> {
  await db.hauskreis.updateMany({
    where: { id: hauskreisId },
    data: { version: { increment: 1 } },
  });
}
