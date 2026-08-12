/**
 * Woraus ein Abend besteht.
 *
 * Vier Schalter am Termin, und der Typ ist nur noch ihre Voreinstellung. Vorher
 * war der Typ eine Behauptung: er stand in der Antwort, aber geprüft wurde
 * nichts. Man konnte einem Lobpreisabend ein Thema geben, einem Geburtstag ein
 * Testimony, und ein „Geburtstag von Mira" zählte in der Fairness wie ein ganz
 * normaler Dienstag — obwohl dort niemand im Sinne der Rotation dran war.
 *
 * Die Schalter beantworten das, indem sie eine Frage von einer anderen trennen:
 * **was für ein Abend ist das** (der Typ, fürs Auge) und **was gehört dazu**
 * (die Slots, für die Logik).
 *
 * **Einen Gastgeber-Schalter gibt es nicht.** Man trifft sich immer irgendwo;
 * ein Schalter, der nie aus darf, ist keiner. Dass an einem Abend *niemand*
 * gastgebend eingetragen ist — das Treffen im Schlosspark — bleibt davon
 * unberührt: das ist ein leeres Feld, kein abgeschalteter Baustein.
 *
 * Reine Funktionen, kein Dienst: die Regeln kennen keine Datenbank und lassen
 * sich so an jeder Stelle prüfen, an der sie gelten — im Service, im Generator
 * und im Test. Die einzige Abhängigkeit ist `eveningReached`, selbst eine reine
 * Funktion; die Uhr kommt als Parameter herein.
 */
import { BadRequestException } from '@nestjs/common';
import { MeetingType } from '../../generated/prisma/enums';
import { eveningReached } from '../common/time/local-evening';

export interface MeetingSlots {
  hasTopicSlot: boolean;
  hasSongSlot: boolean;
  hasTestimonySlot: boolean;
  /**
   * Zusammenfassung und Actionstep **ohne** Thema.
   *
   * Der Nachzügler unter den Bausteinen, und er füllt eine Lücke: die
   * Nachbereitung hing bis eben ausschließlich an der Einheit eines Themas. Ein
   * Lobpreisabend, an dem die Gruppe sich etwas für die Woche vornimmt, hatte
   * dafür keinen Ort — obwohl der Vorsatz dort genauso entsteht.
   *
   * Der einzige Baustein, der **nicht zur Planung** gehört: er lässt sich erst
   * ab Terminbeginn anschalten (`assertNotesSlotNotAhead`) und steht im Frontend
   * deshalb auch nicht im Bausteinkasten, sondern hinter einem Hinweis am Abend
   * selbst.
   */
  hasNotesSlot: boolean;
}

/**
 * Was eine Terminart normalerweise mitbringt.
 *
 * `CUSTOM` startet leer — das ist der Kern der Sache. Ein besonderer Termin
 * muss nichts erfüllen (CLAUDE.md §5), und ihm Host, Thema und Lieder
 * aufzudrängen hieß bisher, dass ein Geburtstagsabend als unvollständig
 * dastand, solange niemand ein Thema zugeteilt hatte.
 *
 * Die **Nachbereitung** steht überall auf `false`, auch am Lobpreisabend, wo sie
 * am naheliegendsten wäre. Sie ist der einzige Baustein, der nichts vorbereitet
 * und niemanden einteilt — man schaltet ihn dazu, wenn an dem Abend etwas
 * festzuhalten war. Ihn vorzugeben hieße, jeder Gruppe ein leeres Textfeld
 * hinzustellen und daran zu erinnern, dass sie es nicht gefüllt hat.
 */
export function slotDefaults(type: MeetingType): MeetingSlots {
  switch (type) {
    case MeetingType.STANDARD:
      return {
        hasTopicSlot: true,
        hasSongSlot: true,
        hasTestimonySlot: false,
        hasNotesSlot: false,
      };
    case MeetingType.LOBPREIS_GEBET:
      // Kein Thema, dafür ein Testimony — oder auch nur Lieder (CLAUDE.md §5).
      return {
        hasTopicSlot: false,
        hasSongSlot: true,
        hasTestimonySlot: true,
        hasNotesSlot: false,
      };
    case MeetingType.CUSTOM:
      return {
        hasTopicSlot: false,
        hasSongSlot: false,
        hasTestimonySlot: false,
        hasNotesSlot: false,
      };
  }
}

/** Wie ein Slot heißt, wenn man einem Menschen erklärt, was fehlt. */
const SLOT_LABEL: Record<keyof MeetingSlots, string> = {
  hasTopicSlot: 'kein Thema',
  hasSongSlot: 'keine Lieder',
  hasTestimonySlot: 'kein Testimony',
  hasNotesSlot: 'keine Nachbereitung',
};

/**
 * Was **am Termin selbst** hängt, wenn ein Slot abgeschaltet wird.
 *
 * Die Zuordnung steht hier einmal, damit „was darf man schreiben" und „was
 * wird beim Abschalten weggeräumt" nicht auseinanderlaufen können. Genau das
 * ist die Sorte Fehler, die man erst Wochen später bemerkt: ein Feld, das
 * niemand mehr setzen kann, aber noch einen alten Wert trägt.
 *
 * Beim Thema steht hier nichts mehr, und das ist kein Versehen: Zusammenfassung
 * und Actionstep sind an die Einheit gewandert, und die wird beim Abschalten
 * **nicht geleert, sondern gelöst** — `MeetingService` ruft dafür
 * `TopicLinkService.detachIfUpcoming`. Die Vorbereitung bleibt erhalten, nur die
 * Sektion verschwindet.
 *
 * Die **Zuteilung** dagegen fällt, wie bei der Musik. Sie blieb einmal aus
 * Vorsicht stehen, aber an einem Abend ohne Thema ist sie keine geduldige Notiz,
 * sondern eine falsche Aussage: `TopicReminderService` fragt nicht nach
 * `hasTopicSlot` und schickte „Du bist dran mit dem Thema" für einen Abend, an
 * dem keins ist; `AssignmentService` malte denselben Rollen-Chip auf den
 * Startbildschirm. Weggeräumt wird sie — wie die Lieder und die Musik-Zuteilung —
 * in `MeetingService`, weil eine Verknüpfungstabelle kein `data`-Feld hat, das
 * sich leeren ließe. Deshalb bleibt es hier bei einer leeren Liste.
 *
 * Bei der **Nachbereitung** stehen beide Texte, und anders als beim Thema werden
 * sie wirklich geleert. Der Unterschied ist, wem sie gehören: die Einheit trägt
 * die Vorbereitung einer Person über mehrere Abende hinweg und wartet als
 * Entwurf weiter, diese zwei Felder gehören diesem einen Abend. Was hier
 * stünde, nachdem der Baustein weg ist, wäre nicht geduldig, sondern
 * unerreichbar. Die **Haken** darunter räumt `MeetingService` mit weg — sie
 * liegen in einer eigenen Tabelle.
 */
export const SLOT_FIELDS = {
  hasTopicSlot: [],
  hasSongSlot: [],
  hasTestimonySlot: ['testimonyPersonId'],
  hasNotesSlot: ['summaryText', 'actionstepText'],
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
    hasTopicSlot: dto.hasTopicSlot ?? base.hasTopicSlot,
    hasSongSlot: dto.hasSongSlot ?? base.hasSongSlot,
    hasTestimonySlot: dto.hasTestimonySlot ?? base.hasTestimonySlot,
    hasNotesSlot: dto.hasNotesSlot ?? base.hasNotesSlot,
  };
}

/**
 * Zwei Paare, die einander ausschließen — und ein drittes, das es nicht tut.
 *
 * **Thema und Testimony**: beides ist der Beitrag, um den sich der Abend dreht,
 * und zwei davon gibt es nicht. Wer sein Testimony erzählt, bereitet kein Thema
 * vor, und umgekehrt.
 *
 * **Thema und Nachbereitung**: beide tragen Zusammenfassung und Actionstep. Zwei
 * davon an einem Abend wären zwei Antworten auf dieselbe Frage — welche steht
 * dann auf dem Startbildschirm, welche erinnert am Donnerstag?
 *
 * **Testimony und Nachbereitung** stehen bewusst nicht hier. Das ist gerade der
 * Abend, um den es geht: jemand erzählt, die Gruppe nimmt sich danach etwas vor.
 *
 * Getrennt von `assertSlotsAllow`: die eine Regel prüft, ob ein **Feld** zu den
 * Bausteinen passt, diese, ob die Bausteine zueinander passen.
 */
export function assertSlotsExclusive(slots: MeetingSlots): void {
  if (slots.hasTopicSlot && slots.hasTestimonySlot) {
    throw new BadRequestException(
      'Ein Abend hat entweder ein Thema oder ein Testimony — nicht beides',
    );
  }

  if (slots.hasTopicSlot && slots.hasNotesSlot) {
    throw new BadRequestException(
      'Zusammenfassung und Actionstep gehören entweder zum Thema oder zum Abend — nicht zu beidem',
    );
  }
}

/**
 * Die Nachbereitung lässt sich erst ab Terminbeginn dazunehmen.
 *
 * Sie ist der einzige Baustein, der nicht zur **Planung** eines Abends gehört,
 * sondern zu dem, was danach übrig bleibt. Vorher anzubieten hieße, nach einer
 * Zusammenfassung von etwas zu fragen, das noch nicht stattgefunden hat — und im
 * Bausteinkasten neben Thema, Lieder und Testimony stand sie genau dort.
 *
 * Nur der Übergang **aus → an** wird geprüft. Ein PATCH, der den Schalter gar
 * nicht anfasst, darf nicht daran scheitern, und wegnehmen darf man immer:
 * hätte man sich vertan, wäre man sonst damit eingesperrt.
 *
 * Dieselbe Grenze wie beim Abhaken des Actionsteps (`eveningReached`), und
 * gemeint ist die Anfangszeit **nach** dem Aufruf — wer Uhrzeit und Baustein in
 * einem PATCH ändert, meint die neue.
 */
export function assertNotesSlotNotAhead(
  before: MeetingSlots,
  after: MeetingSlots,
  evening: { date: Date; startMinutes: number; zone: string },
  now?: Date,
): void {
  if (before.hasNotesSlot || !after.hasNotesSlot) return;

  if (!eveningReached(evening.date, evening.zone, now, evening.startMinutes)) {
    throw new BadRequestException(
      'Die Nachbereitung gibt es erst, wenn der Abend angefangen hat',
    );
  }
}
