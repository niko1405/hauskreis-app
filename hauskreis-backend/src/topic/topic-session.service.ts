import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AssignmentRole } from '../../generated/prisma/enums';
import { personRefSelect } from '../common/dto/response';
import { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import { AvailabilityService } from '../role-suggestion/availability.service';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import type { IfMatchCondition } from '../common/http/etag';
import { isPast } from '../meeting/meeting-schedule';
import { touchMeeting } from '../meeting/meeting-version';
import { GroupClockService } from '../meeting/group-clock.service';
import {
  membershipOf,
  sessionPosition,
  sessionSelectWithTopic,
  shapeSession,
  topicMembershipSelect,
  type Viewer,
} from './topic-shape';
import { isHeld, mayEditTopic } from './topic-visibility';
import { touchTopic } from './topic-version';
import { TopicLinkService } from './topic-link.service';
import type {
  ChooseTopicSessionDto,
  CreateTopicSessionDto,
  SetTopicResponsiblesDto,
  UpdateTopicSessionDto,
} from './dto/topic.dto';

/**
 * Was an einem Abend war, bleibt an ihm hängen. Der Satz steht an drei Stellen
 * und soll überall derselbe sein.
 */
const ABEND_WAR_SCHON =
  'Der Abend war schon — was dort besprochen wurde, bleibt dort stehen';

/**
 * Warum an einer Hülle keine zweite Einheit entstehen kann.
 *
 * Nicht Datenbank-Sicherheit, sondern eine Aussage: Zwei Abende, über denen
 * nichts steht, sind kein Thema, sondern zwei Abende. Wer den Bogen sieht, gibt
 * ihm einen Namen — und genau dann wird aus der Hülle ein Thema.
 */
const BRAUCHT_UEBERTHEMA =
  'Dafür braucht es erst ein Überthema — gib der Einheit einen, dann kommen weitere dazu.';

/**
 * Zuteilung und Auswahl beim Thema — die beiden Schritte, die bis eben einer
 * waren.
 *
 * **Zuteilen** heißt: an diesem Abend bist du dran. **Wählen** heißt: und zwar
 * mit *diesem* Stoff. Dazwischen liegt ein Zustand, den es vorher nicht gab und
 * der der eigentliche Punkt ist — zugeteilt, aber noch nichts entschieden. Wer
 * beides zusammenwirft, muss beim Zuteilen schon ein leeres Thema anlegen, und
 * genau das ist der Datensatz, der hinterher niemandem gehört.
 *
 * Nichts wird hier gelöscht. Wechselt die Rolle, wird die Einheit **entkoppelt**
 * (`meetingId = null`) und wartet als Entwurf auf ihre Person.
 */
@Injectable()
export class TopicSessionService {
  private readonly logger = new Logger(TopicSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly roleAssignments: RoleAssignmentNotifier,
    private readonly availability: AvailabilityService,
    private readonly links: TopicLinkService,
    private readonly clock: GroupClockService,
  ) {}

  // ---------------------------------------------------------------- Zuteilung

  async findResponsibles(hauskreisId: string, meetingId: string) {
    await this.loadMeeting(hauskreisId, meetingId);

    const rows = await this.prisma.meetingTopicResponsible.findMany({
      where: { meetingId },
      select: { person: { select: personRefSelect } },
      orderBy: { person: { name: 'asc' } },
    });

    return { meetingId, responsibles: rows };
  }

  /**
   * Setzt, wer an diesem Abend das Thema vorbereitet.
   *
   * Ersetzt die Liste; leer ist gültig und heißt „noch kein Zuständiger". Wer
   * zuteilt, prüfen wir nicht weiter — wer vorbereitet, ist eine Frage an die
   * Gruppe, und die beantwortet sie im Gespräch, nicht über Rechte.
   */
  async setResponsibles(
    hauskreisId: string,
    meetingId: string,
    dto: SetTopicResponsiblesDto,
    actorPersonId: string,
  ) {
    const meeting = await this.loadMeeting(hauskreisId, meetingId);

    if (!meeting.hasTopicSlot) {
      throw new BadRequestException(
        'Dieser Termin hat kein Thema — schalte das erst dazu',
      );
    }

    await this.assertPeopleBelongToHauskreis(hauskreisId, dto.personIds);

    const before = new Set(
      meeting.topicResponsibles.map((row) => row.personId),
    );
    const arriving = dto.personIds.filter((personId) => !before.has(personId));

    // Wer dazukommt, muss an dem Abend auch können. Für die Bleibenden gilt das
    // nicht noch einmal: sie stehen schon da, und eine Prüfung, die beim
    // Entfernen einer *dritten* Person anschlägt, hilft niemandem.
    if (arriving.length > 0) {
      await this.availability.assertAvailable(hauskreisId, meetingId, arriving);
    }

    // Wer herausfällt, muss vor dem Löschen festgehalten werden — nachher steht
    // es nirgends mehr, und `reconcile` kann es aus den Verantwortlichen der
    // Einheit nicht ableiten: dort stehen auch Leute, die nie zugeteilt waren.
    const departing = [...before].filter(
      (personId) => !dto.personIds.includes(personId),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.meetingTopicResponsible.deleteMany({
        where: { meetingId, personId: { notIn: dto.personIds } },
      });

      await tx.meetingTopicResponsible.createMany({
        data: dto.personIds.map((personId) => ({ meetingId, personId })),
        skipDuplicates: true,
      });

      await this.links.reconcile(tx, meetingId, dto.personIds, departing);
    });

    if (arriving.length > 0) {
      await this.roleAssignments.announce(
        meetingId,
        AssignmentRole.TOPIC,
        arriving,
        actorPersonId,
      );
    }

    return this.findResponsibles(hauskreisId, meetingId);
  }

  // ------------------------------------------------------------------ Auswahl

  /**
   * Was zur Wahl steht.
   *
   * Zwei Listen, und die Trennlinie ist die zwischen einem Thema und einem
   * einzelnen Abend: `topics` sind die eigenen **echten** Themen, Hüllen fallen
   * heraus (sie tragen genau eine Einheit und keinen Titel, unter „Thema
   * fortsetzen" wären sie eine Zeile ohne Aussage). `singleSessions` sind
   * umgekehrt genau diese Einheiten.
   *
   * Themen-gebundene Entwürfe stehen in keiner der beiden: Sie hängen unter
   * ihrem Thema, und dorthin führt der Weg über `topics` — eine zweite Liste
   * daneben zeigte dieselben Zeilen ein zweites Mal.
   *
   * Der Grenzfall aus 8.5 sitzt im zweiten Teil: eine eigene angefangene Einheit
   * bleibt auch dann greifbar, wenn der Owner die Person als Mitarbeiterin
   * entfernt hat. Ihr eigener Entwurf ist ihrer. Nimmt sie ihn wieder auf, wird
   * sie darüber automatisch wieder Mitarbeiterin — was auch der Sinn der Regel
   * ist. Unter `topics` taucht das Thema für sie dagegen nicht mehr auf.
   *
   * `resumable` sagt, ob sich die Einheit **hierher holen** lässt: an keinem
   * Abend oder an einem, der noch bevorsteht. Gerechnet wird sie hier, mit
   * genau der Regel, die `resumeSession` gleich anwendet — die Anzeige soll
   * nichts anbieten, was der Server danach ablehnt. Was schon war, steht
   * trotzdem in der Liste: daraus lässt sich immer noch ein Thema machen
   * (`mode: 'promote'`), und das ist der häufigere Fall — man hält einen Abend
   * und merkt danach, dass da mehr drinsteckt.
   */
  async choices(hauskreisId: string, meetingId: string, personId: string) {
    await this.loadMeeting(hauskreisId, meetingId);

    const zone = await this.clock.zoneOf(hauskreisId);

    const [topics, einzelne] = await Promise.all([
      this.prisma.topic.findMany({
        where: {
          hauskreisId,
          standalone: false,
          OR: [
            { ownerPersonId: personId },
            { collaborators: { some: { personId } } },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          sessions: {
            select: { meeting: { select: { date: true } } },
          },
        },
        // Laufende zuerst, darin das zuletzt angefasste — das ist der Faden,
        // auf dem die Gruppe gerade ist. `status asc` genügt dafür: ein
        // Postgres-Enum sortiert in seiner Deklarationsreihenfolge, und die
        // beginnt mit `RUNNING`.
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.topicSession.findMany({
        where: {
          topic: { hauskreisId, standalone: true },
          OR: [
            { topic: { ownerPersonId: personId } },
            { topic: { collaborators: { some: { personId } } } },
            { responsibles: { some: { personId } } },
          ],
          // Was schon an diesem Abend hängt, steht nicht zur Wahl — es ist die
          // Wahl. `meetingId` und nicht die Relation: der NULL-Fall soll
          // durchkommen, und über `meeting` verschluckt SQL ihn.
          NOT: { meetingId },
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          meeting: {
            select: { id: true, date: true, status: true, title: true },
          },
        },
        // Was schon einen Abend hat, zuerst und chronologisch; die freien
        // Entwürfe danach, der jüngste oben.
        orderBy: [{ meeting: { date: 'asc' } }, { createdAt: 'desc' }],
      }),
    ]);

    return {
      topics: topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        status: topic.status,
        standalone: false,
        sessionCount: topic.sessions.length,
        lastHeldAt: lastHeldDate(topic.sessions, zone),
      })),
      singleSessions: einzelne.map(({ meeting, ...session }) => ({
        ...session,
        meeting: meeting && {
          id: meeting.id,
          date: meeting.date,
          title: meeting.title,
        },
        resumable: meeting === null || !isPast(meeting.date, zone),
        held: isHeld(meeting, zone),
      })),
    };
  }

  /**
   * Die Wahl treffen — einer der drei Wege aus Spec §3.
   *
   * Owner wird, wer **zuerst tatsächlich wählt**, nicht wer zuerst zugeteilt
   * wurde. Alle anderen, die in diesem Moment ebenfalls für den Abend zugeteilt
   * sind, kommen als Verantwortliche der Einheit mit.
   *
   * Dass zwei gleichzeitig klicken, fängt nicht eine Prüfung ab, sondern der
   * eindeutige Index auf `topic_session.meeting_id`: der zweite Schreibvorgang
   * scheitert an der Datenbank und wird hier zu einem 409. Eine Prüfung davor
   * wäre ein Zeitfenster, kein Schutz.
   *
   * Hängt schon etwas am Abend, ist das kein Fehler mehr, sondern ein Wechsel:
   * die bisherige Einheit löst sich und wartet als Entwurf. Zwei Schritte („erst
   * zurücknehmen, dann wählen") wären dieselbe Wirkung mit einem Zustand
   * dazwischen, in dem der Abend leer dasteht — und mit der Möglichkeit, dort
   * hängenzubleiben.
   */
  async choose(
    hauskreisId: string,
    meetingId: string,
    dto: ChooseTopicSessionDto,
    viewer: Viewer,
  ) {
    const meeting = await this.loadMeeting(hauskreisId, meetingId);

    if (!meeting.hasTopicSlot) {
      throw new BadRequestException(
        'Dieser Termin hat kein Thema — schalte das erst dazu',
      );
    }

    const assigned = meeting.topicResponsibles.map((row) => row.personId);

    // Streng: kein Admin-Freifahrtschein, weil die Wahl kein Verwaltungsakt
    // ist, sondern die Aussage „ich bereite das vor" — die kann niemand für
    // einen anderen treffen. Und „niemand zugeteilt heißt jede:r darf" gilt
    // hier auch nicht: das wäre eine Regel fürs Nachtragen eines Abends, der
    // schon war, nicht fürs Belegen eines Abends, der kommt. Wer wählen will,
    // trägt sich vorher als zuständig ein; das ist eine Zeile und kein
    // Hindernis. Dieselbe Fassung gilt für die Liedauswahl
    // (`EditRightsService.assertMayPickSongs`).
    if (!assigned.includes(viewer.personId)) {
      throw new ForbiddenException(
        'Das Thema wählt, wer an dem Abend dafür zugeteilt ist — trag dich erst als zuständig ein.',
      );
    }

    const bisher = meeting.topicSession;

    if (bisher && isPast(meeting.date, viewer.zone)) {
      throw new BadRequestException(ABEND_WAR_SCHON);
    }

    // `topicId` und `sessionId` sind an dieser Stelle da — das Schema lässt
    // `existing` ohne das eine und `resume` ohne das andere gar nicht durch.
    const sessionId = await this.prisma
      .$transaction(async (tx) => {
        if (bisher) {
          // `updateMany` mit `meetingId` in der Bedingung: hat jemand anderes
          // gerade schon gelöst, trifft das nichts, und der Anhang darunter
          // läuft trotzdem in den eindeutigen Index — das Rennen entscheidet
          // weiterhin die Datenbank.
          await tx.topicSession.updateMany({
            where: { id: bisher.id, meetingId },
            data: { meetingId: null, version: { increment: 1 } },
          });

          await touchTopic(tx, bisher.topicId);
        }

        const gewaehlt = await this.attach(tx, {
          hauskreisId,
          meetingId,
          dto,
          viewer,
          mitwirkende: assigned,
        });

        await touchMeeting(tx, meetingId);
        return gewaehlt;
      })
      .catch((error: unknown) => {
        throw toConflict(error);
      });

    return this.findSession(hauskreisId, sessionId, viewer);
  }

  /** Die fünf Wege, hinter einer Verzweigung. */
  private attach(
    tx: Prisma.TransactionClient,
    options: {
      hauskreisId: string;
      meetingId: string;
      dto: ChooseTopicSessionDto;
      viewer: Viewer;
      mitwirkende: string[];
    },
  ): Promise<string> {
    const { hauskreisId, meetingId, dto, viewer, mitwirkende } = options;

    if (dto.mode === 'existing') {
      return this.extendExisting(
        tx,
        hauskreisId,
        meetingId,
        dto.topicId as string,
        dto,
        viewer,
        mitwirkende,
      );
    }

    if (dto.mode === 'resume') {
      return this.resumeSession(
        tx,
        hauskreisId,
        meetingId,
        dto.sessionId as string,
        viewer,
        mitwirkende,
      );
    }

    if (dto.mode === 'single') {
      return this.createStandalone(
        tx,
        hauskreisId,
        meetingId,
        dto,
        viewer.personId,
        mitwirkende,
      );
    }

    if (dto.mode === 'promote') {
      return this.promote(tx, hauskreisId, meetingId, dto, viewer, mitwirkende);
    }

    return this.createNew(
      tx,
      hauskreisId,
      meetingId,
      dto.title ?? null,
      viewer.personId,
      mitwirkende,
    );
  }

  /** A) Ein neues Thema. Wer wählt, wird Owner. */
  private async createNew(
    tx: Prisma.TransactionClient,
    hauskreisId: string,
    meetingId: string,
    title: string | null,
    ownerPersonId: string,
    mitwirkende: string[],
  ): Promise<string> {
    const topic = await tx.topic.create({
      data: { hauskreisId, title, ownerPersonId },
      select: { id: true },
    });

    const session = await tx.topicSession.create({
      data: { topicId: topic.id, meetingId },
      select: { id: true },
    });

    await this.links.join(tx, session.id, topic.id, mitwirkende);
    return session.id;
  }

  /**
   * Eine einzelne Einheit, hier und jetzt — ohne Thema darüber.
   *
   * Der Abend, der keinen Bogen spannt. Angelegt wird trotzdem ein `Topic`,
   * weil daran Owner und Mitarbeitende hängen (siehe `Topic.standalone`); zu
   * sehen bekommt es niemand, es hat nicht einmal einen Titel.
   *
   * Der Titel der **Einheit** ist hier optional, anders als beim Anlegen im
   * Archiv: Dort hat sie nichts als ihn, hier steht sie unter ihrem Termin und
   * ist auch namenlos auffindbar.
   */
  private async createStandalone(
    tx: Prisma.TransactionClient,
    hauskreisId: string,
    meetingId: string,
    dto: ChooseTopicSessionDto,
    ownerPersonId: string,
    mitwirkende: string[],
  ): Promise<string> {
    const topic = await tx.topic.create({
      data: { hauskreisId, standalone: true, ownerPersonId },
      select: { id: true },
    });

    const session = await tx.topicSession.create({
      data: {
        topicId: topic.id,
        meetingId,
        title: dto.title ?? null,
        actionstepText: dto.actionstepText ?? null,
        summaryText: dto.summaryText ?? null,
      },
      select: { id: true },
    });

    await this.links.join(tx, session.id, topic.id, mitwirkende);
    return session.id;
  }

  /**
   * Aus einer einzelnen Einheit wird ein Thema — und dieser Abend seine zweite.
   *
   * Der Weg, den man nicht vorhersehen kann: Man hält einen Abend, und erst
   * danach zeigt sich, dass da mehr drinsteckt. Umgehängt wird dabei nichts.
   * Die Hülle, die es ohnehin schon gab, bekommt einen Titel und hört auf,
   * eine Hülle zu sein; die alte Einheit bleibt an ihrem alten Abend stehen,
   * mit allem, was in ihr steht.
   *
   * Deshalb steht hier ein `updateMany` mit `standalone: true` in der
   * Bedingung: Haben zwei Zugeteilte gleichzeitig dieselbe Einheit im Blick,
   * gewinnt der erste, und der zweite bekommt keinen zweiten Titel über ein
   * Thema geschrieben, das schon einen hat.
   */
  private async promote(
    tx: Prisma.TransactionClient,
    hauskreisId: string,
    meetingId: string,
    dto: ChooseTopicSessionDto,
    viewer: Viewer,
    mitwirkende: string[],
  ): Promise<string> {
    const vorlage = await tx.topicSession.findFirst({
      where: { id: dto.sessionId as string, topic: { hauskreisId } },
      select: {
        id: true,
        topicId: true,
        topic: { select: topicMembershipSelect },
        responsibles: { select: { personId: true } },
      },
    });

    if (!vorlage) {
      throw new NotFoundException(`Topic session ${dto.sessionId} not found`);
    }

    if (!vorlage.topic.standalone) {
      throw new BadRequestException(
        'Diese Einheit gehört schon zu einem Thema — setz es unter „Thema fortsetzen" fort.',
      );
    }

    // Dieselbe Rettung wie in `resumeSession`: der eigene Entwurf bleibt der
    // eigene, auch wenn man am Thema nicht (mehr) mitarbeiten darf.
    const eigene = vorlage.responsibles.some(
      (row) => row.personId === viewer.personId,
    );

    if (
      !eigene &&
      !mayEditTopic({
        isAdmin: viewer.isAdmin,
        personId: viewer.personId,
        topic: membershipOf(vorlage.topic),
      })
    ) {
      throw new ForbiddenException(
        'Ein Überthema gibt der Einheit, wer sie vorbereitet hat.',
      );
    }

    const { count } = await tx.topic.updateMany({
      where: { id: vorlage.topicId, standalone: true },
      data: {
        title: dto.topicTitle as string,
        standalone: false,
        version: { increment: 1 },
      },
    });

    if (count === 0) {
      throw new ConflictException(
        'Jemand war schneller — diese Einheit gehört inzwischen zu einem Thema.',
      );
    }

    const session = await tx.topicSession.create({
      data: {
        topicId: vorlage.topicId,
        meetingId,
        title: dto.title ?? null,
        actionstepText: dto.actionstepText ?? null,
        summaryText: dto.summaryText ?? null,
      },
      select: { id: true },
    });

    await this.links.join(tx, session.id, vorlage.topicId, mitwirkende);
    await touchTopic(tx, vorlage.topicId, { reopen: true });
    return session.id;
  }

  /**
   * B) Ein eigenes Thema um einen weiteren Abend erweitern.
   *
   * Titel, Actionstep und Zusammenfassung dürfen gleich mitkommen: das
   * Anlege-Sheet fragt sie ab, und sie hinterher in einem zweiten Aufruf
   * nachzuschieben hieße, den Abend für einen Wimpernschlag mit einer leeren
   * Einheit dastehen zu lassen.
   */
  private async extendExisting(
    tx: Prisma.TransactionClient,
    hauskreisId: string,
    meetingId: string,
    topicId: string,
    dto: ChooseTopicSessionDto,
    viewer: Viewer,
    mitwirkende: string[],
  ): Promise<string> {
    const topic = await tx.topic.findFirst({
      where: { id: topicId, hauskreisId },
      select: topicMembershipSelect,
    });

    if (!topic) throw new NotFoundException(`Topic ${topicId} not found`);

    if (topic.standalone) throw new BadRequestException(BRAUCHT_UEBERTHEMA);

    if (
      !mayEditTopic({
        isAdmin: viewer.isAdmin,
        personId: viewer.personId,
        topic: membershipOf(topic),
      })
    ) {
      throw new ForbiddenException(
        'Fortsetzen kann ein Thema, wer daran mitarbeitet.',
      );
    }

    const session = await tx.topicSession.create({
      data: {
        topicId,
        meetingId,
        title: dto.title ?? null,
        actionstepText: dto.actionstepText ?? null,
        summaryText: dto.summaryText ?? null,
      },
      select: { id: true },
    });

    await this.links.join(tx, session.id, topicId, mitwirkende);
    await touchTopic(tx, topicId, { reopen: true });
    return session.id;
  }

  /**
   * C) Eine offene Einheit an diesen Abend hängen. Ihr Inhalt bleibt.
   *
   * „Offen" schließt eine Einheit ein, die an einem *anderen kommenden* Abend
   * hängt — sie zieht dann um, und der bisherige Abend fällt auf „zugeteilt,
   * aber noch nichts gewählt" zurück. Seine Zuteilung bleibt ausdrücklich
   * stehen: die Leute sind dort weiter zuständig, sie haben nur ihre Auswahl
   * verloren, genau wie nach einem `unlink`.
   */
  private async resumeSession(
    tx: Prisma.TransactionClient,
    hauskreisId: string,
    meetingId: string,
    sessionId: string,
    viewer: Viewer,
    mitwirkende: string[],
  ): Promise<string> {
    const session = await tx.topicSession.findFirst({
      where: { id: sessionId, topic: { hauskreisId } },
      select: {
        id: true,
        meetingId: true,
        topicId: true,
        meeting: { select: { date: true } },
        topic: { select: topicMembershipSelect },
        responsibles: { select: { personId: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Topic session ${sessionId} not found`);
    }

    if (session.meetingId === meetingId) return sessionId;

    if (session.meeting && isPast(session.meeting.date, viewer.zone)) {
      throw new BadRequestException(
        'Diese Einheit gehört zu einem Abend, der schon war — die lässt sich nicht mehr umhängen.',
      );
    }

    // Der eigene Entwurf zählt auch dann, wenn der Owner die Person als
    // Mitarbeiterin entfernt hat — siehe `choices`.
    const eigenerEntwurf = session.responsibles.some(
      (row) => row.personId === viewer.personId,
    );

    if (
      !eigenerEntwurf &&
      !mayEditTopic({
        isAdmin: viewer.isAdmin,
        personId: viewer.personId,
        topic: membershipOf(session.topic),
      })
    ) {
      throw new ForbiddenException(
        'Wieder aufnehmen kann eine Einheit, wer an ihrem Thema mitarbeitet.',
      );
    }

    // `updateMany` und nicht `update`: nur so lässt sich der **beobachtete**
    // Stand in die Bedingung schreiben. Damit gewinnt auch hier die Datenbank
    // das Rennen, wenn zwei dieselbe Einheit gleichzeitig aufnehmen — die
    // zweite Zeile trifft nichts mehr.
    const { count } = await tx.topicSession.updateMany({
      where: { id: sessionId, meetingId: session.meetingId },
      data: { meetingId, version: { increment: 1 } },
    });

    if (count === 0) {
      throw new ConflictException(
        'Jemand war schneller — diese Einheit hängt schon an einem Abend.',
      );
    }

    await touchMeeting(tx, session.meetingId);
    await this.links.join(tx, sessionId, session.topicId, mitwirkende);
    await touchTopic(tx, session.topicId, { reopen: true });
    return sessionId;
  }

  /**
   * Die Auswahl zurücknehmen: die Einheit wird wieder unfertig.
   *
   * Nur solange der Abend bevorsteht. Danach ist die Einheit das Protokoll eines
   * Abends, der stattgefunden hat, und die löst man nicht mehr davon.
   */
  async unlink(hauskreisId: string, meetingId: string, viewer: Viewer) {
    const meeting = await this.loadMeeting(hauskreisId, meetingId);
    const session = meeting.topicSession;

    if (!session) {
      throw new NotFoundException('An diesem Abend hängt kein Thema');
    }

    if (isPast(meeting.date, viewer.zone)) {
      throw new BadRequestException(ABEND_WAR_SCHON);
    }

    const assigned = meeting.topicResponsibles.map((row) => row.personId);

    // Dieselbe Grenze wie beim Wählen: der Abend gehört denen, die ihn
    // vorbereiten.
    if (!assigned.includes(viewer.personId)) {
      throw new ForbiddenException(
        'Die Auswahl nimmt zurück, wer an dem Abend dafür zuständig ist.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.topicSession.update({
        where: { id: session.id },
        data: { meetingId: null, version: { increment: 1 } },
      });

      await touchTopic(tx, session.topicId);
      await touchMeeting(tx, meetingId);
    });
  }

  /**
   * Eine Einheit anlegen, ohne dass ein Abend dafür feststeht.
   *
   * Der Ort, an dem man in Ruhe vorarbeitet: Titel und Gedanken schreibt man
   * auf, wenn man sie hat, und sucht sich den Dienstag später. Vorher ging das
   * nur andersherum — erst einen Termin belegen, dann dort schreiben.
   *
   * Der Titel ist hier **Pflicht**, anders als beim Wählen an einem Abend. Dort
   * steht die Einheit unter ihrem Termin und ist auch ohne Titel auffindbar; ein
   * Entwurf ohne Abend hat nichts als seinen Titel.
   *
   * Wer sie anlegt, wird über `join` ihre Verantwortliche — sonst griffe die
   * Rettung aus Spec 8.5 (der eigene Entwurf bleibt greifbar, auch wenn der
   * Owner einen als Mitarbeitenden entfernt) für handgemachte Entwürfe nicht.
   * Keine Verfügbarkeitsprüfung, keine Benachrichtigung: es gibt keinen Abend,
   * an dem man verhindert sein könnte, und niemanden, dem etwas zugeteilt wurde.
   */
  async createSession(
    hauskreisId: string,
    topicId: string,
    dto: CreateTopicSessionDto,
    viewer: Viewer,
  ) {
    const topic = await this.prisma.topic.findFirst({
      where: { id: topicId, hauskreisId },
      select: topicMembershipSelect,
    });

    if (!topic) throw new NotFoundException(`Topic ${topicId} not found`);

    if (topic.standalone) throw new BadRequestException(BRAUCHT_UEBERTHEMA);

    if (
      !mayEditTopic({
        isAdmin: viewer.isAdmin,
        personId: viewer.personId,
        topic: membershipOf(topic),
      })
    ) {
      throw new ForbiddenException(
        'Eine Einheit legt an, wer am Thema mitarbeitet.',
      );
    }

    const sessionId = await this.prisma.$transaction(async (tx) => {
      const session = await tx.topicSession.create({
        data: {
          topicId,
          title: dto.title,
          actionstepText: dto.actionstepText ?? null,
          summaryText: dto.summaryText ?? null,
        },
        select: { id: true },
      });

      await this.links.join(tx, session.id, topicId, [viewer.personId]);
      await touchTopic(tx, topicId, { reopen: true });

      return session.id;
    });

    return this.findSession(hauskreisId, sessionId, viewer);
  }

  /**
   * Eine **einzelne** Einheit anlegen, ohne Thema und ohne Abend.
   *
   * Der zweite Weg ins Archiv, neben „Neues Thema": Nicht jeder Abend spannt
   * einen Bogen, und wer nur einen vorbereiten will, sollte kein Thema erfinden
   * müssen, das nie ein zweites Mal vorkommt.
   *
   * Was hier entsteht, ist trotzdem ein `Topic` — die Hülle, an der Owner und
   * Mitarbeitende hängen. Sie hat keinen Titel und wird nirgends als Thema
   * angezeigt; erst wenn jemand ihr über `nameTopic` einen gibt, wird sie eins.
   *
   * Der Titel der Einheit ist **Pflicht**, wie bei `createSession` und aus
   * demselben Grund: Eine Einheit ohne Abend hat nichts als ihn.
   */
  async createStandaloneSession(
    hauskreisId: string,
    dto: CreateTopicSessionDto,
    viewer: Viewer,
  ) {
    const sessionId = await this.prisma.$transaction(async (tx) => {
      const topic = await tx.topic.create({
        data: {
          hauskreisId,
          standalone: true,
          ownerPersonId: viewer.personId,
        },
        select: { id: true },
      });

      const session = await tx.topicSession.create({
        data: {
          topicId: topic.id,
          title: dto.title,
          actionstepText: dto.actionstepText ?? null,
          summaryText: dto.summaryText ?? null,
        },
        select: { id: true },
      });

      await this.links.join(tx, session.id, topic.id, [viewer.personId]);
      return session.id;
    });

    return this.findSession(hauskreisId, sessionId, viewer);
  }

  /**
   * Das Überthema: aus einer einzelnen Einheit wird ein Thema.
   *
   * Ein Titel und ein Schalter, mehr ist es nicht — und das ist der Grund,
   * warum die Hülle überhaupt existiert. Termin-Bindung, Verantwortliche,
   * Mitarbeitende und der Inhalt der Einheit bleiben unangetastet, weil sie
   * schon an der richtigen Stelle hängen.
   *
   * Der Weg zurück fehlt mit Absicht. „Das Thema doch wieder auflösen" wäre nur
   * dann eindeutig, wenn genau eine Einheit daran hinge — und wer die zweite
   * schon angelegt hat, meint mit dem Knopf etwas anderes als die App.
   */
  async nameTopic(
    hauskreisId: string,
    sessionId: string,
    title: string,
    viewer: Viewer,
  ) {
    const session = await this.prisma.topicSession.findFirst({
      where: { id: sessionId, topic: { hauskreisId } },
      select: {
        id: true,
        topicId: true,
        topic: { select: topicMembershipSelect },
        responsibles: { select: { personId: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Topic session ${sessionId} not found`);
    }

    if (!session.topic.standalone) {
      throw new BadRequestException(
        'Diese Einheit gehört schon zu einem Thema — den Titel ändert man dort.',
      );
    }

    // Dieselbe Rettung wie in `resumeSession` und `promote`.
    const eigene = session.responsibles.some(
      (row) => row.personId === viewer.personId,
    );

    if (
      !eigene &&
      !mayEditTopic({
        isAdmin: viewer.isAdmin,
        personId: viewer.personId,
        topic: membershipOf(session.topic),
      })
    ) {
      throw new ForbiddenException(
        'Ein Überthema gibt der Einheit, wer sie vorbereitet hat.',
      );
    }

    const { count } = await this.prisma.topic.updateMany({
      where: { id: session.topicId, standalone: true },
      data: { title, standalone: false, version: { increment: 1 } },
    });

    if (count === 0) {
      throw new ConflictException(
        'Jemand war schneller — diese Einheit gehört inzwischen zu einem Thema.',
      );
    }

    return this.findSession(hauskreisId, sessionId, viewer);
  }

  /**
   * Eine Einheit löschen.
   *
   * Nur, solange sie noch nicht gehalten wurde — `isHeld` beantwortet genau das
   * („kein Abend, ein kommender, oder ein abgesagter"). Ein Abend, der war, ist
   * das Protokoll dessen, was war; wer den loswerden will, löscht das ganze
   * Thema und trifft damit eine sichtbar größere Entscheidung.
   *
   * Die Mitarbeiter-Zeilen am Thema bleiben absichtlich stehen: eine Einheit zu
   * löschen ist kein Rollenwechsel. Wer jemandem das Schreibrecht nehmen will,
   * nimmt es ihm — dafür gibt es `DELETE …/topics/:id/collaborators/:personId`.
   */
  async removeSession(
    hauskreisId: string,
    sessionId: string,
    viewer: Viewer,
  ): Promise<void> {
    const session = await this.prisma.topicSession.findFirst({
      where: { id: sessionId, topic: { hauskreisId } },
      select: {
        id: true,
        topicId: true,
        meetingId: true,
        meeting: { select: { date: true, status: true } },
        topic: { select: topicMembershipSelect },
      },
    });

    if (!session) {
      throw new NotFoundException(`Topic session ${sessionId} not found`);
    }

    if (isHeld(session.meeting, viewer.zone)) {
      throw new BadRequestException(ABEND_WAR_SCHON);
    }

    if (
      !mayEditTopic({
        isAdmin: viewer.isAdmin,
        personId: viewer.personId,
        topic: membershipOf(session.topic),
      })
    ) {
      throw new ForbiddenException(
        'Eine Einheit löscht, wer am Thema mitarbeitet.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (session.topic.standalone) {
        // Die Hülle geht mit. Sie hat keine zweite Einheit — sie *kann* keine
        // haben — und bliebe sonst als titelloser Eintrag unter „Eigene Themen"
        // stehen: ein Thema, das niemand angelegt hat und niemand sieht, bis es
        // in einer Liste auftaucht. Die Einheit selbst fällt per Cascade mit.
        await tx.topic.delete({ where: { id: session.topicId } });
        await touchMeeting(tx, session.meetingId);
        return;
      }

      // `TopicSessionResponsible` fällt per `onDelete: Cascade` mit.
      await tx.topicSession.delete({ where: { id: sessionId } });

      await touchMeeting(tx, session.meetingId);
      await touchTopic(tx, session.topicId);
    });
  }

  // -------------------------------------------------------------------- Inhalt

  /**
   * Eine Einheit für sich, mit ihrer Stelle im Thema.
   *
   * `sessionIndex`/`sessionCount` stehen hier, weil die Einheit seit ihrem
   * eigenen Bildschirm für sich allein angezeigt wird — vorher stand sie immer
   * unter einer Liste, die die Zählung selbst kannte. Die Geschwister liegen
   * ohnehin schon im `select`.
   */
  async findSession(hauskreisId: string, sessionId: string, viewer: Viewer) {
    const session = await this.prisma.topicSession.findFirst({
      where: { id: sessionId, topic: { hauskreisId } },
      select: sessionSelectWithTopic,
    });

    if (!session) {
      throw new NotFoundException(`Topic session ${sessionId} not found`);
    }

    return {
      ...shapeSession(session, session.topic, viewer),
      ...sessionPosition(session.id, session.topic.sessions),
    };
  }

  /**
   * Titel, Actionstep und Zusammenfassung eines Abends.
   *
   * Bearbeiten darf, wer zum **Thema** gehört — jede Einheit davon, auch die, bei
   * der man selbst nicht dabei war (Spec 8.1). Ein Recht je Abend wäre
   * Buchhaltung; ein Thema ist eine gemeinsame Arbeit.
   */
  async updateSession(
    hauskreisId: string,
    sessionId: string,
    dto: UpdateTopicSessionDto,
    viewer: Viewer,
    condition?: IfMatchCondition,
  ) {
    const session = await this.prisma.topicSession.findFirst({
      where: { id: sessionId, topic: { hauskreisId } },
      select: {
        id: true,
        meetingId: true,
        topicId: true,
        topic: { select: topicMembershipSelect },
      },
    });

    if (!session) {
      throw new NotFoundException(`Topic session ${sessionId} not found`);
    }

    if (
      !mayEditTopic({
        isAdmin: viewer.isAdmin,
        personId: viewer.personId,
        topic: membershipOf(session.topic),
      })
    ) {
      throw new ForbiddenException(
        'Zusammenfassung und Actionstep trägt ein, wer das Thema vorbereitet.',
      );
    }

    return updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.$transaction(async (tx) => {
          const result = await tx.topicSession.updateMany({
            where: { id: sessionId, ...versionConstraint },
            data: {
              title: dto.title,
              actionstepText: dto.actionstepText,
              summaryText: dto.summaryText,
              version: { increment: 1 },
            },
          });

          // Nur bei einem Treffer: ein an der Version gescheiterter Schreibversuch
          // hat nichts geändert und darf weder Termin noch Thema veralten lassen.
          //
          // Das Thema muss mit, obwohl sich an ihm selbst nichts ändert: seine
          // Antwort trägt die Einheiten, und ihr ETag kommt aus `topic.version`.
          // Ohne den Sprung antwortet die Themenseite nach dem Umbenennen mit
          // `304` und zeigt den alten Titel.
          if (result.count > 0) {
            await touchMeeting(tx, session.meetingId);
            await touchTopic(tx, session.topicId);
          }

          return result;
        }),
      exists: () =>
        this.prisma.topicSession.findFirst({ where: { id: sessionId } }),
      reload: () => this.findSession(hauskreisId, sessionId, viewer),
      notFoundMessage: `Topic session ${sessionId} not found`,
    });
  }

  // -------------------------------------------------------------------- Helfer

  private async loadMeeting(hauskreisId: string, meetingId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, hauskreisId },
      select: {
        id: true,
        date: true,
        hasTopicSlot: true,
        topicResponsibles: { select: { personId: true } },
        topicSession: { select: { id: true, topicId: true } },
      },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${meetingId} not found`);
    }

    return meeting;
  }

  /**
   * Hütet die Mandantengrenze: die Fremdschlüssel allein ließen ein Thema auf
   * Personen aus einem anderen Hauskreis zeigen.
   */
  private async assertPeopleBelongToHauskreis(
    hauskreisId: string,
    personIds: string[],
  ): Promise<void> {
    if (personIds.length === 0) return;

    const found = await this.prisma.person.count({
      where: { id: { in: personIds }, hauskreisId },
    });

    if (found !== new Set(personIds).size) {
      throw new BadRequestException(
        'At least one responsible person does not belong to this Hauskreis',
      );
    }
  }
}

/** Der jüngste Abend, an dem eine Einheit dieses Themas hing. */
function lastHeldDate(
  sessions: { meeting: { date: Date } | null }[],
  zone: string,
): Date | null {
  const daten = sessions
    .map((session) => session.meeting?.date)
    .filter((date): date is Date => date !== undefined && isPast(date, zone));

  if (daten.length === 0) return null;

  return daten.reduce((jüngster, date) => (date > jüngster ? date : jüngster));
}

/**
 * Der Zusammenstoß zweier gleichzeitiger Wahlen.
 *
 * `P2002` auf `topic_session.meeting_id` heißt genau eine Sache: jemand war eine
 * Wimpernlänge schneller. Als 500 wäre es ein Serverfehler, der keiner ist.
 */
function toConflict(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new ConflictException(
      'Jemand war schneller — an diesem Abend hängt schon ein Thema.',
    );
  }

  return error;
}
