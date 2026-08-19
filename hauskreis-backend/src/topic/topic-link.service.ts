import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { GroupClockService } from '../meeting/group-clock.service';
import { touchMeeting } from '../meeting/meeting-version';
import { belongsTo } from './topic-visibility';
import { touchTopic } from './topic-version';

/**
 * Die Verbindung zwischen einem Abend und der Einheit, die daran hängt.
 *
 * Ein eigener Dienst in einem Modul ohne Importe, weil ihn drei Stellen
 * brauchen, die sonst nichts miteinander zu tun haben: die Zuteilung
 * (`TopicSessionService`), die Absage einer einzelnen Person
 * (`RoleReleaseService` im `MeetingModule`) und das Abschalten des Bausteins
 * (`MeetingService`). Läge er in einem davon, hätten die anderen beiden eine
 * Kante dorthin — genau der Zyklus, den `EditRightsModule` schon einmal
 * aufgelöst hat. `PrismaModule` und `ClockModule` sind `@Global`, dieses Modul
 * importiert deshalb nichts.
 *
 * Eine Regel trägt alles hier: **entkoppelt wird nur, was noch bevorsteht.** Ein
 * vergangener Abend ist das Protokoll dessen, was war; ihn nachträglich von
 * seiner Nachbereitung zu lösen, weil jemand eine Rolle korrigiert, würde die
 * Zusammenfassung aus dem Archiv nehmen.
 */
@Injectable()
export class TopicLinkService {
  private readonly logger = new Logger(TopicLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: GroupClockService,
  ) {}

  /**
   * Was aus der gewählten Einheit wird, nachdem sich die Zuteilung geändert hat.
   *
   * **Entkoppelt wird, wenn niemand mehr zugeteilt ist, der zum Thema gehört.**
   * Die Regel steht so nicht in der Spec, folgt aber ihrem Sinn:
   *
   * - Aus zwei Zugeteilten wird einer: der Übriggebliebene gehört zum Thema, die
   *   Einheit bleibt. Eine Vorbereitung wegzureißen, weil jemand *anderes*
   *   ausgetragen wurde, wäre offensichtlich falsch.
   * - Statt A ist jetzt C dran: C hat mit dem Thema nichts zu tun, die Einheit
   *   wird entkoppelt und wartet als Entwurf auf A (Spec §4).
   * - Niemand mehr zugeteilt: dasselbe.
   * - **C kommt zu A dazu: die Wahl wird zurückgesetzt.** C hat sie nicht
   *   getroffen und soll nicht still in eine fremde Vorbereitung hineinrutschen
   *   — schon gar nicht mit Schreibrecht am ganzen Thema. Der Abend steht danach
   *   wieder auf „Thema wählen", die Vorbereitung von A wartet als Entwurf, und
   *   wer dann wählt, entscheidet mit dem Wissen, wer sonst noch dran ist.
   * - Kommt C dazu und **gehört schon zum Thema**, bleibt die Einheit hängen und
   *   C wird nur Verantwortliche:r dieses Abends. Dort ist nichts zu
   *   entscheiden, was nicht schon entschieden wäre.
   *
   * @param departing Wer aus der Zuteilung **herausfällt**. Muss mitkommen und
   *   lässt sich hier nicht ableiten: `setResponsibles` hat die alten Zeilen zu
   *   diesem Zeitpunkt schon gelöscht.
   * @param arriving Wer **dazukommt**. Aus demselben Grund von außen: die neuen
   *   Zeilen stehen zu diesem Zeitpunkt schon.
   */
  async reconcile(
    tx: Prisma.TransactionClient,
    meetingId: string,
    assigned: readonly string[],
    departing: readonly string[] = [],
    arriving: readonly string[] = [],
  ): Promise<void> {
    const meeting = await tx.meeting.findUnique({
      where: { id: meetingId },
      select: {
        hauskreisId: true,
        date: true,
        topicSession: {
          select: {
            id: true,
            topicId: true,
            topic: {
              select: {
                ownerPersonId: true,
                collaborators: { select: { personId: true } },
              },
            },
          },
        },
      },
    });

    const session = meeting?.topicSession;

    // Der Termin selbst hat sich geändert, auch wenn keine Einheit daran hängt —
    // `topicResponsibles` steht mit in seiner Antwort.
    await touchMeeting(tx, meetingId);

    if (!meeting || !session) return;

    // Derselbe Riegel schützt zweierlei. Er lässt eine gehaltene Einheit an ihrem
    // Abend hängen — und er nimmt niemandem nachträglich die Zeile, die
    // festhält, dass er diesen Abend gehalten hat. Wer damals dabei war, war
    // dabei; eine Rollenkorrektur von heute ändert daran nichts (Spec 8.5).
    if (await this.clock.isPast(meeting.hauskreisId, meeting.date)) return;

    const membership = {
      ownerPersonId: session.topic.ownerPersonId,
      collaboratorIds: session.topic.collaborators.map((row) => row.personId),
    };

    // Wer neu dazukommt und zum Thema nicht gehört, hat es nicht gewählt. Die
    // Wahl fällt deshalb zurück an die Zugeteilten — alle, gemeinsam. Nicht
    // gelöscht, nur gelöst: darum geht es unten in denselben Zweig wie „niemand
    // gehört mehr dazu".
    const fremd = arriving.filter(
      (personId) => !belongsTo(membership, personId),
    );

    if (
      fremd.length === 0 &&
      assigned.some((personId) => belongsTo(membership, personId))
    ) {
      await this.join(tx, session.id, session.topicId, assigned);

      // Wer aus der Zuteilung fällt, bereitet diesen Abend nicht mehr vor — die
      // Zeile an der Einheit wäre ab jetzt eine falsche Behauptung und keine
      // Geschichte. Das Recht am *Thema* fällt nur mit, wenn er sonst nirgends
      // mehr daran hängt; das entscheidet `leave`.
      await this.leave(
        tx,
        session.id,
        session.topicId,
        departing.filter((personId) => !assigned.includes(personId)),
      );

      return;
    }

    // Hier wird **nicht** aufgeräumt, und das ist der Punkt: der Entwurf wartet
    // ab sofort auf genau die Leute, die eben herausgefallen sind. Nähme man
    // ihnen die Zeile, verschwände er aus ihrem „Angefangenes" — und mit dem
    // Mitarbeiter-Recht auch aus jeder anderen Liste. Ein Entwurf, den niemand
    // mehr sehen kann, ist gelöscht, nur langsamer.
    await tx.topicSession.update({
      where: { id: session.id },
      data: { meetingId: null, version: { increment: 1 } },
    });

    await touchTopic(tx, session.topicId);

    this.logger.log(
      `Session ${session.id} detached from meeting ${meetingId}: ${
        fremd.length > 0
          ? `${fremd.join(', ')} joined the assignment without belonging to the topic`
          : 'nobody assigned belongs to the topic'
      }`,
    );
  }

  /**
   * Trägt Personen als Verantwortliche einer Einheit **und** als Mitarbeitende
   * ihres Themas ein.
   *
   * Beides zusammen, weil es dasselbe Ereignis ist: wer einen Abend hält,
   * arbeitet am Thema mit und darf daran schreiben (Spec 8.4). Der Owner steht
   * nicht zusätzlich in der Mitarbeiter-Liste — er ist ja der Owner.
   */
  async join(
    tx: Prisma.TransactionClient,
    sessionId: string,
    topicId: string,
    personIds: readonly string[],
  ): Promise<void> {
    if (personIds.length === 0) return;

    const topic = await tx.topic.findUnique({
      where: { id: topicId },
      select: { ownerPersonId: true },
    });

    await tx.topicSessionResponsible.createMany({
      data: personIds.map((personId) => ({ sessionId, personId })),
      skipDuplicates: true,
    });

    await tx.topicCollaborator.createMany({
      data: personIds
        .filter((personId) => personId !== topic?.ownerPersonId)
        .map((personId) => ({ topicId, personId })),
      skipDuplicates: true,
    });
  }

  /**
   * Die Gegenbewegung zu `join`: jemand bereitet diesen Abend nicht mehr vor.
   *
   * Die Reihenfolge ist der ganze Trick. Erst fällt die Zeile an *dieser*
   * Einheit, und erst danach lässt sich die eigentliche Frage überhaupt richtig
   * stellen: hängt die Person noch an irgendeiner anderen Einheit des Themas?
   * Wer noch an einer hängt — gehalten oder geplant — behält das Schreibrecht.
   * Wer explizit als Mitwirkende:r an einer Einheit steht, ist dadurch geschützt.
   *
   * **Der Owner verliert nie etwas, auch nicht die Zeile an der Einheit.** Sein
   * Schreibrecht käme ohnehin aus `topic.ownerPersonId` und nicht aus einer
   * dieser Tabellen — aber unter „vorbereitet von" stünde er nicht mehr, und
   * das wäre falsch: Die Einheit ist seine. Dass er an diesem einen Abend nicht
   * mehr zugeteilt ist, sagt der Termin, nicht die Einheit.
   */
  async leave(
    tx: Prisma.TransactionClient,
    sessionId: string,
    topicId: string,
    personIds: readonly string[],
  ): Promise<void> {
    if (personIds.length === 0) return;

    const topic = await tx.topic.findUnique({
      where: { id: topicId },
      select: { ownerPersonId: true },
    });

    const kandidaten = personIds.filter(
      (personId) => personId !== topic?.ownerPersonId,
    );

    if (kandidaten.length === 0) return;

    await tx.topicSessionResponsible.deleteMany({
      where: { sessionId, personId: { in: kandidaten } },
    });

    const haltende = await tx.topicSessionResponsible.findMany({
      where: { personId: { in: kandidaten }, session: { topicId } },
      select: { personId: true },
    });

    const bleibt = new Set(haltende.map((row) => row.personId));

    await tx.topicCollaborator.deleteMany({
      where: {
        topicId,
        personId: {
          in: kandidaten.filter((personId) => !bleibt.has(personId)),
        },
      },
    });
  }

  /**
   * Löst die Einheit eines Abends, sofern er noch bevorsteht.
   *
   * Der Weg für alles, was einen Abend seine Auswahl verlieren lässt, ohne dass
   * jemand sie zurücknimmt — vor allem das Abschalten des Bausteins „Thema".
   * Antwortet mit `true`, wenn wirklich etwas gelöst wurde.
   */
  async detachIfUpcoming(meetingId: string): Promise<boolean> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        hauskreisId: true,
        date: true,
        topicSession: { select: { id: true, topicId: true } },
      },
    });

    const session = meeting?.topicSession;
    if (!meeting || !session) return false;
    if (await this.clock.isPast(meeting.hauskreisId, meeting.date)) {
      return false;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.topicSession.update({
        where: { id: session.id },
        data: { meetingId: null, version: { increment: 1 } },
      });

      await touchTopic(tx, session.topicId);
      await touchMeeting(tx, meetingId);
    });

    this.logger.log(`Session ${session.id} detached from meeting ${meetingId}`);

    return true;
  }

  /**
   * Nimmt eine Person aus der Zuteilung eines Abends — weil sie abgesagt hat.
   *
   * Antwortet mit `true`, wenn sie überhaupt zugeteilt war. Die Einheit wird
   * danach neu bewertet: bleibt niemand übrig, der zum Thema gehört, löst sie
   * sich vom Abend und wartet als Entwurf.
   */
  async releaseFor(meetingId: string, personId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.meetingTopicResponsible.deleteMany({
        where: { meetingId, personId },
      });

      if (count === 0) return false;

      const rest = await tx.meetingTopicResponsible.findMany({
        where: { meetingId },
        select: { personId: true },
      });

      await this.reconcile(
        tx,
        meetingId,
        rest.map((row) => row.personId),
        [personId],
      );

      return true;
    });
  }
}
