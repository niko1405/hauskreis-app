/**
 * Wie lange welche Daten als frisch gelten.
 *
 * Neun Leute planen an denselben Abenden; die Zahlen sind so gewählt, dass
 * Ansichten, an denen gerade gearbeitet wird, schnell nachziehen, und
 * Stammdaten nicht bei jedem Tab-Wechsel neu geladen werden.
 */
const second = 1000;
const minute = 60 * second;

export const STALE = {
  /** Personen, Orte, Hauskreise: ändern sich fast nie. */
  reference: 10 * minute,
  /** Home-Screen: die Ansicht, die am häufigsten offen liegt. */
  home: 60 * second,
  /** Listen und die Mehrwochen-Tabelle. */
  list: 60 * second,
  /** Einzelressourcen — dank `If-None-Match` ist ein Refetch billig. */
  detail: 30 * second,
  /** Song-Datenbank, Themen, Archiv-Kennzahlen. */
  archive: 5 * minute,
  /**
   * Vorschläge: immer frisch. Sie sind die Entscheidungsgrundlage beim
   * Eintragen — ein veralteter Stand hieße, jemandem eine Rolle zu geben,
   * die er zwischenzeitlich schon woanders hat.
   */
  suggestions: 0,
} as const;
