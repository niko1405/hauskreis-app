import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { AssignmentService } from './assignment.service';
import { DashboardService } from './dashboard.service';
import { PrayerBuddyModule } from '../prayer-buddy/prayer-buddy.module';

/**
 * What one person, or the whole group, is down for.
 *
 * A view over data the feature modules own, in the same spirit as
 * `ArchiveModule` — no tables of its own, read-only. It exists because the home
 * screen and the multi-week table both need the four roles joined together, and
 * doing that in the frontend would mean four round trips and a second opinion
 * on who is on for an evening.
 */
@Module({
  imports: [PrayerBuddyModule],
  controllers: [DashboardController],
  providers: [AssignmentService, DashboardService],
  exports: [AssignmentService],
})
export class DashboardModule {}
