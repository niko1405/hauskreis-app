/**
 * „Für den 4. August ist noch etwas frei."
 *
 * Jeden Morgen der Stand des nächsten Abends — an die, die dabei oder
 * unentschieden sind, an ihren gewählten Wochentagen.
 */
import { RoleOpenReminderService } from './role-open-reminder.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import type { NotificationPreferenceService } from '../notification/notification-preference.service';
import { NotificationType } from '../../generated/prisma/enums';
import { withClock } from './group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Samstagmorgen, Berliner Zeit. */
const SATURDAY = new Date('2026-08-01T07:00:00.000Z');
const TUESDAY = utc('2026-08-04');

function setup(
  options: {
    date?: Date;
    songLeaders?: number;
    snackSlot?: boolean;
    weekdaysByPerson?: Record<string, number[]>;
    next?: string | null;
  } = {},
) {
  const meeting = {
    id: 'm1',
    date: options.date ?? TUESDAY,
    startMinutes: 1080,
    hostPersonId: 'host',
    location: { requiresHost: true },
    hasTopicSlot: true,
    hasSongSlot: true,
    hasTestimonySlot: false,
    hasSnackSlot: options.snackSlot ?? false,
    testimonyPersonId: null,
    topicResponsibles: [{ personId: 'antonia' }],
    songLeaders: Array.from({ length: options.songLeaders ?? 0 }, (_, i) => ({
      personId: `leader-${i}`,
    })),
    snackResponsibles: [],
  };

  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });

  const people = ['anna', 'chris'];
  const resolveMany = jest
    .fn()
    .mockResolvedValue(
      new Map(
        people.map((id) => [
          id,
          { enabled: true, weekdays: options.weekdaysByPerson?.[id] ?? [6, 1] },
        ]),
      ),
    );

  const service = withClock(
    new RoleOpenReminderService(
      {
        meeting: {
          findFirst: jest
            .fn()
            .mockResolvedValue(
              options.next === null ? null : { id: options.next ?? 'm1' },
            ),
          findUnique: jest.fn().mockResolvedValue(meeting),
        },
        person: {
          findMany: jest.fn().mockResolvedValue(people.map((id) => ({ id }))),
        },
      } as unknown as PrismaService,
      { notify } as unknown as NotificationService,
      { resolveMany } as unknown as NotificationPreferenceService,
      undefined as never,
    ),
  );

  return { service, notify };
}

describe('RoleOpenReminderService', () => {
  it('nennt, was am nächsten Abend noch frei ist', async () => {
    const { service, notify } = setup({ snackSlot: true });

    const result = await service.sendDueReminders('hk-1', { now: SATURDAY });

    expect(result).toEqual({ notified: 2, skipped: 0, meetingId: 'm1' });
    expect(notify.mock.calls[0][0]).toMatchObject({
      type: NotificationType.ROLE_OPEN_REMINDER,
      relatedMeetingId: 'm1',
      // Der Tag gehört zum Schlüssel: Samstag und Montag sind zwei
      // Erinnerungen, keine doppelte.
      relatedKey: '2026-08-01',
      payload: {
        title: 'Für den 4. August ist noch etwas frei',
        body: 'Musik und Snacks sind noch frei. Magst du etwas übernehmen?',
      },
    });
  });

  it('schweigt, wenn alles besetzt ist', async () => {
    const { service, notify } = setup({ songLeaders: 1 });

    await service.sendDueReminders('hk-1', { now: SATURDAY });

    expect(notify).not.toHaveBeenCalled();
  });

  it('lässt aus, wer einen anderen Tag gewählt hat', async () => {
    const { service, notify } = setup({ weekdaysByPerson: { chris: [1] } });

    await service.sendDueReminders('hk-1', { now: SATURDAY });

    expect(notify.mock.calls.map((call) => call[0].personId)).toEqual(['anna']);
  });

  it('schweigt für einen Abend, der mehr als eine Woche entfernt ist', async () => {
    const { service, notify } = setup({ date: utc('2026-08-11') });

    await service.sendDueReminders('hk-1', { now: SATURDAY });

    expect(notify).not.toHaveBeenCalled();
  });

  it('schweigt, wenn der Abend schon angefangen hat', async () => {
    const { service, notify } = setup({ date: utc('2026-08-01') });

    await service.sendDueReminders('hk-1', {
      // Samstag, 19 Uhr in Berlin.
      now: new Date('2026-08-01T17:00:00.000Z'),
    });

    expect(notify).not.toHaveBeenCalled();
  });

  it('schweigt ohne kommenden Abend', async () => {
    const { service, notify } = setup({ next: null });

    await expect(
      service.sendDueReminders('hk-1', { now: SATURDAY }),
    ).resolves.toEqual({ notified: 0, skipped: 0, meetingId: null });
    expect(notify).not.toHaveBeenCalled();
  });
});
