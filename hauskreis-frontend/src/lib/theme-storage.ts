/**
 * Wo die Farbwahl liegt — und die drei Werte, die sie annehmen kann.
 *
 * Eine eigene Datei **ohne** `'use client'`, und das ist der ganze Grund für
 * sie: `lib/theme.ts` trägt die Direktive wegen seiner Hooks, und damit wird
 * jeder Import daraus zu einer Client-Referenz. Das Inline-Skript in
 * `components/layout/theme-script.tsx` läuft aber im Server-Graph — es setzt
 * den Schlüssel per Zeichenkette in das HTML ein.
 *
 * Von dort importiert, kam nicht `'acts2-theme'` heraus, sondern der Quelltext
 * einer Stellvertreter-Funktion: `localStorage.getItem('function(){throw
 * Error("Attempted to call STORAGE_KEY from the server…")}')`. Das brach
 * nichts sichtbar — es las nur immer einen Schlüssel, den niemand schreibt,
 * und eine ausdrückliche Wahl galt deshalb nie.
 */
export const THEME_STORAGE_KEY = 'acts2-theme';

export type Theme = 'light' | 'dark' | 'system';
