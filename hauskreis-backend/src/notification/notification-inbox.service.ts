import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Wie viele gelesene Nachrichten „Früher" zeigt.
 *
 * Genug, um die letzten Wochen nachzulesen, und wenig genug, dass die Box beim
 * Öffnen sofort dasteht. Wer weiter zurück will, sucht am Ort selbst — im
 * Termin, im Thema, im Archiv. Die Box ist kein zweites Archiv.
 */
const READ_LIMIT = 30;

/**
 * Die Box hinter der Glocke.
 *
 * Sie liest dieselbe Tabelle, aus der die Erinnerungen kommen
 * (`notification_log`) — und das ist der ganze Trick: Es gab nie ein zweites
 * System, das man hätte bauen müssen, nur eine Tabelle, die nicht wusste, was
 * drinstand. Zeilen ohne `title` stammen von davor und tauchen deshalb nicht
 * auf; sie waren immer nur Entdopplung.
 *
 * Alles hier ist personengebunden und filtert **immer** auf `personId`, auch
 * beim Schreiben. Eine Id aus einer fremden Benachrichtigung darf nicht reichen,
 * um an ihr etwas zu ändern.
 */
@Injectable()
export class NotificationInboxService {
  constructor(private readonly prisma: PrismaService) {}

  async list(personId: string) {
    const [unreadCount, unread, read] = await Promise.all([
      this.unreadCount(personId),
      this.prisma.notificationLog.findMany({
        where: { personId, title: { not: null }, readAt: null },
        orderBy: { sentAt: 'desc' },
        select: SELECT,
      }),
      this.prisma.notificationLog.findMany({
        where: { personId, title: { not: null }, readAt: { not: null } },
        orderBy: { sentAt: 'desc' },
        take: READ_LIMIT,
        select: SELECT,
      }),
    ]);

    return {
      unreadCount,
      unread: unread.map(toEntry),
      read: read.map(toEntry),
    };
  }

  unreadCount(personId: string): Promise<number> {
    return this.prisma.notificationLog.count({
      where: { personId, title: { not: null }, readAt: null },
    });
  }

  /**
   * Setzt einen Eintrag auf gelesen.
   *
   * `updateMany` und kein `update`: Der übliche Weg hierher ist ein Antippen
   * der Push-Nachricht, und dieselbe Nachricht auf zwei Geräten wegzutippen ist
   * Alltag. Der zweite Aufruf soll nichts tun, statt mit „Zeile nicht gefunden"
   * zu scheitern — dasselbe gilt für eine Id, die es nie gab.
   *
   * `readAt: null` in der Bedingung hält den Zeitpunkt fest: gelesen wurde es,
   * als es das erste Mal gelesen wurde.
   */
  async markRead(personId: string, id: string): Promise<void> {
    await this.prisma.notificationLog.updateMany({
      where: { id, personId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(personId: string): Promise<void> {
    await this.prisma.notificationLog.updateMany({
      where: { personId, title: { not: null }, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

const SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  url: true,
  sentAt: true,
  readAt: true,
} as const;

/**
 * `title` und `body` sind in der Datenbank nullable und im Schema nicht.
 *
 * Das ist kein Widerspruch, sondern die Filterbedingung eine Zeile weiter oben:
 * Ohne Titel steht die Zeile gar nicht in der Box. Der Text darf trotzdem leer
 * sein — eine Nachricht ohne Fließtext ist denkbar, eine ohne Überschrift nicht.
 */
function toEntry(row: {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  url: string | null;
  sentAt: Date;
  readAt: Date | null;
}) {
  return { ...row, title: row.title ?? '', body: row.body ?? '' };
}
