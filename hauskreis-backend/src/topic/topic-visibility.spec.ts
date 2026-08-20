import { MeetingStatus } from '../../generated/prisma/enums';
import { addDays, currentDay } from '../meeting/meeting-schedule';
import {
  belongsTo,
  isContentVisible,
  isHeld,
  isPubliclyVisible,
  mayDeleteSession,
  mayDeleteTopic,
  mayEditSession,
  mayEditTopic,
  preparesSession,
} from './topic-visibility';

/** Die Zone der Gruppe — die Fälle unten sind in Ortszeit gedacht. */
const BERLIN = 'Europe/Berlin';

const OWNER = 'owner-id';
const COLLAB = 'collab-id';
const FREMD = 'fremd-id';
/** Steht an *einer* Einheit, gehört zum Thema aber nicht. */
const CREW = 'crew-id';

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

/**
 * Die zweite Ebene — **eine** Einheit, nämlich die, die man vorbereitet.
 *
 * Der Grund für sie: Wer einmal an einem Abend aushilft, soll ihn schreiben
 * können, ohne dafür Hoheit über ein Thema zu bekommen, das über Monate läuft.
 */
describe('mayEditSession', () => {
  const darf = (personId: string, responsibleIds: string[] = [CREW]) =>
    mayEditSession({ isAdmin: false, personId, topic: thema, responsibleIds });

  it('lässt den Owner ran', () => {
    expect(darf(OWNER)).toBe(true);
  });

  it('lässt die Mitarbeitenden am Thema ran', () => {
    expect(darf(COLLAB)).toBe(true);
  });

  it('lässt ran, wer diese Einheit vorbereitet', () => {
    expect(darf(CREW)).toBe(true);
  });

  it('lässt Fremde nicht ran', () => {
    expect(darf(FREMD)).toBe(false);
  });

  /** Die Crew der *anderen* Einheit hilft hier nicht — das Recht ist je Abend. */
  it('zählt nur die Crew dieser einen Einheit', () => {
    expect(darf(CREW, [])).toBe(false);
  });

  it('lässt den Admin ran', () => {
    expect(
      mayEditSession({
        isAdmin: true,
        personId: FREMD,
        topic: thema,
        responsibleIds: [],
      }),
    ).toBe(true);
  });

  it('lässt bei einem verwaisten Thema jede:n ran', () => {
    expect(
      mayEditSession({
        isAdmin: false,
        personId: FREMD,
        topic: verwaist,
        responsibleIds: [],
      }),
    ).toBe(true);
  });
});

/**
 * Dasselbe ohne die beiden Freifahrtscheine — „gehört dazu" statt „darf hinein".
 *
 * `TopicLinkService.reconcile` fragt so und nicht anders: Zählte der Admin mit,
 * hielte allein seine Zuteilung jede Einheit an jedem Abend fest, und die Regel
 * „entkoppeln, wenn keiner der Zuständigen sie vorbereitet" liefe in einer
 * Gruppe mit einem Admin praktisch nie.
 */
describe('preparesSession', () => {
  it('zählt Owner, Mitarbeit und Crew', () => {
    for (const personId of [OWNER, COLLAB, CREW]) {
      expect(
        preparesSession({ personId, topic: thema, responsibleIds: [CREW] }),
      ).toBe(true);
    }
  });

  it('zählt Fremde nicht', () => {
    expect(
      preparesSession({
        personId: FREMD,
        topic: thema,
        responsibleIds: [CREW],
      }),
    ).toBe(false);
  });

  /** Der Unterschied zu `mayEditSession`, festgehalten. */
  it('macht aus einem verwaisten Thema keine Mitgliedschaft', () => {
    expect(
      preparesSession({
        personId: FREMD,
        topic: verwaist,
        responsibleIds: [],
      }),
    ).toBe(false);
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

/**
 * Eine Einheit löschen — und der Grund, warum das nicht `mayEditTopic && !held`
 * ist.
 *
 * Bei einer **Hülle** ist die Einheit das ganze Thema. Ohne diesen Zweig gäbe es
 * dort gar keinen Weg: `TopicService.remove` kennt keinen Riegel für Gehaltenes,
 * aber eine Hülle hat keine Themenseite, über die man ihn erreichte — ein
 * Eintrag, den niemand mehr loswird.
 */
describe('mayDeleteSession', () => {
  const darf = (
    personId: string,
    options: { standalone?: boolean; held?: boolean } = {},
  ) =>
    mayDeleteSession({
      isAdmin: false,
      personId,
      topic: thema,
      standalone: options.standalone ?? false,
      held: options.held ?? false,
    });

  describe('solange der Abend bevorsteht', () => {
    it('darf, wer am Thema mitarbeitet', () => {
      expect(darf(OWNER)).toBe(true);
      expect(darf(COLLAB)).toBe(true);
    });

    it('sonst niemand', () => {
      expect(darf(FREMD)).toBe(false);
    });
  });

  describe('wenn der Abend war', () => {
    it('bleibt eine Einheit unter einem Thema stehen — auch für den Owner', () => {
      expect(darf(OWNER, { held: true })).toBe(false);
    });

    /** Dort ist „die Einheit löschen" dasselbe wie „das Thema löschen". */
    it('darf der Owner eine alleinstehende Einheit wegnehmen', () => {
      expect(darf(OWNER, { held: true, standalone: true })).toBe(true);
    });

    /** Mitarbeit genügt dafür nicht: Löschen ist enger als Bearbeiten. */
    it('eine Mitarbeiterin aber nicht', () => {
      expect(darf(COLLAB, { held: true, standalone: true })).toBe(false);
    });
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

  /**
   * Und wer die Einheit vorbereitet, erst recht — auch wenn er zum Thema nicht
   * gehört und am Abend selbst gar nicht kann. Ohne diese Zeile bekäme er
   * seinen eigenen Text als `null` zurück; seit die Vorbereitung ihren eigenen
   * Kreis zieht, ist das kein Randfall mehr, sondern der Normalfall.
   */
  it('wer die Einheit vorbereitet, sieht sie jederzeit', () => {
    expect(
      isContentVisible({
        ...basis,
        responsibleIds: [FREMD],
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
