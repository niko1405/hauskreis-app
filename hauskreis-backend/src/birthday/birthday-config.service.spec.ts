import { birthdayGiftConfigResponseSchema } from './dto/birthday-response.dto';
import { BirthdayConfigService } from './birthday-config.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Die Regel, die einmal gefehlt hat.
 *
 * Die Verwaltung meldete „jemand war schneller", obwohl niemand sonst da war.
 * Der Grund lag nicht im Sperren, sondern im **Lesen**: `EtagInterceptor`
 * setzt `W/"<version>"` nur, wenn die *serialisierte* Antwort ein `version`
 * trägt. Das Antwort-Schema hatte keines, der `ResponseSerializerInterceptor`
 * schnitt es also weg, und übrig blieb Express' Inhalts-Hash (`W/"a3-…"`).
 *
 * Den schickt der Client brav als `If-Match` zurück — und `parseEtagVersion`
 * erkennt ihn nicht als Version. `parseIfMatch` liefert dann bewusst eine
 * **leere** Versionsliste, damit eine Bedingung nie versehentlich zutrifft.
 * Ergebnis: Die `WHERE`-Klausel passt auf keine Zeile, `updateMany` ändert
 * nichts, und `updateWithVersionCheck` schließt daraus auf einen Konflikt.
 *
 * Jedes Schema hinter einem `@ApiConditionalWrite()` braucht deshalb `version`.
 */
describe('birthdayGiftConfigResponseSchema', () => {
  const config = {
    enabled: true,
    mode: 'ROTATING' as const,
    freezeDays: 14,
    pairingsRepairedAt: null,
    updatedBy: null,
    version: 3,
  };

  it('trägt die Version — sonst gibt es keinen brauchbaren ETag', () => {
    expect(birthdayGiftConfigResponseSchema.parse(config).version).toBe(3);
  });

  it('lehnt eine Antwort ohne Version ab', () => {
    // Der eigentliche Sinn dieses Tests: Wer das Feld wieder herausnimmt,
    // bricht nicht das Lesen, sondern das Schreiben — und zwar erst beim
    // zweiten Speichern, von Hand, in der Verwaltung.
    const { version: _version, ...ohne } = config;
    expect(() => birthdayGiftConfigResponseSchema.parse(ohne)).toThrow(
      /version/,
    );
  });
});

/**
 * Die Regel, die auch von Hand gilt: **jede:r besorgt genau ein Geschenk.**
 *
 * Sie ließ sich hier aushebeln, weil nur die linke Spalte geprüft wurde. Wer
 * die Zeilen in der Verwaltung durchklickte, konnte dieselbe Person zweimal
 * eintragen — und eine andere blieb ohne Aufgabe.
 */
/** Drei Leute mit Geburtstag; mehr braucht keine dieser Prüfungen. */
function konfigDienst() {
  const prisma = {
    person: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
    },
  } as unknown as PrismaService;

  return new BirthdayConfigService(prisma);
}

function pairing(birthdayPersonId: string, responsiblePersonId: string) {
  return { birthdayPersonId, responsiblePersonId };
}

describe('BirthdayConfigService.setPairings', () => {
  it('weist zurück, wer für zwei Geburtstage zuständig sein soll', async () => {
    await expect(
      konfigDienst().setPairings(
        'hk-1',
        { pairings: [pairing('a', 'c'), pairing('b', 'c')] },
        'admin',
      ),
    ).rejects.toThrow(/zweimal/);
  });

  it('weist zwei Zuständige für denselben Geburtstag zurück', async () => {
    await expect(
      konfigDienst().setPairings(
        'hk-1',
        { pairings: [pairing('a', 'b'), pairing('a', 'c')] },
        'admin',
      ),
    ).rejects.toThrow(/nur eine Person/);
  });

  it('weist Sich-selbst-beschenken zurück', async () => {
    await expect(
      konfigDienst().setPairings(
        'hk-1',
        { pairings: [pairing('a', 'a')] },
        'admin',
      ),
    ).rejects.toThrow(/Sich selbst/);
  });

  /**
   * Eine Lücke füllte früher der Planer beim Speichern — der Admin hätte also
   * etwas gespeichert, das er nie gesehen hat.
   */
  it('weist eine Zuteilung mit Lücke zurück', async () => {
    await expect(
      konfigDienst().setPairings(
        'hk-1',
        { pairings: [pairing('a', 'b'), pairing('b', 'a')] },
        'admin',
      ),
    ).rejects.toThrow(/jeden Geburtstag/);
  });

  it('nimmt eine vollständige Zuteilung an', async () => {
    const { service, transaction } = speicherDienst([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);

    await service.setPairings(
      'hk-1',
      { pairings: [pairing('a', 'c'), pairing('b', 'a'), pairing('c', 'b')] },
      'admin',
    );

    expect(transaction).toHaveBeenCalled();
  });

  /** Allein gibt es niemanden, der schenken könnte — leer ist dann vollständig. */
  it('nimmt bei einer einzigen Person die leere Zuteilung an', async () => {
    const { service, transaction } = speicherDienst([{ id: 'a' }]);

    await service.setPairings('hk-1', { pairings: [] }, 'admin');

    expect(transaction).toHaveBeenCalled();
  });
});

/** Wie `konfigDienst`, aber mit allem, was ein gelungenes Speichern braucht. */
function speicherDienst(people: { id: string }[]) {
  const transaction = jest.fn().mockResolvedValue([]);
  const prisma = {
    // Mit Geburtstag: Nach dem Speichern liest der Dienst die Zuteilung neu.
    person: {
      findMany: jest.fn().mockResolvedValue(
        people.map((person) => ({
          ...person,
          name: person.id,
          photoUpdatedAt: null,
          birthdate: new Date('1990-05-12T00:00:00.000Z'),
        })),
      ),
    },
    birthdayGiftPairing: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    birthdayGiftConfig: {
      updateMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ enabled: true }),
    },
    $transaction: transaction,
  } as unknown as PrismaService;

  return { service: new BirthdayConfigService(prisma), transaction };
}

const geboren = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Was die Verwaltung zu sehen bekommt: die gespeicherte Zuteilung und die
 * ausgerechnete Rotation, beide in der Reihenfolge der Geburtstage im Jahr.
 */
describe('BirthdayConfigService.listPairings', () => {
  function listDienst(
    stored: { birthdayPersonId: string; responsible: object }[],
  ) {
    const people = [
      {
        id: 'c',
        name: 'Chris',
        photoUpdatedAt: null,
        birthdate: geboren('1990-11-02'),
      },
      {
        id: 'a',
        name: 'Anna',
        photoUpdatedAt: null,
        birthdate: geboren('1985-03-14'),
      },
      {
        id: 'b',
        name: 'Ben',
        photoUpdatedAt: null,
        birthdate: geboren('2001-07-30'),
      },
    ];
    const prisma = {
      person: { findMany: jest.fn().mockResolvedValue(people) },
      birthdayGiftPairing: { findMany: jest.fn().mockResolvedValue(stored) },
      birthdayGiftConfig: {
        findUnique: jest.fn().mockResolvedValue({ enabled: true }),
      },
    } as unknown as PrismaService;

    return new BirthdayConfigService(prisma);
  }

  it('sortiert nach Geburtstag im Jahr und nennt ihn ohne Jahr', async () => {
    const { pairings } = await listDienst([]).listPairings('hk-1');

    expect(
      pairings.map((row) => [row.birthdayPerson.name, row.birthday]),
    ).toEqual([
      ['Anna', '03-14'],
      ['Ben', '07-30'],
      ['Chris', '11-02'],
    ]);
  });

  it('gibt kein Geburtsjahr heraus', async () => {
    const { pairings } = await listDienst([]).listPairings('hk-1');

    expect(pairings[0]?.birthdayPerson).not.toHaveProperty('birthdate');
  });

  /** Wer gerade gefeiert hat, besorgt für den Nächsten — der Erste bekommt vom Letzten. */
  it('rechnet die Rotation mit', async () => {
    const { rotation } = await listDienst([]).listPairings('hk-1');

    expect(
      rotation.map((row) => [row.birthdayPerson.id, row.responsible?.id]),
    ).toEqual([
      ['a', 'c'],
      ['b', 'a'],
      ['c', 'b'],
    ]);
  });

  it('zeigt eine gespeicherte Lücke als leer', async () => {
    const { pairings } = await listDienst([
      {
        birthdayPersonId: 'a',
        responsible: { id: 'b', name: 'Ben', photoUpdatedAt: null },
      },
    ]).listPairings('hk-1');

    expect(pairings.map((row) => row.responsible?.id ?? null)).toEqual([
      'b',
      null,
      null,
    ]);
  });
});
