import { NotFoundException } from '@nestjs/common';
import { PersonService } from './person.service';
// Type-only: keeps Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';
import type { KeycloakAdminService } from '../auth/keycloak-admin.service';
import type { AuthenticatedUser } from '../auth/auth.types';

type PersonDelegate = {
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  update: jest.Mock;
  create: jest.Mock;
};

function setup() {
  const person: PersonDelegate = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const keycloakAdmin = {
    inviteUser: jest.fn(),
    deleteUser: jest.fn(),
  };
  const service = new PersonService(
    { person } as unknown as PrismaService,
    keycloakAdmin as unknown as KeycloakAdminService,
  );
  return { service, person, keycloakAdmin };
}

const user: AuthenticatedUser = {
  keycloakUserId: 'kc-123',
  email: 'lea@example.com',
  roles: ['member'],
};

describe('PersonService.resolveForUser', () => {
  it('returns the already linked person without touching the email lookup', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue({ id: 'p1', keycloakUserId: 'kc-123' });

    await expect(service.resolveForUser(user)).resolves.toEqual({
      id: 'p1',
      keycloakUserId: 'kc-123',
    });
    expect(person.findFirst).not.toHaveBeenCalled();
    expect(person.update).not.toHaveBeenCalled();
  });

  it('links an unlinked person by email on first login', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue(null);
    person.findFirst.mockResolvedValue({ id: 'p2', keycloakUserId: null });
    person.update.mockResolvedValue({ id: 'p2', keycloakUserId: 'kc-123' });

    await expect(service.resolveForUser(user)).resolves.toEqual({
      id: 'p2',
      keycloakUserId: 'kc-123',
    });
    expect(person.findFirst).toHaveBeenCalledWith({
      where: { email: 'lea@example.com', keycloakUserId: null },
    });
    expect(person.update).toHaveBeenCalledWith({
      where: { id: 'p2' },
      data: { keycloakUserId: 'kc-123' },
    });
  });

  it('throws when no person matches the email', async () => {
    const { service, person } = setup();
    person.findUnique.mockResolvedValue(null);
    person.findFirst.mockResolvedValue(null);

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
    expect(person.findFirst).not.toHaveBeenCalled();
  });
});

describe('PersonService.invite', () => {
  it('rolls the Keycloak account back when the local insert fails', async () => {
    const { service, person, keycloakAdmin } = setup();
    keycloakAdmin.inviteUser.mockResolvedValue({
      keycloakUserId: 'kc-new',
      invitationEmailSent: true,
    });
    person.create.mockRejectedValue(new Error('duplicate email'));

    await expect(
      service.invite('hk-1', {
        name: 'Lea',
        email: 'lea@example.com',
        role: 'member',
        playsInstrument: false,
        canHost: true,
      }),
    ).rejects.toThrow('duplicate email');

    expect(keycloakAdmin.deleteUser).toHaveBeenCalledWith('kc-new');
  });
});
