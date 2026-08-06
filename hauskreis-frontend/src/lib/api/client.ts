/**
 * Der einzige Ort, an dem `fetch` aufgerufen wird.
 *
 * Er kümmert sich um die vier Dinge, die für **jeden** Aufruf gelten
 * (`docs/api-fuer-frontend.md`): Bearer-Token, ETag hin und zurück,
 * einheitliche Fehlerform und die Basis-URL (die Spec hat kein `servers`).
 */
import {
  NetworkError,
  TimeoutError,
  toApiError,
  UnauthorizedError,
} from './errors';
import type { ErrorPayload } from './types';

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api'
).replace(/\/$/, '');

/**
 * Wie lange auf eine Antwort gewartet wird. Großzügig bemessen: die API läuft
 * in der Entwicklung unter WSL, wo der erste Aufruf nach dem Start durchaus
 * ein paar Sekunden braucht. Aber eben nicht unbegrenzt.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * `AbortSignal.any` gibt es erst seit 2024 (Chrome 116, Safari 17.4). Fehlt
 * es, zählt allein die Frist — ein Abbruch durch den Aufrufer verpufft dann,
 * was höchstens eine überflüssige Antwort kostet.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);
  return signals[signals.length - 1] as AbortSignal;
}

/** Eine Einzelressource samt ihrem ETag. Ohne den ist kein Schreiben möglich. */
export interface Resource<T> {
  data: T;
  etag: string | undefined;
}

/**
 * Wird beim Schreiben statt eines ETags übergeben, wenn die Route bewusst
 * keine Vorbedingung verlangt. Diese Routen sind das — sie deklarieren kein
 * `412`/`428`, obwohl sie PUT bzw. PATCH sind:
 *
 * - `PUT  …/meetings/{id}/attendance`
 * - `PUT  …/meetings/{id}/actionstep-done` — ein Schalter, kein Wettlauf:
 *   zwei Leute, die gleichzeitig abhaken, schreiben verschiedene Zeilen
 * - `PUT  …/meetings/{id}/song-leaders`
 * - `PATCH …/meetings/{meetingId}/songs/{id}`
 * - `PUT  /api/push/settings/{type}`
 * - `PUT  /api/me/home` und `PATCH /api/me/email` — beide beschreiben eine
 *   Absicht („hier wohne ich", „so heiße ich jetzt"), keine Fortschreibung
 *   einer vorher gelesenen Fassung. Es gibt nichts, wogegen zu prüfen wäre.
 *
 * Der Rest **muss** einen ETag mitgeben; das Symbol zwingt an jeder
 * Aufrufstelle zu einer bewussten Entscheidung, statt das Feld weglassen zu
 * lassen (der übliche Baufehler laut §2).
 */
export const UNCONDITIONAL = Symbol('unconditional');

export type Precondition = { etag: string | undefined } | typeof UNCONDITIONAL;

// ── Einhängepunkte, die die App beim Start setzt ────────────────────────────

type TokenGetter = () => string | undefined;

let readAccessToken: TokenGetter = () => undefined;
let handleUnauthorized: (() => void) | undefined;
let handleAuthorized: (() => void) | undefined;

/** Vom Auth-Provider gesetzt. Getter statt Wert, damit ein Refresh durchschlägt. */
export function setAccessTokenGetter(getter: TokenGetter): void {
  readAccessToken = getter;
}

/** Wird bei einem 401 gerufen, das auch nach einem Refresh bestehen bleibt. */
export function setUnauthorizedHandler(handler: () => void): void {
  handleUnauthorized = handler;
}

/**
 * Wird bei der ersten geglückten Antwort nach einem 401 gerufen.
 *
 * Nur dafür da, den Versuchszähler der Erneuerung zurückzusetzen — sonst
 * bliebe eine Sitzung, die sich einmal gefangen hat, für immer als „gibt es
 * nicht mehr auf" vermerkt.
 */
export function setAuthorizedHandler(handler: () => void): void {
  handleAuthorized = handler;
}

// ── Anfragen ────────────────────────────────────────────────────────────────

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue>;

interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: QueryParams;
  body?: unknown;
  /** Wert für `If-Match` beim Schreiben. */
  ifMatch?: string;
  /** Wert für `If-None-Match` beim Lesen — spart bei `304` die Übertragung. */
  ifNoneMatch?: string;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

interface RawResponse<T> {
  status: number;
  data: T | undefined;
  etag: string | undefined;
}

async function request<T>(options: RequestOptions): Promise<RawResponse<T>> {
  const { method, path, query, body, ifMatch, ifNoneMatch, signal } = options;

  const headers = new Headers();
  const token = readAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (ifMatch) headers.set('If-Match', ifMatch);
  if (ifNoneMatch) headers.set('If-None-Match', ifNoneMatch);

  // Ohne eigene Frist wartet `fetch` unbegrenzt. Eine Anfrage, die nie
  // ankommt, hinge damit für immer im Ladezustand — kein Fehler, keine
  // Möglichkeit, es erneut zu versuchen.
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = signal ? anySignal([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combined,
      // Der Server prüft ausschließlich das Bearer-Token; Cookies würden nur
      // die CORS-Vorabprüfung verschärfen.
      credentials: 'omit',
    });
  } catch (cause) {
    if (timeout.aborted) throw new TimeoutError(path, REQUEST_TIMEOUT_MS);
    // Vom Aufrufer abgebrochen (etwa weil die Ansicht gewechselt hat) —
    // das ist kein Fehler, den jemand sehen soll.
    if (signal?.aborted) throw cause;
    throw new NetworkError(path, cause);
  }

  // Der Header ist über CORS nur lesbar, weil der Server
  // `Access-Control-Expose-Headers: ETag` setzt.
  const etag = response.headers.get('ETag') ?? undefined;

  if (response.status === 304) {
    return { status: 304, data: undefined, etag };
  }

  if (!response.ok) {
    const payload = await readErrorPayload(response, path);
    const error = toApiError(response.status, path, payload);
    if (error instanceof UnauthorizedError) handleUnauthorized?.();
    throw error;
  }

  handleAuthorized?.();

  if (response.status === 204) {
    return { status: 204, data: undefined, etag };
  }

  const data = await readJson<T>(response);
  return { status: response.status, data, etag };
}

/**
 * Den Rumpf lesen — und einen leeren als `null` verstehen.
 *
 * Nest schickt für ein `null` aus einem Controller **keinen** JSON-Rumpf,
 * sondern gar keinen: `isNil(body) ? response.send() : response.json(body)`.
 * Der Status bleibt dabei `200`. Ein `response.json()` darauf wirft
 * `Unexpected end of JSON input` — und aus „für heute ist niemand zugeteilt"
 * wurde ein roter Fehlerkasten.
 *
 * Deshalb hier und nicht an der einen Route, die es zuerst getroffen hat: jede
 * Route, die „nichts" antworten darf, läuft in dieselbe Falle, und die nächste
 * schreibt niemand mit diesem Wissen im Kopf.
 */
async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return (text === '' ? null : JSON.parse(text)) as T;
}

async function readErrorPayload(
  response: Response,
  path: string,
): Promise<ErrorPayload | null> {
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object' && 'statusCode' in parsed) {
      return parsed as ErrorPayload;
    }
    return { statusCode: response.status, message: response.statusText, path };
  } catch {
    return null;
  }
}

function expectBody<T>(raw: RawResponse<T>, path: string): T {
  if (raw.data === undefined) {
    throw new Error(`Kein Antwortkörper von ${path} (Status ${raw.status})`);
  }
  return raw.data;
}

function ifMatchOf(precondition: Precondition): string | undefined {
  if (precondition === UNCONDITIONAL) return undefined;
  return precondition.etag;
}

/**
 * Multipart — für den einen Fall, der kein JSON ist: das Profilbild.
 *
 * Bewusst **ohne** `Content-Type`: den setzt der Browser selbst, samt der
 * `boundary`, die er sich ausdenkt. Wer ihn hier von Hand setzt, liefert eine
 * Boundary, die zum Rumpf nicht passt, und der Server findet keine Datei.
 */
export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const token = readAccessToken();

  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    credentials: 'omit',
  });

  if (!response.ok) {
    const payload = await readErrorPayload(response, path);
    const error = toApiError(response.status, path, payload);
    if (error instanceof UnauthorizedError) handleUnauthorized?.();
    throw error;
  }

  handleAuthorized?.();
  return readJson<T>(response);
}

// ── Lesen ───────────────────────────────────────────────────────────────────

/** Für Listen und Aggregate, an denen nicht geschrieben wird. */
export async function apiGet<T>(
  path: string,
  options: { query?: QueryParams; signal?: AbortSignal } = {},
): Promise<T> {
  const raw = await request<T>({ method: 'GET', path, ...options });
  return expectBody(raw, path);
}

/**
 * Ein Bild als Data-URL — für die Routen, die keine JSON-Antwort liefern.
 *
 * Nötig, weil die API **nur** das Bearer-Token kennt: ein `<img src="…">`
 * schickt keinen Authorization-Header, ein direkter Verweis käme also mit 401
 * zurück. Der Umweg über `fetch` ist der Preis dafür, dass es keine
 * Cookie-Sitzung gibt — und die will man hier nicht haben.
 *
 * Data-URL und nicht `URL.createObjectURL`: eine Object-URL müsste wieder
 * freigegeben werden, und zwar genau dann, wenn der Cache-Eintrag verschwindet
 * — dafür gibt es in TanStack Query keinen verlässlichen Zeitpunkt. Eine
 * Zeichenkette hat keinen Lebenszyklus. Bei 512 Pixeln WebP sind das rund
 * 40 kB je Person; für eine Gruppe von neun ist das kein Thema.
 */
export async function apiGetDataUrl(
  path: string,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const token = readAccessToken();
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  const response = await fetch(buildUrl(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: options.signal ? anySignal([options.signal, timeout]) : timeout,
    credentials: 'omit',
  });

  if (!response.ok) {
    const error = toApiError(response.status, path, null);
    if (error instanceof UnauthorizedError) handleUnauthorized?.();
    throw error;
  }

  handleAuthorized?.();

  const blob = await response.blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result as string));
    reader.addEventListener('error', () =>
      reject(new Error(`Bild ${path} nicht lesbar`)),
    );
    reader.readAsDataURL(blob);
  });
}

/**
 * Für Einzelressourcen: liefert den ETag mit, den ein späteres `PATCH`
 * braucht. Ist `previous` gesetzt, geht sein ETag als `If-None-Match` mit —
 * bei `304` wird der bekannte Stand zurückgegeben, ohne ihn erneut zu laden.
 */
export async function apiGetResource<T>(
  path: string,
  options: {
    query?: QueryParams;
    previous?: Resource<T> | undefined;
    signal?: AbortSignal;
  } = {},
): Promise<Resource<T>> {
  const { previous, ...rest } = options;
  const raw = await request<T>({
    method: 'GET',
    path,
    ifNoneMatch: previous?.etag,
    ...rest,
  });

  // Beim `304` bleibt die Objektidentität erhalten — React rendert dadurch
  // nichts neu, obwohl eine Anfrage lief.
  //
  // Nur zum Debuggen: in Node antwortet derselbe Aufruf mit `200`. Undici
  // hängt an jedes `fetch` ein `cache-control: no-cache`, woraufhin Express
  // die Ressource als unfrisch behandelt. Browser tun das nicht.
  if (raw.status === 304 && previous) {
    return { data: previous.data, etag: raw.etag ?? previous.etag };
  }
  return { data: expectBody(raw, path), etag: raw.etag };
}

// ── Schreiben ───────────────────────────────────────────────────────────────

/** `POST` braucht nie ein `If-Match`. */
export async function apiPost<T>(
  path: string,
  body?: unknown,
  options: { query?: QueryParams } = {},
): Promise<T> {
  const raw = await request<T>({ method: 'POST', path, body, ...options });
  return expectBody(raw, path);
}

/** Wie `apiPost`, aber für Routen ohne Antwortkörper. */
export async function apiPostVoid(path: string, body?: unknown): Promise<void> {
  await request<never>({ method: 'POST', path, body });
}

/**
 * `POST` auf eine Route, die trotzdem eine Vorbedingung verlangt — genau
 * `POST …/meetings/{id}/cancel`, das `If-Match`, aber keinen Körper will.
 */
export async function apiPostWithPrecondition<T>(
  path: string,
  precondition: Precondition,
  body?: unknown,
): Promise<Resource<T>> {
  const raw = await request<T>({
    method: 'POST',
    path,
    body,
    ifMatch: ifMatchOf(precondition),
  });
  return { data: expectBody(raw, path), etag: raw.etag };
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  precondition: Precondition,
): Promise<Resource<T>> {
  const raw = await request<T>({
    method: 'PATCH',
    path,
    body,
    ifMatch: ifMatchOf(precondition),
  });
  return { data: expectBody(raw, path), etag: raw.etag };
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  precondition: Precondition,
): Promise<Resource<T>> {
  const raw = await request<T>({
    method: 'PUT',
    path,
    body,
    ifMatch: ifMatchOf(precondition),
  });
  return { data: expectBody(raw, path), etag: raw.etag };
}

/**
 * `DELETE` braucht kein `If-Match`; einzelne Routen erwarten einen Körper.
 *
 * Die meisten antworten mit `204` und damit ohne Rumpf — deshalb `T = void`.
 * Wo eine Route etwas zu sagen hat („gelöscht oder nur stillgelegt?"), gibt
 * der Aufrufer den Typ an und bekommt ihn zurück.
 */
export async function apiDelete<T = void>(
  path: string,
  body?: unknown,
): Promise<T> {
  const raw = await request<T>({ method: 'DELETE', path, body });
  return raw.data as T;
}
