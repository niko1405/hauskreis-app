import { Controller, Get, Param } from '@nestjs/common';
import { ArchiveService } from './archive.service';
import { HauskreisParamsDto } from '../hauskreis/dto/hauskreis.dto';
import { ApiZodResponse } from '../common/http/api-response.decorator';
import { ArchiveSummaryResponseDto } from './dto/archive-response.dto';

@Controller('hauskreise/:hauskreisId/archive')
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  /**
   * What the archive holds, and which years to offer in the picker.
   *
   * The lists themselves stay where they belong: `…/meetings?scope=past`,
   * `…/topics`, `…/songs`, all with search, date bounds and pagination.
   */
  @Get()
  @ApiZodResponse(ArchiveSummaryResponseDto)
  summary(@Param() params: HauskreisParamsDto) {
    return this.archive.summarise(params.hauskreisId);
  }
}
