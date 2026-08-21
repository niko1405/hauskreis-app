/**
 * Wer nicht da ist, bekommt keine Rolle — und wer eine hatte und dann absagt,
 * gibt sie zurück.
 *
 * Beides gehört zusammen: ohne die zweite Hälfte hätte die erste ein Loch, durch
 * das man mühelos hindurchfällt (erst eintragen, dann absagen), und das ist der
 * wahrscheinlichere Weg von beiden.
 */
import { BadRequestException } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { RoleReleaseService } from '../meeting/role-release.service';
import type { TopicLinkService } from '../topic/topic-link.service';
import type { PrismaService } from '../prisma/prisma.service';
import { withClock } from '../meeting/group-clock.testing';

const HEUTE = new Date('2026-08-04T00:00:00.000Z');
const NAECHSTER_DIENSTAG = new Date('2026-08-11T00:00:00.000Z');
const LETZTER_DIENSTAG = new Date('2026-07-28T00:00:00.000Z');

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(HEUTE);
});

afterAll(() => {
  jest.useRealTimers();
});

const LEUTE = [
  { id: 'p1', name: 'Niko' },
  { id: 'p2', name: 'Mira' },
];

function setupAvailability(
  options: {
    date?: Date;
    declinedIds?: string[];
    /** Wer für diesen Abend von Hand zugesagt hat. */
    selfAttendingIds?: string[];
    periods?: { personId: string; startDate: Date; endDate: Date }[];
    /** Wer noch nicht angenommen hat — für `assertArrived`. */
    pendingIds?: string[];
  } = {},
) {
  const prisma = {
    meeting: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ date: options.date ?? NAECHSTER_DIENSTAG }),
    },
    meetingAttendance: {
      findMany: jest.fn().mockResolvedValue([
        ...(options.declinedIds ?? []).map((personId) => ({
          personId,
          status: 'ABSENT',
          source: 'SELF',
        })),
        ...(options.selfAttendingIds ?? []).map((personId) => ({
          personId,
          status: 'ATTENDING',
          source: 'SELF',
        })),
      ]),
    },
    absencePeriod: {
      findMany: jest.fn().mockResolvedValue(options.periods ?? []),
    },
    person: {
      // Zwei Fragen an dieselbe Tabelle, und sie brauchen verschiedene
      // Antworten: `assertArrived` fragt nach offenen Einladungen
      // (`acceptedAt: null`), `findUnavailable` nach Namen für die Meldung.
      // Eine feste Antwort ließe jeden Test an der Einladungsprüfung scheitern.
      findMany: jest.fn((args: { where: { acceptedAt?: null } }) =>
        Promise.resolve(
          args.where.acceptedAt === null
            ? LEUTE.filter((person) =>
                (options.pendingIds ?? []).includes(person.id),
              )
            : LEUTE,
        ),
      ),
    },
  };

  return {
    service: withClock(
      new AvailabilityService(prisma as unknown as PrismaService),
    ),
    prisma,
  };
}

describe('AvailabilityService.assertAvailable', () => {
  it('lässt durch, wer nicht abgesagt hat', async () => {
    const { service } = setupAvailability();

    await expect(
      service.assertAvailable('hk', 'm1', ['p1']),
    ).resolves.toBeUndefined();
  });

  it('weist ab, wer für diesen Abend abgesagt hat', async () => {
    const { service } = setupAvailability({ declinedIds: ['p1'] });

    await expect(service.assertAvailable('hk', 'm1', ['p1'])).rejects.toThrow(
      /Niko ist an diesem Abend nicht dabei/,
    );
  });

  it('weist auch ab, wer in dem Zeitraum verreist ist', async () => {
    const { service } = setupAvailability({
      periods: [
        {
          personId: 'p2',
          startDate: new Date('2026-08-09T00:00:00.000Z'),
          endDate: new Date('2026-08-16T00:00:00.000Z'),
        },
      ],
    });

    await expect(service.assertAvailable('hk', 'm1', ['p2'])).rejects.toThrow(
      /Mira ist an diesem Abend nicht dabei/,
    );
  });

  /**
   * Der Fall, den jemand tatsächlich hatte: Urlaub eingetragen, für einen
   * einzelnen Abend daraus aber wieder zugesagt — und trotzdem aus jeder
   * Vorschlagsliste gefallen, weil der Zeitraum getrennt gefragt wurde.
   */
  it('lässt durch, wer aus dem Zeitraum heraus ausdrücklich zusagt', async () => {
    const { service } = setupAvailability({
      selfAttendingIds: ['p2'],
      periods: [
        {
          personId: 'p2',
          startDate: new Date('2026-08-09T00:00:00.000Z'),
          endDate: new Date('2026-08-16T00:00:00.000Z'),
        },
      ],
    });

    await expect(
      service.assertAvailable('hk', 'm1', ['p2']),
    ).resolves.toBeUndefined();
  });

  /** Die Absage bleibt die Absage — auch als eigene Antwort. */
  it('weist trotzdem ab, wer für den Abend abgesagt hat', async () => {
    const { service } = setupAvailability({
      declinedIds: ['p2'],
      periods: [
        {
          personId: 'p2',
          startDate: new Date('2026-08-09T00:00:00.000Z'),
          endDate: new Date('2026-08-16T00:00:00.000Z'),
        },
      ],
    });

    await expect(service.assertAvailable('hk', 'm1', ['p2'])).rejects.toThrow(
      /Mira ist an diesem Abend nicht dabei/,
    );
  });

  it('nennt beide Namen, wenn beide fehlen', async () => {
    const { service } = setupAvailability({ declinedIds: ['p1', 'p2'] });

    await expect(
      service.assertAvailable('hk', 'm1', ['p1', 'p2']),
    ).rejects.toThrow(/Niko, Mira sind/);
  });

  it('wirft `BadRequestException`, nicht irgendetwas', async () => {
    const { service } = setupAvailability({ declinedIds: ['p1'] });

    await expect(
      service.assertAvailable('hk', 'm1', ['p1']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // Nachtragen ist Buchführung, keine Planung: wer damals absagte, kann trotzdem
  // gehostet haben, weil er doch noch kam.
  it('lässt einen vergangenen Abend in Ruhe nachtragen', async () => {
    const { service } = setupAvailability({
      date: LETZTER_DIENSTAG,
      declinedIds: ['p1'],
    });

    await expect(
      service.assertAvailable('hk', 'm1', ['p1']),
    ).resolves.toBeUndefined();
  });

  /**
   * Zwei Gründe, keine Rolle übernehmen zu können, und sie sind verschieden
   * groß: „an diesem Abend nicht da" gilt für einen Abend, „war überhaupt noch
   * nie da" für die Person. Eine offene Einladung hat weder Zusage noch
   * Benachrichtigung noch eine Ahnung von der Zuteilung.
   */
  it('weist ab, wer die Einladung noch nicht angenommen hat', async () => {
    const { service } = setupAvailability({ pendingIds: ['p1'] });

    await expect(service.assertAvailable('hk', 'm1', ['p1'])).rejects.toThrow(
      /Niko hat die Einladung noch nicht angenommen/,
    );
  });

  /**
   * Und anders als die Abwesenheit auch **rückwirkend**: Nachtragen ändert
   * nichts daran, dass da niemand war.
   */
  it('lässt eine offene Einladung auch nicht nachtragen', async () => {
    const { service } = setupAvailability({
      date: LETZTER_DIENSTAG,
      pendingIds: ['p1'],
    });

    await expect(
      service.assertAvailable('hk', 'm1', ['p1']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fragt gar nicht erst, wenn niemand genannt ist', async () => {
    const { service, prisma } = setupAvailability();

    await service.assertAvailable('hk', 'm1', []);

    expect(prisma.meeting.findFirst).not.toHaveBeenCalled();
  });
});

function setupRelease(
  meeting: Record<string, unknown> | null = {
    id: 'm1',
    date: NAECHSTER_DIENSTAG,
    status: 'PLANNED',
    hostPersonId: 'p1',
    locationId: 'l-niko',
    // Seit Testimony eine Rolle ist, liest der Dienst auch dieses Feld. Ohne
    // es hier wäre `undefined === personId` zwar falsch, aber der Test sagte
    // nichts darüber, dass das Feld überhaupt gelesen wird.
    testimonyPersonId: null,
    location: { requiresHost: true },
  },
) {
  const db = {
    meeting: {
      findUnique: jest.fn().mockResolvedValue(meeting),
      update: jest.fn().mockResolvedValue({}),
      // Die Musik-Zuteilung steht mit in der Antwort des Termins; fällt sie
      // weg, ohne dass oben schon geschrieben wurde, springt hier die Version.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    meetingSongLeader: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      // Für `clearSongSelectionIfUnled`: Wer nach dem Löschen noch zuständig
      // ist. Leer heißt „niemand mehr", also wird die Auswahl zurückgenommen.
      findMany: jest.fn().mockResolvedValue([]),
    },
    meetingSong: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };

  const prisma = {
    ...db,
    $transaction: (run: (tx: typeof db) => unknown) => run(db),
  };

  // Die Themen-Rolle liegt in einer eigenen Tabelle und wird über den
  // gemeinsamen Dienst freigegeben — hier als Attrappe, seine eigene Logik
  // steht in `topic-link.service.spec.ts`.
  const topicLinks = { releaseFor: jest.fn().mockResolvedValue(false) };

  return {
    service: withClock(
      new RoleReleaseService(
        prisma as unknown as PrismaService,
        topicLinks as unknown as TopicLinkService,
      ),
    ),
    prisma: db,
    topicLinks,
  };
}

describe('RoleReleaseService.releaseFor', () => {
  it('räumt Gastgeber und dessen Wohnung weg', async () => {
    const { service, prisma } = setupRelease();

    await expect(service.releaseFor('m1', 'p1')).resolves.toEqual({
      host: true,
      song: false,
      testimony: false,
      topic: false,
    });

    expect(prisma.meeting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hostPersonId: null,
          locationId: null,
        }),
      }),
    );
  });

  it('lässt einen Treffpunkt stehen — der hing nie am Gastgeber', async () => {
    const { service, prisma } = setupRelease({
      id: 'm1',
      date: NAECHSTER_DIENSTAG,
      status: 'PLANNED',
      hostPersonId: 'p1',
      locationId: 'l-park',
      testimonyPersonId: null,
      location: { requiresHost: false },
    });

    await service.releaseFor('m1', 'p1');

    expect(prisma.meeting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ locationId: undefined }),
      }),
    );
  });

  it('fasst den Gastgeber nicht an, wenn jemand anders absagt', async () => {
    const { service, prisma } = setupRelease();

    await expect(service.releaseFor('m1', 'p2')).resolves.toEqual({
      host: false,
      song: false,
      testimony: false,
      topic: false,
    });

    expect(prisma.meeting.update).not.toHaveBeenCalled();
  });

  it('meldet die Musik, wenn eine Zeile wegfiel', async () => {
    const { service, prisma } = setupRelease({
      id: 'm1',
      date: NAECHSTER_DIENSTAG,
      status: 'PLANNED',
      hostPersonId: null,
      locationId: null,
      testimonyPersonId: null,
      location: null,
    });
    prisma.meetingSongLeader.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.releaseFor('m1', 'p2')).resolves.toEqual({
      host: false,
      song: true,
      testimony: false,
      topic: false,
    });
  });

  /** Wer nicht kommt, erzählt an dem Abend nichts. */
  it('gibt das Testimony frei, wenn die erzählende Person absagt', async () => {
    const { service, prisma } = setupRelease({
      id: 'm1',
      date: NAECHSTER_DIENSTAG,
      status: 'PLANNED',
      hostPersonId: null,
      locationId: null,
      testimonyPersonId: 'p2',
      location: null,
    });

    await expect(service.releaseFor('m1', 'p2')).resolves.toEqual({
      host: false,
      song: false,
      testimony: true,
      topic: false,
    });

    expect(prisma.meeting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ testimonyPersonId: null }),
      }),
    );
  });

  /**
   * Bis vor Kurzem blieb das Thema stehen, weil die Zuständigkeit am *Thema*
   * hing und nicht am Abend. Jetzt ist es eine Zuteilung wie die anderen drei.
   */
  it('gibt auch die Themen-Rolle frei', async () => {
    const { service, topicLinks } = setupRelease();
    topicLinks.releaseFor.mockResolvedValue(true);

    await expect(service.releaseFor('m1', 'p1')).resolves.toMatchObject({
      topic: true,
    });
    expect(topicLinks.releaseFor).toHaveBeenCalledWith('m1', 'p1');
  });

  it('lässt einen vergangenen Abend unberührt', async () => {
    const { service, prisma, topicLinks } = setupRelease({
      id: 'm1',
      date: LETZTER_DIENSTAG,
      status: 'PLANNED',
      hostPersonId: 'p1',
      locationId: 'l-niko',
      location: { requiresHost: true },
    });

    await service.releaseFor('m1', 'p1');

    expect(prisma.meeting.update).not.toHaveBeenCalled();
    expect(prisma.meetingSongLeader.deleteMany).not.toHaveBeenCalled();
    expect(topicLinks.releaseFor).not.toHaveBeenCalled();
  });

  // Ein abgesagter Abend hat keine Rollen mehr zu vergeben, und ihn beim
  // Wiederaufleben leer vorzufinden wäre die schlechtere Überraschung.
  it('lässt einen abgesagten Abend unberührt', async () => {
    const { service, prisma } = setupRelease({
      id: 'm1',
      date: NAECHSTER_DIENSTAG,
      status: 'CANCELLED',
      hostPersonId: 'p1',
      locationId: 'l-niko',
      location: { requiresHost: true },
    });

    await service.releaseFor('m1', 'p1');

    expect(prisma.meeting.update).not.toHaveBeenCalled();
  });
});

/**
 * Verlassen ist etwas anderes als absagen — und deshalb greift hier auch mehr
 * zu als bei einer einzelnen Absage.
 */
function setupLeaving(
  meetings: {
    id: string;
    hostPersonId: string | null;
    requiresHost?: boolean;
  }[],
) {
  const meetingUpdate = jest.fn().mockResolvedValue({});
  const meetingTouch = jest.fn().mockResolvedValue({ count: 0 });
  const deletes: Record<string, unknown> = {};

  const batch = (name: string, count: number) =>
    jest.fn((args: { where: unknown }) => {
      deletes[name] = args.where;
      return Promise.resolve({ count });
    });

  const prisma = {
    meeting: {
      findMany: jest.fn().mockResolvedValue(
        meetings.map((meeting) => ({
          id: meeting.id,
          hostPersonId: meeting.hostPersonId,
          location:
            meeting.requiresHost === undefined
              ? null
              : { requiresHost: meeting.requiresHost },
        })),
      ),
      update: meetingUpdate,
      // Wer geht, verschwindet aus jeder Anwesenheits- und Rollenliste an jedem
      // kommenden Abend — deshalb springt dort die Version, auch wo sonst
      // nichts geschrieben wurde.
      updateMany: meetingTouch,
    },
    meetingSongLeader: {
      deleteMany: batch('song', 1),
      // Danach ist an keinem Abend mehr jemand für die Musik zuständig — die
      // Auswahl fällt also mit. Sie steht hier nur als Attrappe; was sie
      // entscheidet, prüft `song-selection-release.spec.ts`.
      findMany: jest.fn().mockResolvedValue([]),
    },
    meetingSong: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    meetingTopicResponsible: { deleteMany: batch('topic', 1) },
    meetingAttendance: { deleteMany: batch('attendance', 2) },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };

  return {
    service: withClock(
      new RoleReleaseService(
        prisma as unknown as PrismaService,
        { releaseFor: jest.fn() } as unknown as TopicLinkService,
      ),
    ),
    meetingUpdate,
    meetingTouch,
    deletes,
  };
}

describe('RoleReleaseService.releaseEverythingUpcoming', () => {
  it('nimmt die Person aus jedem kommenden Gastgeber-Platz', async () => {
    const { service, meetingUpdate } = setupLeaving([
      { id: 'm1', hostPersonId: 'p1', requiresHost: true },
      { id: 'm2', hostPersonId: 'p2', requiresHost: true },
      { id: 'm3', hostPersonId: 'p1', requiresHost: true },
    ]);

    const result = await service.releaseEverythingUpcoming('hk', 'p1');

    expect(result.host).toBe(2);
    expect(meetingUpdate).toHaveBeenCalledTimes(2);
    expect(meetingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1' },
        data: expect.objectContaining({
          hostPersonId: null,
          locationId: null,
        }),
      }),
    );
  });

  it('lässt einen Treffpunkt stehen — der hing nie am Gastgeber', async () => {
    const { service, meetingUpdate } = setupLeaving([
      { id: 'm1', hostPersonId: 'p1', requiresHost: false },
    ]);

    await service.releaseEverythingUpcoming('hk', 'p1');

    expect(meetingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ locationId: undefined }),
      }),
    );
  });

  /**
   * Der Unterschied zur einzelnen Absage: die gibt eine Zuteilung frei, diese
   * hier alle auf einmal. Was die Person an ihren Themen gearbeitet hat, bleibt
   * — Einheiten und ihre Verantwortlichen sind Archiv.
   */
  it('nimmt die Themen-Zuteilung an allen kommenden Abenden mit', async () => {
    const { service, deletes } = setupLeaving([
      { id: 'm1', hostPersonId: null },
      { id: 'm2', hostPersonId: null },
    ]);

    const result = await service.releaseEverythingUpcoming('hk', 'p1');

    expect(result.topic).toBe(1);
    expect(deletes.topic).toEqual({
      personId: 'p1',
      meetingId: { in: ['m1', 'm2'] },
    });
  });

  it('räumt die eigenen Antworten weg', async () => {
    const { service, deletes } = setupLeaving([
      { id: 'm1', hostPersonId: null },
      { id: 'm2', hostPersonId: null },
    ]);

    await service.releaseEverythingUpcoming('hk', 'p1');

    // „Kommt nicht" von jemandem, der gar nicht mehr dabei ist, verzerrt jede
    // Zählung.
    expect(deletes.attendance).toEqual({
      personId: 'p1',
      meetingId: { in: ['m1', 'm2'] },
    });
  });

  it('meldet alle kommenden Abende zurück, nicht nur die berührten', async () => {
    const { service } = setupLeaving([
      { id: 'm1', hostPersonId: null },
      { id: 'm2', hostPersonId: null },
    ]);

    // Mit der Person ändert sich die Zahl der aktiven Menschen — und damit die
    // Schwelle, ab der ein Abend „alle haben abgesagt" ist.
    const result = await service.releaseEverythingUpcoming('hk', 'p1');

    expect(result.meetingIds).toEqual(['m1', 'm2']);
  });

  it('fasst gar nichts an, wenn nichts mehr kommt', async () => {
    const { service, deletes } = setupLeaving([]);

    await expect(
      service.releaseEverythingUpcoming('hk', 'p1'),
    ).resolves.toEqual({
      meetingIds: [],
      host: 0,
      song: 0,
      topic: 0,
      testimony: 0,
    });
    expect(deletes).toEqual({});
  });
});
