/**
 * Der Weg zurück aus einer Absage.
 *
 * Bei einer **automatischen** hängt daran mehr als der Status: alle stehen auf
 * „nicht dabei", das war ja der Grund. Bliebe das so, stünde der Abend als
 * „findet statt" mit null Zusagen da — ein Zustand, den der nächste Abgleich
 * sofort wieder in eine Absage übersetzt.
 */
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
import type { IfMatchCondition } from '../common/http/etag';
import {
  AttendanceSource,
  AttendanceStatus,
  MeetingCancelSource,
  MeetingStatus,
} from '../../generated/prisma/enums';
import { withClock } from './group-clock.testing';

/** Die Zone der Gruppe — in den Tests immer dieselbe. */
const BERLIN = 'Europe/Berlin';

const ADMIN = { personId: 'admin', isAdmin: true, zone: BERLIN };
/** Dieser Endpunkt verlangt eine Vorbedingung; hier interessiert sie nicht. */
const EGAL: IfMatchCondition = { kind: 'any' };
const KOMMENDER_ABEND = new Date('2026-08-11T00:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-08-03T09:00:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

function setup(cancelSource: MeetingCancelSource, resetCount = 3) {
  const state = {
    current: {
      id: 'm1',
      hauskreisId: 'hk1',
      date: KOMMENDER_ABEND,
      status: MeetingStatus.CANCELLED,
      cancelSource,
      startTime: 1080,
    } as Record<string, unknown>,
  };

  const attendanceUpdateMany = jest
    .fn()
    .mockResolvedValue({ count: resetCount });

  const prisma = {
    meeting: {
      findFirst: jest.fn(() => Promise.resolve(state.current)),
      updateMany: jest.fn((args: { data: Record<string, unknown> }) => {
        for (const [key, value] of Object.entries(args.data)) {
          if (value !== undefined && key !== 'version') {
            state.current = { ...state.current, [key]: value };
          }
        }
        return Promise.resolve({ count: 1 });
      }),
    },
    meetingAttendance: { updateMany: attendanceUpdateMany },
  };

  const notifications = { announceRevival: jest.fn() };

  const service = withClock(
    new MeetingService(
      prisma as unknown as PrismaService,
      {} as unknown as RoleSuggestionService,
      notifications as unknown as MeetingNotificationService,
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

  return { service, prisma, attendanceUpdateMany, notifications, state };
}

describe('MeetingService.uncancel', () => {
  it('stellt die selbst gegebenen Absagen auf „weiß noch nicht" zurück', async () => {
    const { service, attendanceUpdateMany } = setup(
      MeetingCancelSource.ALL_DECLINED,
    );

    await service.uncancel('hk1', 'm1', ADMIN, EGAL);

    expect(attendanceUpdateMany).toHaveBeenCalledWith({
      where: {
        meetingId: 'm1',
        status: AttendanceStatus.ABSENT,
        // Nur die selbst gegebenen: eine aus einem Urlaubszeitraum abgeleitete
        // Absage ist keine Meinung über diesen Abend, sondern die Tatsache,
        // dass jemand verreist ist.
        source: AttendanceSource.SELF,
      },
      data: { status: AttendanceStatus.UNKNOWN },
    });
  });

  it('lädt danach nach, damit die Antwort die neuen Zusagen zeigt', async () => {
    const { service, prisma } = setup(MeetingCancelSource.ALL_DECLINED);

    await service.uncancel('hk1', 'm1', ADMIN, EGAL);

    // Einmal für `before`, einmal für den Nachlauf des Versionsvergleichs, und
    // einmal, weil das Zurücksetzen die Antwort verändert hat.
    expect(prisma.meeting.findFirst.mock.calls.length).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('lässt eine Absage von Hand in Ruhe', async () => {
    const { service, attendanceUpdateMany } = setup(MeetingCancelSource.MANUAL);

    await service.uncancel('hk1', 'm1', ADMIN, EGAL);

    // Die Antworten wurden unabhängig von der Absage gegeben — sie
    // wegzuräumen hieße, jemandem eine Zusage zu unterstellen.
    expect(attendanceUpdateMany).not.toHaveBeenCalled();
  });

  it('sagt der Gruppe Bescheid, dass der Abend wieder steht', async () => {
    const { service, notifications } = setup(MeetingCancelSource.ALL_DECLINED);

    await service.uncancel('hk1', 'm1', ADMIN, EGAL);

    expect(notifications.announceRevival).toHaveBeenCalledWith('m1');
  });
});
