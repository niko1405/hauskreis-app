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

export function hostReminderBody(
  date: Date,
  locationName: string | null,
): string {
  const when = formatMeetingDate(date);

  return locationName
    ? `Am ${when} ist der Hauskreis bei dir (${locationName}).`
    : `Am ${when} ist der Hauskreis bei dir.`;
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
