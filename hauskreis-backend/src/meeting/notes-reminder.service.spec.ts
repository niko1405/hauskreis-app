import { NotesReminderService } from './notes-reminder.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../generated/prisma/enums';
import { withClock } from './group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Mittwochmorgen, der Tag nach dem Dienstag. */
const MORGEN_DANACH = new Date('2026-08-12T07:00:00.000Z');

function setup(
  options: {
    meeting?: { id: string; attendances: { personId: string }[] } | null;
  } = {},
) {
  const abend =
    options.meeting === undefined
      ? {
          id: 'm-1',
          attendances: [{ personId: 'anna' }, { personId: 'chris' }],
        }
      : options.meeting;

  const findFirst = jest.fn().mockResolvedValue(abend);
  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });

  const service = withClock(
    new NotesReminderService(
      { meeting: { findFirst } } as unknown as PrismaService,
      { notify } as unknown as NotificationService,
      undefined as never,
    ),
  );

  return { service, findFirst, notify };
}

describe('NotesReminderService.sendDueReminders', () => {
  it('fragt die, die da waren', async () => {
    const { service, notify } = setup();

    const result = await service.sendDueReminders('hk-1', {
      now: MORGEN_DANACH,
    });

    expect(notify.mock.calls.map((call) => call[0].personId)).toEqual([
      'anna',
      'chris',
    ]);
    expect(notify.mock.calls[0][0]).toMatchObject({
      type: NotificationType.NOTES_REMINDER,
      relatedMeetingId: 'm-1',
    });
    expect(result.notified).toBe(2);
  });

  /**
   * Vier Bedingungen in einer Abfrage, und jede einzelne ist eine Entscheidung:
   * vorbei, ohne Thema, ohne Inhalt, nicht zu lange her.
   */
  it('sucht nur, wo die Nachfrage überhaupt stimmt', async () => {
    const { service, findFirst } = setup();

    await service.sendDueReminders('hk-1', { now: MORGEN_DANACH });

    const where = findFirst.mock.calls[0][0].where;
    // Vorbei — und zwar ganz.
    expect(where.OR).toEqual([
      { endDate: null, date: { lt: utc('2026-08-12') } },
      { endDate: { lt: utc('2026-08-12') } },
    ]);
    // Höchstens drei Tage her: Die Nachfrage nach einem Actionstep, an den sich
    // niemand mehr erinnert, ist keine Erinnerung mehr.
    expect(where.date).toEqual({ gte: utc('2026-08-09') });
    // Ohne Thema: Dort gehören die beiden Texte der Einheit, und schreiben darf
    // sie nur deren Crew.
    expect(where.hasTopicSlot).toBe(false);
    // Und nur, solange nichts dasteht.
    expect(where.summaryText).toBeNull();
    expect(where.actionstepText).toBeNull();
    // Nur wer zugesagt hatte — wer nicht da war, kann nicht zusammenfassen.
    expect(findFirst.mock.calls[0][0].select.attendances.where).toEqual({
      status: 'ATTENDING',
    });
  });

  it('schweigt, wenn niemand zugesagt hatte', async () => {
    const { service, notify } = setup({
      meeting: { id: 'm-1', attendances: [] },
    });

    const result = await service.sendDueReminders('hk-1', {
      now: MORGEN_DANACH,
    });

    expect(notify).not.toHaveBeenCalled();
    expect(result).toEqual({ notified: 0, skipped: 0 });
  });

  it('schweigt, wenn es nichts nachzutragen gibt', async () => {
    const { service, notify } = setup({ meeting: null });

    await service.sendDueReminders('hk-1', { now: MORGEN_DANACH });

    expect(notify).not.toHaveBeenCalled();
  });
});
