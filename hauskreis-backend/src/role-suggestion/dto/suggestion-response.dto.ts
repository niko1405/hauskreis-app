import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isoDateOut, isoDateTimeOut } from '../../common/dto/response';

/**
 * Die Fakten hinter einem Vorschlag.
 *
 * CLAUDE.md §4 verlangt Nachvollziehbarkeit statt Blackbox: die Oberfläche zeigt
 * diese Werte direkt an, damit erkennbar ist, *warum* jemand oben steht. Ein
 * Frontend, das nur die Reihenfolge übernimmt und die Fakten wegwirft, gibt
 * genau das auf, wofür der Endpunkt gebaut ist.
 */
const suggestionFactsSchema = z.object({
  /// Wann diese Person diese Rolle zuletzt hatte, `null` wenn noch nie.
  lastAssignedAt: isoDateOut.nullable(),
  daysSinceLastAssignment: z.number().int().nullable(),
  /// Wie oft insgesamt, über die ganze Historie.
  timesAssigned: z.number().int().nonnegative(),
  /// Bereits zugesagte Aufgaben *jeder* Rolle nach dem Zieldatum — die
  /// aktuelle Last. Daran erkennt man, wem man gerade nichts mehr aufladen will.
  upcomingCommitments: z.array(
    z.object({
      role: z.enum(['HOST', 'TOPIC', 'SONG']),
      date: isoDateOut,
    }),
  ),
});

export const roleSuggestionSchema = z.object({
  personId: z.uuid(),
  name: z.string(),
  /// Fürs Gesicht in der Vorschlagsliste. Nicht `personRefSchema`, obwohl es
  /// dieselben drei Felder sind: hier heißt das Feld `personId`, weil ein
  /// Vorschlag *über* eine Person spricht und nicht *eine Person ist* — und ein
  /// eingebettetes `person: { … }` machte aus `suggestion.name` ein
  /// `suggestion.person.name` an jeder Aufrufstelle.
  photoUpdatedAt: isoDateTimeOut.nullable(),
  /// Ab 1. Gleiche Fakten ergeben trotzdem verschiedene Ränge, entschieden
  /// über den Namen — damit dieselbe Historie immer dieselbe Reihenfolge gibt.
  rank: z.number().int().positive(),
  facts: suggestionFactsSchema,
});

/** Was ein Zuhause an Guthaben und Vergangenheit mitbringt. */
const homeFactsSchema = z.object({
  locationId: z.uuid(),
  locationName: z.string(),
  hostWeight: z.number(),
  /// Guthaben in Terminen. Positiv heißt „ist hinter seinem Anteil", negativ
  /// „hat mehr gehostet als ihm zusteht".
  credit: z.number(),
  capacity: z.number().int().nullable(),
  expectedAttendance: z.number().int().nullable(),
  timesUsed: z.number().int().nonnegative(),
  lastUsedAt: isoDateOut.nullable(),
  daysSinceLastUse: z.number().int().nullable(),
  /// Anteil aller Abende, den dieses Zuhause tragen sollte — aus dem Gewicht.
  expectedShare: z.number(),
  /// Anteil, den es bisher tatsächlich getragen hat.
  actualShare: z.number(),
});

/**
 * Beim Hosten sind Person und Ort dieselbe Entscheidung: „bei Niko" *ist* Niko,
 * der hostet. Der Vorschlag trägt deshalb das Zuhause mit sich.
 */
export const hostSuggestionSchema = roleSuggestionSchema.extend({
  facts: suggestionFactsSchema.extend({
    /// Diese Person ist an dem Abend weg. Wird hinter den eigenen Mitbewohnern
    /// gelistet statt weggelassen — ein fehlender Name liest sich wie ein Fehler.
    away: z.boolean(),
    /// Für diesen einen Abend zurückgestellt, aber weiterhin wählbar.
    deferred: z.boolean(),
    /// `AWAY` = der ganze Haushalt ist weg, `TOO_SMALL` = passt an dem Abend
    /// nicht, `HOUSEHOLD_BUSY` = jemand aus dem Haushalt hat schon eine Rolle.
    deferredReason: z.enum(['AWAY', 'TOO_SMALL', 'HOUSEHOLD_BUSY']).nullable(),
    home: homeFactsSchema,
  }),
});

export class HostSuggestionListResponseDto extends createZodDto(
  z.array(hostSuggestionSchema),
) {}
export class RoleSuggestionListResponseDto extends createZodDto(
  z.array(roleSuggestionSchema),
) {}
