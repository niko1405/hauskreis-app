import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { NotificationInboxService } from './notification-inbox.service';
import { PersonService } from '../person/person.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { NotificationEntryParamsDto } from './dto/notification-inbox.dto';
import {
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import { NotificationInboxResponseDto } from './dto/notification-inbox-response.dto';

/**
 * Die Box hinter der Glocke.
 *
 * **Nicht unter `/push`**, obwohl sie aus derselben Tabelle liest und im selben
 * Modul wohnt: Was hier steht, ist ausdrücklich *nicht* auf Push angewiesen. Ein
 * Eintrag entsteht auch dann, wenn die Art abgeschaltet ist oder gar keine
 * VAPID-Schlüssel hinterlegt sind — in der Box zu stehen stört niemanden. Unter
 * `/push` zu liegen behauptete das Gegenteil.
 *
 * Personengebunden wie `/push/*` und aus demselben Grund: Benachrichtigungen
 * hängen am angemeldeten Menschen, nicht an der Gruppe.
 */
@Controller('notifications')
export class NotificationInboxController {
  constructor(
    private readonly inbox: NotificationInboxService,
    private readonly people: PersonService,
  ) {}

  @Get()
  @ApiZodResponse(NotificationInboxResponseDto, {
    description: 'Ungelesenes, die Zahl daneben und „Früher"',
  })
  async list(@CurrentUser() user: AuthenticatedUser) {
    const person = await this.people.resolveForUser(user);
    return this.inbox.list(person.id);
  }

  /**
   * Der übliche Weg hierher ist ein Antippen der Push-Nachricht: Der Service
   * Worker hängt `gelesen=<id>` an die Ziel-Adresse, weil er ohne Token selbst
   * nichts schreiben kann.
   *
   * Idempotent — dieselbe Nachricht auf zwei Geräten wegzutippen ist Alltag.
   */
  @Post(':id/read')
  @ApiZodNoContent('Gelesen — auch beim zweiten Mal')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: NotificationEntryParamsDto,
  ) {
    const person = await this.people.resolveForUser(user);
    await this.inbox.markRead(person.id, params.id);
  }

  @Post('read-all')
  @ApiZodNoContent('Die Box ist leer')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    const person = await this.people.resolveForUser(user);
    await this.inbox.markAllRead(person.id);
  }
}
