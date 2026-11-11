import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

const linkSelect = {
  code: true,
  expiresAt: true,
  createdAt: true,
  joinCount: true,
  createdBy: { select: { id: true, name: true } },
} as const;

/**
 * Der Einladungslink eines Hauskreises — höchstens einer.
 *
 * Er verknüpft über ein **Geheimnis**, nicht über eine Adresse: Wer ihn hat,
 * tritt bei, mit welchem Konto auch immer. Das ist der Unterschied zur
 * E-Mail-Einladung, und der Grund, warum die Rolle hier gar nicht erst steht —
 * über den Link kommt man immer als Mitglied herein.
 *
 * Das Beitreten selbst steht in `MembershipService.joinViaLink`, wie jeder
 * andere Weg in einen Hauskreis hinein und aus ihm heraus.
 */
@Injectable()
export class InviteLinkService {
  constructor(private readonly prisma: PrismaService) {}

  /** Auch ein abgelaufener: „seit gestern abgelaufen" sagt mehr als nichts. */
  async get(hauskreisId: string) {
    return {
      link: await this.prisma.hauskreisInviteLink.findUnique({
        where: { hauskreisId },
        select: linkSelect,
      }),
    };
  }

  /**
   * Ein neuer Link — der alte ist damit sofort tot.
   *
   * Immer ein neuer Code, auch wenn nur die Laufzeit verlängert werden soll:
   * „Erneuern" ist der Knopf für „der alte ist irgendwo gelandet, wo er nicht
   * hingehört", und ein Verlängern, das den alten weiter gelten lässt, wäre
   * genau dort die falsche Antwort.
   */
  async replace(
    hauskreisId: string,
    createdByPersonId: string,
    validDays: number,
  ) {
    const code = newCode();
    const expiresAt = new Date(Date.now() + validDays * DAY_MS);

    return {
      link: await this.prisma.hauskreisInviteLink.upsert({
        where: { hauskreisId },
        create: { hauskreisId, code, expiresAt, createdByPersonId },
        update: {
          code,
          expiresAt,
          createdByPersonId,
          createdAt: new Date(),
          // Gezählt wird je Link: Wie oft der vorige benutzt wurde, sagt
          // nichts über den, der jetzt herumgeht.
          joinCount: 0,
        },
        select: linkSelect,
      }),
    };
  }

  /** Abschalten. Kein Link ist ein gültiger Zustand, kein Fehler. */
  async remove(hauskreisId: string): Promise<void> {
    await this.prisma.hauskreisInviteLink.deleteMany({
      where: { hauskreisId },
    });
  }

  /**
   * Was hinter einem Code steckt.
   *
   * Unbekannt, erneuert oder abgelaufen ist für den, der davorsteht, dasselbe:
   * dieser Link führt nirgends mehr hin. Eine Unterscheidung verriete nur,
   * dass es den Code einmal gab.
   */
  async resolve(code: string) {
    const link = await this.prisma.hauskreisInviteLink.findUnique({
      where: { code },
      select: {
        expiresAt: true,
        hauskreis: { select: { id: true, name: true } },
      },
    });

    if (!link || link.expiresAt <= new Date()) {
      throw new NotFoundException(
        'Dieser Link gilt nicht mehr — frag im Hauskreis nach einem neuen.',
      );
    }

    return { hauskreis: link.hauskreis };
  }
}

/**
 * 128 Bit Zufall, base64url — 22 Zeichen, die in eine Adresse passen, ohne
 * kodiert zu werden. Zum Erraten ist das zu viel; zum Abtippen muss es niemand.
 */
function newCode(): string {
  return randomBytes(16).toString('base64url');
}
