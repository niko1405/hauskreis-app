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
import { GroupIdeaService } from './group-idea.service';
import {
  CreateGroupIdeaDto,
  GroupIdeaParamsDto,
  UpdateGroupIdeaDto,
} from './dto/group-idea.dto';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { CurrentMembership } from '../auth/current-membership.decorator';
import type { HauskreisMembership } from '../auth/auth.types';
import { IfMatch } from '../common/http/if-match.decorator';
import type { IfMatchCondition } from '../common/http/etag';
import {
  ApiConditionalWrite,
  ApiZodNoContent,
  ApiZodResponse,
} from '../common/http/api-response.decorator';
import {
  GroupIdeaListResponseDto,
  GroupIdeaResponseDto,
} from './dto/group-idea-response.dto';

/**
 * Ideen der Gruppe.
 *
 * Kein `@HauskreisAdmin()` an irgendeiner Route: Wer eine Idee hat, schreibt
 * sie auf, und wer dabei war, hakt sie ab. Die einzige engere Regel steht beim
 * Löschen — und die prüft der Dienst, weil sie von der Idee abhängt und nicht
 * von der Route.
 */
@Controller('hauskreise/:hauskreisId/ideas')
export class GroupIdeaController {
  constructor(private readonly ideas: GroupIdeaService) {}

  @Get()
  @ApiZodResponse(GroupIdeaListResponseDto, {
    description: 'Offene zuerst, erledigte darunter',
  })
  findAll(@Param() params: HauskreisParamsDto) {
    return this.ideas.findAll(params.hauskreisId);
  }

  @Post()
  @ApiZodResponse(GroupIdeaResponseDto, { status: 201 })
  create(
    @Param() params: HauskreisParamsDto,
    @Body() dto: CreateGroupIdeaDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.ideas.create(params.hauskreisId, dto, membership);
  }

  @Patch(':id')
  @ApiZodResponse(GroupIdeaResponseDto)
  @ApiConditionalWrite()
  update(
    @Param() params: GroupIdeaParamsDto,
    @Body() dto: UpdateGroupIdeaDto,
    @CurrentMembership() membership: HauskreisMembership,
    @IfMatch() ifMatch?: IfMatchCondition,
  ) {
    return this.ideas.update(
      params.hauskreisId,
      params.id,
      dto,
      membership,
      ifMatch,
    );
  }

  /** Nur für die eigene Idee — oder als Admin. Sonst ist der Haken gemeint. */
  @Delete(':id')
  @ApiZodNoContent()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param() params: GroupIdeaParamsDto,
    @CurrentMembership() membership: HauskreisMembership,
  ) {
    return this.ideas.remove(params.hauskreisId, params.id, membership);
  }
}
