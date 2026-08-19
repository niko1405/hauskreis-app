import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { TopicStatus } from '../../../generated/prisma/enums';
import { paginationSchema } from '../../common/http/pagination';
import { isoDay } from '../../common/dto/iso-day';

const topicStatus = z.enum(TopicStatus);

/**
 * Ein Thema anlegen, ohne dass ein Abend dafür feststeht.
 *
 * Der Titel ist hier **Pflicht** — anders als beim Wählen an einem Abend
 * (`POST …/meetings/:id/topic-session`), wo das Thema unter seinem Termin steht
 * und auch namenlos auffindbar ist. Ein Thema, das an nichts hängt, hat nichts
 * als seinen Titel.
 */
export const createTopicSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summaryText: z.string().trim().min(1).max(5000).nullish(),
});

/**
 * Der Titel ist optional — CLAUDE.md §5: nicht jeder trägt vorab einen ein.
 *
 * Beim **Anlegen** ist er dagegen Pflicht, siehe `createTopicSchema`: ein Thema
 * darf seinen Titel später verlieren, aber nicht ohne ihn entstehen.
 */
export const updateTopicSchema = z.object({
  title: z.string().trim().min(1).max(200).nullish(),
  /// Der Bogen über alle Einheiten. Die Nachbereitung des einzelnen Abends steht
  /// an der Einheit.
  summaryText: z.string().trim().min(1).max(5000).nullish(),
  status: topicStatus.optional(),
});

/**
 * Was im Archiv gelistet wird.
 *
 * `public` ist die Vorgabe und heißt: Themen, von denen mindestens eine Einheit
 * gehalten wurde. `mine` nimmt zusätzlich die eigenen dazu, auch die noch nicht
 * gehaltenen — der Filter „nur eigene Themen" aus Spec 5.3.
 */
export const listTopicsQuerySchema = paginationSchema.extend({
  scope: z.enum(['public', 'mine']).default('public'),
  status: topicStatus.optional(),
  /// Trifft auf Titel und Zusammenfassung. Themen ohne beides sind schlicht nie
  /// ein Treffer — das ist ehrlich, es gibt ja nichts zu vergleichen.
  search: z.string().trim().min(1).max(200).optional(),
  /// Einschließende Grenzen darauf, wann das Thema angefangen wurde.
  from: isoDay.optional(),
  to: isoDay.optional(),
});

/** Titel, Actionstep und Zusammenfassung eines einzelnen Abends. */
export const updateTopicSessionSchema = z.object({
  title: z.string().trim().min(1).max(200).nullish(),
  actionstepText: z.string().trim().min(1).max(2000).nullish(),
  summaryText: z.string().trim().min(1).max(5000).nullish(),
});

/**
 * Eine Einheit anlegen, ohne dass ein Abend dafür feststeht.
 *
 * Der Titel ist hier **Pflicht**, anders als beim Wählen an einem Abend. Dort
 * steht die Einheit unter ihrem Termin und ist auch ohne Titel auffindbar. Ein
 * Entwurf ohne Abend hat nichts als seinen Titel — ohne ihn stünde in
 * „Angefangenes" eine Zeile, die niemand wiedererkennt.
 */
export const createTopicSessionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  actionstepText: z.string().trim().min(1).max(2000).nullish(),
  summaryText: z.string().trim().min(1).max(5000).nullish(),
});

/**
 * Die drei Wege, mit denen eine zugeteilte Person ihre Wahl trifft (Spec §3).
 *
 * - `new` — ein neues Thema. Wer das wählt, wird sein Owner.
 * - `existing` — ein eigenes Thema um einen weiteren Abend erweitern. Titel,
 *   Actionstep und Zusammenfassung dürfen gleich mitkommen.
 * - `resume` — eine offene Einheit aufnehmen; ihr Inhalt bleibt. „Offen" heißt
 *   auch: sie hängt gerade an einem *anderen kommenden* Abend und zieht dann um.
 *
 * Hängt an diesem Abend schon eine Einheit, ist das kein Fehler, sondern ein
 * Wechsel — die bisherige löst sich und wartet als Entwurf.
 *
 * Ein flaches Objekt mit `superRefine` und **keine** `discriminatedUnion`,
 * obwohl die fachlich genauer wäre: `createZodDto` braucht einen Objekttyp mit
 * bekannten Feldern, und eine Union ist keiner. Die Genauigkeit ist damit nicht
 * verloren, sie steht nur in der Prüfung statt im Typ — ein `existing` ohne
 * `topicId` scheitert weiterhin mit 400 an dem Feld, das fehlt.
 */
export const chooseTopicSessionSchema = z
  .object({
    /// `new` — neues Thema samt erstem Abend. `existing` — ein eigenes Thema
    /// fortsetzen. `resume` — eine offene Einheit hierher holen. `single` —
    /// eine einzelne Einheit ohne Thema. `promote` — aus einer einzelnen
    /// Einheit ein Thema machen und diesen Abend als zweite anhängen.
    mode: z.enum(['new', 'existing', 'resume', 'single', 'promote']),
    /// Bei `new` der Titel des Themas, sonst der des Abends. Immer optional —
    /// den Titel trägt ein, wer sich vorbereitet, und das ist nicht immer schon
    /// im Moment der Wahl.
    title: z.string().trim().min(1).max(200).nullish(),
    /// Nur bei `promote`, und dort **Pflicht**: der Bogen, den die beiden
    /// Abende von jetzt an spannen. Ohne ihn wäre es kein Thema, sondern zwei
    /// Abende — genau der Zustand, aus dem man gerade herauswill.
    topicTitle: z.string().trim().min(1).max(200).optional(),
    /// Bei `existing`, `single` und `promote`: das Anlege-Sheet fragt beides ab,
    /// und sie hinterher nachzuschieben ließe den Abend kurz mit einer leeren
    /// Einheit dastehen.
    actionstepText: z.string().trim().min(1).max(2000).nullish(),
    summaryText: z.string().trim().min(1).max(5000).nullish(),
    topicId: z.uuid().optional(),
    sessionId: z.uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'existing' && !value.topicId) {
      ctx.addIssue({
        code: 'custom',
        path: ['topicId'],
        message: 'Bei mode=existing wird topicId gebraucht',
      });
    }

    if (
      (value.mode === 'resume' || value.mode === 'promote') &&
      !value.sessionId
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['sessionId'],
        message: `Bei mode=${value.mode} wird sessionId gebraucht`,
      });
    }

    if (value.mode === 'promote' && !value.topicTitle) {
      ctx.addIssue({
        code: 'custom',
        path: ['topicTitle'],
        message: 'Bei mode=promote wird topicTitle gebraucht',
      });
    }
  });

/**
 * Das Überthema für eine bisher alleinstehende Einheit.
 *
 * Ein einziges Feld, und der Titel ist Pflicht: Ein Thema, das keinen hat, ist
 * von einer Hülle nicht zu unterscheiden — und dann hätte der Knopf nichts
 * getan.
 */
export const nameTopicSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

/**
 * Wer an diesem Abend das Thema vorbereitet — ersetzt die Liste.
 *
 * Leer ist gültig und heißt „noch kein Zuständiger"; eine verknüpfte Einheit
 * wird dann entkoppelt, sofern der Abend noch bevorsteht.
 */
export const setTopicResponsiblesSchema = z.object({
  personIds: z.array(z.uuid()).max(9),
});

const topicParamsSchema = z.object({
  hauskreisId: z.uuid(),
  id: z.uuid(),
});

const topicCollaboratorParamsSchema = topicParamsSchema.extend({
  personId: z.uuid(),
});

const topicSessionParamsSchema = z.object({
  hauskreisId: z.uuid(),
  sessionId: z.uuid(),
});

const meetingTopicParamsSchema = z.object({
  hauskreisId: z.uuid(),
  meetingId: z.uuid(),
});

export class CreateTopicDto extends createZodDto(createTopicSchema) {}
export class UpdateTopicDto extends createZodDto(updateTopicSchema) {}
export class ListTopicsQueryDto extends createZodDto(listTopicsQuerySchema) {}
export class UpdateTopicSessionDto extends createZodDto(
  updateTopicSessionSchema,
) {}
export class CreateTopicSessionDto extends createZodDto(
  createTopicSessionSchema,
) {}
export class NameTopicDto extends createZodDto(nameTopicSchema) {}
export class ChooseTopicSessionDto extends createZodDto(
  chooseTopicSessionSchema,
) {}
export class SetTopicResponsiblesDto extends createZodDto(
  setTopicResponsiblesSchema,
) {}
export class TopicParamsDto extends createZodDto(topicParamsSchema) {}
export class TopicCollaboratorParamsDto extends createZodDto(
  topicCollaboratorParamsSchema,
) {}
export class TopicSessionParamsDto extends createZodDto(
  topicSessionParamsSchema,
) {}
export class MeetingTopicParamsDto extends createZodDto(
  meetingTopicParamsSchema,
) {}
