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
   * Sends a notification to one person, at most once per subject.
   *
   * The reminder jobs run daily and would otherwise re-send the same message
   * every day until the meeting passes. Writing the log entry *before*
   * delivering means a crash mid-send costs one missed reminder rather than a
   * repeat every day.
   *
   * The recipient's setting is checked here rather than in each caller, so a
   * notification switched off in the settings cannot leak through a job that
   * forgot to ask. What "once per subject" means is up to the caller: pass the
   * meeting, the prayer buddy group, or the person the message is about — the
   * combination is the deduplication key.
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
    payload: NotificationPayload;
  }): Promise<SendResult> {
    const setting = await this.preferences.resolve(
      params.personId,
      params.type,
    );

    if (!setting.enabled) {
      // Nothing is logged: switching the notification back on should let the
      // next run deliver, not find a row saying it was already handled.
      this.logger.debug(
        `Person ${params.personId} has ${params.type} switched off`,
      );
      return { delivered: 0, skipped: 1, pruned: 0, failed: 0 };
    }

    if (!this.enabled) {
      // Deliberately returns before writing the log: nothing was attempted, so
      // nothing is recorded as sent. Once VAPID keys are configured the
      // reminder still goes out rather than having been silently swallowed.
      this.logger.debug(
        `Push disabled, not sending ${params.type} to person ${params.personId}`,
      );
      return { delivered: 0, skipped: 1, pruned: 0, failed: 0 };
    }

    const alreadySent = await this.hasBeenSent(params);

    if (alreadySent) {
      return { delivered: 0, skipped: 1, pruned: 0, failed: 0 };
    }

    await this.prisma.notificationLog.create({
      data: {
        personId: params.personId,
        type: params.type,
        relatedMeetingId: params.relatedMeetingId ?? null,
        relatedGroupId: params.relatedGroupId ?? null,
        relatedPersonId: params.relatedPersonId ?? null,
        relatedRole: params.relatedRole ?? null,
      },
    });

    const result = await this.sendToPerson(params.personId, params.payload);
    return { ...result, skipped: 0 };
  }

  /** Delivers to every device of a person, without touching the log. */
  async sendToPerson(
    personId: string,
    payload: NotificationPayload,
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
    payload: NotificationPayload,
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
   * The real deduplication check. The unique index cannot do it: Postgres
   * treats rows with a NULL anywhere in the tuple as distinct, and both
   * subject columns are nullable by design.
   */
  private async hasBeenSent(params: {
    personId: string;
    type: NotificationType;
    relatedMeetingId?: string | null;
    relatedGroupId?: string | null;
    relatedPersonId?: string | null;
    relatedRole?: AssignmentRole | null;
  }): Promise<boolean> {
    const existing = await this.prisma.notificationLog.findFirst({
      where: {
        personId: params.personId,
        type: params.type,
        relatedMeetingId: params.relatedMeetingId ?? null,
        relatedGroupId: params.relatedGroupId ?? null,
        relatedPersonId: params.relatedPersonId ?? null,
        relatedRole: params.relatedRole ?? null,
      },
    });

    return existing !== null;
  }
}
