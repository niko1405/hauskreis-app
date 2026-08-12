import { GroupClockService } from './group-clock.service';
import { currentDay, isPast } from './meeting-schedule';
import { DEFAULT_TIME_ZONE } from '../common/time/local-evening';

/**
 * Eine feste Uhr für Tests — immer dieselbe Zone, ohne Datenbank.
 *
 * Die Dienste bekommen die Zone seit dem Zeitzonen-Umbau über
 * `GroupClockService`, und fast jeder Test hat sie als Attrappe gebraucht.
 * Vierzig Kopien desselben `{ zoneOf: () => … }` wären vierzig Gelegenheiten,
 * sie leicht verschieden zu bauen.
 *
 * `Europe/Berlin` als Vorgabe, weil die Tests ihre Daten in Ortszeit denken
 * („Dienstag, 18 Uhr"). Wer eine andere prüfen will, reicht sie herein.
 */
/**
 * Hängt einem fertig gebauten Dienst die Test-Uhr an.
 *
 * Die Attrappen in den Tests reichen dem Konstruktor nur das herein, was der
 * jeweilige Fall wirklich benutzt — bei einem Dienst mit zwölf Abhängigkeiten
 * wären zwölf `{} as unknown as X` je Datei purer Ballast. Die Uhr auf demselben
 * Weg nachzureichen hieße, in jeder Datei bis zur richtigen Stelle zu zählen und
 * beim nächsten neuen Parameter neu zu zählen.
 */
export function withClock<T>(service: T, zone?: string): T {
  return Object.assign(service as object, { clock: testClock(zone) }) as T;
}

export function testClock(zone: string = DEFAULT_TIME_ZONE): GroupClockService {
  return {
    zoneOf: () => Promise.resolve(zone),
    today: (_hauskreisId: string, now?: Date) =>
      Promise.resolve(currentDay(zone, now)),
    isPast: (_hauskreisId: string, date: Date, now?: Date) =>
      Promise.resolve(isPast(date, zone, now)),
    forget: () => undefined,
  } as unknown as GroupClockService;
}
