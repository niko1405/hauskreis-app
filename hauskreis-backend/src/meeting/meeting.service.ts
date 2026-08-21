import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { personRefSelect } from '../common/dto/response';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignmentRole,
  AttendanceSource,
  AttendanceStatus,
  MeetingCancelSource,
  MeetingStatus,
  MeetingType,
} from '../../generated/prisma/enums';
import { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import { AvailabilityService } from '../role-suggestion/availability.service';
import { locationInclude } from '../location/location.service';
import { ANGEKOMMEN } from '../person/angekommen';
import { TopicLinkService } from '../topic/topic-link.service';
import {
  sessionSelectWithTopic,
  shapeSessionForMeeting,
  type Viewer,
} from '../topic/topic-shape';
import { MeetingCancellationService } from './meeting-cancellation.service';
import { MeetingScheduleConfigService } from './meeting-schedule-config.service';
import { GroupClockService } from './group-clock.service';
import { MeetingNotificationService } from './meeting-notification.service';
import { RoleReleaseService } from './role-release.service';
import { CustomMeetingNotificationService } from './custom-meeting-notification.service';
import { AutoAttendanceService } from '../attendance/auto-attendance.service';
import { RoleAttendanceService } from '../attendance/role-attendance.service';
import { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import { eveningReached } from '../common/time/local-evening';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import { toPage } from '../common/http/pagination';
import type { IfMatchCondition } from '../common/http/etag';
import {
  finishedBefore,
  notFinishedBefore,
  overlapping,
  toUtcDate,
} from './meeting-schedule';
import { touchMeeting } from './meeting-version';
import {
  assertNotesSlotNotAhead,
  assertSlotsAllow,
  assertSlotsExclusive,
  clearedByTurningOff,
  resolveSlots,
  slotDefaults,
} from './meeting-slots';
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
  host: { select: personRefSelect },
  testimonyPerson: { select: personRefSelect },
  // Wer an diesem Abend das Thema vorbereitet. Die **Zuteilung** — was daraus
  // gewählt wurde, steht darunter und kann fehlen.
  topicResponsibles: {
    select: { person: { select: personRefSelect } },
    orderBy: { person: { name: 'asc' } },
  },
  topicSession: { select: sessionSelectWithTopic },
  // Dieselbe Verschachtelung wie bei `topicResponsibles`: so wie Prisma es
  // zurückgibt, ohne Umformung im Service — sonst müsste jede Stelle, die
  // einen Termin lädt, daran denken.
  songLeaders: {
    select: { person: { select: personRefSelect } },
  },
  actionstepDone: {
    select: { person: { select: personRefSelect }, doneAt: true },
    orderBy: { doneAt: 'asc' },
  },
  attendances: {
    // Dieselbe Menge wie überall sonst. Ohne diesen Filter zählte die
    // Terminkarte Eingeladene mit, die nie angenommen haben, und an
    // vergangenen Abenden auch Ausgetretene — deren Zeilen bleiben dort
    // stehen, `RoleReleaseService` räumt nur die kommenden. Die Detailseite
    // sortierte beide längst aus, also sagten die zwei Bildschirme über
    // denselben Abend zwei verschiedene Zahlen.
    where: { person: ANGEKOMMEN },
    select: { personId: true, status: true },
  },
  cancelledBy: { select: personRefSelect },
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
    private readonly autoAttendance: AutoAttendanceService,
    private readonly roleAttendance: RoleAttendanceService,
    private readonly customMeetingNotifications: CustomMeetingNotificationService,
    private readonly topicLinks: TopicLinkService,
    private readonly schedule: MeetingScheduleConfigService,
    private readonly clock: GroupClockService,
  ) {}

  async findAll(
    hauskreisId: string,
    query: ListMeetingsQueryDto,
    viewer: Viewer,
  ) {
    const today = await this.clock.today(hauskreisId);

    // Jede Bedingung für sich, alle mit UND verknüpft. Vorher war es **ein**
    // `date`-Objekt, in das Bereich und Zeitfenster hineingerechnet wurden —
    // das ging, solange ein Termin ein Tag war. Seit er ein Zeitraum sein
    // kann, ist jede Bedingung ein eigenes `OR` über zwei Zweige, und zwei
    // davon nebeneinander im selben Objekt überschrieben sich.
    //
    // `from`/`to` engen den Bereich weiter ein, statt ihn zu ersetzen:
    // `scope=past` mit einem `to` im nächsten Jahr muss trotzdem heute
    // aufhören, sonst listete das Archiv Abende, die noch nicht waren.
    const windows: object[] = [];

    if (query.scope === 'upcoming') {
      windows.push(notFinishedBefore(today));
    } else if (query.scope === 'past') {
      windows.push(finishedBefore(today));
    }

    if (query.from) {
      windows.push(notFinishedBefore(toUtcDate(query.from)));
    }

    if (query.to) {
      windows.push({ date: { lte: toUtcDate(query.to) } });
    }

    const where = {
      hauskreisId,
      ...(windows.length > 0 ? { AND: windows } : {}),
      // Wer nachliest, was war, sucht Abende, an denen etwas war. In der
      // Terminliste bleiben sie drin: dort ist „fällt aus" die Auskunft.
      //
      // Auf `=== false` und nicht auf falsy: die Vorgabe ist „mitnehmen", und
      // ein Aufruf ohne dieses Feld — aus einem anderen Dienst, aus einem
      // Test — soll die Vorgabe bekommen und nicht ihr Gegenteil.
      ...(query.includeCancelled === false
        ? { status: { not: MeetingStatus.CANCELLED } }
        : {}),
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

    return toPage(
      items.map((meeting) => shapeMeeting(meeting, viewer)),
      total,
      query,
    );
  }

  async findOne(hauskreisId: string, id: string, viewer: Viewer) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, hauskreisId },
      include: meetingInclude,
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${id} not found`);
    }

    return shapeMeeting(meeting, viewer);
  }

  async create(
    hauskreisId: string,
    dto: CreateMeetingDto,
    /** Wer anlegt — bekommt keine Nachricht über den eigenen Termin. */
    viewer: Viewer,
  ) {
    const date = new Date(dto.date);
    const endDate = this.resolveEndDate(dto.type, date, dto.endDate);
    await this.assertReferencesBelongToHauskreis(hauskreisId, dto);
    await this.assertNoOverlap(hauskreisId, date, endDate);

    // Weggelassene Schalter heißen beim Anlegen „nimm, was zu dieser Terminart
    // gehört". Ein `CUSTOM` kommt damit leer auf die Welt — genau das ist der
    // Punkt: ein Geburtstagsabend soll nicht als unvollständig dastehen, weil
    // ihm ein Thema fehlt, das er nie brauchte.
    const slots = resolveSlots(
      { ...slotDefaults(dto.type), type: dto.type },
      dto,
    );
    assertSlotsAllow(slots, dto);
    assertSlotsExclusive(slots);

    // Ohne Angabe die Zeit der Gruppe — dieselbe, die gleich geschrieben wird.
    const startMinutes =
      dto.startTime ??
      (await this.schedule.getRhythm(hauskreisId)).startMinutes;

    // Auch beim Anlegen: die API ist aus Bruno und aus jedem Skript erreichbar,
    // und ein rückdatierter Termin passiert die Regel korrekt.
    assertNotesSlotNotAhead(slotDefaults(dto.type), slots, {
      date,
      startMinutes,
      zone: await this.clock.zoneOf(hauskreisId),
    });

    const venue = await this.resolveVenue(hauskreisId, dto, {
      hostPersonId: null,
      location: null,
    });

    const meeting = await this.prisma.meeting.create({
      data: {
        hauskreisId,
        date,
        endDate,
        type: dto.type,
        startMinutes,
        ...slots,
        locationId: venue.locationId ?? null,
        hostPersonId: venue.hostPersonId ?? null,
        testimonyPersonId: dto.testimonyPersonId ?? null,
        title: dto.title ?? null,
        infoText: dto.infoText ?? null,
      },
      include: meetingInclude,
    });

    // Auch ein von Hand angelegter Abend ist ein Abend: wer grundsätzlich dabei
    // ist, hat auch für ihn zugesagt.
    await this.autoAttendance.apply(hauskreisId);

    // Und wer gleich beim Anlegen eingeteilt wird, ist dabei. Vor dem `findOne`
    // unten, damit die Antwort die frische Zusage und die neue Version schon
    // enthält.
    await this.roleAttendance.confirm(
      meeting.id,
      [meeting.hostPersonId, meeting.testimonyPersonId].filter(
        (personId): personId is string => personId !== null,
      ),
    );

    // Der Dienstagabend steht jede Woche und braucht keine Ankündigung. Ein
    // Geburtstag oder eine Freizeit fallen aus dem Rhythmus — genau die gingen
    // bisher unter, wenn niemand ausdrücklich Bescheid sagte.
    await this.customMeetingNotifications.announceCreation(
      meeting.id,
      viewer.personId,
    );

    return this.findOne(hauskreisId, meeting.id, viewer);
  }

  async update(
    hauskreisId: string,
    id: string,
    dto: UpdateMeetingDto,
    /** Wer gerade einträgt — bekommt keine Nachricht über sich selbst. */
    viewer: Viewer,
    condition?: IfMatchCondition,
  ) {
    const before = await this.findOne(hauskreisId, id, viewer);
    await this.assertReferencesBelongToHauskreis(hauskreisId, dto);

    // Erst die Bausteine, dann alles andere: was ein Termin überhaupt haben
    // darf, entscheidet, ob die übrigen Felder zulässig sind.
    const slots = resolveSlots(before, dto);
    assertSlotsAllow(slots, dto);
    assertSlotsExclusive(slots);
    // Die Anfangszeit **nach** diesem Aufruf: wer Uhrzeit und Baustein zugleich
    // ändert, meint die neue.
    assertNotesSlotNotAhead(before, slots, {
      date: before.date,
      startMinutes: dto.startTime ?? before.startTime,
      zone: await this.clock.zoneOf(hauskreisId),
    });
    const cleared = clearedByTurningOff(before, slots);

    const type = dto.type ?? before.type;
    const endDate =
      dto.endDate === undefined
        ? // Ein Wechsel weg von CUSTOM lässt keinen Zeitraum zurück: nur
          // besondere Termine dauern länger als einen Abend.
          this.resolveEndDate(type, before.date, before.endDate?.toISOString())
        : this.resolveEndDate(type, before.date, dto.endDate);

    if (endDate?.getTime() !== before.endDate?.getTime()) {
      await this.assertNoOverlap(hauskreisId, before.date, endDate, id);
    }

    const venue = await this.resolveVenue(hauskreisId, dto, before);

    // Nur beim echten Wechsel: ein `PATCH` mit dem Info-Text darf nicht daran
    // scheitern, dass der eingetragene Gastgeber inzwischen abgesagt hat.
    if (venue.hostPersonId && venue.hostPersonId !== before.hostPersonId) {
      await this.availability.assertAvailable(hauskreisId, id, [
        venue.hostPersonId,
      ]);
    }

    // Dasselbe fürs **Testimony**, wo es bisher fehlte: Gastgeber, Musik und
    // Thema prüften längst, ob die Person an dem Abend überhaupt da ist, hier
    // kam nur `assertArrived` vorbei. Ausgerechnet dort ist die Frage am
    // eindeutigsten — seine Geschichte erzählt niemand in Abwesenheit. Für
    // einen vergangenen Abend geht die Prüfung von selbst durch, Nachtragen
    // bleibt also möglich.
    if (
      dto.testimonyPersonId &&
      dto.testimonyPersonId !== before.testimonyPersonId
    ) {
      await this.availability.assertAvailable(hauskreisId, id, [
        dto.testimonyPersonId,
      ]);
    }

    const updated = await updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.meeting.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            type: dto.type,
            endDate,
            startMinutes: dto.startTime,
            ...slots,
            // `undefined` leaves a field alone, `null` clears it — that
            // distinction is what lets a host or location be un-assigned.
            locationId: venue.locationId,
            hostPersonId: venue.hostPersonId,
            title: dto.title,
            testimonyPersonId: dto.testimonyPersonId,
            infoText: dto.infoText,
            summaryText: dto.summaryText,
            actionstepText: dto.actionstepText,
            // Zuletzt, damit es gewinnt: ein abgeschalteter Baustein räumt
            // seine Felder weg, auch wenn oben noch alte Werte stünden.
            ...cleared,
            version: { increment: 1 },
          },
        }),
      exists: () =>
        this.prisma.meeting.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findOne(hauskreisId, id, viewer),
      notFoundMessage: `Meeting ${id} not found`,
    });

    // Zweierlei, und mit Absicht ungleich behandelt. Die **Einheit** wird
    // gelöst, nicht geleert: sie trägt die Vorbereitung, und die soll ein
    // versehentlich umgelegter Schalter nicht kosten. Gelöst wird sie
    // **auch an einem vergangenen Abend** — den Baustein wegzunehmen ist die
    // ausdrückliche Aussage „der hatte kein Thema", und sie kommt nur mit
    // Rückfrage; bliebe die Einheit hängen, hätte der Abend danach weder Thema
    // noch Platz für eine Nachbereitung. Die **Zuteilung**
    // dagegen fällt, wie bei der Musik: sie blieb einmal aus Vorsicht stehen,
    // aber an einem Abend ohne Thema ist sie keine geduldige Notiz, sondern eine
    // falsche Aussage. `TopicReminderService` fragt nicht nach `hasTopicSlot`
    // und schrieb „Du bist dran mit dem Thema" für einen Abend, an dem keins
    // ist; auf dem Startbildschirm stand derselbe Rollen-Chip.
    if (before.hasTopicSlot && !slots.hasTopicSlot) {
      await this.topicLinks.detach(id, { evenIfPast: true });

      await this.prisma.$transaction(async (tx) => {
        await tx.meetingTopicResponsible.deleteMany({
          where: { meetingId: id },
        });

        await touchMeeting(tx, id);
      });
    }

    // Lieder hängen nicht am Termin, sondern in zwei eigenen Tabellen — der
    // `data`-Block oben kann sie nicht mitleeren. Nach dem Schreiben, damit ein
    // gescheiterter Versionsvergleich nichts wegräumt.
    if (before.hasSongSlot && !slots.hasSongSlot) {
      await this.prisma.$transaction(async (tx) => {
        await tx.meetingSong.deleteMany({ where: { meetingId: id } });
        await tx.meetingSongLeader.deleteMany({ where: { meetingId: id } });
        await touchMeeting(tx, id);
      });
    }

    // Dasselbe für die Haken unter dem Actionstep: die beiden Texte hat
    // `clearedByTurningOff` schon geleert, die Haken stehen in einer eigenen
    // Tabelle. Stehenzulassen wäre nicht bloß Unordnung — wer den Baustein
    // später wieder anschaltet und etwas Neues hineinschreibt, fände es
    // rätselhaft schon abgehakt vor.
    if (before.hasNotesSlot && !slots.hasNotesSlot) {
      await this.prisma.$transaction(async (tx) => {
        await tx.meetingActionstepDone.deleteMany({ where: { meetingId: id } });
        await touchMeeting(tx, id);
      });
    }

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
        viewer.personId,
      );
    }

    // Und dasselbe fürs Testimony, wo es fehlte. Der Text dafür stand von
    // Anfang an in `RoleAssignmentNotifier` („Du erzählst dein Testimony"),
    // nur rief ihn niemand auf: Gastgeber, Thema und Musik sagten Bescheid,
    // die vierte Rolle schwieg. Ausgerechnet die, auf die man sich am ehesten
    // vorbereiten muss.
    if (
      updated.testimonyPersonId &&
      updated.testimonyPersonId !== before.testimonyPersonId &&
      updated.status !== MeetingStatus.CANCELLED
    ) {
      await this.roleAssignments.announce(
        id,
        AssignmentRole.TESTIMONY,
        [updated.testimonyPersonId],
        viewer.personId,
      );
    }

    // Eine verschobene Uhrzeit ist die eine Änderung an einem Abend, die man
    // erfahren muss, ohne die App zu öffnen: wer um 18 Uhr vor der Tür steht,
    // während die anderen um 19:30 kommen, hat davon nichts gelesen.
    if (updated.startTime !== before.startTime) {
      await this.meetingNotifications.announceTimeChange(
        id,
        before.startTime,
        viewer.personId,
      );
    }

    // Wer neu eingeteilt ist, ist an dem Abend dabei. Nur beim echten Wechsel,
    // wie bei der Nachricht darüber: ein `PATCH` mit dem Info-Text ist keine
    // Zuteilung und soll niemandes Antwort ändern.
    const zugesagt = await this.roleAttendance.confirm(id, [
      ...(updated.hostPersonId && updated.hostPersonId !== before.hostPersonId
        ? [updated.hostPersonId]
        : []),
      ...(updated.testimonyPersonId &&
      updated.testimonyPersonId !== before.testimonyPersonId
        ? [updated.testimonyPersonId]
        : []),
    ]);

    // Nachladen, wenn dabei etwas geschrieben wurde: `updated` entstand davor
    // und trüge sonst die alte Version — der Aufrufer bekäme ein ETag, gegen
    // das seine nächste Änderung als Konflikt zurückkäme.
    return zugesagt > 0 ? this.findOne(hauskreisId, id, viewer) : updated;
  }

  /**
   * Wann ein Termin endet — und ob er überhaupt enden darf.
   *
   * Nur `CUSTOM` zieht sich über mehrere Tage. Ein Hauskreis-Abend ist ein
   * Abend; ein Enddatum daran wäre keine Freizeit, sondern ein Tippfehler mit
   * Folgen, denn der Zeitraum sperrt die Tage dazwischen für den Generator.
   *
   * Ein Enddatum gleich dem Startdatum wird zu `null`. Das ist derselbe
   * Sachverhalt in zwei Schreibweisen, und zwei Darstellungen für einen Zustand
   * sind die Sorte Unterschied, an der später Vergleiche scheitern.
   */
  private resolveEndDate(
    type: MeetingType,
    date: Date,
    raw: string | Date | null | undefined,
  ): Date | null {
    if (raw === null || raw === undefined) return null;

    const endDate = new Date(raw);

    if (type !== MeetingType.CUSTOM) {
      throw new BadRequestException(
        'Nur ein besonderer Termin kann über mehrere Tage gehen',
      );
    }

    if (endDate.getTime() === date.getTime()) return null;

    if (endDate < date) {
      throw new BadRequestException(
        'Das Ende liegt vor dem Anfang — dreh die beiden Daten um',
      );
    }

    return endDate;
  }

  /**
   * Kein zweiter Termin mitten in einem mehrtägigen.
   *
   * Die Datenbank prüft nur `@@unique([hauskreisId, date])` und damit allein
   * das Startdatum — ein Ausschluss über Bereiche bräuchte eine Exclusion
   * Constraint, die Prisma nicht ausdrücken kann. Die Regel steht deshalb hier,
   * und zwar in beide Richtungen: der neue Termin darf keinen bestehenden
   * überdecken, und er darf auch nicht in einen bestehenden hineinfallen.
   */
  private async assertNoOverlap(
    hauskreisId: string,
    date: Date,
    endDate: Date | null,
    excludeId?: string,
  ): Promise<void> {
    const clash = await this.prisma.meeting.findFirst({
      where: {
        hauskreisId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        ...overlapping(date, endDate ?? date),
      },
      select: { date: true, title: true },
    });

    if (clash) {
      throw new BadRequestException(
        `Am ${clash.date.toISOString().slice(0, 10)} steht schon ein Termin. Bearbeite den statt einen zweiten anzulegen.`,
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
    viewer: Viewer,
    condition?: IfMatchCondition,
  ) {
    const before = await this.findOne(hauskreisId, id, viewer);

    const cancelled = await updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.meeting.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            status: MeetingStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledByPersonId: viewer.personId,
            cancelSource: MeetingCancelSource.MANUAL,
            cancelReason: dto.reason ?? null,
            version: { increment: 1 },
          },
        }),
      exists: () =>
        this.prisma.meeting.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findOne(hauskreisId, id, viewer),
      notFoundMessage: `Meeting ${id} not found`,
    });

    // Cancelling an already-cancelled meeting stays silent. Und ein vergangener
    // Abend auch: dort heißt Absagen „es hat nicht stattgefunden", ein
    // Nachtrag fürs Archiv. Eine Benachrichtigung darüber wäre eine Warnung
    // vor etwas, das längst vorbei ist.
    if (
      before.status !== MeetingStatus.CANCELLED &&
      !(await this.clock.isPast(hauskreisId, before.date))
    ) {
      await this.meetingNotifications.announceCancellation(id);
    }

    return cancelled;
  }

  /**
   * Nimmt eine Absage zurück — auch eine automatische, falls jemand den Abend
   * trotz lauter Absagen stattfinden lassen will.
   *
   * Bei einer automatischen zieht das die eigenen Absagen mit. Sonst stünde der
   * Abend als „findet statt" da, während alle neun auf „nicht dabei" stehen —
   * ein Zustand, den der nächste `reconcile` (ein Austritt, der nächtliche
   * Abwesenheits-Abgleich) sofort wieder in eine Absage übersetzt. Wer den
   * Abend zurückholt, sagt damit „wir versuchen es nochmal", und darauf gehört
   * eine neue Antwort.
   *
   * Nur die selbst gegebenen Antworten: eine aus einem Abwesenheitszeitraum
   * abgeleitete Absage ist keine Meinung über diesen Abend, sondern die
   * Tatsache, dass jemand verreist ist — die zurückzusetzen hieße, sie beim
   * nächsten Lauf erneut herzuleiten.
   */
  async uncancel(
    hauskreisId: string,
    id: string,
    viewer: Viewer,
    condition?: IfMatchCondition,
  ) {
    const before = await this.findOne(hauskreisId, id, viewer);

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
      reload: () => this.findOne(hauskreisId, id, viewer),
      notFoundMessage: `Meeting ${id} not found`,
    });

    if (
      before.status === MeetingStatus.CANCELLED &&
      !(await this.clock.isPast(hauskreisId, before.date))
    ) {
      await this.meetingNotifications.announceRevival(id);
    }

    if (before.cancelSource !== MeetingCancelSource.ALL_DECLINED) {
      return revived;
    }

    const reset = await this.prisma.meetingAttendance.updateMany({
      where: {
        meetingId: id,
        status: AttendanceStatus.ABSENT,
        source: AttendanceSource.SELF,
      },
      data: { status: AttendanceStatus.UNKNOWN },
    });

    // Die Antworten stehen in derselben Antwort wie der Termin; ohne das
    // Nachladen bekäme der Aufrufer einen wiederbelebten Abend mit den alten
    // Absagen darin. Eine zweite Versionserhöhung braucht es nicht — die des
    // Zurücknehmens deckt beides ab, es ist ein Schreibvorgang.
    return reset.count > 0 ? this.findOne(hauskreisId, id, viewer) : revived;
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
   * Das an diesem Abend schon gewählte Thema bleibt aus der Historie heraus,
   * damit ein zweites Öffnen der Auswahl seine eigenen Leute nicht nach unten
   * schiebt.
   */
  async suggestTopicResponsibles(hauskreisId: string, id: string) {
    const meeting = await this.loadForSuggestions(hauskreisId, id);

    return this.roleSuggestions.suggestTopicResponsibles(
      hauskreisId,
      meeting.date,
      {
        excludeTopicId: meeting.topicSession?.topicId ?? undefined,
        // Nicht zum Ausschließen aus der Historie, sondern um zu wissen, wer
        // für genau diesen Abend abgesagt hat.
        meetingId: meeting.id,
      },
    );
  }

  /**
   * Wer als Nächstes sein Testimony erzählen könnte.
   *
   * Ohne den eigenen Abend in der Historie: sonst schöbe die schon eingetragene
   * Person sich selbst nach unten, sobald jemand die Auswahl noch einmal
   * öffnet.
   */
  async suggestTestimony(hauskreisId: string, id: string) {
    const meeting = await this.loadForSuggestions(hauskreisId, id);

    return this.roleSuggestions.suggestTestimony(hauskreisId, meeting.date, {
      excludeMeetingId: meeting.id,
    });
  }

  /**
   * The three fields the suggestion engines actually need.
   *
   * Going through `findOne` would pull the full `meetingInclude` — location,
   * host, die Einheit mit ihrem Thema, every attendance — to read a date. The
   * song variant in `meeting-song.controller.ts` already does it this way.
   */
  /**
   * Der Termin, ohne die Frage „wer fragt".
   *
   * Für die drei Stellen, die nur wissen müssen, *dass* es ihn gibt und welchen
   * Tag er hat. `findOne` bräuchte dafür einen Betrachter, obwohl es hier
   * niemanden gibt, dem etwas zu zeigen wäre.
   */
  private async loadPlain(hauskreisId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, hauskreisId },
      // `startMinutes` ist dabei, weil das Abhaken des Actionsteps an der
      // Treffpunktzeit hängt und nicht am Kalendertag.
      select: {
        id: true,
        date: true,
        startMinutes: true,
        type: true,
        status: true,
      },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${id} not found`);
    }

    return meeting;
  }

  private async loadForSuggestions(hauskreisId: string, id: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, hauskreisId },
      select: {
        id: true,
        date: true,
        topicSession: { select: { topicId: true } },
      },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${id} not found`);
    }

    return meeting;
  }

  /**
   * Löscht einen Termin vollständig — nur einen besonderen.
   *
   * Ein Hauskreis-Abend fällt aus, er verschwindet nicht: dass am Dienstag
   * nichts war, gehört in die Geschichte der Gruppe und in die
   * Vorschlagslogik. Dafür gibt es `POST …/cancel`. Ihn zu löschen brächte
   * außerdem nichts, weil der Generator ihn beim nächsten Lauf wieder anlegt.
   *
   * Ein Geburtstag, den jemand versehentlich angelegt hat, ist der andere
   * Fall: da war nie etwas, das man absagen könnte. Deshalb geht auch keine
   * Nachricht raus — eine Absage für einen Termin, den es nie gab, wäre die
   * erste Nachricht, die viele davon überhaupt sehen.
   */
  async remove(hauskreisId: string, id: string) {
    const meeting = await this.loadPlain(hauskreisId, id);

    if (meeting.type !== MeetingType.CUSTOM) {
      throw new BadRequestException(
        'Einen Hauskreis-Abend sagt man ab, statt ihn zu löschen — sonst legt der Terminplaner ihn gleich wieder an',
      );
    }

    await this.prisma.meeting.delete({ where: { id } });
  }

  async setAttendance(hauskreisId: string, id: string, dto: SetAttendanceDto) {
    await this.loadPlain(hauskreisId, id);
    await this.assertPersonBelongsToHauskreis(hauskreisId, dto.personId);

    const previous = await this.prisma.meetingAttendance.findUnique({
      where: { meetingId_personId: { meetingId: id, personId: dto.personId } },
      select: { status: true },
    });

    const attendance = await this.prisma.$transaction(async (tx) => {
      const row = await tx.meetingAttendance.upsert({
        where: {
          meetingId_personId: { meetingId: id, personId: dto.personId },
        },
        // Answering by hand claims the row, even when an absence period wrote
        // it. Without this a "doch, ich komme" would keep the ABSENCE marker and
        // the next sync would feel free to delete it again.
        update: { status: dto.status, source: AttendanceSource.SELF },
        create: {
          meetingId: id,
          personId: dto.personId,
          status: dto.status,
          source: AttendanceSource.SELF,
        },
      });

      // Die Anwesenheit steht mit in der Antwort des Termins — ohne diesen
      // Griff bliebe sein ETag stehen und die Anzeige mit ihm.
      await touchMeeting(tx, id);

      return row;
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
   *
   * **Erst ab Abendbeginn.** Die Grenze war einmal der Kalendertag, und damit
   * ließ sich der Vorsatz für die kommende Woche am Termintag um acht Uhr
   * morgens abhaken — zehn Stunden bevor die Gruppe ihn überhaupt ausgesprochen
   * hatte. Maßgeblich ist deshalb die Treffpunktzeit dieses Abends, geprüft mit
   * demselben `eveningReached`, das auch entscheidet, wann der Inhalt einer
   * Einheit allen gehört. Zwei Rechnungen für „hat der Abend angefangen" wären
   * eine zu viel.
   */
  async setActionstepDone(
    hauskreisId: string,
    id: string,
    personId: string,
    done: boolean,
  ) {
    const meeting = await this.loadPlain(hauskreisId, id);
    const zone = await this.clock.zoneOf(hauskreisId);

    if (!eveningReached(meeting.date, zone, new Date(), meeting.startMinutes)) {
      throw new BadRequestException(
        'Dieser Abend hat noch nicht angefangen — abhaken lässt sich der Actionstep ab dem Treffen',
      );
    }

    await this.assertPersonBelongsToHauskreis(hauskreisId, personId);

    const key = { meetingId_personId: { meetingId: id, personId } };

    // Die Haken stehen mit in der Antwort des Termins, deshalb hier wie bei der
    // Anwesenheit ein Griff an seine Version.
    if (!done) {
      await this.prisma.$transaction(async (tx) => {
        await tx.meetingActionstepDone.deleteMany({
          where: { meetingId: id, personId },
        });

        await touchMeeting(tx, id);
      });

      return { meetingId: id, personId, done: false, doneAt: null };
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.meetingActionstepDone.upsert({
        where: key,
        // Leer: ein zweites Antippen ist kein neues Abhaken.
        update: {},
        create: { meetingId: id, personId },
      });

      await touchMeeting(tx, id);

      return created;
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
   *
   * Dazu die zweite Frage, die dieselben beiden Felder betrifft: **war die
   * Person überhaupt schon einmal hier?** Der Weg über `assertAvailable` deckt
   * nur den Gastgeber beim *Ändern* ab; beim Anlegen und beim Testimony
   * kommt nichts dort vorbei, und eine offene Einladung als Gastgeber eines
   * neuen Abends wäre ein Termin, der geplant aussieht und keinen hat.
   */
  private async assertReferencesBelongToHauskreis(
    hauskreisId: string,
    dto: {
      locationId?: string | null;
      hostPersonId?: string | null;
      testimonyPersonId?: string | null;
    },
  ): Promise<void> {
    if (dto.hostPersonId) {
      await this.assertPersonBelongsToHauskreis(hauskreisId, dto.hostPersonId);
    }

    if (dto.testimonyPersonId) {
      await this.assertPersonBelongsToHauskreis(
        hauskreisId,
        dto.testimonyPersonId,
      );
    }

    await this.availability.assertArrived(
      hauskreisId,
      [dto.hostPersonId, dto.testimonyPersonId].filter(
        (id): id is string => typeof id === 'string',
      ),
    );

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
 * Der Termin in Antwortform — die einzige Stelle, die einen Abend umformt.
 *
 * Zweierlei passiert hier. Die **Einheit** ist der einzige Teil eines Abends,
 * der davon abhängt, *wer* fragt: bis der Abend beginnt, gehören Titel,
 * Actionstep und Zusammenfassung denen, die sie vorbereiten.
 * `shapeSessionForMeeting` setzt sie für alle anderen auf `null` — hier und
 * nicht im Frontend, sonst gingen sie trotzdem über die Leitung.
 *
 * Und die **Uhrzeit** wird aus Minuten wieder eine Uhrzeit. Gerechnet wird mit
 * `startMinutes`, gelesen wird `"19:30"`; das Antwort-Schema lässt die Zahl
 * dann von selbst weg.
 */
function shapeMeeting<
  T extends {
    startMinutes: number;
    topicSession:
      | (Parameters<typeof shapeSessionForMeeting>[0] & {
          topic: Parameters<typeof shapeSessionForMeeting>[1];
        })
      | null;
  },
>(meeting: T, viewer: Viewer) {
  return {
    ...meeting,
    startTime: meeting.startMinutes,
    topicSession: meeting.topicSession
      ? shapeSessionForMeeting(
          meeting.topicSession,
          meeting.topicSession.topic,
          viewer,
        )
      : null,
  };
}

/**
 * Matches free text against everything an evening was written down as.
 *
 * Über alle Textfelder des Abends **und** die der Einheit, die daran hing: die
 * Archivfrage lautet „wann ging es nochmal um Vergebung", und niemand weiß
 * hinterher, ob das in der Zusammenfassung stand, in der Info-Zeile oder im
 * Titel des Themas.
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
      { infoText: contains },
      // Die Nachbereitung eines Abends ohne Thema. Ohne diese zwei Zeilen fände
      // die Suche gerade die Abende nicht, die der Baustein überhaupt erst mit
      // Text füllt.
      { summaryText: contains },
      { actionstepText: contains },
      {
        topicSession: {
          OR: [
            { title: contains },
            { summaryText: contains },
            { actionstepText: contains },
            { topic: { title: contains } },
            { topic: { summaryText: contains } },
          ],
        },
      },
    ],
  };
}
