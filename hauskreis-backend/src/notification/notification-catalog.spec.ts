import { NotificationType } from '../../generated/prisma/enums';
import {
  NOTIFICATION_CATALOG,
  notificationDefinition,
} from './notification-catalog';

describe('notification catalog', () => {
  it('covers every notification type', () => {
    // The guard rail behind "adding a type is one entry": without it a new
    // enum value would send fine and be invisible in the settings, with no
    // way to switch it off.
    const covered = new Set(NOTIFICATION_CATALOG.map((entry) => entry.type));
    const missing = Object.values(NotificationType).filter(
      (type) => !covered.has(type),
    );

    expect(missing).toEqual([]);
  });

  it('lists no type twice', () => {
    const types = NOTIFICATION_CATALOG.map((entry) => entry.type);

    expect(new Set(types).size).toBe(types.length);
  });

  it('keeps every lead-time default inside its own bounds', () => {
    const outOfBounds = NOTIFICATION_CATALOG.filter(
      (entry) =>
        entry.schedule.kind === 'LEAD_TIME' &&
        (entry.schedule.defaultLeadDays < entry.schedule.minLeadDays ||
          entry.schedule.defaultLeadDays > entry.schedule.maxLeadDays),
    );

    expect(outOfBounds.map((entry) => entry.type)).toEqual([]);
  });

  it('uses real weekdays for every weekly reminder', () => {
    const invalid = NOTIFICATION_CATALOG.filter(
      (entry) =>
        entry.schedule.kind === 'WEEKLY' &&
        (entry.schedule.defaultWeekdays.length === 0 ||
          entry.schedule.defaultWeekdays.some((day) => day < 0 || day > 6)),
    );

    expect(invalid.map((entry) => entry.type)).toEqual([]);
  });

  it('gives every type a label and a reason', () => {
    const unexplained = NOTIFICATION_CATALOG.filter(
      (entry) => entry.label.trim() === '' || entry.description.trim() === '',
    );

    expect(unexplained.map((entry) => entry.type)).toEqual([]);
  });

  it('throws for a type without an entry', () => {
    expect(() => notificationDefinition('NOPE' as NotificationType)).toThrow(
      /No catalog entry/,
    );
  });
});

/**
 * `appliesTo` blendet Schalter aus, die für diese Person nichts bewirken
 * können. Ein Schalter ohne Wirkung ist schlimmer als keiner — man glaubt ihm.
 */
const regelFuer = (type: NotificationType) =>
  NOTIFICATION_CATALOG.find((entry) => entry.type === type)?.appliesTo as (
    context: NotificationContext,
  ) => boolean;

/** Voller Kontext, aus dem jeder Fall nur das ändert, worum es ihm geht. */
const kontext = (
  overrides: Partial<NotificationContext> = {},
): NotificationContext => ({
  homeCapacity: null,
  activeMembers: 9,
  prayerBuddies: true,
  weeklyActionstep: true,
  ...overrides,
});

describe('appliesTo', () => {
  const capacityRule = regelFuer(NotificationType.HOST_CAPACITY_UNLOCKED);

  it('zeigt „Bei euch wäre jetzt Platz" bei begrenzter Wohnung', () => {
    expect(capacityRule(kontext({ homeCapacity: 5 }))).toBe(true);
  });

  it('verschweigt ihn ohne gesetzte Kapazität', () => {
    // „Alle passen rein" — dann gibt es nichts freizuschalten.
    expect(capacityRule(kontext({ homeCapacity: null }))).toBe(false);
  });

  it('verschweigt ihn, wenn die Wohnung ohnehin für alle reicht', () => {
    expect(capacityRule(kontext({ homeCapacity: 12 }))).toBe(false);
  });

  it('behandelt „passt genau" als nie gesperrt', () => {
    expect(capacityRule(kontext({ homeCapacity: 9 }))).toBe(false);
  });

  /**
   * Die beiden abschaltbaren Bausteine. Ein Schalter für etwas, das die Gruppe
   * gar nicht benutzt, ist genau der Schalter ohne Wirkung, den `appliesTo`
   * verhindern soll — und abgestellt wird der Versand ohnehin an der Quelle,
   * im nächtlichen Lauf.
   */
  it('verschweigt die Gebetsbuddys, wenn die Gruppe keine hat', () => {
    const regel = regelFuer(NotificationType.PRAYER_BUDDY_ASSIGNED);

    expect(regel(kontext())).toBe(true);
    expect(regel(kontext({ prayerBuddies: false }))).toBe(false);
  });

  it('verschweigt den Actionstep der Woche, wenn er abgeschaltet ist', () => {
    const regel = regelFuer(NotificationType.ACTIONSTEP_REMINDER);

    expect(regel(kontext())).toBe(true);
    expect(regel(kontext({ weeklyActionstep: false }))).toBe(false);
  });

  /**
   * Der Rest des Katalogs bleibt ungefiltert. `appliesTo` ist die Ausnahme für
   * Schalter, deren Anlass an einer Bedingung hängt — nicht der Normalfall.
   */
  it('lässt alle anderen Einträge für jeden gelten', () => {
    const conditional = NOTIFICATION_CATALOG.filter(
      (entry) => entry.appliesTo !== undefined,
    ).map((entry) => entry.type);

    expect(conditional.toSorted()).toEqual(
      [
        NotificationType.ACTIONSTEP_REMINDER,
        NotificationType.PRAYER_BUDDY_ASSIGNED,
        NotificationType.HOST_CAPACITY_UNLOCKED,
      ].toSorted(),
    );
  });
});
