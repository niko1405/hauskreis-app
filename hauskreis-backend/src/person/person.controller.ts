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
import { Roles } from '../auth/roles.decorator';
import { ROLE_ADMIN } from '../auth/auth.types';
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
  @Roles(ROLE_ADMIN)
  @ApiZodResponse(PersonResponseDto, { status: 201 })
  create(@Param() params: HauskreisParamsDto, @Body() dto: CreatePersonDto) {
    return this.personService.create(params.hauskreisId, dto);
  }

  @Post('invite')
  @Roles(ROLE_ADMIN)
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
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.personService.update(
      params.hauskreisId,
      params.id,
      dto,
      ifMatch,
    );
  }

  @Delete(':id')
  @ApiZodNoContent()
  @Roles(ROLE_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: PersonParamsDto) {
    return this.personService.remove(params.hauskreisId, params.id);
  }
}
