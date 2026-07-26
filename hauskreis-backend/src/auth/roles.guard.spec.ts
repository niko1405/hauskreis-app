import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLE_ADMIN, ROLE_MEMBER, type AuthenticatedUser } from './auth.types';

function contextWith(user?: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function guardRequiring(roles: string[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: () => roles,
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

const member: AuthenticatedUser = {
  keycloakUserId: 'kc-1',
  roles: [ROLE_MEMBER],
};
const admin: AuthenticatedUser = {
  keycloakUserId: 'kc-2',
  roles: [ROLE_MEMBER, ROLE_ADMIN],
};

describe('RolesGuard', () => {
  it('allows routes that declare no roles', () => {
    expect(guardRequiring(undefined).canActivate(contextWith(member))).toBe(
      true,
    );
  });

  it('allows a user holding the required role', () => {
    expect(guardRequiring([ROLE_ADMIN]).canActivate(contextWith(admin))).toBe(
      true,
    );
  });

  it('rejects a user missing the required role', () => {
    expect(() =>
      guardRequiring([ROLE_ADMIN]).canActivate(contextWith(member)),
    ).toThrow(ForbiddenException);
  });

  it('rejects when no user was attached to the request', () => {
    expect(() =>
      guardRequiring([ROLE_ADMIN]).canActivate(contextWith(undefined)),
    ).toThrow(ForbiddenException);
  });
});
