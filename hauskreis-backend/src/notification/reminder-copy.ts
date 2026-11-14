/**
 * The wording of the meeting reminders, in one place.
 *
 * Warm and personal, addressed to the person rather than about them — the tone
 * laid out in CLAUDE.md §9. Kept together so the three reminders that arrive in
 * the same week sound like they come from the same app.
 */
const dateFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const shortDateFormat = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export function formatMeetingDate(date: Date): string {
  return dateFormat.format(date);
}

export function formatShortDate(date: Date): string {
  return shortDateFormat.format(date);
}

/** Was eine Nachricht von einem Abend wissen muss, um ihn beim Namen zu nennen. */
export interface NamedMeeting {
  title: string | null;
  special: boolean;
}

/**
 * Wie eine Nachricht einen Abend nennt.
 *
 * „Der Hauskreis" stimmt für den Dienstag, aber nicht für „Outreach & Chillout"
 * am Samstag — „Heute ist Hauskreis" über einer Freizeit klang, als hätte die
 * App nicht hingesehen. **Ein eigener Titel geht deshalb immer vor.** Ohne ihn
 * heißt ein besonderer Termin „der besondere Termin", wie in seiner Ankündigung
 * (`custom-meeting-notification.service.ts`), und ein gewöhnlicher Abend bleibt
 * „der Hauskreis".
 *
 * `start` für den Satzanfang. Der Titel steht, wie er eingetragen wurde — nur
 * die Rückfälle bekommen dort einen großen Anfangsbuchstaben.
 */
export function meetingSubject(
  meeting: NamedMeeting,
  position: 'start' | 'inline' = 'inline',
): string {
  if (meeting.title) return meeting.title;

  const fallback = meeting.special ? 'der besondere Termin' : 'der Hauskreis';

  return position === 'start'
    ? `${fallback.charAt(0).toUpperCase()}${fallback.slice(1)}`
    : fallback;
}

/**
 * „Am Dienstag ist der Hauskreis bei dir" — für die Erinnerung **und** für die
 * Zuteilung. Zwei Fassungen desselben Satzes waren schon auseinandergelaufen,
 * bevor der Titel dazukam.
 */
export function hostReminderBody(
  meeting: NamedMeeting & { date: Date },
  locationName: string | null,
): string {
  const when = formatMeetingDate(meeting.date);
  const what = meetingSubject(meeting);

  return locationName
    ? `Am ${when} ist ${what} bei dir (${locationName}).`
    : `Am ${when} ist ${what} bei dir.`;
}

export function topicReminderBody(
  date: Date,
  topicTitle: string | null,
): string {
  const when = formatMeetingDate(date);

  // The title is optional by design — not everyone enters one in advance.
  return topicTitle
    ? `Am ${when} bist du mit "${topicTitle}" dran.`
    : `Am ${when} bist du mit dem Thema dran.`;
}

export function testimonyReminderBody(date: Date): string {
  return `Am ${formatMeetingDate(date)} erzählst du dein Testimony.`;
}

export function songReminderBody(date: Date): string {
  return `Am ${formatMeetingDate(date)} machst du die Musik.`;
}

/**
 * Die Erinnerung an die Snacks — mit Fragezeichen, nicht mit Ausrufezeichen.
 *
 * Was jemand mitbringt, verabredet die Gruppe unter sich; die App weiß es nicht
 * und tut nicht so. Sie erinnert nur daran, dass man sich gemeldet hat.
 */
export function snackReminderBody(date: Date): string {
  return `Am ${formatMeetingDate(date)} bringst du etwas zu essen mit.`;
}

/**
 * Wann ein besonderer Termin ist — ein Tag oder ein Zeitraum.
 *
 * „Vom 14. bis 16. Mai" statt zweimal derselbe Satz mit zwei Daten: die Frage
 * bei einer Freizeit ist nicht *wann sie anfängt*, sondern *wie lange sie
 * dauert*.
 */
function whenPhrase(date: Date, endDate: Date | null): string {
  return endDate
    ? `Vom ${formatShortDate(date)} bis ${formatShortDate(endDate)}`
    : `Am ${formatMeetingDate(date)}`;
}

/** Die Ankündigung, wenn jemand einen besonderen Termin einträgt. */
export function customMeetingBody(date: Date, endDate: Date | null): string {
  return `${whenPhrase(date, endDate)} steht etwas Besonderes an.`;
}

/** Und die Erinnerung kurz davor — den hat man nicht im Kopf wie den Dienstag. */
export function customMeetingReminderBody(
  date: Date,
  endDate: Date | null,
): string {
  return `${whenPhrase(date, endDate)} ist es so weit.`;
}
