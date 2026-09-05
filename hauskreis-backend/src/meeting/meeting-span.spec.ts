/**
 * Termine, die länger dauern als einen Abend — und was sie für die Nachbarn
 * bedeuten.
 *
 * Ein Zeitraum ist nicht bloß ein zweites Datum: er **belegt** die Tage
 * dazwischen. Die Datenbank kann das nicht erzwingen (`@@unique` sieht nur das
 * Startdatum, und eine Exclusion Constraint lässt sich in Prisma nicht
 * ausdrücken), also steht die Regel im Service — und damit hier.
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
import type { RoleAttendanceService } from '../attendance/role-attendance.service';
import type { TopicLinkService } from '../topic/topic-link.service';
import type { CustomMeetingNotificationService } from './custom-meeting-notification.service';
import type { MeetingScheduleConfigService } from './meeting-schedule-config.service';
import { withClock } from './group-clock.testing';

/** Die Zone der Gruppe — in den Tests immer dieselbe. */
const BERLIN = 'Europe/Berlin';

/**
 * Dienstag, 18 Uhr — die Uhrzeit, die ein Termin ohne eigene Angabe bekommt.
 * Hier steht sie nur im Weg; geprüft wird sie in `meeting-start-time.spec.ts`.
 */
const SCHEDULE = {
  getRhythm: jest.fn().mockResolvedValue({ weekday: 2, startMinutes: 1080 }),
} as unknown as MeetingScheduleConfigService;

/** Was `findFirst` auf die Überschneidungsfrage antwortet. */
function setup(clash: { date: Date } | null = null) {
  const create = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'm-neu', ...args.data }),
  );
  const announceCreation = jest.fn().mockResolvedValue(0);

  const prisma = {
    meeting: {
      create,
      // Zwei Aufrufe treffen hier auf: die Überschneidungsprüfung und das
      // abschließende `findOne`. Der erste bekommt die Antwort aus dem
      // Parameter, der zweite muss einen Termin liefern.
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(clash)
        .mockResolvedValue({ id: 'm-neu' }),
    },
    person: { findFirst: jest.fn() },
    location: { findFirst: jest.fn() },
    topic: { findFirst: jest.fn() },
  };

  const service = withClock(
    new MeetingService(
      prisma as unknown as PrismaService,
      {} as unknown as RoleSuggestionService,
      {} as unknown as MeetingNotificationService,
      {} as unknown as MeetingCancellationService,
      {} as unknown as RoleAssignmentNotifier,
      {
        assertAvailable: jest.fn(),
        assertArrived: jest.fn(),
      } as unknown as AvailabilityService,
      {} as unknown as RoleReleaseService,
      { apply: jest.fn() } as unknown as AutoAttendanceService,
      { confirm: jest.fn() } as unknown as RoleAttendanceService,
      // Ein neuer besonderer Termin kündigt sich der Gruppe an. Hier zählt nur,
      // dass es passiert; was drinsteht, prüft `custom-meeting-notification`.
      {
        announceCreation,
      } as unknown as CustomMeetingNotificationService,
      { detach: jest.fn() } as unknown as TopicLinkService,
      SCHEDULE,
    ),
  );

  return { service, prisma, create, announceCreation };
}

/** Wer anlegt. Für diese Tests egal, aber der Dienst will es wissen. */
const ICH = { personId: 'p-ich', isAdmin: false, zone: BERLIN };

const FREIZEIT = {
  date: '2026-08-14',
  endDate: '2026-08-16',
  generated: false,
  title: 'Hauskreis-Freizeit',
};

describe('MeetingService.create — mehrere Tage', () => {
  it('legt einen Termin mit Zeitraum an', async () => {
    const { service, create } = setup();

    await service.create('hk-1', FREIZEIT, ICH);

    expect(create.mock.calls[0][0].data.endDate).toEqual(
      new Date('2026-08-16'),
    );
  });

  /**
   * Hier stand einmal „nur ein besonderer Termin kann über mehrere Tage
   * gehen". Das war eine Regel über die Terminart und nicht über die Sache:
   * Eine Freizeit ist mehrtägig, ganz gleich, wer sie angelegt hat. Mit der
   * Terminart ist die Regel weg — geblieben ist die, die etwas prüft.
   */
  it('weist ein Ende vor dem Anfang ab', async () => {
    const { service } = setup();

    await expect(
      service.create('hk-1', { ...FREIZEIT, endDate: '2026-08-12' }, ICH),
    ).rejects.toThrow(BadRequestException);
  });

  /** Zwei Schreibweisen für denselben Sachverhalt sind eine zu viel. */
  it('macht aus „endet am selben Tag" ein schlichtes null', async () => {
    const { service, create } = setup();

    await service.create('hk-1', { ...FREIZEIT, endDate: FREIZEIT.date }, ICH);

    expect(create.mock.calls[0][0].data.endDate).toBeNull();
  });

  it('weist einen Termin ab, der in einen bestehenden fällt', async () => {
    const { service } = setup({ date: new Date('2026-08-14') });

    await expect(service.create('hk-1', FREIZEIT, ICH)).rejects.toThrow(
      /steht schon ein Termin/,
    );
  });

  /**
   * Die eigentliche Frage an die Abfrage: beide Richtungen. Ein einzelner
   * Dienstag mitten in der Freizeit hat kein `endDate` — er darf trotzdem nicht
   * übersehen werden.
   */
  it('fragt nach Überschneidungen in beide Richtungen', async () => {
    const { service, prisma } = setup();

    await service.create('hk-1', FREIZEIT, ICH);

    const where = prisma.meeting.findFirst.mock.calls[0][0].where as {
      AND: unknown[];
    };

    // „Endet nicht vor dem Anfang" und „beginnt nicht nach dem Ende" — beides
    // zusammen ist die Überschneidung. Ein eintägiger Termin trägt kein
    // `endDate`, deshalb im ersten Teil zwei Zweige.
    expect(where.AND).toEqual([
      {
        OR: [
          { endDate: null, date: { gte: new Date('2026-08-14') } },
          { endDate: { gte: new Date('2026-08-14') } },
        ],
      },
      { date: { lte: new Date('2026-08-16') } },
    ]);
  });
});

/**
 * Löschen und Absagen sind zwei verschiedene Dinge, und der Unterschied ist
 * kein technischer: ein Dienstag, der ausfällt, bleibt Teil der Geschichte —
 * und der Terminplaner legte ihn ohnehin gleich wieder an.
 */
function setupRemove(generated: boolean) {
  const del = jest.fn().mockResolvedValue({});
  const prisma = {
    meeting: {
      findFirst: jest.fn().mockResolvedValue({ id: 'm1', generated }),
      delete: del,
    },
  };

  const service = withClock(
    new MeetingService(
      prisma as unknown as PrismaService,
      {} as unknown as RoleSuggestionService,
      {} as unknown as MeetingNotificationService,
      {} as unknown as MeetingCancellationService,
      {} as unknown as RoleAssignmentNotifier,
      {} as unknown as AvailabilityService,
      {} as unknown as RoleReleaseService,
      {} as unknown as AutoAttendanceService,
      { confirm: jest.fn() } as unknown as RoleAttendanceService,
      {} as unknown as CustomMeetingNotificationService,
      { detach: jest.fn() } as unknown as TopicLinkService,
      SCHEDULE,
    ),
  );

  return { service, del };
}

describe('MeetingService.remove', () => {
  it('löscht einen selbst angelegten Termin', async () => {
    const { service, del } = setupRemove(false);

    await service.remove('hk-1', 'm1');

    expect(del).toHaveBeenCalledWith({ where: { id: 'm1' } });
  });

  it('weist einen erzeugten ab — der wird abgesagt, nicht gelöscht', async () => {
    const { service, del } = setupRemove(true);

    await expect(service.remove('hk-1', 'm1')).rejects.toThrow(
      BadRequestException,
    );
    expect(del).not.toHaveBeenCalled();
  });
});
