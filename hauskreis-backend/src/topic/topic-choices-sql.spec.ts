/**
 * Was Prisma daraus **macht**.
 *
 * Die übrigen Tests hier arbeiten gegen ein nachgebautes Prisma und können
 * deshalb nur die Form der Abfrage prüfen. Genau daran ist ein Fehler
 * vorbeigelaufen: `NOT: { meetingId }` sah richtig aus, war es auch — nur nicht
 * in SQL, wo ein Vergleich mit einer leeren Spalte NULL ergibt und die Zeile
 * damit herausfällt. Die im Archiv vorbereiteten Einheiten standen deshalb in
 * der Auswahl nicht zur Wahl.
 *
 * Dieser Test geht deshalb einen Schritt weiter: ein echter Client, aber
 * anstelle der Datenbank ein Treiber, der das erzeugte SQL nur aufschreibt.
 * Keine Verbindung nötig — und trotzdem eine Aussage über das, was am Ende
 * wirklich läuft.
 */
import { PrismaClient } from '../../generated/prisma/client';
import { nichtAnDiesemAbend } from './topic-session.service';

const mitgeschrieben: string[] = [];

const verbindung = {
  provider: 'postgres',
  adapterName: 'mitschrift',
  queryRaw: (query: { sql: string }) => {
    mitgeschrieben.push(query.sql);
    return Promise.resolve({ columnNames: [], columnTypes: [], rows: [] });
  },
  executeRaw: () => Promise.resolve(0),
  getConnectionInfo: () => ({
    schemaName: 'public',
    supportsRelationJoins: false,
  }),
  dispose: () => Promise.resolve(),
};

const prisma = new PrismaClient({
  adapter: {
    provider: 'postgres',
    adapterName: 'mitschrift',
    connect: () => Promise.resolve(verbindung),
  } as never,
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function sqlVon(where: object): Promise<string> {
  mitgeschrieben.length = 0;
  await prisma.topicSession.findMany({ where, select: { id: true } });
  return mitgeschrieben.join('\n');
}

describe('nicht an diesem Abend', () => {
  it('lässt die Einheiten ohne Abend ausdrücklich durch', async () => {
    const sql = await sqlVon(nichtAnDiesemAbend('m1'));

    expect(sql).toContain('"meeting_id" IS NULL');
  });

  it('schließt den eigenen Abend aus', async () => {
    const sql = await sqlVon(nichtAnDiesemAbend('m1'));

    expect(sql).toMatch(/"meeting_id" (<>|!=)/);
  });

  /**
   * Die Gegenprobe, und der Grund für die ganze Datei: Beide kurzen Fassungen
   * kommen ohne `IS NULL` heraus. Schlägt das hier eines Tages fehl, weil
   * Prisma es von sich aus richtig macht, darf die Ausformulierung oben weg.
   */
  it('kennt keine kurze Fassung, die das täte', async () => {
    expect(await sqlVon({ NOT: { meetingId: 'm1' } })).not.toContain('IS NULL');
    expect(await sqlVon({ meetingId: { not: 'm1' } })).not.toContain('IS NULL');
  });
});
