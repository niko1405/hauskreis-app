/**
 * Welcher der beiden Actionsteps eines Abends gilt.
 *
 * Seit es die Nachbereitung gibt, kann der Text an zwei Stellen stehen. Der
 * interessante Fall ist der letzte: **beide** gefüllt. Er ist kein Widerspruch,
 * sondern ein Rest — ein vergangener Abend behält seine Einheit auch dann, wenn
 * der Baustein danach abgeschaltet wurde.
 */
import { actionstepOf } from './actionstep-source';

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
