'use client';

/**
 * Nimmt den Wegweiser-Punkt weg, sobald die Verwaltung einmal offen war.
 *
 * Ein eigenes Bauteil, das nichts zeichnet, weil die Seite selbst ein
 * Server-Bauteil ist und `useEffect` nicht kennt. Es hier zu erledigen statt in
 * einer der vier Karten hält die Aussage an einer Stelle: **diese Seite** wurde
 * gesehen — nicht „die Läufe wurden gesehen".
 */
import { useEffect } from 'react';
import { useUnreadAdmin } from './use-unread-admin';

export function MarkAdminSeen() {
  const { markSeen } = useUnreadAdmin();

  useEffect(markSeen, [markSeen]);

  return null;
}
