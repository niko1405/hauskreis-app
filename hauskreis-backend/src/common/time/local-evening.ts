/**
 * Die Zeitzone der Gruppe — und wann ein Abend anfängt.
 *
 * Der Rest des Systems rechnet in Kalendertagen: `meeting.date` ist `@db.Date`,
 * und `isPast` in `meeting-schedule.ts` vergleicht Tag mit Tag. Für „ist der
 * Abend vorbei" ist das genau richtig — ein Termin soll den ganzen Tag über als
 * kommend gelten.
 *
 * Für zwei Dinge reicht der Tag als Zahl aber nicht:
 *
 * 1. **Welchen Tag haben wir überhaupt.** „Jetzt" ist ein Zeitpunkt, und
 *    welcher Kalendertag das ist, hängt davon ab, wo man steht. Das rechnet
 *    `currentDay` in `meeting-schedule.ts` — mit dem Versatz von hier.
 * 2. **Wann andere den Inhalt eines Themas sehen dürfen.** Der Actionstep der
 *    Woche gehört nicht am Morgen des Termintags allen, sondern ab dem Moment,
 *    in dem er ausgesprochen wurde.
 *
 * Deshalb ist das hier der einzige Ort im Backend, der `Intl` nach einem
 * Zeitzonen-Versatz fragt. Wer eine Wanduhr in einen Zeitpunkt übersetzt, kommt
 * über diese Datei.
 *
 * Zwei Angaben kommen von außen und stehen nicht mehr im Code: die Uhrzeit vom
 * Termin (`meeting.startMinutes`) und die **Zone von der Gruppe**
 * (`MeetingScheduleConfig.timeZone`, aufgelöst über `GroupClockService`). Beide
 * standen einmal als Konstante hier, und beide waren eine Aussage zu viel für
 * eine App, die mehr als einen Hauskreis kennt.
 */

/**
 * Der Rückfall, wenn keine Zeit dabeisteht: 18 Uhr.
 *
 * War die feste Anfangszeit des Hauskreises, ist jetzt nur noch die Vorgabe von
 * `MeetingScheduleConfig` und die Antwort auf „und wenn doch mal nichts
 * dasteht".
 */
export const EVENING_HOUR = 18;

/**
 * Die Vorgabe, wenn eine Gruppe nichts anderes eingestellt hat.
 *
 * Stand hier als `TIME_ZONE` fest verdrahtet, mit der Begründung „die Gruppe
 * trifft sich in Deutschland" — dieselbe Aussage zu viel, die vorher schon bei
 * Wochentag und Uhrzeit fiel. Die Zone steht jetzt in `MeetingScheduleConfig`
 * und wird von dort hereingereicht; das hier ist nur noch der Anfangswert.
 */
export const DEFAULT_TIME_ZONE = 'Europe/Berlin';

/**
 * Die Zone, in der die täglichen Läufe feuern.
 *
 * Sie ist bewusst ein **anderer Begriff** als `DEFAULT_TIME_ZONE`, auch wenn
 * beide denselben Wert tragen: ein Cron braucht *eine* Wanduhr, Gruppen können
 * aber verschiedene Zonen haben, und der Prozess kann nicht in allen
 * gleichzeitig um neun Uhr aufwachen. Das hier ist deshalb die Uhr des Servers.
 * Was *innerhalb* eines Laufs „heute" heißt, rechnet weiterhin
 * `GroupClockService` je Gruppe — die Läufe gehen ohnehin über alle Hauskreise.
 *
 * **Ohne diese Angabe nimmt `@nestjs/schedule` die Zeitzone des Prozesses**, und
 * die ist im Container UTC: die Neun-Uhr-Erinnerungen kämen im Sommer um elf und
 * im Winter um zehn. Der Weg über ein `TZ=Europe/Berlin` am Container wäre der
 * größere Eingriff — er verschöbe die Uhr für alles, auch für den pg-Treiber und
 * dessen `@db.Date`-Spalten. Der Parameter am Cron verschiebt nur, wann gefeuert
 * wird.
 */
export const CRON_TIME_ZONE = DEFAULT_TIME_ZONE;

/**
 * Ein Formatierer je Zone, einmal gebaut.
 *
 * `Intl.DateTimeFormat` ist nicht billig, und seit der Kalendertag über
 * `currentDay` durch dieselbe Rechnung läuft, passiert das pro Anfrage mehrfach.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'longOffset',
    });
    formatters.set(zone, formatter);
  }

  return formatter;
}

/**
 * Der Versatz der Zone zu UTC in Minuten, zu diesem Zeitpunkt.
 *
 * Über `Intl` statt über eine Bibliothek: Node bringt die Zeitzonendaten schon
 * mit, und eine zweite Quelle für „wann ist Sommerzeit" wäre eine Quelle zu viel.
 */
export function zoneOffsetMinutes(instant: Date, zone: string): number {
  const parts = offsetFormatter(zone).formatToParts(instant);

  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);

  // Reines „GMT" ohne Versatz heißt UTC — so schreibt es Intl für +00:00.
  if (!match) return 0;

  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/**
 * Der Moment, in dem der Abend dieses Kalendertags beginnt.
 *
 * `startMinutes` sind Minuten seit Mitternacht Ortszeit, wie sie am Termin
 * stehen. Ohne Angabe gilt `EVENING_HOUR`.
 *
 * Zwei Durchgänge, weil der Versatz selbst vom Zeitpunkt abhängt: der erste
 * Versuch rechnet mit dem Versatz zur falschen Stunde, der zweite mit dem zur
 * fast richtigen. Ein dritter brächte nichts, solange die Anfangszeit nicht in
 * der Umstellungsstunde selbst liegt — die ist nachts um zwei, und dann trifft
 * sich kein Hauskreis.
 */
export function eveningOf(
  date: Date,
  zone: string,
  startMinutes: number = EVENING_HOUR * 60,
): Date {
  const wallClock =
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) +
    startMinutes * 60_000;

  const guess = new Date(
    wallClock - zoneOffsetMinutes(new Date(wallClock), zone) * 60_000,
  );
  return new Date(wallClock - zoneOffsetMinutes(guess, zone) * 60_000);
}

/**
 * Hat der Abend dieses Termins begonnen?
 *
 * `now` ist ein Parameter und keine versteckte `new Date()`, damit die Tests
 * nicht an der Systemuhr hängen.
 */
export function eveningReached(
  date: Date,
  zone: string,
  now: Date = new Date(),
  startMinutes?: number,
): boolean {
  return now.getTime() >= eveningOf(date, zone, startMinutes).getTime();
}
