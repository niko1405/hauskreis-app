import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupIdeaService } from './group-idea.service';
import { groupIdeaResponseSchema } from './dto/group-idea-response.dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { HauskreisMembership } from '../auth/auth.types';

const member: HauskreisMembership = {
  id: 'p1',
  hauskreisId: 'hk',
  role: 'MEMBER',
};
const admin: HauskreisMembership = {
  id: 'p9',
  hauskreisId: 'hk',
  role: 'ADMIN',
};

function setup(current?: { doneAt: Date | null } | null) {
  const groupIdea = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest
      .fn()
      .mockResolvedValue(current === undefined ? { doneAt: null } : current),
    findUniqueOrThrow: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    delete: jest.fn().mockResolvedValue({}),
  };

  const service = new GroupIdeaService({
    groupIdea,
  } as unknown as PrismaService);

  return { service, groupIdea };
}

beforeEach(() => jest.clearAllMocks());

describe('GroupIdeaService.findAll', () => {
  it('stellt Offene nach oben und das zuletzt Abgehakte darunter', async () => {
    const { service, groupIdea } = setup();

    await service.findAll('hk');

    // `desc` mit `nulls: 'first'` erledigt beides in einer Spalte. Mit `asc`
    // stünde unten das älteste Erledigte — die Zeile, die am wenigsten
    // jemanden interessiert.
    expect(groupIdea.findMany.mock.calls[0][0].orderBy).toEqual([
      { doneAt: { sort: 'desc', nulls: 'first' } },
      { createdAt: 'desc' },
    ]);
  });
});

describe('GroupIdeaService.update', () => {
  it('hakt ab und hält fest, wer es war', async () => {
    const { service, groupIdea } = setup({ doneAt: null });

    await service.update('hk', 'i1', { done: true }, member, {
      kind: 'versions',
      versions: [0],
    });

    expect(groupIdea.updateMany.mock.calls[0][0].data).toMatchObject({
      doneAt: expect.any(Date),
      doneByPersonId: 'p1',
    });
  });

  it('lässt den Zeitpunkt stehen, wenn sie schon abgehakt war', async () => {
    const already = new Date('2026-08-01T10:00:00Z');
    const { service, groupIdea } = setup({ doneAt: already });

    await service.update('hk', 'i1', { done: true, title: 'Neu' }, member, {
      kind: 'versions',
      versions: [1],
    });

    // Sonst wanderte sie bei jedem Speichern eines Titels wieder nach oben —
    // abgehakt wurde sie, als sie zum ersten Mal abgehakt wurde.
    const { data } = groupIdea.updateMany.mock.calls[0][0];
    expect(data.doneAt).toBeUndefined();
    expect(data.title).toBe('Neu');
  });

  it('öffnet sie wieder und nimmt den Namen mit', async () => {
    const { service, groupIdea } = setup({ doneAt: new Date() });

    await service.update('hk', 'i1', { done: false }, member, {
      kind: 'versions',
      versions: [1],
    });

    expect(groupIdea.updateMany.mock.calls[0][0].data).toMatchObject({
      doneAt: null,
      doneByPersonId: null,
    });
  });
});

describe('GroupIdeaService.remove', () => {
  it('lässt den Urheber löschen', async () => {
    const { service, groupIdea } = setup();
    groupIdea.findFirst.mockResolvedValue({ createdByPersonId: 'p1' });

    await service.remove('hk', 'i1', member);

    expect(groupIdea.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
  });

  it('lässt einen Admin löschen', async () => {
    const { service, groupIdea } = setup();
    groupIdea.findFirst.mockResolvedValue({ createdByPersonId: 'p1' });

    await service.remove('hk', 'i1', admin);

    expect(groupIdea.delete).toHaveBeenCalled();
  });

  it('verweist alle anderen auf den Haken', async () => {
    const { service, groupIdea } = setup();
    groupIdea.findFirst.mockResolvedValue({ createdByPersonId: 'jemand' });

    // Abhaken sagt etwas über die Welt („haben wir gemacht"), Löschen etwas
    // über die Liste („das wollten wir nie"). Das zweite gehört dem, der den
    // Eintrag gemacht hat.
    await expect(service.remove('hk', 'i1', member)).rejects.toThrow(
      ForbiddenException,
    );
    expect(groupIdea.delete).not.toHaveBeenCalled();
  });

  it('meldet eine Idee aus einem fremden Hauskreis als nicht vorhanden', async () => {
    const { service, groupIdea } = setup();
    groupIdea.findFirst.mockResolvedValue(null);

    await expect(service.remove('hk', 'fremd', admin)).rejects.toThrow(
      NotFoundException,
    );
  });
});

/**
 * Dieselbe Falle wie bei `birthdayGiftConfigResponseSchema`: Der
 * `EtagInterceptor` setzt `W/"<version>"` nur, wenn die **serialisierte**
 * Antwort ein `version` trägt. Fehlt es im Schema, schneidet der
 * `ResponseSerializerInterceptor` es weg — und das Schreiben scheitert dann
 * beim zweiten Speichern mit „jemand war schneller", obwohl niemand da war.
 */
describe('groupIdeaResponseSchema', () => {
  const idea = {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Grillabend',
    note: null,
    doneAt: null,
    doneBy: null,
    createdBy: null,
    createdAt: '2026-08-30T10:00:00.000Z',
    version: 2,
  };

  it('trägt die Version — sonst gibt es keinen brauchbaren ETag', () => {
    expect(groupIdeaResponseSchema.parse(idea).version).toBe(2);
  });

  it('lehnt eine Antwort ohne Version ab', () => {
    const { version: _version, ...ohne } = idea;
    expect(() => groupIdeaResponseSchema.parse(ohne)).toThrow(/version/);
  });
});
