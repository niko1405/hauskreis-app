/**
 * Der Browser-Teil von Web Push.
 *
 * Voraussetzungen (CLAUDE.md §8): HTTPS bzw. localhost, ein registrierter
 * Service Worker — und auf iOS zusätzlich, dass die App über „Zum
 * Home-Bildschirm hinzufügen" läuft. Im normalen Safari-Tab ist die API dort
 * abgeschaltet.
 */

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** iOS erlaubt Push nur im installierten Zustand. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari kennt `display-mode` nicht zuverlässig und setzt stattdessen dies.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** VAPID-Schlüssel: base64url aus der API → Bytes für `applicationServerKey`. */
export function urlBase64ToUint8Array(base64UrlKey: string): Uint8Array {
  const padding = '='.repeat((4 - (base64UrlKey.length % 4)) % 4);
  const base64 = (base64UrlKey + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await registration();
  return reg.pushManager.getSubscription();
}

/**
 * Muss aus einer echten Nutzeraktion heraus laufen (Klick) — ein
 * `requestPermission()` beim Laden lehnen Browser ab bzw. bestrafen es.
 */
export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushSubscriptionJSON> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Ohne Erlaubnis für Benachrichtigungen geht es nicht.');
  }

  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing.toJSON();

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });
  return subscription.toJSON();
}

export async function unsubscribeFromPush(): Promise<string | null> {
  const subscription = await getExistingSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
