/**
 * Welcher der beiden Actionsteps eines Abends gilt.
 *
 * Seit es die Nachbereitung gibt, kann der Text an zwei Stellen stehen. Der
 * interessante Fall ist der letzte: **beide** gefüllt. Er ist kein Widerspruch,
 * sondern ein Rest — ein vergangener Abend behält seine Einheit auch dann, wenn
 * der Baustein danach abgeschaltet wurde.
 */
import { actionstepOf, latestActionstep } from './actionstep-source';

describe('actionstepOf', () => {
  it('nimmt den Text der Einheit, wenn der Abend ein Thema hat', () => {
    expect(
      actionstepOf({
        hasTopicSlot: true,
        actionstepText: null,
        topicSession: { actionstepText: 'Jeden Tag zehn Minuten still werden' },
      }),
    ).toBe('Jeden Tag zehn Minuten still werden');
  });

  it('nimmt den Text des Abends, wenn er keins hat', () => {
    expect(
      actionstepOf({
        hasTopicSlot: false,
        actionstepText: 'Diese Woche jemanden anrufen',
        topicSession: null,
      }),
    ).toBe('Diese Woche jemanden anrufen');
  });

  /**
   * Ein `??` würde hier den Themen-Text ausspielen, obwohl der Abend längst
   * keins mehr hat. Der Baustein entscheidet, nicht die Reihenfolge.
   */
  it('entscheidet bei zwei Texten am Baustein', () => {
    const beides = {
      actionstepText: 'vom Abend',
      topicSession: { actionstepText: 'vom Thema' },
    };

    expect(actionstepOf({ ...beides, hasTopicSlot: true })).toBe('vom Thema');
    expect(actionstepOf({ ...beides, hasTopicSlot: false })).toBe('vom Abend');
  });

  it('zählt einen leeren Text als keinen', () => {
    expect(
      actionstepOf({
        hasTopicSlot: false,
        actionstepText: '   ',
        topicSession: null,
      }),
    ).toBeNull();
  });

  it('kommt ohne Einheit und ohne Text zurecht', () => {
    expect(
      actionstepOf({
        hasTopicSlot: true,
        actionstepText: null,
        topicSession: null,
      }),
    ).toBeNull();
  });
});

/**
 * Welcher Vorsatz **diese Woche** gilt.
 *
 * Die Regel gehört hierher und nicht zweimal in die Aufrufer: Startbildschirm
 * und wöchentliche Erinnerung stellen dieselbe Frage, und beantworteten sie sie
 * verschieden, stünde in der App ein anderer Vorsatz als in der
 * Benachrichtigung.
 */
const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const prisma = (meetings: unknown[]) =>
  ({
    meeting: { findMany: jest.fn().mockResolvedValue(meetings) },
  }) as never;

describe('latestActionstep', () => {
  const HEUTE = utc('2026-08-12');

  const abend = (over: Record<string, unknown>) => ({
    id: 'm',
    date: utc('2026-08-11'),
    generated: true,
    hasTopicSlot: false,
    actionstepText: null,
    topicSession: null,
    actionstepDone: [],
    ...over,
  });

  it('nimmt den vom letzten Abend', async () => {
    const result = await latestActionstep(
      prisma([abend({ actionstepText: 'Jeden Tag lesen' })]),
      'hk-1',
      HEUTE,
    );

    expect(result).toMatchObject({ id: 'm', text: 'Jeden Tag lesen' });
  });

  /**
   * Der eigentliche Grund für diese Funktion: Vorher wurde „der jüngste
   * vergangene Abend, *der einen hat*" gesucht — ein leerer Dienstag wurde
   * übersprungen, und der Vorsatz von vorletzter Woche stand eine Woche zu lang
   * da, als wäre er frisch.
   */
  it('endet, wenn der letzte Abend keinen hatte', async () => {
    const result = await latestActionstep(
      prisma([
        abend({ id: 'leer' }),
        abend({ id: 'alt', actionstepText: 'Alter Vorsatz' }),
      ]),
      'hk-1',
      HEUTE,
    );

    expect(result).toBeNull();
  });

  /**
   * Der selbst angelegte Termin ist die Ausnahme: Zwischen zwei Dienstagen
   * einen Geburtstag zu feiern beendet nicht, was man sich am Dienstag
   * vorgenommen hat.
   */
  it('überspringt einen selbst angelegten Termin ohne Actionstep', async () => {
    const result = await latestActionstep(
      prisma([
        abend({ id: 'geburtstag', generated: false }),
        abend({ id: 'dienstag', actionstepText: 'Jeden Tag lesen' }),
      ]),
      'hk-1',
      HEUTE,
    );

    expect(result).toMatchObject({ id: 'dienstag' });
  });

  /** Bringt er selbst einen mit, gilt er wie jeder andere Abend. */
  it('nimmt den eines selbst angelegten Termins, wenn er einen hat', async () => {
    const result = await latestActionstep(
      prisma([
        abend({
          id: 'freizeit',
          generated: false,
          actionstepText: 'Still sein',
        }),
        abend({ id: 'dienstag', actionstepText: 'Jeden Tag lesen' }),
      ]),
      'hk-1',
      HEUTE,
    );

    expect(result).toMatchObject({ id: 'freizeit' });
  });

  it('behandelt einen leeren Text wie keinen', async () => {
    const result = await latestActionstep(
      prisma([abend({ actionstepText: '   ' })]),
      'hk-1',
      HEUTE,
    );

    expect(result).toBeNull();
  });

  it('antwortet mit nichts, wenn die Gruppe noch nie getroffen hat', async () => {
    expect(await latestActionstep(prisma([]), 'hk-1', HEUTE)).toBeNull();
  });
});
