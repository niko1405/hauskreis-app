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
describe('appliesTo', () => {
  const capacityRule = NOTIFICATION_CATALOG.find(
    (entry) => entry.type === NotificationType.HOST_CAPACITY_UNLOCKED,
  )?.appliesTo as (context: {
    homeCapacity: number | null;
    activeMembers: number;
  }) => boolean;

  it('zeigt „Bei euch wäre jetzt Platz" bei begrenzter Wohnung', () => {
    expect(capacityRule({ homeCapacity: 5, activeMembers: 9 })).toBe(true);
  });

  it('verschweigt ihn ohne gesetzte Kapazität', () => {
    // „Alle passen rein" — dann gibt es nichts freizuschalten.
    expect(capacityRule({ homeCapacity: null, activeMembers: 9 })).toBe(false);
  });

  it('verschweigt ihn, wenn die Wohnung ohnehin für alle reicht', () => {
    expect(capacityRule({ homeCapacity: 12, activeMembers: 9 })).toBe(false);
  });

  it('behandelt „passt genau" als nie gesperrt', () => {
    expect(capacityRule({ homeCapacity: 9, activeMembers: 9 })).toBe(false);
  });

  /**
   * Der Rest des Katalogs bleibt ungefiltert. `appliesTo` ist die Ausnahme für
   * einen Schalter, dessen Anlass an einer Bedingung hängt — nicht der neue
   * Normalfall.
   */
  it('lässt alle anderen Einträge für jeden gelten', () => {
    const conditional = NOTIFICATION_CATALOG.filter(
      (entry) => entry.appliesTo !== undefined,
    ).map((entry) => entry.type);

    expect(conditional).toEqual([NotificationType.HOST_CAPACITY_UNLOCKED]);
  });
});
