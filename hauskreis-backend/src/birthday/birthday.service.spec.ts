/**
 * Was am Geschenk nach dem Aussuchen noch passiert: wer vom Gespräch erfährt,
 * was jede:r zahlt, und wer es schon getan hat.
 */
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { BirthdayService, OPEN_PAYMENT_DAYS } from './birthday.service';
import { birthdayDetailResponseSchema } from './dto/birthday-response.dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import type { BirthdayConfigService } from './birthday-config.service';
import { withClock } from '../meeting/group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const ANNA = { id: id(1), name: 'Anna', photoUpdatedAt: null };
const BEN = { id: id(2), name: 'Ben', photoUpdatedAt: null };
const CHRIS = { id: id(3), name: 'Chris', photoUpdatedAt: null };
const DORA = { id: id(4), name: 'Dora', photoUpdatedAt: null };
const MEMBERS = [ANNA, BEN, CHRIS, DORA];

const OCCASION = id(9);

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

/** Anna hat Geburtstag, Ben besorgt, 60 € insgesamt. */
function occasion(overrides: Record<string, unknown> = {}) {
  return {
    id: OCCASION,
    occursOn: utc('2026-08-10'),
    priceCents: 6000,
    selectedGiftIdeaId: null,
    responsiblePersonId: BEN.id,
    person: { ...ANNA, birthdate: utc('1990-08-10') },
    responsible: BEN,
    selectedIdea: null,
    ...overrides,
  };
}

function setup(
  options: {
    occasion?: Record<string, unknown>;
    paid?: string[];
    /** Was die Abfrage nach eigenem Vorgestreckten liefert. */
    advanced?: Record<string, unknown>[];
  } = {},
) {
  const row = occasion(options.occasion);
  const notify = jest.fn().mockResolvedValue(undefined);
  const paymentFindMany = jest.fn().mockResolvedValue(
    (options.paid ?? []).map((personId) => ({
      personId,
      paidAt: new Date('2026-08-12T10:00:00.000Z'),
    })),
  );
  // Zwei Abfragen nach Geburtstagen: Wer besorgt hat, steht bei der nach dem
  // Vorgestreckten als Gleichheit in `responsiblePersonId`, bei der nach der
  // eigenen Schuld nicht.
  const occasionFindMany = jest.fn(
    (args: { where: { responsiblePersonId?: unknown } }) =>
      Promise.resolve(
        typeof args.where.responsiblePersonId === 'string'
          ? (options.advanced ?? [])
          : [row],
      ),
  );
  const upsert = jest.fn().mockResolvedValue({});
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const personFindMany = jest.fn(
    (args: { where: { id?: { notIn: string[] } } }) =>
      Promise.resolve(
        MEMBERS.filter((person) => !args.where.id?.notIn.includes(person.id)),
      ),
  );

  const prisma = {
    birthdayOccasion: {
      findFirst: jest.fn().mockResolvedValue(row),
      findMany: occasionFindMany,
    },
    birthdayPayment: { findMany: paymentFindMany, upsert, deleteMany },
    person: { findMany: personFindMany },
    giftIdea: {
      findFirst: jest.fn().mockResolvedValue({ id: id(7), text: 'Buch' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    giftIdeaComment: {
      create: jest.fn().mockResolvedValue({ id: id(8), author: CHRIS }),
    },
    notificationLog: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const service = withClock(
    new BirthdayService(
      prisma as unknown as PrismaService,
      { notify } as unknown as NotificationService,
      undefined as never,
      {
        get: jest.fn().mockResolvedValue({ freezeDays: 14 }),
      } as unknown as BirthdayConfigService,
    ),
  );

  return { service, notify, upsert, deleteMany, occasionFindMany };
}

describe('BirthdayService.commentIdea', () => {
  /**
   * Nur an die Beteiligten ging ein „hat sie schon" an dem vorbei, der gerade
   * besorgen wollte.
   */
  it('sagt allen Bescheid außer dem Geburtstagskind und dem, der schreibt', async () => {
    const { service, notify } = setup();

    await service.commentIdea(
      OCCASION,
      OCCASION,
      id(7),
      { text: 'hat sie schon' },
      CHRIS.id,
    );

    expect(notify.mock.calls.map(([call]) => call.personId).toSorted()).toEqual(
      [BEN.id, DORA.id],
    );
  });
});

describe('BirthdayService — Anteil und bezahlt', () => {
  /** Geteilt durch alle außer dem Geburtstagskind: 60 € durch drei. */
  it('rechnet den Anteil je Person', async () => {
    const { service } = setup();

    const detail = await service.detail('hk', OCCASION, CHRIS.id);

    expect(detail).toMatchObject({ priceCents: 6000, shareCents: 2000 });
  });

  it('zeigt dem Geburtstagskind weder Preis noch Anteil', async () => {
    const { service } = setup();

    const detail = await service.detail('hk', OCCASION, ANNA.id);

    expect(detail).toMatchObject({
      priceCents: null,
      shareCents: null,
      mustPay: false,
      payments: null,
    });
  });

  it('lässt zahlen, wer weder Geburtstag hat noch besorgt hat', async () => {
    const { service } = setup({ paid: [DORA.id] });

    expect(await service.detail('hk', OCCASION, CHRIS.id)).toMatchObject({
      mustPay: true,
      paidByMe: false,
      payments: null,
    });
    expect(await service.detail('hk', OCCASION, DORA.id)).toMatchObject({
      mustPay: true,
      paidByMe: true,
    });
  });

  /** Wer besorgt hat, sieht, wer schon hat — und nur der. */
  it('zeigt dem Besorgenden, wer schon gezahlt hat', async () => {
    const { service } = setup({ paid: [DORA.id] });

    const detail = await service.detail('hk', OCCASION, BEN.id);

    expect(detail.mustPay).toBe(false);
    expect(
      detail.payments?.map((row) => [row.person.name, row.paidAt !== null]),
    ).toEqual([
      ['Chris', false],
      ['Dora', true],
    ]);
  });

  it('passt zu seinem Antwort-Schema', async () => {
    const { service } = setup({ paid: [DORA.id] });

    const detail = await service.detail('hk', OCCASION, BEN.id);

    expect(
      birthdayDetailResponseSchema.safeParse(JSON.parse(JSON.stringify(detail)))
        .success,
    ).toBe(true);
  });

  it('hakt den eigenen Anteil ab und nimmt ihn wieder zurück', async () => {
    const { service, upsert, deleteMany } = setup();

    await service.setPaid('hk', OCCASION, CHRIS.id, true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { occasionId: OCCASION, personId: CHRIS.id },
      }),
    );

    await service.setPaid('hk', OCCASION, CHRIS.id, false);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { occasionId: OCCASION, personId: CHRIS.id },
    });
  });

  it('lässt den Besorgenden nicht abhaken', async () => {
    const { service } = setup();

    await expect(service.setPaid('hk', OCCASION, BEN.id, true)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lässt ohne Preis nichts abhaken', async () => {
    const { service } = setup({ occasion: { priceCents: null } });

    await expect(
      service.setPaid('hk', OCCASION, CHRIS.id, true),
    ).rejects.toThrow(BadRequestException);
  });

  /**
   * Was offen ist, fragt die Datenbank — hier zählt, dass sie das Richtige
   * gefragt wird: mit Preis, nicht der eigene, nicht selbst besorgt, ohne
   * eigenen Haken und höchstens drei Monate zurück.
   */
  it('fragt nach den offenen Anteilen der letzten drei Monate', async () => {
    const { service, occasionFindMany } = setup();

    const open = await service.openPayments('hk', CHRIS.id);

    expect(occasionFindMany.mock.calls[0][0].where).toMatchObject({
      priceCents: { not: null },
      personId: { not: CHRIS.id },
      payments: { none: { personId: CHRIS.id } },
      occursOn: {
        gte: new Date(
          utc('2026-08-20').getTime() - OPEN_PAYMENT_DAYS * 86_400_000,
        ),
      },
    });
    expect(open).toEqual([
      expect.objectContaining({
        occasionId: OCCASION,
        shareCents: 2000,
        collecting: null,
      }),
    ]);
  });

  /**
   * Wer besorgt hat, findet den vergangenen Geburtstag ebenfalls dort — als
   * „2 von 3 haben bezahlt", bis alle es haben.
   */
  describe('für den, der besorgt hat', () => {
    const advanced = (paid: string[]) => ({
      ...occasion(),
      payments: paid.map((personId) => ({ personId })),
    });

    it('fragt nur nach vergangenen, eigenen der letzten drei Monate', async () => {
      const { service, occasionFindMany } = setup();

      await service.openPayments('hk', BEN.id);

      const where = occasionFindMany.mock.calls
        .map((call) => call[0].where)
        .find((entry) => entry.responsiblePersonId === BEN.id);
      expect(where).toMatchObject({
        priceCents: { not: null },
        occursOn: {
          gte: new Date(
            utc('2026-08-20').getTime() - OPEN_PAYMENT_DAYS * 86_400_000,
          ),
          lt: utc('2026-08-20'),
        },
      });
    });

    it('zählt, wer schon gezahlt hat', async () => {
      // Chris hat, Dora noch nicht — Anna hat Geburtstag, Ben selbst zählt nicht.
      const { service } = setup({ advanced: [advanced([CHRIS.id])] });

      const open = await service.openPayments('hk', BEN.id);

      expect(open).toContainEqual(
        expect.objectContaining({
          occasionId: OCCASION,
          collecting: { paid: 1, of: 2 },
        }),
      );
    });

    it('verschwindet, sobald alle gezahlt haben', async () => {
      const { service } = setup({
        advanced: [advanced([CHRIS.id, DORA.id])],
      });

      const open = await service.openPayments('hk', BEN.id);

      expect(open.filter((row) => row.collecting !== null)).toEqual([]);
    });
  });

  it('kennt für Ehemalige nichts Offenes', async () => {
    const { service, occasionFindMany } = setup();

    await expect(service.openPayments('hk', id(5))).resolves.toEqual([]);
    expect(occasionFindMany).not.toHaveBeenCalled();
  });
});
