/**
 * Wer eine Einheit vorbereitet — und was das für den Abend bedeutet.
 *
 * Der Ort, an dem die Vorbereitung ihren Kreis zieht, seit die Zuteilung am
 * Termin es nicht mehr tut. Zwei Regeln tragen ihn, und sie sind ausdrücklich
 * **nicht symmetrisch**:
 *
 * - Wer hier dazukommt, wird für den zugeordneten Abend auch als zuständig
 *   eingetragen. Sonst pflegte man dieselbe Liste zweimal.
 * - Wer herausgenommen wird, bleibt in der Abend-Rolle stehen. Er bereitet
 *   nicht mehr vor, steht aber vielleicht trotzdem vorne — und jemanden still
 *   aus einem Abend zu nehmen, an dem er eingeplant ist, wäre die
 *   überraschendere der beiden Möglichkeiten.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TopicSessionService } from './topic-session.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TopicLinkService } from './topic-link.service';
import type { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import type { AvailabilityService } from '../role-suggestion/availability.service';
import { withClock } from '../meeting/group-clock.testing';

const HEUTE = new Date('2026-08-05T12:00:00.000Z');
const KOMMENDER_DIENSTAG = new Date('2026-08-11T00:00:00.000Z');
const LETZTER_DIENSTAG = new Date('2026-07-28T00:00:00.000Z');

const BERLIN = 'Europe/Berlin';
const ICH = { personId: 'p1', isAdmin: false, zone: BERLIN };

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(HEUTE);
});

afterAll(() => {
  jest.useRealTimers();
});

function setup(
  options: {
    ownerPersonId?: string | null;
    collaboratorIds?: string[];
    responsibleIds?: string[];
    meetingId?: string | null;
    date?: Date;
    hasTopicSlot?: boolean;
    /** Wer schon in der Abend-Rolle steht. */
    imTermin?: string[];
    /** Wer an dem Abend überhaupt kann; ohne Angabe: alle Angefragten. */
    koennen?: string[];
  } = {},
) {
  const meetingId = options.meetingId === undefined ? 'm1' : options.meetingId;

  const session = {
    id: 's1',
    topicId: 't1',
    meetingId,
    responsibles: (options.responsibleIds ?? ['p1']).map((personId) => ({
      personId,
    })),
    topic: {
      id: 't1',
      title: 'Apostelgeschichte',
      status: 'RUNNING',
      standalone: false,
      ownerPersonId:
        options.ownerPersonId === undefined ? 'p1' : options.ownerPersonId,
      collaborators: (options.collaboratorIds ?? []).map((personId) => ({
        personId,
      })),
      sessions: [{ id: 's1', meeting: null }],
    },
  };

  const roleCreate = jest.fn().mockResolvedValue({ count: 1 });
  const meetingTouch = jest.fn().mockResolvedValue({ count: 1 });
  const announce = jest.fn();

  const tx = {
    meetingTopicResponsible: { createMany: roleCreate },
    meeting: { updateMany: meetingTouch },
  };

  const prisma = {
    topicSession: {
      findFirst: jest.fn().mockResolvedValue({
        ...session,
        // `findSession` am Ende braucht die volle Form; die Rechtefrage davor
        // nur Owner, Mitarbeit und Crew.
        title: null,
        actionstepText: null,
        summaryText: null,
        createdAt: HEUTE,
        updatedAt: HEUTE,
        version: 0,
        meeting: null,
      }),
    },
    meeting: {
      findFirst: jest.fn().mockResolvedValue({
        date: options.date ?? KOMMENDER_DIENSTAG,
        hasTopicSlot: options.hasTopicSlot ?? true,
      }),
    },
    meetingTopicResponsible: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (options.imTermin ?? []).map((personId) => ({ personId })),
        ),
    },
    topicSessionResponsible: {
      findMany: jest.fn(({ where }: { where: { sessionId: string } }) =>
        Promise.resolve(
          where.sessionId === 's1'
            ? (options.responsibleIds ?? ['p1']).map((personId) => ({
                personId,
              }))
            : [],
        ),
      ),
    },
    person: {
      count: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(new Set(where.id.in).size),
      ),
    },
    $transaction: jest.fn((run: (client: unknown) => unknown) => run(tx)),
  };

  const links = { join: jest.fn(), leave: jest.fn(), reconcile: jest.fn() };

  const availability = {
    assertAvailable: jest.fn(),
    findAvailable: jest.fn((_h: string, _m: string, ids: string[]) =>
      Promise.resolve(options.koennen ?? ids),
    ),
  };

  const service = withClock(
    new TopicSessionService(
      prisma as unknown as PrismaService,
      { announce } as unknown as RoleAssignmentNotifier,
      availability as unknown as AvailabilityService,
      links as unknown as TopicLinkService,
    ),
  );

  return { service, links, roleCreate, announce, availability };
}

/** Wen `createMany` in die Abend-Rolle schreiben wollte. */
const eingetragen = (fn: jest.Mock): string[] =>
  (fn.mock.calls[0]?.[0].data as { personId: string }[] | undefined)?.map(
    (row) => row.personId,
  ) ?? [];

describe('setSessionResponsibles', () => {
  it('trägt die Dazugekommenen an der Einheit ein', async () => {
    const { service, links } = setup({ responsibleIds: ['p1'] });

    await service.setSessionResponsibles(
      'hk',
      's1',
      { personIds: ['p1', 'p2'] },
      ICH,
    );

    expect(links.join).toHaveBeenCalledWith(expect.anything(), 's1', 't1', [
      'p2',
    ]);
  });

  it('und nimmt die Herausgefallenen heraus', async () => {
    const { service, links } = setup({ responsibleIds: ['p1', 'p2'] });

    await service.setSessionResponsibles(
      'hk',
      's1',
      { personIds: ['p1'] },
      ICH,
    );

    expect(links.leave).toHaveBeenCalledWith(expect.anything(), 's1', 't1', [
      'p2',
    ]);
  });

  /**
   * Eine Einheit, die niemand vorbereitet, gibt es nicht.
   *
   * Der Fall kam aus der Benutzung: Der Owner nahm sich aus seiner eigenen
   * alleinstehenden Einheit heraus — und hatte danach weiter Schreibrecht (das
   * kommt aus `topic.owner_person_id`), stand aber nirgends mehr. Was dasteht,
   * soll stimmen.
   */
  describe('der letzte Platz bleibt besetzt', () => {
    it('weist eine leere Liste ab', async () => {
      const { service } = setup({ responsibleIds: ['p1'] });

      await expect(
        service.setSessionResponsibles('hk', 's1', { personIds: [] }, ICH),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    /**
     * Am **letzten Platz** und nicht am Owner: Ein Thema über mehrere Abende
     * darf reihum gehalten werden, und wer Einheit 3 abgibt, soll das können.
     */
    it('lässt den Owner gehen, solange jemand bleibt', async () => {
      const { service, links } = setup({
        ownerPersonId: 'p1',
        responsibleIds: ['p1', 'p2'],
      });

      await service.setSessionResponsibles(
        'hk',
        's1',
        { personIds: ['p2'] },
        ICH,
      );

      expect(links.leave).toHaveBeenCalledWith(expect.anything(), 's1', 't1', [
        'p1',
      ]);
    });
  });

  describe('die Kopplung in die Abend-Rolle', () => {
    it('trägt die Dazugekommenen auch für den Abend ein', async () => {
      const { service, roleCreate } = setup({
        responsibleIds: ['p1', 'p2'],
        imTermin: ['p1'],
      });

      await service.setSessionResponsibles(
        'hk',
        's1',
        { personIds: ['p1', 'p2'] },
        ICH,
      );

      expect(eingetragen(roleCreate)).toEqual(['p2']);
    });

    it('und sagt es ihnen', async () => {
      const { service, announce } = setup({
        responsibleIds: ['p1', 'p2'],
        imTermin: ['p1'],
      });

      await service.setSessionResponsibles(
        'hk',
        's1',
        { personIds: ['p1', 'p2'] },
        ICH,
      );

      expect(announce).toHaveBeenCalledWith('m1', 'TOPIC', ['p2'], 'p1');
    });

    /**
     * Die Asymmetrie, und sie ist Absicht: Wer nicht mehr vorbereitet, steht
     * vielleicht trotzdem vorne. Ausgetragen wird am Termin, von Hand.
     */
    it('trägt niemanden aus der Abend-Rolle aus', async () => {
      const { service, roleCreate } = setup({
        responsibleIds: ['p1', 'p2'],
        imTermin: ['p1', 'p2'],
      });

      await service.setSessionResponsibles(
        'hk',
        's1',
        { personIds: ['p1'] },
        ICH,
      );

      expect(roleCreate).not.toHaveBeenCalled();
    });

    /**
     * Mitvorbereiten kann man auch, wenn man am Abend selbst fehlt. Deshalb
     * wird so jemand übersprungen, statt den ganzen Aufruf scheitern zu lassen.
     */
    it('überspringt, wer an dem Abend nicht kann', async () => {
      const { service, roleCreate } = setup({
        responsibleIds: ['p1', 'p2'],
        imTermin: ['p1'],
        koennen: [],
      });

      await service.setSessionResponsibles(
        'hk',
        's1',
        { personIds: ['p1', 'p2'] },
        ICH,
      );

      expect(roleCreate).not.toHaveBeenCalled();
    });

    it('lässt einen vergangenen Abend in Ruhe', async () => {
      const { service, roleCreate } = setup({
        date: LETZTER_DIENSTAG,
        responsibleIds: ['p1', 'p2'],
      });

      await service.setSessionResponsibles(
        'hk',
        's1',
        { personIds: ['p1', 'p2'] },
        ICH,
      );

      expect(roleCreate).not.toHaveBeenCalled();
    });

    it('und einen Abend ohne Baustein „Thema" auch', async () => {
      const { service, roleCreate } = setup({
        hasTopicSlot: false,
        responsibleIds: ['p1', 'p2'],
      });

      await service.setSessionResponsibles(
        'hk',
        's1',
        { personIds: ['p1', 'p2'] },
        ICH,
      );

      expect(roleCreate).not.toHaveBeenCalled();
    });

    /** Ein Entwurf hängt an keinem Abend — da gibt es nichts zu koppeln. */
    it('tut nichts bei einer Einheit ohne Abend', async () => {
      const { service, roleCreate } = setup({
        meetingId: null,
        responsibleIds: ['p1', 'p2'],
      });

      await service.setSessionResponsibles(
        'hk',
        's1',
        { personIds: ['p1', 'p2'] },
        ICH,
      );

      expect(roleCreate).not.toHaveBeenCalled();
    });
  });

  describe('wer die Liste ändern darf', () => {
    it('der Owner', async () => {
      const { service, links } = setup({ ownerPersonId: 'p1' });

      await service.setSessionResponsibles(
        'hk',
        's1',
        { personIds: ['p1', 'p2'] },
        ICH,
      );

      expect(links.join).toHaveBeenCalled();
    });

    /**
     * Und wer die Einheit vorbereitet, ohne am Thema zu hängen. Wer
     * vorbereitet, soll sich Hilfe holen können, ohne fragen zu müssen — weiter
     * als bis zu dieser Einheit trägt das Recht ohnehin nicht.
     */
    it('auch die Crew selbst', async () => {
      const { service, links } = setup({
        ownerPersonId: 'p9',
        responsibleIds: ['p1'],
      });

      await service.setSessionResponsibles(
        'hk',
        's1',
        { personIds: ['p1', 'p2'] },
        ICH,
      );

      expect(links.join).toHaveBeenCalled();
    });

    it('sonst niemand', async () => {
      const { service } = setup({
        ownerPersonId: 'p9',
        responsibleIds: ['p9'],
      });

      await expect(
        service.setSessionResponsibles('hk', 's1', { personIds: ['p1'] }, ICH),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
