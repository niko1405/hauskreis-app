import { ActionstepReminderService } from './actionstep-reminder.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import type { NotificationPreferenceService } from '../notification/notification-preference.service';
import { NotificationType } from '../../generated/prisma/enums';
import { withClock } from './group-clock.testing';
import { withFeatures } from '../hauskreis/group-features.testing';
import type { GroupFeatures } from '../hauskreis/group-features.service';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Ein vergangener Abend, wie `latestActionstep` ihn liest. */
interface Abend {
  id: string;
  actionstepText: string | null;
  /** Vom Thema (Vorgabe) oder aus der Nachbereitung des Abends selbst. */
  quelle?: 'thema' | 'nachbereitung';
  /** Ob der nächtliche Lauf ihn angelegt hat — Vorgabe: ja. */
  generated?: boolean;
  /** Wer den Actionstep schon abgehakt hat. */
  done?: string[];
}

function row(abend: Abend) {
  const ausNachbereitung = abend.quelle === 'nachbereitung';

  return {
    id: abend.id,
    date: utc('2026-07-28'),
    generated: abend.generated ?? true,
    hasTopicSlot: !ausNachbereitung,
    actionstepText: ausNachbereitung ? abend.actionstepText : null,
    topicSession: ausNachbereitung
      ? null
      : { actionstepText: abend.actionstepText },
    actionstepDone: (abend.done ?? []).map((personId) => ({ personId })),
  };
}

function setup(
  options: {
    meeting?: Abend | null;
    /**
     * Woher der Actionstep kommt: von der Einheit eines Themas (Vorgabe) oder
     * aus der Nachbereitung des Abends selbst. Beides muss dieselbe Erinnerung
     * auslösen — der Vorsatz ist derselbe, nur der Träger ist ein anderer.
     */
    quelle?: 'thema' | 'nachbereitung';
    /**
     * Die vergangenen Abende, jüngster zuerst — für die Fälle, in denen es auf
     * mehr als den letzten ankommt.
     */
    lastMeetings?: Abend[];
    people?: string[];
    weekdaysByPerson?: Record<string, number[]>;
    /** Wer den Actionstep schon abgehakt hat. */
    done?: string[];
    /** Womit die Gruppe arbeitet — voreingestellt mit allem. */
    features?: Partial<GroupFeatures>;
  } = {},
) {
  const abend =
    options.meeting === undefined
      ? { id: 'meeting-1', actionstepText: 'Jeden Tag 10 Minuten lesen' }
      : options.meeting;

  const abende =
    options.lastMeetings ??
    (abend ? [{ ...abend, quelle: options.quelle, done: options.done }] : []);

  const findMany = jest.fn().mockResolvedValue(abende.map(row));

  const people = options.people ?? ['anna', 'chris'];
  const findManyPeople = jest
    .fn()
    .mockResolvedValue(people.map((id) => ({ id })));

  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });

  const resolveMany = jest.fn((personIds: string[]) =>
    Promise.resolve(
      new Map(
        personIds.map((personId) => [
          personId,
          // Friday by default, matching the catalog.
          { weekdays: options.weekdaysByPerson?.[personId] ?? [5] },
        ]),
      ),
    ),
  );

  const service = withFeatures(
    withClock(
      new ActionstepReminderService(
        {
          meeting: { findMany },
          person: { findMany: findManyPeople },
        } as unknown as PrismaService,
        { notify } as unknown as NotificationService,
        { resolveMany } as unknown as NotificationPreferenceService,
      ),
    ),
    options.features,
  );

  return { service, findMany, notify };
}

// 2026-07-31 is a Friday, 2026-07-30 a Thursday.
const friday = utc('2026-07-31');
const thursday = utc('2026-07-30');

describe('ActionstepReminderService.sendDueReminders', () => {
  it('nudges everyone whose day is today', async () => {
    const { service, notify } = setup();

    const result = await service.sendDueReminders('hk-1', { now: friday });

    expect(result).toEqual({
      notified: 2,
      skipped: 0,
      meetingId: 'meeting-1',
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'anna',
        type: NotificationType.ACTIONSTEP_REMINDER,
        relatedMeetingId: 'meeting-1',
      }),
    );
  });

  it('leaves out whoever picked another day', async () => {
    // The job runs daily for everyone; the setting decides whose day it is.
    // That is what gives personal rhythms without a cron per person.
    const { service, notify } = setup({ weekdaysByPerson: { chris: [1] } });

    await service.sendDueReminders('hk-1', { now: friday });

    expect(notify.mock.calls.map((call) => call[0].personId)).toEqual(['anna']);
  });

  it('erinnert an jedem gewählten Tag, nicht nur am ersten', async () => {
    // Der Sinn der Liste: einmal zur Wochenmitte nachfragen und einmal kurz
    // vor dem nächsten Abend sind zwei Erinnerungen, keine doppelte.
    const { service, notify } = setup({
      weekdaysByPerson: { anna: [2, 5], chris: [2] },
    });

    await service.sendDueReminders('hk-1', { now: friday });

    expect(notify.mock.calls.map((call) => call[0].personId)).toEqual(['anna']);
  });

  it('entdoppelt je Tag und nicht nur je Abend', async () => {
    // Sonst gälte der Actionstep nach dem ersten gewählten Wochentag als
    // erledigt, und der zweite Tag schickte nichts mehr.
    const { service, notify } = setup();

    await service.sendDueReminders('hk-1', { now: friday });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'anna',
        relatedKey: friday.toISOString().slice(0, 10),
      }),
    );
  });

  it('stays silent on a day nobody chose', async () => {
    const { service, notify } = setup();

    const result = await service.sendDueReminders('hk-1', { now: thursday });

    expect(result.notified).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('says nothing when the last meetings had no actionstep', async () => {
    const { service, notify } = setup({ meeting: null });

    const result = await service.sendDueReminders('hk-1', { now: friday });

    expect(result).toEqual({ notified: 0, skipped: 0, meetingId: null });
    expect(notify).not.toHaveBeenCalled();
  });

  it('treats a blank actionstep as none at all', async () => {
    const { service, notify } = setup({
      meeting: { id: 'meeting-1', actionstepText: '   ' },
    });

    await service.sendDueReminders('hk-1', { now: friday });

    expect(notify).not.toHaveBeenCalled();
  });

  it('looks only at meetings that already happened', async () => {
    const { service, findMany } = setup();

    await service.sendDueReminders('hk-1', { now: friday });

    // Ganz vorbei, nicht nur angefangen: eine Freizeit, die noch läuft, hat
    // ihren Actionstep noch vor sich.
    expect(findMany.mock.calls[0][0].where.OR).toEqual([
      { endDate: null, date: { lt: friday } },
      { endDate: { lt: friday } },
    ]);
    // Newest first: an older actionstep must not overtake last week's.
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ date: 'desc' });
  });

  it('leaves out whoever already ticked it off', async () => {
    const { service, notify } = setup({ done: ['chris'] });

    const result = await service.sendDueReminders('hk-1', { now: friday });

    // Genau dafür ist der Haken da: sonst wäre er nur Statistik und man würde
    // weiter gefragt, wie es mit etwas läuft, das man erledigt hat.
    expect(notify.mock.calls.map((call) => call[0].personId)).toEqual(['anna']);
    expect(result.notified).toBe(1);
  });

  it('quotes the actionstep so the nudge is self-contained', async () => {
    const { service, notify } = setup();

    await service.sendDueReminders('hk-1', { now: friday });

    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Wie läuft es damit? "Jeden Tag 10 Minuten lesen"',
    );
  });

  /**
   * Der Vorsatz eines Lobpreisabends ist derselbe Vorsatz. Er hing nur an keiner
   * Einheit — und wurde deshalb bis eben gar nicht erinnert.
   */
  /**
   * Die Regel, die `latestActionstep` trägt: Ein neuer Abend beendet den
   * Vorsatz von davor, auch wenn er selbst keinen hinterlässt. Gesucht wurde
   * einmal „der jüngste Abend, **der einen hat**" — und dann stand der Vorsatz
   * von vorletzter Woche eine Woche zu lang da, als wäre er frisch.
   */
  it('lässt einen leeren Abend den Vorsatz von davor beenden', async () => {
    const { service, notify } = setup({
      lastMeetings: [
        { id: 'leer', actionstepText: null },
        { id: 'davor', actionstepText: 'Jeden Tag 10 Minuten lesen' },
      ],
    });

    const result = await service.sendDueReminders('hk-1', { now: friday });

    expect(result).toEqual({ notified: 0, skipped: 0, meetingId: null });
    expect(notify).not.toHaveBeenCalled();
  });

  /**
   * Die eine Ausnahme: Zwischen zwei Dienstagen einen Geburtstag zu feiern
   * beendet nicht, was man sich am Dienstag vorgenommen hat.
   */
  it('überspringt einen selbst angelegten Termin ohne Actionstep', async () => {
    const { service, notify } = setup({
      lastMeetings: [
        { id: 'geburtstag', actionstepText: null, generated: false },
        { id: 'dienstag', actionstepText: 'Jeden Tag 10 Minuten lesen' },
      ],
    });

    const result = await service.sendDueReminders('hk-1', { now: friday });

    expect(result.meetingId).toBe('dienstag');
    expect(notify).toHaveBeenCalled();
  });

  /** Bringt er selbst einen mit, gilt er wie jeder andere Abend. */
  it('nimmt den Actionstep eines selbst angelegten Termins', async () => {
    const { service, notify } = setup({
      lastMeetings: [
        {
          id: 'geburtstag',
          actionstepText: 'Ruf jemanden an, den du lange nicht gesprochen hast',
          quelle: 'nachbereitung',
          generated: false,
        },
        { id: 'dienstag', actionstepText: 'Jeden Tag 10 Minuten lesen' },
      ],
    });

    const result = await service.sendDueReminders('hk-1', { now: friday });

    expect(result.meetingId).toBe('geburtstag');
    expect(notify.mock.calls[0][0].payload.body).toContain('Ruf jemanden an');
  });

  /**
   * Hat die Gruppe den Wochen-Actionstep abgeschaltet, ist er ganz aus. Sonst
   * hätte man ihn vom Startbildschirm geräumt und bekäme mittwochs trotzdem
   * eine Nachricht dazu.
   */
  it('schweigt, wenn die Gruppe den Wochen-Actionstep abgeschaltet hat', async () => {
    const { service, notify, findMany } = setup({
      features: { weeklyActionstep: false },
    });

    const result = await service.sendDueReminders('hk-1', { now: friday });

    expect(result).toEqual({ notified: 0, skipped: 0, meetingId: null });
    expect(notify).not.toHaveBeenCalled();
    // Und zwar ohne überhaupt zu suchen.
    expect(findMany).not.toHaveBeenCalled();
  });

  it('erinnert auch an den Actionstep eines Abends ohne Thema', async () => {
    const { service, notify } = setup({ quelle: 'nachbereitung' });

    const result = await service.sendDueReminders('hk-1', { now: friday });

    expect(result.meetingId).toBe('meeting-1');
    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Wie läuft es damit? "Jeden Tag 10 Minuten lesen"',
    );
  });
});
