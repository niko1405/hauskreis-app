/**
 * Gebetsanliegen: eines je Person und Abend, geschrieben nur von der Person,
 * der es gehört.
 *
 * **Die „nur die eigene"-Regel wird hier nicht geprüft, und das ist gewollt.**
 * Sie steht nicht im Dienst, sondern in der Route: `PUT …/prayer-requests/mine`
 * trägt keine Personen-Id, der Controller nimmt sie aus dem Token. Es gibt
 * nichts zu fälschen und damit auch nichts zu testen — genau der Grund, den
 * Endpunkt so zu schneiden. Was hier bleibt, sind die zwei Grenzen, die der
 * Dienst wirklich zieht: der Hauskreis und der Zeitpunkt.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrayerRequestService } from './prayer-request.service';
import type { PrismaService } from '../prisma/prisma.service';
import { withClock } from '../meeting/group-clock.testing';

const HEUTE = new Date('2026-08-04T12:00:00.000Z');
const KOMMENDER_DIENSTAG = new Date('2026-08-11T00:00:00.000Z');
const LETZTER_DIENSTAG = new Date('2026-07-28T00:00:00.000Z');

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(HEUTE);
});

afterAll(() => {
  jest.useRealTimers();
});

function setup(meeting: Record<string, unknown> | null) {
  const prisma = {
    meeting: { findFirst: jest.fn().mockResolvedValue(meeting) },
    meetingPrayerRequest: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  return {
    service: withClock(
      new PrayerRequestService(prisma as unknown as PrismaService),
    ),
    prisma,
  };
}

const offen = {
  date: KOMMENDER_DIENSTAG,
  status: 'PLANNED',
  hauskreisId: 'hk-1',
};

describe('PrayerRequestService.upsertMine', () => {
  it('legt eines an und schreibt ein vorhandenes um', async () => {
    const { service, prisma } = setup(offen);

    await service.upsertMine('hk-1', 'm1', { text: 'Für meine Mutter' }, 'p1');

    // Ein `upsert` und kein `create`: Genau eines je Person und Abend, und der
    // zweite Versuch ist eine Änderung, kein Fehler.
    expect(prisma.meetingPrayerRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { meetingId_personId: { meetingId: 'm1', personId: 'p1' } },
        create: { meetingId: 'm1', personId: 'p1', text: 'Für meine Mutter' },
        update: { text: 'Für meine Mutter' },
      }),
    );
  });

  /**
   * Die Mandantengrenze. Ohne sie ließe sich mit einer fremden `meetingId` in
   * einen anderen Hauskreis hineinschreiben — die Fremdschlüssel allein
   * erlauben das.
   */
  it('weist einen Termin ab, der nicht zu diesem Hauskreis gehört', async () => {
    const { service, prisma } = setup(null);

    await expect(
      service.upsertMine('hk-1', 'fremd', { text: 'x' }, 'p1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.meetingPrayerRequest.upsert).not.toHaveBeenCalled();
  });

  /**
   * Nach dem Abend bleibt stehen, was war. Ein Anliegen nachträglich
   * umzuschreiben hieße, die Geschichte zu ändern — für andere haben inzwischen
   * Leute gebetet.
   */
  it('lässt einen vergangenen Abend in Ruhe', async () => {
    const { service } = setup({ ...offen, date: LETZTER_DIENSTAG });

    await expect(
      service.upsertMine('hk-1', 'm1', { text: 'x' }, 'p1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sammelt für einen abgesagten Abend nichts mehr', async () => {
    const { service } = setup({ ...offen, status: 'CANCELLED' });

    await expect(
      service.upsertMine('hk-1', 'm1', { text: 'x' }, 'p1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PrayerRequestService.removeMine', () => {
  it('räumt nur die eigene Zeile weg', async () => {
    const { service, prisma } = setup(offen);

    await service.removeMine('hk-1', 'm1', 'p1');

    expect(prisma.meetingPrayerRequest.deleteMany).toHaveBeenCalledWith({
      where: { meetingId: 'm1', personId: 'p1' },
    });
  });

  /**
   * `deleteMany` statt `delete`, und deshalb kein Fehler: Wer zweimal auf den
   * Papierkorb tippt, hat nichts falsch gemacht.
   */
  it('beschwert sich nicht, wenn gar keines da war', async () => {
    const { service, prisma } = setup(offen);
    prisma.meetingPrayerRequest.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.removeMine('hk-1', 'm1', 'p1'),
    ).resolves.toBeUndefined();
  });

  it('lässt einen vergangenen Abend auch nicht aufräumen', async () => {
    const { service, prisma } = setup({ ...offen, date: LETZTER_DIENSTAG });

    await expect(service.removeMine('hk-1', 'm1', 'p1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.meetingPrayerRequest.deleteMany).not.toHaveBeenCalled();
  });
});

describe('PrayerRequestService.findAll', () => {
  /**
   * Lesen darf der ganze Hauskreis — dafür stehen sie da. Die einzige Grenze
   * ist die zum fremden Hauskreis, und die steht in der Abfrage selbst.
   */
  it('liest die Anliegen des Abends, an der Mandantengrenze entlang', async () => {
    const { service, prisma } = setup(offen);

    await service.findAll('hk-1', 'm1');

    expect(prisma.meetingPrayerRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { meetingId: 'm1', meeting: { hauskreisId: 'hk-1' } },
        orderBy: { createdAt: 'asc' },
      }),
    );
  });
});
