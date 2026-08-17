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
import type {
  PrecacheEntry,
  SerwistGlobalConfig,
  SerwistPlugin,
} from 'serwist';
import { ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from 'serwist';
import { OFFLINE_PAGE } from './offline-page';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Der letzte Ausweg für eine Navigation: weder Netz noch etwas im
 * Zwischenspeicher. `handlerDidError` ist der Haken, an dem auch Serwists
 * eigenes `fallbacks` hängt — nur holt das seine Seite aus dem Precache, und
 * genau darauf wollen wir uns nicht verlassen (siehe `offline-page.ts`).
 */
const offlineFallback: SerwistPlugin = {
  handlerDidError: async () =>
    new Response(OFFLINE_PAGE, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
};

/**
 * Woher die API kommt. Wird beim Bauen eingesetzt, `sw.ts` läuft durch
 * dieselbe Webpack-Stufe wie die App.
 */
const API_ORIGIN = originOf(process.env.NEXT_PUBLIC_API_BASE_URL);

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // Aus: `NetworkFirst` liest die vorgeladene Antwort nicht, es bliebe eine
  // zweite Anfrage pro Kaltstart ohne Empfänger.
  navigationPreload: false,
  runtimeCaching: [
    /**
     * Seitenaufrufe.
     *
     * `defaultCache` hat dafür eine Regel, die **nie** greift: sie fragt nach
     * dem `Content-Type` der *Anfrage*, und den schickt kein Browser bei einer
     * Navigation. Seiten fallen dort bis zur Auffangregel `others` durch und
     * teilen sich deren 32 Plätze mit den `__next.*.txt`-Segmentdateien des
     * App Routers, die sie nach und nach verdrängen.
     *
     * Ohne Netz und ohne Treffer im Cache liefert `offlineFallback` die
     * eingebettete Meldung — der Fall, in dem die App bisher als leere Seite
     * startete.
     */
    {
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkFirst({
        cacheName: 'pages',
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 30 * 86400 }),
          offlineFallback,
        ],
      }),
    },

    /**
     * Die API wird **nicht** zwischengespeichert.
     *
     * `defaultCache` würde sie unter `cross-origin` eine Stunde lang
     * aufbewahren, und der Schlüssel dieses Speichers ist allein die URL — das
     * Token geht nicht ein. Auf einem geteilten Gerät oder nach einem
     * Kontowechsel käme so die Antwort für jemand anderen zurück. Einen Cache
     * hat die App ohnehin: TanStack Query, im Speicher und an die Sitzung
     * gebunden.
     */
    {
      matcher: ({ url }) => API_ORIGIN !== null && url.origin === API_ORIGIN,
      handler: new NetworkOnly(),
    },

    ...defaultCache,
  ],
});

/** Ohne gültige Adresse lieber gar keine Regel als eine, die zu viel fängt. */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

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
