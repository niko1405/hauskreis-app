import { NotificationInboxService } from './notification-inbox.service';
import type { PrismaService } from '../prisma/prisma.service';

function setup() {
  const notificationLog = {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };

  const service = new NotificationInboxService({
    notificationLog,
  } as unknown as PrismaService);

  return { service, notificationLog };
}

beforeEach(() => jest.clearAllMocks());

describe('NotificationInboxService.list', () => {
  it('lässt die Zeilen von vor der Box draußen', async () => {
    const { service, notificationLog } = setup();

    await service.list('p1');

    // `notification_log` gab es lange vor der Glocke, und die alten Zeilen
    // wissen nur, *dass* etwas rausging. Einen Titel dafür zu erfinden hieße,
    // Nachrichten zu behaupten, die so nie dastanden.
    for (const call of notificationLog.findMany.mock.calls) {
      expect(call[0].where).toMatchObject({ title: { not: null } });
    }
    expect(notificationLog.count).toHaveBeenCalledWith({
      where: { personId: 'p1', title: { not: null }, readAt: null },
    });
  });

  it('deckelt „Früher", aber nicht die Zahl an der Glocke', async () => {
    const { service, notificationLog } = setup();

    await service.list('p1');

    const [unread, read] = notificationLog.findMany.mock.calls;
    // Ungelesenes vollständig: Es ist die Arbeitsliste.
    expect(unread[0].take).toBeUndefined();
    // Gelesenes begrenzt — die Box ist kein zweites Archiv.
    expect(read[0].take).toBe(30);
  });

  it('füllt einen fehlenden Text auf, statt am eigenen Schema zu scheitern', async () => {
    const { service, notificationLog } = setup();
    notificationLog.findMany.mockResolvedValueOnce([
      {
        id: 'n1',
        type: 'HOST_REMINDER',
        title: 'Du hostest',
        body: null,
        url: '/termin?id=m1',
        sentAt: new Date(),
        readAt: null,
      },
    ]);

    const { unread } = await service.list('p1');

    // Eine Nachricht ohne Fließtext ist denkbar, eine ohne Überschrift nicht —
    // und das Antwort-Schema verlangt bei beiden eine Zeichenkette.
    expect(unread[0]).toMatchObject({ title: 'Du hostest', body: '' });
  });
});

describe('NotificationInboxService.markRead', () => {
  it('fasst nur die eigene Zeile an', async () => {
    const { service, notificationLog } = setup();

    await service.markRead('p1', 'n1');

    // `personId` steht mit in der Bedingung: Eine Id aus einer fremden
    // Benachrichtigung darf nicht reichen, um an ihr etwas zu ändern.
    expect(notificationLog.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', personId: 'p1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('hält den Zeitpunkt des ersten Lesens fest', async () => {
    const { service, notificationLog } = setup();

    await service.markRead('p1', 'n1');

    // `readAt: null` in der Bedingung. Dieselbe Nachricht auf zwei Geräten
    // wegzutippen ist Alltag — der zweite Aufruf soll nichts tun statt den
    // Zeitpunkt zu überschreiben.
    expect(notificationLog.updateMany.mock.calls[0][0].where.readAt).toBeNull();
  });
});
