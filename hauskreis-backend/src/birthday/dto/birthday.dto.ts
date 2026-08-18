import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BirthdayGiftMode } from '../../../generated/prisma/enums';
import { MAX_FREEZE_DAYS, MIN_FREEZE_DAYS } from '../birthday-settings';

const hauskreisParams = { hauskreisId: z.uuid() };

export class BirthdayParamsDto extends createZodDto(
  z.object({ ...hauskreisParams, id: z.uuid() }),
) {}

export class GiftIdeaParamsDto extends createZodDto(
  z.object({ ...hauskreisParams, id: z.uuid(), ideaId: z.uuid() }),
) {}

/**
 * Ein Geschenk-Vorschlag: ein Satz, und wo man es bekommt.
 *
 * Die Adresse ist frei — ein Vorschlag ist kein Bestellformular. Geprüft wird
 * nur, dass es überhaupt eine Adresse ist; wohin sie zeigt, entscheidet, wer
 * darauf klickt. Dieselbe Haltung wie bei den Liedern: Der Inhalt wird nie
 * gespeichert, wir verlinken nach draußen.
 */
export const createGiftIdeaSchema = z.object({
  text: z.string().trim().min(1).max(500),
  url: z.url().max(2000).nullish(),
});
export class CreateGiftIdeaDto extends createZodDto(createGiftIdeaSchema) {}

/**
 * Was der Zuständige entscheiden darf: welches Geschenk, und was es gekostet
 * hat.
 *
 * Beide Felder ausdrücklich `nullable`, nicht nur `optional` — die Auswahl
 * zurückzunehmen ist ein Wunsch, den man äußern können muss („soll auch
 * rückgängig gemacht werden"). Weggelassen heißt „lass, wie es ist", `null`
 * heißt „nimm es weg".
 *
 * Der Preis in **Cent** und als Ganzzahl. Geld als Fließkomma ist ein Fehler,
 * den man einmal macht.
 */
export const decideGiftSchema = z
  .object({
    giftIdeaId: z.uuid().nullish(),
    priceCents: z.int().min(0).max(1_000_000).nullish(),
  })
  .refine(
    (dto) => dto.giftIdeaId !== undefined || dto.priceCents !== undefined,
    { message: 'Es muss mindestens ein Feld angegeben werden' },
  );
export class DecideGiftDto extends createZodDto(decideGiftSchema) {}

/**
 * Die Einstellungen der Gruppe.
 *
 * `enabled` steht vorn, weil es die Frage vor allen anderen ist: Manche
 * Hauskreise schenken sich nichts, und für die soll hier nichts passieren —
 * keine Zuständigkeiten, keine Nachrichten.
 */
export const updateBirthdayGiftConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(BirthdayGiftMode),
  freezeDays: z.int().min(MIN_FREEZE_DAYS).max(MAX_FREEZE_DAYS),
});
export class UpdateBirthdayGiftConfigDto extends createZodDto(
  updateBirthdayGiftConfigSchema,
) {}

/**
 * Die feste Zuteilung, ganz oder gar nicht.
 *
 * Eine vollständige Liste statt einzelner Änderungen, weil eine Zuteilung nur
 * als Ganzes stimmt: Wer B von A auf C umhängt, muss auch wissen, was aus A
 * wird. Zwei Aufrufe hintereinander hätten dazwischen einen Zustand, den
 * niemand wollte — und den der Planer in der Zwischenzeit ausrollen würde.
 */
export const updateGiftPairingsSchema = z.object({
  pairings: z
    .array(
      z.object({
        birthdayPersonId: z.uuid(),
        responsiblePersonId: z.uuid(),
      }),
    )
    .max(200),
});
export class UpdateGiftPairingsDto extends createZodDto(
  updateGiftPairingsSchema,
) {}
