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
  mayDeleteTopic,
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
  responsibles: {
    select: { person: { select: personRefSelect } },
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
  responsibles: { person: unknown }[];
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

export function membershipOf(topic: TopicRow): TopicMembership {
  return {
    ownerPersonId: topic.ownerPersonId,
    collaboratorIds: topic.collaborators.map((row) => row.personId),
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
) {
  const visible = isContentVisible({
    isAdmin: viewer.isAdmin,
    personId: viewer.personId,
    topic: membershipOf(topic),
    meeting: session.meeting,
    assigned: (session.meeting?.topicResponsibles ?? []).map(
      (row) => row.personId,
    ),
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
      // Einheit, die keins hat.
      standalone: topic.standalone,
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
    responsibles: session.responsibles,
    // Ohne Vorbehalt: wer abgehakt hat, ist keine Aussage über den Inhalt, und
    // vor dem Abend ist die Liste ohnehin leer. An einer Einheit ohne Abend
    // gibt es nichts abzuhaken — daher ein leeres Feld, nicht `null`: die Zahl
    // „0 von 9" stimmt dort genauso.
    actionstepDone: session.meeting?.actionstepDone ?? [],
    held: isHeld(session.meeting, viewer.zone),
    contentVisible: visible,
    mayEdit: mayEditTopic({
      isAdmin: viewer.isAdmin,
      personId: viewer.personId,
      topic: membershipOf(topic),
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
  const membership = membershipOf(topic);
  const mine = belongsTo(membership, viewer.personId);
  const sichtbareEinheiten = topic.sessions.filter(
    (session) => session.meetingId !== null || mine || viewer.isAdmin,
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
      omitTopic(shapeSession(session, topic, viewer)),
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
  } = shapeSession(session, topic, viewer);

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
