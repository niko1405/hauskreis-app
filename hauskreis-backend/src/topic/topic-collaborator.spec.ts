/**
 * Das themaweite Schreibrecht — ab jetzt eine Entscheidung, keine Nebenwirkung.
 *
 * Bis eben gab es diesen Weg nicht, weil er nicht nötig schien: Wer eine Einheit
 * hielt, wurde automatisch Mitarbeiter:in. Genau das ist weggefallen — es gab
 * jemandem, der einmal an einem Abend aushalf, Hoheit über ein Thema, das über
 * Monate läuft. Wer hier steht, darf **jede** Einheit des Themas ändern und neue
 * anlegen; das ist mehr, als man im Vorbeigehen vergibt, und deshalb darf es nur
 * der Owner.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TopicService } from './topic.service';
import type { PrismaService } from '../prisma/prisma.service';
import { withClock } from '../meeting/group-clock.testing';

const BERLIN = 'Europe/Berlin';
const OWNER = { personId: 'p1', isAdmin: false, zone: BERLIN };
const MITARBEIT = { personId: 'p2', isAdmin: false, zone: BERLIN };

function setup(options: { imHauskreis?: boolean } = {}) {
  const collaboratorCreate = jest.fn().mockResolvedValue({ count: 1 });
  const topicTouch = jest.fn().mockResolvedValue({ count: 1 });

  const tx = {
    topicCollaborator: { createMany: collaboratorCreate },
    topic: { updateMany: topicTouch },
  };

  const prisma = {
    topic: {
      findFirst: jest.fn().mockResolvedValue({
        id: 't1',
        title: 'Apostelgeschichte',
        status: 'RUNNING',
        standalone: false,
        ownerPersonId: 'p1',
        collaborators: [{ personId: 'p2' }],
      }),
    },
    person: {
      findFirst: jest
        .fn()
        .mockResolvedValue((options.imHauskreis ?? true) ? { id: 'p3' } : null),
    },
    $transaction: jest.fn((run: (client: unknown) => unknown) => run(tx)),
  };

  const service = withClock(
    new TopicService(prisma as unknown as PrismaService),
  );

  return { service, collaboratorCreate, topicTouch };
}

describe('addCollaborator', () => {
  it('trägt die Person am Thema ein', async () => {
    const { service, collaboratorCreate } = setup();

    await service.addCollaborator('hk', 't1', 'p3', OWNER);

    expect(collaboratorCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ topicId: 't1', personId: 'p3' }],
      }),
    );
  });

  /**
   * Ohne den Sprung stünde sie in der Antwort des Themas erst nach einem
   * Neuladen: Der ETag kommt aus `topic.version`, und die Mitarbeiter-Liste
   * hängt an einer eigenen Tabelle.
   */
  it('hebt die Revision des Themas an', async () => {
    const { service, topicTouch } = setup();

    await service.addCollaborator('hk', 't1', 'p3', OWNER);

    expect(topicTouch).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' } }),
    );
  });

  /** Ein Mitarbeiter darf jeden Text ändern, aber niemanden nachziehen. */
  it('lässt nur den Owner ran', async () => {
    const { service } = setup();

    await expect(
      service.addCollaborator('hk', 't1', 'p3', MITARBEIT),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /** Der Fremdschlüssel allein ließe ein Thema auf einen fremden Hauskreis zeigen. */
  it('hütet die Mandantengrenze', async () => {
    const { service } = setup({ imHauskreis: false });

    await expect(
      service.addCollaborator('hk', 't1', 'p3', OWNER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /** Er ist der Owner — eine zweite Zeile daneben sagte nichts dazu. */
  it('trägt den Owner nicht als seinen eigenen Mitarbeiter ein', async () => {
    const { service, collaboratorCreate } = setup();

    await service.addCollaborator('hk', 't1', 'p1', OWNER);

    expect(collaboratorCreate).not.toHaveBeenCalled();
  });
});
