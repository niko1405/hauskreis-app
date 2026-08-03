import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '../../generated/prisma/enums';
import {
  NOTIFICATION_CATALOG,
  type NotificationDefinition,
  type NotificationSchedule,
  notificationDefinition,
} from './notification-catalog';
import type { UpdateNotificationSettingDto } from './dto/notification-setting.dto';

/** A catalog entry with the person's answer folded in. */
export interface EffectiveSetting {
  type: NotificationType;
  label: string;
  description: string;
  schedule: NotificationSchedule;
  enabled: boolean;
  /** Only set for `LEAD_TIME`; the person's value or the catalog default. */
  leadDays: number | null;
  /**
   * Only meaningful for `WEEKLY`: the days this person picked, or the catalog
   * default. Empty for every other kind.
   */
  weekdays: number[];
  /** False while this person has never touched the setting. */
  customised: boolean;
}

type StoredPreference = {
  type: NotificationType;
  enabled: boolean;
  leadDays: number | null;
  weekdays: number[];
};

/**
 * Reads and writes what each person wants to be told about.
 *
 * Absence of a row is the normal state, not a gap: it means "whatever the
 * catalog says". Everything here therefore merges stored rows over catalog
 * defaults rather than expecting a row to exist.
 */
@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** The whole settings screen for one person, in catalog order. */
  async listForPerson(personId: string): Promise<EffectiveSetting[]> {
    const stored = await this.prisma.notificationPreference.findMany({
      where: { personId },
      select: { type: true, enabled: true, leadDays: true, weekdays: true },
    });

    const byType = new Map(stored.map((row) => [row.type, row]));

    return NOTIFICATION_CATALOG.map((definition) =>
      merge(definition, byType.get(definition.type)),
    );
  }

  /**
   * The setting for one person and type, defaults included.
   *
   * Used by the reminder jobs, which need the lead time or weekday before they
   * can decide whether today is the day.
   */
  async resolve(
    personId: string,
    type: NotificationType,
  ): Promise<EffectiveSetting> {
    const stored = await this.prisma.notificationPreference.findUnique({
      where: { personId_type: { personId, type } },
      select: { type: true, enabled: true, leadDays: true, weekdays: true },
    });

    return merge(notificationDefinition(type), stored ?? undefined);
  }

  /**
   * The same for a batch of people, in one query.
   *
   * The reminder jobs need this for everyone in the window at once; one query
   * per person would be a handful of round trips per run for no benefit.
   */
  async resolveMany(
    personIds: string[],
    type: NotificationType,
  ): Promise<Map<string, EffectiveSetting>> {
    const definition = notificationDefinition(type);

    if (personIds.length === 0) {
      return new Map();
    }

    const stored = await this.prisma.notificationPreference.findMany({
      where: { personId: { in: personIds }, type },
      select: {
        personId: true,
        type: true,
        enabled: true,
        leadDays: true,
        weekdays: true,
      },
    });

    const byPerson = new Map(stored.map((row) => [row.personId, row]));

    return new Map(
      personIds.map((personId) => [
        personId,
        merge(definition, byPerson.get(personId)),
      ]),
    );
  }

  /**
   * Changes one setting. Writes only the knobs the type actually has — sending
   * a lead time for an event-driven notification is a mistake worth reporting
   * rather than a value to store and never read.
   */
  async update(
    personId: string,
    type: NotificationType,
    dto: UpdateNotificationSettingDto,
  ): Promise<EffectiveSetting> {
    const definition = notificationDefinition(type);
    const { leadDays, weekdays } = this.validateKnobs(definition, dto);

    const saved = await this.prisma.notificationPreference.upsert({
      where: { personId_type: { personId, type } },
      create: {
        personId,
        type,
        enabled: dto.enabled ?? definition.defaultEnabled,
        leadDays,
        weekdays,
      },
      update: {
        enabled: dto.enabled,
        // `undefined` leaves the stored value alone, `null` returns the person
        // to the catalog default.
        leadDays: dto.leadDays,
        // Die geprüfte Liste, nicht die eingegangene: sonst landeten doppelte
        // Tage in der Datenbank, sobald die Zeile schon existiert. Bei einer
        // Liste tut `null` dasselbe wie eine leere — „wie im Katalog".
        weekdays: dto.weekdays === undefined ? undefined : weekdays,
      },
      select: { type: true, enabled: true, leadDays: true, weekdays: true },
    });

    return merge(definition, saved);
  }

  private validateKnobs(
    definition: NotificationDefinition,
    dto: UpdateNotificationSettingDto,
  ): { leadDays: number | null; weekdays: number[] } {
    const { schedule } = definition;

    if (dto.leadDays !== undefined && dto.leadDays !== null) {
      if (schedule.kind !== 'LEAD_TIME') {
        throw new BadRequestException(
          `${definition.type} is not sent ahead of a meeting, so it has no lead time`,
        );
      }

      if (
        dto.leadDays < schedule.minLeadDays ||
        dto.leadDays > schedule.maxLeadDays
      ) {
        // Bounds live in the catalog rather than in the DTO: they differ per
        // type, and a single Zod schema cannot know which type it is validating.
        throw new BadRequestException(
          `leadDays must be between ${schedule.minLeadDays} and ${schedule.maxLeadDays} for ${definition.type}`,
        );
      }
    }

    if (
      dto.weekdays !== undefined &&
      dto.weekdays !== null &&
      dto.weekdays.length > 0 &&
      schedule.kind !== 'WEEKLY'
    ) {
      throw new BadRequestException(
        `${definition.type} is not sent on fixed weekdays`,
      );
    }

    return {
      leadDays: dto.leadDays ?? null,
      // Doppelte Tage wären zwei Erinnerungen am selben Tag; sortiert, damit
      // die Oberfläche sie nicht selbst ordnen muss.
      weekdays: [...new Set(dto.weekdays ?? [])].toSorted((a, b) => a - b),
    };
  }
}

function merge(
  definition: NotificationDefinition,
  stored?: StoredPreference,
): EffectiveSetting {
  const { schedule } = definition;

  return {
    type: definition.type,
    label: definition.label,
    description: definition.description,
    schedule,
    enabled: stored?.enabled ?? definition.defaultEnabled,
    leadDays:
      schedule.kind === 'LEAD_TIME'
        ? (stored?.leadDays ?? schedule.defaultLeadDays)
        : null,
    weekdays:
      schedule.kind === 'WEEKLY'
        ? whicheverIsSet(stored?.weekdays, schedule.defaultWeekdays)
        : [],
    customised: stored !== undefined,
  };
}

/** Eine leere Liste heißt „nicht eingestellt" — dann gilt der Katalog. */
function whicheverIsSet(
  chosen: number[] | undefined,
  fallback: readonly number[],
): number[] {
  return chosen && chosen.length > 0 ? chosen : [...fallback];
}
