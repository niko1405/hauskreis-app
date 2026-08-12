/**
 * Rollen.
 *
 * „Admin" gilt **pro Hauskreis** und steht als `role` an der eigenen Person
 * (`GET /api/me`). Vorher war es eine Realm-Rolle im Token und galt überall —
 * was spätestens dann falsch ist, wenn sich jemand einen eigenen Hauskreis
 * anlegt und im alten Mitglied bleibt.
 */
import type { Me } from '../api/types';

export function isAdmin(me: Me | undefined): boolean {
  return me?.role === 'ADMIN';
}

/**
 * Die Routen, die der Server nur Admins erlaubt. Sie stehen hier, weil
 * `openapi.json` sie **nicht** markiert — `@HauskreisAdmin()` hinterlässt keine
 * Spur in der Spec. Die Liste dient dazu, Bedienelemente gar nicht erst
 * anzuzeigen; die Durchsetzung bleibt beim Server.
 */
export const ADMIN_ONLY_ROUTES = [
  'POST   /hauskreise/{id}/people',
  'POST   /hauskreise/{id}/people/invite',
  'DELETE /hauskreise/{id}/people/{personId}',
  // Orte stehen hier bewusst **nicht** mehr: ein Treffpunkt entsteht im
  // Vorbeigehen, und wer dafür erst jemanden mit Admin-Rechten suchen muss,
  // trägt ihn gar nicht erst ein. Geschützt ist stattdessen die Wohnung eines
  // Menschen — die lässt sich nur über das eigene Profil auflösen.
  'DELETE /hauskreise/{id}/meetings/{meetingId}',
  // Den ganzen Abend absagen ist etwas anderes, als selbst nicht zu kommen.
  // Vorher stand der rote Knopf für jedes Mitglied da, und daneben nichts, was
  // den Unterschied erklärt hätte.
  'POST   /hauskreise/{id}/meetings/{meetingId}/cancel',
  'POST   /hauskreise/{id}/meetings/{meetingId}/uncancel',
  'POST   /hauskreise/{id}/meetings/generate',
  // Lesen darf jede:r — wann sich die Gruppe trifft, gehört auf jeden
  // Bildschirm. Nur das Verstellen ist Admin-Sache.
  'PUT    /hauskreise/{id}/meetings/config',
  'POST   /hauskreise/{id}/meetings/host-reminders',
  'POST   /hauskreise/{id}/meetings/actionstep-reminders',
  'POST   /hauskreise/{id}/topics/reminders',
  'DELETE /hauskreise/{id}/songs/{songId}',
  'POST   /hauskreise/{id}/songs/reminders',
  'POST   /hauskreise/{id}/absences/sync',
  'PUT    /hauskreise/{id}/prayer-buddies/config',
  'POST   /hauskreise/{id}/prayer-buddies/rotate',
  'POST   /hauskreise/{id}/prayer-buddies/plan',
] as const;
