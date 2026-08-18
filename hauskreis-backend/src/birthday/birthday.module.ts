import { Module } from '@nestjs/common';
import { BirthdayController } from './birthday.controller';
import { BirthdayService } from './birthday.service';
import { BirthdayConfigService } from './birthday-config.service';
import { BirthdayPlannerService } from './birthday-planner.service';
import { BirthdayReminderService } from './birthday-reminder.service';
import { NotificationModule } from '../notification/notification.module';

/**
 * Geburtstage und Geschenke.
 *
 * Hängt an `NotificationModule` und sonst an nichts — `PrismaModule` und
 * `ClockModule` sind global. Insbesondere **nicht** an `PersonModule`: Die
 * Person kommt aus `@CurrentMembership()`, das der Guard schon aufgelöst hat.
 *
 * Exportiert den Planer, weil zwei fremde Stellen ihn anstoßen müssen — ein
 * geänderter Geburtstag im Profil und ein Zu- oder Abgang. Beide holen ihn über
 * `ModuleRef` statt über einen Import, sonst entstünde der Kreis
 * `Person → Birthday → Notification → Person`.
 */
@Module({
  imports: [NotificationModule],
  controllers: [BirthdayController],
  providers: [
    BirthdayService,
    BirthdayConfigService,
    BirthdayPlannerService,
    BirthdayReminderService,
  ],
  exports: [BirthdayService, BirthdayPlannerService],
})
export class BirthdayModule {}
