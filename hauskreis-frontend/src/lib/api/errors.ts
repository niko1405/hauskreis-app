/**
 * Fehler der API in Klassen übersetzt.
 *
 * Der Server antwortet für **jeden** Statuscode in derselben Form
 * (`docs/api-fuer-frontend.md` §4). Statt an jeder Aufrufstelle auf Zahlen zu
 * prüfen, gibt es hier je Fall eine Klasse — insbesondere für die beiden, die
 * eine eigene Behandlung im UI brauchen: `412` (jemand war schneller) und
 * `428` (ETag vergessen, ein Programmierfehler).
 */
import type { ErrorPayload, FieldError } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly payload: ErrorPayload | null;

  constructor(status: number, path: string, payload: ErrorPayload | null) {
    super(payload?.message ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
    this.payload = payload;
  }

  /** Feldfehler aus einer 400er-Prüfung, direkt an ein Formular verfütterbar. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.payload?.errors ?? ([] as FieldError[])) {
      out[e.field] ??= e.message;
    }
    return out;
  }
}

/** 401 — Token fehlt, ist abgelaufen oder gehört zu einem fremden Client. */
export class UnauthorizedError extends ApiError {
  override name = 'UnauthorizedError';
}

/** 403 — angemeldet, aber ohne das nötige Recht (meist eine Admin-Route). */
export class ForbiddenError extends ApiError {
  override name = 'ForbiddenError';
}

/**
 * Der eine Fall, für den der Statuscode nicht reicht: das Token ist echt, die
 * E-Mail-Adresse dahinter aber unbestätigt. Der Server schickt dafür
 * `code: 'EMAIL_NOT_VERIFIED'` (siehe `errorSchema` im Backend) — auf die
 * Meldung zu vergleichen wäre eine Kopplung an einen deutschen Satz.
 *
 * Wichtig ist, dass es ein **403** ist und kein 401: ein 401 heißt „hol dir ein
 * neues Token", und genau das half hier nie. Keycloaks Erneuerung führt keine
 * Required Actions aus, das neue Token trug dieselbe unbestätigte Adresse, und
 * aus Abweisung und Erneuerung wurde eine Schleife.
 */
export function isEmailUnverified(e: unknown): boolean {
  return (
    e instanceof ForbiddenError && e.payload?.code === 'EMAIL_NOT_VERIFIED'
  );
}

/**
 * 404 — nicht vorhanden **oder** zu einem anderen Hauskreis gehörend. Der
 * Server unterscheidet das absichtlich nicht.
 */
export class NotFoundError extends ApiError {
  override name = 'NotFoundError';
}

/** 409 — etwa eine E-Mail-Adresse, die es in Keycloak schon gibt. */
export class ConflictError extends ApiError {
  override name = 'ConflictError';
}

/**
 * 412 — der mitgeschickte ETag ist veraltet: jemand anders hat in der
 * Zwischenzeit gespeichert. Das ist der einzige Moment, in dem die App einen
 * verlorenen Schreibvorgang bemerken kann — er gehört angezeigt, nicht
 * verschluckt (§2).
 */
export class StaleResourceError extends ApiError {
  override name = 'StaleResourceError';
}

/**
 * 428 — es wurde kein `If-Match` mitgeschickt. Kommt nicht von Nutzereingaben,
 * sondern davon, dass eine Schreiboperation den ETag nicht mitführt.
 */
export class PreconditionRequiredError extends ApiError {
  override name = 'PreconditionRequiredError';
}

/** 429 — mehr als 300 Aufrufe pro Minute. */
export class RateLimitError extends ApiError {
  override name = 'RateLimitError';
}

/** Die Anfrage kam nicht bis zum Server (offline, DNS, CORS-Vorabprüfung). */
export class NetworkError extends Error {
  readonly cause?: unknown;

  constructor(path: string, cause?: unknown) {
    super(`Netzwerkfehler bei ${path}`);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/**
 * Der Server hat innerhalb der Frist nicht geantwortet. Eigene Klasse, weil
 * das etwas anderes heißt als „nicht erreichbar": es lohnt sich, es gleich
 * noch einmal zu versuchen.
 */
export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(path: string, timeoutMs: number) {
    super(`Zeitüberschreitung bei ${path} nach ${timeoutMs} ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export function toApiError(
  status: number,
  path: string,
  payload: ErrorPayload | null,
): ApiError {
  switch (status) {
    case 401:
      return new UnauthorizedError(status, path, payload);
    case 403:
      return new ForbiddenError(status, path, payload);
    case 404:
      return new NotFoundError(status, path, payload);
    case 409:
      return new ConflictError(status, path, payload);
    case 412:
      return new StaleResourceError(status, path, payload);
    case 428:
      return new PreconditionRequiredError(status, path, payload);
    case 429:
      return new RateLimitError(status, path, payload);
    default:
      return new ApiError(status, path, payload);
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export function isStatus(e: unknown, status: number): boolean {
  return isApiError(e) && e.status === status;
}

/** Eine für Menschen brauchbare Zeile — Grundlage jeder Fehlermeldung im UI. */
export function errorMessage(e: unknown): string {
  if (e instanceof TimeoutError) {
    return 'Der Server antwortet gerade nicht. Nochmal versuchen?';
  }
  if (e instanceof NetworkError) {
    return 'Keine Verbindung zum Server. Bist du online?';
  }
  if (e instanceof StaleResourceError) {
    // Derselbe Ton wie im `ConflictBanner`: was los ist und was hilft, nicht
    // wer schuld war.
    return 'Das hat nicht geklappt — dein Stand war nicht mehr der aktuelle. Lade neu und probier es noch einmal.';
  }
  /**
   * **Sollte niemand zu sehen bekommen.** Ein abgelaufenes Token erneuert der
   * Fetch-Wrapper und wiederholt die Anfrage; erst wenn auch das scheitert,
   * kommt der Fehler bis hierher — und dann ist die Sitzung wirklich weg.
   *
   * Der Satz steht trotzdem hier, weil ohne ihn der des Servers durchgereicht
   * wurde: „Invalid or expired token". Wer das liest, hat gerade auf Speichern
   * gedrückt und weiß weder, was ein Token ist, noch was er jetzt tun soll.
   */
  if (e instanceof UnauthorizedError) {
    return 'Deine Anmeldung ist abgelaufen. Lade die Seite neu.';
  }
  if (e instanceof RateLimitError) {
    return 'Zu viele Anfragen. Einen Moment warten und erneut versuchen.';
  }
  if (e instanceof ForbiddenError) {
    return 'Dafür fehlt dir die Berechtigung.';
  }
  if (isApiError(e)) {
    return e.payload?.message ?? `Fehler ${e.status}`;
  }

  /**
   * Alles, was nicht vom Server kam.
   *
   * Hier stand nur „Unerwarteter Fehler." — und damit war jede Aussage weg,
   * die der Fehler mitbrachte. Das fiel dort auf, wo man am wenigsten
   * nachsehen kann: Beim Einschalten der Benachrichtigungen auf dem iPhone
   * scheiterte `pushManager.subscribe()`, und übrig blieben zwei Wörter, aus
   * denen sich nicht einmal ableiten ließ, ob es am Gerät, an der Erlaubnis
   * oder am Schlüssel lag. Auf einem Telefon gibt es keine Konsole, in die man
   * ersatzweise schauen könnte.
   *
   * Ein `DOMException` kommt vom Browser, ist englisch und technisch — der
   * bekommt einen Rahmen, damit er nicht wie unser eigener Text aussieht.
   * Alles andere ist ein `throw` aus diesem Projekt, und die Sätze dort sind
   * für Menschen geschrieben; die stehen für sich.
   */
  if (typeof DOMException !== 'undefined' && e instanceof DOMException) {
    return `Unerwarteter Fehler: ${e.name} — ${e.message}`;
  }
  if (e instanceof Error && e.message !== '') {
    return e.message;
  }
  return 'Unerwarteter Fehler.';
}
