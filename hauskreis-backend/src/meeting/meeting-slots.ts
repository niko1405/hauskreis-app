/**
 * Woraus ein Abend besteht.
 *
 * Vier Schalter am Termin, und der Typ ist nur noch ihre Voreinstellung. Vorher
 * war der Typ eine Behauptung: er stand in der Antwort, aber geprüft wurde
 * nichts. Man konnte einem Lobpreisabend ein Thema geben, einem Geburtstag ein
 * Testimony, und ein „Geburtstag von Mira" zählte in der Host-Fairness wie ein
 * ganz normaler Dienstag — obwohl dort niemand im Sinne der Rotation gehostet
 * hat.
 *
 * Die Schalter beantworten das, indem sie eine Frage von einer anderen trennen:
 * **was für ein Abend ist das** (der Typ, fürs Auge) und **was gehört dazu**
 * (die Slots, für die Logik).
 *
 * Reine Funktionen, kein Dienst: die Regeln haben keine Abhängigkeiten und
 * lassen sich so an jeder Stelle prüfen, an der sie gelten — im Service, im
 * Generator und im Test.
 */
import { BadRequestException } from '@nestjs/common';
import { MeetingType } from '../../generated/prisma/enums';

export interface MeetingSlots {
  hasHostSlot: boolean;
  hasTopicSlot: boolean;
  hasSongSlot: boolean;
  hasTestimonySlot: boolean;
}

/**
 * Was eine Terminart normalerweise mitbringt.
 *
 * `CUSTOM` startet leer — das ist der Kern der Sache. Ein besonderer Termin
 * muss nichts erfüllen (CLAUDE.md §5), und ihm Host, Thema und Lieder
 * aufzudrängen hieß bisher, dass ein Geburtstagsabend als unvollständig
 * dastand, solange niemand ein Thema zugeteilt hatte.
 */
export function slotDefaults(type: MeetingType): MeetingSlots {
  switch (type) {
    case MeetingType.STANDARD:
      return {
        hasHostSlot: true,
        hasTopicSlot: true,
        hasSongSlot: true,
        hasTestimonySlot: false,
      };
    case MeetingType.LOBPREIS_GEBET:
      // Kein Thema, dafür ein Testimony — oder auch nur Lieder (CLAUDE.md §5).
      return {
        hasHostSlot: true,
        hasTopicSlot: false,
        hasSongSlot: true,
        hasTestimonySlot: true,
      };
    case MeetingType.CUSTOM:
      return {
        hasHostSlot: false,
        hasTopicSlot: false,
        hasSongSlot: false,
        hasTestimonySlot: false,
      };
  }
}

/** Wie ein Slot heißt, wenn man einem Menschen erklärt, was fehlt. */
const SLOT_LABEL: Record<keyof MeetingSlots, string> = {
  hasHostSlot: 'keinen Gastgeber',
  hasTopicSlot: 'kein Thema',
  hasSongSlot: 'keine Lieder',
  hasTestimonySlot: 'kein Testimony',
};

/**
 * Was an einem Termin hängt, wenn ein Slot abgeschaltet wird.
 *
 * Die Zuordnung steht hier einmal, damit „was darf man schreiben" und „was
 * wird beim Abschalten weggeräumt" nicht auseinanderlaufen können. Genau das
 * ist die Sorte Fehler, die man erst Wochen später bemerkt: ein Feld, das
 * niemand mehr setzen kann, aber noch einen alten Wert trägt.
 */
export const SLOT_FIELDS = {
  hasHostSlot: ['hostPersonId', 'locationId'],
  hasTopicSlot: ['topicId', 'actionstepText', 'summaryText'],
  hasSongSlot: [],
  hasTestimonySlot: ['testimonyText'],
} as const satisfies Record<keyof MeetingSlots, readonly string[]>;

/**
 * Weist ab, wer ein Feld schreiben will, dessen Baustein aus ist.
 *
 * `undefined` heißt „nicht mitgeschickt" und ist immer in Ordnung — ein PATCH
 * mit dem Info-Text darf nicht daran scheitern, dass der Abend kein Thema hat.
 * Ein ausdrückliches `null` ist dagegen erlaubt, obwohl es ein Wert ist:
 * aufräumen darf man immer, und beim Abschalten eines Slots tun wir selbst
 * genau das.
 */
export function assertSlotsAllow(slots: MeetingSlots, dto: object): void {
  const values = dto as Record<string, unknown>;

  for (const [slot, fields] of Object.entries(SLOT_FIELDS)) {
    if (slots[slot as keyof MeetingSlots]) continue;

    const offending = fields.find(
      (field) => values[field] !== undefined && values[field] !== null,
    );

    if (offending) {
      throw new BadRequestException(
        `Dieser Termin hat ${SLOT_LABEL[slot as keyof MeetingSlots]} — schalte das erst dazu`,
      );
    }
  }
}

/**
 * Was beim Abschalten eines Bausteins zu leeren ist.
 *
 * Gibt nur die Felder zurück, deren Slot gerade **von an auf aus** geht: ein
 * Slot, der ohnehin aus war, hat nichts mehr zu leeren, und ein `null` mehr im
 * `data` wäre eine überflüssige Schreiboperation samt Versionssprung.
 */
export function clearedByTurningOff(
  before: MeetingSlots,
  after: MeetingSlots,
): Record<string, null> {
  const cleared: Record<string, null> = {};

  for (const [slot, fields] of Object.entries(SLOT_FIELDS)) {
    const key = slot as keyof MeetingSlots;
    if (!before[key] || after[key]) continue;
    for (const field of fields) cleared[field] = null;
  }

  return cleared;
}

/**
 * Die neue Belegung aus dem, was war, und dem, was geschickt wurde.
 *
 * Ein Wechsel der **Terminart** setzt die Slots auf deren Voreinstellung
 * zurück — wer aus einem Geburtstag wieder einen Hauskreis-Abend macht, meint
 * damit einen ganzen Abend und nicht ein leeres Gerüst mit neuem Namen.
 * Ausdrücklich mitgeschickte Schalter gewinnen trotzdem, damit beides in einem
 * Aufruf geht.
 */
export function resolveSlots(
  before: MeetingSlots & { type: MeetingType },
  dto: Partial<MeetingSlots> & { type?: MeetingType },
): MeetingSlots {
  const base =
    dto.type && dto.type !== before.type ? slotDefaults(dto.type) : before;

  return {
    hasHostSlot: dto.hasHostSlot ?? base.hasHostSlot,
    hasTopicSlot: dto.hasTopicSlot ?? base.hasTopicSlot,
    hasSongSlot: dto.hasSongSlot ?? base.hasSongSlot,
    hasTestimonySlot: dto.hasTestimonySlot ?? base.hasTestimonySlot,
  };
}
