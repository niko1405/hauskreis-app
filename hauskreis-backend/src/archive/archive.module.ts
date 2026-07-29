import { Module } from '@nestjs/common';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';

/**
 * Deliberately small. The archive is a *view* over features that already exist,
 * not a new entity — so this module owns only the cross-cutting overview and
 * leaves every list to the module that owns the data.
 */
@Module({
  controllers: [ArchiveController],
  providers: [ArchiveService],
})
export class ArchiveModule {}
