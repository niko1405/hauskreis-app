import { MeetingService } from './meeting.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import type { MeetingNotificationService } from './meeting-notification.service';
import type { MeetingCancellationService } from './meeting-cancellation.service';
import {
  AttendanceSource,
  AttendanceStatus,
} from '../../generated/prisma/enums';

/**
 * Guards the boundary between "ich habe geantwortet" and "das kam aus einem
 * Abwesenheitszeitraum".
 *
 * Found the hard way: an answer given by hand kept the ABSENCE marker, so the
 * next sync considered the row its own and would have deleted a deliberate
 * "doch, ich komme" as soon as the holiday was shortened.
 */
function setup() {
  const upsert = jest.fn().mockResolvedValue({});

  const db = {
    meeting: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'm-1', hauskreisId: 'hk-1' }),
      // Die Anwesenheit steht mit in der Antwort des Termins, deshalb springt
      // seine Version mit — sonst bliebe der ETag stehen.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    person: { findFirst: jest.fn().mockResolvedValue({ id: 'niko' }) },
    meetingAttendance: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ status: AttendanceStatus.ABSENT }),
      upsert,
    },
  };

  const prisma = {
    ...db,
    $transaction: (run: (tx: typeof db) => unknown) => run(db),
  } as unknown as PrismaService;

  const reconcile = jest.fn();

  const service = new MeetingService(
    prisma,
    {} as unknown as RoleSuggestionService,
    { handleDecline: jest.fn() } as unknown as MeetingNotificationService,
    { reconcile } as unknown as MeetingCancellationService,
  );

  return { service, upsert, reconcile };
}

describe('MeetingService.setAttendance', () => {
  it('claims the row for the person answering', async () => {
    const { service, upsert } = setup();

    await service.setAttendance('hk-1', 'm-1', {
      personId: 'niko',
      status: AttendanceStatus.ATTENDING,
    });

    // Both branches: the row may already exist because a holiday wrote it.
    expect(upsert.mock.calls[0][0].update).toEqual({
      status: AttendanceStatus.ATTENDING,
      source: AttendanceSource.SELF,
    });
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      source: AttendanceSource.SELF,
    });
  });
});
