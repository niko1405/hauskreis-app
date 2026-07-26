import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { PushSubscriptionService } from './push-subscription.service';
import { NotificationService } from './notification.service';
import { PersonService } from '../person/person.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreatePushSubscriptionDto,
  DeletePushSubscriptionDto,
} from './dto/push-subscription.dto';

/**
 * Push subscriptions always belong to the logged-in person, so these routes sit
 * outside the /hauskreise/:id tree and derive the person from the token.
 */
@Controller('push')
export class NotificationController {
  constructor(
    private readonly subscriptions: PushSubscriptionService,
    private readonly notifications: NotificationService,
    private readonly people: PersonService,
  ) {}

  /** The VAPID public key the browser needs to call `pushManager.subscribe()`. */
  @Get('public-key')
  publicKey() {
    return {
      publicKey: this.notifications.getPublicKey() ?? null,
      enabled: this.notifications.isEnabled,
    };
  }

  @Get('subscriptions')
  async list(@CurrentUser() user: AuthenticatedUser) {
    const person = await this.people.resolveForUser(user);
    return this.subscriptions.findAllForPerson(person.id);
  }

  @Post('subscriptions')
  async subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePushSubscriptionDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    const person = await this.people.resolveForUser(user);
    return this.subscriptions.subscribe(person.id, dto, userAgent);
  }

  @Delete('subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeletePushSubscriptionDto,
  ) {
    const person = await this.people.resolveForUser(user);
    await this.subscriptions.unsubscribe(person.id, dto.endpoint);
  }

  /** Sends a test notification to the caller's own devices. */
  @Post('test')
  async test(@CurrentUser() user: AuthenticatedUser) {
    const person = await this.people.resolveForUser(user);

    return this.notifications.sendToPerson(person.id, {
      title: 'Hauskreis',
      body: `Hi ${person.name}, deine Benachrichtigungen funktionieren.`,
      url: '/',
    });
  }
}
