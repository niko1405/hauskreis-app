/**
 * Eine Uhrzeit ohne Datum, als Minuten seit Mitternacht.
 *
 * Kein `Date`: eine Wanduhrzeit hat keinen Tag und keine Zeitzone. Sie in ein
 * `Date` zu stecken hieße, beides zu erfinden — und irgendwann rechnet jemand
 * damit. Als Zahl ist sie sortierbar, vergleichbar und beim Speichern schlicht
 * eine Spalte (`meeting.start_minutes`).
 *
 * Wo daraus ein Zeitpunkt werden muss — „ist der Abend schon losgegangen" —,
 * kommt die Zeitzone dazu, und das passiert an genau einer Stelle:
 * `local-evening.ts`.
 */

/** `"19:30"` → `1170`. Wirft nicht — das prüft das Schema in `dto/wall-clock`. */
export function parseWallClock(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours as number) * 60 + (minutes as number);
}

/** `1170` → `"19:30"`. Zweistellig, damit sich Zeiten vergleichen lassen. */
export function formatWallClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${pad(hours)}:${pad(minutes % 60)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
