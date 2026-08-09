/**
 * Wer welches Thema sehen und ändern darf — als reine Funktionen.
 *
 * Drei Dinge, die man leicht verwechselt und die hier auseinandergehalten
 * werden:
 *
 * - **gehalten** ist eine Tatsache über den Kalender: die Einheit hing an einem
 *   Abend, und der Abend war. Kein Häkchen, das jemand setzt.
 * - **öffentlich** ist eine Eigenschaft des *Themas*, nicht der Einheit: sobald
 *   eine Einheit gehalten wurde, steht das Thema im Archiv — mit allem, was
 *   danach noch dazukommt.
 * - **Inhalt sichtbar** ist die Frage des einzelnen Abends: der Actionstep für
 *   nächste Woche gehört bis 18 Uhr denen, die ihn vorbereiten.
 *
 * Rechte kommen dazu und folgen der Hausregel aus `edit-rights.ts`, nur eine
 * Ebene höher: dort ist es die Zuteilung an einem Abend, hier die Zugehörigkeit
 * zum Thema.
 */
import { MeetingStatus } from '../../generated/prisma/enums';
import { eveningReached } from '../common/time/local-evening';
import { isPast } from '../meeting/meeting-schedule';

/** Was von einem Termin für diese Fragen zählt. */
export interface SessionMeeting {
  date: Date;
  status: MeetingStatus;
}

/** Wer zu einem Thema gehört. */
export interface TopicMembership {
  ownerPersonId: string | null;
  collaboratorIds: readonly string[];
}

/**
 * Hat diese Einheit stattgefunden?
 *
 * Ohne Termin nie — eine unfertige Einheit ist Vorbereitung, kein Abend. Und
 * ein abgesagter Termin zählt nicht, obwohl sein Datum vorbei ist: an ihm ist
 * nichts passiert.
 *
 * Dass eine Absage später zurückgenommen wird, braucht hier keine eigene
 * Behandlung. Die Einheit bleibt am Termin hängen; sie ist nur so lange nicht
 * gehalten, wie er abgesagt ist.
 */
export function isHeld(meeting: SessionMeeting | null | undefined): boolean {
  if (!meeting) return false;
  if (meeting.status === MeetingStatus.CANCELLED) return false;
  return isPast(meeting.date);
}

/**
 * Steht das Thema im Archiv — für alle?
 *
 * Eine gehaltene Einheit genügt und gilt fürs ganze Thema. Was danach dazukommt,
 * ist damit ebenfalls zu sehen: die Frage stellt sich auf Themen-Ebene, nicht je
 * Einheit (Spec 5.4). Ein brandneues Thema, dessen einziger Abend noch bevorsteht,
 * erscheint dagegen nirgends — außer unter „eigene Themen".
 */
export function isPubliclyVisible(
  sessions: readonly { meeting: SessionMeeting | null }[],
): boolean {
  return sessions.some((session) => isHeld(session.meeting));
}

/** Gehört mir das Thema — als Owner oder als Mitarbeiter:in? */
export function belongsTo(topic: TopicMembership, personId: string): boolean {
  return (
    topic.ownerPersonId === personId || topic.collaboratorIds.includes(personId)
  );
}

/**
 * Ein Thema, an dem niemand hängt.
 *
 * Gibt es zweierlei: Themen aus der Zeit vor diesem Modell, und solche, deren
 * Owner den Hauskreis verlassen hat. Beide fallen in den dritten Zweig der
 * Hausregel — ist niemand zuständig, darf jede:r. Sonst wäre ein verwaistes
 * Thema für immer eingefroren.
 */
function isOrphaned(topic: TopicMembership): boolean {
  return topic.ownerPersonId === null && topic.collaboratorIds.length === 0;
}

/**
 * Bearbeiten darf, wer zum Thema gehört — und zwar **jede** Einheit davon, auch
 * die, bei der man selbst nicht dabei war (Spec 8.1). Ein Thema ist eine
 * gemeinsame Arbeit; ein Recht je Abend wäre Buchhaltung.
 */
export function mayEditTopic(options: {
  isAdmin: boolean;
  personId: string;
  topic: TopicMembership;
}): boolean {
  if (options.isAdmin) return true;
  if (isOrphaned(options.topic)) return true;
  return belongsTo(options.topic, options.personId);
}

/**
 * Löschen ist enger als bearbeiten: nur der Owner (Spec 8.2). Ein Collaborator
 * darf jeden Text ändern, aber nicht die Arbeit aller wegräumen.
 */
export function mayDeleteTopic(options: {
  isAdmin: boolean;
  personId: string;
  topic: TopicMembership;
}): boolean {
  if (options.isAdmin) return true;
  if (isOrphaned(options.topic)) return true;
  return options.topic.ownerPersonId === options.personId;
}

/**
 * Darf diese Person Titel, Actionstep und Zusammenfassung dieser Einheit *sehen*?
 *
 * Die alte Abendregel, nur genauer: bis 18 Uhr am Termintag gehört der Inhalt
 * denen, die ihn vorbereiten. Danach — und für jeden vergangenen Abend — allen.
 * Einen Actionstep eine Woche zu früh zu verteilen wäre das Gegenteil von dem,
 * wozu er da ist.
 *
 * Das Backend liefert die Felder dann gar nicht erst aus. Es im Frontend
 * auszublenden hieße, sie trotzdem übers Netz zu schicken.
 */
export function isContentVisible(options: {
  isAdmin: boolean;
  personId: string;
  topic: TopicMembership;
  meeting: SessionMeeting | null;
  /** Wer an dem Abend der Rolle „Thema" zugeteilt ist. */
  assigned: readonly string[];
  now?: Date;
}): boolean {
  if (options.isAdmin) return true;
  if (belongsTo(options.topic, options.personId)) return true;
  if (options.assigned.includes(options.personId)) return true;

  // Ohne Termin gibt es keinen Abend, an dem sie freigegeben würde: eine
  // unfertige Einheit ist die Vorbereitung einer Einzelnen.
  if (!options.meeting) return false;
  if (options.meeting.status === MeetingStatus.CANCELLED) return false;

  // Ein „liegt der Tag zurück" braucht es daneben nicht: bei einem vergangenen
  // Abend ist auch dessen 18 Uhr vorbei. Eine Prüfung weniger heißt auch eine
  // Stelle weniger, die an der Systemuhr statt an `now` hängt.
  return eveningReached(options.meeting.date, options.now);
}
