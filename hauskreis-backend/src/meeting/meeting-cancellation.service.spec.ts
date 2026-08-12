/**
 * Der Abend, den niemand absagt und der trotzdem ausfällt — und der Weg
 * zurück.
 *
 * Die beiden Schwellen sind der ganze Inhalt: „alle" heißt wirklich alle, und
 * zurückgenommen wird nur, was die App selbst abgesagt hat.
 */
import { MeetingCancellationService } from './meeting-cancellation.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MeetingNotificationService } from './meeting-notification.service';
import {
  MeetingCancelSource,
  MeetingStatus,
} from '../../generated/prisma/enums';
import { withClock } from './group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const HEUTE = utc('2026-08-04');
const KOMMEND = utc('2026-08-11');
const VERGANGEN = utc('2026-07-28');

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(HEUTE);
});

afterEach(() => {
  jest.useRealTimers();
});

function setup(options: {
  meeting?: Record<string, unknown> | null;
  active?: number;
  declined?: number;
}) {
  const update = jest.fn().mockResolvedValue({});

  const prisma = {
    meeting: {
      findUnique: jest.fn().mockResolvedValue(
        options.meeting === undefined
          ? {
              id: 'm1',
              hauskreisId: 'hk1',
              date: KOMMEND,
              status: MeetingStatus.PLANNED,
              cancelSource: null,
            }
          : options.meeting,
      ),
      update,
    },
    person: { count: jest.fn().mockResolvedValue(options.active ?? 9) },
    meetingAttendance: {
      count: jest.fn().mockResolvedValue(options.declined ?? 0),
    },
  } as unknown as PrismaService;

  const notifications = {
    announceCancellation: jest.fn(),
    announceRevival: jest.fn(),
  };

  const service = withClock(
    new MeetingCancellationService(
      prisma,
      notifications as unknown as MeetingNotificationService,
    ),
  );

  return { service, update, notifications };
}

/** Was `update` schreiben wollte. */
const written = (update: jest.Mock) =>
  update.mock.calls[0]?.[0].data as Record<string, unknown>;

const cancelled = (overrides: Record<string, unknown> = {}) => ({
  id: 'm1',
  hauskreisId: 'hk1',
  date: KOMMEND,
  status: MeetingStatus.CANCELLED,
  cancelSource: MeetingCancelSource.ALL_DECLINED,
  ...overrides,
});

describe('MeetingCancellationService.reconcile — absagen', () => {
  it('sagt ab, wenn wirklich alle abgesagt haben', async () => {
    const { service, update, notifications } = setup({
      active: 9,
      declined: 9,
    });

    await service.reconcile('m1');

    expect(written(update)).toMatchObject({
      status: MeetingStatus.CANCELLED,
      cancelledByPersonId: null,
      cancelSource: MeetingCancelSource.ALL_DECLINED,
    });
    expect(notifications.announceCancellation).toHaveBeenCalledWith('m1');
  });

  /**
   * Die vorsichtige Lesart, und die richtige: „vier von neun haben abgesagt"
   * ist ein dünner Abend, kein ausgefallener.
   */
  it('lässt einen Abend stehen, solange jemand nicht geantwortet hat', async () => {
    const { service, update, notifications } = setup({
      active: 9,
      declined: 8,
    });

    await service.reconcile('m1');

    expect(update).not.toHaveBeenCalled();
    expect(notifications.announceCancellation).not.toHaveBeenCalled();
  });

  it('sagt in einem leeren Hauskreis nichts ab', async () => {
    const { service, update } = setup({ active: 0, declined: 0 });

    await service.reconcile('m1');

    expect(update).not.toHaveBeenCalled();
  });

  /**
   * Dort ist „abgesagt" ein Vermerk fürs Archiv, keine Vorhersage — und
   * nachträglich eingetragene Anwesenheit soll ihn nicht umstoßen.
   */
  it('rührt vergangene Abende nicht an', async () => {
    const { service, update } = setup({
      meeting: {
        id: 'm1',
        hauskreisId: 'hk1',
        date: VERGANGEN,
        status: MeetingStatus.PLANNED,
        cancelSource: null,
      },
      active: 9,
      declined: 9,
    });

    await service.reconcile('m1');

    expect(update).not.toHaveBeenCalled();
  });

  it('sagt einen schon abgesagten Abend nicht zweimal ab', async () => {
    const { service, update, notifications } = setup({
      meeting: cancelled(),
      active: 9,
      declined: 9,
    });

    await service.reconcile('m1');

    expect(update).not.toHaveBeenCalled();
    expect(notifications.announceCancellation).not.toHaveBeenCalled();
  });
});

describe('MeetingCancellationService.reconcile — wieder aufleben', () => {
  it('holt den Abend zurück, sobald jemand doch zusagt', async () => {
    const { service, update, notifications } = setup({
      meeting: cancelled(),
      active: 9,
      declined: 8,
    });

    await service.reconcile('m1');

    expect(written(update)).toMatchObject({
      status: MeetingStatus.PLANNED,
      cancelledAt: null,
      cancelSource: null,
    });
    expect(notifications.announceRevival).toHaveBeenCalledWith('m1');
  });

  /**
   * Sonst würde eine Absage verschwinden, die ein Mensch ausgesprochen hat —
   * nur weil jemand auf „doch dabei" getippt hat.
   */
  it('rührt eine Absage von Hand nicht an', async () => {
    const { service, update, notifications } = setup({
      meeting: cancelled({ cancelSource: MeetingCancelSource.MANUAL }),
      active: 9,
      declined: 8,
    });

    await service.reconcile('m1');

    expect(update).not.toHaveBeenCalled();
    expect(notifications.announceRevival).not.toHaveBeenCalled();
  });

  /**
   * Der Altbestand aus der Migration hat `cancel_source = MANUAL` bekommen,
   * genau dafür: aus `cancelled_by_person_id IS NULL` „automatisch" zu lesen
   * hätte längst abgesagte Abende wieder aufleben lassen.
   */
  it('lässt einen Abend ohne Herkunft in Ruhe', async () => {
    const { service, update } = setup({
      meeting: cancelled({ cancelSource: null }),
      active: 9,
      declined: 0,
    });

    await service.reconcile('m1');

    expect(update).not.toHaveBeenCalled();
  });
});
