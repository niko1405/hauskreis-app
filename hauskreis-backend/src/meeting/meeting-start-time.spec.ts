/**
 * Die Uhrzeit eines Abends.
 *
 * Ein Pflichtfeld ohne Pflicht zur Angabe: wer nichts schickt, bekommt die Zeit
 * der Gruppe. Sie in jeden Aufrufer zu kopieren wäre eine zweite Stelle, an der
 * sie veralten kann.
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
import { MeetingType } from '../../generated/prisma/enums';
import { withClock } from './group-clock.testing';

/** Die Zone der Gruppe — in den Tests immer dieselbe. */
const BERLIN = 'Europe/Berlin';

const EGAL: IfMatchCondition = { kind: 'any' };
const ICH = { personId: 'p-ich', isAdmin: false, zone: BERLIN };
const ABEND = new Date('2026-08-11T00:00:00.000Z');

/** Ein Termin, wie `findFirst` ihn liefert — nur die Felder, um die es geht. */
function meeting(startMinutes = 1080) {
  return {
    id: 'm1',
    hauskreisId: 'hk1',
    date: ABEND,
    endDate: null,
    startMinutes,
    type: MeetingType.STANDARD,
    status: 'PLANNED',
    hasTopicSlot: true,
    hasSongSlot: true,
    hasTestimonySlot: false,
    hostPersonId: null,
    locationId: null,
    location: null,
    topicSession: null,
  };
}

function setup(groupStart = 1080, { anlegen = false } = {}) {
  const state = { current: meeting() as Record<string, unknown> };

  const create = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'm-neu', ...meeting(), ...args.data }),
  );

  // Beim Anlegen trifft der erste Aufruf die Überschneidungsprüfung: dort muss
  // der Tag frei sein. Danach ist es das abschließende `findOne`.
  let erster = anlegen;

  const prisma = {
    meeting: {
      create,
      findFirst: jest.fn(() => {
        if (erster) {
          erster = false;
          return Promise.resolve(null);
        }
        return Promise.resolve(state.current);
      }),
      updateMany: jest.fn((args: { data: Record<string, unknown> }) => {
        for (const [key, value] of Object.entries(args.data)) {
          if (value !== undefined && key !== 'version') {
            state.current = { ...state.current, [key]: value };
          }
        }
        return Promise.resolve({ count: 1 });
      }),
    },
    person: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    location: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    topic: { findFirst: jest.fn() },
  };

  const announceTimeChange = jest.fn().mockResolvedValue(0);
  const getRhythm = jest
    .fn()
    .mockResolvedValue({ weekday: 2, startMinutes: groupStart });

  const service = withClock(
    new MeetingService(
      prisma as unknown as PrismaService,
      {} as unknown as RoleSuggestionService,
      { announceTimeChange } as unknown as MeetingNotificationService,
      {} as unknown as MeetingCancellationService,
      { announce: jest.fn() } as unknown as RoleAssignmentNotifier,
      {
        assertAvailable: jest.fn(),
        assertArrived: jest.fn(),
      } as unknown as AvailabilityService,
      {} as unknown as RoleReleaseService,
      { apply: jest.fn() } as unknown as AutoAttendanceService,
      { confirm: jest.fn() } as unknown as RoleAttendanceService,
      {
        announceCreation: jest.fn(),
      } as unknown as CustomMeetingNotificationService,
      { detach: jest.fn() } as unknown as TopicLinkService,
      { getRhythm } as unknown as MeetingScheduleConfigService,
    ),
  );

  return { service, create, announceTimeChange, state };
}

describe('MeetingService.create', () => {
  it('nimmt die Zeit der Gruppe, wenn keine dabeisteht', async () => {
    const { service, create } = setup(1170, { anlegen: true });

    await service.create(
      'hk1',
      { date: '2026-08-11', type: MeetingType.CUSTOM } as never,
      ICH,
    );

    expect(create.mock.calls[0][0].data.startMinutes).toBe(1170);
  });

  it('nimmt die mitgeschickte Zeit, wenn eine dabeisteht', async () => {
    const { service, create } = setup(1080, { anlegen: true });

    await service.create(
      'hk1',
      {
        date: '2026-08-11',
        type: MeetingType.CUSTOM,
        // Das DTO hat den String längst in Minuten übersetzt.
        startTime: 1200,
      } as never,
      ICH,
    );

    expect(create.mock.calls[0][0].data.startMinutes).toBe(1200);
  });
});

describe('MeetingService.update', () => {
  it('schreibt die neue Zeit und sagt der Gruppe Bescheid', async () => {
    const { service, announceTimeChange, state } = setup();

    await service.update('hk1', 'm1', { startTime: 1170 } as never, ICH, EGAL);

    expect(state.current.startMinutes).toBe(1170);
    // Die alte Zeit wandert mit: „wir fangen jetzt um 19:30 an" allein lässt
    // offen, ob sich überhaupt etwas verschoben hat.
    expect(announceTimeChange).toHaveBeenCalledWith('m1', 1080, 'p-ich');
  });

  it('schweigt, wenn dieselbe Zeit noch einmal geschickt wird', async () => {
    const { service, announceTimeChange } = setup();

    await service.update('hk1', 'm1', { startTime: 1080 } as never, ICH, EGAL);

    expect(announceTimeChange).not.toHaveBeenCalled();
  });

  it('schweigt bei einer Änderung, die die Uhrzeit gar nicht betrifft', async () => {
    const { service, announceTimeChange, state } = setup();

    await service.update(
      'hk1',
      'm1',
      { title: 'Grillabend' } as never,
      ICH,
      EGAL,
    );

    expect(state.current.startMinutes).toBe(1080);
    expect(announceTimeChange).not.toHaveBeenCalled();
  });
});
