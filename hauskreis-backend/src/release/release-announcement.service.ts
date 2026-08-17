import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { NotificationType } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { appPath } from '../notification/app-paths';
import { latestRelease } from './releases';

/**
 * Sagt einmal Bescheid, wenn es eine neue Fassung der App gibt.
 *
 * **Beim Hochfahren und nicht als nächtlicher Lauf.** Der Deploy *ist* das
 * Ereignis: Die CI baut das Backend-Image, sobald sich etwas unter
 * `hauskreis-backend/**` ändert — und `releases.ts` liegt genau dort. Den
 * Eintrag zu schreiben ist damit derselbe Vorgang, der diesen Dienst startet.
 * Ein Cron würde bis zum nächsten Morgen warten, ohne etwas dazuzugewinnen.
 *
 * **Einmal je Fassung, nicht einmal je Person.** Der Unterschied ist wichtig
 * und leicht zu übersehen: Die Entdopplung in `NotificationService` fragt „hat
 * *diese Person* das schon bekommen?". Danach allein bekäme jemand, der
 * nächste Woche dazukommt, beim nächsten Neustart eine Ankündigung für
 * Funktionen, die für ihn von Anfang an da waren — sein Postfach kennt sie
 * nicht, die App zeigt sie längst. Deshalb steht davor die Frage, ob es zu
 * dieser Fassung **überhaupt** schon eine Zeile gibt.
 *
 * Angekündigt wird immer nur die neueste; ältere Einträge sind Geschichte für
 * die Seite „Neu in Acts2", kein Nachholbedarf.
 */
@Injectable()
export class ReleaseAnnouncementService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReleaseAnnouncementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.announceLatest();
    } catch (error) {
      // Eine Ankündigung ist kein Grund, den Server nicht hochfahren zu
      // lassen. Beim nächsten Start wird es wieder versucht — die Prüfung
      // oben verhindert, dass daraus zwei werden.
      this.logger.error(
        'Die Release-Ankündigung ist fehlgeschlagen',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async announceLatest(): Promise<{ announced: boolean; recipients: number }> {
    const release = latestRelease();

    const alreadyAnnounced = await this.prisma.notificationLog.findFirst({
      where: {
        type: NotificationType.RELEASE_NOTES,
        relatedReleaseVersion: release.version,
      },
      select: { id: true },
    });

    if (alreadyAnnounced) {
      return { announced: false, recipients: 0 };
    }

    // Alle Hauskreise auf einmal: Die App ist für alle dieselbe, und ein
    // Release betrifft niemanden mehr oder weniger als einen anderen.
    //
    // `acceptedAt` ausgeschlossen heißt: keine offenen Einladungen. Wer noch
    // nie da war, hat kein Gerät angemeldet und bekäme ohnehin nichts — aber
    // eine Zeile im Protokoll bekäme er, und die zählte später als „schon
    // benachrichtigt".
    const people = await this.prisma.person.findMany({
      where: { active: true, acceptedAt: { not: null } },
      select: { id: true },
    });

    if (people.length === 0) return { announced: false, recipients: 0 };

    const body = release.highlights.slice(0, 2).join(' ');

    const results = await Promise.all(
      people.map((person) =>
        this.notifications
          .notify({
            personId: person.id,
            type: NotificationType.RELEASE_NOTES,
            relatedReleaseVersion: release.version,
            payload: {
              title: `Neu in Acts2: ${release.title}`,
              // Die ersten beiden Stichpunkte reichen für eine Vorschau; der
              // Rest steht auf der Seite, auf die der Klick führt.
              body,
              url: appPath.release(release.version),
            },
          })
          // Ein Gerät, das nicht antwortet, darf die anderen acht nicht
          // aufhalten.
          .catch((error: unknown) => {
            this.logger.warn(
              `Release-Ankündigung an ${person.id} fehlgeschlagen: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return null;
          }),
      ),
    );

    const delivered = results.reduce(
      (sum, result) => sum + (result?.delivered ?? 0),
      0,
    );

    this.logger.log(
      `Release ${release.version} angekündigt: ${delivered} von ${people.length} erreicht`,
    );

    return { announced: true, recipients: people.length };
  }
}
