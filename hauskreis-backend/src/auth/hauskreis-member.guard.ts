import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { HAUSKREIS_ADMIN_KEY } from './hauskreis-admin.decorator';
import { PersonRole } from '../../generated/prisma/enums';

/**
 * Die Tür, die es bis eben gar nicht gab.
 *
 * `hauskreisId` war ein reiner Pfadparameter — geprüft wurde nur, dass es eine
 * UUID ist. Nichts fragte, ob die anfragende Person zu diesem Hauskreis gehört.
 * Wer eine fremde Id kannte (und `GET /api/hauskreise` gab sie alle heraus),
 * konnte dort alles lesen und schreiben. Solange es einen Hauskreis gibt, fällt
 * das nicht auf; ab dem zweiten ist es der eigentliche Fehler.
 *
 * Der Guard löst die Mitgliedschaft **einmal** je Anfrage auf und legt sie an
 * `request.membership` ab. Davon lebt `@HauskreisAdmin()`: die Frage „darf die
 * Person das hier" ist damit eine Eigenschaft der Mitgliedschaft und keine
 * realmweite Rolle mehr — wer sich einen eigenen Hauskreis anlegt, ist dort
 * Admin, ohne es überall zu werden.
 */
@Injectable()
export class HauskreisMemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const hauskreisId = (request.params as Record<string, string | undefined>)
      .hauskreisId;

    // Routen ohne Hauskreis im Pfad (`/api/me`, `/api/push/…`) gehen den Guard
    // nichts an — sie hängen ohnehin an der eigenen Person.
    if (!hauskreisId) return true;

    const membership = await this.prisma.person.findFirst({
      where: {
        hauskreisId,
        keycloakUserId: request.user?.keycloakUserId,
        active: true,
      },
      select: { id: true, hauskreisId: true, role: true },
    });

    if (!membership) {
      // Bewusst 403 und nicht 404: dass es diesen Hauskreis gibt, weiß man
      // ohnehin schon, wenn man seine Id hat. Ein 404 wäre eine Notlüge, die
      // beim Suchen des Fehlers nur im Weg steht.
      throw new ForbiddenException('Du gehörst nicht zu diesem Hauskreis');
    }

    request.membership = membership;

    const needsAdmin = this.reflector.getAllAndOverride<boolean>(
      HAUSKREIS_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (needsAdmin && membership.role !== PersonRole.ADMIN) {
      throw new ForbiddenException(
        'Dafür brauchst du Admin-Rechte in diesem Hauskreis',
      );
    }

    return true;
  }
}
