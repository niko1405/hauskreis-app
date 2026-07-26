import { Module } from '@nestjs/common';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { MeetingGeneratorService } from './meeting-generator.service';

@Module({
  controllers: [MeetingController],
  providers: [MeetingService, MeetingGeneratorService],
  exports: [MeetingService, MeetingGeneratorService],
})
export class MeetingModule {}
