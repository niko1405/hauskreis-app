import type { PersonRole } from '../../generated/prisma/enums';

export interface AuthenticatedUser {
  keycloakUserId: string;
  email?: string;
  /** `preferred_username` — der Name, mit dem sich jemand angemeldet hat. */
  username?: string;
  name?: string;
  /**
   * Ob Keycloak die Adresse als bestätigt führt.
   *
   * Nicht kosmetisch: `PersonService.resolveForUser` verknüpft ein Konto über
   * die **E-Mail-Adresse** mit einer offenen Einladung. Ohne Bestätigung könnte
   * sich jemand mit der Adresse einer eingeladenen Person registrieren und
   * deren Platz übernehmen.
   */
  emailVerified: boolean;
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
