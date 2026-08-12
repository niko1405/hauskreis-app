import { Module } from '@nestjs/common';
import { HeaderImageController } from './header-image.controller';
import { HeaderImageService } from './header-image.service';

/**
 * Ein Modul ohne Importe: `PrismaModule` und `AppConfigModule` sind `@Global`,
 * mehr braucht es hier nicht.
 */
@Module({
  controllers: [HeaderImageController],
  providers: [HeaderImageService],
})
export class HeaderImageModule {}
