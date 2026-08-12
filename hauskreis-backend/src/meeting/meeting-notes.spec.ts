/**
 * Der Baustein „Nachbereitung": Zusammenfassung und Actionstep am Abend selbst.
 *
 * Der erste Test ist ein **Regressionstest**. Die beiden Felder standen im DTO
 * und in den Baustein-Regeln, aber nicht im `data`-Block des Schreibvorgangs:
 * der PATCH antwortete mit `200`, zählte die Version hoch — und der Text war
 * weg. Kein bestehender Test konnte das sehen, weil alle Slot-Tests die reinen
 * Funktionen prüfen und keiner den Weg in die Datenbank.
 *
 * Deshalb hält die Prisma-Attrappe hier einen **Zustand**, wie in
 * `meeting-start-time.spec.ts`: `updateMany` schreibt hinein, `findFirst` liest
 * ihn zurück. Nur so fällt „angenommen, aber nicht gespeichert" auf.
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
import type { MeetingScheduleConfigService } from './meeting-schedule-config.service';
import type { IfMatchCondition } from '../common/http/etag';
import { MeetingType } from '../../generated/prisma/enums';
import { withClock } from './group-clock.testing';

/** Die Zone der Gruppe — in den Tests immer dieselbe. */
const BERLIN = 'Europe/Berlin';

const EGAL: IfMatchCondition = { kind: 'any' };
const ICH = { personId: 'p-ich', isAdmin: false, zone: BERLIN };

/** Dienstag, der 11. August 2026. Ortszeit ist im August UTC+2. */
const ABEND = new Date('2026-08-11T00:00:00.000Z');
const VORMITTAGS = new Date('2026-08-11T06:00:00.000Z');
/** 18:00 Ortszeit — der Abend fängt an. */
const ABENDS = new Date('2026-08-11T16:00:00.000Z');

function setup({
  hasNotesSlot = false,
  hasTopicSlot = false,
  startMinutes = 1080,
} = {}) {
  const state = {
    current: {
      id: 'm1',
      hauskreisId: 'hk1',
      date: ABEND,
      endDate: null,
      startMinutes,
      type: MeetingType.CUSTOM,
      status: 'PLANNED',
      hasTopicSlot,
      hasSongSlot: false,
      hasTestimonySlot: false,
      hasNotesSlot,
      summaryText: null,
      actionstepText: null,
      hostPersonId: null,
      locationId: null,
      location: null,
      topicSession: null,
    } as Record<string, unknown>,
  };

  const deleteActionstepDone = jest.fn().mockResolvedValue({ count: 2 });

  const prisma = {
    meeting: {
      findFirst: jest.fn(() => Promise.resolve(state.current)),
      updateMany: jest.fn((args: { data: Record<string, unknown> }) => {
        for (const [key, value] of Object.entries(args.data)) {
          if (value !== undefined && key !== 'version') {
            state.current = { ...state.current, [key]: value };
          }
        }
        return Promise.resolve({ count: 1 });
      }),
    },
    meetingActionstepDone: { deleteMany: deleteActionstepDone },
    meetingSong: { deleteMany: jest.fn() },
    meetingSongLeader: { deleteMany: jest.fn() },
    meetingTopicResponsible: { deleteMany: jest.fn() },
    person: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    location: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    topic: { findFirst: jest.fn() },
    $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma)),
  };

  const service = withClock(
    new MeetingService(
      prisma as unknown as PrismaService,
      {} as unknown as RoleSuggestionService,
      {
        announceTimeChange: jest.fn(),
      } as unknown as MeetingNotificationService,
      {} as unknown as MeetingCancellationService,
      { announce: jest.fn() } as unknown as RoleAssignmentNotifier,
      { assertAvailable: jest.fn() } as unknown as AvailabilityService,
      {} as unknown as RoleReleaseService,
      { apply: jest.fn() } as unknown as AutoAttendanceService,
      {
        announceCreation: jest.fn(),
      } as unknown as CustomMeetingNotificationService,
      { detachIfUpcoming: jest.fn() } as unknown as TopicLinkService,
      {} as unknown as MeetingScheduleConfigService,
    ),
  );

  return { service, state, deleteActionstepDone };
}

afterEach(() => {
  jest.useRealTimers();
});

function jetzt(instant: Date) {
  jest.useFakeTimers().setSystemTime(instant);
}

describe('Nachbereitung schreiben', () => {
  /**
   * **Der Regressionstest.** Ohne die zwei Zeilen im `data`-Block lief der
   * Aufruf durch, ohne etwas zu hinterlassen.
   */
  it('speichert Zusammenfassung und Actionstep wirklich', async () => {
    jetzt(ABENDS);
    const { service, state } = setup({ hasNotesSlot: true });

    const updated = await service.update(
      'hk1',
      'm1',
      {
        summaryText: 'Wir haben über Dankbarkeit gesprochen',
        actionstepText: 'Jeden Abend drei Dinge aufschreiben',
      } as never,
      ICH,
      EGAL,
    );

    expect(state.current.summaryText).toBe(
      'Wir haben über Dankbarkeit gesprochen',
    );
    expect(state.current.actionstepText).toBe(
      'Jeden Abend drei Dinge aufschreiben',
    );
    // Und die Antwort trägt sie auch — sonst stünde nach dem Speichern der
    // alte Stand da, bis jemand neu lädt.
    expect(updated.summaryText).toBe('Wir haben über Dankbarkeit gesprochen');
  });

  it('leert ein Feld auf ausdrückliches null', async () => {
    jetzt(ABENDS);
    const { service, state } = setup({ hasNotesSlot: true });

    await service.update(
      'hk1',
      'm1',
      { summaryText: 'erst etwas' } as never,
      ICH,
      EGAL,
    );
    await service.update(
      'hk1',
      'm1',
      { summaryText: null } as never,
      ICH,
      EGAL,
    );

    expect(state.current.summaryText).toBeNull();
  });

  /** Ein PATCH mit nur einem der beiden lässt das andere in Ruhe. */
  it('rührt ein weggelassenes Feld nicht an', async () => {
    jetzt(ABENDS);
    const { service, state } = setup({ hasNotesSlot: true });

    await service.update(
      'hk1',
      'm1',
      { summaryText: 'steht', actionstepText: 'auch' } as never,
      ICH,
      EGAL,
    );
    await service.update(
      'hk1',
      'm1',
      { summaryText: 'geändert' } as never,
      ICH,
      EGAL,
    );

    expect(state.current.actionstepText).toBe('auch');
  });
});

describe('Nachbereitung an- und abschalten', () => {
  it('lässt sich vor dem Abend nicht dazunehmen', async () => {
    jetzt(VORMITTAGS);
    const { service } = setup();

    await expect(
      service.update('hk1', 'm1', { hasNotesSlot: true } as never, ICH, EGAL),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lässt sich ab der Treffpunktzeit dazunehmen', async () => {
    jetzt(ABENDS);
    const { service, state } = setup();

    await service.update(
      'hk1',
      'm1',
      { hasNotesSlot: true } as never,
      ICH,
      EGAL,
    );

    expect(state.current.hasNotesSlot).toBe(true);
  });

  /**
   * Die Grenze kommt vom Termin: um halb acht ist eine 18-Uhr-Gruppe längst
   * dabei, eine 20-Uhr-Gruppe noch nicht.
   */
  it('verschiebt sich mit der Anfangszeit des Abends', async () => {
    jetzt(new Date('2026-08-11T17:30:00.000Z'));

    await expect(
      setup({ startMinutes: 1200 }).service.update(
        'hk1',
        'm1',
        { hasNotesSlot: true } as never,
        ICH,
        EGAL,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * Sonst scheiterte jede andere Änderung an einem kommenden Abend daran, dass
   * die Nachbereitung aus ist — der Schalter kam ja gar nicht mit.
   */
  it('lässt einen PATCH ohne den Schalter in Ruhe', async () => {
    jetzt(VORMITTAGS);
    const { service, state } = setup();

    await service.update(
      'hk1',
      'm1',
      { title: 'Grillabend' } as never,
      ICH,
      EGAL,
    );

    expect(state.current.title).toBe('Grillabend');
  });

  /** Wegnehmen geht immer — wer sich vertut, wäre sonst damit eingesperrt. */
  it('lässt sich jederzeit wieder wegnehmen', async () => {
    jetzt(VORMITTAGS);
    const { service, state, deleteActionstepDone } = setup({
      hasNotesSlot: true,
    });

    await service.update(
      'hk1',
      'm1',
      { hasNotesSlot: false } as never,
      ICH,
      EGAL,
    );

    expect(state.current.hasNotesSlot).toBe(false);
    // Beide Texte weg — und die Haken darunter auch, sonst stünde ein neuer
    // Actionstep später rätselhaft schon abgehakt da.
    expect(state.current.summaryText).toBeNull();
    expect(state.current.actionstepText).toBeNull();
    expect(deleteActionstepDone).toHaveBeenCalledWith({
      where: { meetingId: 'm1' },
    });
  });

  /**
   * Ein nachträglich gewähltes Thema nimmt die Nachbereitung mit: die beiden
   * schließen einander aus, und zwei Zusammenfassungen gibt es nicht.
   */
  it('fällt weg, wenn das Thema dazukommt', async () => {
    jetzt(ABENDS);
    const { service, state, deleteActionstepDone } = setup({
      hasNotesSlot: true,
    });

    await service.update(
      'hk1',
      'm1',
      // So schickt es das Frontend — `applySlotToggle` legt beide Schalter um.
      { hasTopicSlot: true, hasNotesSlot: false } as never,
      ICH,
      EGAL,
    );

    expect(state.current.hasTopicSlot).toBe(true);
    expect(state.current.hasNotesSlot).toBe(false);
    expect(state.current.actionstepText).toBeNull();
    expect(deleteActionstepDone).toHaveBeenCalled();
  });

  /** Beide zugleich bleibt verboten, auch am Abend selbst. */
  it('weist Thema und Nachbereitung zusammen ab', async () => {
    jetzt(ABENDS);
    const { service } = setup({ hasNotesSlot: true });

    await expect(
      service.update('hk1', 'm1', { hasTopicSlot: true } as never, ICH, EGAL),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
