import type { PersonRole } from '../../generated/prisma/enums';

export interface AuthenticatedUser {
  keycloakUserId: string;
  email?: string;
  name?: string;
  roles: string[];
}

/**
 * Die Mitgliedschaft im Hauskreis aus dem Pfad, aufgelöst vom
 * `HauskreisMemberGuard`. Steht an Routen mit `:hauskreisId` immer bereit —
 * ohne sie wäre die Anfrage schon an der Tür gescheitert.
 */
export interface HauskreisMembership {
  /** Die `Person`-Id **in diesem Hauskreis**. */
  id: string;
  hauskreisId: string;
  role: PersonRole;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
    membership?: HauskreisMembership;
  }
}
