/**
 * Wer die Liedauswahl eines Abends trifft.
 *
 * Die Regel bricht am Abend: vorher ist das Abhaken eine Entscheidung und gehört
 * denen, die die Musik machen; nachher ist es ein Protokoll und gehört allen.
 *
 * Die beiden Ausnahmen der alten Hausregel sind weg, und genau das prüfen die
 * letzten zwei Fälle: ein Admin ohne Musik-Zuteilung darf vorher **nicht**, und
 * ein Abend ohne jede Zuteilung ist keiner, an dem alle dürfen.
 */
import { ForbiddenException } from '@nestjs/common';
import { EditRightsService } from './edit-rights.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PersonRole } from '../../generated/prisma/enums';
import { withClock } from './group-clock.testing';

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

  return withClock(new EditRightsService(prisma as unknown as PrismaService));
}

/** Wie der Termin aus der Datenbank kommt — die Zone hängt am Hauskreis. */
function abend(date: Date, songLeaders: { personId: string }[]) {
  return { hauskreisId: 'hk-1', date, songLeaders };
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
      meeting: abend(KOMMENDER_DIENSTAG, [{ personId: 'p1' }]),
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
      meeting: abend(LETZTER_DIENSTAG, [{ personId: 'p1' }]),
    });

    await expect(
      service.assertMayPickSongs('m1', 'p9'),
    ).resolves.toBeUndefined();
  });

  /** Der Termintag selbst zählt noch als kommend — der Abend steht ja bevor. */
  it('gilt am Termintag noch als vorher', async () => {
    const service = setup({
      meeting: abend(new Date('2026-08-05T00:00:00.000Z'), [
        { personId: 'p1' },
      ]),
    });

    await expect(service.assertMayPickSongs('m1', 'p9')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  /**
   * Musik machen ist keine Verwaltungsaufgabe. Ein Admin, der die Auswahl
   * treffen will, trägt sich als zuständig ein wie alle anderen.
   */
  it('lässt auch Admins nicht an fremder Musik', async () => {
    const service = setup({
      role: PersonRole.ADMIN,
      meeting: abend(KOMMENDER_DIENSTAG, [{ personId: 'p1' }]),
    });

    await expect(service.assertMayPickSongs('m1', 'p9')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  /**
   * Der Fall, der die alte Fassung von dieser unterscheidet: ohne Zuteilung
   * durfte einmal jede:r. Ein Abend, an dem noch niemand für die Musik
   * eingetragen ist, ist aber keiner, an dem alle bestimmen — er ist einer, an
   * dem noch niemand eingetragen ist.
   */
  it('lässt bei leerer Zuteilung vor dem Abend niemanden', async () => {
    const service = setup({
      meeting: abend(KOMMENDER_DIENSTAG, []),
    });

    await expect(service.assertMayPickSongs('m1', 'p1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  /** Danach schon: nachtragen, was gesungen wurde, darf jede:r. */
  it('lässt bei leerer Zuteilung nach dem Abend jede:n', async () => {
    const service = setup({
      meeting: abend(LETZTER_DIENSTAG, []),
    });

    await expect(
      service.assertMayPickSongs('m1', 'p1'),
    ).resolves.toBeUndefined();
  });
});

/**
 * Der gemeldete Fehler, und der Grund für den ganzen Zeitzonen-Umbau.
 *
 * „Vorbei" wurde über den **UTC**-Kalendertag entschieden. Um halb eins nachts
 * war in UTC noch der Vortag, der Abend von gestern galt also als kommend — und
 * wer nicht die Musik gemacht hatte, bekam beim Abhaken einen 403, während die
 * App die Kästchen längst freigegeben hatte.
 */
describe('EditRightsService.assertMayPickSongs nach Mitternacht', () => {
  const gesternAbend = new Date('2026-08-11T00:00:00.000Z');

  it('lässt um halb eins in der Nacht danach jede:n', async () => {
    jest.setSystemTime(new Date('2026-08-11T22:30:00.000Z')); // 00:30 in Berlin

    const service = setup({
      meeting: abend(gesternAbend, [{ personId: 'p1' }]),
    });

    await expect(
      service.assertMayPickSongs('m1', 'p9'),
    ).resolves.toBeUndefined();

    jest.setSystemTime(HEUTE);
  });

  it('am Abend selbst um 23 Uhr aber noch nicht', async () => {
    jest.setSystemTime(new Date('2026-08-11T21:00:00.000Z')); // 23:00 in Berlin

    const service = setup({
      meeting: abend(gesternAbend, [{ personId: 'p1' }]),
    });

    await expect(service.assertMayPickSongs('m1', 'p9')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    jest.setSystemTime(HEUTE);
  });
});
