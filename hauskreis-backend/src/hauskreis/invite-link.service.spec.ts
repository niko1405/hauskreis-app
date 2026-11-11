/**
 * Der Einladungslink — höchstens einer je Hauskreis, und er läuft ab.
 */
import { NotFoundException } from '@nestjs/common';
import { InviteLinkService } from './invite-link.service';
import type { PrismaService } from '../prisma/prisma.service';

function setup(found: Record<string, unknown> | null = null) {
  const upsert = jest
    .fn()
    .mockImplementation(({ create }: { create: Record<string, unknown> }) =>
      Promise.resolve(create),
    );
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const findUnique = jest.fn().mockResolvedValue(found);

  const prisma = {
    hauskreisInviteLink: { upsert, deleteMany, findUnique },
  } as unknown as PrismaService;

  return { service: new InviteLinkService(prisma), upsert, findUnique };
}

describe('InviteLinkService.replace', () => {
  it('würfelt einen Code, den man nicht erraten kann', async () => {
    const { service, upsert } = setup();

    await service.replace('hk-1', 'p-admin', 7);

    const { create } = upsert.mock.calls[0]![0] as {
      create: { code: string };
    };
    // 16 Byte als base64url: 22 Zeichen, die ohne Kodierung in eine Adresse
    // passen.
    expect(create.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('gibt jedem Link einen eigenen Code', async () => {
    const { service, upsert } = setup();

    await service.replace('hk-1', 'p-admin', 7);
    await service.replace('hk-1', 'p-admin', 7);

    const codes = upsert.mock.calls.map(
      (call) => (call[0] as { create: { code: string } }).create.code,
    );
    expect(codes[0]).not.toBe(codes[1]);
  });

  it('läuft nach der gewählten Zahl an Tagen ab', async () => {
    const { service, upsert } = setup();
    const before = Date.now();

    await service.replace('hk-1', 'p-admin', 30);

    const { create } = upsert.mock.calls[0]![0] as {
      create: { expiresAt: Date };
    };
    const days = (create.expiresAt.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(30);
    expect(days).toBeLessThan(30.01);
  });

  /**
   * „Erneuern" ist der Knopf für „der alte ist irgendwo gelandet". Der Code
   * wechselt deshalb auch beim Überschreiben, und gezählt wird von vorn.
   */
  it('ersetzt einen bestehenden Link und zählt neu', async () => {
    const { service, upsert } = setup();

    await service.replace('hk-1', 'p-admin', 1);

    const { where, update } = upsert.mock.calls[0]![0] as {
      where: unknown;
      update: Record<string, unknown>;
    };
    expect(where).toEqual({ hauskreisId: 'hk-1' });
    expect(update).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        joinCount: 0,
        createdByPersonId: 'p-admin',
      }),
    );
  });
});

describe('InviteLinkService.resolve', () => {
  const hauskreis = { id: 'hk-1', name: 'Neustadt' };

  it('nennt den Hauskreis hinter einem gültigen Link', async () => {
    const { service } = setup({
      expiresAt: new Date(Date.now() + 60_000),
      hauskreis,
    });

    await expect(service.resolve('code')).resolves.toEqual({ hauskreis });
  });

  it('kennt einen abgelaufenen Link nicht mehr', async () => {
    const { service } = setup({
      expiresAt: new Date(Date.now() - 1),
      hauskreis,
    });

    await expect(service.resolve('code')).rejects.toThrow(NotFoundException);
  });

  /**
   * Unbekannt und abgelaufen sehen gleich aus: Eine Unterscheidung verriete
   * nur, dass es den Code einmal gab.
   */
  it('antwortet auf einen unbekannten Code genauso', async () => {
    const { service } = setup(null);

    await expect(service.resolve('code')).rejects.toThrow(/gilt nicht mehr/);
  });
});
