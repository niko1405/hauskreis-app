import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignmentRole,
  AttendanceSource,
  AttendanceStatus,
  MeetingCancelSource,
  MeetingStatus,
} from '../../generated/prisma/enums';
import { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import { AvailabilityService } from '../role-suggestion/availability.service';
import { locationInclude } from '../location/location.service';
import { MeetingCancellationService } from './meeting-cancellation.service';
import { MeetingNotificationService } from './meeting-notification.service';
import { RoleReleaseService } from './role-release.service';
import { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import { toPage } from '../common/http/pagination';
import type { IfMatchCondition } from '../common/http/etag';
import { toUtcDate } from './meeting-schedule';
import type {
  CancelMeetingDto,
  CreateMeetingDto,
  ListMeetingsQueryDto,
  SetAttendanceDto,
  UpdateMeetingDto,
} from './dto/meeting.dto';

const meetingInclude = {
  // Nicht `true`: `locationResponseSchema` verlangt `residents`, und ohne das
  // Include fehlt es in der Antwort — siehe `locationInclude`.
  location: { include: locationInclude },
  host: { select: { id: true, name: true } },
  topic: {
    select: {
      id: true,
      title: true,
      status: true,
      responsibles: {
        select: { person: { select: { id: true, name: true } } },
      },
    },
  },
  // Dieselbe Verschachtelung wie bei `topic.responsibles`: so wie Prisma es
  // zurückgibt, ohne Umformung im Service — sonst müsste jede Stelle, die
  // einen Termin lädt, daran denken.
  songLeaders: {
    select: { person: { select: { id: true, name: true } } },
  },
  actionstepDone: {
    select: { person: { select: { id: true, name: true } }, doneAt: true },
    orderBy: { doneAt: 'asc' },
  },
  attendances: {
    select: { personId: true, status: true },
  },
  cancelledBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class MeetingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleSuggestions: RoleSuggestionService,
    private readonly meetingNotifications: MeetingNotificationService,
    private readonly cancellations: MeetingCancellationService,
    private readonly roleAssignments: RoleAssignmentNotifier,
    private readonly availability: AvailabilityService,
    private readonly roleRelease: RoleReleaseService,
  ) {}

  async findAll(hauskreisId: string, query: ListMeetingsQueryDto) {
    const today = toUtcDate(new Date());

    // `from`/`to` narrow the scope rather than replace it: `scope=past` with a
    // `to` next year must still stop at today, or the archive would quietly
    // start listing evenings that have not happened.
    const date: { gte?: Date; lt?: Date; lte?: Date } = {};

    if (query.scope === 'upcoming') {
      date.gte = today;
    } else if (query.scope === 'past') {
      date.lt = today;
    }

    if (query.from) {
      const from = toUtcDate(query.from);
      date.gte = date.gte && date.gte > from ? date.gte : from;
    }

    if (query.to) {
      date.lte = toUtcDate(query.to);
    }

    const where = {
      hauskreisId,
      ...(Object.keys(date).length > 0 ? { date } : {}),
      ...buildMeetingSearch(query.search),
    };

    const [items, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where,
        include: meetingInclude,
        // Upcoming reads best oldest-first, the archive newest-first.
        orderBy: { date: query.scope === 'past' ? 'desc' : 'asc' },
        take: query.take,
        skip: query.skip,
      }),
      this.prisma.meeting.count({ where }),
    ]);

    return toPage(items, total, query);
  }

  async findOne(hauskreisId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, hauskreisId },
      include: meetingInclude,
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${id} not found`);
    }

    return meeting;
  }

  async create(hauskreisId: string, dto: CreateMeetingDto) {
    const date = new Date(dto.date);
    await this.assertReferencesBelongToHauskreis(hauskreisId, dto);

    const clash = await this.prisma.meeting.findFirst({
      where: { hauskreisId, date },
    });

    if (clash) {
      throw new BadRequestException(
        `A meeting already exists on ${dto.date}. Edit that one instead.`,
      );
    }

    const venue = await this.resolveVenue(hauskreisId, dto, {
      hostPersonId: null,
      location: null,
    });

    return this.prisma.meeting.create({
      data: {
        hauskreisId,
        date,
        type: dto.type,
        locationId: venue.locationId ?? null,
        hostPersonId: venue.hostPersonId ?? null,
        topicId: dto.topicId ?? null,
        title: dto.title ?? null,
        infoText: dto.infoText ?? null,
      },
      include: meetingInclude,
    });
  }

  async update(
    hauskreisId: string,
    id: string,
    dto: UpdateMeetingDto,
    /** Wer gerade einträgt — bekommt keine Nachricht über sich selbst. */
    actorPersonId?: string,
    condition?: IfMatchCondition,
  ) {
    const before = await this.findOne(hauskreisId, id);
    this.assertNotAheadOfTheEvening(before.date, dto);
    await this.assertReferencesBelongToHauskreis(hauskreisId, dto);
    const venue = await this.resolveVenue(hauskreisId, dto, before);

    // Nur beim echten Wechsel: ein `PATCH` mit dem Info-Text darf nicht daran
    // scheitern, dass der eingetragene Gastgeber inzwischen abgesagt hat.
    if (venue.hostPersonId && venue.hostPersonId !== before.hostPersonId) {
      await this.availability.assertAvailable(hauskreisId, id, [
        venue.hostPersonId,
      ]);
    }

    const updated = await updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.meeting.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            type: dto.type,
            // `undefined` leaves a field alone, `null` clears it — that
            // distinction is what lets a host or location be un-assigned.
            locationId: venue.locationId,
            hostPersonId: venue.hostPersonId,
            topicId: dto.topicId,
            title: dto.title,
            testimonyText: dto.testimonyText,
            actionstepText: dto.actionstepText,
            summaryText: dto.summaryText,
            infoText: dto.infoText,
            version: { increment: 1 },
          },
        }),
      exists: () =>
        this.prisma.meeting.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findOne(hauskreisId, id),
      notFoundMessage: `Meeting ${id} not found`,
    });

    // Wer eingeteilt wird, soll es sofort erfahren und nicht erst durch die
    // Erinnerung drei Tage vorher. Nur bei echtem Wechsel: ein `PATCH` mit dem
    // Info-Text darf niemanden anschreiben.
    if (
      updated.hostPersonId &&
      updated.hostPersonId !== before.hostPersonId &&
      updated.status !== MeetingStatus.CANCELLED
    ) {
      await this.roleAssignments.announce(
        id,
        AssignmentRole.HOST,
        [updated.hostPersonId],
        actorPersonId,
      );
    }

    return updated;
  }

  /**
   * Zusammenfassung und Actionstep sind **Nachbereitung**.
   *
   * Sie beschreiben, was an einem Abend passiert ist — vorher gibt es dazu
   * nichts zu sagen. Wer sie an einem Termin in sechs Wochen einträgt, hat sich
   * in der Liste vergriffen; die Oberfläche zeigt die Felder deshalb erst ab
   * dem Termintag, und hier steht die Regel, die das trägt.
   *
   * Der Tag selbst zählt dazu: der Hauskreis ist abends, eingetragen wird
   * danach — und das ist derselbe Kalendertag.
   */
  private assertNotAheadOfTheEvening(
    meetingDate: Date,
    dto: Pick<UpdateMeetingDto, 'actionstepText' | 'summaryText'>,
  ): void {
    if (dto.actionstepText === undefined && dto.summaryText === undefined) {
      return;
    }

    if (toUtcDate(meetingDate) > toUtcDate(new Date())) {
      throw new BadRequestException(
        'Zusammenfassung und Actionstep lassen sich erst am Abend selbst eintragen',
      );
    }
  }

  /**
   * Sagt den ganzen Abend ab. Nur Admins — die eigene Teilnahme abzusagen ist
   * etwas anderes und geht über `setAttendance`.
   */
  async cancel(
    hauskreisId: string,
    id: string,
    dto: CancelMeetingDto,
    byPersonId: string,
    condition?: IfMatchCondition,
  ) {
    const before = await this.findOne(hauskreisId, id);

    const cancelled = await updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.meeting.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            status: MeetingStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledByPersonId: byPersonId,
            cancelSource: MeetingCancelSource.MANUAL,
            cancelReason: dto.reason ?? null,
            version: { increment: 1 },
          },
        }),
      exists: () =>
        this.prisma.meeting.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findOne(hauskreisId, id),
      notFoundMessage: `Meeting ${id} not found`,
    });

    // Cancelling an already-cancelled meeting stays silent. Und ein vergangener
    // Abend auch: dort heißt Absagen „es hat nicht stattgefunden", ein
    // Nachtrag fürs Archiv. Eine Benachrichtigung darüber wäre eine Warnung
    // vor etwas, das längst vorbei ist.
    if (before.status !== MeetingStatus.CANCELLED && !isPast(before.date)) {
      await this.meetingNotifications.announceCancellation(id);
    }

    return cancelled;
  }

  /**
   * Nimmt eine Absage zurück — auch eine automatische, falls jemand den Abend
   * trotz lauter Absagen stattfinden lassen will.
   */
  async uncancel(
    hauskreisId: string,
    id: string,
    condition?: IfMatchCondition,
  ) {
    const before = await this.findOne(hauskreisId, id);

    const revived = await updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.meeting.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            status: MeetingStatus.PLANNED,
            cancelledAt: null,
            cancelledByPersonId: null,
            cancelSource: null,
            cancelReason: null,
            version: { increment: 1 },
          },
        }),
      exists: () =>
        this.prisma.meeting.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findOne(hauskreisId, id),
      notFoundMessage: `Meeting ${id} not found`,
    });

    if (before.status === MeetingStatus.CANCELLED && !isPast(before.date)) {
      await this.meetingNotifications.announceRevival(id);
    }

    return revived;
  }

  /**
   * Who could host this meeting, and where, best fit first.
   *
   * The meeting itself is excluded from the history — otherwise re-opening the
   * picker on a meeting that already has a host would push that host down the
   * list because of the very assignment being reconsidered.
   */
  async suggestHosts(hauskreisId: string, id: string) {
    const meeting = await this.loadForSuggestions(hauskreisId, id);

    return this.roleSuggestions.suggestHosts(hauskreisId, meeting.date, {
      excludeMeetingId: meeting.id,
    });
  }

  /**
   * Who could prepare the topic for this meeting, best fit first.
   *
   * A topic already on the meeting is left out of the history, so re-opening
   * the picker does not push its own people down the list.
   */
  async suggestTopicResponsibles(hauskreisId: string, id: string) {
    const meeting = await this.loadForSuggestions(hauskreisId, id);

    return this.roleSuggestions.suggestTopicResponsibles(
      hauskreisId,
      meeting.date,
      {
        excludeTopicId: meeting.topicId ?? undefined,
        // Nicht zum Ausschließen aus der Historie, sondern um zu wissen, wer
        // für genau diesen Abend abgesagt hat.
        meetingId: meeting.id,
      },
    );
  }

  /**
   * The three fields the suggestion engines actually need.
   *
   * Going through `findOne` would pull the full `meetingInclude` — location,
   * host, topic with its responsibles, every attendance — to read a date. The
   * song variant in `meeting-song.controller.ts` already does it this way.
   */
  private async loadForSuggestions(hauskreisId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, hauskreisId },
      select: { id: true, date: true, topicId: true },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${id} not found`);
    }

    return meeting;
  }

  async remove(hauskreisId: string, id: string) {
    await this.findOne(hauskreisId, id);
    await this.prisma.meeting.delete({ where: { id } });
  }

  async setAttendance(hauskreisId: string, id: string, dto: SetAttendanceDto) {
    await this.findOne(hauskreisId, id);
    await this.assertPersonBelongsToHauskreis(hauskreisId, dto.personId);

    const previous = await this.prisma.meetingAttendance.findUnique({
      where: { meetingId_personId: { meetingId: id, personId: dto.personId } },
      select: { status: true },
    });

    const attendance = await this.prisma.meetingAttendance.upsert({
      where: { meetingId_personId: { meetingId: id, personId: dto.personId } },
      // Answering by hand claims the row, even when an absence period wrote it.
      // Without this a "doch, ich komme" would keep the ABSENCE marker and the
      // next sync would feel free to delete it again.
      update: { status: dto.status, source: AttendanceSource.SELF },
      create: {
        meetingId: id,
        personId: dto.personId,
        status: dto.status,
        source: AttendanceSource.SELF,
      },
    });

    // Only on the transition into "absent": re-saving the same answer, or
    // switching between attending and undecided, is nobody's business.
    if (
      dto.status === AttendanceStatus.ABSENT &&
      previous?.status !== AttendanceStatus.ABSENT
    ) {
      // Erst freigeben, dann Bescheid sagen: sonst ginge die Nachricht „jemand
      // hat für deinen Abend abgesagt" noch an den Gastgeber, der genau in
      // diesem Moment aufhört, einer zu sein.
      const released = await this.roleRelease.releaseFor(id, dto.personId);
      await this.meetingNotifications.handleDecline(id, dto.personId, released);
    }

    // Diese Antwort kann die letzte gewesen sein, die den Abend noch hielt —
    // oder die erste, die ihn wieder aufleben lässt.
    if (previous?.status !== dto.status) {
      await this.cancellations.reconcile(id);
    }

    return attendance;
  }

  /**
   * Hakt den Actionstep eines Abends für **eine** Person ab, oder nimmt den
   * Haken zurück.
   *
   * Ohne `If-Match`: es ist ein Schalter, kein Wettlauf. Zwei Personen, die
   * gleichzeitig abhaken, schreiben verschiedene Zeilen; dieselbe Person
   * zweimal schreibt zweimal dasselbe. Es gibt nichts, was ein 412 retten
   * könnte — und einen Haken erst nach einem `GET` setzen zu dürfen, wäre für
   * die Erinnerung auf dem Startbildschirm ein Umweg ohne Gegenwert.
   *
   * Idempotent in beide Richtungen: nochmal abhaken behält den ursprünglichen
   * Zeitpunkt (`doneAt` ist „seit wann", nicht „zuletzt angetippt"), und ein
   * Haken, den es nicht gibt, lässt sich folgenlos entfernen.
   */
  async setActionstepDone(
    hauskreisId: string,
    id: string,
    personId: string,
    done: boolean,
  ) {
    const meeting = await this.findOne(hauskreisId, id);

    // Einen Actionstep abhaken, den es an einem künftigen Abend noch gar nicht
    // geben kann, ist immer ein Versehen.
    if (toUtcDate(meeting.date) > toUtcDate(new Date())) {
      throw new BadRequestException(
        'Dieser Abend liegt noch vor uns — abhaken lässt sich der Actionstep erst danach',
      );
    }

    await this.assertPersonBelongsToHauskreis(hauskreisId, personId);

    const key = { meetingId_personId: { meetingId: id, personId } };

    if (!done) {
      await this.prisma.meetingActionstepDone.deleteMany({
        where: { meetingId: id, personId },
      });

      return { meetingId: id, personId, done: false, doneAt: null };
    }

    const row = await this.prisma.meetingActionstepDone.upsert({
      where: key,
      // Leer: ein zweites Antippen ist kein neues Abhaken.
      update: {},
      create: { meetingId: id, personId },
    });

    return { meetingId: id, personId, done: true, doneAt: row.doneAt };
  }

  /**
   * Ort und Gastgeber sind **eine** Entscheidung, nicht zwei.
   *
   * Vorher waren es zwei unabhängige Felder, und damit ließ sich „Abend bei
   * Chris" mit „Ort: Bei Niko" kombinieren — zwei Angaben, die sich
   * widersprechen, und niemand weiß, welche gilt. Wer hostet, hostet bei sich;
   * ein Ort ohne Gastgeber (Schlosspark) ist die Ausnahme, für die es
   * `requiresHost = false` gibt.
   *
   * Durchgesetzt wird das hier und nicht nur in der Oberfläche: die API ist
   * auch aus Bruno, aus einem Skript oder aus der nächsten Ansicht erreichbar.
   *
   * Die vier Fälle:
   *
   * | Eingabe | Ergebnis |
   * |---|---|
   * | Gastgeber gesetzt | Ort = dessen Zuhause, ein abweichender Ort ist ein Fehler |
   * | Gastgeber gesetzt, aber ohne Adresse | Fehler — ohne Wohnung kein Hosten |
   * | Kein Gastgeber, Ort gewählt | nur Orte ohne Gastgeber |
   * | Gastgeber herausgenommen | eine Wohnung geht mit, ein Treffpunkt bleibt |
   */
  private async resolveVenue(
    hauskreisId: string,
    dto: { locationId?: string | null; hostPersonId?: string | null },
    before: {
      hostPersonId: string | null;
      location: { requiresHost: boolean } | null;
    },
  ): Promise<{ locationId?: string | null; hostPersonId?: string | null }> {
    const hostChanged = dto.hostPersonId !== undefined;
    const hostAfter = hostChanged ? dto.hostPersonId : before.hostPersonId;

    if (hostAfter) {
      const host = await this.prisma.person.findFirstOrThrow({
        where: { id: hostAfter, hauskreisId },
        select: { name: true, locationId: true },
      });

      if (!host.locationId) {
        throw new BadRequestException(
          `${host.name} hat keine Adresse hinterlegt und kann deshalb nicht Gastgeber sein.`,
        );
      }

      // Nicht still überschreiben: wer beides schickt, hat eine Vorstellung,
      // und die stimmt hier nicht mit der Wirklichkeit überein.
      if (dto.locationId !== undefined && dto.locationId !== host.locationId) {
        throw new BadRequestException(
          'Der Ort ergibt sich aus dem Gastgeber. Nimm erst den Gastgeber heraus, dann lässt sich ein Treffpunkt wählen.',
        );
      }

      return { hostPersonId: dto.hostPersonId, locationId: host.locationId };
    }

    if (dto.locationId) {
      const location = await this.prisma.location.findFirstOrThrow({
        where: { id: dto.locationId, hauskreisId },
        select: { name: true, requiresHost: true },
      });

      if (location.requiresHost) {
        throw new BadRequestException(
          `${location.name} ist ein Zuhause — trag die Person als Gastgeber ein, dann stimmt der Ort von allein.`,
        );
      }

      return { hostPersonId: dto.hostPersonId, locationId: dto.locationId };
    }

    // Gastgeber raus, ohne dass ein neuer Ort mitkommt: eine Wohnung ohne ihre
    // Bewohner:innen ergibt keinen Sinn und fällt mit weg. Ein Treffpunkt hing
    // nie am Gastgeber und bleibt stehen.
    if (
      hostChanged &&
      dto.hostPersonId === null &&
      dto.locationId === undefined &&
      before.location?.requiresHost
    ) {
      return { hostPersonId: null, locationId: null };
    }

    return { hostPersonId: dto.hostPersonId, locationId: dto.locationId };
  }

  /**
   * Guards the multi-tenant boundary: a meeting must never point at a person or
   * location from a different Hauskreis. The foreign keys alone would allow it.
   */
  private async assertReferencesBelongToHauskreis(
    hauskreisId: string,
    dto: {
      locationId?: string | null;
      hostPersonId?: string | null;
      topicId?: string | null;
    },
  ): Promise<void> {
    if (dto.hostPersonId) {
      await this.assertPersonBelongsToHauskreis(hauskreisId, dto.hostPersonId);
    }

    if (dto.topicId) {
      const topic = await this.prisma.topic.findFirst({
        where: { id: dto.topicId, hauskreisId },
      });

      if (!topic) {
        throw new BadRequestException(
          `Topic ${dto.topicId} does not belong to this Hauskreis`,
        );
      }
    }

    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: dto.locationId, hauskreisId },
      });

      if (!location) {
        throw new BadRequestException(
          `Location ${dto.locationId} does not belong to this Hauskreis`,
        );
      }
    }
  }

  private async assertPersonBelongsToHauskreis(
    hauskreisId: string,
    personId: string,
  ): Promise<void> {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, hauskreisId },
    });

    if (!person) {
      throw new BadRequestException(
        `Person ${personId} does not belong to this Hauskreis`,
      );
    }
  }
}

/**
 * Liegt der Abend hinter uns?
 *
 * Beide Seiten auf Mitternacht UTC geschnitten, weil `meeting.date` ein
 * Kalendertag ist: der heutige Abend zählt bis zum Ende des Tages als kommend,
 * sonst wäre ein Termin ab 00:01 „vergangen" und jede Absage stumm.
 */
function isPast(date: Date): boolean {
  return toUtcDate(date) < toUtcDate(new Date());
}

/**
 * Matches free text against everything an evening was written down as.
 *
 * Deliberately spread across all the text fields plus the topic's title: the
 * archive question is "wann ging es nochmal um Vergebung", and nobody
 * remembers whether that ended up in the summary, the info line or the topic.
 *
 * `contains` with `insensitive` rather than full-text search — at a few hundred
 * evenings the index would cost more to maintain than the scan costs to run,
 * and substring matching is what people expect from a search box.
 */
function buildMeetingSearch(search: string | undefined) {
  if (!search) {
    return {};
  }

  const contains = { contains: search, mode: 'insensitive' as const };

  return {
    OR: [
      { title: contains },
      { summaryText: contains },
      { actionstepText: contains },
      { infoText: contains },
      { testimonyText: contains },
      { topic: { title: contains } },
    ],
  };
}
