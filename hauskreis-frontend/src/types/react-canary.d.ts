/**
 * Die Typen der Canary-Fassung von React.
 *
 * Im App Router läuft Next mit seiner eigenen Canary-Fassung, und die kennt
 * `<ViewTransition>` und `addTransitionType` (`app/(app)/template.tsx`). Die
 * Typen dafür stehen in `@types/react`, aber nicht in seinem Einstieg.
 */
/// <reference types="react/canary" />
