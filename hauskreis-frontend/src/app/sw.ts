/// <reference lib="webworker" />

/**
 * Der Service Worker. Zwei Aufgaben: Caching für die Installierbarkeit und —
 * der eigentliche Grund — Push-Benachrichtigungen.
 *
 * Wichtig ist `event.waitUntil()` im `push`-Handler: ohne das beendet der
 * Browser den Worker, bevor die Benachrichtigung steht, und bricht nach
 * wenigen Nachrichten die Subscription ab (CLAUDE.md §8).
 */
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

/** Was der Server schickt: `{title, body, url}` als JSON-String. */
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event.data);

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Acts2', {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      // Gleiche Nachricht zweimal soll nicht zweimal aufpoppen.
      tag: payload.url ?? 'acts2',
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string })?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Ist die App schon offen, dorthin springen statt einen Tab aufzumachen.
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/**
 * Browser erneuern Subscriptions gelegentlich von sich aus. Ohne diesen
 * Handler bekäme der Server danach nichts mehr zugestellt.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  const changeEvent = event as ExtendableEvent & {
    oldSubscription?: PushSubscription;
    newSubscription?: PushSubscription;
  };

  event.waitUntil(
    (async () => {
      const fresh =
        changeEvent.newSubscription ??
        (await self.registration.pushManager.getSubscription());
      if (!fresh) return;

      const json = fresh.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;

      // Ohne Token kann der Worker nicht schreiben; die App meldet das Abo
      // beim nächsten Start ohnehin neu an. Ein Versuch ohne Auth wäre nur
      // ein 401 im Log.
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({
          type: 'push-subscription-changed',
          subscription: json,
        });
      }
    })(),
  );
});

function readPayload(data: PushMessageData | null): PushPayload {
  if (!data) return {};
  try {
    return data.json() as PushPayload;
  } catch {
    return { body: data.text() };
  }
}
