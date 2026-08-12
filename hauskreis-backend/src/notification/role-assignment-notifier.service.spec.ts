/**
 * Die drei Regeln, die alle Aufrufer teilen: nur kommende Abende, nicht an
 * sich selbst, und die Rolle gehört in den Entdopplungs-Schlüssel.
 */
import { RoleAssignmentNotifier } from './role-assignment-notifier.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from './notification.service';
import { AssignmentRole, MeetingStatus } from '../../generated/prisma/enums';
import { withClock } from '../meeting/group-clock.testing';

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

function setup(meeting: Record<string, unknown> | null = null) {
  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, skipped: 0, pruned: 0, failed: 0 });

  const prisma = {
    meeting: {
      findUnique: jest.fn().mockResolvedValue(
        meeting ?? {
          id: 'm1',
          date: KOMMEND,
          status: MeetingStatus.PLANNED,
          location: { name: 'Bei Niko' },
        },
      ),
    },
  } as unknown as PrismaService;

  const service = withClock(
    new RoleAssignmentNotifier(prisma, {
      notify,
    } as unknown as NotificationService),
  );

  return { service, notify };
}

describe('RoleAssignmentNotifier.announce', () => {
  it('schreibt den Eingeteilten an, mit Rolle im Schlüssel', async () => {
    const { service, notify } = setup();

    await expect(
      service.announce('m1', AssignmentRole.HOST, ['niko'], 'admin'),
    ).resolves.toBe(1);

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'niko',
        type: 'ROLE_ASSIGNED',
        relatedMeetingId: 'm1',
        relatedRole: AssignmentRole.HOST,
      }),
    );
  });

  it('nennt beim Gastgeber die Wohnung', async () => {
    const { service, notify } = setup();

    await service.announce('m1', AssignmentRole.HOST, ['niko']);

    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Am Dienstag, 11. August ist der Hauskreis bei dir (Bei Niko).',
    );
  });

  /**
   * Der Text muss zur Rolle passen — und tat es beim Testimony nicht.
   *
   * Der Rumpf war ein Ternär mit zwei Zweigen für vier Rollen: alles, was nicht
   * `HOST` und nicht `TOPIC` war, bekam „machst du die Musik", während der
   * Titel darüber „Du erzählst dein Testimony" sagte. Erreichbar war das
   * bisher nicht, weil eine Testimony-Zuteilung `announce` gar nicht anstößt —
   * aber genau deshalb hätte es beim Nachrüsten niemand bemerkt.
   */
  it.each([
    [
      AssignmentRole.TOPIC,
      'Am Dienstag, 11. August bist du mit dem Thema dran.',
    ],
    [
      AssignmentRole.TESTIMONY,
      'Am Dienstag, 11. August erzählst du deine Geschichte.',
    ],
    [AssignmentRole.SONG, 'Am Dienstag, 11. August machst du die Musik.'],
  ])('sagt bei %s das Richtige', async (role, expected) => {
    const { service, notify } = setup();

    await service.announce('m1', role, ['niko']);

    expect(notify.mock.calls[0][0].payload.body).toBe(expected);
  });

  /** Eine Nachricht an sich selbst ist nur Lärm. */
  it('überspringt, wer sich selbst einträgt', async () => {
    const { service, notify } = setup();

    await expect(
      service.announce('m1', AssignmentRole.SONG, ['niko'], 'niko'),
    ).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('schreibt die anderen trotzdem an', async () => {
    const { service, notify } = setup();

    await service.announce('m1', AssignmentRole.SONG, ['niko', 'mira'], 'niko');

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].personId).toBe('mira');
  });

  /** Wer nachträgt, wer im Mai das Thema hatte, soll niemanden aufschrecken. */
  it('schweigt bei einem vergangenen Abend', async () => {
    const { service, notify } = setup({
      id: 'm1',
      date: VERGANGEN,
      status: MeetingStatus.PLANNED,
      location: null,
    });

    await expect(
      service.announce('m1', AssignmentRole.TOPIC, ['niko']),
    ).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('schweigt bei einem abgesagten Abend', async () => {
    const { service, notify } = setup({
      id: 'm1',
      date: KOMMEND,
      status: MeetingStatus.CANCELLED,
      location: null,
    });

    await service.announce('m1', AssignmentRole.TOPIC, ['niko']);

    expect(notify).not.toHaveBeenCalled();
  });

  it('zählt den heutigen Abend noch als kommend', async () => {
    const { service, notify } = setup({
      id: 'm1',
      date: HEUTE,
      status: MeetingStatus.PLANNED,
      location: null,
    });

    await service.announce('m1', AssignmentRole.TOPIC, ['niko']);

    expect(notify).toHaveBeenCalled();
  });
});
