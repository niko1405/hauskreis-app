'use client';

/**
 * Das Abonnement dieses Geräts: anmelden, abmelden, Zustand kennen.
 * Verbindet die Browser-API mit `/api/push/subscriptions`.
 */
import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { pushApi } from '@/lib/api/endpoints';
import {
  useApiMutation,
  usePushPublicKey,
  usePushSubscriptions,
} from '@/lib/api/hooks';
import { qk } from '@/lib/api/query-keys';
import {
  getExistingSubscription,
  isIos,
  isPushSupported,
  isStandalone,
  subscribeToPush,
  unsubscribeFromPush,
} from './web-push';

export type PushBlocker =
  'unsupported' | 'ios-not-installed' | 'denied' | 'server-disabled' | null;

export function usePushSetup() {
  const [subscribedHere, setSubscribedHere] = useState<boolean | null>(null);
  const [permission, setPermission] =
    useState<NotificationPermission>('default');

  const publicKey = usePushPublicKey();
  const subscriptions = usePushSubscriptions();
  const toast = useToast();

  useEffect(() => {
    if (!isPushSupported()) {
      setSubscribedHere(false);
      return;
    }
    setPermission(Notification.permission);
    void getExistingSubscription().then((sub) =>
      setSubscribedHere(Boolean(sub)),
    );

    // Browser erneuern Abos gelegentlich von sich aus. Der Service Worker
    // meldet das hierher, weil nur die App ein Token zum Nachtragen hat.
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        { type?: string; subscription?: PushSubscriptionJSON } | undefined;
      if (data?.type !== 'push-subscription-changed' || !data.subscription)
        return;

      const { endpoint, keys } = data.subscription;
      if (!endpoint || !keys?.p256dh || !keys.auth) return;

      void pushApi
        .createPushSubscription({
          endpoint,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
        })
        .catch(() => undefined);
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  const subscribe = useApiMutation(
    async () => {
      const key = publicKey.data?.publicKey;
      if (!key)
        throw new Error('Der Server hat keinen VAPID-Schlüssel hinterlegt.');
      const json = await subscribeToPush(key);
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new Error('Der Browser hat ein unvollständiges Abo geliefert.');
      }
      return pushApi.createPushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
    },
    {
      invalidateKeys: [qk.push.subscriptions],
      onSuccess: () => {
        setSubscribedHere(true);
        setPermission('granted');
        toast.success('Benachrichtigungen sind an.');
      },
    },
  );

  const unsubscribe = useApiMutation(
    async () => {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await pushApi.deletePushSubscription(endpoint);
    },
    {
      invalidateKeys: [qk.push.subscriptions],
      onSuccess: () => {
        setSubscribedHere(false);
        toast.success('Auf diesem Gerät aus.');
      },
    },
  );

  const blocker: PushBlocker = !isPushSupported()
    ? isIos() && !isStandalone()
      ? 'ios-not-installed'
      : 'unsupported'
    : permission === 'denied'
      ? 'denied'
      : publicKey.data && !publicKey.data.enabled
        ? 'server-disabled'
        : null;

  return {
    blocker,
    subscribedHere,
    /** Weitere Geräte desselben Menschen — Telefon und Laptop etwa. */
    deviceCount: subscriptions.data?.length ?? 0,
    subscribe,
    unsubscribe,
    isLoading: publicKey.isLoading || subscribedHere === null,
  };
}
