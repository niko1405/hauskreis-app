import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePushSubscriptionDto } from './dto/push-subscription.dto';

@Injectable()
export class PushSubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForPerson(personId: string) {
    return this.prisma.pushSubscription.findMany({
      where: { personId },
      select: { id: true, endpoint: true, userAgent: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Registers a device.
   *
   * Upserted on the endpoint: re-subscribing in the same browser produces the
   * same endpoint, and it may now belong to a different person (shared device),
   * so the row is reassigned rather than duplicated.
   */
  subscribe(
    personId: string,
    dto: CreatePushSubscriptionDto,
    userAgent?: string,
  ) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: {
        personId,
        p256dhKey: dto.keys.p256dh,
        authKey: dto.keys.auth,
        userAgent: userAgent ?? null,
      },
      create: {
        personId,
        endpoint: dto.endpoint,
        p256dhKey: dto.keys.p256dh,
        authKey: dto.keys.auth,
        userAgent: userAgent ?? null,
      },
      select: { id: true, endpoint: true, userAgent: true, createdAt: true },
    });
  }

  async unsubscribe(personId: string, endpoint: string): Promise<void> {
    const { count } = await this.prisma.pushSubscription.deleteMany({
      // Scoped by person so nobody can unsubscribe someone else's device.
      where: { endpoint, personId },
    });

    if (count === 0) {
      throw new NotFoundException('No such push subscription for this account');
    }
  }
}
