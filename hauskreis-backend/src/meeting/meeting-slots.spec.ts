/**
 * Die Regeln, die aus dem Termintyp eine Voreinstellung machen.
 *
 * Reine Funktionen, also auch reine Tests: kein Prisma, kein Nest. Was hier
 * steht, ist die eigentliche Fachlichkeit — der Service tut danach nur noch,
 * was hier entschieden wurde.
 */
import { BadRequestException } from '@nestjs/common';
import {
  assertSlotsAllow,
  assertSlotsExclusive,
  clearedByTurningOff,
  resolveSlots,
  EMPTY_SLOTS,
  EVENING_SLOTS,
  PRAISE_SLOTS,
  SLOT_FIELDS,
  type MeetingSlots,
} from './meeting-slots';

/** Kurzschreibweise: welche Bausteine an sind, in fester Reihenfolge. */
const an = (slots: MeetingSlots) =>
  (
    [
      ['topic', slots.hasTopicSlot],
      ['song', slots.hasSongSlot],
      ['testimony', slots.hasTestimonySlot],
      ['notes', slots.hasNotesSlot],
      ['prayer', slots.hasPrayerSlot],
      ['snack', slots.hasSnackSlot],
    ] as const
  )
    .filter(([, on]) => on)
    .map(([name]) => name);

const BELEGUNGEN = [EVENING_SLOTS, PRAISE_SLOTS, EMPTY_SLOTS];

describe('Die drei Belegungen', () => {
  it('gibt einem Hauskreis-Abend Thema und Lieder', () => {
    expect(an(EVENING_SLOTS)).toEqual(['topic', 'song', 'prayer']);
  });

  /** Kein Thema, dafür ein Testimony — oder auch nur Lieder (CLAUDE.md §5). */
  it('tauscht beim Lobpreisabend das Thema gegen ein Testimony', () => {
    expect(an(PRAISE_SLOTS)).toEqual(['song', 'testimony', 'prayer']);
  });

  /**
   * Der Kern der ganzen Sache: ein Geburtstagsabend stand bisher als
   * unvollständig da, weil ihm ein Thema fehlte, das er nie brauchte.
   */
  it('lässt einen selbst angelegten Termin leer', () => {
    // Bis auf die Gebetsanliegen — siehe darunter.
    expect(an(EMPTY_SLOTS)).toEqual(['prayer']);
  });

  /**
   * Der Gegenpol zu den Gebetsanliegen: nirgends vorgegeben. Er ist eine
   * Einladung und kein Abschalten — wer Snacks will, hakt sie einmal an, in der
   * Verwaltung oder am einzelnen Abend.
   */
  it('gibt Snacks nirgends vor', () => {
    for (const slots of BELEGUNGEN) {
      expect(slots.hasSnackSlot).toBe(false);
    }
  });

  /**
   * Der einzige Baustein, der überall an ist, und der einzige, der niemanden
   * einteilt: Ein Anliegen bringt jede:r für sich mit, auch am Geburtstag und
   * auch, wenn er an dem Abend fehlt.
   */
  it('gibt die Gebetsanliegen überall vor', () => {
    for (const slots of BELEGUNGEN) {
      expect(slots.hasPrayerSlot).toBe(true);
    }
  });

  /** Und er schließt nichts aus — nicht einmal das Thema. */
  it('verträgt sich mit jedem anderen Baustein', () => {
    expect(() =>
      assertSlotsExclusive({
        hasTopicSlot: true,
        hasSongSlot: true,
        hasTestimonySlot: false,
        hasNotesSlot: false,
        hasPrayerSlot: true,
        hasSnackSlot: true,
      }),
    ).not.toThrow();
  });

  /** Dasselbe für die Snacks: Kuchen gibt es am Themenabend wie am Geburtstag. */
  it('lässt Snacks neben jedem anderen Baustein zu', () => {
    expect(() =>
      assertSlotsExclusive({ ...PRAISE_SLOTS, hasSnackSlot: true }),
    ).not.toThrow();
    expect(() =>
      assertSlotsExclusive({ ...EVENING_SLOTS, hasSnackSlot: true }),
    ).not.toThrow();
  });

  /**
   * Auch am Lobpreisabend, wo sie am naheliegendsten wäre: die Nachbereitung ist
   * der einzige Baustein, der nichts vorbereitet und niemanden einteilt. Sie
   * vorzugeben hieße, jeder Gruppe ein leeres Textfeld hinzustellen und daran zu
   * erinnern, dass sie es nicht gefüllt hat.
   */
  it('gibt die Nachbereitung nirgends vor', () => {
    for (const slots of BELEGUNGEN) {
      expect(slots.hasNotesSlot).toBe(false);
    }
  });
});

describe('assertSlotsAllow', () => {
  const leer = EMPTY_SLOTS;

  it('weist ein Testimony an einem Termin ohne Testimony-Baustein ab', () => {
    expect(() => assertSlotsAllow(leer, { testimonyPersonId: 'p1' })).toThrow(
      BadRequestException,
    );
  });

  it('nennt in der Meldung, was fehlt', () => {
    expect(() => assertSlotsAllow(leer, { testimonyPersonId: 'p1' })).toThrow(
      /kein Testimony/,
    );
  });

  /**
   * Ein Gastgeber braucht keinen Baustein mehr — man trifft sich immer
   * irgendwo. Ohne diesen Test wäre nicht festgehalten, dass das Absicht ist.
   */
  it('lässt einen Gastgeber überall zu', () => {
    expect(() =>
      assertSlotsAllow(leer, { hostPersonId: 'p1', locationId: 'l1' }),
    ).not.toThrow();
  });

  /** Sonst scheiterte ein PATCH mit dem Info-Text an einem fremden Feld. */
  it('lässt weggelassene Felder durch', () => {
    expect(() =>
      assertSlotsAllow(leer, { infoText: 'Bringt Kuchen mit' }),
    ).not.toThrow();
  });

  /** Aufräumen darf man immer — und beim Abschalten tun wir selbst genau das. */
  it('lässt ein ausdrückliches null durch', () => {
    expect(() =>
      assertSlotsAllow(leer, { testimonyPersonId: null }),
    ).not.toThrow();
  });

  it('lässt alles zu, was der Baustein deckt', () => {
    expect(() =>
      assertSlotsAllow(PRAISE_SLOTS, {
        testimonyPersonId: 'p1',
        hostPersonId: 'p1',
      }),
    ).not.toThrow();
  });

  /**
   * Das Thema hat am Termin selbst kein Feld mehr — Zuteilung und Einheit
   * liegen in eigenen Tabellen und werden über eigene Routen geschrieben. Ein
   * `PATCH` am Termin kann hier also gar nichts mehr verletzen; abgewiesen wird
   * das Zuteilen stattdessen in `TopicSessionService.setResponsibles`.
   */
  it('hat für das Thema nichts mehr zu prüfen', () => {
    expect(SLOT_FIELDS.hasTopicSlot).toEqual([]);
  });

  /**
   * Die Nachbereitung dagegen hat zwei eigene Felder am Termin. Ohne diese Regel
   * ließe sich an einem Abend mit Thema ein zweiter Actionstep hineinschreiben —
   * genau das, was der gegenseitige Ausschluss verhindern soll.
   */
  it('weist Nachbereitungs-Texte ohne den Baustein ab', () => {
    expect(() =>
      assertSlotsAllow(leer, { summaryText: 'Wir haben über …' }),
    ).toThrow(/keine Nachbereitung/);

    expect(() =>
      assertSlotsAllow(leer, { actionstepText: 'Jeden Tag zehn Minuten' }),
    ).toThrow(BadRequestException);
  });

  it('lässt sie zu, wenn der Baustein an ist', () => {
    expect(() =>
      assertSlotsAllow(
        { ...leer, hasNotesSlot: true },
        { summaryText: 'Wir haben über …', actionstepText: 'Anrufen' },
      ),
    ).not.toThrow();
  });
});

describe('clearedByTurningOff', () => {
  const alles = EVENING_SLOTS;
  const mitTestimony = PRAISE_SLOTS;

  it('leert die Felder eines abgeschalteten Bausteins', () => {
    const cleared = clearedByTurningOff(mitTestimony, {
      ...mitTestimony,
      hasTestimonySlot: false,
    });

    expect(cleared).toEqual({ testimonyPersonId: null });
  });

  /** Ein `null` mehr wäre eine Schreiboperation samt Versionssprung. */
  it('schweigt über Bausteine, die schon aus waren', () => {
    const aus = { ...alles, hasTopicSlot: false };

    expect(clearedByTurningOff(aus, aus)).toEqual({});
  });

  it('schweigt beim Dazuschalten', () => {
    const aus = { ...alles, hasTopicSlot: false };

    expect(clearedByTurningOff(aus, alles)).toEqual({});
  });

  /**
   * Beide Texte, und anders als beim Thema wirklich geleert: sie gehören diesem
   * einen Abend. Was hier stünde, nachdem der Baustein weg ist, wäre nicht
   * geduldig, sondern unerreichbar.
   */
  it('leert Zusammenfassung und Actionstep des Abends', () => {
    const mitNotizen = { ...alles, hasTopicSlot: false, hasNotesSlot: true };

    expect(
      clearedByTurningOff(mitNotizen, { ...mitNotizen, hasNotesSlot: false }),
    ).toEqual({ summaryText: null, actionstepText: null });
  });
});

describe('resolveSlots', () => {
  it('lässt alles stehen, wenn nichts mitkommt', () => {
    expect(resolveSlots(EMPTY_SLOTS, {})).toEqual(EMPTY_SLOTS);
  });

  it('bucht einen einzelnen Baustein dazu', () => {
    expect(an(resolveSlots(EMPTY_SLOTS, { hasSongSlot: true }))).toEqual([
      'song',
      'prayer',
    ]);
  });

  /**
   * Hier stand einmal ein zweiter Zweig: Ein Wechsel der Terminart setzte alle
   * Schalter auf deren Voreinstellung zurück. Mit der Terminart ist er weg —
   * und war schon davor toter Code, denn eine Oberfläche, die den Typ ändert,
   * gab es nie.
   */
  it('nimmt nichts weg, was nicht ausdrücklich weggenommen wird', () => {
    const gebucht = { ...EMPTY_SLOTS, hasTopicSlot: true, hasSongSlot: true };

    expect(an(resolveSlots(gebucht, { hasSongSlot: false }))).toEqual([
      'topic',
      'prayer',
    ]);
  });
});

describe('assertSlotsExclusive', () => {
  /**
   * Beides ist der Beitrag, um den sich der Abend dreht, und zwei davon gibt
   * es nicht. Bisher ließ sich beides zugleich anschalten — der Abend stand
   * dann mit zwei Rollen da, von denen eine nie stattfinden würde.
   */
  it('weist Thema und Testimony am selben Abend ab', () => {
    expect(() =>
      assertSlotsExclusive({
        hasTopicSlot: true,
        hasSongSlot: false,
        hasTestimonySlot: true,
        hasNotesSlot: false,
      }),
    ).toThrow(BadRequestException);
  });

  /**
   * Beide tragen Zusammenfassung und Actionstep. Zwei davon wären zwei Antworten
   * auf dieselbe Frage — welche stünde dann auf dem Startbildschirm?
   */
  it('weist Thema und Nachbereitung am selben Abend ab', () => {
    expect(() =>
      assertSlotsExclusive({
        hasTopicSlot: true,
        hasSongSlot: true,
        hasTestimonySlot: false,
        hasNotesSlot: true,
      }),
    ).toThrow(/entweder zum Thema oder zum Abend/);
  });

  /**
   * Und genau dieses Paar **nicht**: der Lobpreisabend, an dem jemand erzählt
   * und die Gruppe sich danach etwas vornimmt, ist der Abend, um den es geht.
   */
  it('lässt Testimony und Nachbereitung zusammen zu', () => {
    expect(() =>
      assertSlotsExclusive({
        hasTopicSlot: false,
        hasSongSlot: true,
        hasTestimonySlot: true,
        hasNotesSlot: true,
      }),
    ).not.toThrow();
  });

  it('lässt jedes von beiden für sich zu', () => {
    expect(() => assertSlotsExclusive(EVENING_SLOTS)).not.toThrow();
    expect(() => assertSlotsExclusive(PRAISE_SLOTS)).not.toThrow();
  });

  /** Ein Geburtstagsabend hat weder das eine noch das andere. */
  it('lässt einen Abend ohne beides zu', () => {
    expect(() => assertSlotsExclusive(EMPTY_SLOTS)).not.toThrow();
  });
});
