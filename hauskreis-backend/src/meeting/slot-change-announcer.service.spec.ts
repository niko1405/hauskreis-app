/**
 * „Am nächsten Abend gibt es jetzt auch Lieder."
 *
 * Gebündelt, nur für den nächsten Abend und nur an die, die dabei oder
 * unentschieden sind — und nicht an die, die es gerade selbst geändert haben.
 */
import {
  SETTLE_MS,
  SlotChangeAnnouncer,
  describeSlotChange,
  type SlotState,
} from './slot-change-announcer.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import { MeetingStatus, NotificationType } from '../../generated/prisma/enums';
import { withClock } from './group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const TUESDAY = utc('2026-08-04');

const STANDARD: SlotState = {
  hasTopicSlot: true,
  hasSongSlot: false,
  hasTestimonySlot: false,
  hasPrayerSlot: true,
  hasSnackSlot: false,
};

const NOBODY = {
  host: false,
  topic: false,
  song: false,
  testimony: false,
  snack: false,
};

function setup(
  options: {
    /** Der Stand am Abend, wenn die Nachricht rausgeht. */
    now?: Partial<SlotState>;
    nextId?: string | null;
    attendees?: string[];
    songLeaders?: number;
  } = {},
) {
  const meeting = {
    id: 'm1',
    hauskreisId: 'hk-1',
    date: TUESDAY,
    status: MeetingStatus.PLANNED,
    hostPersonId: 'host',
    location: { requiresHost: true },
    testimonyPersonId: null,
    ...STANDARD,
    ...options.now,
    topicResponsibles: [{ personId: 'antonia' }],
    songLeaders: Array.from({ length: options.songLeaders ?? 0 }, (_, i) => ({
      personId: `leader-${i}`,
    })),
    snackResponsibles: [],
  };

  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });
  const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const personFindMany = jest
    .fn()
    .mockResolvedValue(
      (options.attendees ?? ['anna', 'chris', 'niko']).map((id) => ({ id })),
    );

  const service = withClock(
    new SlotChangeAnnouncer(
      {
        meeting: {
          findUnique: jest.fn().mockResolvedValue(meeting),
          findFirst: jest
            .fn()
            .mockResolvedValue(
              options.nextId === null ? null : { id: options.nextId ?? 'm1' },
            ),
        },
        person: { findMany: personFindMany },
        notificationLog: { deleteMany },
      } as unknown as PrismaService,
      { notify } as unknown as NotificationService,
      undefined as never,
    ),
  );

  return { service, notify, deleteMany, personFindMany };
}

function change(
  service: SlotChangeAnnouncer,
  before: Partial<SlotState>,
  after: Partial<SlotState>,
  actor = 'niko',
) {
  service.noteChange({
    hauskreisId: 'hk-1',
    meetingId: 'm1',
    before: { ...STANDARD, ...before },
    after: { ...STANDARD, ...after },
    actorPersonId: actor,
  });
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(utc('2026-07-31'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SlotChangeAnnouncer', () => {
  it('schickt mehrere Änderungen als eine Nachricht', async () => {
    const { service, notify } = setup({
      now: { hasSongSlot: true, hasSnackSlot: true },
    });

    change(service, {}, { hasSongSlot: true });
    change(
      service,
      { hasSongSlot: true },
      { hasSongSlot: true, hasSnackSlot: true },
    );

    await expect(service.flush('m1')).resolves.toBe(2);

    // Zwei Empfänger, je eine Nachricht — nicht zwei je Empfänger.
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify.mock.calls[0][0]).toMatchObject({
      type: NotificationType.MEETING_SLOTS_CHANGED,
      relatedMeetingId: 'm1',
    });
  });

  it('wartet, bis die letzte Änderung zwei Minuten her ist', async () => {
    const { service, notify } = setup({ now: { hasSongSlot: true } });

    change(service, {}, { hasSongSlot: true });
    await jest.advanceTimersByTimeAsync(SETTLE_MS - 1);
    expect(notify).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(notify).toHaveBeenCalled();
  });

  it('schweigt, wenn ein Haken gesetzt und gleich wieder genommen wurde', async () => {
    const { service, notify } = setup();

    change(service, {}, { hasSongSlot: true });
    change(service, { hasSongSlot: true }, {});

    await expect(service.flush('m1')).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('lässt aus, wer es geändert hat', async () => {
    const { service, notify } = setup({ now: { hasSongSlot: true } });

    change(service, {}, { hasSongSlot: true }, 'niko');

    await service.flush('m1');

    expect(notify.mock.calls.map((call) => call[0].personId)).toEqual([
      'anna',
      'chris',
    ]);
  });

  it('fragt nur die, die dabei oder unentschieden sind', async () => {
    const { service, personFindMany } = setup({ now: { hasSongSlot: true } });

    change(service, {}, { hasSongSlot: true });
    await service.flush('m1');

    expect(personFindMany.mock.calls[0][0].where).toMatchObject({
      attendances: { none: { meetingId: 'm1', status: 'ABSENT' } },
    });
  });

  it('schweigt für einen Abend, der nicht der nächste ist', async () => {
    const { service, notify } = setup({
      now: { hasSongSlot: true },
      nextId: 'm0',
    });

    change(service, {}, { hasSongSlot: true });

    await expect(service.flush('m1')).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('ersetzt die Nachricht einer früheren Runde', async () => {
    const { service, deleteMany } = setup({ now: { hasSongSlot: true } });

    change(service, {}, { hasSongSlot: true });
    await service.flush('m1');

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        type: NotificationType.MEETING_SLOTS_CHANGED,
        relatedMeetingId: 'm1',
      },
    });
  });
});

describe('describeSlotChange', () => {
  it('nennt, was dazukommt, und wofür noch jemand fehlt', () => {
    expect(
      describeSlotChange(TUESDAY, ['hasSongSlot', 'hasSnackSlot'], [], {
        ...NOBODY,
        song: true,
        snack: true,
      }),
    ).toBe(
      'Am 4. August gibt es jetzt auch Lieder und Snacks. Für die Musik und die Snacks muss noch jemand eingeteilt werden.',
    );
  });

  it('fordert nichts auf, wo schon jemand steht', () => {
    expect(describeSlotChange(TUESDAY, ['hasSongSlot'], [], NOBODY)).toBe(
      'Am 4. August gibt es jetzt auch Lieder.',
    );
  });

  it('kennt für die Gebetsanliegen keine Rolle', () => {
    expect(
      describeSlotChange(TUESDAY, ['hasPrayerSlot'], [], {
        ...NOBODY,
        topic: true,
      }),
    ).toBe('Am 4. August gibt es jetzt auch Gebetsanliegen.');
  });

  it('sagt, was wegfällt — in Einzahl und Mehrzahl', () => {
    expect(describeSlotChange(TUESDAY, [], ['hasTopicSlot'], NOBODY)).toBe(
      'Am 4. August fällt das Thema weg.',
    );
    expect(
      describeSlotChange(TUESDAY, [], ['hasTopicSlot', 'hasSongSlot'], NOBODY),
    ).toBe('Am 4. August fallen das Thema und die Lieder weg.');
  });

  it('verbindet beides', () => {
    expect(
      describeSlotChange(TUESDAY, ['hasTestimonySlot'], ['hasTopicSlot'], {
        ...NOBODY,
        testimony: true,
      }),
    ).toBe(
      'Am 4. August gibt es jetzt auch ein Testimony. Für das Testimony muss noch jemand eingeteilt werden. Das Thema fällt weg.',
    );
  });
});
