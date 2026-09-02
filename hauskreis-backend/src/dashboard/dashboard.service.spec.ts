import { DashboardService } from './dashboard.service';
// Type-only imports keep Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';
import type { AssignmentService } from './assignment.service';
import type { PrayerBuddyService } from '../prayer-buddy/prayer-buddy.service';
import { withClock } from '../meeting/group-clock.testing';
import { withFeatures } from '../hauskreis/group-features.testing';
import type { GroupFeatures } from '../hauskreis/group-features.service';

/** Die Zone der Gruppe — in den Tests immer dieselbe. */
const BERLIN = 'Europe/Berlin';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = utc('2026-07-29');

/** Wer den Startbildschirm aufmacht. Niko ist nicht fürs Thema zugeteilt. */
const NIKO = { personId: 'niko', isAdmin: false, zone: BERLIN };
/** Antonia schon — sie sieht den Titel auch vor dem Abend. */
const ANTONIA = { personId: 'antonia', isAdmin: false, zone: BERLIN };

const nextMeeting = {
  id: 'm1',
  date: utc('2026-08-04'),
  startMinutes: 1080,
  type: 'STANDARD',
  title: null,
  location: { id: 'loc-chris', name: 'Bei Chris', requiresHost: true },
  host: { id: 'chris', name: 'chris' },
  topicResponsibles: [{ person: { id: 'antonia', name: 'Antonia' } }],
  // So kommt die Einheit aus Prisma — `shapeSessionForMeeting` macht daraus
  // das, was der Betrachter sehen darf.
  topicSession: {
    id: 's1',
    topicId: 't1',
    meetingId: 'm1',
    title: null,
    actionstepText: null,
    summaryText: null,
    createdAt: utc('2026-07-01'),
    updatedAt: utc('2026-07-01'),
    version: 0,
    meeting: {
      id: 'm1',
      date: utc('2026-08-04'),
      status: 'PLANNED',
      title: null,
      topicResponsibles: [{ personId: 'antonia' }],
    },
    responsibles: [],
    topic: {
      id: 't1',
      title: 'Vergebung',
      status: 'RUNNING',
      ownerPersonId: 'antonia',
      collaborators: [],
      // Die Geschwister — daraus wird „Session 1 von 1".
      sessions: [{ id: 's1', meeting: { date: utc('2026-08-04') } }],
    },
  },
  songLeaders: [{ person: { id: 'lena', name: 'Lena' } }],
  attendances: [] as { status: string }[],
};

/**
 * Der Abend, der zuletzt **ganz** vorbei ist. Er teilt sich den oberen Platz
 * des Startbildschirms mit dem laufenden — steht einer, steht der andere nicht.
 */
const pastMeeting = {
  ...nextMeeting,
  id: 'm-vorbei',
  date: utc('2026-07-28'),
  topicSession: null,
};

const pastWithActionstep = {
  id: 'm0',
  date: utc('2026-07-28'),
  hasTopicSlot: true,
  actionstepText: null,
  topicSession: { actionstepText: 'Jeden Tag 10 Minuten still werden' },
  actionstepDone: [] as { personId: string }[],
};

/** Derselbe Abend, aber ohne Thema: der Vorsatz steht in der Nachbereitung. */
const pastWithNotes = {
  ...pastWithActionstep,
  hasTopicSlot: false,
  actionstepText: 'Jeden Tag 10 Minuten still werden',
  topicSession: null,
};

function setup(
  options: {
    meeting?: typeof nextMeeting | null;
    /** Die kommenden Abende, wenn es auf mehr als einen ankommt. */
    meetings?: (typeof nextMeeting)[];
    /** Die vergangenen Abende, jüngster zuerst. */
    lastMeetings?: unknown[];
    /** Der letzte ganz vergangene Abend — die eigene, dritte Abfrage. */
    lastFinished?: typeof nextMeeting | null;
    actionstep?: {
      id: string;
      date: Date;
      hasTopicSlot: boolean;
      actionstepText: string | null;
      topicSession: { actionstepText: string | null } | null;
      actionstepDone: { personId: string }[];
    } | null;
    buddies?: {
      periodEnd: string;
      groups: { members: { id: string; name: string }[] }[];
    } | null;
    roles?: unknown[];
    peopleCount?: number;
    /** Womit die Gruppe arbeitet — voreingestellt mit allem. */
    features?: Partial<GroupFeatures>;
  } = {},
) {
  // Zwei Aufrufe von `meeting.findMany`: erst die nächsten beiden Abende
  // (läuft einer, steht er vorn), dann die vergangenen für den Actionstep.
  const kommende =
    options.meetings ??
    (options.meeting === undefined
      ? [nextMeeting]
      : options.meeting
        ? [options.meeting]
        : []);

  const vergangene =
    options.lastMeetings ??
    (options.actionstep === undefined
      ? [pastWithActionstep]
      : options.actionstep
        ? [options.actionstep]
        : []);

  const findMany = jest
    .fn()
    .mockResolvedValueOnce(kommende)
    .mockResolvedValueOnce(vergangene);

  // Eine eigene Abfrage und kein dritter `findMany`: „der letzte Abend" ist
  // genau eine Zeile, und `findFirst` sagt das auch.
  const findFirst = jest
    .fn()
    .mockResolvedValue(
      options.lastFinished === undefined ? pastMeeting : options.lastFinished,
    );

  const findAssignments = jest.fn().mockResolvedValue(options.roles ?? []);
  const findCurrent = jest.fn().mockResolvedValue(
    options.buddies === undefined
      ? {
          periodEnd: '2026-08-11',
          groups: [
            {
              members: [
                { id: 'niko', name: 'Niko' },
                { id: 'antonia', name: 'Antonia' },
              ],
            },
          ],
        }
      : options.buddies,
  );

  const service = withFeatures(
    withClock(
      new DashboardService(
        {
          meeting: { findMany, findFirst },
          person: {
            count: jest.fn().mockResolvedValue(options.peopleCount ?? 9),
          },
        } as unknown as PrismaService,
        { findAssignments } as unknown as AssignmentService,
        { findCurrent } as unknown as PrayerBuddyService,
        // Die Uhr kommt gleich über `withClock` — hier steht nur ihr Platz, damit
        // die Reihenfolge stimmt.
        undefined as unknown as GroupClockService,
        // Nur für eine Zahl: ab wie vielen Tagen vorher ein Geburtstag als
        // eigene Rolle gilt. Dieselbe Einstellung, die auch die Push-Nachricht
        // auslöst — deshalb wird sie hier nachgeschlagen und nicht geraten.
        {
          resolve: jest.fn().mockResolvedValue({ enabled: true, leadDays: 14 }),
        } as unknown as NotificationPreferenceService,
      ),
    ),
    options.features,
  );

  return { service, findMany, findFirst, findAssignments };
}

describe('DashboardService.build', () => {
  it('puts the whole home screen together', async () => {
    const { service } = setup();

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.nextMeeting).toMatchObject({
      id: 'm1',
      date: '2026-08-04',
      // Als Zahl — das Antwort-Schema macht daraus `"18:00"`. Ohne sie musste
      // man den Termin öffnen, um eine Uhrzeit zu sehen, die sich einstellen
      // lässt.
      startTime: 1080,
      host: { name: 'chris' },
    });
    // Alle drei Rollen mit Personen: das Thema hat oft keinen Titel, dann ist
    // „wer bereitet vor" das Einzige, was über den Abend etwas aussagt.
    expect(home.nextMeeting?.topicResponsibles).toEqual([
      { id: 'antonia', name: 'Antonia' },
    ]);
    // Der Titel gehört bis zum Abend denen, die ihn vorbereiten — Niko ist
    // nicht dabei, für ihn steht dort nichts. Siehe den Test darunter.
    expect(home.nextMeeting?.topic).toBeNull();
    expect(home.nextMeeting?.songLeaders).toEqual([
      { id: 'lena', name: 'Lena' },
    ]);
    expect(home.openActionstep).toEqual({
      text: 'Jeden Tag 10 Minuten still werden',
      meetingId: 'm0',
      date: '2026-07-28',
      done: false,
      doneCount: 0,
      peopleCount: 9,
    });
    // Die ganze Gruppe, Niko eingeschlossen, in Kreis-Reihenfolge: Erst
    // daraus liest die Karte ab, für wen er betet und wer für ihn.
    expect(home.prayerBuddies).toEqual({
      until: '2026-08-11',
      members: [
        { id: 'niko', name: 'Niko' },
        { id: 'antonia', name: 'Antonia' },
      ],
    });
  });

  it('treats a missing attendance row as undecided', async () => {
    const { service } = setup();

    const home = await service.build('hk-1', NIKO, { now: NOW });

    // No row means nobody answered yet, which is exactly what UNKNOWN says.
    expect(home.nextMeeting?.myAttendance).toBe('UNKNOWN');
  });

  it('reports the answer that was given', async () => {
    const { service } = setup({
      meeting: { ...nextMeeting, attendances: [{ status: 'ABSENT' }] },
    });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.nextMeeting?.myAttendance).toBe('ABSENT');
  });

  it('copes with nothing planned', async () => {
    const { service } = setup({ meeting: null });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    // A valid state, not an error — the generator may simply not have run yet.
    expect(home.nextMeeting).toBeNull();
  });

  /**
   * Die Abendregel auf dem Startbildschirm: derselbe Aufruf, zwei Antworten.
   * Wer vorbereitet, sieht sein Thema jederzeit.
   */
  it('zeigt der Zuständigen ihr Thema schon vorher', async () => {
    const { service } = setup();

    const home = await service.build('hk-1', ANTONIA, { now: NOW });

    expect(home.nextMeeting?.topic).toEqual({ id: 't1', title: 'Vergebung' });
  });

  it('counts who ticked the actionstep off, and whether you did', async () => {
    const { service } = setup({
      actionstep: {
        ...pastWithActionstep,
        actionstepDone: [{ personId: 'niko' }, { personId: 'chris' }],
      },
      peopleCount: 9,
    });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    // „2 von 9 haben's geschafft" — und du bist eine davon.
    expect(home.openActionstep).toMatchObject({
      done: true,
      doneCount: 2,
      peopleCount: 9,
    });
  });

  it('shows no actionstep when the last ones had none', async () => {
    const { service } = setup({ actionstep: null });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.openActionstep).toBeNull();
  });

  it('treats a blank actionstep as none', async () => {
    const { service } = setup({
      actionstep: {
        id: 'm0',
        date: utc('2026-07-28'),
        hasTopicSlot: true,
        actionstepText: null,
        topicSession: { actionstepText: '  ' },
        actionstepDone: [],
      },
    });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.openActionstep).toBeNull();
  });

  /**
   * Ein Abend ohne Thema hat seinen Vorsatz in der Nachbereitung. Er gehört
   * genauso auf den Startbildschirm — sonst wäre die Woche nach einem
   * Lobpreisabend dort still.
   */
  it('nimmt den Actionstep auch aus der Nachbereitung', async () => {
    const { service } = setup({ actionstep: pastWithNotes });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.openActionstep).toMatchObject({
      text: 'Jeden Tag 10 Minuten still werden',
      meetingId: 'm0',
    });
  });

  it('stays quiet about buddies when this person is in no group', async () => {
    const { service } = setup({
      buddies: {
        periodEnd: '2026-08-11',
        groups: [{ members: [{ id: 'chris', name: 'chris' }] }],
      },
    });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.prayerBuddies).toBeNull();
  });

  it('leaves the prayer buddies out of the jobs list', async () => {
    const { service } = setup({
      roles: [
        { role: 'HOST', date: '2026-08-04', person: { id: 'niko' } },
        { role: 'PRAYER_BUDDY', date: '2026-08-12', person: { id: 'niko' } },
      ],
    });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    // Mit jemandem zusammen beten ist keine Aufgabe, die man abarbeitet — und
    // es steht schon in `prayerBuddies`. In `…/assignments` bleibt es drin.
    expect(home.myRoles.map((role) => role.role)).toEqual(['HOST']);
  });

  it('asks only for that person, eight weeks out', async () => {
    const { service, findAssignments } = setup();

    await service.build('hk-1', NIKO, { now: NOW });

    expect(findAssignments).toHaveBeenCalledWith('hk-1', {
      from: utc('2026-07-29'),
      to: utc('2026-09-23'),
      personId: 'niko',
      // Die persönliche Vorlaufzeit für Geburtstage. Sie fährt hier mit, weil
      // die Rolle „du besorgst ein Geschenk" genau dann erscheinen soll, wenn
      // auch die Erinnerung kommt — und nicht acht Wochen vorher.
      birthdayLeadDays: 14,
    });
  });

  it('uses the same actionstep rule as the reminder', async () => {
    const { service, findMany } = setup();

    await service.build('hk-1', NIKO, { now: NOW });

    // Dieselbe Abfrage wie in `latestActionstep`: die letzten vergangenen
    // Abende, jüngster zuerst — und dann entscheidet die Schleife. Vorher stand
    // hier „der jüngste, **der einen hat**", und damit blieb der Vorsatz von
    // vorletzter Woche über einen leeren Dienstag hinweg stehen.
    const where = findMany.mock.calls[1][0].where;
    expect(where.OR).toEqual([
      { endDate: null, date: { lt: utc('2026-07-29') } },
      { endDate: { lt: utc('2026-07-29') } },
    ]);
    expect(findMany.mock.calls[1][0].orderBy).toEqual({ date: 'desc' });
  });

  /**
   * Der laufende Abend steht oben, der nächste darunter. Zwei Fragen — „wo bin
   * ich jetzt" und „was kommt" —, und vorher gab es eine Karte, die den
   * laufenden Abend unter „Nächstes Treffen" führte.
   */
  it('trennt den laufenden Abend vom nächsten', async () => {
    const laufend = {
      ...nextMeeting,
      id: 'm-heute',
      date: utc('2026-07-29'),
      // 8 Uhr morgens: um 12 Uhr Ortszeit läuft der Abend längst.
      startMinutes: 480,
    };
    const { service } = setup({ meetings: [laufend, nextMeeting] });

    const home = await service.build('hk-1', NIKO, {
      now: new Date('2026-07-29T12:00:00.000Z'),
    });

    expect(home.currentMeeting?.id).toBe('m-heute');
    expect(home.nextMeeting?.id).toBe('m1');
  });

  /**
   * Am Mittwochmorgen ist die interessanteste Karte der Abend von gestern —
   * seine Nachbereitung fehlt noch. Vorher stand dort nur der Dienstag in einer
   * Woche.
   */
  it('zeigt den letzten Abend, solange keiner läuft', async () => {
    const { service } = setup();

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.lastMeeting?.id).toBe('m-vorbei');
    expect(home.nextMeeting?.id).toBe('m1');
  });

  /**
   * Der obere Platz gehört dem laufenden Abend. Beides zugleich wäre eine Karte
   * zu viel und die Frage „wo bin ich jetzt" zweimal beantwortet.
   */
  it('lässt den letzten weg, solange einer läuft', async () => {
    const laufend = {
      ...nextMeeting,
      id: 'm-heute',
      date: utc('2026-07-29'),
      startMinutes: 480,
    };
    const { service } = setup({ meetings: [laufend, nextMeeting] });

    const home = await service.build('hk-1', NIKO, {
      now: new Date('2026-07-29T12:00:00.000Z'),
    });

    expect(home.currentMeeting?.id).toBe('m-heute');
    expect(home.lastMeeting).toBeNull();
  });

  it('kommt ohne vergangene Abende aus', async () => {
    const { service } = setup({ lastFinished: null });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    // Der erste Dienstag einer neuen Gruppe — kein Fehler, nur nichts dahinter.
    expect(home.lastMeeting).toBeNull();
  });

  it('sucht den letzten Abend ganz vorbei und nicht abgesagt', async () => {
    const { service, findFirst } = setup();

    await service.build('hk-1', NIKO, { now: NOW });

    const args = findFirst.mock.calls[0][0];
    // `finishedBefore` und nicht `date < heute`: Sonst stünde eine laufende
    // Freizeit ab ihrem zweiten Tag zugleich oben und darüber.
    expect(args.where.OR).toEqual([
      { endDate: null, date: { lt: utc('2026-07-29') } },
      { endDate: { lt: utc('2026-07-29') } },
    ]);
    // Ein ausgefallener Abend ist keiner, den man nachliest.
    expect(args.where.status).toBe('PLANNED');
    expect(args.orderBy).toEqual({ date: 'desc' });
  });

  it('lässt „Aktueller Termin" leer, solange der Abend noch nicht anfing', async () => {
    const { service } = setup();

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.currentMeeting).toBeNull();
    expect(home.nextMeeting?.id).toBe('m1');
  });

  /**
   * Abgeschaltet heißt „gibt es hier nicht", und beide Karten fallen im
   * Frontend an genau diesem `null` von selbst weg.
   */
  it('lässt Gebetsbuddys und Wochen-Actionstep weg, wenn sie aus sind', async () => {
    const { service } = setup({
      features: { prayerBuddies: false, weeklyActionstep: false },
    });

    const home = await service.build('hk-1', NIKO, { now: NOW });

    expect(home.prayerBuddies).toBeNull();
    expect(home.openActionstep).toBeNull();
  });
});
