import { ReleaseAnnouncementService } from './release-announcement.service';
import { latestRelease } from './releases';
// Type-only: hält den echten PrismaClient aus Jest heraus.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';

function setup() {
  const notificationLog = { findFirst: jest.fn().mockResolvedValue(null) };
  const person = { findMany: jest.fn().mockResolvedValue([]) };
  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, skipped: 0, pruned: 0, failed: 0 });

  const service = new ReleaseAnnouncementService(
    { notificationLog, person } as unknown as PrismaService,
    { notify } as unknown as NotificationService,
  );

  return { service, notificationLog, person, notify };
}

const release = latestRelease();

describe('ReleaseAnnouncementService', () => {
  it('kündigt die neueste Fassung allen an, die schon einmal da waren', async () => {
    const { service, person, notify } = setup();
    person.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);

    await expect(service.announceLatest()).resolves.toEqual({
      announced: true,
      recipients: 2,
    });

    // Offene Einladungen bleiben außen vor: Wer nie da war, hat kein Gerät
    // angemeldet — bekäme aber eine Zeile, die später als „schon
    // benachrichtigt" zählte.
    expect(person.findMany).toHaveBeenCalledWith({
      where: { active: true, acceptedAt: { not: null } },
      select: { id: true },
    });

    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'p1',
        type: 'RELEASE_NOTES',
        // Ohne dieses Feld wären alle `related*` leer, und die Entdopplung
        // ließe je Person genau eine Ankündigung durch — für immer.
        relatedReleaseVersion: release.version,
        payload: expect.objectContaining({
          url: `/neu?v=${release.version}`,
        }),
      }),
    );
  });

  /**
   * Der wichtigste Test hier.
   *
   * Die Entdopplung im `NotificationService` fragt „hat *diese Person* das
   * schon bekommen?". Danach allein bekäme jemand, der nächste Woche
   * dazukommt, beim nächsten Neustart eine Ankündigung für Funktionen, die für
   * ihn von Anfang an da waren.
   */
  it('kündigt eine Fassung nur ein einziges Mal an', async () => {
    const { service, notificationLog, person, notify } = setup();
    notificationLog.findFirst.mockResolvedValue({ id: 'log-1' });

    await expect(service.announceLatest()).resolves.toEqual({
      announced: false,
      recipients: 0,
    });

    expect(person.findMany).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('fragt nach genau dieser Fassung, nicht nach irgendeiner', async () => {
    const { service, notificationLog } = setup();

    await service.announceLatest();

    expect(notificationLog.findFirst).toHaveBeenCalledWith({
      where: {
        type: 'RELEASE_NOTES',
        relatedReleaseVersion: release.version,
      },
      select: { id: true },
    });
  });

  it('lässt ein stummes Gerät die anderen nicht aufhalten', async () => {
    const { service, person, notify } = setup();
    person.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    notify.mockRejectedValueOnce(new Error('Push kaputt'));

    await expect(service.announceLatest()).resolves.toEqual({
      announced: true,
      recipients: 2,
    });
    expect(notify).toHaveBeenCalledTimes(2);
  });

  /** Ohne Menschen gibt es nichts anzukündigen — und nichts zu protokollieren. */
  it('tut nichts, solange niemand da ist', async () => {
    const { service, notify } = setup();

    await expect(service.announceLatest()).resolves.toEqual({
      announced: false,
      recipients: 0,
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('bringt den Server nicht um, wenn die Ankündigung scheitert', async () => {
    const { service, notificationLog } = setup();
    notificationLog.findFirst.mockRejectedValue(new Error('DB weg'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});

describe('releases.ts', () => {
  it('hat eindeutige Versionen', () => {
    const versions = require('./releases').RELEASES.map(
      (entry: { version: string }) => entry.version,
    );
    expect(new Set(versions).size).toBe(versions.length);
  });

  /** Die Reihenfolge ist verbindlich: `latestRelease()` nimmt das erste. */
  it('steht neueste zuerst', () => {
    const dates = require('./releases').RELEASES.map(
      (entry: { date: string }) => entry.date,
    );
    expect(dates.toSorted().toReversed()).toEqual(dates);
  });
});
