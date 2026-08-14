import { MeetingStatus } from '../../generated/prisma/enums';
import { addDays, currentDay } from '../meeting/meeting-schedule';
import {
  belongsTo,
  isContentVisible,
  isHeld,
  isPubliclyVisible,
  mayDeleteTopic,
  mayEditTopic,
} from './topic-visibility';

/** Die Zone der Gruppe — die Fälle unten sind in Ortszeit gedacht. */
const BERLIN = 'Europe/Berlin';

const OWNER = 'owner-id';
const COLLAB = 'collab-id';
const FREMD = 'fremd-id';

/**
 * Ein Kalendertag, wie Prisma ihn liefert — gezählt **in der Zone der Gruppe**.
 *
 * Stand hier einmal als `Date.UTC(base.getUTCFullYear(), …)`, also aus den
 * UTC-Feldern eines Zeitpunkts. Das ist genau der Fehler, den `currentDay` im
 * Produktionscode behoben hat, und er ist hier auf demselben Weg
 * zurückgekommen: Zwischen Mitternacht und zwei Uhr Berliner Zeit ist in UTC
 * noch gestern. `day(0)` lieferte dann den gestrigen Tag, während `isHeld` mit
 * dem heutigen verglich — „am Termintag selbst noch nicht" schlug fehl, aber
 * nur wenn die Tests in diesem Zwei-Stunden-Fenster liefen.
 *
 * Ein Test, der nachts anders ausgeht als mittags, ist schlimmer als einer, der
 * immer scheitert: er hält die CI für kaputt statt den Code, und man sucht ihn
 * beim nächsten Mal wieder von vorn. Deshalb dieselbe Rechnung wie im Code.
 */
function day(offsetDays: number): Date {
  return addDays(currentDay(BERLIN), offsetDays);
}

function meeting(offsetDays: number, status = MeetingStatus.PLANNED) {
  return { date: day(offsetDays), status };
}

const thema = { ownerPersonId: OWNER, collaboratorIds: [COLLAB] };
const verwaist = { ownerPersonId: null, collaboratorIds: [] };

describe('isHeld', () => {
  it('ohne Termin nie — eine unfertige Einheit ist kein Abend', () => {
    expect(isHeld(null, BERLIN)).toBe(false);
  });

  it('nicht, solange der Termin bevorsteht', () => {
    expect(isHeld(meeting(1), BERLIN)).toBe(false);
  });

  it('am Termintag selbst noch nicht', () => {
    expect(isHeld(meeting(0), BERLIN)).toBe(false);
  });

  it('sobald der Tag vorbei ist', () => {
    expect(isHeld(meeting(-1), BERLIN)).toBe(true);
  });

  it('nicht bei einem abgesagten Abend, auch wenn er vorbei ist', () => {
    expect(isHeld(meeting(-1, MeetingStatus.CANCELLED), BERLIN)).toBe(false);
  });
});

describe('isPubliclyVisible', () => {
  it('nein, solange keine Einheit gehalten wurde', () => {
    expect(
      isPubliclyVisible([{ meeting: meeting(3) }, { meeting: null }], BERLIN),
    ).toBe(false);
  });

  it('ja, sobald eine einzige gehalten wurde', () => {
    expect(
      isPubliclyVisible(
        [{ meeting: meeting(-7) }, { meeting: meeting(3) }],
        BERLIN,
      ),
    ).toBe(true);
  });

  // Spec 5.4: die Prüfung gilt dem Thema, nicht der Einheit. Eine neue Einheit
  // eines schon öffentlichen Themas ist sofort für alle da.
  it('bleibt öffentlich, wenn eine neue Einheit dazukommt', () => {
    expect(
      isPubliclyVisible([{ meeting: meeting(-7) }, { meeting: null }], BERLIN),
    ).toBe(true);
  });

  it('nein bei einem Thema ganz ohne Einheiten', () => {
    expect(isPubliclyVisible([], BERLIN)).toBe(false);
  });
});

describe('belongsTo', () => {
  it.each([
    [OWNER, true],
    [COLLAB, true],
    [FREMD, false],
  ])('%s -> %s', (personId, erwartet) => {
    expect(belongsTo(thema, personId)).toBe(erwartet);
  });
});

describe('mayEditTopic', () => {
  it('Owner und Collaborator dürfen jede Einheit ändern', () => {
    for (const personId of [OWNER, COLLAB]) {
      expect(mayEditTopic({ isAdmin: false, personId, topic: thema })).toBe(
        true,
      );
    }
  });

  it('sonst niemand', () => {
    expect(
      mayEditTopic({ isAdmin: false, personId: FREMD, topic: thema }),
    ).toBe(false);
  });

  it('Admin immer', () => {
    expect(mayEditTopic({ isAdmin: true, personId: FREMD, topic: thema })).toBe(
      true,
    );
  });

  it('an einem verwaisten Thema darf jede:r — sonst bliebe es für immer stehen', () => {
    expect(
      mayEditTopic({ isAdmin: false, personId: FREMD, topic: verwaist }),
    ).toBe(true);
  });
});

describe('mayDeleteTopic', () => {
  it('nur der Owner', () => {
    expect(
      mayDeleteTopic({ isAdmin: false, personId: OWNER, topic: thema }),
    ).toBe(true);
  });

  it('ein Collaborator darf ändern, aber nicht wegräumen', () => {
    expect(
      mayDeleteTopic({ isAdmin: false, personId: COLLAB, topic: thema }),
    ).toBe(false);
  });

  it('Admin darf', () => {
    expect(
      mayDeleteTopic({ isAdmin: true, personId: COLLAB, topic: thema }),
    ).toBe(true);
  });
});

describe('isContentVisible', () => {
  const basis = {
    isAdmin: false,
    personId: FREMD,
    topic: thema,
    assigned: [] as string[],
    zone: BERLIN,
  };

  it('Fremde sehen den Actionstep vor dem Abend nicht', () => {
    expect(isContentVisible({ ...basis, meeting: meeting(1) })).toBe(false);
  });

  it('am Termintag morgens noch nicht', () => {
    const heute = meeting(0);
    const morgens = new Date(heute.date.getTime() + 8 * 60 * 60 * 1000);
    expect(isContentVisible({ ...basis, meeting: heute, now: morgens })).toBe(
      false,
    );
  });

  it('am Termintag ab 18 Uhr Ortszeit schon', () => {
    const heute = meeting(0);
    const abends = new Date(heute.date.getTime() + 20 * 60 * 60 * 1000);
    expect(isContentVisible({ ...basis, meeting: heute, now: abends })).toBe(
      true,
    );
  });

  it('nach dem Abend für alle', () => {
    expect(isContentVisible({ ...basis, meeting: meeting(-1) })).toBe(true);
  });

  it('wer das Thema vorbereitet, sieht es jederzeit', () => {
    expect(
      isContentVisible({ ...basis, personId: COLLAB, meeting: meeting(5) }),
    ).toBe(true);
  });

  it('wer für den Abend zugeteilt ist, ebenfalls — auch ohne zum Thema zu gehören', () => {
    expect(
      isContentVisible({
        ...basis,
        assigned: [FREMD],
        meeting: meeting(5),
      }),
    ).toBe(true);
  });

  it('eine unfertige Einheit bleibt privat', () => {
    expect(isContentVisible({ ...basis, meeting: null })).toBe(false);
  });

  it('ein abgesagter Abend gibt nichts frei', () => {
    expect(
      isContentVisible({
        ...basis,
        meeting: meeting(-1, MeetingStatus.CANCELLED),
      }),
    ).toBe(false);
  });
});
