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
import { withClock } from './group-clock.testing';

/**
 * Guards the boundary between "ich habe geantwortet" and "das kam aus einem
 * Abwesenheitszeitraum".
 *
 * Found the hard way: an answer given by hand kept the ABSENCE marker, so the
 * next sync considered the row its own and would have deleted a deliberate
 * "doch, ich komme" as soon as the holiday was shortened.
 */
function setup(previousStatus: AttendanceStatus = AttendanceStatus.ABSENT) {
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
      findUnique: jest.fn().mockResolvedValue({ status: previousStatus }),
      upsert,
    },
  };

  const prisma = {
    ...db,
    $transaction: (run: (tx: typeof db) => unknown) => run(db),
  } as unknown as PrismaService;

  const reconcile = jest.fn();

  const service = withClock(
    new MeetingService(
      prisma,
      {} as unknown as RoleSuggestionService,
      { handleDecline: jest.fn() } as unknown as MeetingNotificationService,
      { reconcile } as unknown as MeetingCancellationService,
      // Position 5 und 6 (Zuteilungs-Benachrichtigung, Verfügbarkeit) spielen
      // beim Antworten keine Rolle. Die Freigabe dahinter schon: Sie läuft
      // beim Wechsel in eine Absage, und genau der ist der interessante Fall
      // für die Notiz.
      undefined as never,
      undefined as never,
      { releaseFor: jest.fn().mockResolvedValue([]) } as never,
    ),
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
    expect(upsert.mock.calls[0][0].update).toMatchObject({
      status: AttendanceStatus.ATTENDING,
      source: AttendanceSource.SELF,
    });
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      source: AttendanceSource.SELF,
    });
  });

  /**
   * Die Notiz gehört zu **dieser** Antwort.
   *
   * Der dritte Fall ist der, um den es eigentlich geht: Die kompakten
   * Umschalter auf Startbildschirm, Terminkarte und Kalender schicken nur
   * `status`. Ohne die Regel bliebe „komme 20 Min später" auf einer Absage
   * stehen — und in der Teilnehmerliste stünde es auch noch da.
   */
  it('writes the note that came with the answer', async () => {
    const { service, upsert } = setup(AttendanceStatus.UNKNOWN);

    await service.setAttendance('hk-1', 'm-1', {
      personId: 'niko',
      status: AttendanceStatus.ATTENDING,
      note: 'Komme 20 Min später',
    });

    expect(upsert.mock.calls[0][0].update.note).toBe('Komme 20 Min später');
    expect(upsert.mock.calls[0][0].create.note).toBe('Komme 20 Min später');
  });

  it('keeps the note when only the note itself is missing', async () => {
    const { service, upsert } = setup(AttendanceStatus.ATTENDING);

    await service.setAttendance('hk-1', 'm-1', {
      personId: 'niko',
      status: AttendanceStatus.ATTENDING,
    });

    // `undefined` heißt bei Prisma „nicht anfassen".
    expect(upsert.mock.calls[0][0].update.note).toBeUndefined();
  });

  it('drops the note when the status changes without a new one', async () => {
    const { service, upsert } = setup(AttendanceStatus.ATTENDING);

    await service.setAttendance('hk-1', 'm-1', {
      personId: 'niko',
      status: AttendanceStatus.ABSENT,
    });

    expect(upsert.mock.calls[0][0].update.note).toBeNull();
  });
});
