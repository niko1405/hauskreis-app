/**
 * Ab wann sich der Actionstep eines Abends abhaken lässt.
 *
 * Die Grenze war einmal der Kalendertag, und damit ließ sich der Vorsatz für die
 * kommende Woche am Termintag um acht Uhr morgens abhaken — zehn Stunden bevor
 * die Gruppe ihn ausgesprochen hatte. Jetzt zählt die Treffpunktzeit dieses
 * Abends, und eine Gruppe, die sich um 20 Uhr trifft, gibt zwei Stunden später
 * frei als eine, die um 18 Uhr anfängt.
 */
import { BadRequestException } from '@nestjs/common';
import { MeetingService } from './meeting.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import type { MeetingNotificationService } from './meeting-notification.service';
import type { MeetingCancellationService } from './meeting-cancellation.service';
import type { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import type { AvailabilityService } from '../role-suggestion/availability.service';
import type { RoleReleaseService } from './role-release.service';
import type { AutoAttendanceService } from '../attendance/auto-attendance.service';
import type { RoleAttendanceService } from '../attendance/role-attendance.service';
import type { CustomMeetingNotificationService } from './custom-meeting-notification.service';
import type { TopicLinkService } from '../topic/topic-link.service';
import type { MeetingScheduleConfigService } from './meeting-schedule-config.service';
import { MeetingType } from '../../generated/prisma/enums';
import { withClock } from './group-clock.testing';

/** Der Termin selbst: Dienstag, der 11. August 2026. */
const ABEND = new Date('2026-08-11T00:00:00.000Z');

/** Ortszeit im August ist UTC+2 — 18:00 in Berlin sind 16:00 UTC. */
const MORGENS = new Date('2026-08-11T06:00:00.000Z');
const KURZ_VOR_SECHS = new Date('2026-08-11T15:59:00.000Z');
const PUNKT_SECHS = new Date('2026-08-11T16:00:00.000Z');
const HALB_ACHT = new Date('2026-08-11T17:30:00.000Z');
const TAG_DANACH = new Date('2026-08-12T09:00:00.000Z');

function setup(startMinutes = 1080) {
  const prisma = {
    meeting: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'm1',
        date: ABEND,
        startMinutes,
        type: MeetingType.STANDARD,
        status: 'PLANNED',
      }),
      // `touchMeeting` greift nach dem Schreiben an die Version des Termins —
      // die Haken stehen mit in seiner Antwort.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    person: {
      findFirst: jest.fn().mockResolvedValue({ id: 'p1' }),
    },
    meetingActionstepDone: {
      upsert: jest.fn().mockResolvedValue({ doneAt: new Date() }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma)),
  };

  const service = withClock(
    new MeetingService(
      prisma as unknown as PrismaService,
      {} as unknown as RoleSuggestionService,
      {} as unknown as MeetingNotificationService,
      {} as unknown as MeetingCancellationService,
      {} as unknown as RoleAssignmentNotifier,
      {} as unknown as AvailabilityService,
      {} as unknown as RoleReleaseService,
      {} as unknown as AutoAttendanceService,
      { confirm: jest.fn() } as unknown as RoleAttendanceService,
      {} as unknown as CustomMeetingNotificationService,
      {} as unknown as TopicLinkService,
      {} as unknown as MeetingScheduleConfigService,
    ),
  );

  return { service, prisma };
}

afterEach(() => {
  jest.useRealTimers();
});

function jetzt(instant: Date) {
  jest.useFakeTimers().setSystemTime(instant);
}

describe('MeetingService.setActionstepDone', () => {
  it('weist am Termintag vor dem Treffen ab', async () => {
    jetzt(MORGENS);
    const { service } = setup();

    await expect(
      service.setActionstepDone('hk1', 'm1', 'p1', true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /** Eine Minute vorher ist noch vorher — die Grenze ist scharf. */
  it('weist eine Minute vor dem Treffen noch ab', async () => {
    jetzt(KURZ_VOR_SECHS);
    const { service } = setup();

    await expect(
      service.setActionstepDone('hk1', 'm1', 'p1', true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lässt ab der Treffpunktzeit abhaken', async () => {
    jetzt(PUNKT_SECHS);
    const { service } = setup();

    await expect(
      service.setActionstepDone('hk1', 'm1', 'p1', true),
    ).resolves.toMatchObject({ done: true });
  });

  it('lässt am Tag danach abhaken', async () => {
    jetzt(TAG_DANACH);
    const { service } = setup();

    await expect(
      service.setActionstepDone('hk1', 'm1', 'p1', true),
    ).resolves.toMatchObject({ done: true });
  });

  /**
   * Der Kern: die Grenze kommt vom Termin und nicht aus einer Konstante. Halb
   * acht liegt bei einer 18-Uhr-Gruppe hinter dem Anfang und bei einer
   * 20-Uhr-Gruppe davor.
   */
  it('verschiebt sich mit der Anfangszeit der Gruppe', async () => {
    jetzt(HALB_ACHT);

    await expect(
      setup(1080).service.setActionstepDone('hk1', 'm1', 'p1', true),
    ).resolves.toMatchObject({ done: true });

    await expect(
      setup(1200).service.setActionstepDone('hk1', 'm1', 'p1', true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /** Auch das Zurücknehmen: vorher gibt es nichts, was man zurücknehmen könnte. */
  it('gilt auch fürs Wegnehmen des Hakens', async () => {
    jetzt(MORGENS);
    const { service } = setup();

    await expect(
      service.setActionstepDone('hk1', 'm1', 'p1', false),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
