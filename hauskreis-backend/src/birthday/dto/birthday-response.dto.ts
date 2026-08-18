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
  priceCents: z.int().nullable(),
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
  });

export const giftPairingResponseSchema = z.object({
  birthdayPerson: personRefSchema,
  responsible: personRefSchema.nullable(),
});

export const giftPairingListResponseSchema = z.object({
  pairings: z.array(giftPairingResponseSchema),
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
 * Alle vier schreibenden Wege — vorschlagen, zurückziehen, zustimmen,
 * zurücknehmen — geben sie zurück, weil sich mit jedem von ihnen die
 * **Sortierung** ändert: Die Liste steht nach Zustimmung, eine Stimme
 * verschiebt also mehr als die eine Zeile. Nur den betroffenen Vorschlag zu
 * antworten hieße, das Frontend die neue Reihenfolge raten zu lassen.
 */
export const giftIdeaListResponseSchema = z.array(giftIdeaResponseSchema);

export class GiftIdeaResponseDto extends createZodDto(giftIdeaResponseSchema) {}
export class GiftIdeaListResponseDto extends createZodDto(
  giftIdeaListResponseSchema,
) {}
