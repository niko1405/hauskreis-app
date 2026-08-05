/**
 * Ein Mensch, ein Hauskreis — und die drei Wege, das zu ändern.
 *
 * Der heikelste Fall ist das Verlassen: wer als einzige Admin-Person geht,
 * darf keine Gruppe zurücklassen, in der niemand mehr einladen kann.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { MembershipService } from './membership.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PersonService } from '../person/person.service';
import type { PrayerBuddyGeneratorService } from '../prayer-buddy/prayer-buddy-generator.service';
import { PersonRole } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/auth.types';

const user: AuthenticatedUser = {
  keycloakUserId: 'kc-1',
  email: 'niko@example.com',
  name: 'Niko',
  roles: [],
};

function setup(
  options: {
    me?: Record<string, unknown> | null;
    others?: { id: string; name: string; role: PersonRole }[];
    linked?: Record<string, unknown> | null;
  } = {},
) {
  const personUpdate = jest.fn().mockResolvedValue({});
  const personCreate = jest.fn().mockResolvedValue({ id: 'p-new' });
  const hauskreisDelete = jest.fn().mockResolvedValue({});
  const hauskreisCreate = jest.fn().mockResolvedValue({ id: 'hk-new' });

  const prisma = {
    person: {
      findUnique: jest.fn().mockResolvedValue(options.linked ?? null),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.me === undefined
            ? { id: 'p1', role: PersonRole.MEMBER, locationId: null }
            : options.me,
        ),
      findMany: jest.fn().mockResolvedValue(options.others ?? []),
      update: personUpdate,
      create: personCreate,
    },
    hauskreis: { delete: hauskreisDelete, create: hauskreisCreate },
    // Die Transaktion reicht denselben Client durch; hier zählt nur, was
    // geschrieben werden wollte.
    $transaction: jest.fn((run: (tx: unknown) => unknown) =>
      typeof run === 'function' ? run(prisma) : run,
    ),
  } as unknown as PrismaService;

  const replanAfterMembershipChange = jest.fn().mockResolvedValue({
    repaired: 0,
    discarded: 0,
    planned: 0,
    notified: 0,
  });

  const service = new MembershipService(
    prisma,
    { syncHomes: jest.fn() } as unknown as PersonService,
    {
      replanAfterMembershipChange,
    } as unknown as PrayerBuddyGeneratorService,
  );

  return {
    service,
    personUpdate,
    personCreate,
    hauskreisDelete,
    hauskreisCreate,
    replanAfterMembershipChange,
  };
}

const member = { id: 'p1', role: PersonRole.MEMBER, locationId: null };
const admin = { id: 'p1', role: PersonRole.ADMIN, locationId: null };
const other = (role: PersonRole) => ({ id: 'p2', name: 'Mira', role });

describe('MembershipService.create', () => {
  it('macht die gründende Person zum Admin', async () => {
    const { service, personCreate } = setup();

    await service.create(user, { name: 'Hauskreis Nord' });

    expect(personCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hauskreisId: 'hk-new',
        keycloakUserId: 'kc-1',
        role: PersonRole.ADMIN,
      }),
    });
  });

  /** Ein Wechsel ist ein Umzug und kein stilles Nebeneinander. */
  it('weist ab, wer noch in einem Hauskreis ist', async () => {
    const { service } = setup({
      linked: { active: true, hauskreis: { name: 'Hauskreis Süd' } },
    });

    await expect(
      service.create(user, { name: 'Hauskreis Nord' }),
    ).rejects.toThrow(ConflictException);
  });

  it('lässt gründen, wer den alten schon verlassen hat', async () => {
    const { service, personCreate } = setup({
      linked: { active: false, hauskreis: { name: 'Hauskreis Süd' } },
    });

    await service.create(user, { name: 'Hauskreis Nord' });

    expect(personCreate).toHaveBeenCalled();
  });
});

describe('MembershipService.leave', () => {
  it('behält die Zeile fürs Archiv und gibt den Platz frei', async () => {
    const { service, personUpdate } = setup({
      me: member,
      others: [other(PersonRole.ADMIN)],
    });

    await service.leave('hk-1', 'p1', {});

    expect(personUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { active: false, keycloakUserId: null, locationId: null },
    });
  });

  /**
   * Sonst säße jemand für immer in einem Hauskreis fest, den er verlassen
   * will — deshalb eine Rückfrage und kein Verbot.
   */
  it('verlangt eine Nachfolge von der einzigen Admin-Person', async () => {
    const { service } = setup({
      me: admin,
      others: [other(PersonRole.MEMBER)],
    });

    await expect(service.leave('hk-1', 'p1', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('setzt die benannte Nachfolge auf Admin', async () => {
    const { service, personUpdate } = setup({
      me: admin,
      others: [other(PersonRole.MEMBER)],
    });

    const result = await service.leave('hk-1', 'p1', {
      successorPersonId: 'p2',
    });

    expect(personUpdate).toHaveBeenCalledWith({
      where: { id: 'p2' },
      data: { role: PersonRole.ADMIN },
    });
    expect(result.successorPersonId).toBe('p2');
  });

  it('weist eine Nachfolge ab, die nicht dazugehört', async () => {
    const { service } = setup({
      me: admin,
      others: [other(PersonRole.MEMBER)],
    });

    await expect(
      service.leave('hk-1', 'p1', { successorPersonId: 'fremd' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lässt einen Admin gehen, solange ein anderer bleibt', async () => {
    const { service, personUpdate } = setup({
      me: admin,
      others: [other(PersonRole.ADMIN)],
    });

    const result = await service.leave('hk-1', 'p1', {});

    expect(result.successorPersonId).toBeNull();
    expect(personUpdate).toHaveBeenCalledTimes(1);
  });

  /**
   * Ohne das stünde die gegangene Person in bis zu fünf geplanten Runden — und
   * wer mit ihr gepaart war, bliebe zwei Wochen lang allein.
   */
  it('zieht die Gebetsrotation nach', async () => {
    const { service, replanAfterMembershipChange } = setup({
      me: member,
      others: [other(PersonRole.ADMIN)],
    });

    await service.leave('hk-1', 'p1', {});

    expect(replanAfterMembershipChange).toHaveBeenCalledWith('hk-1');
  });

  /** Eine leere Gruppe, die niemand betreten kann, ist kein Zustand. */
  it('nimmt den Hauskreis mit, wenn die letzte Person geht', async () => {
    const { service, hauskreisDelete } = setup({ me: admin, others: [] });

    await expect(service.leave('hk-1', 'p1', {})).resolves.toEqual({
      hauskreisDeleted: true,
      successorPersonId: null,
    });
    expect(hauskreisDelete).toHaveBeenCalledWith({ where: { id: 'hk-1' } });
  });
});
