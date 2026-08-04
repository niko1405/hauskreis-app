import { ConflictException } from '@nestjs/common';
import { LocationService } from './location.service';
// Type-only: keeps Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';

type LocationDelegate = {
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
  create: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
};

/** `meetingsHere` ist die Zahl der Abende, die an dem Ort stattfanden. */
function setup(meetingsHere = 0) {
  const location: LocationDelegate = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  const meeting = { count: jest.fn().mockResolvedValue(meetingsHere) };

  const service = new LocationService({
    location,
    meeting,
  } as unknown as PrismaService);

  return { service, location, meeting };
}

const residents = (...names: string[]) =>
  names.map((name, index) => ({ id: `p${index}`, name }));

describe('LocationService.syncHomeName', () => {
  it('benennt die Wohnung nach ihren Bewohner:innen', async () => {
    const { service, location } = setup();
    location.findUnique.mockResolvedValue({
      id: 'l1',
      requiresHost: true,
      active: true,
      residents: residents('Niko', 'Chris'),
    });

    await service.syncHomeName('l1');

    expect(location.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Bei Niko & Chris' }),
      }),
    );
  });

  it('legt eine Wohnung still, aus der alle ausgezogen sind', async () => {
    // Hier war die Gruppe schon zu Gast — der Abend im Archiv braucht sie noch.
    const { service, location } = setup(3);
    location.findUnique.mockResolvedValue({
      id: 'l1',
      requiresHost: true,
      active: true,
      residents: [],
    });

    await service.syncHomeName('l1');

    expect(location.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ active: false }),
      }),
    );
    expect(location.delete).not.toHaveBeenCalled();
  });

  it('löscht eine Wohnung, in der nie ein Abend war', async () => {
    const { service, location } = setup(0);
    location.findUnique.mockResolvedValue({
      id: 'l1',
      requiresHost: true,
      active: true,
      residents: [],
    });

    await service.syncHomeName('l1');

    expect(location.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    expect(location.update).not.toHaveBeenCalled();
  });

  it('holt eine Wohnung zurück, in die wieder jemand einzieht', async () => {
    const { service, location } = setup();
    location.findUnique.mockResolvedValue({
      id: 'l1',
      requiresHost: true,
      active: false,
      residents: residents('Sofie'),
    });

    await service.syncHomeName('l1');

    expect(location.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Bei Sofie', active: true }),
      }),
    );
  });

  it('lässt Treffpunkte in Ruhe — deren Name ist frei gewählt', async () => {
    const { service, location } = setup();
    location.findUnique.mockResolvedValue({
      id: 'l1',
      requiresHost: false,
      active: true,
      residents: [],
    });

    await service.syncHomeName('l1');

    expect(location.update).not.toHaveBeenCalled();
  });
});

describe('LocationService.remove', () => {
  it('weigert sich, eine bewohnte Wohnung aufzulösen', async () => {
    const { service, location } = setup();
    location.findFirst.mockResolvedValue({
      id: 'l1',
      name: 'Bei Niko',
      residents: residents('Niko'),
    });

    await expect(service.remove('hk', 'l1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(location.update).not.toHaveBeenCalled();
  });

  it('legt einen Treffpunkt still, an dem Abende waren', async () => {
    const { service, location } = setup(2);
    location.findFirst.mockResolvedValue({
      id: 'l1',
      name: 'Schlosspark',
      residents: [],
    });

    await expect(service.remove('hk', 'l1')).resolves.toEqual({
      deleted: false,
    });

    expect(location.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'l1' },
        data: expect.objectContaining({ active: false }),
      }),
    );
  });

  it('löscht einen Treffpunkt, an dem nie einer war', async () => {
    // Der Normalfall beim Vertippen: angelegt, Name falsch, nie benutzt. Ein
    // stillgelegter Ort ohne Geschichte ist bloß eine Karteileiche.
    const { service, location } = setup(0);
    location.findFirst.mockResolvedValue({
      id: 'l1',
      name: 'Schlosspark',
      residents: [],
    });

    await expect(service.remove('hk', 'l1')).resolves.toEqual({
      deleted: true,
    });

    expect(location.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    expect(location.update).not.toHaveBeenCalled();
  });
});

describe('LocationService.purgeAbandoned', () => {
  it('räumt stillgelegte Orte ohne Termine weg', async () => {
    const { service, location } = setup();
    location.findMany.mockResolvedValue([{ id: 'l1' }, { id: 'l2' }]);
    location.deleteMany.mockResolvedValue({ count: 2 });

    await expect(service.purgeAbandoned('hk')).resolves.toEqual({ deleted: 2 });

    expect(location.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['l1', 'l2'] } },
    });
  });

  it('fasst nichts an, wenn es nichts wegzuräumen gibt', async () => {
    const { service, location } = setup();
    location.findMany.mockResolvedValue([]);

    await expect(service.purgeAbandoned('hk')).resolves.toEqual({ deleted: 0 });

    expect(location.deleteMany).not.toHaveBeenCalled();
  });
});

describe('LocationService.create', () => {
  it('weist eine zweite Wohnung unter derselben Anschrift ab', async () => {
    const { service, location } = setup();
    location.findFirst.mockResolvedValue({ id: 'l1', name: 'Bei Niko' });

    await expect(
      service.create('hk', {
        name: 'Nochmal',
        address: 'Marienstr. 35, 76137 Karlsruhe',
        hostWeight: 1,
        requiresHost: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('legt den normalisierten Schlüssel mit an', async () => {
    const { service, location } = setup();
    location.findFirst.mockResolvedValue(null);
    location.create.mockResolvedValue({ id: 'l2' });

    await service.create('hk', {
      name: 'Schlosspark',
      address: 'Schlossbezirk 10, 76131 Karlsruhe',
      hostWeight: 0,
      requiresHost: false,
    });

    expect(location.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          addressKey: 'schlossbezirk1076131karlsruhe',
        }),
      }),
    );
  });
});
