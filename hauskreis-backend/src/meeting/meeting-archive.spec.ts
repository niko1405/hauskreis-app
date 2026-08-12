import { MeetingService } from './meeting.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import type { MeetingNotificationService } from './meeting-notification.service';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TODAY = utc('2026-07-29');

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(TODAY);
});

afterEach(() => {
  jest.useRealTimers();
});

function setup() {
  const findMany = jest.fn().mockResolvedValue([]);

  const service = new MeetingService(
    {
      meeting: { findMany, count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService,
    {} as unknown as RoleSuggestionService,
    {} as unknown as MeetingNotificationService,
  );

  return { service, findMany };
}

const query = { take: 20, skip: 0, scope: 'past' as const };

/**
 * Die Zeitfenster aus dem `where`, jedes für sich.
 *
 * Seit ein Termin ein Zeitraum sein kann, ist jede Bedingung ein `OR` über
 * zwei Zweige — „endet nicht vor X" trifft einen eintägigen Termin über sein
 * Startdatum und einen mehrtägigen über sein Ende. Zwei davon nebeneinander in
 * einem `date`-Objekt überschrieben sich, deshalb stehen sie jetzt als Liste
 * unter `AND`.
 */
const windows = (findMany: jest.Mock): unknown[] =>
  (findMany.mock.calls[0][0].where.AND as unknown[]) ?? [];

const endetNichtVor = (day: Date) => ({
  OR: [{ endDate: null, date: { gte: day } }, { endDate: { gte: day } }],
});

const vorbeiSeit = (day: Date) => ({
  OR: [{ endDate: null, date: { lt: day } }, { endDate: { lt: day } }],
});

describe('MeetingService.findAll for the archive', () => {
  it('reads newest first', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', query);

    expect(findMany.mock.calls[0][0].orderBy).toEqual({ date: 'desc' });
    // Vorbei heißt **ganz** vorbei: eine Freizeit, die heute noch läuft,
    // gehört nicht ins Archiv, auch wenn sie gestern begann.
    expect(windows(findMany)).toEqual([vorbeiSeit(TODAY)]);
  });

  it('searches every field an evening was written down in', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', { ...query, search: 'Vergebung' });

    // Niemand weiß hinterher, ob es in der Zusammenfassung stand, in der
    // Info-Zeile oder im Titel des Themas — also fragt die Suche auch nicht
    // danach. Zusammenfassung und Actionstep gibt es an **zwei** Trägern: am
    // Abend selbst (Baustein „Nachbereitung") und an der Einheit eines Themas,
    // daher der zweite Kranz darunter.
    const where = findMany.mock.calls[0][0].where;
    const fields = where.OR.map(
      (clause: Record<string, unknown>) => Object.keys(clause)[0],
    );

    expect(fields).toEqual([
      'title',
      'infoText',
      'summaryText',
      'actionstepText',
      'topicSession',
    ]);

    const inSession = where.OR[4].topicSession.OR.map(
      (clause: Record<string, unknown>) => Object.keys(clause)[0],
    );

    expect(inSession).toEqual([
      'title',
      'summaryText',
      'actionstepText',
      'topic',
      'topic',
    ]);
  });

  it('matches case-insensitively', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', { ...query, search: 'vergebung' });

    expect(findMany.mock.calls[0][0].where.OR[0].title).toEqual({
      contains: 'vergebung',
      mode: 'insensitive',
    });
  });

  it('narrows to a date range', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', {
      ...query,
      scope: 'all',
      from: utc('2026-01-01'),
      to: utc('2026-06-30'),
    });

    expect(windows(findMany)).toEqual([
      endetNichtVor(utc('2026-01-01')),
      { date: { lte: utc('2026-06-30') } },
    ]);
  });

  it('lets the scope keep its upper bound', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', { ...query, to: utc('2027-12-31') });

    // Otherwise "past, bis Ende nächsten Jahres" would start listing evenings
    // that have not happened.
    expect(windows(findMany)).toContainEqual(vorbeiSeit(TODAY));
  });

  it('lässt Bereich und Zeitfenster nebeneinander gelten', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', {
      ...query,
      scope: 'upcoming',
      from: utc('2026-01-01'),
    });

    // Beide Bedingungen stehen da und gelten mit UND — ein `from` in der
    // Vergangenheit zieht eine Liste kommender Termine damit nicht zurück.
    // Vorher wurde hier gerechnet („nimm das spätere"); das ging nur, solange
    // eine Untergrenze eine einzelne Zahl war.
    expect(windows(findMany)).toEqual([
      endetNichtVor(TODAY),
      endetNichtVor(utc('2026-01-01')),
    ]);
  });

  it('leaves the date filter off entirely when nothing bounds it', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', { ...query, scope: 'all' });

    expect(findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });
});
