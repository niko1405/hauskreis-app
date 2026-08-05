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
  clearedByTurningOff,
  resolveSlots,
  slotDefaults,
  type MeetingSlots,
} from './meeting-slots';
import { MeetingType } from '../../generated/prisma/enums';

/** Kurzschreibweise: welche Bausteine an sind, in fester Reihenfolge. */
const an = (slots: MeetingSlots) =>
  (
    [
      ['host', slots.hasHostSlot],
      ['topic', slots.hasTopicSlot],
      ['song', slots.hasSongSlot],
      ['testimony', slots.hasTestimonySlot],
    ] as const
  )
    .filter(([, on]) => on)
    .map(([name]) => name);

describe('slotDefaults', () => {
  it('gibt einem Hauskreis-Abend Gastgeber, Thema und Lieder', () => {
    expect(an(slotDefaults(MeetingType.STANDARD))).toEqual([
      'host',
      'topic',
      'song',
    ]);
  });

  /** Kein Thema, dafür ein Testimony — oder auch nur Lieder (CLAUDE.md §5). */
  it('tauscht beim Lobpreisabend das Thema gegen ein Testimony', () => {
    expect(an(slotDefaults(MeetingType.LOBPREIS_GEBET))).toEqual([
      'host',
      'song',
      'testimony',
    ]);
  });

  /**
   * Der Kern der ganzen Sache: ein Geburtstagsabend stand bisher als
   * unvollständig da, weil ihm ein Thema fehlte, das er nie brauchte.
   */
  it('lässt einen besonderen Termin leer', () => {
    expect(an(slotDefaults(MeetingType.CUSTOM))).toEqual([]);
  });
});

describe('assertSlotsAllow', () => {
  const leer = slotDefaults(MeetingType.CUSTOM);

  it('weist ein Thema an einem Termin ohne Themen-Baustein ab', () => {
    expect(() => assertSlotsAllow(leer, { topicId: 't1' })).toThrow(
      BadRequestException,
    );
  });

  it('nennt in der Meldung, was fehlt', () => {
    expect(() => assertSlotsAllow(leer, { hostPersonId: 'p1' })).toThrow(
      /keinen Gastgeber/,
    );
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
      assertSlotsAllow(leer, { topicId: null, hostPersonId: null }),
    ).not.toThrow();
  });

  it('lässt alles zu, was der Baustein deckt', () => {
    expect(() =>
      assertSlotsAllow(slotDefaults(MeetingType.STANDARD), {
        topicId: 't1',
        hostPersonId: 'p1',
        summaryText: 'War schön',
      }),
    ).not.toThrow();
  });
});

describe('clearedByTurningOff', () => {
  const alles = slotDefaults(MeetingType.STANDARD);

  it('leert die Felder eines abgeschalteten Bausteins', () => {
    const cleared = clearedByTurningOff(alles, {
      ...alles,
      hasTopicSlot: false,
    });

    expect(cleared).toEqual({
      topicId: null,
      actionstepText: null,
      summaryText: null,
    });
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
});

describe('resolveSlots', () => {
  const custom = {
    ...slotDefaults(MeetingType.CUSTOM),
    type: MeetingType.CUSTOM,
  };

  it('lässt alles stehen, wenn nichts mitkommt', () => {
    expect(resolveSlots(custom, {})).toEqual(slotDefaults(MeetingType.CUSTOM));
  });

  it('bucht einen einzelnen Baustein dazu', () => {
    expect(an(resolveSlots(custom, { hasSongSlot: true }))).toEqual(['song']);
  });

  /**
   * Wer aus einem Geburtstag wieder einen Hauskreis-Abend macht, meint einen
   * ganzen Abend und nicht ein leeres Gerüst mit neuem Namen.
   */
  it('setzt beim Wechsel der Terminart auf deren Voreinstellung', () => {
    expect(an(resolveSlots(custom, { type: MeetingType.STANDARD }))).toEqual([
      'host',
      'topic',
      'song',
    ]);
  });

  it('lässt einen mitgeschickten Schalter auch dabei gewinnen', () => {
    const slots = resolveSlots(custom, {
      type: MeetingType.STANDARD,
      hasTopicSlot: false,
    });

    expect(an(slots)).toEqual(['host', 'song']);
  });

  /** Derselbe Typ noch einmal ist kein Wechsel und setzt nichts zurück. */
  it('rührt nichts an, wenn die Terminart gleich bleibt', () => {
    const gebucht = { ...custom, hasSongSlot: true };

    expect(an(resolveSlots(gebucht, { type: MeetingType.CUSTOM }))).toEqual([
      'song',
    ]);
  });
});
