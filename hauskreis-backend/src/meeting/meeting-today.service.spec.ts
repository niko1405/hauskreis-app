import { MeetingTodayService } from './meeting-today.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import {
  AttendanceStatus,
  NotificationType,
} from '../../generated/prisma/enums';
import { withClock } from './group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Dienstagvormittag — der Lauf feuert um neun. */
const HEUTE = new Date('2026-08-11T07:00:00.000Z');

function setup(
  options: {
    meeting?: {
      id: string;
      title?: string | null;
      special?: boolean;
      startMinutes: number;
      location: { name: string } | null;
      attendances: { personId: string; status: AttendanceStatus }[];
    } | null;
    people?: string[];
  } = {},
) {
  const abend =
    options.meeting === undefined
      ? {
          id: 'm-1',
          title: null,
          special: false,
          startMinutes: 1080,
          // So heißt ein Zuhause wirklich (`homeName`).
          location: { name: 'Bei Chris' },
          attendances: [
            { personId: 'anna', status: AttendanceStatus.ATTENDING },
            { personId: 'chris', status: AttendanceStatus.ABSENT },
          ],
        }
      : options.meeting;

  const findFirst = jest.fn().mockResolvedValue(abend);
  const findManyPeople = jest
    .fn()
    .mockResolvedValue(
      (options.people ?? ['anna', 'chris', 'lena']).map((id) => ({ id })),
    );

  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });

  const service = withClock(
    new MeetingTodayService(
      {
        meeting: { findFirst },
        person: { findMany: findManyPeople },
      } as unknown as PrismaService,
      { notify } as unknown as NotificationService,
      undefined as never,
    ),
  );

  return { service, findFirst, notify };
}

describe('MeetingTodayService.sendDueReminders', () => {
  it('fragt jede Person passend zu ihrer eigenen Antwort', async () => {
    const { service, notify } = setup();

    const result = await service.sendDueReminders('hk-1', { now: HEUTE });

    const texte = new Map(
      notify.mock.calls.map((call) => [call[0].personId, call[0].payload.body]),
    );

    expect(texte.get('anna')).toBe('Heute um 18:00 bei Chris. Bis später!');
    // Der eigentliche Punkt: Wer abgesagt hat, wird noch einmal gefragt — am
    // Termintag ändern sich die Zusagen.
    expect(texte.get('chris')).toBe(
      'Heute um 18:00 bei Chris. Du hast abgesagt — stimmt das noch?',
    );
    // Keine Zeile heißt „weiß noch nicht", nicht „nicht gemeint" — und so
    // steht es auch in der Anwesenheitsliste.
    expect(texte.get('lena')).toBe(
      'Heute um 18:00 bei Chris. Du stehst auf „Unsicher" — bist du dabei?',
    );
    expect(result.notified).toBe(3);
  });

  /**
   * Ein Zuhause heißt schon „Bei …" — ein „bei" davor ergab „bei Bei Niko".
   * Der Name trägt auch die Mitbewohner:innen, die der Gastgeber allein nicht
   * nennte.
   */
  it('schreibt ein Zuhause nicht doppelt mit „bei"', async () => {
    const { service, notify } = setup({
      meeting: {
        id: 'm-1',
        startMinutes: 1080,
        location: { name: 'Bei Niko & Chris' },
        attendances: [{ personId: 'anna', status: AttendanceStatus.ATTENDING }],
      },
      people: ['anna'],
    });

    await service.sendDueReminders('hk-1', { now: HEUTE });

    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Heute um 18:00 bei Niko & Chris. Bis später!',
    );
  });

  it('setzt vor einen Treffpunkt keine Präposition', async () => {
    const { service, notify } = setup({
      meeting: {
        id: 'm-1',
        startMinutes: 1140,
        location: { name: 'Schlosspark' },
        attendances: [{ personId: 'anna', status: AttendanceStatus.ATTENDING }],
      },
      people: ['anna'],
    });

    await service.sendDueReminders('hk-1', { now: HEUTE });

    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Heute um 19:00 — Schlosspark. Bis später!',
    );
  });

  it('nennt statt eines Ortes, dass er offen ist', async () => {
    const { service, notify } = setup({
      meeting: {
        id: 'm-1',
        startMinutes: 1140,
        location: null,
        attendances: [],
      },
      people: ['anna'],
    });

    await service.sendDueReminders('hk-1', { now: HEUTE });

    // Der Satz endet mit einer Frage — ohne Punkt dahinter. Dass heute
    // Hauskreis ist, sagt die Überschrift.
    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Heute um 19:00 — der Ort ist noch offen! Wo treffen wir uns? Du stehst auf „Unsicher" — bist du dabei?',
    );
  });

  it('betitelt einen gewöhnlichen Abend mit „Heute ist Hauskreis"', async () => {
    const { service, notify } = setup();

    await service.sendDueReminders('hk-1', { now: HEUTE });

    expect(notify.mock.calls[0][0].payload.title).toBe('Heute ist Hauskreis');
  });

  /**
   * „Heute ist Hauskreis" über einer Freizeit klang, als hätte die App nicht
   * hingesehen — mit eigenem Titel steht der da.
   */
  it('nennt einen Termin mit Titel beim Namen', async () => {
    const { service, notify } = setup({
      meeting: {
        id: 'm-1',
        title: 'Outreach & Chillout',
        special: true,
        startMinutes: 690,
        location: { name: 'Bei Elisha & Eric' },
        attendances: [{ personId: 'anna', status: AttendanceStatus.ATTENDING }],
      },
      people: ['anna'],
    });

    await service.sendDueReminders('hk-1', { now: HEUTE });

    expect(notify.mock.calls[0][0].payload).toMatchObject({
      title: 'Outreach & Chillout',
      body: 'Heute um 11:30 bei Elisha & Eric. Bis später!',
    });
  });

  it('nennt einen besonderen Termin ohne Titel nicht „Hauskreis"', async () => {
    const { service, notify } = setup({
      meeting: {
        id: 'm-1',
        title: null,
        special: true,
        startMinutes: 1080,
        location: null,
        attendances: [],
      },
      people: ['anna'],
    });

    await service.sendDueReminders('hk-1', { now: HEUTE });

    expect(notify.mock.calls[0][0].payload.title).toBe(
      'Heute ist ein besonderer Termin',
    );
  });

  it('sucht nur den heutigen Abend', async () => {
    const { service, findFirst } = setup();

    await service.sendDueReminders('hk-1', { now: HEUTE });

    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      hauskreisId: 'hk-1',
      date: utc('2026-08-11'),
      status: 'PLANNED',
    });
  });

  it('schweigt an einem Tag ohne Termin', async () => {
    const { service, notify } = setup({ meeting: null });

    const result = await service.sendDueReminders('hk-1', { now: HEUTE });

    expect(notify).not.toHaveBeenCalled();
    expect(result).toEqual({ notified: 0, skipped: 0 });
  });

  /**
   * Der Merkposten hängt am Termin, nicht am Tag: Ein mehrtägiger Termin meldet
   * sich einmal, nicht an jedem Morgen.
   */
  it('hängt die Entdopplung an den Termin', async () => {
    const { service, notify } = setup();

    await service.sendDueReminders('hk-1', { now: HEUTE });

    expect(notify.mock.calls[0][0]).toMatchObject({
      type: NotificationType.MEETING_TODAY,
      relatedMeetingId: 'm-1',
    });
  });
});
