import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MeetingStatus, TopicStatus } from '../../../generated/prisma/enums';
import {
  isoDateOut,
  isoDateTimeOut,
  pageSchema,
  personRefSchema,
} from '../../common/dto/response';

/** Das Thema, auf das Nötigste — als Kopfzeile über einer Einheit. */
export const topicRefSchema = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  status: z.enum(TopicStatus),
});

/**
 * Ein Abend eines Themas.
 *
 * Der Inhalt sitzt hier und nicht am Termin: so überlebt eine Vorbereitung jeden
 * Rollenwechsel. `meetingId = null` heißt **unfertig** — angefangen, aber (noch)
 * an keinem Abend.
 *
 * `title`, `actionstepText` und `summaryText` sind `null`, wenn `contentVisible`
 * falsch ist. Das ist kein Fehler und kein leeres Feld: es steht etwas da, und es
 * gehört bis 18 Uhr am Termintag denen, die es vorbereiten. Ausgeblendet wird
 * hier und nicht im Frontend — sonst ginge es trotzdem über die Leitung.
 */
export const topicSessionResponseSchema = z.object({
  id: z.uuid(),
  topicId: z.uuid(),
  /// Das Thema darüber. Fehlt, wo die Einheit ohnehin unter ihrem Thema steht.
  topic: topicRefSchema,
  meetingId: z.uuid().nullable(),
  /// Der Abend, an dem sie hängt. Bewusst nur die vier Felder, die eine
  /// Zeile in der Einheiten-Liste braucht — der volle Termin steht anderswo.
  meeting: z
    .object({
      id: z.uuid(),
      date: isoDateOut,
      status: z.enum(MeetingStatus),
      title: z.string().nullable(),
    })
    .nullable(),
  title: z.string().nullable(),
  actionstepText: z.string().nullable(),
  summaryText: z.string().nullable(),
  createdAt: isoDateTimeOut,
  updatedAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),
  /// Wer diese Einheit hält oder gehalten hat. Historisch: wer später als
  /// Mitarbeiter:in entfernt wird, bleibt hier stehen — er war ja dabei.
  responsibles: z.array(z.object({ person: personRefSchema })),
  /// Hat der Abend stattgefunden? Rein zeitlich, kein Häkchen: verknüpft, in der
  /// Vergangenheit, nicht abgesagt.
  held: z.boolean(),
  /// Ob die drei Textfelder oben gefüllt sind oder zurückgehalten wurden.
  contentVisible: z.boolean(),
  /// Ob der Betrachter hier schreiben darf. Vom Server mitgeliefert, damit die
  /// App die Regel nicht ein zweites Mal aufschreibt — und nicht anders auslegt.
  /// Sie hängt am **Thema**, nicht am Abend: wer dazugehört, darf jede Einheit.
  mayEdit: z.boolean(),
});

/** Die Einheit ohne ihr Thema — für Listen, die schon unter dem Thema stehen. */
export const topicSessionInTopicSchema = topicSessionResponseSchema.omit({
  topic: true,
});

/**
 * Die Einheit ohne ihren Termin — für die Termin-Detailansicht.
 *
 * Dazu, wo dieser Abend im Thema steht. Nur die Position, kein Inhalt: „Session
 * 2 von 2" verrät nichts, was der Abendregel unterläge. Die Liste der anderen
 * Einheiten holt die App bei Bedarf über `GET …/topics/:id` — dort steht die
 * Sichtbarkeitslogik schon, und ein zweiter Weg an dieselbe Frage wäre ein
 * zweiter Weg, sie falsch zu beantworten.
 */
export const topicSessionInMeetingSchema = topicSessionResponseSchema
  .omit({ meeting: true })
  .extend({
    /// Die wievielte Einheit des Themas dieser Abend ist, 1-basiert.
    sessionIndex: z.number().int().positive(),
    sessionCount: z.number().int().positive(),
  });

/**
 * Ein Stoff, den die Gruppe durcharbeitet.
 *
 * Nicht an einen Abend gebunden: ein Thema zieht sich über beliebig viele
 * Einheiten. `summaryText` ist der Bogen über alle davon, die Nachbereitung des
 * einzelnen Abends steht an der Einheit.
 */
export const topicResponseSchema = z.object({
  id: z.uuid(),
  hauskreisId: z.uuid(),
  title: z.string().nullable(),
  summaryText: z.string().nullable(),
  status: z.enum(TopicStatus),
  createdAt: isoDateTimeOut,
  updatedAt: isoDateTimeOut,
  version: z.number().int().nonnegative(),
  /// Wer das Thema angefangen hat. `null` bei Themen von vor diesem Modell und
  /// bei solchen, deren Owner den Hauskreis verlassen hat.
  owner: personRefSchema.nullable(),
  /// Wer sonst noch daran arbeiten darf. Kommt automatisch dazu, wer eine
  /// Einheit hält; entfernen darf nur der Owner.
  collaborators: z.array(z.object({ person: personRefSchema })),
  /// Chronologisch. Unfertige Einheiten stehen nur für Owner und Mitarbeitende
  /// darin — für alle anderen gibt es sie nicht.
  sessions: z.array(topicSessionInTopicSchema),
  /// Steht das Thema für alle im Archiv? Wahr, sobald eine Einheit gehalten
  /// wurde — und bleibt es dann, auch für alles, was danach dazukommt.
  publiclyVisible: z.boolean(),
  /// Gehört es mir (Owner oder Mitarbeit)? Der Filter „nur eigene Themen".
  mine: z.boolean(),
  /// Was der Betrachter darf. Vom Server mitgeliefert, damit die App die Regel
  /// nicht ein zweites Mal aufschreiben muss — und nicht anders auslegt.
  mayEdit: z.boolean(),
  mayDelete: z.boolean(),
});

/**
 * Eine offene Einheit — angefangen, aber noch nicht gehalten.
 *
 * `meeting` ist der Abend, an dem sie **gerade** hängt. `null` ist der Normalfall
 * eines Entwurfs. Steht dort ein Termin, kostet das Aufnehmen jenen Abend seine
 * Auswahl — deshalb kommt er mit: die Rückfrage („Die hängt am 18.08. —
 * wegnehmen?") braucht ihn. Ein **vergangener** Abend steht hier nie.
 */
export const openTopicSessionSchema = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  createdAt: isoDateTimeOut,
  meeting: z
    .object({ id: z.uuid(), date: isoDateOut, title: z.string().nullable() })
    .nullable(),
});

/**
 * Was jemand wählen kann, der für einen Abend zugeteilt ist (Spec §3).
 *
 * Option A („neues Thema") braucht keine Daten und steht deshalb nicht hier.
 */
export const topicChoicesResponseSchema = z.object({
  /// B) Eigene Themen, laufende zuerst.
  topics: z.array(
    topicRefSchema.extend({
      sessionCount: z.number().int().nonnegative(),
      /// Wann zuletzt ein Abend dieses Themas war; `null`, wenn noch keiner war.
      lastHeldAt: isoDateOut.nullable(),
    }),
  ),
  /// C) Eigene offene Einheiten, nach Thema gebündelt. Die Gruppe ist die
  /// Einheit der Anzeige: „Vergebung — Teil 2, Teil 3" liest sich als ein Faden,
  /// drei lose Zeilen tun das nicht.
  openSessions: z.array(
    z.object({
      topic: topicRefSchema,
      sessions: z.array(openTopicSessionSchema),
    }),
  ),
});

/** Wer an einem Abend das Thema vorbereitet. */
export const topicResponsiblesResponseSchema = z.object({
  meetingId: z.uuid(),
  responsibles: z.array(z.object({ person: personRefSchema })),
});

export class TopicResponseDto extends createZodDto(topicResponseSchema) {}
export class TopicSessionResponseDto extends createZodDto(
  topicSessionResponseSchema,
) {}
export class TopicChoicesResponseDto extends createZodDto(
  topicChoicesResponseSchema,
) {}
export class TopicResponsiblesResponseDto extends createZodDto(
  topicResponsiblesResponseSchema,
) {}
export class TopicPageResponseDto extends createZodDto(
  pageSchema(topicResponseSchema),
) {}
