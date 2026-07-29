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

  it('uses a real weekday for every weekly reminder', () => {
    const invalid = NOTIFICATION_CATALOG.filter(
      (entry) =>
        entry.schedule.kind === 'WEEKLY' &&
        (entry.schedule.defaultWeekday < 0 ||
          entry.schedule.defaultWeekday > 6),
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
