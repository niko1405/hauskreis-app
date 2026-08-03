import webpush, { WebPushError } from 'web-push';
import { NotificationService } from './notification.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AppConfigService } from '../config/config.service';
import type { NotificationPreferenceService } from './notification-preference.service';

// Only the two network-facing functions are stubbed. WebPushError stays real,
// so the dead-endpoint handling is exercised against the actual error shape
// rather than an automocked class that would fail `instanceof`.
jest.mock('web-push', () => {
  const actual = jest.requireActual<typeof import('web-push')>('web-push');
  return {
    ...actual,
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  };
});

const mockedWebpush = jest.mocked(webpush);

const env: Record<string, string | undefined> = {
  VAPID_PUBLIC_KEY: 'public-key',
  VAPID_PRIVATE_KEY: 'private-key',
  VAPID_SUBJECT: 'mailto:test@example.com',
};

function setup(
  options: {
    subscriptions?: { id: string; endpoint: string }[];
    alreadyLogged?: boolean;
    configured?: boolean;
    switchedOff?: boolean;
  } = {},
) {
  const pushSubscription = {
    findMany: jest
      .fn()
      .mockResolvedValue(
        (
          options.subscriptions ?? [{ id: 's1', endpoint: 'https://push/1' }]
        ).map((s) => ({ ...s, p256dhKey: 'p', authKey: 'a' })),
      ),
    delete: jest.fn().mockResolvedValue({}),
  };
  const notificationLog = {
    findFirst: jest
      .fn()
      .mockResolvedValue(options.alreadyLogged ? { id: 'log-1' } : null),
    create: jest.fn().mockResolvedValue({ id: 'log-1' }),
  };

  const config = {
    get: (key: string) => (options.configured === false ? undefined : env[key]),
  } as unknown as AppConfigService;

  const preferences = {
    resolve: jest.fn().mockResolvedValue({
      enabled: options.switchedOff !== true,
      leadDays: null,
      weekdays: [],
    }),
  } as unknown as NotificationPreferenceService;

  const service = new NotificationService(
    { pushSubscription, notificationLog } as unknown as PrismaService,
    config,
    preferences,
  );
  service.onModuleInit();

  return { service, pushSubscription, notificationLog, preferences };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedWebpush.sendNotification.mockResolvedValue(
    undefined as unknown as never,
  );
});

const payload = { title: 'Hi', body: 'There' };

describe('NotificationService.notify', () => {
  it('delivers and records the notification', async () => {
    const { service, notificationLog } = setup();

    await expect(
      service.notify({
        personId: 'p1',
        type: 'HOST_REMINDER',
        relatedMeetingId: 'm1',
        payload,
      }),
    ).resolves.toEqual({ delivered: 1, skipped: 0, pruned: 0, failed: 0 });

    expect(notificationLog.create).toHaveBeenCalled();
    expect(mockedWebpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('does not send the same reminder twice', async () => {
    const { service, notificationLog } = setup({ alreadyLogged: true });

    await expect(
      service.notify({
        personId: 'p1',
        type: 'HOST_REMINDER',
        relatedMeetingId: 'm1',
        payload,
      }),
    ).resolves.toEqual({ delivered: 0, skipped: 1, pruned: 0, failed: 0 });

    expect(notificationLog.create).not.toHaveBeenCalled();
    expect(mockedWebpush.sendNotification).not.toHaveBeenCalled();
  });

  it('respects a notification the recipient switched off', async () => {
    const { service, notificationLog } = setup({ switchedOff: true });

    await expect(
      service.notify({
        personId: 'p1',
        type: 'HOST_REMINDER',
        relatedMeetingId: 'm1',
        payload,
      }),
    ).resolves.toEqual({ delivered: 0, skipped: 1, pruned: 0, failed: 0 });

    // Nothing is logged, so switching it back on still delivers the reminder
    // for this very meeting instead of finding it marked as handled.
    expect(notificationLog.create).not.toHaveBeenCalled();
    expect(mockedWebpush.sendNotification).not.toHaveBeenCalled();
  });

  it('tells two cancellations for the same evening apart', async () => {
    const { service, notificationLog } = setup();

    await service.notify({
      personId: 'host',
      type: 'ATTENDANCE_DECLINED',
      relatedMeetingId: 'm1',
      relatedPersonId: 'antonia',
      payload,
    });

    // The meeting alone would make the second drop-out look like a repeat of
    // the first; the person it is about is what separates them.
    expect(notificationLog.findFirst).toHaveBeenCalledWith({
      where: {
        personId: 'host',
        type: 'ATTENDANCE_DECLINED',
        relatedMeetingId: 'm1',
        relatedGroupId: null,
        relatedPersonId: 'antonia',
      },
    });
    expect(notificationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ relatedPersonId: 'antonia' }),
    });
  });

  it('reaches every device of a person', async () => {
    const { service } = setup({
      subscriptions: [
        { id: 's1', endpoint: 'https://push/phone' },
        { id: 's2', endpoint: 'https://push/laptop' },
      ],
    });

    const result = await service.notify({
      personId: 'p1',
      type: 'ACTIONSTEP_REMINDER',
      payload,
    });

    expect(result.delivered).toBe(2);
  });
});

describe('NotificationService.sendToPerson', () => {
  it.each([404, 410])(
    'removes a subscription the push service rejects with %i',
    async (statusCode) => {
      const { service, pushSubscription } = setup();
      mockedWebpush.sendNotification.mockRejectedValue(
        new WebPushError('gone', statusCode, {}, '', ''),
      );

      const result = await service.sendToPerson('p1', payload);

      expect(result).toEqual({ delivered: 0, pruned: 1, failed: 0 });
      expect(pushSubscription.delete).toHaveBeenCalledWith({
        where: { id: 's1' },
      });
    },
  );

  it('keeps the subscription when the failure is transient', async () => {
    const { service, pushSubscription } = setup();
    mockedWebpush.sendNotification.mockRejectedValue(
      new WebPushError('server error', 500, {}, '', ''),
    );

    const result = await service.sendToPerson('p1', payload);

    // Kept, not pruned: a 500 may well be temporary.
    expect(result).toEqual({ delivered: 0, pruned: 0, failed: 1 });
    expect(pushSubscription.delete).not.toHaveBeenCalled();
  });

  it('one dead device does not stop the others', async () => {
    const { service } = setup({
      subscriptions: [
        { id: 's1', endpoint: 'https://push/dead' },
        { id: 's2', endpoint: 'https://push/alive' },
      ],
    });
    mockedWebpush.sendNotification
      .mockRejectedValueOnce(new WebPushError('gone', 410, {}, '', ''))
      .mockResolvedValueOnce(undefined as unknown as never);

    const result = await service.sendToPerson('p1', payload);

    expect(result).toEqual({ delivered: 1, pruned: 1, failed: 0 });
  });

  it('stays quiet when VAPID keys are missing', async () => {
    const { service } = setup({ configured: false });

    expect(service.isEnabled).toBe(false);
    await expect(service.sendToPerson('p1', payload)).resolves.toEqual({
      delivered: 0,
      pruned: 0,
      failed: 0,
    });
    expect(mockedWebpush.sendNotification).not.toHaveBeenCalled();
  });
});
