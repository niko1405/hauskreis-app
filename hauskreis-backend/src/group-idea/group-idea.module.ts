import { Module } from '@nestjs/common';
import { GroupIdeaController } from './group-idea.controller';
import { GroupIdeaService } from './group-idea.service';

/**
 * Ideen der Gruppe. Ohne Importe — `PrismaModule` ist global, und die Ideen
 * hängen an nichts außer ihrem Hauskreis.
 */
@Module({
  controllers: [GroupIdeaController],
  providers: [GroupIdeaService],
})
export class GroupIdeaModule {}
