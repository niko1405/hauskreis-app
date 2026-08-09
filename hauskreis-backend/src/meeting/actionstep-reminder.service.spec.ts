import { ActionstepReminderService } from './actionstep-reminder.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import type { NotificationPreferenceService } from '../notification/notification-preference.service';
import { NotificationType } from '../../generated/prisma/enums';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function setup(
  options: {
    meeting?: { id: string; actionstepText: string | null } | null;
    /* Der Actionstep steht an der Einheit, die an dem Abend hing. */
    people?: string[];
    weekdaysByPerson?: Record<string, number[]>;
    /** Wer den Actionstep schon abgehakt hat. */
    done?: string[];
  } = {},
) {
  const abend =
    options.meeting === undefined
      ? { id: 'meeting-1', actionstepText: 'Jeden Tag 10 Minuten lesen' }
      : options.meeting;

  const findFirst = jest.fn().mockResolvedValue(
    abend && {
      id: abend.id,
      topicSession: { actionstepText: abend.actionstepText },
    },
  );

  const people = options.people ?? ['anna', 'chris'];
  const findManyPeople = jest
    .fn()
    .mockResolvedValue(people.map((id) => ({ id })));

  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });

  const resolveMany = jest.fn((personIds: string[]) =>
    Promise.resolve(
      new Map(
        personIds.map((personId) => [
          personId,
          // Friday by default, matching the catalog.
          { weekdays: options.weekdaysByPerson?.[personId] ?? [5] },
        ]),
      ),
    ),
  );

  const findManyDone = jest
    .fn()
    .mockResolvedValue((options.done ?? []).map((personId) => ({ personId })));

  const service = new ActionstepReminderService(
    {
      meeting: { findFirst },
      person: { findMany: findManyPeople },
      meetingActionstepDone: { findMany: findManyDone },
    } as unknown as PrismaService,
    { notify } as unknown as NotificationService,
    { resolveMany } as unknown as NotificationPreferenceService,
  );

  return { service, findFirst, notify };
}

// 2026-07-31 is a Friday, 2026-07-30 a Thursday.
const friday = utc('2026-07-31');
const thursday = utc('2026-07-30');

describe('ActionstepReminderService.sendDueReminders', () => {
  it('nudges everyone whose day is today', async () => {
    const { service, notify } = setup();

    const result = await service.sendDueReminders('hk-1', { now: friday });

    expect(result).toEqual({
      notified: 2,
      skipped: 0,
      meetingId: 'meeting-1',
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'anna',
        type: NotificationType.ACTIONSTEP_REMINDER,
        relatedMeetingId: 'meeting-1',
      }),
    );
  });

  it('leaves out whoever picked another day', async () => {
    // The job runs daily for everyone; the setting decides whose day it is.
    // That is what gives personal rhythms without a cron per person.
    const { service, notify } = setup({ weekdaysByPerson: { chris: [1] } });

    await service.sendDueReminders('hk-1', { now: friday });

    expect(notify.mock.calls.map((call) => call[0].personId)).toEqual(['anna']);
  });

  it('erinnert an jedem gewählten Tag, nicht nur am ersten', async () => {
    // Der Sinn der Liste: einmal zur Wochenmitte nachfragen und einmal kurz
    // vor dem nächsten Abend sind zwei Erinnerungen, keine doppelte.
    const { service, notify } = setup({
      weekdaysByPerson: { anna: [2, 5], chris: [2] },
    });

    await service.sendDueReminders('hk-1', { now: friday });

    expect(notify.mock.calls.map((call) => call[0].personId)).toEqual(['anna']);
  });

  it('stays silent on a day nobody chose', async () => {
    const { service, notify } = setup();

    const result = await service.sendDueReminders('hk-1', { now: thursday });

    expect(result.notified).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('says nothing when the last meetings had no actionstep', async () => {
    const { service, notify } = setup({ meeting: null });

    const result = await service.sendDueReminders('hk-1', { now: friday });

    expect(result).toEqual({ notified: 0, skipped: 0, meetingId: null });
    expect(notify).not.toHaveBeenCalled();
  });

  it('treats a blank actionstep as none at all', async () => {
    const { service, notify } = setup({
      meeting: { id: 'meeting-1', actionstepText: '   ' },
    });

    await service.sendDueReminders('hk-1', { now: friday });

    expect(notify).not.toHaveBeenCalled();
  });

  it('looks only at meetings that already happened', async () => {
    const { service, findFirst } = setup();

    await service.sendDueReminders('hk-1', { now: friday });

    const where = findFirst.mock.calls[0][0].where;
    expect(where.date).toEqual({ lt: friday });
    // Newest first: an older actionstep must not overtake last week's.
    expect(findFirst.mock.calls[0][0].orderBy).toEqual({ date: 'desc' });
  });

  it('leaves out whoever already ticked it off', async () => {
    const { service, notify } = setup({ done: ['chris'] });

    const result = await service.sendDueReminders('hk-1', { now: friday });

    // Genau dafür ist der Haken da: sonst wäre er nur Statistik und man würde
    // weiter gefragt, wie es mit etwas läuft, das man erledigt hat.
    expect(notify.mock.calls.map((call) => call[0].personId)).toEqual(['anna']);
    expect(result.notified).toBe(1);
  });

  it('quotes the actionstep so the nudge is self-contained', async () => {
    const { service, notify } = setup();

    await service.sendDueReminders('hk-1', { now: friday });

    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Wie läuft es damit? "Jeden Tag 10 Minuten lesen"',
    );
  });
});
