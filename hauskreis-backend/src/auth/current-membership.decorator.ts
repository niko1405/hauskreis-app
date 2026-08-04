import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { HauskreisMembership } from './auth.types';

/**
 * Die eigene Mitgliedschaft im Hauskreis aus dem Pfad.
 *
 * Aufgelöst hat sie schon der `HauskreisMemberGuard` — hier wird sie nur
 * herausgereicht. Das erspart den Controllern den Umweg über
 * `people.resolveForUser(user)` und beantwortet nebenbei die Frage, ob jemand
 * hier Admin ist, ohne eine zweite Abfrage.
 */
export const CurrentMembership = createParamDecorator(
  (_data: unknown, context: ExecutionContext): HauskreisMembership => {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.membership) {
      // Nur erreichbar, wenn jemand diesen Decorator an einer Route ohne
      // `:hauskreisId` benutzt — dort gibt es keine Mitgliedschaft aufzulösen.
      throw new InternalServerErrorException(
        'CurrentMembership an einer Route ohne :hauskreisId benutzt',
      );
    }

    return request.membership;
  },
);
