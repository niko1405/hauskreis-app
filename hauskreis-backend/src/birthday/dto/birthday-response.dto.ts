import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BirthdayGiftMode } from '../../../generated/prisma/enums';
import {
  isoDateOut,
  isoDateTimeOut,
  personRefSchema,
} from '../../common/dto/response';

/**
 * Ein Geschenk-Vorschlag für eine Person.
 *
 * `giftedOn` ist der Unterschied zwischen „offener Vorschlag" und „haben wir
 * schon geschenkt". Weil Vorschläge an der Person hängen und nicht am
 * Geburtstag, stehen beide Sorten nebeneinander — man will wissen, was schon
 * einmal genommen wurde, um es nicht zweimal zu schenken, und was übrig blieb,
 * weil es immer noch eine gute Idee ist.
 */
/**
 * Ein Satz zu einem Vorschlag — „gibt's auch in Blau", „hat sie schon".
 *
 * `mine` statt eines Vergleichs im Frontend: Löschen darf nur, wer ihn
 * geschrieben hat, und wer das ist, weiß der Server.
 */
export const giftIdeaCommentResponseSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  /// `null` heißt: ehemaliges Mitglied.
  author: personRefSchema.nullable(),
  createdAt: isoDateTimeOut,
  mine: z.boolean(),
});

export const giftIdeaResponseSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  url: z.string().nullable(),
  proposedBy: personRefSchema.nullable(),
  /// Wie viele zugestimmt haben. Mehrere Vorschläge darf man gut finden.
  votes: z.int(),
  votedByMe: z.boolean(),
  /// Wann dieser Vorschlag schon einmal verschenkt wurde, falls er das wurde.
  giftedOn: isoDateOut.nullable(),
  /// Ob der Betrachter ihn wegnehmen darf: nur, wer ihn gemacht hat, und nur,
  /// solange er nie verschenkt wurde. Der Server prüfte das längst — gezeigt
  /// wurde der Papierkorb trotzdem allen.
  canRemove: z.boolean(),
  /// Älteste zuerst, wie man ein Gespräch liest.
  comments: z.array(giftIdeaCommentResponseSchema),
});

/**
 * Ein Geburtstag, so wie ihn eine Karte zeigt.
 *
 * **Was das Geburtstagskind nicht sieht, steht hier gar nicht drin.** `gift`,
 * `priceCents` und `giftDecided` kommen für die eigene Runde als `null`
 * beziehungsweise `false` zurück — nicht ausgeblendet im Frontend, sondern nie
 * verschickt. Eine Überraschung, die nur ein `hidden` weit von der
 * Entwicklerkonsole entfernt ist, ist keine.
 */
export const birthdayOccasionResponseSchema = z.object({
  id: z.uuid(),
  person: personRefSchema,
  occursOn: isoDateOut,
  /// Wie alt die Person wird — `null`, wenn das Jahr offensichtlich nicht stimmt.
  age: z.int().nullable(),
  /// Negativ heißt: liegt hinter uns.
  daysUntil: z.int(),
  responsible: personRefSchema.nullable(),
  /// Ob an der Zuständigkeit nichts mehr geändert wird.
  frozen: z.boolean(),
  /// Der eigene Geburtstag. Dann ist unten alles leer, und das ist Absicht.
  isOwn: z.boolean(),
  giftDecided: z.boolean(),
  gift: z.object({ id: z.uuid(), text: z.string() }).nullable(),
  /// Was es **insgesamt** gekostet hat.
  priceCents: z.int().nullable(),
  /// Der Anteil je Person: geteilt durch alle außer dem Geburtstagskind, wer
  /// besorgt hat eingeschlossen. `null` ohne Preis — und für das
  /// Geburtstagskind, wie der Preis selbst.
  shareCents: z.int().nullable(),
});

/**
 * Was beim Geschenk-Geld noch offen ist — unter „Noch offen" im Register und
 * auf „Heute": ein Anteil, den ich noch nicht abgehakt habe, oder (mit
 * `collecting`) ein vergangener Geburtstag, für den ich vorgestreckt habe.
 */
export const openGiftPaymentResponseSchema = z.object({
  occasionId: z.uuid(),
  /// Wer Geburtstag hatte.
  person: personRefSchema,
  occursOn: isoDateOut,
  gift: z.object({ id: z.uuid(), text: z.string() }).nullable(),
  shareCents: z.int().nullable(),
  /// Gesetzt, wenn **ich** besorgt habe und der Geburtstag vorbei ist: wie
  /// viele schon gezahlt haben, von wie vielen. Dann ist die Zeile keine
  /// eigene Schuld, sondern der Weg zur Liste, wer noch fehlt. `null` heißt:
  /// mein eigener Anteil ist offen.
  collecting: z.object({ paid: z.int(), of: z.int() }).nullable(),
});

/** Ein Mitglied in der Liste „alle Geburtstage" — auch ohne eingetragenen. */
export const birthdayMemberResponseSchema = z.object({
  person: personRefSchema,
  /// `null` heißt: nicht eingetragen. Dann steht die Person in keiner Rotation.
  birthdate: isoDateOut.nullable(),
});

export const birthdayGiftConfigResponseSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(BirthdayGiftMode),
  freezeDays: z.int(),
  /// Wann das System eine feste Zuteilung zuletzt selbst schließen musste.
  pairingsRepairedAt: isoDateTimeOut.nullable(),
  updatedBy: personRefSchema.nullable(),
  /**
   * **Ohne dieses Feld gibt es keinen brauchbaren ETag.**
   *
   * `EtagInterceptor` setzt `W/"<version>"` nur, wenn die *serialisierte*
   * Antwort ein `version` trägt — und serialisiert wird gegen dieses Schema.
   * Fehlte es, bliebe Express' eigener Inhalts-Hash stehen (`W/"a3-…"`), den
   * `parseEtagVersion` nicht als Version erkennt. Das Ergebnis war kein
   * Fehler beim Lesen, sondern einer beim **Schreiben**: Der Client schickt
   * den Hash als `If-Match`, die Bedingung passt auf keine Version, und die
   * Verwaltung meldete „jemand war schneller" — obwohl niemand sonst da war.
   */
  version: z.int().nonnegative(),
});

/**
 * Der ganze Geburtstags-Bildschirm in einer Antwort.
 *
 * Fünf Abfragen in einem Aufruf statt fünf Aufrufen — dieselbe Entscheidung wie
 * beim Startbildschirm: Was zusammen auf einem Schirm steht, soll zusammen
 * ankommen, sonst baut sich die Seite in Etappen auf.
 */
export const birthdayOverviewResponseSchema = z.object({
  /// Was ich noch bezahlen muss, der älteste zuerst.
  openPayments: z.array(openGiftPaymentResponseSchema),
  members: z.array(birthdayMemberResponseSchema),
  /// Nach Datum, der nächste zuerst. Je Person höchstens einer.
  upcoming: z.array(birthdayOccasionResponseSchema),
  /// Die eigene nächste Zuständigkeit — auch die, die noch weit weg ist.
  myNext: birthdayOccasionResponseSchema.nullable(),
  /// Wen man in den letzten Runden hatte, neueste zuerst.
  myPast: z.array(birthdayOccasionResponseSchema),
  config: birthdayGiftConfigResponseSchema,
});

/** Ein Geburtstag mit allem, was daran hängt. */
export const birthdayDetailResponseSchema =
  birthdayOccasionResponseSchema.extend({
    /// `null` für das Geburtstagskind — es gibt hier nichts für sie zu sehen.
    ideas: z.array(giftIdeaResponseSchema).nullable(),
    canPropose: z.boolean(),
    /// Ob der Betrachter auswählen und den Preis eintragen darf.
    canDecide: z.boolean(),
    /// Ob der Betrachter alle anderen an die Vorschläge erinnern darf — nur,
    /// wer das Geschenk besorgt, und nur bis zum Geburtstag.
    canNudge: z.boolean(),
    /// Ob heute schon erinnert wurde. Einmal am Tag ist eine Bitte, öfter
    /// wäre es Lärm.
    nudgedToday: z.boolean(),
    /// Ob der Betrachter seinen Anteil zahlt: Es gibt einen Preis, und er ist
    /// weder Geburtstagskind noch der, der besorgt hat.
    mustPay: z.boolean(),
    /// Ob er ihn abgehakt hat.
    paidByMe: z.boolean(),
    /// Wer zahlt und wer schon hat — **nur für den, der besorgt hat**, sonst
    /// `null`. Unter jedem Geburtstag für alle zu sehen, wer noch schuldet,
    /// wäre eine Liste, die niemand braucht.
    payments: z
      .array(
        z.object({
          person: personRefSchema,
          paidAt: isoDateTimeOut.nullable(),
        }),
      )
      .nullable(),
  });

export const giftPairingResponseSchema = z.object({
  birthdayPerson: personRefSchema,
  /// Monat und Tag, `MM-DD` — ohne Jahr. Die Verwaltung schreibt „12. Mai"
  /// neben den Namen; das Alter hat dort nichts zu suchen.
  birthday: z.string().regex(/^\d{2}-\d{2}$/),
  responsible: personRefSchema.nullable(),
});

/**
 * Die Zuteilung, wie sie in der Verwaltung steht — **zweimal**.
 *
 * `pairings` ist die gespeicherte feste Zuteilung (im Modus „Benutzerdefiniert"
 * die geltende), `rotation` die ausgerechnete „Der Reihe nach". Beide kommen
 * immer mit: Die Verwaltung zeigt im Modus „Der Reihe nach", wer wen bekommt,
 * und wer auf „Benutzerdefiniert" umstellt, fängt mit genau dieser Zuteilung
 * an — so wie der Planer beim Wechsel.
 *
 * Beide nach Geburtstag im Jahr sortiert, damit sich die Kette von oben nach
 * unten liest.
 */
export const giftPairingListResponseSchema = z.object({
  pairings: z.array(giftPairingResponseSchema),
  rotation: z.array(giftPairingResponseSchema),
  config: birthdayGiftConfigResponseSchema,
});

export class BirthdayOverviewResponseDto extends createZodDto(
  birthdayOverviewResponseSchema,
) {}
export class BirthdayDetailResponseDto extends createZodDto(
  birthdayDetailResponseSchema,
) {}
export class BirthdayGiftConfigResponseDto extends createZodDto(
  birthdayGiftConfigResponseSchema,
) {}
export class GiftPairingListResponseDto extends createZodDto(
  giftPairingListResponseSchema,
) {}
/**
 * Die ganze Liste, nicht der eine Vorschlag.
 *
 * Alle schreibenden Wege — vorschlagen, zurückziehen, zustimmen,
 * zurücknehmen, kommentieren — geben sie zurück, weil sich mit jedem von ihnen die
 * **Sortierung** ändert: Die Liste steht nach Zustimmung, eine Stimme
 * verschiebt also mehr als die eine Zeile. Nur den betroffenen Vorschlag zu
 * antworten hieße, das Frontend die neue Reihenfolge raten zu lassen. Ein
 * Kommentar verschiebt nichts, nimmt aber denselben Weg: Eine zweite Form der
 * Antwort für einen Fall wäre ein zweiter Cache-Eintrag für dieselbe Liste.
 */
export const giftIdeaListResponseSchema = z.array(giftIdeaResponseSchema);

export class GiftIdeaResponseDto extends createZodDto(giftIdeaResponseSchema) {}
export class GiftIdeaListResponseDto extends createZodDto(
  giftIdeaListResponseSchema,
) {}
