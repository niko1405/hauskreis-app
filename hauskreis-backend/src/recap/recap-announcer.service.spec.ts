/**
 * „Die Zusammenfassung vom 4. August ist da."
 *
 * Nur beim ersten Mal, je Feld, nur für den letzten begonnenen Abend und nicht
 * an den, der sie geschrieben hat.
 */
import { RecapAnnouncer, type RecapTexts } from './recap-announcer.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import { MeetingStatus, NotificationType } from '../../generated/prisma/enums';
import { withClock } from '../meeting/group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const TUESDAY = utc('2026-08-04');
/** Mittwochmorgen, Berliner Zeit — der Abend ist vorbei. */
const WEDNESDAY = new Date('2026-08-05T07:00:00.000Z');

const EMPTY: RecapTexts = { summary: null, actionstep: null };

function setup(
  options: {
    hasTopicSlot?: boolean;
    meeting?: Partial<{
      summaryText: string | null;
      actionstepText: string | null;
      status: MeetingStatus;
    }>;
    session?: { summaryText: string | null; actionstepText: string | null };
    /** Die Abende rückwärts ab heute, wie die Suche nach dem letzten sie sieht. */
    recent?: { id: string; date: Date; startMinutes: number }[];
  } = {},
) {
  const meeting = {
    id: 'm1',
    hauskreisId: 'hk-1',
    date: TUESDAY,
    status: MeetingStatus.PLANNED,
    hasTopicSlot: options.hasTopicSlot ?? false,
    summaryText: 'Wir haben über Dankbarkeit gesprochen',
    actionstepText: null,
    topicSession: options.session ?? null,
    ...options.meeting,
  };

  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });
  const personFindMany = jest
    .fn()
    .mockResolvedValue([{ id: 'anna' }, { id: 'chris' }]);

  const service = withClock(
    new RecapAnnouncer(
      {
        meeting: {
          findUnique: jest.fn().mockResolvedValue(meeting),
          findMany: jest
            .fn()
            .mockResolvedValue(
              options.recent ?? [
                { id: 'm1', date: TUESDAY, startMinutes: 1080 },
              ],
            ),
        },
        person: { findMany: personFindMany },
      } as unknown as PrismaService,
      { notify } as unknown as NotificationService,
      undefined as never,
    ),
  );

  return { service, notify, personFindMany };
}

function write(
  service: RecapAnnouncer,
  before: RecapTexts = EMPTY,
  source: 'meeting' | 'session' = 'meeting',
) {
  return service.afterWrite({
    meetingId: 'm1',
    actorPersonId: 'niko',
    source,
    before,
    now: WEDNESDAY,
  });
}

describe('RecapAnnouncer', () => {
  it('meldet die erste Zusammenfassung allen außer dem Autor', async () => {
    const { service, notify, personFindMany } = setup();

    await expect(write(service)).resolves.toBe(2);

    expect(personFindMany.mock.calls[0][0].where).toMatchObject({
      id: { not: 'niko' },
    });
    expect(notify.mock.calls[0][0]).toMatchObject({
      type: NotificationType.RECAP_ADDED,
      relatedMeetingId: 'm1',
      relatedKey: 'summary',
      payload: {
        title: 'Die Zusammenfassung vom 4. August ist da',
        body: 'Wir haben über Dankbarkeit gesprochen',
      },
    });
  });

  it('schweigt, wenn nur bearbeitet wurde', async () => {
    const { service, notify } = setup();

    await expect(
      write(service, { summary: 'Erste Fassung', actionstep: null }),
    ).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('meldet den Actionstep für sich, auch wenn die Zusammenfassung schon stand', async () => {
    const { service, notify } = setup({
      meeting: { actionstepText: 'Jeden Abend drei Dinge aufschreiben' },
    });

    await write(service, {
      summary: 'Wir haben über Dankbarkeit gesprochen',
      actionstep: null,
    });

    expect(notify.mock.calls.map((call) => call[0].relatedKey)).toEqual([
      'actionstep',
      'actionstep',
    ]);
    expect(notify.mock.calls[0][0].payload.title).toBe(
      'Der Actionstep vom 4. August steht',
    );
  });

  it('schweigt für einen Abend, der nicht der letzte ist', async () => {
    const { service, notify } = setup({
      recent: [
        { id: 'm2', date: utc('2026-08-05'), startMinutes: 360 },
        { id: 'm1', date: TUESDAY, startMinutes: 1080 },
      ],
    });

    await expect(write(service)).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('zählt einen Abend, der heute noch nicht begonnen hat, nicht als letzten', async () => {
    // Am Mittwoch um 9 steht der Mittwochabend um 18 Uhr schon im Kalender —
    // der letzte Abend ist trotzdem der vom Dienstag.
    const { service } = setup({
      recent: [
        { id: 'm2', date: utc('2026-08-05'), startMinutes: 1080 },
        { id: 'm1', date: TUESDAY, startMinutes: 1080 },
      ],
    });

    await expect(write(service)).resolves.toBe(2);
  });

  it('liest die Einheit, wenn der Abend ein Thema hat', async () => {
    const { service, notify } = setup({
      hasTopicSlot: true,
      session: { summaryText: 'Teil 2: Was Petrus tat', actionstepText: null },
    });

    await write(service, EMPTY, 'session');

    expect(notify.mock.calls[0][0].payload.body).toBe('Teil 2: Was Petrus tat');
  });

  it('schweigt über Text am Ort, der an diesem Abend nicht gilt', async () => {
    // Ein Abend mit Thema zeigt die Texte der Einheit — was in seiner eigenen
    // Nachbereitung steht, sieht dort niemand.
    const { service, notify } = setup({ hasTopicSlot: true });

    await expect(write(service, EMPTY, 'meeting')).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('schweigt für einen Entwurf ohne Abend', async () => {
    const { service, notify } = setup();

    await expect(
      service.afterWrite({
        meetingId: null,
        actorPersonId: 'niko',
        source: 'session',
        before: EMPTY,
      }),
    ).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });
});
