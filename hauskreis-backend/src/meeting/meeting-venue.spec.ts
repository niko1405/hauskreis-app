/**
 * Ort und Gastgeber sind eine Entscheidung.
 *
 * Geprüft wird über `update`, nicht über die private Methode: was zählt, ist
 * was am Ende in der Datenbank landet, und genau da ging es vorher auseinander.
 */
import { BadRequestException } from '@nestjs/common';
import { MeetingService } from './meeting.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import type { MeetingNotificationService } from './meeting-notification.service';
import type { IfMatchCondition } from '../common/http/etag';

/** Diese Endpunkte verlangen eine Vorbedingung; hier interessiert sie nicht. */
const EGAL: IfMatchCondition = { kind: 'any' };

const HEUTE = new Date('2026-08-03T00:00:00.000Z');
const KOMMENDER_DIENSTAG = new Date('2026-08-11T00:00:00.000Z');
const LETZTER_DIENSTAG = new Date('2026-07-28T00:00:00.000Z');

/** Ein Termin, wie `findOne` ihn liefert — nur die Felder, um die es geht. */
function meeting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    hauskreisId: 'hk1',
    date: KOMMENDER_DIENSTAG,
    status: 'PLANNED',
    hostPersonId: null,
    locationId: null,
    location: null,
    ...overrides,
  };
}

function setup(before = meeting()) {
  const state = { current: before };

  const prisma = {
    meeting: {
      findFirst: jest.fn(() => Promise.resolve(state.current)),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    person: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    location: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    topic: { findFirst: jest.fn() },
  };

  const notifications = { announceCancellation: jest.fn() };

  const service = new MeetingService(
    prisma as unknown as PrismaService,
    {} as unknown as RoleSuggestionService,
    notifications as unknown as MeetingNotificationService,
  );

  return { service, prisma, notifications, state };
}

/** Was `updateMany` schreiben wollte. */
function written(prisma: ReturnType<typeof setup>['prisma']) {
  return prisma.meeting.updateMany.mock.calls[0]?.[0].data as Record<
    string,
    unknown
  >;
}

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(HEUTE);
});

afterAll(() => {
  jest.useRealTimers();
});

describe('MeetingService.update — Ort folgt dem Gastgeber', () => {
  it('übernimmt beim Eintragen eines Gastgebers dessen Zuhause', async () => {
    const { service, prisma } = setup();
    prisma.person.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.person.findFirstOrThrow.mockResolvedValue({
      name: 'Niko',
      locationId: 'l-niko',
    });

    await service.update('hk1', 'm1', { hostPersonId: 'p1' }, EGAL);

    expect(written(prisma)).toMatchObject({
      hostPersonId: 'p1',
      locationId: 'l-niko',
    });
  });

  it('weist einen Gastgeber ohne Adresse ab', async () => {
    const { service, prisma } = setup();
    prisma.person.findFirst.mockResolvedValue({ id: 'p2' });
    prisma.person.findFirstOrThrow.mockResolvedValue({
      name: 'Mira',
      locationId: null,
    });

    await expect(
      service.update('hk1', 'm1', { hostPersonId: 'p2' }, EGAL),
    ).rejects.toThrow(/Mira hat keine Adresse/);
    expect(prisma.meeting.updateMany).not.toHaveBeenCalled();
  });

  it('weist einen Ort ab, der dem Gastgeber widerspricht', async () => {
    const { service, prisma } = setup();
    prisma.person.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.person.findFirstOrThrow.mockResolvedValue({
      name: 'Niko',
      locationId: 'l-niko',
    });
    prisma.location.findFirst.mockResolvedValue({ id: 'l-park' });

    await expect(
      service.update(
        'hk1',
        'm1',
        {
          hostPersonId: 'p1',
          locationId: 'l-park',
        },
        EGAL,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('lässt einen Ort ohne Gastgeber zu', async () => {
    const { service, prisma } = setup();
    prisma.location.findFirst.mockResolvedValue({ id: 'l-park' });
    prisma.location.findFirstOrThrow.mockResolvedValue({
      name: 'Schlosspark',
      requiresHost: false,
    });

    await service.update('hk1', 'm1', { locationId: 'l-park' }, EGAL);

    expect(written(prisma)).toMatchObject({ locationId: 'l-park' });
  });

  it('weist eine fremde Wohnung als Ort ab', async () => {
    const { service, prisma } = setup();
    prisma.location.findFirst.mockResolvedValue({ id: 'l-chris' });
    prisma.location.findFirstOrThrow.mockResolvedValue({
      name: 'Bei Chris',
      requiresHost: true,
    });

    await expect(
      service.update('hk1', 'm1', { locationId: 'l-chris' }, EGAL),
    ).rejects.toThrow(/trag die Person als Gastgeber ein/);
  });

  it('räumt die Wohnung mit weg, wenn der Gastgeber geht', async () => {
    const { service, prisma } = setup(
      meeting({
        hostPersonId: 'p1',
        locationId: 'l-niko',
        location: { requiresHost: true },
      }),
    );

    await service.update('hk1', 'm1', { hostPersonId: null }, EGAL);

    expect(written(prisma)).toMatchObject({
      hostPersonId: null,
      locationId: null,
    });
  });

  it('lässt einen Treffpunkt stehen, wenn der Gastgeber geht', async () => {
    // Der Park hing nie am Gastgeber — ihn mitzulöschen wäre Datenverlust.
    const { service, prisma } = setup(
      meeting({
        hostPersonId: 'p1',
        locationId: 'l-park',
        location: { requiresHost: false },
      }),
    );

    await service.update('hk1', 'm1', { hostPersonId: null }, EGAL);

    expect(written(prisma)).toMatchObject({
      hostPersonId: null,
      locationId: undefined,
    });
  });

  it('weist einen Ortswechsel ab, solange ein Gastgeber eingetragen ist', async () => {
    const { service, prisma } = setup(
      meeting({
        hostPersonId: 'p1',
        locationId: 'l-niko',
        location: { requiresHost: true },
      }),
    );
    prisma.person.findFirstOrThrow.mockResolvedValue({
      name: 'Niko',
      locationId: 'l-niko',
    });
    prisma.location.findFirst.mockResolvedValue({ id: 'l-park' });

    await expect(
      service.update('hk1', 'm1', { locationId: 'l-park' }, EGAL),
    ).rejects.toThrow(/Nimm erst den Gastgeber heraus/);
  });
});

describe('MeetingService — Absage vergangener Abende', () => {
  it('benachrichtigt bei einem kommenden Termin', async () => {
    const { service, notifications } = setup();

    await service.cancel('hk1', 'm1', EGAL);

    expect(notifications.announceCancellation).toHaveBeenCalledWith('m1');
  });

  it('bleibt bei einem vergangenen Termin still', async () => {
    const { service, notifications } = setup(
      meeting({ date: LETZTER_DIENSTAG }),
    );

    await service.cancel('hk1', 'm1', EGAL);

    expect(notifications.announceCancellation).not.toHaveBeenCalled();
  });

  it('zählt den heutigen Abend noch als kommend', async () => {
    const { service, notifications } = setup(meeting({ date: HEUTE }));

    await service.cancel('hk1', 'm1', EGAL);

    expect(notifications.announceCancellation).toHaveBeenCalled();
  });

  it('bleibt auch beim Statuswechsel über update still', async () => {
    const { service, notifications } = setup(
      meeting({ date: LETZTER_DIENSTAG }),
    );

    await service.update('hk1', 'm1', { status: 'CANCELLED' }, EGAL);

    expect(notifications.announceCancellation).not.toHaveBeenCalled();
  });
});
