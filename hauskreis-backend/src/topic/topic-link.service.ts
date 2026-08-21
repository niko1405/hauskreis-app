import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { GroupClockService } from '../meeting/group-clock.service';
import { touchMeeting } from '../meeting/meeting-version';
import { preparesSession } from './topic-visibility';
import { touchSession, touchTopic } from './topic-version';

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
 * Eine Regel trägt alles hier, und sie ist schärfer als „entkoppelt wird nur,
 * was noch bevorsteht": **Ein vergangener Abend ist gegen die beiläufige
 * Änderung geschützt, nicht gegen die ausdrückliche.** Er ist das Protokoll
 * dessen, was war; ihn zu lösen, weil jemand eine Rolle korrigiert oder absagt,
 * nähme die Zusammenfassung aus dem Archiv — `reconcile` und `releaseFor`
 * rühren ihn deshalb nie an.
 *
 * Wer dagegen den Baustein „Thema" abschaltet, sagt gerade, dass dieser Abend
 * keins hatte. Das ist keine Nebenwirkung, sondern die Aussage selbst, und sie
 * hat ihre eigene Rückfrage. Bliebe die Einheit dabei hängen, entstünde ein
 * Waisenkind: die Karte weg, `meetingId` noch gesetzt, die Einheit nie wieder
 * an einen anderen Abend zu hängen — und der Abend ohne Ort für seine
 * Nachbereitung, weil die beiden Bausteine einander ausschließen.
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
   * **Entkoppelt wird, wenn niemand mehr zugeteilt ist, der zur Vorbereitung
   * gehört** — also weder das Thema besitzt noch daran mitarbeitet noch an
   * dieser Einheit steht. Sonst hinge am Abend etwas, das keiner der
   * Zuständigen anfassen darf.
   *
   * - Aus zwei Zugeteilten wird einer, und der gehört dazu: die Einheit bleibt.
   * - **Es kommt jemand dazu: die Einheit bleibt.** Das ist der Unterschied zu
   *   vorher, und der Grund für diese ganze Runde. Wer neu zugeteilt wird, ist
   *   an dem Abend dabei — er entscheidet damit nicht über eine Vorbereitung,
   *   die er nicht angefangen hat. Passt sie ihm nicht, steht „Anderes Thema
   *   wählen" da wie eh und je.
   * - Statt A ist jetzt C dran, C gehört nicht dazu: die Einheit wird
   *   entkoppelt und wartet als Entwurf auf A.
   * - Niemand mehr zugeteilt: dasselbe.
   *
   * Gemessen wird mit `preparesSession` und nicht mit `mayEditSession`: Admin
   * und verwaistes Thema dürfen zwar hinein, gehören aber nicht dazu — ein
   * zugeteilter Admin hielte sonst jede Einheit an jedem Abend fest.
   *
   * Aufgeräumt wird dabei **nichts**. Wer aus der Zuteilung fällt, bleibt an der
   * Einheit stehen: Er hat sie vorbereitet, und krank zu werden nimmt ihm das
   * nicht. Die Crew pflegt man auf der Seite der Einheit
   * (`TopicSessionService.setSessionResponsibles`), nicht über den Umweg einer
   * Rollenänderung.
   */
  async reconcile(
    tx: Prisma.TransactionClient,
    meetingId: string,
    assigned: readonly string[],
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
            responsibles: { select: { personId: true } },
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

    // Ein vergangener Abend ist das Protokoll dessen, was war. Ihn nachträglich
    // von seiner Nachbereitung zu lösen, weil jemand eine Rolle korrigiert,
    // nähme die Zusammenfassung aus dem Archiv (Spec 8.5).
    if (await this.clock.isPast(meeting.hauskreisId, meeting.date)) return;

    const topic = {
      ownerPersonId: session.topic.ownerPersonId,
      collaboratorIds: session.topic.collaborators.map((row) => row.personId),
    };

    const responsibleIds = session.responsibles.map((row) => row.personId);

    // Ein Thema, an dem überhaupt niemand hängt — Altbestand aus der Zeit vor
    // diesem Modell. Dort gäbe es keine Vorbereitung zu schützen, und die Regel
    // löste es bei jeder Rollenänderung ab. Also stehen lassen.
    if (topic.ownerPersonId === null && responsibleIds.length === 0) return;

    if (
      assigned.some((personId) =>
        preparesSession({ personId, topic, responsibleIds }),
      )
    ) {
      return;
    }

    // Hier wird nur gelöst, nicht geräumt: Der Entwurf wartet ab sofort auf
    // genau die Leute, die ihn vorbereitet haben. Nähme man ihnen die Zeile,
    // verschwände er aus ihrem „Angefangenes" — ein Entwurf, den niemand mehr
    // sehen kann, ist gelöscht, nur langsamer.
    await tx.topicSession.update({
      where: { id: session.id },
      data: { meetingId: null, version: { increment: 1 } },
    });

    await touchTopic(tx, session.topicId);

    this.logger.log(
      `Session ${session.id} detached from meeting ${meetingId}: nobody assigned prepares it`,
    );
  }

  /**
   * Trägt Personen als Verantwortliche **dieser Einheit** ein.
   *
   * Und nur dort. Bis eben schrieb dieselbe Methode sie zusätzlich als
   * Mitarbeitende ins **Thema** — der automatische Rechte-Aufstieg, der weg
   * sollte: Wer einmal an einem Abend aushilft, bekommt damit keine Hoheit über
   * ein Thema, das über Monate läuft. Das themaweite Recht vergibt ab jetzt
   * ausschließlich der Owner, von Hand (`TopicService.addCollaborator`).
   */
  async join(
    tx: Prisma.TransactionClient,
    sessionId: string,
    topicId: string,
    personIds: readonly string[],
  ): Promise<void> {
    if (personIds.length === 0) return;

    await tx.topicSessionResponsible.createMany({
      data: personIds.map((personId) => ({ sessionId, personId })),
      skipDuplicates: true,
    });

    await this.touchAffected(tx, sessionId, topicId);
  }

  /**
   * Die Gegenbewegung: jemand bereitet diese Einheit nicht mehr vor.
   *
   * Ein `deleteMany` und sonst nichts. Die Nachfrage „hängt die Person noch an
   * einer anderen Einheit des Themas" stand hier, solange `join` das
   * Schreibrecht am Thema mitvergab und `leave` es wieder einsammeln musste.
   * Ohne diesen Aufstieg gibt es nichts einzusammeln.
   *
   * Auch der Owner ist nicht mehr ausgenommen. Ihm gehört das Thema, nicht jeder
   * seiner Abende — dass er den dritten jemand anderem überlässt, ist ein
   * gültiger Zustand, und sein Zugang hängt ohnehin an `topic.ownerPersonId`.
   */
  async leave(
    tx: Prisma.TransactionClient,
    sessionId: string,
    topicId: string,
    personIds: readonly string[],
  ): Promise<void> {
    if (personIds.length === 0) return;

    await tx.topicSessionResponsible.deleteMany({
      where: { sessionId, personId: { in: [...personIds] } },
    });

    await this.touchAffected(tx, sessionId, topicId);
  }

  /**
   * Wer an einer Einheit steht, steht in einer **eigenen Tabelle** — und damit
   * ändert sich die Antwort beider Seiten, ohne dass eine ihrer Zeilen
   * angefasst würde.
   *
   * Ohne diesen Griff bleibt die Version stehen, mit ihr der ETag, und der
   * Server antwortet beim nächsten Aufruf `304`: Die Seite der Einheit zeigte
   * weiter den alten Kreis — den Dazugekommenen nicht, den Entfernten noch. Die
   * Terminseite dagegen stimmte, weil an ihr `touchMeeting` hängt. Das ist die
   * Sorte Fehler, die man für einen Fehler in der Fachlogik hält.
   */
  private async touchAffected(
    tx: Prisma.TransactionClient,
    sessionId: string,
    topicId: string,
  ): Promise<void> {
    await touchSession(tx, sessionId);
    // Das Thema trägt seine Einheiten samt Verantwortlichen mit aus — dieselbe
    // Änderung, eine Ebene höher, derselbe 304.
    await touchTopic(tx, topicId);
  }

  /**
   * Löst die Einheit eines Abends.
   *
   * Der Weg für alles, was einen Abend seine Auswahl verlieren lässt, ohne dass
   * jemand sie zurücknimmt — vor allem das Abschalten des Bausteins „Thema".
   * Antwortet mit `true`, wenn wirklich etwas gelöst wurde.
   *
   * `evenIfPast` ist die Ausnahme aus dem Kopf dieser Klasse und gehört genau
   * einem Aufrufer: dem abgeschalteten Baustein. Wer ihn setzt, hat eine
   * Rückfrage hinter sich; alle anderen Wege hierher sind beiläufig und lassen
   * die Vergangenheit stehen.
   */
  async detach(
    meetingId: string,
    options: { evenIfPast?: boolean } = {},
  ): Promise<boolean> {
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
    if (
      !options.evenIfPast &&
      (await this.clock.isPast(meeting.hauskreisId, meeting.date))
    ) {
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
   * danach neu bewertet: bleibt niemand übrig, der sie vorbereitet, löst sie
   * sich vom Abend und wartet als Entwurf. Ihre Crew bleibt dabei stehen — wer
   * absagt, hat trotzdem vorbereitet.
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
      );

      return true;
    });
  }
}
