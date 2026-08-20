import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MeetingStatus, TopicStatus } from '../../../generated/prisma/enums';
import {
  isoDateOut,
  isoDateTimeOut,
  pageSchema,
  personRefSchema,
} from '../../common/dto/response';
import { wallClockOut } from '../../common/dto/wall-clock';

/** Das Thema, auf das Nötigste — als Kopfzeile über einer Einheit. */
export const topicRefSchema = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  status: z.enum(TopicStatus),
  /// Wahr heißt: Es gibt hier gar kein Thema, nur diese eine Einheit. Der
  /// Datensatz existiert trotzdem — er trägt Owner und Mitarbeitende (siehe
  /// `Topic.standalone` im Schema). Wer ihn anzeigt, zeigt ihn nicht an.
  standalone: z.boolean(),
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
  /// Der Abend, an dem sie hängt. Bewusst nur die fünf Felder, die eine
  /// Zeile in der Einheiten-Liste braucht — der volle Termin steht anderswo.
  meeting: z
    .object({
      id: z.uuid(),
      date: isoDateOut,
      /// `"19:30"` — nicht zum Anzeigen, sondern damit die Themenseite weiß, ab
      /// wann sich der Actionstep abhaken lässt. Dieselbe Grenze wie am Termin.
      startTime: wallClockOut,
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
  /// Wer diese Einheit vorbereitet oder gehalten hat — und daran hängt seit der
  /// Trennung von Vorbereitung und Abend-Rolle das Schreibrecht an *dieser*
  /// Einheit. Gepflegt wird die Liste auf der Seite der Einheit, nicht am
  /// Termin.
  responsibles: z.array(z.object({ person: personRefSchema })),
  /// Wer den Actionstep dieses Abends für sich abgehakt hat. Leer, solange die
  /// Einheit an keinem Abend hängt — abhaken lässt sich nur, was war.
  ///
  /// Der Haken sitzt am Termin (`meeting_actionstep_done`), der Text an der
  /// Einheit. Er steht hier mit, damit die Themenseite ihn nicht über einen
  /// zweiten Aufruf pro Einheit nachladen muss.
  actionstepDone: z.array(z.object({ person: personRefSchema })),
  /// Hat der Abend stattgefunden? Rein zeitlich, kein Häkchen: verknüpft, in der
  /// Vergangenheit, nicht abgesagt.
  held: z.boolean(),
  /// Ob die drei Textfelder oben gefüllt sind oder zurückgehalten wurden.
  contentVisible: z.boolean(),
  /// Ob der Betrachter **diese Einheit** schreiben darf — ihre Texte und die
  /// Liste derer, die sie vorbereiten. Wahr für den Owner, die Mitarbeitenden am
  /// Thema und alle, die an dieser Einheit stehen.
  mayEdit: z.boolean(),
  /// Ob er auch am **Thema darüber** darf: eine weitere Einheit anlegen, ein
  /// Überthema vergeben. Enger als `mayEdit` — wer nur diesen einen Abend
  /// vorbereitet, räumt nichts aus einem fremden Thema heraus.
  mayEditTopic: z.boolean(),
  /// Ob er diese Einheit löschen darf. Enger als `mayEditTopic`, sobald ihr
  /// Abend war: Gehaltenes geht nur mit dem ganzen Thema — und bei einer Hülle
  /// **ist** die Einheit das ganze Thema, dort geht es also doch.
  mayDelete: z.boolean(),
  /// Ob sich das Überthema wieder entfernen lässt: nur der Owner, nur solange
  /// genau eine Einheit daranhängt. Die Bindung an den Abend bleibt dabei.
  mayUnname: z.boolean(),
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
  // `actionstepDone` fällt mit dem Termin weg: der steht hier darüber und trägt
  // dieselbe Liste schon.
  .omit({ meeting: true, actionstepDone: true })
  .extend({
    /// Die wievielte Einheit des Themas dieser Abend ist, 1-basiert.
    sessionIndex: z.number().int().positive(),
    sessionCount: z.number().int().positive(),
  });

/**
 * Die Einheit für sich allein — mit ihrer Stelle im Thema.
 *
 * Die beiden Zahlen stehen hier und nicht in `topicSessionResponseSchema`, weil
 * sie nur dort einen Sinn haben, wo die Einheit **ohne** ihre Geschwister
 * angezeigt wird: auf ihrem eigenen Bildschirm. In der Liste unter einem Thema
 * zählt man selbst, und in der Terminansicht steht es schon in
 * `topicSessionInMeetingSchema`.
 *
 * Bei einer alleinstehenden Einheit steht dort `1 von 1` — richtig, aber nichts,
 * was man hinschreiben müsste; die Anzeige liest `topic.standalone`.
 */
export const topicSessionDetailSchema = topicSessionResponseSchema.extend({
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
  /// Nur die Hülle einer einzelnen Einheit — dann steht in `title` nichts und
  /// in `sessions` genau eine. Die Archivliste unterscheidet daran, ob sie ein
  /// Thema oder eine Einheit vor sich hat.
  standalone: z.boolean(),
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
  /// Gehört es mir (Owner, Mitarbeit oder eine Einheit, die ich vorbereite)?
  /// Der Filter „nur eigene Themen".
  mine: z.boolean(),
  /// Was der Betrachter darf. Vom Server mitgeliefert, damit die App die Regel
  /// nicht ein zweites Mal aufschreiben muss — und nicht anders auslegt.
  mayEdit: z.boolean(),
  mayDelete: z.boolean(),
});

/**
 * Eine einzelne Einheit — eine ohne Thema darüber.
 *
 * `meeting` ist der Abend, an dem sie **gerade** hängt; `null` heißt, sie wartet
 * noch. Steht dort ein Termin, kostet das Hierherholen jenen Abend seine
 * Auswahl — deshalb kommt er mit: die Rückfrage („Die hängt am 18.08. —
 * wegnehmen?") braucht ihn.
 *
 * Zwei Flaggen statt einer, weil an ihnen zwei verschiedene Angebote hängen:
 *
 * - `resumable` — sie lässt sich **hierher holen**. Wahr, solange kein Abend
 *   dranhängt oder der noch bevorsteht; danach ist die Einheit das Protokoll
 *   eines Abends, der war.
 * - `held` — der Abend war und fiel nicht aus. Nur zum Anzeigen: „am 12.08.
 *   gehalten" liest sich anders als „hängt am 26.08.".
 *
 * Was schon war, steht also weiter in der Liste — nicht zum Nehmen, sondern zum
 * **Fortsetzen**: Aus einer gehaltenen Einheit lässt sich ein Thema machen, und
 * das ist der häufigere Fall.
 */
export const singleTopicSessionSchema = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  createdAt: isoDateTimeOut,
  /// Das Thema darüber — `null` bei einer alleinstehenden Einheit.
  ///
  /// Seit die Liste auch gebundene Einheiten trägt (jede, die ich vorbereite),
  /// braucht die Zeile diese Herkunft: „Teil 3" ohne das Thema davor wäre
  /// dasselbe Angebot wie ein einzelner Abend, und das ist es nicht.
  topic: z.object({ id: z.uuid(), title: z.string().nullable() }).nullable(),
  meeting: z
    .object({ id: z.uuid(), date: isoDateOut, title: z.string().nullable() })
    .nullable(),
  resumable: z.boolean(),
  held: z.boolean(),
});

/**
 * Was jemand wählen kann, der für einen Abend zugeteilt ist.
 *
 * Zwei Listen entlang der Trennlinie, um die es hier geht: ein Thema über
 * mehreren Abenden, oder ein Abend für sich. Neu anfangen braucht keine Daten
 * und steht deshalb nicht hier.
 *
 * `singleSessions` heißt nicht mehr „ohne Thema", sondern **„meine offenen
 * Einheiten"** — auch die unter einem fremden Thema, an denen ich als
 * Verantwortliche:r stehe. Sonst wäre eine Einheit, zu der mich jemand
 * dazugeholt hat, an meinem eigenen Abend nicht wählbar.
 */
export const topicChoicesResponseSchema = z.object({
  /// Eigene Themen, laufende zuerst. Hüllen fallen heraus — sie tragen genau
  /// eine Einheit und keinen Titel und stünden hier als Zeile ohne Aussage.
  topics: z.array(
    topicRefSchema.extend({
      sessionCount: z.number().int().nonnegative(),
      /// Wann zuletzt ein Abend dieses Themas war; `null`, wenn noch keiner war.
      lastHeldAt: isoDateOut.nullable(),
    }),
  ),
  /// Die eigenen einzelnen Einheiten — die offenen zum Nehmen, die gehaltenen
  /// zum Fortsetzen. Was schon an *diesem* Abend hängt, steht nicht dabei.
  singleSessions: z.array(singleTopicSessionSchema),
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
export class TopicSessionDetailDto extends createZodDto(
  topicSessionDetailSchema,
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
