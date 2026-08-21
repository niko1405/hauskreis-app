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

/**
 * Dasselbe für mehrere Abende auf einmal.
 *
 * Die Anwesenheit steht mit in `MeetingResponseDto`, und **wer sie schreibt,
 * schreibt am Termin** — auch wenn er die Zeile in einer anderen Tabelle
 * anlegt. Zwei Läufe taten das bisher nicht: das Auffüllen der Auto-Zusagen und
 * der Abwesenheits-Abgleich. Beide fassen viele Abende auf einmal an, und für
 * beide sah man dieselbe Folge — die Terminliste zeigte die neue Zusage (ihr
 * ETag ist ein Inhalts-Hash), die Detailseite antwortete `304` und blieb beim
 * alten Stand. Mal war die Person dabei, mal nicht, je nachdem, welcher der
 * beiden Bildschirme gerade frisch geladen hatte.
 *
 * Doppelte Ids schaden nicht (`in` fasst sie zusammen), eine leere Liste spart
 * die Abfrage.
 */
export async function touchMeetings(
  db: Prisma.TransactionClient,
  meetingIds: readonly string[],
): Promise<void> {
  if (meetingIds.length === 0) return;

  await db.meeting.updateMany({
    where: { id: { in: [...new Set(meetingIds)] } },
    data: { version: { increment: 1 } },
  });
}

/**
 * Nimmt die Lied-Auswahl eines Abends zurück, sobald für die Musik niemand mehr
 * zuständig ist.
 *
 * Das Abhaken ist vor dem Abend eine **Entscheidung** — „das singen wir" —, und
 * treffen darf sie nur, wer die Lieder übt (`edit-rights.service.ts`). Ist
 * niemand eingetragen, darf sie deshalb niemand mehr ändern. Eine stehen
 * gebliebene Auswahl wäre dann nicht mehr die Absprache der Gruppe, sondern die
 * einer Person, die inzwischen gar nicht mehr gefragt ist — und niemand käme
 * daran vorbei außer über einen Umweg über die Zuteilung.
 *
 * **Nur für Abende, die noch nicht vorbei sind**, und diese Entscheidung trifft
 * der Aufrufer. Danach ist die Auswahl ein Protokoll („das haben wir gesungen"),
 * und die darf nicht verschwinden, bloß weil jemand aus der Zuteilung fällt oder
 * den Hauskreis verlässt. Zwei der drei Aufrufer wissen es ohnehin schon; dass
 * die Frage hier nicht gestellt wird, hält diese Funktion frei von der Uhr der
 * Gruppe — und damit von einem Dienst, den sie sonst importieren müsste.
 *
 * Steht hier und nicht im `MeetingSongService`, weil sie aus **beiden**
 * Richtungen gebraucht wird: beim Umtragen der Zuteilung (`SongModule`) und beim
 * Freigeben von Rollen (`MeetingModule`). Als freie Funktion über einem
 * `TransactionClient` hat sie keine Abhängigkeit, die einen Modul-Kreis
 * herstellen könnte — genau wie `touchMeeting` darüber.
 *
 * `meetingIds` als Liste, weil der dritte Aufrufer — jemand verlässt den
 * Hauskreis — alle kommenden Abende auf einmal räumt.
 */
export async function clearSongSelectionIfUnled(
  db: Prisma.TransactionClient,
  meetingIds: readonly string[],
): Promise<void> {
  if (meetingIds.length === 0) return;

  const stillLed = await db.meetingSongLeader.findMany({
    where: { meetingId: { in: [...meetingIds] } },
    select: { meetingId: true },
    distinct: ['meetingId'],
  });

  const led = new Set(stillLed.map((row) => row.meetingId));
  const orphaned = meetingIds.filter((id) => !led.has(id));

  if (orphaned.length === 0) return;

  await db.meetingSong.updateMany({
    where: { meetingId: { in: orphaned }, isSelected: true },
    data: { isSelected: false },
  });
}
