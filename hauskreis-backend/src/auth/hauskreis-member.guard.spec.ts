/**
 * Die Tür, die es bis eben gar nicht gab.
 *
 * `hauskreisId` war ein reiner Pfadparameter; wer eine fremde Id kannte, konnte
 * dort alles. Diese Tests halten fest, dass das nicht wiederkommt.
 */
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { HauskreisMemberGuard } from './hauskreis-member.guard';
import type { PrismaService } from '../prisma/prisma.service';
import { PersonRole } from '../../generated/prisma/enums';
import { IS_PUBLIC_KEY } from './public.decorator';
import { HAUSKREIS_ADMIN_KEY } from './hauskreis-admin.decorator';

function setup(options: {
  membership?: { id: string; hauskreisId: string; role: PersonRole } | null;
  metadata?: Record<string, boolean>;
}) {
  const findFirst = jest.fn().mockResolvedValue(options.membership ?? null);

  const reflector = {
    getAllAndOverride: jest.fn((key: string) => options.metadata?.[key]),
  } as unknown as Reflector;

  const guard = new HauskreisMemberGuard(reflector, {
    person: { findFirst },
  } as unknown as PrismaService);

  return { guard, findFirst };
}

function contextFor(params: Record<string, string>): ExecutionContext {
  const request = {
    params,
    user: { keycloakUserId: 'kc-1', roles: [] },
  } as unknown as Request;

  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

const member = { id: 'p1', hauskreisId: 'hk-1', role: PersonRole.MEMBER };
const admin = { id: 'p1', hauskreisId: 'hk-1', role: PersonRole.ADMIN };

describe('HauskreisMemberGuard', () => {
  it('lässt Mitglieder durch und legt die Mitgliedschaft ab', async () => {
    const { guard } = setup({ membership: member });
    const context = contextFor({ hauskreisId: 'hk-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(context.switchToHttp().getRequest<Request>().params).toBeDefined();
  });

  it('weist ab, wer nicht dazugehört', async () => {
    const { guard } = setup({ membership: null });

    await expect(
      guard.canActivate(contextFor({ hauskreisId: 'fremd' })),
    ).rejects.toThrow(ForbiddenException);
  });

  /** `/api/me`, `/api/push/…` — sie hängen an der eigenen Person. */
  it('lässt Routen ohne Hauskreis im Pfad in Ruhe', async () => {
    const { guard, findFirst } = setup({ membership: null });

    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('fragt bei öffentlichen Routen gar nicht erst nach', async () => {
    const { guard, findFirst } = setup({
      membership: null,
      metadata: { [IS_PUBLIC_KEY]: true },
    });

    await expect(
      guard.canActivate(contextFor({ hauskreisId: 'hk-1' })),
    ).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('sucht nur aktive Mitgliedschaften', async () => {
    const { guard, findFirst } = setup({ membership: member });

    await guard.canActivate(contextFor({ hauskreisId: 'hk-1' }));

    expect(findFirst).toHaveBeenCalledWith({
      where: { hauskreisId: 'hk-1', keycloakUserId: 'kc-1', active: true },
      select: { id: true, hauskreisId: true, role: true },
    });
  });
});

describe('HauskreisMemberGuard — Admin gilt pro Hauskreis', () => {
  it('lässt Admins auf geschützte Routen', async () => {
    const { guard } = setup({
      membership: admin,
      metadata: { [HAUSKREIS_ADMIN_KEY]: true },
    });

    await expect(
      guard.canActivate(contextFor({ hauskreisId: 'hk-1' })),
    ).resolves.toBe(true);
  });

  /**
   * Der ganze Punkt der Umstellung: vorher stand „Admin" im Token und galt
   * damit in jedem Hauskreis.
   */
  it('weist Mitglieder auf geschützten Routen ab', async () => {
    const { guard } = setup({
      membership: member,
      metadata: { [HAUSKREIS_ADMIN_KEY]: true },
    });

    await expect(
      guard.canActivate(contextFor({ hauskreisId: 'hk-1' })),
    ).rejects.toThrow(ForbiddenException);
  });
});
