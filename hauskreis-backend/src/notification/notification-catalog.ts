import { NotificationType } from '../../generated/prisma/enums';

/**
 * How a notification decides *when* it fires — and therefore which knob the
 * settings screen offers for it.
 *
 * Not every type has a rhythm. Asking "how often" about "you have new prayer
 * buddies" makes no sense: it happens when it happens. Those are `EVENT` and
 * offer nothing but on/off.
 */
export type NotificationSchedule =
  | {
      /** Fires ahead of a meeting; the person chooses how far ahead. */
      kind: 'LEAD_TIME';
      defaultLeadDays: number;
      minLeadDays: number;
      maxLeadDays: number;
    }
  | {
      /**
       * Fires on chosen weekdays. More than one is allowed: a nudge midweek
       * and another shortly before the next evening are different reminders,
       * not the same one sent twice.
       */
      kind: 'WEEKLY';
      /** 0 = Sunday, 6 = Saturday — same numbering as `Date.getUTCDay()`. */
      defaultWeekdays: readonly number[];
    }
  | {
      /** Fires when something happens. On/off is the only choice. */
      kind: 'EVENT';
    };

export interface NotificationDefinition {
  type: NotificationType;
  /** Heading in the settings list. */
  label: string;
  /** Answers "why am I getting this", in the app's own voice. */
  description: string;
  schedule: NotificationSchedule;
  /**
   * Whether a person gets this without ever visiting the settings. False only
   * where the notification is genuinely optional noise for most people.
   */
  defaultEnabled: boolean;
}

/**
 * Every notification the app can send, in the order the settings screen shows
 * them: the ones about your own responsibilities first, then the group's.
 *
 * **This is the extension point.** A new notification type is an enum value, an
 * entry here, and a service that sends it. It then appears in the settings with
 * its label and default, gets validated bounds for its knob, and is switchable
 * off — without the settings endpoint, the DTO or the frontend list being
 * touched. `notification-catalog.spec.ts` fails if an enum value has no entry,
 * so the second step cannot be forgotten.
 *
 * Deliberately code and not a table: a notification is a trigger, an audience
 * and a text, and only the text is data. Making the other two editable at
 * runtime would mean building a rule language — weeks of work for something
 * nobody could debug when it misfires.
 */
export const NOTIFICATION_CATALOG: readonly NotificationDefinition[] = [
  {
    type: NotificationType.HOST_REMINDER,
    label: 'Du hostest',
    description: 'Erinnerung, bevor der Hauskreis bei dir stattfindet.',
    // Saturday for the Tuesday: enough time to tidy up and shop, not so early
    // that it is forgotten again.
    schedule: {
      kind: 'LEAD_TIME',
      defaultLeadDays: 3,
      minLeadDays: 1,
      maxLeadDays: 14,
    },
    defaultEnabled: true,
  },
  {
    type: NotificationType.TOPIC_REMINDER,
    label: 'Du bereitest das Thema vor',
    description:
      'Erinnerung, bevor du mit dem Thema dran bist — auch wenn es sich über mehrere Abende zieht.',
    // Longer than hosting on purpose: preparing content needs more runway than
    // tidying a living room.
    schedule: {
      kind: 'LEAD_TIME',
      defaultLeadDays: 5,
      minLeadDays: 1,
      maxLeadDays: 14,
    },
    defaultEnabled: true,
  },
  {
    type: NotificationType.SONG_REMINDER,
    label: 'Du machst Musik',
    description:
      'Erinnerung, bevor du für die Lieder eines Abends zuständig bist.',
    schedule: {
      kind: 'LEAD_TIME',
      defaultLeadDays: 5,
      minLeadDays: 1,
      maxLeadDays: 14,
    },
    defaultEnabled: true,
  },
  {
    type: NotificationType.ACTIONSTEP_REMINDER,
    label: 'Actionstep der Woche',
    description:
      'Nachfrage mitten in der Woche, was aus dem Actionstep vom letzten Mal geworden ist.',
    // Friday sits between two Tuesdays and still leaves the weekend to act on
    // it — a Monday reminder would arrive when the week is already over.
    schedule: { kind: 'WEEKLY', defaultWeekdays: [5] },
    defaultEnabled: true,
  },
  {
    type: NotificationType.ROLE_ASSIGNED,
    label: 'Du wurdest eingeteilt',
    // Ein Eintrag für Gastgeber, Thema und Musik zusammen, nicht drei. Die
    // Erinnerungen darüber sind einzeln einstellbar, weil man sie
    // unterschiedlich früh braucht; hier gibt es nichts einzustellen, und drei
    // Schalter für dieselbe Frage machen die Liste schlechter.
    description:
      'Sobald dich jemand für einen kommenden Abend einträgt — als Gastgeber, fürs Thema oder für die Musik.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.PRAYER_BUDDY_ASSIGNED,
    label: 'Neue Gebetsbuddys',
    description: 'Wer in der neuen Runde mit dir betet.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.MEETING_CANCELLED,
    label: 'Hauskreis fällt aus',
    // Beide Richtungen, ein Abo: wer wissen will, dass der Abend ausfällt, will
    // auch wissen, dass er doch stattfindet. Ein zweiter Schalter dafür wäre
    // eine Einstellung für einen Sonderfall.
    description:
      'Wenn ein ganzer Abend abgesagt wird — oder doch wieder stattfindet.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.ATTENDANCE_DECLINED,
    label: 'Jemand sagt ab',
    description:
      'Wenn jemand für einen Abend absagt, den du hostest — damit du beim Einkaufen Bescheid weißt.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.HOST_CAPACITY_UNLOCKED,
    label: 'Bei euch wäre jetzt Platz',
    description:
      'Wenn genug Leute abgesagt haben, dass der Hauskreis auch in eure Wohnung passt.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
];

const byType = new Map(
  NOTIFICATION_CATALOG.map((definition) => [definition.type, definition]),
);

export function notificationDefinition(
  type: NotificationType,
): NotificationDefinition {
  const definition = byType.get(type);

  if (!definition) {
    // Only reachable when an enum value was added without a catalog entry,
    // which the catalog spec catches long before a request does.
    throw new Error(`No catalog entry for notification type ${type}`);
  }

  return definition;
}
