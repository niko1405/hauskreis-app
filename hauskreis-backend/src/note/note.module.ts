import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { NoteController } from './note.controller';
import { NoteService } from './note.service';

/**
 * Notizen. Hängt an `NotificationModule` — wer dazugenommen wird, hört davon —
 * und sonst an nichts; `PrismaModule` ist global.
 */
@Module({
  imports: [NotificationModule],
  controllers: [NoteController],
  providers: [NoteService],
})
export class NoteModule {}
