/**
 * Woraus ein Abend besteht.
 *
 * Sechs Schalter am Termin, und sie sagen es als Einzige. Eine Terminart
 * daneben gibt es nicht; wie ein Abend heißt, ergibt sich aus den Schaltern.
 *
 * **Alle sechs plant man.** Auch die Nachbereitung: Ob ein Abend eine hat,
 * entscheidet sich vorher, wie bei den anderen — geschrieben wird sie erst ab
 * Terminbeginn, und erst dann fragt die App danach. Früher kam sie nur über
 * diesen Hinweis dazu, und dann stand er an jedem Abend ohne Thema, auch an
 * denen, die keine brauchen.
 *
 * **Einen Gastgeber-Schalter gibt es nicht.** Man trifft sich immer irgendwo;
 * ein Schalter, der nie aus darf, ist keiner. Dass an einem Abend *niemand*
 * gastgebend eingetragen ist — das Treffen im Schlosspark — bleibt davon
 * unberührt: das ist ein leeres Feld, kein abgeschalteter Baustein.
 *
 * Reine Funktionen, kein Dienst: die Regeln kennen keine Datenbank und lassen
 * sich so an jeder Stelle prüfen, an der sie gelten — im Service, im Generator
 * und im Test.
 */
import { BadRequestException } from '@nestjs/common';

export interface MeetingSlots {
  hasTopicSlot: boolean;
  hasSongSlot: boolean;
  hasTestimonySlot: boolean;
  /**
   * Zusammenfassung und Actionstep **ohne** Thema.
   *
   * Ein Lobpreisabend, an dem die Gruppe sich etwas für die Woche vornimmt,
   * hat keine Einheit — der Vorsatz entsteht dort aber genauso.
   *
   * Geplant wie die übrigen: An heißt „an diesem Abend wird etwas
   * festgehalten", und ab Terminbeginn steht dann der Hinweis da, der danach
   * fragt. Von Hand angelegte Abende haben sie nicht, erzeugte ohne Thema
   * schon (`PRAISE_SLOTS`). Neben einem Thema gibt es sie nie
   * (`assertSlotsExclusive`).
   */
  hasNotesSlot: boolean;
  /**
   * Wofür die Gruppe an dem Abend beten will — je Person ein Anliegen.
   *
   * Der Nachzügler nach der Nachbereitung, und der einzige Baustein, der
   * **überall voreingestellt an** ist. Er kam dazu, weil die Gebetsanliegen der
   * letzte Abschnitt eines Termins ohne Schalter waren: Sie standen an jedem
   * Abend, auch am Geburtstag und an der Freizeit.
   *
   * Er teilt niemanden ein und schließt nichts aus — ein Anliegen bringt jede:r
   * für sich mit, auch wer an dem Abend fehlt.
   */
  hasPrayerSlot: boolean;
  /**
   * Wer an dem Abend etwas zu essen mitbringt.
   *
   * Der einzige Baustein, der **überall voreingestellt aus** ist — auch in den
   * erzeugten Belegungen. Er ist eine Einladung und kein Abschalten: Eine
   * Gruppe, die nie über Essen gesprochen hat, bekäme sonst an jedem Dienstag
   * eine offene Zuständigkeit, nach der niemand gefragt hat. Ob der
   * Terminplaner ihn vorbelegt, sagt `meeting_schedule_config.snack_slot`.
   *
   * Schließt nichts aus, wie die Gebetsanliegen: Kuchen gibt es am Themenabend
   * wie am Lobpreisabend wie am Geburtstag.
   */
  hasSnackSlot: boolean;
}

/**
 * Die drei Belegungen, mit denen ein Abend anfängt.
 *
 * Die **Nachbereitung** hat nur der Lobpreisabend: Am Themenabend tragen
 * Zusammenfassung und Actionstep die Einheit, und ein von Hand angelegter
 * Abend — ein Geburtstag, eine Freizeit — braucht meistens keine. Wer doch
 * eine will, hakt sie an.
 *
 * Die **Gebetsanliegen** stehen überall auf `true`, als einzige. Auch ein
 * Geburtstag muss nichts erfüllen — aber beten kann man an ihm genauso, und
 * dieser Baustein verlangt von niemandem etwas.
 */
export const EVENING_SLOTS: MeetingSlots = {
  hasTopicSlot: true,
  hasSongSlot: true,
  hasTestimonySlot: false,
  hasNotesSlot: false,
  hasPrayerSlot: true,
  hasSnackSlot: false,
};

/**
 * Kein Thema, dafür ein Testimony — oder auch nur Lieder (CLAUDE.md §5).
 *
 * Das Testimony nimmt der Terminplaner wieder heraus, wenn die Gruppe es
 * abgeschaltet hat (`meeting_schedule_config.testimony`).
 */
export const PRAISE_SLOTS: MeetingSlots = {
  hasTopicSlot: false,
  hasSongSlot: true,
  hasTestimonySlot: true,
  hasNotesSlot: true,
  hasPrayerSlot: true,
  hasSnackSlot: false,
};

/**
 * Womit ein von Hand angelegter Abend startet: mit nichts.
 *
 * Das ist der Kern der Sache. Ein besonderer Termin muss nichts erfüllen, und
 * ihm Thema und Lieder aufzudrängen hieße, dass ein Geburtstagsabend als
 * unvollständig dasteht, solange niemand ein Thema zugeteilt hat.
 */
export const EMPTY_SLOTS: MeetingSlots = {
  hasTopicSlot: false,
  hasSongSlot: false,
  hasTestimonySlot: false,
  hasNotesSlot: false,
  hasPrayerSlot: true,
  hasSnackSlot: false,
};

/** Wie ein Slot heißt, wenn man einem Menschen erklärt, was fehlt. */
const SLOT_LABEL: Record<keyof MeetingSlots, string> = {
  hasTopicSlot: 'kein Thema',
  hasSongSlot: 'keine Lieder',
  hasTestimonySlot: 'kein Testimony',
  hasNotesSlot: 'keine Nachbereitung',
  hasPrayerSlot: 'keine Gebetsanliegen',
  hasSnackSlot: 'keine Snacks',
};

/**
 * Was **am Termin selbst** hängt, wenn ein Slot abgeschaltet wird.
 *
 * Die Zuordnung steht hier einmal, damit „was darf man schreiben" und „was
 * wird beim Abschalten weggeräumt" nicht auseinanderlaufen können. Genau das
 * ist die Sorte Fehler, die man erst Wochen später bemerkt: ein Feld, das
 * niemand mehr setzen kann, aber noch einen alten Wert trägt.
 *
 * Beim Thema steht hier nichts, und das ist kein Versehen: Zusammenfassung und
 * Actionstep stehen an der Einheit, und die wird beim Abschalten
 * **nicht geleert, sondern gelöst** — `MeetingService` ruft dafür
 * `TopicLinkService.detach`, und zwar mit `evenIfPast`: Den Baustein
 * wegzunehmen ist die ausdrückliche Aussage „der Abend hatte kein Thema", auch
 * rückwirkend. Die Vorbereitung bleibt erhalten, nur die Sektion verschwindet.
 *
 * Die **Zuteilung** dagegen fällt, wie bei der Musik: An einem Abend ohne
 * Thema wäre sie eine falsche Aussage — `TopicReminderService` fragt nicht
 * nach `hasTopicSlot` und schickte „Du bist dran mit dem Thema", und
 * `AssignmentService` malte denselben Rollen-Chip auf den Startbildschirm.
 * Weggeräumt wird sie — wie die Lieder und die Musik-Zuteilung —
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
  // Wie bei den Liedern: Die Anliegen liegen in einer eigenen Tabelle, und die
  // hat kein `data`-Feld, das sich hier leeren ließe. Weggeräumt werden sie in
  // `MeetingService.update`.
  hasPrayerSlot: [],
  // Und wie bei der Musik: Wer etwas mitbringt, steht in
  // `meeting_snack_responsible`, nicht in einer Spalte am Termin.
  hasSnackSlot: [],
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
 * Mitgeschickte Schalter gewinnen, weggelassene bleiben stehen — mehr ist es
 * nicht.
 */
export function resolveSlots(
  before: MeetingSlots,
  dto: Partial<MeetingSlots>,
): MeetingSlots {
  return {
    hasTopicSlot: dto.hasTopicSlot ?? before.hasTopicSlot,
    hasSongSlot: dto.hasSongSlot ?? before.hasSongSlot,
    hasTestimonySlot: dto.hasTestimonySlot ?? before.hasTestimonySlot,
    hasNotesSlot: dto.hasNotesSlot ?? before.hasNotesSlot,
    hasPrayerSlot: dto.hasPrayerSlot ?? before.hasPrayerSlot,
    hasSnackSlot: dto.hasSnackSlot ?? before.hasSnackSlot,
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
 * **Die Gebetsanliegen stehen ebenfalls nicht hier**, und zwar gegen keinen:
 * Sie sind kein Beitrag, um den sich ein Abend dreht, sondern etwas, das jede:r
 * für sich mitbringt.
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
 * Das Testimony gibt es nur, solange die Gruppe es hat
 * (`meeting_schedule_config.testimony`).
 *
 * Nur der Übergang **aus → an** wird geprüft, wie beim Anlegen (dort ist
 * `before` die leere Belegung): Ein vergangener Abend, der eines hatte, bleibt
 * lesbar, nachzutragen und abzuschalten — was gewesen ist, schreibt ein
 * Schalter in der Verwaltung nicht um.
 */
export function assertTestimonyAvailable(
  before: MeetingSlots,
  after: MeetingSlots,
  enabled: boolean,
): void {
  if (enabled || before.hasTestimonySlot || !after.hasTestimonySlot) return;

  throw new BadRequestException(
    'Testimony ist in eurer Gruppe abgeschaltet — in der Verwaltung lässt es sich wieder einschalten',
  );
}
