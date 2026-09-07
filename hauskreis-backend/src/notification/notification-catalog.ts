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

/**
 * Was über die Person bekannt sein muss, um zu entscheiden, ob ein Schalter für
 * sie überhaupt etwas bedeutet.
 *
 * Bewusst schmal: nur, was `appliesTo` tatsächlich liest. Ein Kontext, in dem
 * vorsorglich alles steht, wird bei jedem Aufruf teuer und bei der nächsten
 * Frage trotzdem unvollständig.
 */
export interface NotificationContext {
  /** Kapazität der eigenen Wohnung. `null` heißt „alle passen rein". */
  homeCapacity: number | null;
  /** Wie viele Menschen der Hauskreis gerade hat. */
  activeMembers: number;
  /** Ob die Gruppe Gebetsbuddys hat. */
  prayerBuddies: boolean;
  /** Ob der Actionstep der Woche auf dem Startbildschirm steht. */
  weeklyActionstep: boolean;
}

/**
 * Wohin eine Nachricht in der Einstellungsliste gehört.
 *
 * Zwanzig Arten untereinander sind keine Liste mehr, sondern eine Wand — man
 * findet den einen Schalter nicht, den man sucht. Die Kategorie steht **hier**
 * und nicht im Frontend: Eine zweite Aufzählung dort wäre die, die beim nächsten
 * neuen Eintrag vergessen wird, und der Schalter stünde dann unter „Sonstiges"
 * oder gar nicht.
 *
 * Die Reihenfolge ist die der Anzeige und geht von innen nach außen: erst, was
 * man selbst zu tun hat, dann der Abend, dann sein Nachklang, dann die Gruppe.
 */
export const NOTIFICATION_CATEGORIES = [
  'Deine Rollen',
  'Termine',
  'Nach dem Abend',
  'Gebet',
  'Geburtstage',
  'Gruppe & App',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface NotificationDefinition {
  type: NotificationType;
  /** Unter welcher Überschrift der Schalter steht. */
  category: NotificationCategory;
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
  /**
   * Ob dieser Schalter für diese Person überhaupt etwas bewirken kann. Fehlt er,
   * gilt der Eintrag für alle — der Normalfall.
   *
   * Wirkt **nur auf die Anzeige** (`listForPerson`), nie auf `resolve()`. Sonst
   * verschwände mit dem Schalter auch die Nachricht: wer heute keine Kapazität
   * gesetzt hat, bekäme morgen mit gesetzter Kapazität keine Einladung mehr,
   * weil beim Versand niemand mehr nachfragt.
   */
  appliesTo?: (context: NotificationContext) => boolean;
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
    category: 'Deine Rollen',
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
    type: NotificationType.TESTIMONY_REMINDER,
    category: 'Deine Rollen',
    label: 'Du erzählst dein Testimony',
    description:
      'Erinnerung, bevor du an einem Lobpreis- und Gebetsabend deine Geschichte erzählst.',
    // Wie beim Thema und aus demselben Grund: was man erzählen will, sortiert
    // man nicht am Abend selbst.
    schedule: {
      kind: 'LEAD_TIME',
      defaultLeadDays: 5,
      minLeadDays: 1,
      maxLeadDays: 14,
    },
    defaultEnabled: true,
  },
  {
    type: NotificationType.TOPIC_REMINDER,
    category: 'Deine Rollen',
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
    category: 'Deine Rollen',
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
    type: NotificationType.SNACK_REMINDER,
    category: 'Deine Rollen',
    label: 'Du bringst was mit',
    description:
      'Erinnerung, bevor du für die Snacks eines Abends zuständig bist.',
    // Zwei Tage statt fünf wie bei der Musik: Einkaufen ist ein Gang, kein
    // Vorbereiten. Wer eine längere Vorlaufzeit will, stellt sie im Profil um.
    schedule: {
      kind: 'LEAD_TIME',
      defaultLeadDays: 2,
      minLeadDays: 1,
      maxLeadDays: 14,
    },
    defaultEnabled: true,
  },
  {
    type: NotificationType.ACTIONSTEP_REMINDER,
    category: 'Nach dem Abend',
    // Hat die Gruppe den Wochen-Actionstep abgeschaltet, gibt es hier nichts
    // einzustellen — der Lauf schickt ohnehin nichts mehr.
    appliesTo: (context) => context.weeklyActionstep,
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
    category: 'Deine Rollen',
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
    type: NotificationType.MEETING_TODAY,
    category: 'Termine',
    label: 'Heute ist Hauskreis',
    // Der eine Tag, an dem die App bisher schwieg — obwohl an ihm alles
    // entschieden wird. Die Nachricht sagt Uhrzeit und Ort und stellt gleich
    // die Frage nach: Wer abgesagt hat, wird gefragt, ob das noch stimmt.
    description:
      'Am Morgen des Termintags — mit Uhrzeit, Ort und der Nachfrage, ob deine Antwort noch gilt.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.NOTES_REMINDER,
    category: 'Nach dem Abend',
    label: 'Nachbereitung eintragen',
    // Nur an Abenden ohne Thema, und das steht auch in der Beschreibung: Am
    // Themen-Abend gehören Zusammenfassung und Actionstep der Einheit, und
    // schreiben darf sie deren Crew. Eine Aufforderung an alle wäre dort eine
    // Einladung in eine Fehlermeldung.
    description:
      'Am Tag nach einem Abend ohne Thema, an dem noch keine Zusammenfassung und kein Actionstep stehen.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.PRAYER_BUDDY_ASSIGNED,
    category: 'Gebet',
    appliesTo: (context) => context.prayerBuddies,
    label: 'Neue Gebetsbuddys',
    description: 'Wer in der neuen Runde mit dir betet.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.MEETING_CANCELLED,
    category: 'Termine',
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
    type: NotificationType.MEETING_TIME_CHANGED,
    category: 'Termine',
    label: 'Der nächste Abend fängt anders an',
    // Nur der nächste, und deshalb steht das auch in der Beschreibung: eine
    // verschobene Uhrzeit in fünf Wochen liest man, wenn man hinschaut. Beim
    // nächsten Abend steht man sonst vor der Tür.
    description:
      'Wenn sich die Uhrzeit des nächsten Treffens ändert — die eine Änderung, von der man vorher wissen muss.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.ATTENDANCE_DECLINED,
    category: 'Termine',
    label: 'Jemand sagt ab',
    // Zwei Nachrichten, ein Schalter — beschrieben werden deshalb auch beide.
    // Die zweite geht an alle und ist die einzige Absage, die etwas zu tun
    // übrig lässt; ein eigener Eintrag dafür machte die Liste länger und die
    // Entscheidung nicht klarer (siehe `announceReleasedRoles`).
    description:
      'Wenn jemand für einen Abend absagt, den du hostest — und wenn dadurch eine Rolle frei wird, etwa das Thema oder die Musik.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.HOST_CAPACITY_UNLOCKED,
    category: 'Termine',
    label: 'Bei euch wäre jetzt Platz',
    description:
      'Wenn genug Leute abgesagt haben, dass der Hauskreis auch in eure Wohnung passt.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
    // Diese Nachricht kann nur jemanden erreichen, dessen Wohnung für die volle
    // Gruppe **zu klein** ist — sonst gibt es nichts freizuschalten. Bei allen
    // anderen stand bisher ein Schalter, der nie etwas tat: eine Einstellung
    // ohne Wirkung ist schlimmer als keine, weil man ihr glaubt.
    appliesTo: (context) =>
      context.homeCapacity !== null &&
      context.homeCapacity < context.activeMembers,
  },
  {
    type: NotificationType.MEMBER_LEFT,
    category: 'Gruppe & App',
    label: 'Jemand verlässt den Hauskreis',
    // Auch die Nachfolge hängt hier mit drin: „du bist jetzt Admin" ist ein
    // Satz mehr in derselben Nachricht und kein zehnter Eintrag in dieser
    // Liste — den bräuchte es für einen Fall, den man ein- oder zweimal im Jahr
    // erlebt.
    description:
      'Wenn jemand geht — und was dadurch offen bleibt, etwa ein Abend ohne Gastgeber.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.CUSTOM_MEETING_CREATED,
    category: 'Termine',
    label: 'Ein besonderer Termin kommt dazu',
    description:
      'Sobald jemand einen Geburtstag, eine Freizeit oder Ähnliches einträgt.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.CUSTOM_MEETING_REMINDER,
    category: 'Termine',
    label: 'Ein besonderer Termin steht an',
    // Getrennt von der Ankündigung, weil es zwei verschiedene Fragen sind: „gibt
    // es etwas Neues" beantwortet man einmal, „ich muss daran denken" braucht
    // eine Vorlaufzeit. In einem Schalter ließe sich das nicht ausdrücken.
    description:
      'Kurz vorher nochmal — anders als beim Dienstagabend hat man den nicht im Kopf.',
    schedule: {
      kind: 'LEAD_TIME',
      // Zwei Tage statt der drei beim Hosten: hier muss niemand aufräumen,
      // sondern nur daran denken.
      defaultLeadDays: 2,
      minLeadDays: 1,
      maxLeadDays: 14,
    },
    defaultEnabled: true,
  },
  {
    type: NotificationType.BIRTHDAY_GIFT_ASSIGNED,
    category: 'Geburtstage',
    label: 'Du besorgst ein Geschenk',
    // Ein Ereignis und keine Vorlaufzeit: Der Anlass ist nicht der Geburtstag,
    // sondern dass sich die Zuteilung geändert hat. Wann das passiert, weiß
    // vorher niemand.
    description:
      'Wenn du für den Geburtstag von jemandem zuständig wirst — oder es doch nicht mehr bist.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.BIRTHDAY_GIFT_REMINDER,
    category: 'Geburtstage',
    label: 'Ein Geburtstag steht an',
    description:
      'Rechtzeitig vorher, damit noch Zeit zum Besorgen bleibt. Bestimmt auch, ab wann der Geburtstag unter „Deine Rollen“ auftaucht.',
    schedule: {
      kind: 'LEAD_TIME',
      // Zwei Wochen, und damit deutlich länger als bei allem anderen: Ein
      // Geschenk muss man sich ausdenken, bestellen und liefern lassen. Drei
      // Tage vorher wäre die Erinnerung schon die Nachricht, dass es zu spät
      // ist. Deckt sich mit der Vorgabe für die Frist, ab der die Zuteilung
      // fest ist — beides beantwortet dieselbe Frage.
      defaultLeadDays: 14,
      minLeadDays: 1,
      maxLeadDays: 60,
    },
    defaultEnabled: true,
  },
  {
    type: NotificationType.BIRTHDAY_GIFT_DECIDED,
    category: 'Geburtstage',
    label: 'Ein Geschenk steht fest',
    description:
      'Wenn entschieden ist, was es wird, oder was es gekostet hat. Wer Geburtstag hat, bekommt davon nichts mit.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.ADMIN_GRANTED,
    category: 'Gruppe & App',
    label: 'Du wirst Admin',
    // Nur diese Richtung. Der Katalog trägt keinen Gegeneintrag, weil es keine
    // Nachricht gibt: Etwas bekommen ist eine Ankündigung, etwas verlieren ist
    // ein Gespräch.
    description: 'Wenn dir jemand die Verwaltung des Hauskreises anvertraut.',
    schedule: { kind: 'EVENT' },
    defaultEnabled: true,
  },
  {
    type: NotificationType.RELEASE_NOTES,
    category: 'Gruppe & App',
    label: 'Neues in der App',
    // Steht als letzte in der Liste, weil sie als einzige nichts mit dem
    // Hauskreis zu tun hat, sondern mit der App darüber.
    description:
      'Lass dich über neue Features informieren, wenn sie erscheinen.',
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
