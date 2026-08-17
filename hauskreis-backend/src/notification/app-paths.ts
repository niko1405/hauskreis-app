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
  // Die Id steht in der Query, seit das Frontend als statischer Export
  // ausgeliefert wird: ein Pfadsegment `[id]` bräuchte dort eine zur Bauzeit
  // bekannte Liste aller Termine. Genau der Fall, für den diese Datei angelegt
  // wurde — die Route hat sich geändert, und hier ist die einzige Stelle, an
  // der das Backend sie kennt.
  meeting: (meetingId: string) => `/termin?id=${meetingId}`,
  meetings: () => '/termine',
  prayerBuddies: () => '/gebet',
  home: () => '/',
  /**
   * „Neu in Acts2".
   *
   * Die Version gehört in die Adresse, obwohl die Seite alle Releases zeigt:
   * Der Service Worker setzt `tag: payload.url` (`sw.ts`), damit dieselbe
   * Nachricht nicht zweimal aufpoppt. Ohne die Version fielen zwei
   * Ankündigungen zu einer zusammen — und die zweite verdrängte die erste,
   * bevor sie jemand gelesen hat.
   */
  release: (version: string) => `/neu?v=${encodeURIComponent(version)}`,
} as const;
