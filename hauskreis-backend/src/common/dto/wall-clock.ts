import { z } from 'zod';
import { formatWallClock, parseWallClock } from '../time/wall-clock';

/**
 * Eine Uhrzeit ohne Datum — `"19:30"` nach außen, Minuten seit Mitternacht innen.
 *
 * Gespeichert wird eine Zahl (`meeting.start_minutes`), weil eine Wanduhrzeit
 * kein Zeitpunkt ist (siehe `common/time/wall-clock.ts`). Über die Leitung geht
 * trotzdem `"19:30"` — die Zahl `1170` müsste jeder Aufrufer selbst deuten, und
 * `<input type="time">` liefert und erwartet ohnehin genau diese Schreibweise.
 *
 * Dieselbe Bauform wie `isoDay` und aus demselben Grund: `z.coerce` und eigene
 * Klassen lassen sich nicht als JSON Schema ausdrücken, und die
 * OpenAPI-Erzeugung bricht daran ab. Ein `string` mit `pattern` beschreibt sich
 * selbst.
 */

/** Nur volle Minuten, keine Sekunden — `24:00` gibt es nicht. */
const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Uhrzeit als HH:MM, etwa 19:30');

/** `"19:30"` rein, `1170` raus. Für Anfragen. */
export const wallClockIn = hhmm.transform(parseWallClock);

/**
 * `1170` rein, `"19:30"` raus. Für Antworten.
 *
 * Der `.pipe()` am Ende wie bei `isoDateOut`: er macht das Ergebnis wieder zu
 * einem beschreibbaren Schema, sodass in OpenAPI ein `string` steht und nicht
 * die Zahl, mit der intern gerechnet wird.
 */
export const wallClockOut = z
  .number()
  .int()
  .min(0)
  .max(1439)
  .transform(formatWallClock)
  .pipe(hhmm);
