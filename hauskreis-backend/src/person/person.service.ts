import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import type { IfMatchCondition } from '../common/http/etag';
import type {
  CreatePersonDto,
  InvitePersonDto,
  UpdatePersonDto,
} from './dto/person.dto';

@Injectable()
export class PersonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  findAll(hauskreisId: string) {
    return this.prisma.person.findMany({
      where: { hauskreisId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(hauskreisId: string, id: string) {
    const person = await this.prisma.person.findFirst({
      where: { id, hauskreisId },
    });

    if (!person) {
      throw new NotFoundException(`Person ${id} not found`);
    }

    return person;
  }

  create(hauskreisId: string, dto: CreatePersonDto) {
    return this.prisma.person.create({
      data: {
        hauskreisId,
        name: dto.name,
        email: dto.email,
        birthdate: dto.birthdate ? new Date(dto.birthdate) : null,
        playsInstrument: dto.playsInstrument,
        canHost: dto.canHost,
      },
    });
  }

  update(
    hauskreisId: string,
    id: string,
    dto: UpdatePersonDto,
    condition?: IfMatchCondition,
  ) {
    return updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.person.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            name: dto.name,
            email: dto.email,
            birthdate: dto.birthdate ? new Date(dto.birthdate) : undefined,
            playsInstrument: dto.playsInstrument,
            canHost: dto.canHost,
            active: dto.active,
            version: { increment: 1 },
          },
        }),
      exists: () =>
        this.prisma.person.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findOne(hauskreisId, id),
      notFoundMessage: `Person ${id} not found`,
    });
  }

  async remove(hauskreisId: string, id: string) {
    await this.findOne(hauskreisId, id);
    await this.prisma.person.delete({ where: { id } });
  }

  /**
   * Creates the Keycloak account first, then the local person row. If the
   * local insert fails we roll the Keycloak user back, so a failed invite
   * never leaves an orphaned account behind.
   */
  async invite(hauskreisId: string, dto: InvitePersonDto) {
    const { keycloakUserId, invitationEmailSent } =
      await this.keycloakAdmin.inviteUser({
        email: dto.email,
        name: dto.name,
        role: dto.role,
      });

    try {
      const person = await this.prisma.person.create({
        data: {
          hauskreisId,
          keycloakUserId,
          name: dto.name,
          email: dto.email,
          birthdate: dto.birthdate ? new Date(dto.birthdate) : null,
          playsInstrument: dto.playsInstrument,
          canHost: dto.canHost,
        },
      });

      return { ...person, invitationEmailSent };
    } catch (error) {
      await this.keycloakAdmin.deleteUser(keycloakUserId);
      throw error;
    }
  }

  /**
   * Resolves the person row for a logged-in Keycloak user. On first login the
   * row is still unlinked, so we match it by email and attach the subject id.
   */
  async resolveForUser(user: AuthenticatedUser) {
    const linked = await this.prisma.person.findUnique({
      where: { keycloakUserId: user.keycloakUserId },
    });

    if (linked) {
      return linked;
    }

    if (!user.email) {
      throw new NotFoundException(
        'No person record is linked to this account and the token carries no email to match on',
      );
    }

    const unlinked = await this.prisma.person.findFirst({
      where: { email: user.email, keycloakUserId: null },
    });

    if (!unlinked) {
      throw new NotFoundException(
        `No person record found for ${user.email}. Ask an admin to invite you.`,
      );
    }

    return this.prisma.person.update({
      where: { id: unlinked.id },
      data: { keycloakUserId: user.keycloakUserId },
    });
  }
}
