export const ROLE_ADMIN = 'admin';
export const ROLE_MEMBER = 'member';

export interface AuthenticatedUser {
  keycloakUserId: string;
  email?: string;
  name?: string;
  roles: string[];
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
