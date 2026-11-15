/**
 * Wie sich in der App etwas bewegt — an einer Stelle, damit es überall gleich
 * ist.
 *
 * **Zwei Werkzeuge, eine Sprache.** Was gezogen oder unterbrochen werden kann
 * (Sheets, Wischen, Toast, die Box hinter der Glocke), läuft über motion/react
 * und diese Federn. Was nur einmal hereinkommt — eine Seite, ein Register —,
 * ist eine CSS-Animation aus `globals.css` (`animate-tab-in`,
 * `animate-push-in`, `animate-panel-in`) und braucht kein JavaScript im Takt.
 * Die gleitende Pille (`glide-pill.tsx`) ist ein CSS-Übergang in derselben
 * Kurve (`ease-ios`): Sie misst selbst, wohin sie muss.
 *
 * **Nur Deckkraft und Verschiebung.** Beides rechnet der Browser auf der
 * Grafikkarte; Höhe, Breite oder Abstände zu animieren hieße, bei jedem Bild
 * das Layout neu zu berechnen — genau das, was eine App „hängen" lässt.
 * Die Ausnahmen sind das Auf- und Zuklappen im Antwort-Balken, wo die Höhe
 * die Aussage ist, und die Breite der gleitenden Pille zwischen verschieden
 * breiten Optionen — sie betrifft nur diese eine Fläche.
 *
 * **Reduzierte Bewegung gilt für beide**: in CSS über die Regel am Ende von
 * `globals.css`, in motion/react über `MotionConfig reducedMotion="user"` im
 * Gerüst (`providers.tsx`).
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

/** Ein- und Ausblenden ohne Weg. */
export const FADE = { duration: 0.15 } as const;
