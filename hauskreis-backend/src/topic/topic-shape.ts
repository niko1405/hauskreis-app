/**
 * Wie ein Thema aus der Datenbank kommt und wie es den Server verlässt.
 *
 * An einem Ort, weil drei Dienste dieselbe Form brauchen: `TopicService` (Archiv
 * und Detailseite), `TopicSessionService` (nach dem Wählen und Schreiben) und
 * `MeetingService` (die Einheit am Abend). Dreimal dieselbe `select`-Kaskade zu
 * tippen hieße, jede neue Spalte dreimal nachzutragen — und beim zweiten Mal zu
 * vergessen.
 *
 * Die Umformung ist hier nicht kosmetisch: sie **hält Inhalt zurück**. Was
 * `isContentVisible` ablehnt, wird zu `null`, bevor es das Schema erreicht.
 */
import { personRefSelect } from '../common/dto/response';
import { Prisma } from '../../generated/prisma/client';
import { MeetingStatus } from '../../generated/prisma/enums';
import type { HauskreisMembership } from '../auth/auth.types';
import {
  belongsTo,
  isContentVisible,
  isHeld,
  isPubliclyVisible,
  mayDeleteSession,
  mayDeleteTopic,
  mayEditSession,
  mayEditTopic,
  type TopicMembership,
} from './topic-visibility';

/** Wer gerade fragt. Alles, was die Sichtbarkeit braucht. */
export interface Viewer {
  personId: string;
  isAdmin: boolean;
  /**
   * Die Zeitzone der Gruppe.
   *
   * Gehört hierher, weil ein Blick auf ein Thema zwei Fragen stellt: *wer*
   * schaut, und *von welcher Uhr aus*. „Hat der Abend angefangen" hängt an
   * beidem — und ein Vorgabewert wäre hier eine stille Falle, deshalb ein
   * Pflichtfeld.
   */
  zone: string;
  /** Nur für Tests — sonst die Uhr. */
  now?: Date;
}

export function viewerOf(
  membership: HauskreisMembership,
  zone: string,
): Viewer {
  return {
    personId: membership.id,
    isAdmin: membership.role === 'ADMIN',
    zone,
  };
}

/**
 * Der Abend einer Einheit, samt Zuteilung — die braucht die Sichtbarkeit.
 *
 * Überall `satisfies` statt `as const`: Prisma verlangt veränderbare Arrays für
 * `orderBy`, `as const` macht sie schreibgeschützt. `satisfies` prüft trotzdem
 * gegen die erzeugten Typen und behält die engen Literale — ein Tippfehler in
 * einem Feldnamen fällt hier auf und nicht erst zur Laufzeit.
 */
const sessionMeetingSelect = {
  id: true,
  date: true,
  // Nicht fürs Anzeigen, sondern für die Sichtbarkeitsgrenze: der Inhalt einer
  // Einheit wird frei, wenn der Abend anfängt — und der fängt an, wann die
  // Gruppe sich trifft, nicht um 18 Uhr.
  startMinutes: true,
  status: true,
  title: true,
  topicResponsibles: { select: { personId: true } },
  // Wer den Actionstep dieses Abends schon abgehakt hat. Der Haken sitzt am
  // Termin, der Text an der Einheit — und wer den Text auf der Themenseite
  // liest, will ihn dort auch abhaken können, statt erst den Abend zu suchen.
  actionstepDone: {
    select: { person: { select: personRefSelect } },
    orderBy: { person: { name: 'asc' } },
  },
} satisfies Prisma.MeetingSelect;

/**
 * Eine Einheit ohne ihr Thema.
 *
 * Nach Name sortierte Verantwortliche: dieselbe Liste soll zweimal gleich
 * aussehen, und ohne `orderBy` entscheidet das die Datenbank.
 */
export const sessionSelect = {
  id: true,
  topicId: true,
  meetingId: true,
  title: true,
  actionstepText: true,
  summaryText: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  meeting: { select: sessionMeetingSelect },
  // `personId` neben der Person: Daran hängt seit der Trennung von Vorbereitung
  // und Abend-Rolle das Bearbeitungsrecht dieser einen Einheit
  // (`mayEditSession`) — die Anzeige braucht nur den Namen, die Rechtefrage nur
  // die Id.
  responsibles: {
    select: { personId: true, person: { select: personRefSelect } },
    orderBy: { person: { name: 'asc' } },
  },
} satisfies Prisma.TopicSessionSelect;

/** Woran das Bearbeitungsrecht eines Themas hängt. */
export const topicMembershipSelect = {
  id: true,
  title: true,
  status: true,
  // Nicht fürs Recht, sondern für die Frage davor: An einer Hülle darf keine
  // zweite Einheit entstehen, und wer das prüft, hat ohnehin schon dieses
  // `select` in der Hand.
  standalone: true,
  ownerPersonId: true,
  collaborators: { select: { personId: true } },
} satisfies Prisma.TopicSelect;

/**
 * Die Geschwister einer Einheit — nur Id und Datum.
 *
 * Genug, um „Session 2 von 2" auszurechnen, und zu wenig, um irgendetwas zu
 * verraten. Der Inhalt der anderen Abende kommt über `GET …/topics/:id`, wo die
 * Sichtbarkeitsregeln schon stehen.
 */
const siblingSessionSelect = {
  id: true,
  meeting: { select: { date: true } },
} satisfies Prisma.TopicSessionSelect;

/** Eine Einheit als eigenständige Antwort — mit dem Thema darüber. */
export const sessionSelectWithTopic = {
  ...sessionSelect,
  topic: {
    select: {
      ...topicMembershipSelect,
      sessions: {
        select: siblingSessionSelect,
        orderBy: { meeting: { date: 'asc' } },
      },
    },
  },
} satisfies Prisma.TopicSessionSelect;

/**
 * Ein ganzes Thema.
 *
 * Einheiten chronologisch nach ihrem Abend; die unfertigen haben keinen und
 * hängen sich mit `nulls last` hinten an, nach Entstehung sortiert.
 */
export const topicInclude = {
  owner: { select: personRefSelect },
  collaborators: {
    select: { personId: true, person: { select: personRefSelect } },
    orderBy: { person: { name: 'asc' } },
  },
  sessions: {
    select: sessionSelect,
    orderBy: [{ meeting: { date: 'asc' } }, { createdAt: 'asc' }],
  },
} satisfies Prisma.TopicInclude;

type SessionRow = {
  id: string;
  topicId: string;
  meetingId: string | null;
  title: string | null;
  actionstepText: string | null;
  summaryText: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  meeting: {
    id: string;
    date: Date;
    startMinutes: number;
    status: MeetingStatus;
    title: string | null;
    topicResponsibles: { personId: string }[];
    actionstepDone: { person: unknown }[];
  } | null;
  responsibles: { personId: string; person: unknown }[];
};

/**
 * Ein Thema, so weit es für Rechte und Sichtbarkeit gebraucht wird.
 *
 * Die Mitarbeitenden stehen hier nur als Ids: die Frage ist „darf diese Person",
 * und dafür braucht es keinen Namen und kein Bild.
 */
type TopicRow = {
  id: string;
  title: string | null;
  status: string;
  standalone: boolean;
  ownerPersonId: string | null;
  collaborators: readonly { personId: string }[];
};

/**
 * Dasselbe Thema, plus alles, was in die Antwort geht.
 *
 * `collaborators` wird ersetzt statt ergänzt: hier hängt an jeder Zeile auch die
 * Person, weil sie angezeigt wird. Eine Schnittmenge aus beiden Formen ergäbe
 * ein Feld, aus dem sich weder das eine noch das andere lesen lässt.
 */
type FullTopicRow = Omit<TopicRow, 'collaborators'> & {
  collaborators: readonly { personId: string; person: unknown }[];
  hauskreisId: string;
  summaryText: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  owner: unknown;
  sessions: SessionRow[];
};

/**
 * Woran das Bearbeitungsrecht eines Themas hängt — und bei einer Hülle hängt es
 * mit an der Crew.
 *
 * Eine Hülle *ist* ihre eine Einheit. Die Unterscheidung, für die
 * `topic_collaborator` gebaut wurde — „hilft einmal bei einem Abend aus" gegen
 * „arbeitet am ganzen Thema" —, hat dort keinen Gegenstand: Es gibt kein
 * Darüber, von dem jemand ausgeschlossen sein könnte. Wer die Einheit
 * mitvorbereitet, ist damit gleichberechtigt.
 *
 * Abgeleitet und **nicht** gespeichert: So bedeutet eine Zeile in
 * `topic_collaborator` weiterhin genau eine Sache („der Owner hat dich
 * ausdrücklich dazugeholt"), und es gibt keine zweite Stelle, an der dieselbe
 * Aussage steht und auseinanderlaufen kann.
 *
 * `crew` ist die Besetzung der Einheit, um die es gerade geht; die Aufrufer
 * haben sie ohnehin geladen. Die Vorgabe `[]` ist bewusst: Wer ohne sie fragt,
 * fragt nach dem Thema allein — bei einer Hülle also nach dem Owner.
 */
export function membershipOf(
  topic: TopicRow,
  crew: readonly string[] = [],
): TopicMembership {
  const collaboratorIds = topic.collaborators.map((row) => row.personId);

  return {
    ownerPersonId: topic.ownerPersonId,
    collaboratorIds: topic.standalone
      ? [...new Set([...collaboratorIds, ...crew])]
      : collaboratorIds,
  };
}

/**
 * Eine Einheit in Antwortform.
 *
 * `topic` bekommt denselben Vorbehalt wie die drei Textfelder: der Titel eines
 * frisch angelegten Themas verriete sonst vor dem Abend, worum es geht — genau
 * das, was zurückgehalten werden soll. Id und Status bleiben; daran hängt die
 * Navigation, und beides sagt nichts über den Inhalt.
 */
export function shapeSession(
  session: SessionRow,
  topic: TopicRow,
  viewer: Viewer,
  /**
   * Wie viele Einheiten das Thema **insgesamt** hat, Entwürfe eingeschlossen.
   *
   * Nur für `mayUnname` gebraucht und deshalb optional: Die Listen unter einem
   * Thema kennen die Zahl ohnehin, `shapeSessionForMeeting` und die Themenseite
   * reichen sie durch. Wo sie fehlt, steht `mayUnname` auf `false` — lieber ein
   * Knopf zu wenig als einer, der in einen 400er führt.
   */
  sessionTotal?: number,
) {
  const responsibleIds = session.responsibles.map((row) => row.personId);
  const membership = membershipOf(topic, responsibleIds);
  const held = isHeld(session.meeting, viewer.zone);

  const visible = isContentVisible({
    isAdmin: viewer.isAdmin,
    personId: viewer.personId,
    topic: membership,
    meeting: session.meeting,
    assigned: (session.meeting?.topicResponsibles ?? []).map(
      (row) => row.personId,
    ),
    responsibleIds,
    zone: viewer.zone,
    now: viewer.now,
  });

  return {
    id: session.id,
    topicId: session.topicId,
    topic: {
      id: topic.id,
      title: visible ? topic.title : null,
      status: topic.status,
      // Ohne Vorbehalt, und das ist Absicht: *dass* es kein Thema darüber gibt,
      // verrät nichts darüber, worum es geht. Die Anzeige braucht es dagegen
      // vor dem Abend — sonst stünde dort „Zugehöriges Thema" über einer
      // Einheit, die keins hat. Für den Owner gilt dasselbe: Wer etwas
      // angefangen hat, ist keine Auskunft über den Inhalt.
      standalone: topic.standalone,
      ownerPersonId: topic.ownerPersonId,
    },
    meetingId: session.meetingId,
    meeting: session.meeting
      ? {
          id: session.meeting.id,
          date: session.meeting.date,
          // Die Zahl wurde schon immer gelesen (sie trägt die
          // Sichtbarkeitsgrenze), ging aber nie hinaus. Die Themenseite braucht
          // sie: dort hängt das Abhaken des Actionsteps an derselben Uhrzeit wie
          // auf der Terminseite, und ohne sie wäre es dort ein Tag später.
          startTime: session.meeting.startMinutes,
          status: session.meeting.status,
          title: session.meeting.title,
        }
      : null,
    title: visible ? session.title : null,
    actionstepText: visible ? session.actionstepText : null,
    summaryText: visible ? session.summaryText : null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    version: session.version,
    // Ohne `personId`: Die Antwort zeigt Menschen, nicht Schlüssel. Gebraucht
    // wurde die Id nur ein paar Zeilen weiter oben, für `mayEdit`.
    responsibles: session.responsibles.map((row) => ({ person: row.person })),
    // Ohne Vorbehalt: wer abgehakt hat, ist keine Aussage über den Inhalt, und
    // vor dem Abend ist die Liste ohnehin leer. An einer Einheit ohne Abend
    // gibt es nichts abzuhaken — daher ein leeres Feld, nicht `null`: die Zahl
    // „0 von 9" stimmt dort genauso.
    actionstepDone: session.meeting?.actionstepDone ?? [],
    held,
    contentVisible: visible,
    /**
     * Diese **eine** Einheit ändern: ihre Texte und die Liste derer, die sie
     * vorbereiten.
     */
    mayEdit: mayEditSession({
      isAdmin: viewer.isAdmin,
      personId: viewer.personId,
      topic: membership,
      responsibleIds,
    }),
    /**
     * Das **Thema** darüber: eine weitere Einheit anlegen, diese hier löschen,
     * ein Überthema vergeben.
     *
     * Steht neben `mayEdit`, seit die beiden auseinanderlaufen können: Wer nur
     * an dieser Einheit mitarbeitet, schreibt sie — räumt sie aber nicht aus
     * einem Thema heraus, das ihm nicht gehört.
     */
    mayEditTopic: mayEditTopic({
      isAdmin: viewer.isAdmin,
      personId: viewer.personId,
      topic: membership,
    }),
    /**
     * Diese Einheit löschen — enger als `mayEditTopic`, sobald ihr Abend war.
     *
     * Gerechnet und nicht aus `mayEditTopic && !held` zusammengesetzt: Für eine
     * **Hülle** ist die Antwort dann gerade nicht „nein", weil die Einheit dort
     * das ganze Thema ist. Die Regel steht einmal, in `mayDeleteSession`.
     */
    mayDelete: mayDeleteSession({
      isAdmin: viewer.isAdmin,
      personId: viewer.personId,
      topic: membership,
      standalone: topic.standalone,
      held,
    }),
    /**
     * Ob sich das Überthema wieder entfernen lässt — der Zwilling zu
     * `nameTopic`.
     *
     * Die ganze Bedingung an einer Stelle, statt sie vorn aus Einzelteilen
     * zusammenzusetzen: `sessionCount` unten zählt nur Einheiten **mit** Abend,
     * ein Entwurf daneben führte den Knopf also in eine Fehlermeldung.
     */
    mayUnname:
      !topic.standalone &&
      sessionTotal === 1 &&
      mayDeleteTopic({
        isAdmin: viewer.isAdmin,
        personId: viewer.personId,
        topic: membership,
      }),
  };
}

/**
 * Ein Thema in Antwortform.
 *
 * Unfertige Einheiten fallen für Fremde heraus, statt leer zu erscheinen: eine
 * Vorbereitung ohne Abend gehört der Person, die sie angefangen hat, und für
 * alle anderen gibt es sie nicht (Spec §7).
 */
export function shapeTopic(topic: FullTopicRow, viewer: Viewer) {
  const membership = membershipOf(
    topic,
    // Bei einer Hülle ist die Crew ihrer Einheit die Mitwirkenden-Ebene. Über
    // *alle* Einheiten, obwohl eine Hülle nur eine hat: Die Regel soll nicht
    // davon abhängen, dass das stimmt.
    topic.sessions.flatMap((session) =>
      session.responsibles.map((row) => row.personId),
    ),
  );

  /**
   * „Meins" — und das geht seit der Trennung von Vorbereitung und Abend-Rolle
   * einen Schritt weiter als die Mitgliedschaft am Thema: Wer eine seiner
   * Einheiten vorbereitet, arbeitet daran, auch wenn ihn niemand als
   * Mitarbeitenden eingetragen hat. Ohne diese Zeile stünde ein Thema, an dem
   * man einen Abend hält, nicht unter „Eigene".
   */
  const mine =
    belongsTo(membership, viewer.personId) ||
    topic.sessions.some((session) =>
      session.responsibles.some((row) => row.personId === viewer.personId),
    );

  /**
   * Entwürfe je Einheit statt themaweit.
   *
   * Ein Entwurf ohne Abend gehört denen, die ihn angefangen haben (Spec §7).
   * Wer nur *eine* Einheit des Themas vorbereitet, soll seine sehen — und nicht
   * die Entwürfe der anderen. `mine` allein wäre hier zu grob in beide
   * Richtungen.
   */
  const sichtbareEinheiten = topic.sessions.filter(
    (session) =>
      session.meetingId !== null ||
      viewer.isAdmin ||
      belongsTo(membership, viewer.personId) ||
      session.responsibles.some((row) => row.personId === viewer.personId),
  );

  return {
    id: topic.id,
    hauskreisId: topic.hauskreisId,
    title: topic.title,
    summaryText: topic.summaryText,
    status: topic.status,
    standalone: topic.standalone,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    version: topic.version,
    owner: topic.owner,
    collaborators: topic.collaborators.map((row) => ({ person: row.person })),
    sessions: sichtbareEinheiten.map((session) =>
      // Das Thema steht schon darüber — in der Einheit wäre es doppelt.
      omitTopic(shapeSession(session, topic, viewer, topic.sessions.length)),
    ),
    publiclyVisible: isPubliclyVisible(topic.sessions, viewer.zone),
    mine,
    mayEdit: mayEditTopic({
      isAdmin: viewer.isAdmin,
      personId: viewer.personId,
      topic: membership,
    }),
    mayDelete: mayDeleteTopic({
      isAdmin: viewer.isAdmin,
      personId: viewer.personId,
      topic: membership,
    }),
  };
}

function omitTopic<T extends { topic: unknown }>(session: T): Omit<T, 'topic'> {
  const { topic: _weg, ...rest } = session;
  return rest;
}

/** Ein Geschwister — genug, um die Position zu bestimmen. */
type SiblingRow = { id: string; meeting: { date: Date } | null };

/**
 * „Session 2 von 2".
 *
 * Gezählt werden nur Einheiten **mit** Abend, chronologisch. Entwürfe bleiben
 * draußen: sie haben kein Datum, an dem sie sich einsortieren ließen, und die
 * Zahl spränge, sobald jemand nebenher einen anfängt.
 *
 * Die eigene Einheit hängt an einem Abend — sie steht also immer mit drin, und
 * `1 von 1` ist die untere Grenze.
 */
export function sessionPosition(sessionId: string, siblings: SiblingRow[]) {
  const mitAbend = siblings
    .filter((sibling) => sibling.meeting !== null)
    .toSorted(
      (a, b) =>
        (a.meeting?.date.getTime() ?? 0) - (b.meeting?.date.getTime() ?? 0),
    );

  const index = mitAbend.findIndex((sibling) => sibling.id === sessionId);

  return {
    sessionIndex: index === -1 ? mitAbend.length + 1 : index + 1,
    sessionCount: index === -1 ? mitAbend.length + 1 : mitAbend.length,
  };
}

/**
 * Dieselbe Einheit, wie sie unter ihrem Termin steht — ohne den Termin, dafür
 * mit ihrer Stelle im Thema.
 */
export function shapeSessionForMeeting(
  session: SessionRow,
  topic: TopicRow & { sessions: SiblingRow[] },
  viewer: Viewer,
) {
  // `actionstepDone` fällt hier weg wie der Termin selbst: der Abend steht
  // darüber und trägt dieselbe Liste schon. Zweimal ausgeliefert wäre sie zwei
  // Stände, die auseinanderlaufen können.
  const {
    meeting: _weg,
    actionstepDone: _auchWeg,
    ...rest
  } = shapeSession(session, topic, viewer, topic.sessions.length);

  return { ...rest, ...sessionPosition(session.id, topic.sessions) };
}

/**
 * Das `where`-Fragment für „welche Themen darf diese Liste zeigen".
 *
 * `public` fragt nach einer gehaltenen Einheit — verknüpft, vorbei, nicht
 * abgesagt. Dieselbe Bedingung wie `isHeld`, nur in SQL: sie hier auszurechnen
 * hieße, jedes Thema des Hauskreises zu laden, um die Hälfte wegzuwerfen.
 */
export function topicScopeWhere(
  scope: 'public' | 'mine',
  personId: string,
  /** Der heutige Tag der Gruppe — nur für `public` gebraucht. */
  today: Date,
) {
  if (scope === 'mine') {
    return {
      OR: [
        { ownerPersonId: personId },
        { collaborators: { some: { personId } } },
        // Der dritte Weg hinein: eine Einheit vorbereiten. Sie gibt kein Recht
        // am Thema, macht es aber sehr wohl zu einem, an dem man arbeitet.
        { sessions: { some: { responsibles: { some: { personId } } } } },
      ],
    };
  }

  return {
    sessions: {
      some: {
        meeting: {
          date: { lt: today },
          status: { not: MeetingStatus.CANCELLED },
        },
      },
    },
  };
}
