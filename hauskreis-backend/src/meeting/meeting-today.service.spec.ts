import { MeetingTodayService } from './meeting-today.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import {
  AttendanceStatus,
  NotificationType,
} from '../../generated/prisma/enums';
import { withClock } from './group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Dienstagvormittag — der Lauf feuert um neun. */
const HEUTE = new Date('2026-08-11T07:00:00.000Z');

function setup(
  options: {
    meeting?: {
      id: string;
      startMinutes: number;
      location: { name: string } | null;
      attendances: { personId: string; status: AttendanceStatus }[];
    } | null;
    people?: string[];
  } = {},
) {
  const abend =
    options.meeting === undefined
      ? {
          id: 'm-1',
          startMinutes: 1080,
          location: { name: 'Chris' },
          attendances: [
            { personId: 'anna', status: AttendanceStatus.ATTENDING },
            { personId: 'chris', status: AttendanceStatus.ABSENT },
          ],
        }
      : options.meeting;

  const findFirst = jest.fn().mockResolvedValue(abend);
  const findManyPeople = jest
    .fn()
    .mockResolvedValue(
      (options.people ?? ['anna', 'chris', 'lena']).map((id) => ({ id })),
    );

  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });

  const service = withClock(
    new MeetingTodayService(
      {
        meeting: { findFirst },
        person: { findMany: findManyPeople },
      } as unknown as PrismaService,
      { notify } as unknown as NotificationService,
      undefined as never,
    ),
  );

  return { service, findFirst, notify };
}

describe('MeetingTodayService.sendDueReminders', () => {
  it('fragt jede Person passend zu ihrer eigenen Antwort', async () => {
    const { service, notify } = setup();

    const result = await service.sendDueReminders('hk-1', { now: HEUTE });

    const texte = new Map(
      notify.mock.calls.map((call) => [call[0].personId, call[0].payload.body]),
    );

    expect(texte.get('anna')).toBe('Heute um 18:00 bei Chris. Bis später!');
    // Der eigentliche Punkt: Wer abgesagt hat, wird noch einmal gefragt — am
    // Termintag ändern sich die Zusagen, und genau dort entstand bisher das
    // Hin und Her im Gruppenchat.
    expect(texte.get('chris')).toBe(
      'Heute um 18:00 bei Chris. Du hast abgesagt — stimmt das noch?',
    );
    // Keine Zeile heißt „weiß noch nicht", nicht „nicht gemeint".
    expect(texte.get('lena')).toBe('Heute um 18:00 bei Chris. Bist du dabei?');
    expect(result.notified).toBe(3);
  });

  it('nennt statt eines Ortes, dass er offen ist', async () => {
    const { service, notify } = setup({
      meeting: {
        id: 'm-1',
        startMinutes: 1140,
        location: null,
        attendances: [],
      },
      people: ['anna'],
    });

    await service.sendDueReminders('hk-1', { now: HEUTE });

    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Heute um 19:00 ist Hauskreis — der Ort ist noch offen. Bist du dabei?',
    );
  });

  it('sucht nur den heutigen Abend', async () => {
    const { service, findFirst } = setup();

    await service.sendDueReminders('hk-1', { now: HEUTE });

    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      hauskreisId: 'hk-1',
      date: utc('2026-08-11'),
      status: 'PLANNED',
    });
  });

  it('schweigt an einem Tag ohne Termin', async () => {
    const { service, notify } = setup({ meeting: null });

    const result = await service.sendDueReminders('hk-1', { now: HEUTE });

    expect(notify).not.toHaveBeenCalled();
    expect(result).toEqual({ notified: 0, skipped: 0 });
  });

  /**
   * Der Merkposten hängt am Termin, nicht am Tag: Ein mehrtägiger Termin meldet
   * sich einmal, nicht an jedem Morgen.
   */
  it('hängt die Entdopplung an den Termin', async () => {
    const { service, notify } = setup();

    await service.sendDueReminders('hk-1', { now: HEUTE });

    expect(notify.mock.calls[0][0]).toMatchObject({
      type: NotificationType.MEETING_TODAY,
      relatedMeetingId: 'm-1',
    });
  });
});
