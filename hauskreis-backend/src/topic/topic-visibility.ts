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
 * Rechte kommen dazu, und sie kennen **zwei Weiten**:
 *
 * - `mayEditTopic` — das ganze Thema, jede seiner Einheiten, neue anlegen. Das
 *   haben der Owner und die ausdrücklich eingetragenen Mitarbeitenden.
 * - `mayEditSession` — **eine** Einheit, nämlich die, die man vorbereitet.
 *
 * Die **Zuteilung eines Abends** (`MeetingTopicResponsible`) gibt keines von
 * beidem. Sie sagt, wer an dem Abend dafür einsteht, und entscheidet allein, wer
 * dort *wählen* darf (`TopicSessionService.choose`). Dass sie einmal auch das
 * Schreibrecht mitbrachte, war der Fehler, den diese Trennung auflöst: Eine
 * Rollenänderung musste dann an fremder Vorbereitung herumoperieren.
 */
import { MeetingStatus } from '../../generated/prisma/enums';
import { eveningReached } from '../common/time/local-evening';
import { isPast } from '../meeting/meeting-schedule';

/** Was von einem Termin zählt für „hat er stattgefunden". */
export interface SessionMeeting {
  date: Date;
  status: MeetingStatus;
}

/**
 * Dazu die Anfangszeit.
 *
 * Ein eigener Typ und nicht ein optionales Feld am oberen: nur die
 * Sichtbarkeitsgrenze braucht die Uhrzeit, und wäre sie überall optional, fiele
 * eine Ladestelle, die sie vergisst, still auf 18 Uhr zurück statt aufzufallen.
 */
export interface TimedSessionMeeting extends SessionMeeting {
  /** Minuten seit Mitternacht Ortszeit — ab wann der Inhalt allen gehört. */
  startMinutes: number;
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
export function isHeld(
  meeting: SessionMeeting | null | undefined,
  zone: string,
): boolean {
  if (!meeting) return false;
  if (meeting.status === MeetingStatus.CANCELLED) return false;
  return isPast(meeting.date, zone);
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
  zone: string,
): boolean {
  return sessions.some((session) => isHeld(session.meeting, zone));
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
 * Die zweite Ebene: **diese eine Einheit**.
 *
 * Wer einen Abend vorbereitet, muss ihn schreiben können — aber deshalb noch
 * lange nicht das ganze Thema. Das war bis eben dasselbe: Wer eine Einheit
 * hielt, wurde automatisch Mitarbeiter:in am Thema und durfte überall hinein.
 * Für jemanden, der einmalig aushilft, ist das eine Zuschreibung, die niemand
 * getroffen hat.
 *
 * Die Funktion ist trotzdem nicht neu, sie hatte nur keinen Namen:
 * `resumeSession`, `promote` und `nameTopic` schrieben genau diesen Ausdruck
 * schon je einmal aus („der eigene Entwurf bleibt der eigene, auch wenn der
 * Owner einen als Mitarbeitenden entfernt hat"). Aus der Rettung für den
 * Grenzfall ist die Regel geworden.
 *
 * Die **Abend-Rolle steht hier ausdrücklich nicht**: Wer an einem Abend fürs
 * Thema zugeteilt ist, steht dort vorne. Lesen darf er deshalb
 * (`isContentVisible`), schreiben nicht — sonst käme das Recht über eine
 * Anwesenheit herein, und genau diese Vermischung soll weg.
 */
export function mayEditSession(options: {
  isAdmin: boolean;
  personId: string;
  topic: TopicMembership;
  /** Wer diese Einheit vorbereitet — `TopicSessionResponsible`. */
  responsibleIds: readonly string[];
}): boolean {
  if (mayEditTopic(options)) return true;
  return preparesSession(options);
}

/**
 * Dasselbe ohne die beiden Freifahrtscheine: gehört diese Person **zu dieser
 * Vorbereitung**?
 *
 * Der Unterschied zu `mayEditSession` sind Admin-Rolle und verwaistes Thema.
 * Beide sagen „darf notfalls hinein", keines sagt „arbeitet daran mit" — und für
 * `TopicLinkService.reconcile` ist genau das die Frage. Zählte der Admin mit,
 * hielte allein seine Zuteilung jede Einheit an jedem Abend fest, und die Regel
 * liefe in einer Gruppe mit einem Admin praktisch nie.
 */
export function preparesSession(options: {
  personId: string;
  topic: TopicMembership;
  responsibleIds: readonly string[];
}): boolean {
  if (belongsTo(options.topic, options.personId)) return true;
  return options.responsibleIds.includes(options.personId);
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
 * Die alte Abendregel, nur genauer: bis der Abend anfängt, gehört der Inhalt
 * denen, die ihn vorbereiten. Danach — und für jeden vergangenen Abend — allen.
 * Einen Actionstep eine Woche zu früh zu verteilen wäre das Gegenteil von dem,
 * wozu er da ist.
 *
 * „Wenn der Abend anfängt" heißt die Uhrzeit **dieses** Termins und nicht mehr
 * pauschal 18 Uhr: eine Gruppe, die sich um 20 Uhr trifft, gab ihren Actionstep
 * sonst zwei Stunden vorher frei.
 *
 * Das Backend liefert die Felder dann gar nicht erst aus. Es im Frontend
 * auszublenden hieße, sie trotzdem übers Netz zu schicken.
 */
export function isContentVisible(options: {
  isAdmin: boolean;
  personId: string;
  topic: TopicMembership;
  meeting: TimedSessionMeeting | null;
  /** Wer an dem Abend der Rolle „Thema" zugeteilt ist. */
  assigned: readonly string[];
  /**
   * Wer **diese Einheit** vorbereitet.
   *
   * Seit die Vorbereitung nicht mehr am Thema hängt, ist das der Normalfall und
   * nicht der Randfall: Wer eine fremde Einheit mit vorbereitet, gehört zum
   * Thema nicht und ist vielleicht auch am Abend nicht zugeteilt. Ohne diese
   * Zeile bekäme er seinen eigenen Text als `null` zurück.
   */
  responsibleIds?: readonly string[];
  /** Die Zeitzone der Gruppe — „hat der Abend angefangen" braucht sie. */
  zone: string;
  now?: Date;
}): boolean {
  if (options.isAdmin) return true;
  if (belongsTo(options.topic, options.personId)) return true;
  if (options.responsibleIds?.includes(options.personId)) return true;
  if (options.assigned.includes(options.personId)) return true;

  // Ohne Termin gibt es keinen Abend, an dem sie freigegeben würde: eine
  // unfertige Einheit ist die Vorbereitung einer Einzelnen.
  if (!options.meeting) return false;
  if (options.meeting.status === MeetingStatus.CANCELLED) return false;

  // Ein „liegt der Tag zurück" braucht es daneben nicht: bei einem vergangenen
  // Abend ist auch dessen Anfangszeit vorbei. Eine Prüfung weniger heißt auch
  // eine Stelle weniger, die an der Systemuhr statt an `now` hängt.
  return eveningReached(
    options.meeting.date,
    options.zone,
    options.now,
    options.meeting.startMinutes,
  );
}
