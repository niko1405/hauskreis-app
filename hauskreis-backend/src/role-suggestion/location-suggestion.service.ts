import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingStatus } from '../../generated/prisma/enums';
import { rankLocations, type LocationSuggestion } from './location-ranking';

/**
 * Suggests where the next meeting could take place.
 *
 * Structurally the same idea as `RoleSuggestionService` — history plus a
 * ranking — but a different question ("welcher Ort ist unter seinem Soll"),
 * so it stays a separate service rather than a fourth role adapter.
 */
@Injectable()
export class LocationSuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  async suggestLocations(
    hauskreisId: string,
    targetDate: Date,
    options: { excludeMeetingId?: string } = {},
  ): Promise<LocationSuggestion[]> {
    const [locations, meetings] = await Promise.all([
      this.prisma.location.findMany({
        where: { hauskreisId, active: true },
        select: {
          id: true,
          name: true,
          frequencyFactor: true,
          requiresHost: true,
        },
      }),
      this.prisma.meeting.findMany({
        where: {
          hauskreisId,
          status: { not: MeetingStatus.CANCELLED },
          locationId: { not: null },
          // Everything up to (not including) the date being planned, so a
          // meeting already pencilled in further ahead doesn't count as history.
          date: { lt: targetDate },
          ...(options.excludeMeetingId
            ? { id: { not: options.excludeMeetingId } }
            : {}),
        },
        select: { date: true, locationId: true },
      }),
    ]);

    return rankLocations({
      locations,
      uses: meetings.map((meeting) => ({
        locationId: meeting.locationId as string,
        date: meeting.date,
      })),
      targetDate,
    });
  }
}
