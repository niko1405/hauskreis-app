/**
 * Rollen. Der Realm kennt genau zwei: `member` und `admin`.
 *
 * Woran man erkennt, ob jemand Admin ist: an `roles` aus `GET /api/me`. Das
 * JWT selbst wird im Frontend nie auseinandergenommen.
 */
import type { Me } from '../api/types';

export const ROLE_ADMIN = 'admin';
export const ROLE_MEMBER = 'member';

export function isAdmin(me: Me | undefined): boolean {
  return me?.roles.includes(ROLE_ADMIN) ?? false;
}

/**
 * Die Routen, die der Server nur Admins erlaubt. Sie stehen hier, weil
 * `openapi.json` sie **nicht** markiert — `@Roles(...)` hinterlässt keine
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
  'POST   /hauskreise/{id}/meetings/generate',
  'POST   /hauskreise/{id}/meetings/host-reminders',
  'POST   /hauskreise/{id}/meetings/actionstep-reminders',
  'DELETE /hauskreise/{id}/topics/{topicId}',
  'POST   /hauskreise/{id}/topics/carry-over',
  'POST   /hauskreise/{id}/topics/reminders',
  'DELETE /hauskreise/{id}/songs/{songId}',
  'POST   /hauskreise/{id}/songs/reminders',
  'POST   /hauskreise/{id}/absences/sync',
  'PUT    /hauskreise/{id}/prayer-buddies/config',
  'POST   /hauskreise/{id}/prayer-buddies/rotate',
] as const;
