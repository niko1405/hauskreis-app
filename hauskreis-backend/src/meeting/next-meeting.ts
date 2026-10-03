/**
 * Drei Fragen, die mehrere Nachrichten über den nächsten Abend stellen — und
 * die deshalb je einmal beantwortet werden.
 *
 * Gebraucht von der Uhrzeit-Änderung, den geänderten Bausteinen und der
 * Erinnerung an freie Rollen. Reine Funktionen über Prisma statt eines
 * Dienstes: Sie haben keinen Zustand, und ein weiterer Dienst wäre eine
 * weitere Kante im Modulgraphen.
 */
import { AttendanceStatus, MeetingStatus } from '../../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';
import { ANGEKOMMEN } from '../person/angekommen';
import { notFinishedBefore } from './meeting-schedule';

/**
 * Der Abend, der als nächster ansteht — samt dem, der gerade läuft.
 *
 * Dieselbe Bedingung wie auf dem Startbildschirm (`notFinishedBefore`). Hier
 * stand einmal `date >= today`, und das ging an zwei Stellen daneben: Eine
 * Freizeit, die gestern anfing, war nicht mehr „der nächste Abend", obwohl sie
 * noch lief — und der Termin danach rückte an ihre Stelle.
 */
export async function findNextMeetingId(
  prisma: PrismaService,
  hauskreisId: string,
  today: Date,
): Promise<string | null> {
  const next = await prisma.meeting.findFirst({
    where: {
      hauskreisId,
      status: MeetingStatus.PLANNED,
      ...notFinishedBefore(today),
    },
    orderBy: { date: 'asc' },
    select: { id: true },
  });

  return next?.id ?? null;
}

/**
 * Wer an diesem Abend mit dabei ist oder es noch nicht weiß.
 *
 * Dieselbe Menge, mit der die Kapazitätsregel und die Terminkarte rechnen:
 * alle Angekommenen außer denen, die abgesagt haben. Wer nie geantwortet hat,
 * hat keine Zeile und zählt als „weiß noch nicht" — sonst bekämen genau die
 * nichts mit, die am ehesten noch zu überzeugen sind.
 */
export async function plannedAttendees(
  prisma: PrismaService,
  hauskreisId: string,
  meetingId: string,
): Promise<string[]> {
  const people = await prisma.person.findMany({
    where: {
      hauskreisId,
      ...ANGEKOMMEN,
      attendances: {
        none: { meetingId, status: AttendanceStatus.ABSENT },
      },
    },
    select: { id: true },
  });

  return people.map((person) => person.id);
}

/** Was ein Abend mitbringen muss, um seine offenen Rollen zu kennen. */
export const OPEN_ROLES_SELECT = {
  hostPersonId: true,
  location: { select: { requiresHost: true } },
  hasTopicSlot: true,
  hasSongSlot: true,
  hasTestimonySlot: true,
  hasSnackSlot: true,
  testimonyPersonId: true,
  // Nur die Ids: Gefragt ist „steht jemand da", nicht wer.
  topicResponsibles: { select: { personId: true } },
  songLeaders: { select: { personId: true } },
  snackResponsibles: { select: { personId: true } },
} as const;

export interface RoleFlags {
  host: boolean;
  topic: boolean;
  song: boolean;
  testimony: boolean;
  snack: boolean;
}

/**
 * Welche Rollen an diesem Abend fehlen.
 *
 * Dieselbe Unterscheidung wie `meetingRoles` im Frontend: **fehlt** gegen
 * **gibt es hier nicht**. Ein Baustein, der aus ist, fehlt nicht — und ein
 * Ort, der keinen Gastgeber braucht (der Schlosspark), auch nicht. Ohne Ort
 * fehlt er dagegen: Irgendwo muss man sich treffen.
 */
export function openRoles(meeting: {
  hostPersonId: string | null;
  location: { requiresHost: boolean } | null;
  hasTopicSlot: boolean;
  hasSongSlot: boolean;
  hasTestimonySlot: boolean;
  hasSnackSlot: boolean;
  testimonyPersonId: string | null;
  topicResponsibles: readonly unknown[];
  songLeaders: readonly unknown[];
  snackResponsibles: readonly unknown[];
}): RoleFlags {
  return {
    host:
      meeting.hostPersonId === null &&
      (meeting.location === null || meeting.location.requiresHost),
    topic: meeting.hasTopicSlot && meeting.topicResponsibles.length === 0,
    song: meeting.hasSongSlot && meeting.songLeaders.length === 0,
    testimony: meeting.hasTestimonySlot && meeting.testimonyPersonId === null,
    snack: meeting.hasSnackSlot && meeting.snackResponsibles.length === 0,
  };
}
