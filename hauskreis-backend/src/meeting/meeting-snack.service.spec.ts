/**
 * Wer an einem Abend etwas zu essen mitbringt.
 *
 * Die Rolle ist der Zwilling der Musik, und diese Tests halten fest, worin sie
 * ihr gleicht: Abgesagte werden abgelehnt, wer dazukommt bekommt eine Nachricht
 * und steht danach als „dabei", und wer schon eingetragen war, hört nichts
 * doppelt.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MeetingSnackService } from './meeting-snack.service';
// Type-only: hält Jest davon ab, den echten PrismaClient zu laden.
import type { PrismaService } from '../prisma/prisma.service';
import type { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import type { RoleAttendanceService } from '../attendance/role-attendance.service';
import type { AvailabilityService } from '../role-suggestion/availability.service';
import { AssignmentRole } from '../../generated/prisma/enums';

function setup(
  options: {
    /** Wer vor dem Aufruf schon eingetragen war. */
    vorher?: { id: string; name: string }[];
    /** Wen `assertAvailable` ablehnt. */
    abgesagt?: string[];
    kenntDenTermin?: boolean;
  } = {},
) {
  const vorher = options.vorher ?? [];
  /** `findResponsibles` wird zweimal gerufen: vorher und für die Antwort. */
  let gespeichert = vorher;

  const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const createMany = jest.fn().mockResolvedValue({ count: 0 });

  const db = {
    meeting: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.kenntDenTermin === false ? null : { id: 'm1' },
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    person: {
      count: jest.fn((args: { where: { id: { in: string[] } } }) =>
        Promise.resolve(new Set(args.where.id.in).size),
      ),
    },
    meetingSnackResponsible: {
      findMany: jest.fn(() =>
        Promise.resolve(gespeichert.map((person) => ({ person }))),
      ),
      deleteMany,
      createMany,
    },
    $transaction: (run: (tx: unknown) => unknown) => run(db),
  };

  // Schreibt den Stand fort, damit die Antwort das zeigt, was hineinging.
  createMany.mockImplementation((args: { data: { personId: string }[] }) => {
    gespeichert = args.data.map((row) => ({
      id: row.personId,
      name: row.personId,
    }));
    return Promise.resolve({ count: args.data.length });
  });

  const assertAvailable = jest.fn((_hk, _m, ids: readonly string[]) => {
    const weg = ids.filter((id) => (options.abgesagt ?? []).includes(id));

    return weg.length === 0
      ? Promise.resolve()
      : Promise.reject(
          new BadRequestException(
            `${weg.join(', ')} ist an diesem Abend nicht dabei`,
          ),
        );
  });

  const announce = jest.fn().mockResolvedValue(undefined);
  const confirm = jest.fn().mockResolvedValue(undefined);

  const service = new MeetingSnackService(
    db as unknown as PrismaService,
    { announce } as unknown as RoleAssignmentNotifier,
    { confirm } as unknown as RoleAttendanceService,
    { assertAvailable } as unknown as AvailabilityService,
  );

  return {
    service,
    db,
    deleteMany,
    createMany,
    assertAvailable,
    announce,
    confirm,
  };
}

describe('MeetingSnackService.setResponsibles', () => {
  it('trägt mehrere Leute ein', async () => {
    const { service, createMany } = setup();

    await service.setResponsibles('hk-1', 'm1', {
      personIds: ['reini', 'niko'],
    });

    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { meetingId: 'm1', personId: 'reini' },
          { meetingId: 'm1', personId: 'niko' },
        ],
      }),
    );
  });

  /** Nicht an jedem Abend gibt es etwas zu essen — leer ist ein Zustand. */
  it('nimmt eine leere Liste an', async () => {
    const { service, deleteMany, announce } = setup({
      vorher: [{ id: 'reini', name: 'Reini' }],
    });

    await expect(
      service.setResponsibles('hk-1', 'm1', { personIds: [] }),
    ).resolves.toEqual([]);

    expect(deleteMany).toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith(
      'm1',
      AssignmentRole.SNACK,
      [],
      undefined,
    );
  });

  it('weist ab, wer an dem Abend abgesagt hat', async () => {
    const { service, createMany } = setup({ abgesagt: ['mira'] });

    await expect(
      service.setResponsibles('hk-1', 'm1', { personIds: ['mira'] }),
    ).rejects.toThrow(BadRequestException);

    // Und schreibt nichts: Die Prüfung steht vor der Transaktion.
    expect(createMany).not.toHaveBeenCalled();
  });

  /**
   * Sonst ließe sich eine Liste nicht mehr ändern, sobald einer der
   * Eingetragenen absagt — die Prüfung würde an ihm scheitern, obwohl er gar
   * nicht dazukommt. Dieselbe Regel wie bei der Musik.
   */
  it('prüft nur die, die dazukommen', async () => {
    const { service, assertAvailable } = setup({
      vorher: [{ id: 'mira', name: 'Mira' }],
      abgesagt: ['mira'],
    });

    await expect(
      service.setResponsibles('hk-1', 'm1', { personIds: ['mira', 'niko'] }),
    ).resolves.toBeDefined();

    expect(assertAvailable).toHaveBeenCalledWith('hk-1', 'm1', ['niko']);
  });

  it('sagt nur den Neuen Bescheid', async () => {
    const { service, announce } = setup({
      vorher: [{ id: 'reini', name: 'Reini' }],
    });

    await service.setResponsibles(
      'hk-1',
      'm1',
      { personIds: ['reini', 'niko'] },
      'chris',
    );

    expect(announce).toHaveBeenCalledWith(
      'm1',
      AssignmentRole.SNACK,
      ['niko'],
      'chris',
    );
  });

  /** Wer etwas mitbringt, kommt auch — anders als bei der Nachricht gilt das
   * auch für die Person, die sich selbst einträgt. */
  it('macht aus der Zuteilung eine Zusage', async () => {
    const { service, confirm } = setup();

    await service.setResponsibles(
      'hk-1',
      'm1',
      { personIds: ['niko'] },
      'niko',
    );

    expect(confirm).toHaveBeenCalledWith('m1', ['niko']);
  });

  it('hebt die Version des Termins', async () => {
    const { service, db } = setup();

    await service.setResponsibles('hk-1', 'm1', { personIds: ['niko'] });

    // Die Zuteilung steht mit in der Antwort des Termins; ohne den Sprung käme
    // der alte Stand als `304` zurück.
    expect(db.meeting.updateMany).toHaveBeenCalled();
  });

  it('kennt nur Termine des eigenen Hauskreises', async () => {
    const { service } = setup({ kenntDenTermin: false });

    await expect(
      service.setResponsibles('hk-1', 'm1', { personIds: [] }),
    ).rejects.toThrow(NotFoundException);
  });

  it('weist Leute aus einem anderen Hauskreis ab', async () => {
    const { service, db } = setup();
    db.person.count = jest.fn().mockResolvedValue(0);

    await expect(
      service.setResponsibles('hk-1', 'm1', { personIds: ['fremd'] }),
    ).rejects.toThrow(BadRequestException);
  });
});
