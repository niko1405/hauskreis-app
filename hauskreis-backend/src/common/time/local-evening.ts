/**
 * Wann ein Abend anfängt.
 *
 * Der Rest des Systems rechnet in Kalendertagen: `meeting.date` ist `@db.Date`,
 * und `isPast` in `meeting-schedule.ts` schneidet beide Seiten auf Mitternacht
 * UTC. Für „ist der Abend vorbei" ist das genau richtig — ein Termin soll den
 * ganzen Tag über als kommend gelten.
 *
 * Für eine Sache reicht der Tag aber nicht: **wann andere den Inhalt eines
 * Themas sehen dürfen**. Der Actionstep der Woche gehört nicht am Morgen des
 * Termintags allen, sondern ab dem Moment, in dem er ausgesprochen wurde. Dafür
 * braucht es eine Uhrzeit, und eine Uhrzeit braucht eine Zeitzone.
 *
 * Deshalb steht das hier und nicht bei den Kalendertagen: es ist bewusst der
 * einzige Ort im Backend, an dem eine Wanduhr vorkommt.
 */

/** Wann der Hauskreis anfängt. Eine Gruppe, ein Termin, eine Uhrzeit. */
export const EVENING_HOUR = 18;

/**
 * Fest verdrahtet und nicht aus der Umgebung gelesen: die Gruppe trifft sich in
 * Deutschland. Ein Server in einer anderen Zone soll denselben Abend meinen.
 */
export const TIME_ZONE = 'Europe/Berlin';

/**
 * Der Versatz der Zone zu UTC in Minuten, zu diesem Zeitpunkt.
 *
 * Über `Intl` statt über eine Bibliothek: Node bringt die Zeitzonendaten schon
 * mit, und eine zweite Quelle für „wann ist Sommerzeit" wäre eine Quelle zu viel.
 */
function zoneOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(instant);

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
