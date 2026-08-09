/**
 * Wer an einem Abend was eintragen darf.
 *
 * Die Regel ist drei Zeilen lang, und der dritte Fall ist der, um den es geht:
 * ohne ihn wäre ein Abend ohne Zuteilung gesperrt, und die Zuteilung damit die
 * Voraussetzung fürs Nachbereiten. Im echten Leben läuft es umgekehrt — erst
 * passiert der Abend, dann schreibt jemand auf, was war.
 *
 * Vom Dienst geprüft wird hier nur noch die Liedauswahl. Themenname und
 * Nachbereitung folgen inzwischen der Zugehörigkeit zum **Thema** statt der
 * Zuteilung an einem Abend — ihre Tests stehen in `topic-visibility.spec.ts`.
 */
import { ForbiddenException } from '@nestjs/common';
import { mayEdit } from './edit-rights';
import { EditRightsService } from './edit-rights.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PersonRole } from '../../generated/prisma/enums';

describe('mayEdit', () => {
  it('lässt die Zuständigen', () => {
    expect(
      mayEdit({ isAdmin: false, personId: 'p1', responsibles: ['p1', 'p2'] }),
    ).toBe(true);
  });

  it('weist ab, wer nicht zugeteilt ist', () => {
    expect(
      mayEdit({ isAdmin: false, personId: 'p3', responsibles: ['p1', 'p2'] }),
    ).toBe(false);
  });

  /** Der Kern: sonst hinge das Nachbereiten an einer Zuteilung. */
  it('lässt alle, solange niemand zugeteilt ist', () => {
    expect(mayEdit({ isAdmin: false, personId: 'p3', responsibles: [] })).toBe(
      true,
    );
  });

  it('lässt Admins auch dann', () => {
    expect(
      mayEdit({ isAdmin: true, personId: 'p3', responsibles: ['p1'] }),
    ).toBe(true);
  });
});

const HEUTE = new Date('2026-08-05T12:00:00.000Z');
const KOMMENDER_DIENSTAG = new Date('2026-08-11T00:00:00.000Z');
const LETZTER_DIENSTAG = new Date('2026-07-28T00:00:00.000Z');

function setup(options: {
  role?: PersonRole;
  meeting?: Record<string, unknown> | null;
}) {
  const prisma = {
    person: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ role: options.role ?? PersonRole.MEMBER }),
    },
    meeting: { findUnique: jest.fn().mockResolvedValue(options.meeting) },
  };

  return new EditRightsService(prisma as unknown as PrismaService);
}

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(HEUTE);
});

afterAll(() => {
  jest.useRealTimers();
});

describe('EditRightsService.assertMayPickSongs', () => {
  it('lässt vor dem Abend nur die Musik-Zuständigen', async () => {
    const service = setup({
      meeting: {
        date: KOMMENDER_DIENSTAG,
        songLeaders: [{ personId: 'p1' }],
      },
    });

    await expect(service.assertMayPickSongs('m1', 'p9')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.assertMayPickSongs('m1', 'p1'),
    ).resolves.toBeUndefined();
  });

  /**
   * Danach ist das Abhaken ein Protokoll und keine Entscheidung — und daran
   * erinnert sich jede:r gleich gut.
   */
  it('lässt nach dem Abend jede:n nachtragen', async () => {
    const service = setup({
      meeting: { date: LETZTER_DIENSTAG, songLeaders: [{ personId: 'p1' }] },
    });

    await expect(
      service.assertMayPickSongs('m1', 'p9'),
    ).resolves.toBeUndefined();
  });

  /** Der Termintag selbst zählt noch als kommend — der Abend steht ja bevor. */
  it('gilt am Termintag noch als vorher', async () => {
    const service = setup({
      meeting: {
        date: new Date('2026-08-05T00:00:00.000Z'),
        songLeaders: [{ personId: 'p1' }],
      },
    });

    await expect(service.assertMayPickSongs('m1', 'p9')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
