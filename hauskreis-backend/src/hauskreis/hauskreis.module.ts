import { Module } from '@nestjs/common';
import { HauskreisController } from './hauskreis.controller';
import { HauskreisService } from './hauskreis.service';

@Module({
  controllers: [HauskreisController],
  providers: [HauskreisService],
  exports: [HauskreisService],
})
export class HauskreisModule {}
