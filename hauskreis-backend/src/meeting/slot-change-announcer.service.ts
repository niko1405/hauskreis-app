import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { MeetingStatus, NotificationType } from '../../generated/prisma/enums';
import { formatShortDate } from '../notification/reminder-copy';
import { appPath } from '../notification/app-paths';
import { GroupClockService } from './group-clock.service';
import {
  OPEN_ROLES_SELECT,
  findNextMeetingId,
  openRoles,
  plannedAttendees,
  type RoleFlags,
} from './next-meeting';

/**
 * Die Bausteine, die man **plant** — und über die man deshalb Bescheid wissen
 * muss.
 *
 * Die Nachbereitung fehlt mit Absicht: Sie kommt erst am Abend selbst dazu,
 * wenn es etwas nachzubereiten gibt. Wer sie anschaltet, plant nichts um.
 */
export const ANNOUNCED_SLOTS = [
  'hasTopicSlot',
  'hasSongSlot',
  'hasTestimonySlot',
  'hasPrayerSlot',
  'hasSnackSlot',
] as const;

export type AnnouncedSlot = (typeof ANNOUNCED_SLOTS)[number];
export type SlotState = Record<AnnouncedSlot, boolean>;

/**
 * Wie lange nach der letzten Änderung gewartet wird.
 *
 * Ein Haken im Bausteinkasten schreibt sofort. Wer drei Bausteine umstellt,
 * schickte ohne diese Pause drei Nachrichten — und wer sich verklickt und den
 * Haken gleich wieder setzt, eine über etwas, das nie war.
 */
export const SETTLE_MS = 2 * 60 * 1000;

interface Pending {
  hauskreisId: string;
  /** Der Stand vor der **ersten** Änderung dieser Runde. */
  before: SlotState;
  /** Alle, die in dieser Runde etwas geändert haben — sie wissen es schon. */
  actors: Set<string>;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * „Am nächsten Abend gibt es jetzt auch Lieder."
 *
 * An die, die zugesagt haben oder noch unentschieden sind: Wer abgesagt hat,
 * dem ist egal, was es an dem Abend gibt. Nur für den **nächsten** Abend, aus
 * demselben Grund wie bei der Uhrzeit — was sich in fünf Wochen ändert, liest
 * man, wenn man hinschaut.
 *
 * **Der Zeitgeber lebt im Prozess.** Startet der Server in den zwei Minuten
 * neu, geht diese eine Nachricht verloren. Das ist hinnehmbar: Die Änderung
 * steht am Termin, und am Morgen des Abends fragt ohnehin `MEETING_TODAY`
 * nach. Eine Tabelle für zwei Minuten Warten wäre mehr Bauteil als Nutzen.
 */
@Injectable()
export class SlotChangeAnnouncer implements OnModuleDestroy {
  private readonly logger = new Logger(SlotChangeAnnouncer.name);
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly clock: GroupClockService,
  ) {}

  /**
   * Merkt sich eine Änderung und schiebt die Nachricht auf.
   *
   * Der **erste** Vorher-Stand bleibt stehen, die späteren werden verworfen:
   * Verglichen wird am Ende, was vor der ganzen Runde war, mit dem, was jetzt
   * ist. An und wieder aus heißt so: nichts.
   */
  noteChange(params: {
    hauskreisId: string;
    meetingId: string;
    before: SlotState;
    after: SlotState;
    actorPersonId: string;
  }): void {
    if (sameSlots(params.before, params.after)) return;

    const existing = this.pending.get(params.meetingId);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      void this.flush(params.meetingId);
    }, SETTLE_MS);
    // Ein wartender Zeitgeber soll den Prozess nicht am Beenden hindern.
    timer.unref?.();

    this.pending.set(params.meetingId, {
      hauskreisId: params.hauskreisId,
      before: existing?.before ?? params.before,
      actors: new Set([...(existing?.actors ?? []), params.actorPersonId]),
      timer,
    });
  }

  /** Schickt, was für diesen Abend wartet. Öffentlich für die Tests. */
  async flush(meetingId: string): Promise<number> {
    const entry = this.pending.get(meetingId);
    if (!entry) return 0;

    this.pending.delete(meetingId);
    clearTimeout(entry.timer);

    try {
      return await this.announce(meetingId, entry);
    } catch (error) {
      this.logger.warn(
        `Could not announce slot change for ${meetingId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
  }

  onModuleDestroy(): void {
    for (const entry of this.pending.values()) clearTimeout(entry.timer);
    this.pending.clear();
  }

  private async announce(meetingId: string, entry: Pending): Promise<number> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        hauskreisId: true,
        date: true,
        status: true,
        hasPrayerSlot: true,
        ...OPEN_ROLES_SELECT,
      },
    });

    if (!meeting || meeting.status !== MeetingStatus.PLANNED) return 0;

    // Erst jetzt und nicht beim Merken: Was „der nächste" ist, entscheidet sich
    // an dem Stand, über den die Nachricht spricht.
    const today = await this.clock.today(meeting.hauskreisId);
    const next = await findNextMeetingId(
      this.prisma,
      meeting.hauskreisId,
      today,
    );
    if (next !== meeting.id) return 0;

    const added = ANNOUNCED_SLOTS.filter(
      (slot) => !entry.before[slot] && meeting[slot],
    );
    const removed = ANNOUNCED_SLOTS.filter(
      (slot) => entry.before[slot] && !meeting[slot],
    );
    if (added.length === 0 && removed.length === 0) return 0;

    const recipients = (
      await plannedAttendees(this.prisma, meeting.hauskreisId, meeting.id)
    ).filter((personId) => !entry.actors.has(personId));

    // Eine neue Runde ersetzt die alte, wie bei der Uhrzeit: Sonst hielte die
    // Entdopplung die zweite Änderung für eine Wiederholung der ersten.
    await this.prisma.notificationLog.deleteMany({
      where: {
        type: NotificationType.MEETING_SLOTS_CHANGED,
        relatedMeetingId: meeting.id,
      },
    });

    const body = describeSlotChange(
      meeting.date,
      added,
      removed,
      openRoles(meeting),
    );

    const results = await Promise.all(
      recipients.map((personId) =>
        this.notifications
          .notify({
            personId,
            type: NotificationType.MEETING_SLOTS_CHANGED,
            relatedMeetingId: meeting.id,
            payload: {
              title: 'Der nächste Abend ändert sich',
              body,
              url: appPath.meeting(meeting.id),
            },
          })
          .catch(() => ({ skipped: 1 })),
      ),
    );

    return results.filter((result) => result.skipped === 0).length;
  }
}

function sameSlots(a: SlotState, b: SlotState): boolean {
  return ANNOUNCED_SLOTS.every((slot) => a[slot] === b[slot]);
}

/** Wie ein Baustein im Satz heißt — dazukommend, wegfallend, zu besetzen. */
const WORDS: Record<
  AnnouncedSlot,
  { neu: string; weg: string; plural: boolean; role: keyof RoleFlags | null }
> = {
  hasTopicSlot: {
    neu: 'ein Thema',
    weg: 'das Thema',
    plural: false,
    role: 'topic',
  },
  hasSongSlot: { neu: 'Lieder', weg: 'die Lieder', plural: true, role: 'song' },
  hasTestimonySlot: {
    neu: 'ein Testimony',
    weg: 'das Testimony',
    plural: false,
    role: 'testimony',
  },
  // Die Gebetsanliegen haben keine Rolle: Sie bringt jede:r selbst mit.
  hasPrayerSlot: {
    neu: 'Gebetsanliegen',
    weg: 'die Gebetsanliegen',
    plural: true,
    role: null,
  },
  hasSnackSlot: {
    neu: 'Snacks',
    weg: 'die Snacks',
    plural: true,
    role: 'snack',
  },
};

/** Wer für etwas zuständig wäre, im Akkusativ nach „für". */
const ROLE_WORDS: Record<keyof RoleFlags, string> = {
  host: 'den Gastgeber-Platz',
  topic: 'das Thema',
  song: 'die Musik',
  testimony: 'das Testimony',
  snack: 'die Snacks',
};

function list(words: string[]): string {
  return words.length === 1
    ? words[0]
    : `${words.slice(0, -1).join(', ')} und ${words[words.length - 1]}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * „Am 4. August gibt es jetzt auch Lieder und Snacks. Für die Musik und die
 * Snacks muss noch jemand eingeteilt werden. Das Thema fällt weg."
 *
 * Der Satz über die Rolle steht nur bei **neuen** Bausteinen, die eine Rolle
 * haben und an denen noch niemand steht. Hat in den zwei Minuten schon jemand
 * sich eingetragen, gibt es nichts mehr zu tun — und eine Aufforderung dazu
 * wäre falsch.
 */
export function describeSlotChange(
  date: Date,
  added: readonly AnnouncedSlot[],
  removed: readonly AnnouncedSlot[],
  open: RoleFlags,
): string {
  const sentences: string[] = [];

  if (added.length > 0) {
    sentences.push(
      `Am ${formatShortDate(date)} gibt es jetzt auch ${list(added.map((slot) => WORDS[slot].neu))}.`,
    );

    const toFill = added
      .map((slot) => WORDS[slot].role)
      .filter((role): role is keyof RoleFlags => role !== null && open[role]);

    if (toFill.length > 0) {
      sentences.push(
        `Für ${list(toFill.map((role) => ROLE_WORDS[role]))} muss noch jemand eingeteilt werden.`,
      );
    }
  }

  if (removed.length > 0) {
    const plural = removed.length > 1 || WORDS[removed[0]].plural;
    const what = capitalize(list(removed.map((slot) => WORDS[slot].weg)));

    sentences.push(
      added.length > 0
        ? `${what} ${plural ? 'fallen' : 'fällt'} weg.`
        : `Am ${formatShortDate(date)} ${plural ? 'fallen' : 'fällt'} ${list(removed.map((slot) => WORDS[slot].weg))} weg.`,
    );
  }

  return sentences.join(' ');
}
