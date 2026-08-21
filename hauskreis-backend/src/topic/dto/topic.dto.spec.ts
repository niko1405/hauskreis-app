import { chooseTopicSessionSchema } from './topic.dto';

const UUID = '4a3f1c2e-7b5d-4e8a-9f10-2c3d4e5f6a7b';

const geht = (input: Record<string, unknown>) =>
  chooseTopicSessionSchema.safeParse(input).success;

/**
 * Die Wahl am Abend — fünf Wege durch ein flaches Objekt.
 *
 * Ein `superRefine` statt einer `discriminatedUnion`, weil `createZodDto` einen
 * Objekttyp mit bekannten Feldern braucht. Die Genauigkeit steht damit in der
 * Prüfung statt im Typ, und genau deshalb steht sie auch hier.
 */
describe('chooseTopicSessionSchema', () => {
  describe('der Titel der Einheit', () => {
    /**
     * Er war einmal überall optional, und in jeder Liste stand danach „Einheit
     * ohne Titel". Die beiden anderen Anlege-Wege verlangen ihn längst.
     */
    it('fehlt bei einer einzelnen Einheit nicht', () => {
      expect(geht({ mode: 'single' })).toBe(false);
      expect(geht({ mode: 'single', title: 'Der Abend' })).toBe(true);
    });

    it('und bei einem neuen Thema auch nicht', () => {
      expect(geht({ mode: 'new', topicTitle: 'Hoffnung' })).toBe(false);
    });

    /** `resume` hängt eine bestehende Einheit um — die hat ihren Titel schon. */
    it('wird beim Wiederaufnehmen nicht verlangt', () => {
      expect(geht({ mode: 'resume', sessionId: UUID })).toBe(true);
    });
  });

  describe('der Titel des Themas', () => {
    it('ist bei einem neuen Thema Pflicht', () => {
      expect(geht({ mode: 'new', title: 'Der Abend' })).toBe(false);
      expect(
        geht({ mode: 'new', topicTitle: 'Hoffnung', title: 'Der Abend' }),
      ).toBe(true);
    });

    it('und beim Überthema ebenso', () => {
      expect(geht({ mode: 'promote', sessionId: UUID, title: 'Teil 2' })).toBe(
        false,
      );
      expect(
        geht({
          mode: 'promote',
          sessionId: UUID,
          topicTitle: 'Hoffnung',
          title: 'Teil 2',
        }),
      ).toBe(true);
    });
  });

  /**
   * Nur bei `new`. Beim Überthema steht schon eine Einheit, und was über beide
   * hinweg gilt, schreibt man, wenn man beide kennt — ein Feld, das anderswo
   * still verschluckt würde, wird stattdessen abgewiesen.
   */
  it('nimmt die Themen-Zusammenfassung nur beim neuen Thema', () => {
    expect(
      geht({
        mode: 'new',
        topicTitle: 'Hoffnung',
        title: 'Der Abend',
        topicSummaryText: 'Vier Abende darüber.',
      }),
    ).toBe(true);

    expect(
      geht({
        mode: 'single',
        title: 'Der Abend',
        topicSummaryText: 'Vier Abende darüber.',
      }),
    ).toBe(false);
  });

  it('verlangt weiterhin topicId bei einem bestehenden Thema', () => {
    expect(geht({ mode: 'existing', title: 'Teil 3' })).toBe(false);
    expect(geht({ mode: 'existing', topicId: UUID, title: 'Teil 3' })).toBe(
      true,
    );
  });
});
