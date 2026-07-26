import { Module } from '@nestjs/common';
import { PersonController } from './person.controller';
import { MeController } from './me.controller';
import { PersonService } from './person.service';

@Module({
  controllers: [PersonController, MeController],
  providers: [PersonService],
  exports: [PersonService],
})
export class PersonModule {}
