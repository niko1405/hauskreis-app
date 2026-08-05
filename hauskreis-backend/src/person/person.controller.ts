import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PersonService } from './person.service';
import {
  CreatePersonDto,
  InvitePersonDto,
  PersonParamsDto,
  UpdatePersonDto,
} from './dto/person.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { HauskreisAdmin } from '../auth/hauskreis-admin.decorator';
import { CurrentMembership } from '../auth/current-membership.decorator';
import type { HauskreisMembership } from '../auth/auth.types';
import { IfMatch } from '../common/http/if-match.decorator';
import {
  ApiConditionalWrite,
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  InvitedPersonResponseDto,
  PersonListResponseDto,
  PersonResponseDto,
  ResendInvitationResponseDto,
} from './dto/person-response.dto';
import type { IfMatchCondition } from '../common/http/etag';

@Controller('hauskreise/:hauskreisId/people')
export class PersonController {
  constructor(private readonly personService: PersonService) {}

  @Get()
  @ApiZodResponse(PersonListResponseDto, {
    description: 'Alle Mitglieder, nach Namen sortiert',
  })
  findAll(@Param() params: HauskreisParamsDto) {
    return this.personService.findAll(params.hauskreisId);
  }

  @Get(':id')
  @ApiZodResponse(PersonResponseDto)
  findOne(@Param() params: PersonParamsDto) {
    return this.personService.findOne(params.hauskreisId, params.id);
  }

  @Post()
  @HauskreisAdmin()
  @ApiZodResponse(PersonResponseDto, { status: 201 })
  create(@Param() params: HauskreisParamsDto, @Body() dto: CreatePersonDto) {
    return this.personService.create(params.hauskreisId, dto);
  }

  @Post('invite')
  @HauskreisAdmin()
  @ApiZodResponse(InvitedPersonResponseDto, {
    status: 201,
    description: 'Legt zuerst das Keycloak-Konto an, dann die Person',
  })
  invite(@Param() params: HauskreisParamsDto, @Body() dto: InvitePersonDto) {
    return this.personService.invite(params.hauskreisId, dto);
  }

  @Patch(':id')
  @ApiZodResponse(PersonResponseDto)
  @ApiConditionalWrite()
  update(
    @Param() params: PersonParamsDto,
    @Body() dto: UpdatePersonDto,
    @CurrentMembership() membership: HauskreisMembership,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    // Die Mitgliedschaft geht mit, weil ein Feld dieses DTOs mehr verlangt als
    // die Route: `role` darf nur ein Admin setzen. Ein eigener Endpunkt dafür
    // wäre die andere Möglichkeit — dann stünde die Regel im Routing statt in
    // der Logik, und „Rolle ändern" wäre etwas anderes als „Person ändern",
    // obwohl es dasselbe ist.
    return this.personService.update(
      params.hauskreisId,
      params.id,
      dto,
      membership,
      ifMatch,
    );
  }

  /**
   * Schickt die Einladungsmail noch einmal.
   *
   * Der Fall dahinter: beim Einladen war der Mailserver nicht erreichbar. Das
   * Konto steht, die Person ist angelegt — es fehlt nur die Mail. Die Einladung
   * deshalb scheitern zu lassen würde beides wieder abräumen, obwohl nur der
   * Versand klemmte.
   */
  @Post(':id/resend-invitation')
  @HauskreisAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiZodResponse(ResendInvitationResponseDto)
  resendInvitation(@Param() params: PersonParamsDto) {
    return this.personService.resendInvitation(params.hauskreisId, params.id);
  }

  @Delete(':id')
  @ApiZodNoContent()
  @HauskreisAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: PersonParamsDto) {
    return this.personService.remove(params.hauskreisId, params.id);
  }
}
