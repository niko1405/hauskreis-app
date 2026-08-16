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

/**
 * Der Service Worker dieser Seite — **mit Frist**.
 *
 * `navigator.serviceWorker.ready` ist ein Versprechen ohne Ausweg: Es wird
 * erfüllt, sobald ein Worker die Seite übernimmt, und sonst nie. Es lehnt nicht
 * ab, es läuft nicht ab, es sagt nichts. Genau das ist auf iOS passiert — die
 * installierte App hat einen eigenen Speicher, getrennt von Safari, und
 * solange dort kein Worker aktiv war, kam der Aufruf nicht zurück.
 *
 * Weil die Einstellungskarte ihren Ladezustand daran hängte, stand dort ein
 * Balken, der nie fertig wurde: weder ließ sich Push einschalten noch testen,
 * und es gab keinen Fehler, den man hätte lesen können. Ein Ladezustand ohne
 * Ende ist der schlechteste Fehlerzustand — dieselbe Überlegung wie bei
 * `FullScreenHint` im AuthGate.
 *
 * Deshalb ein Wettrennen gegen die Uhr. `null` heißt „noch keiner da" und ist
 * eine Antwort, mit der die Oberfläche weiterarbeiten kann.
 */
async function registration(
  timeoutMs: number,
): Promise<ServiceWorkerRegistration | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Kurz, weil die Antwort nur einen Knopf beschriftet: Wer noch kein Abo hat,
 * sieht „einschalten" — und das ist auch die richtige Anzeige, solange wir es
 * nicht wissen.
 */
const READY_TIMEOUT_QUERY_MS = 3000;

/**
 * Länger, weil hier jemand geklickt hat und wartet. Der Worker darf sich in
 * dieser Zeit noch fertig einrichten, bevor wir aufgeben.
 */
const READY_TIMEOUT_SUBSCRIBE_MS = 15_000;

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await registration(READY_TIMEOUT_QUERY_MS);
  if (!reg) return null;
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

  const reg = await registration(READY_TIMEOUT_SUBSCRIBE_MS);
  if (!reg) {
    // Ohne aktiven Worker gibt es niemanden, der die Nachricht später empfängt
    // — `subscribe()` würde hier ohnehin scheitern. Der Satz sagt, was hilft:
    // auf iOS richtet sich der Worker erst im installierten Zustand ein, und
    // ein vollständiger Neustart der App ist der Weg dorthin.
    throw new Error(
      'Der Hintergrunddienst ist noch nicht bereit. Schließe die App einmal ganz und öffne sie neu.',
    );
  }

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
