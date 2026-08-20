import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { GroupClockService } from '../meeting/group-clock.service';
import { touchMeeting } from '../meeting/meeting-version';
import { belongsTo } from './topic-visibility';
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
   * - **Holt A selbst ihn dazu, bleibt sie ebenfalls hängen.** Das Zurücksetzen
   *   schützt die Vorbereitung vor fremdem Zugriff — nicht vor der Person, der
   *   sie gehört. Wer das Thema gewählt hat, zieht den Kreis darum selbst: A
   *   nimmt C dazu, und C bereitet ab jetzt mit vor.
   *
   * Die drei Angaben unten kommen von außen und lassen sich hier nicht
   * ableiten: Wenn `reconcile` läuft, stehen die neuen Zeilen schon und die
   * alten sind weg.
   */
  async reconcile(
    tx: Prisma.TransactionClient,
    meetingId: string,
    assigned: readonly string[],
    aenderung: {
      /** Wer aus der Zuteilung **herausfällt**. */
      departing?: readonly string[];
      /** Wer **dazukommt**. */
      arriving?: readonly string[];
      /**
       * Wer die Zuteilung ändert.
       *
       * Zählt nur für den einen Fall oben: Gehört ihm das Thema, das gerade am
       * Abend hängt, setzt sein Eintragen nichts zurück. Ein Admin bekommt hier
       * **keinen** Freifahrtschein — genau wie beim Wählen, und aus demselben
       * Grund: Es geht nicht um Verwaltung, sondern um jemandes Vorbereitung.
       */
      actorPersonId?: string;
    } = {},
  ): Promise<void> {
    const { departing = [], arriving = [], actorPersonId } = aenderung;

    const meeting = await tx.meeting.findUnique({
      where: { id: meetingId },
      select: {
        hauskreisId: true,
        date: true,
        topicSession: {
          select: {
            id: true,
            topicId: true,
            // Wer an ihr steht — gebraucht für den Fall, dass der Owner geht:
            // Dann geht die Einheit mit, und die anderen kommen von ihr herunter.
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
    //
    // Es sei denn, der Owner selbst trägt ein. Dass er dafür auch zugeteilt sein
    // muss, steht nicht hier: Ist er es nicht, entscheidet die Zeile darunter
    // ohnehin nach der alten Regel.
    const vomOwner = membership.ownerPersonId === actorPersonId;

    const fremd = vomOwner
      ? []
      : arriving.filter((personId) => !belongsTo(membership, personId));

    // **Mit dem Owner oder gar nicht.** Fällt der aus der Zuteilung, geht die
    // Einheit mit — auch wenn jemand zugeteilt bleibt, den er dazugeholt hat.
    // Die anderen sind an diesem Abend seine Mitwirkenden und nicht seine
    // Nachfolger: Die Vorbereitung gehört ihm, und ohne ihn steht sie nicht.
    //
    // Ausdrücklich am **Herausfallen** und nicht an „der Owner ist nicht
    // zugeteilt". Sonst löste jede beliebige Rollenänderung an einem Abend, den
    // ein Mitarbeiter für das Thema hält, dessen Einheit ab — ein Thema über
    // mehrere Abende darf aber reihum gehalten werden.
    const ownerGeht =
      membership.ownerPersonId !== null &&
      departing.includes(membership.ownerPersonId);

    if (
      !ownerGeht &&
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

    // Sonst wird hier **nicht** aufgeräumt, und das ist der Punkt: der Entwurf
    // wartet ab sofort auf genau die Leute, die eben herausgefallen sind. Nähme
    // man ihnen die Zeile, verschwände er aus ihrem „Angefangenes" — und mit dem
    // Mitarbeiter-Recht auch aus jeder anderen Liste. Ein Entwurf, den niemand
    // mehr sehen kann, ist gelöscht, nur langsamer.
    await tx.topicSession.update({
      where: { id: session.id },
      data: { meetingId: null, version: { increment: 1 } },
    });

    await touchTopic(tx, session.topicId);

    // Die eine Ausnahme davon: Geht der Owner, kommen die Mitwirkenden von
    // seiner Einheit herunter. Ihm selbst nimmt das nichts — sein Zugang hängt
    // an `topic.ownerPersonId` und nicht an dieser Tabelle, der Entwurf wartet
    // also weiter auf ihn. `leave` lässt ihn ohnehin stehen.
    if (ownerGeht) {
      await this.leave(
        tx,
        session.id,
        session.topicId,
        session.responsibles.map((row) => row.personId),
      );
    }

    this.logger.log(
      `Session ${session.id} detached from meeting ${meetingId}: ${
        ownerGeht
          ? 'the owner left the assignment'
          : fremd.length > 0
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

    await this.touchAffected(tx, sessionId, topicId);
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
        // Ohne `actorPersonId`: Wer absagt, trägt niemanden ein — und die
        // Ausnahme für den Owner gilt nur für Ankommende.
        { departing: [personId] },
      );

      return true;
    });
  }
}
