/**
 * Wie sich in der App etwas bewegt — an einer Stelle, damit es überall gleich
 * ist.
 *
 * **Zwei Werkzeuge, eine Sprache.** Was auf einen Zustand reagiert und dabei
 * gezogen oder unterbrochen werden kann (Sheets, Wischen, gleitende Pillen),
 * läuft über motion/react und diese Federn. Was nur einmal hereinkommt — eine
 * Seite, ein Register —, ist eine CSS-Animation aus `globals.css`
 * (`animate-tab-in`, `animate-push-in`, `animate-panel-in`) und braucht kein
 * JavaScript im Takt.
 *
 * **Nur Deckkraft und Verschiebung.** Beides rechnet der Browser auf der
 * Grafikkarte; Höhe, Breite oder Abstände zu animieren hieße, bei jedem Bild
 * das Layout neu zu berechnen — genau das, was eine App „hängen" lässt.
 * Die eine Ausnahme ist das Auf- und Zuklappen im Antwort-Balken, wo die Höhe
 * die Aussage ist.
 *
 * **Reduzierte Bewegung gilt für beide**: in CSS über die Regel am Ende von
 * `globals.css`, in motion/react über `MotionConfig reducedMotion="user"` im
 * Gerüst (`app-shell.tsx`).
 */

/** Wischen, Zurückschnappen, eine Zeile, die wegfährt: knapp und ohne Nachschwingen. */
export const SPRING = { type: 'spring', damping: 30, stiffness: 300 } as const;

/** Etwas, das sich umbaut — der Kopf beim Suchen, der Antwort-Balken. */
export const SPRING_GENTLE = {
  type: 'spring',
  damping: 30,
  stiffness: 260,
} as const;

/** Etwas, das aufgeht — die Box hinter der Glocke, ein Balken, ein Toast. */
export const SPRING_POP = {
  type: 'spring',
  damping: 28,
  stiffness: 340,
} as const;

/** Ein Sheet von unten: etwas weicher, es ist die größte Fläche, die sich bewegt. */
export const SPRING_SHEET = {
  type: 'spring',
  damping: 25,
  stiffness: 220,
} as const;

/**
 * Die gewählte Pille, die zum neuen Ziel gleitet — Tab-Leiste, Seitenspalte,
 * Umschalter. Über Dauer und Federung statt Steifigkeit, damit sie auf kurzer
 * und langer Strecke gleich lange braucht.
 */
export const SPRING_PILL = {
  type: 'spring',
  bounce: 0.12,
  duration: 0.45,
} as const;

/** Ein- und Ausblenden ohne Weg. */
export const FADE = { duration: 0.15 } as const;
