import { NotFoundException } from '@nestjs/common';
import { PersonService } from './person.service';
// Type-only: keeps Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';
import type { KeycloakAdminService } from '../auth/keycloak-admin.service';
import type { LocationService } from '../location/location.service';
import type { AuthenticatedUser } from '../auth/auth.types';

type PersonDelegate = {
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
  create: jest.Mock;
};

function setup() {
  const person: PersonDelegate = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    create: jest.fn(),
  };
  const keycloakAdmin = {
    inviteUser: jest.fn(),
    deleteUser: jest.fn(),
    deleteUserByEmail: jest.fn(),
  };
  // Zieht sonst den Namen einer Wohnung nach; hier interessiert nur, dass es
  // aufgerufen werden *kann*.
  const locations = { syncHomeName: jest.fn() };
  const service = new PersonService(
    { person } as unknown as PrismaService,
    keycloakAdmin as unknown as KeycloakAdminService,
    locations as unknown as LocationService,
  );
  return { service, person, keycloakAdmin, locations };
}

const user: AuthenticatedUser = {
  keycloakUserId: 'kc-123',
  email: 'lea@example.com',
  roles: ['member'],
};

describe('PersonService.resolveForUser', () => {
  it('returns the already linked person without touching the email lookup', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue({
      id: 'p1',
      keycloakUserId: 'kc-123',
      acceptedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(service.resolveForUser(user)).resolves.toEqual({
      id: 'p1',
      keycloakUserId: 'kc-123',
      acceptedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(person.findFirst).not.toHaveBeenCalled();
    expect(person.update).not.toHaveBeenCalled();
  });

  it('links an unlinked person by email on first login', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue(null);
    person.findMany.mockResolvedValue([{ id: 'p2' }]);
    person.update.mockResolvedValue({ id: 'p2', keycloakUserId: 'kc-123' });

    await expect(service.resolveForUser(user)).resolves.toEqual({
      id: 'p2',
      keycloakUserId: 'kc-123',
    });
    // `active: true` schließt aus, was jemand verlassen hat — sonst holte der
    // nächste Login ihn dorthin zurück.
    expect(person.findMany).toHaveBeenCalledWith({
      where: { email: 'lea@example.com', keycloakUserId: null, active: true },
      select: { id: true },
    });
    expect(person.update).toHaveBeenCalledWith({
      where: { id: 'p2' },
      // Der erste Login ist der Moment, in dem die Einladung angenommen ist.
      data: { keycloakUserId: 'kc-123', acceptedAt: expect.any(Date) },
    });
  });

  /**
   * Sonst entschiede die Reihenfolge, in der Postgres die Zeilen zurückgibt,
   * in welchem Hauskreis jemand landet. Das Frontend zeigt stattdessen die
   * offenen Einladungen zur Auswahl.
   */
  it('entscheidet bei mehreren offenen Einladungen nicht selbst', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue(null);
    person.findMany.mockResolvedValue([{ id: 'p2' }, { id: 'p3' }]);

    await expect(service.resolveForUser(user)).rejects.toThrow(
      NotFoundException,
    );
    expect(person.update).not.toHaveBeenCalled();
  });

  it('marks an invited person as arrived on their first login', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue({
      id: 'p3',
      keycloakUserId: 'kc-123',
      acceptedAt: null,
    });
    person.update.mockResolvedValue({ id: 'p3', acceptedAt: new Date() });

    await service.resolveForUser(user);

    expect(person.update).toHaveBeenCalledWith({
      where: { id: 'p3' },
      data: { acceptedAt: expect.any(Date) },
    });
  });

  it('leaves the arrival date alone on every login after the first', async () => {
    const { service, person } = setup();
    const arrived = new Date('2026-01-02T03:04:05.000Z');
    person.findUnique.mockResolvedValue({
      id: 'p3',
      keycloakUserId: 'kc-123',
      acceptedAt: arrived,
    });

    await expect(service.resolveForUser(user)).resolves.toEqual({
      id: 'p3',
      keycloakUserId: 'kc-123',
      acceptedAt: arrived,
    });
    expect(person.update).not.toHaveBeenCalled();
  });

  it('throws when no person matches the email', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue(null);
    person.findMany.mockResolvedValue([]);

    await expect(service.resolveForUser(user)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws when the token carries no email to match on', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue(null);

    await expect(
      service.resolveForUser({ keycloakUserId: 'kc-9', roles: [] }),
    ).rejects.toThrow(NotFoundException);
    expect(person.findMany).not.toHaveBeenCalled();
  });
});

describe('PersonService.invite', () => {
  const invitation = {
    name: 'Lea',
    email: 'lea@example.com',
    role: 'member' as const,
  };

  it('rolls the Keycloak account back when the local insert fails', async () => {
    const { service, person, keycloakAdmin } = setup();
    keycloakAdmin.inviteUser.mockResolvedValue({
      created: true,
      invitationEmailSent: true,
    });
    person.create.mockRejectedValue(new Error('duplicate email'));

    await expect(service.invite('hk-1', invitation)).rejects.toThrow(
      'duplicate email',
    );

    expect(keycloakAdmin.deleteUserByEmail).toHaveBeenCalledWith(
      'lea@example.com',
    );
  });

  /**
   * Sonst nähme ein misslungener Versuch, jemanden einzuladen, einem Menschen
   * den Zugang zu dem Hauskreis weg, in dem er längst ist.
   */
  it('lässt ein Konto stehen, das es vorher schon gab', async () => {
    const { service, person, keycloakAdmin } = setup();
    keycloakAdmin.inviteUser.mockResolvedValue({
      created: false,
      invitationEmailSent: false,
    });
    person.create.mockRejectedValue(new Error('duplicate email'));

    await expect(service.invite('hk-1', invitation)).rejects.toThrow(
      'duplicate email',
    );

    expect(keycloakAdmin.deleteUserByEmail).not.toHaveBeenCalled();
  });

  /** Eine Einladung nimmt niemandem seine bestehende Mitgliedschaft weg. */
  it('legt die Person ohne Keycloak-Verknüpfung an', async () => {
    const { service, person, keycloakAdmin } = setup();
    keycloakAdmin.inviteUser.mockResolvedValue({
      created: true,
      invitationEmailSent: true,
    });
    person.create.mockResolvedValue({ id: 'p9' });

    await service.invite('hk-1', { ...invitation, role: 'admin' });

    expect(person.create).toHaveBeenCalledWith({
      data: {
        hauskreisId: 'hk-1',
        name: 'Lea',
        email: 'lea@example.com',
        role: 'ADMIN',
      },
    });
  });
});
