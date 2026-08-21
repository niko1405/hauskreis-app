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
import type { MeetingCancellationService } from './meeting-cancellation.service';
import type { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import type { AvailabilityService } from '../role-suggestion/availability.service';
import type { RoleReleaseService } from './role-release.service';
import type { AutoAttendanceService } from '../attendance/auto-attendance.service';
import type { CustomMeetingNotificationService } from './custom-meeting-notification.service';
import type { TopicLinkService } from '../topic/topic-link.service';
import type { IfMatchCondition } from '../common/http/etag';
import { withClock } from './group-clock.testing';

/** Die Zone der Gruppe — in den Tests immer dieselbe. */
const BERLIN = 'Europe/Berlin';

/** Diese Endpunkte verlangen eine Vorbedingung; hier interessiert sie nicht. */
const EGAL: IfMatchCondition = { kind: 'any' };

/** Wer gerade schreibt. Für diese Tests immer dieselbe Person, kein Admin. */
const ICH = { personId: 'p-ich', isAdmin: false, zone: BERLIN };
const ADMIN = { personId: 'admin', isAdmin: true, zone: BERLIN };

const HEUTE = new Date('2026-08-03T00:00:00.000Z');
const KOMMENDER_DIENSTAG = new Date('2026-08-11T00:00:00.000Z');
const LETZTER_DIENSTAG = new Date('2026-07-28T00:00:00.000Z');

/** Ein Termin, wie `findOne` ihn liefert — nur die Felder, um die es geht. */
function meeting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    hauskreisId: 'hk1',
    date: KOMMENDER_DIENSTAG,
    endDate: null,
    type: 'STANDARD',
    status: 'PLANNED',
    // Ein Hauskreis-Abend hat einen Gastgeber-Slot. Ohne die vier Schalter
    // liest `resolveSlots` `undefined` und hielte jeden Baustein für
    // abgeschaltet — dann scheiterte hier alles an der falschen Stelle.
    hasHostSlot: true,
    hasTopicSlot: true,
    hasSongSlot: true,
    hasTestimonySlot: false,
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
      // Der Schreibvorgang wirkt auf den Stand zurück, den `reload` gleich
      // wieder liest. Ohne das sähe der Dienst nach dem Speichern immer noch
      // den Zustand von vorher — und dann könnte kein Test prüfen, was aus
      // einer Änderung *folgt*, etwa die Nachricht an den neuen Gastgeber.
      updateMany: jest.fn((args: { data: Record<string, unknown> }) => {
        for (const [key, value] of Object.entries(args.data)) {
          // `undefined` heißt „unverändert", `{ increment: 1 }` ist der
          // Versionszähler und keine Eigenschaft des Termins.
          if (value !== undefined && key !== 'version') {
            state.current = { ...state.current, [key]: value };
          }
        }
        return Promise.resolve({ count: 1 });
      }),
    },
    person: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    location: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    topic: { findFirst: jest.fn() },
  };

  const notifications = {
    announceCancellation: jest.fn(),
    announceRevival: jest.fn(),
  };
  const cancellations = { reconcile: jest.fn() };
  const roleAssignments = { announce: jest.fn() };
  // Standardmäßig ist niemand abwesend — die Regel selbst hat ihren eigenen
  // Spec; hier soll sie den anderen Tests nicht im Weg stehen.
  const availability = {
    assertAvailable: jest.fn(),
    assertArrived: jest.fn(),
    findDeclined: jest.fn(),
  };
  const roleRelease = { releaseFor: jest.fn() };
  // Das Lösen der Einheit beim Abschalten des Bausteins hat seinen eigenen
  // Spec; hier soll es den anderen Tests nicht im Weg stehen.
  const topicLinks = {
    detach: jest.fn().mockResolvedValue(false),
  };

  const service = withClock(
    new MeetingService(
      prisma as unknown as PrismaService,
      {} as unknown as RoleSuggestionService,
      notifications as unknown as MeetingNotificationService,
      cancellations as unknown as MeetingCancellationService,
      roleAssignments as unknown as RoleAssignmentNotifier,
      availability as unknown as AvailabilityService,
      roleRelease as unknown as RoleReleaseService,
      {} as unknown as AutoAttendanceService,
      {} as unknown as CustomMeetingNotificationService,
      topicLinks as unknown as TopicLinkService,
    ),
  );

  return {
    service,
    prisma,
    notifications,
    cancellations,
    roleAssignments,
    availability,
    roleRelease,
    topicLinks,
    state,
  };
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

    await service.update('hk1', 'm1', { hostPersonId: 'p1' }, ICH, EGAL);

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
      service.update('hk1', 'm1', { hostPersonId: 'p2' }, ICH, EGAL),
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
        undefined,
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

    await service.update(
      'hk1',
      'm1',
      { locationId: 'l-park' },
      undefined,
      EGAL,
    );

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
      service.update('hk1', 'm1', { locationId: 'l-chris' }, ICH, EGAL),
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

    await service.update('hk1', 'm1', { hostPersonId: null }, ICH, EGAL);

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

    await service.update('hk1', 'm1', { hostPersonId: null }, ICH, EGAL);

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
      service.update('hk1', 'm1', { locationId: 'l-park' }, ICH, EGAL),
    ).rejects.toThrow(/Nimm erst den Gastgeber heraus/);
  });
});

/** Niko wohnt in `l-niko` und ist damit als Gastgeber wählbar. */
function withHost(prisma: ReturnType<typeof setup>['prisma']) {
  prisma.person.findFirst.mockResolvedValue({ id: 'p1' });
  prisma.person.findFirstOrThrow.mockResolvedValue({
    name: 'Niko',
    locationId: 'l-niko',
  });
}

describe('MeetingService.update — wer eingeteilt wird, hört davon', () => {
  it('meldet einen neuen Gastgeber', async () => {
    const { service, prisma, roleAssignments } = setup();
    withHost(prisma);

    await service.update('hk1', 'm1', { hostPersonId: 'p1' }, ADMIN, EGAL);

    expect(roleAssignments.announce).toHaveBeenCalledWith(
      'm1',
      'HOST',
      ['p1'],
      'admin',
    );
  });

  /** Ein `PATCH` mit dem Info-Text darf niemanden anschreiben. */
  it('schweigt, wenn der Gastgeber derselbe bleibt', async () => {
    const { service, prisma, roleAssignments } = setup(
      meeting({
        hostPersonId: 'p1',
        locationId: 'l-niko',
        location: { requiresHost: true },
      }),
    );
    withHost(prisma);

    await service.update(
      'hk1',
      'm1',
      { infoText: 'Bitte pünktlich' },
      'admin',
      EGAL,
    );

    expect(roleAssignments.announce).not.toHaveBeenCalled();
  });

  it('schweigt, wenn der Gastgeber herausgenommen wird', async () => {
    const { service, roleAssignments } = setup(
      meeting({
        hostPersonId: 'p1',
        locationId: 'l-niko',
        location: { requiresHost: true },
      }),
    );

    await service.update('hk1', 'm1', { hostPersonId: null }, ADMIN, EGAL);

    expect(roleAssignments.announce).not.toHaveBeenCalled();
  });
});

describe('MeetingService — Absage vergangener Abende', () => {
  it('benachrichtigt bei einem kommenden Termin', async () => {
    const { service, notifications } = setup();

    await service.cancel('hk1', 'm1', {}, ICH, EGAL);

    expect(notifications.announceCancellation).toHaveBeenCalledWith('m1');
  });

  it('bleibt bei einem vergangenen Termin still', async () => {
    const { service, notifications } = setup(
      meeting({ date: LETZTER_DIENSTAG }),
    );

    await service.cancel('hk1', 'm1', {}, ICH, EGAL);

    expect(notifications.announceCancellation).not.toHaveBeenCalled();
  });

  it('zählt den heutigen Abend noch als kommend', async () => {
    const { service, notifications } = setup(meeting({ date: HEUTE }));

    await service.cancel('hk1', 'm1', {}, ICH, EGAL);

    expect(notifications.announceCancellation).toHaveBeenCalled();
  });
});

/**
 * Wer nicht da ist, kann die Rolle nicht übernehmen — auch beim Testimony.
 *
 * Gastgeber, Musik und Thema prüften das längst; hier kam nur `assertArrived`
 * vorbei, also ließ sich jemand eintragen, der für genau diesen Abend abgesagt
 * hatte. Ausgerechnet dort ist die Frage am eindeutigsten: seine Geschichte
 * erzählt niemand in Abwesenheit.
 */
describe('MeetingService — Testimony und Anwesenheit', () => {
  it('prüft die Anwesenheit beim Eintragen', async () => {
    const { service, availability, prisma } = setup(
      meeting({ hasTopicSlot: false, hasTestimonySlot: true }),
    );
    // Die Mandantengrenze läuft davor und ist hier nicht die Frage.
    prisma.person.findFirst.mockResolvedValue({ id: 'p-mira' });

    await service.update(
      'hk1',
      'm1',
      { testimonyPersonId: 'p-mira' },
      ICH,
      EGAL,
    );

    expect(availability.assertAvailable).toHaveBeenCalledWith('hk1', 'm1', [
      'p-mira',
    ]);
  });

  it('lässt einen PATCH ohne Wechsel in Ruhe', async () => {
    // Wie beim Gastgeber: Wer nur den Info-Text ändert, soll nicht daran
    // scheitern, dass der Eingetragene inzwischen abgesagt hat.
    const { service, availability, prisma } = setup(
      meeting({
        hasTopicSlot: false,
        hasTestimonySlot: true,
        testimonyPersonId: 'p-mira',
      }),
    );
    prisma.person.findFirst.mockResolvedValue({ id: 'p-mira' });

    await service.update(
      'hk1',
      'm1',
      { testimonyPersonId: 'p-mira', infoText: 'Bringt Kuchen mit' },
      ICH,
      EGAL,
    );

    expect(availability.assertAvailable).not.toHaveBeenCalled();
  });

  it('gibt die Absage des Servers weiter', async () => {
    const { service, availability, prisma } = setup(
      meeting({ hasTopicSlot: false, hasTestimonySlot: true }),
    );
    prisma.person.findFirst.mockResolvedValue({ id: 'p-mira' });

    availability.assertAvailable.mockRejectedValueOnce(
      new BadRequestException('Mira ist an diesem Abend nicht dabei'),
    );

    await expect(
      service.update('hk1', 'm1', { testimonyPersonId: 'p-mira' }, ICH, EGAL),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MeetingService — wer abgesagt hat, steht dabei', () => {
  it('schreibt Zeitpunkt, Person, Herkunft und Grund', async () => {
    const { service, prisma } = setup();

    await service.cancel(
      'hk1',
      'm1',
      { reason: 'Halbe Gruppe krank' },
      ICH,
      EGAL,
    );

    expect(written(prisma)).toMatchObject({
      status: 'CANCELLED',
      cancelledByPersonId: ICH.personId,
      cancelSource: 'MANUAL',
      cancelReason: 'Halbe Gruppe krank',
    });
  });

  it('lässt den Grund weg, wenn keiner genannt wurde', async () => {
    const { service, prisma } = setup();

    await service.cancel('hk1', 'm1', {}, ICH, EGAL);

    expect(written(prisma).cancelReason).toBeNull();
  });

  /**
   * Sonst bliebe auf der Terminseite ein „abgesagt von …" stehen, das keiner
   * mehr gesagt hat.
   */
  it('räumt beim Zurücknehmen alles wieder weg', async () => {
    const { service, prisma, notifications } = setup(
      meeting({ status: 'CANCELLED' }),
    );

    await service.uncancel('hk1', 'm1', ICH, EGAL);

    expect(written(prisma)).toMatchObject({
      status: 'PLANNED',
      cancelledAt: null,
      cancelledByPersonId: null,
      cancelSource: null,
      cancelReason: null,
    });
    expect(notifications.announceRevival).toHaveBeenCalledWith('m1');
  });

  it('sagt bei einem vergangenen Abend niemandem Bescheid', async () => {
    const { service, notifications } = setup(
      meeting({ status: 'CANCELLED', date: LETZTER_DIENSTAG }),
    );

    await service.uncancel('hk1', 'm1', ICH, EGAL);

    expect(notifications.announceRevival).not.toHaveBeenCalled();
  });
});
