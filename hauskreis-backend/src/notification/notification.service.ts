import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import webpush, { WebPushError } from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/config.service';
import { NotificationPreferenceService } from './notification-preference.service';
import type {
  AssignmentRole,
  NotificationType,
} from '../../generated/prisma/enums';

type DeliveryOutcome = 'delivered' | 'pruned' | 'failed';

export interface NotificationPayload {
  title: string;
  body: string;
  /** Where the PWA should navigate when the notification is clicked. */
  url?: string;
}

/**
 * Was tatsächlich über die Leitung geht.
 *
 * Die Id kommt erst beim Zustellen dazu und steht deshalb nicht in
 * `NotificationPayload`: Kein Aufrufer kennt sie, sie entsteht in `notify()`.
 * Der Service Worker hängt sie beim Antippen an die Ziel-Adresse — er hat kein
 * Token und kann den Eintrag nicht selbst auf gelesen setzen.
 */
interface PushBody extends NotificationPayload {
  notificationId?: string;
}

export interface DeliveryResult {
  /** Push messages actually accepted by a push service. */
  delivered: number;
  /** Endpoints the push service reported as gone; these were deleted. */
  pruned: number;
  /** Deliveries that failed for another reason; the endpoint was kept. */
  failed: number;
}

export interface SendResult extends DeliveryResult {
  /**
   * No attempt was made: already logged, switched off by the recipient, or
   * push is not configured.
   */
  skipped: number;
}

/**
 * Sends Web Push messages and records what was sent.
 *
 * Every reminder job goes through here rather than talking to `web-push`
 * itself, so deduplication, dead-endpoint cleanup and the "push is not
 * configured" case are handled the same way everywhere.
 */
@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private enabled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly preferences: NotificationPreferenceService,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get('VAPID_PRIVATE_KEY');

    if (!publicKey || !privateKey) {
      // Deliberately not fatal: local development and tests should not need
      // push credentials just to boot the app.
      this.logger.warn(
        'VAPID keys are not configured — push notifications are disabled.',
      );
      return;
    }

    webpush.setVapidDetails(
      this.config.get('VAPID_SUBJECT'),
      publicKey,
      privateKey,
    );
    this.enabled = true;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** The key the frontend needs to create a subscription. */
  getPublicKey(): string | undefined {
    return this.config.get('VAPID_PUBLIC_KEY');
  }

  /**
   * Legt den Eintrag in der Box an und schickt ihn, wenn er geschickt werden
   * darf — höchstens einmal je Gegenstand.
   *
   * **Zwei Dinge, die einmal eines waren.** Bis hierher entschied die bloße
   * Existenz einer Log-Zeile beides: ob die Nachricht schon rausging *und* ob
   * es sie überhaupt gab. Seit hinter der Glocke eine Box hängt, sind das
   * verschiedene Fragen. Der **Eintrag** entsteht immer — auch bei
   * abgeschalteter Art, auch ohne VAPID-Schlüssel: In der Box zu stehen stört
   * niemanden, und wer die Erinnerung ans Hosten stummgeschaltet hat, will
   * trotzdem nachlesen können, dass er dran ist. Der **Push** hängt ab jetzt
   * an `pushedAt`.
   *
   * Ohne diese Trennung ginge die Eigenschaft verloren, auf die die täglichen
   * Läufe gebaut sind: Eine abgeschaltete Art schrieb bewusst *nichts*, damit
   * ein späteres Wiedereinschalten noch zustellt. Schriebe sie jetzt eine
   * Zeile und hänge die Entdopplung weiter daran, wäre die Nachricht für immer
   * verschluckt.
   *
   * Geschrieben wird *vor* dem Zustellen: Ein Absturz mitten im Senden kostet
   * so eine ausgefallene Erinnerung statt einer täglichen Wiederholung.
   *
   * Was „einmal je Gegenstand" heißt, entscheidet der Aufrufer: Termin,
   * Gebetsgruppe oder die Person, um die es geht — die Kombination ist der
   * Schlüssel.
   */
  async notify(params: {
    personId: string;
    type: NotificationType;
    relatedMeetingId?: string | null;
    /// What a prayer buddy assignment refers to. Without it every rotation
    /// would look like the first one and only that would ever be announced.
    relatedGroupId?: string | null;
    /// Who the message is *about*, when that differs from the recipient.
    relatedPersonId?: string | null;
    /// Welche Rolle gemeint war. Nur für `ROLE_ASSIGNED`: wer an einem Abend
    /// Gastgeber **und** für die Musik eingeteilt wird, soll zweimal hören,
    /// dass er dran ist.
    relatedRole?: AssignmentRole | null;
    /// Welche Fassung der App angekündigt wurde. Nur für `RELEASE_NOTES` —
    /// ohne das wären dort alle Felder darüber leer, und je Person käme genau
    /// eine Ankündigung durch, für immer.
    relatedReleaseVersion?: string | null;
    /// Welcher Geburtstag gemeint war — die Runde, nicht die Person. Ohne das
    /// wäre „du besorgst das Geschenk für Mira" in jedem Jahr dieselbe
    /// Nachricht wie im ersten und käme genau einmal im Leben an.
    relatedOccasionId?: string | null;
    /// Ein freier Unterscheider, wenn derselbe Gegenstand aus verschiedenem
    /// Anlass mehrmals melden darf: der Tag bei einer Erinnerung, die an
    /// mehreren Wochentagen kommt; das Feld beim Rückblick auf einen Abend.
    /// Ohne ihn ging an einem zweiten gewählten Wochentag nichts mehr raus —
    /// der Termin allein war schon „erledigt".
    relatedKey?: string | null;
    payload: NotificationPayload;
  }): Promise<SendResult> {
    // Erst der Eintrag, dann die Frage nach dem Push. Die Reihenfolge ist die
    // Aussage: In der Box steht es unabhängig davon, ob es auch klingelt.
    const entry = await this.record(params);

    const setting = await this.preferences.resolve(
      params.personId,
      params.type,
    );

    if (!setting.enabled) {
      // `pushedAt` bleibt leer, und genau daran hängt es: Wer die Art später
      // wieder einschaltet, bekommt beim nächsten Lauf noch zugestellt.
      this.logger.debug(
        `Person ${params.personId} has ${params.type} switched off`,
      );
      return { delivered: 0, skipped: 1, pruned: 0, failed: 0 };
    }

    if (!this.enabled) {
      // Dasselbe ohne VAPID-Schlüssel: nichts versucht, also nichts vermerkt.
      // Sobald die Schlüssel stehen, geht die Erinnerung noch raus, statt
      // stillschweigend verschluckt worden zu sein.
      this.logger.debug(
        `Push disabled, not sending ${params.type} to person ${params.personId}`,
      );
      return { delivered: 0, skipped: 1, pruned: 0, failed: 0 };
    }

    if (entry.pushedAt !== null) {
      return { delivered: 0, skipped: 1, pruned: 0, failed: 0 };
    }

    // Vor dem Senden, aus demselben Grund wie eh und je: Ein Absturz mitten im
    // Zustellen kostet eine ausgefallene Erinnerung und nicht eine tägliche
    // Wiederholung.
    await this.prisma.notificationLog.update({
      where: { id: entry.id },
      data: { pushedAt: new Date() },
    });

    const result = await this.sendToPerson(params.personId, {
      ...params.payload,
      notificationId: entry.id,
    });
    return { ...result, skipped: 0 };
  }

  /**
   * Die Zeile für die Box — vorhandene gefunden oder neue angelegt.
   *
   * Der Text wird aufgefrischt, **solange nichts zugestellt wurde**. Läuft die
   * Erinnerung täglich und stand am ersten Tag „in fünf Tagen", während sie
   * erst am dritten rausgehen darf, soll in der Box nicht die alte Fassung
   * stehen. War sie dagegen schon draußen, bleibt sie, wie sie ankam: Was
   * jemand gelesen hat, soll morgen nicht anders dastehen — und ein Schreiben
   * je Person und Tag, das nichts ändert, wäre ohnehin eines zu viel.
   *
   * `sentAt` bleibt in beiden Fällen, wo es war: Es sagt, wann die Sache
   * aufkam, und trägt die Sortierung der Box.
   */
  private async record(params: {
    personId: string;
    type: NotificationType;
    relatedMeetingId?: string | null;
    relatedGroupId?: string | null;
    relatedPersonId?: string | null;
    relatedRole?: AssignmentRole | null;
    relatedReleaseVersion?: string | null;
    relatedOccasionId?: string | null;
    relatedKey?: string | null;
    payload: NotificationPayload;
  }): Promise<{ id: string; pushedAt: Date | null }> {
    const content = {
      title: params.payload.title,
      body: params.payload.body,
      url: params.payload.url ?? null,
    };

    const existing = await this.findEntry(params);

    if (existing) {
      if (existing.pushedAt === null) {
        await this.prisma.notificationLog.update({
          where: { id: existing.id },
          data: content,
        });
      }
      return existing;
    }

    return this.prisma.notificationLog.create({
      data: {
        personId: params.personId,
        type: params.type,
        relatedMeetingId: params.relatedMeetingId ?? null,
        relatedGroupId: params.relatedGroupId ?? null,
        relatedPersonId: params.relatedPersonId ?? null,
        relatedRole: params.relatedRole ?? null,
        relatedReleaseVersion: params.relatedReleaseVersion ?? null,
        relatedOccasionId: params.relatedOccasionId ?? null,
        relatedKey: params.relatedKey ?? null,
        ...content,
      },
      select: { id: true, pushedAt: true },
    });
  }

  /** Delivers to every device of a person, without touching the log. */
  async sendToPerson(
    personId: string,
    payload: PushBody,
  ): Promise<DeliveryResult> {
    if (!this.enabled) {
      this.logger.debug(
        `Push disabled, dropping "${payload.title}" for person ${personId}`,
      );
      return { delivered: 0, pruned: 0, failed: 0 };
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { personId },
    });

    const outcomes = await Promise.all(
      subscriptions.map((subscription) =>
        this.deliver(subscription, payload).catch((error: unknown) =>
          this.handleDeliveryError(
            subscription.id,
            subscription.endpoint,
            error,
          ),
        ),
      ),
    );

    return {
      delivered: outcomes.filter((outcome) => outcome === 'delivered').length,
      pruned: outcomes.filter((outcome) => outcome === 'pruned').length,
      failed: outcomes.filter((outcome) => outcome === 'failed').length,
    };
  }

  private async deliver(
    subscription: { endpoint: string; p256dhKey: string; authKey: string },
    payload: PushBody,
  ): Promise<DeliveryOutcome> {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dhKey, auth: subscription.authKey },
      },
      JSON.stringify(payload),
    );

    return 'delivered';
  }

  /**
   * 404/410 mean the browser dropped the subscription (app uninstalled, cache
   * cleared). Those endpoints are dead for good, so we delete them instead of
   * retrying them forever.
   */
  private async handleDeliveryError(
    subscriptionId: string,
    endpoint: string,
    error: unknown,
  ): Promise<DeliveryOutcome> {
    const statusCode =
      error instanceof WebPushError ? error.statusCode : undefined;

    if (statusCode === 404 || statusCode === 410) {
      await this.prisma.pushSubscription.delete({
        where: { id: subscriptionId },
      });
      this.logger.log(`Removed expired push subscription ${endpoint}`);
      return 'pruned';
    }

    // Anything else (rate limits, outages, a malformed key) may be temporary,
    // so the subscription stays and the next run tries again.
    this.logger.warn(
      `Push delivery failed (${statusCode ?? 'unknown'}) for ${endpoint}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return 'failed';
  }

  /**
   * Die Zeile zu diesem Gegenstand, wenn es sie schon gibt.
   *
   * Die eigentliche Entdopplung — der eindeutige Index kann sie nicht leisten:
   * Postgres hält Zeilen mit einem NULL irgendwo im Tupel für verschieden, und
   * die Gegenstands-Spalten sind mit Absicht alle nullable.
   */
  private findEntry(params: {
    personId: string;
    type: NotificationType;
    relatedMeetingId?: string | null;
    relatedGroupId?: string | null;
    relatedPersonId?: string | null;
    relatedRole?: AssignmentRole | null;
    relatedReleaseVersion?: string | null;
    relatedOccasionId?: string | null;
    relatedKey?: string | null;
  }): Promise<{ id: string; pushedAt: Date | null } | null> {
    return this.prisma.notificationLog.findFirst({
      where: {
        personId: params.personId,
        type: params.type,
        relatedMeetingId: params.relatedMeetingId ?? null,
        relatedGroupId: params.relatedGroupId ?? null,
        relatedPersonId: params.relatedPersonId ?? null,
        relatedRole: params.relatedRole ?? null,
        relatedReleaseVersion: params.relatedReleaseVersion ?? null,
        relatedOccasionId: params.relatedOccasionId ?? null,
        relatedKey: params.relatedKey ?? null,
      },
      select: { id: true, pushedAt: true },
    });
  }
}
