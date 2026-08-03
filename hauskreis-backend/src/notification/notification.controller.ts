import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { PushSubscriptionService } from './push-subscription.service';
import { NotificationService } from './notification.service';
import { appPath } from './app-paths';
import { NotificationPreferenceService } from './notification-preference.service';
import { PersonService } from '../person/person.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreatePushSubscriptionDto,
  DeletePushSubscriptionDto,
} from './dto/push-subscription.dto';
import {
  NotificationSettingParamsDto,
  UpdateNotificationSettingDto,
} from './dto/notification-setting.dto';
import {
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  DeliveryResultResponseDto,
  NotificationSettingListResponseDto,
  NotificationSettingResponseDto,
  PushPublicKeyResponseDto,
  PushSubscriptionListResponseDto,
  PushSubscriptionResponseDto,
} from './dto/notification-response.dto';

/**
 * Push subscriptions always belong to the logged-in person, so these routes sit
 * outside the /hauskreise/:id tree and derive the person from the token.
 */
@Controller('push')
export class NotificationController {
  constructor(
    private readonly subscriptions: PushSubscriptionService,
    private readonly notifications: NotificationService,
    private readonly preferences: NotificationPreferenceService,
    private readonly people: PersonService,
  ) {}

  /**
   * Every notification the app can send, with the caller's own answer folded
   * in — the settings screen renders straight from this, labels and all.
   *
   * A type added to the catalog shows up here on its own, so the frontend
   * never carries a second copy of the list.
   */
  @Get('settings')
  @ApiZodResponse(NotificationSettingListResponseDto, {
    description: 'Alle Arten, mit den für diese Person geltenden Werten',
  })
  async settings(@CurrentUser() user: AuthenticatedUser) {
    const person = await this.people.resolveForUser(user);
    return this.preferences.listForPerson(person.id);
  }

  @Put('settings/:type')
  @ApiZodResponse(NotificationSettingResponseDto)
  async updateSetting(
    @Param() params: NotificationSettingParamsDto,
    @Body() dto: UpdateNotificationSettingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const person = await this.people.resolveForUser(user);
    return this.preferences.update(person.id, params.type, dto);
  }

  /** The VAPID public key the browser needs to call `pushManager.subscribe()`. */
  @Get('public-key')
  @ApiZodResponse(PushPublicKeyResponseDto)
  publicKey() {
    return {
      publicKey: this.notifications.getPublicKey() ?? null,
      enabled: this.notifications.isEnabled,
    };
  }

  @Get('subscriptions')
  @ApiZodResponse(PushSubscriptionListResponseDto)
  async list(@CurrentUser() user: AuthenticatedUser) {
    const person = await this.people.resolveForUser(user);
    return this.subscriptions.findAllForPerson(person.id);
  }

  @Post('subscriptions')
  @ApiZodResponse(PushSubscriptionResponseDto, { status: 201 })
  async subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePushSubscriptionDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    const person = await this.people.resolveForUser(user);
    return this.subscriptions.subscribe(person.id, dto, userAgent);
  }

  @Delete('subscriptions')
  @ApiZodNoContent()
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
  @ApiZodResponse(DeliveryResultResponseDto, {
    description: 'Schickt eine Testnachricht an die eigenen Geräte',
  })
  async test(@CurrentUser() user: AuthenticatedUser) {
    const person = await this.people.resolveForUser(user);

    return this.notifications.sendToPerson(person.id, {
      title: 'Hauskreis',
      body: `Hi ${person.name}, deine Benachrichtigungen funktionieren.`,
      url: appPath.home(),
    });
  }
}
