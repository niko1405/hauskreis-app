/**
 * Die zwei Nachrichten für besondere Termine.
 *
 * Der wichtigste Test ist der langweiligste: dass der Dienstagabend **keine**
 * davon auslöst. Sieben generierte Termine pro Nacht, jeder mit einer
 * Ankündigung an alle neun — das wäre die schnellste Art, Benachrichtigungen
 * abzuschalten.
 */
import { CustomMeetingNotificationService } from './custom-meeting-notification.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import type { MeetingReminderService } from '../notification/meeting-reminder.service';
import { MeetingType } from '../../generated/prisma/enums';

const FREIZEIT = {
  id: 'm-1',
  hauskreisId: 'hk-1',
  date: new Date('2027-05-14'),
  endDate: new Date('2027-05-16'),
  type: MeetingType.CUSTOM,
  title: 'Hauskreis-Freizeit',
};

/**
 * @param meeting was `findUniqueOrThrow` liefert (für `announceCreation`)
 * @param scanned was der Erinnerungs-Läufer der `recipients`-Funktion vorlegt
 */
function setup(
  meeting: Record<string, unknown> = FREIZEIT,
  scanned: Record<string, unknown> = FREIZEIT,
) {
  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });

  const prisma = {
    meeting: { findUniqueOrThrow: jest.fn().mockResolvedValue(meeting) },
    person: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]),
    },
  };

  // Reicht die `recipients`-Funktion einfach durch, damit der Test sieht, was
  // sie für einen gegebenen Termin liefern würde.
  const run = jest.fn(
    async (
      _type: unknown,
      recipients: (meeting: unknown) => unknown | Promise<unknown>,
    ) => ({ recipients: await recipients(scanned) }),
  );

  const service = new CustomMeetingNotificationService(
    prisma as unknown as PrismaService,
    { notify } as unknown as NotificationService,
    { run } as unknown as MeetingReminderService,
  );

  return { service, prisma, notify, run };
}

describe('CustomMeetingNotificationService.announceCreation', () => {
  it('sagt allen anderen Bescheid', async () => {
    const { service, notify, prisma } = setup();

    await service.announceCreation('m-1', 'p1');

    // Ohne die anlegende Person — sie weiß es.
    expect(prisma.person.findMany.mock.calls[0][0].where.id).toEqual({
      not: 'p1',
    });
    expect(notify).toHaveBeenCalledTimes(3);
    expect(notify.mock.calls[0][0]).toMatchObject({
      type: 'CUSTOM_MEETING_CREATED',
      relatedMeetingId: 'm-1',
    });
  });

  it('nennt den Zeitraum statt eines Datums', async () => {
    const { service, notify } = setup();

    await service.announceCreation('m-1');

    expect(notify.mock.calls[0][0].payload.title).toBe('Hauskreis-Freizeit');
    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Vom 14. Mai bis 16. Mai steht etwas Besonderes an.',
    );
  });

  it('nennt bei einem eintägigen Termin den Wochentag', async () => {
    const { service, notify } = setup({ ...FREIZEIT, endDate: null });

    await service.announceCreation('m-1');

    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Am Freitag, 14. Mai steht etwas Besonderes an.',
    );
  });

  /** Der Kern: sieben generierte Dienstage pro Nacht bleiben still. */
  it('schweigt über einen Hauskreis-Abend', async () => {
    const { service, notify } = setup({
      ...FREIZEIT,
      type: MeetingType.STANDARD,
    });

    await expect(service.announceCreation('m-1')).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  /** Ohne Titel bleibt die Nachricht trotzdem eine Nachricht. */
  it('kommt ohne Titel aus', async () => {
    const { service, notify } = setup({ ...FREIZEIT, title: null });

    await service.announceCreation('m-1');

    expect(notify.mock.calls[0][0].payload.title).toBe('Ein besonderer Termin');
  });
});

describe('CustomMeetingNotificationService.sendDueReminders', () => {
  /**
   * Die einzige Erinnerung, deren Empfänger nicht am Termin stehen — bei Host,
   * Thema und Musik liest man sie ab, hier sind es schlicht alle.
   */
  it('erinnert alle aktiven Mitglieder', async () => {
    const { service, run } = setup();

    const result = (await service.sendDueReminders()) as unknown as {
      recipients: { personId: string }[];
    };

    expect(run.mock.calls[0][0]).toBe('CUSTOM_MEETING_REMINDER');
    expect(result.recipients.map((r) => r.personId)).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
  });

  /**
   * Der Läufer scannt **alle** Termine im Fenster; das Aussieben nach Terminart
   * passiert erst in der `recipients`-Funktion. Ohne das bekäme jeder Dienstag
   * eine zweite Erinnerung obendrauf.
   */
  it('lässt gewöhnliche Abende aus', async () => {
    const { service } = setup(FREIZEIT, {
      ...FREIZEIT,
      type: MeetingType.STANDARD,
    });

    const result = (await service.sendDueReminders()) as unknown as {
      recipients: unknown[];
    };

    expect(result.recipients).toEqual([]);
  });
});
