import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { PersonService } from './person.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AllowUnverifiedEmail } from '../auth/allow-unverified-email.decorator';
import {
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  ChangedEmailResponseDto,
  MeResponseDto,
  VerificationSentResponseDto,
} from './dto/person-response.dto';
import { LocationResponseDto } from '../location/dto/location-response.dto';
import { ChangeEmailDto, SetHomeDto } from './dto/person.dto';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('me')
export class MeController {
  constructor(private readonly personService: PersonService) {}

  /**
   * Wer bin ich.
   *
   * `resolveForUser` gibt die vollständige Zeile zurück, also auch die
   * `keycloakUserId`. Das Antwort-Schema schneidet sie weg; ohne es stand sie
   * bis hierher in der Antwort, obwohl `…/people` sie längst zurückhielt.
   *
   * Die Rollen aus dem Token stehen nicht mehr dabei: ob jemand Admin ist,
   * hängt am Hauskreis und steht als `role` an der Person selbst.
   */
  @Get()
  @ApiZodResponse(MeResponseDto, {
    description: 'Die eigene Person samt Rolle in ihrem Hauskreis',
  })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.personService.resolveForUser(user);
  }

  /**
   * „Hier wohne ich."
   *
   * Ein Weg statt dreier Aufrufe (auflösen, Ort anlegen, Person ändern): mitten
   * darin abzubrechen hinterließe eine Wohnung ohne Bewohner:innen. Ob daraus
   * eine Wohngemeinschaft wird, entscheidet `joinExisting` — sonst `409`.
   */
  @Put('home')
  @ApiZodResponse(LocationResponseDto, {
    description: 'Die eigene Wohnung, samt Mitbewohner:innen',
  })
  setHome(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetHomeDto) {
    return this.personService.setHome(user, dto);
  }

  /**
   * Konto löschen, solange man zu keinem Hauskreis gehört.
   *
   * Bewusst **ohne** `hauskreisId` in der Route, anders als
   * `DELETE /hauskreise/:id/me`: Wer diesen Weg braucht, hat keine. Gehört man
   * doch noch dazu, antwortet der Service mit `409` und verweist auf den
   * anderen Weg — dort hängt die Nachfolgefrage dran, die hier nicht
   * aufkommen kann.
   */
  @Delete()
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.personService.deleteOrphanedAccount(user);
  }

  /** „Ich bringe keine Wohnung mit" — gültiger Zustand, kein Fehler. */
  @Delete('home')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  clearHome(@CurrentUser() user: AuthenticatedUser) {
    return this.personService.clearHome(user);
  }

  /**
   * Die eigene E-Mail ändern — in Keycloak und hier, oder gar nicht.
   *
   * Das Passwort bleibt außen vor: dafür gibt es Keycloaks Konto-Seite, und
   * kein Passwort sollte durch dieses Backend laufen.
   */
  @Patch('email')
  @ApiZodResponse(ChangedEmailResponseDto)
  changeEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeEmailDto,
  ) {
    return this.personService.changeEmail(user, dto.email);
  }

  /**
   * „Schick mir die Bestätigungsmail nochmal."
   *
   * Die einzige Route, die eine unbestätigte Adresse durchlässt — und sie muss
   * es, sonst wäre der Zustand eine Sackgasse: ohne Bestätigung kommt niemand
   * herein, und ohne Mail gibt es nichts zu bestätigen. Sie tut deshalb auch
   * nichts weiter, als Keycloak zu bitten, noch einmal zu schreiben; die Person
   * wird nicht aufgelöst, es wird nichts geschrieben.
   */
  @Post('resend-verification')
  @AllowUnverifiedEmail()
  @ApiZodResponse(VerificationSentResponseDto, {
    description: 'Ob Keycloak die Bestätigungsmail losgeworden ist',
  })
  resendVerification(@CurrentUser() user: AuthenticatedUser) {
    return this.personService.resendVerification(user);
  }
}
