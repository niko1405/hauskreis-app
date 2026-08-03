/**
 * Wohin eine Benachrichtigung springt — Pfade der **PWA**, nicht der API.
 *
 * Sie standen als Zeichenketten in sechs Erinnerungsdiensten, und alle sechs
 * zeigten auf `/meetings/:id`. Diese Route gibt es im Frontend nicht: sie heißt
 * `/termine/:id`. Jede Push-Benachrichtigung dieser App führte also auf eine
 * 404-Seite — was niemandem auffällt, der die Benachrichtigung nur verschickt.
 *
 * Deshalb hier an einer Stelle. Wer eine Route im Frontend umbenennt, findet
 * mit einer Suche nach dieser Datei alles, was mitzieht.
 */
export const appPath = {
  meeting: (meetingId: string) => `/termine/${meetingId}`,
  prayerBuddies: () => '/gebet',
  home: () => '/',
} as const;
