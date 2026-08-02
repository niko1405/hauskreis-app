/**
 * Wie ein Termin heißt und was er braucht.
 *
 * Die Regel dahinter (CLAUDE.md §5): ein „Standard"-Termin hat ein Thema, ein
 * „Lobpreis/Gebetsabend" stattdessen ein Testimony oder gar nichts, und ein
 * „Custom"-Termin muss überhaupt nichts erfüllen.
 */
import type { AssignmentRole, MeetingType } from './api/types';

export const MEETING_TYPE_LABEL: Record<MeetingType, string> = {
  STANDARD: 'Hauskreis-Abend',
  LOBPREIS_GEBET: 'Lobpreis & Gebet',
  CUSTOM: 'Besonderer Termin',
};

/** Der Lobpreisabend hat kein Thema — das ist kein fehlender Wert. */
export function hasTopicSlot(type: MeetingType): boolean {
  return type !== 'LOBPREIS_GEBET';
}

export function hasTestimonySlot(type: MeetingType): boolean {
  return type === 'LOBPREIS_GEBET';
}

/**
 * Die Überschrift einer Terminkarte: der eigene Titel, sonst das Thema, sonst
 * die Art des Termins. Ein Thema ohne Titel bleibt bewusst ohne Titel.
 */
export function meetingHeadline(meeting: {
  type: MeetingType;
  title: string | null;
  topic?: { title: string | null } | null;
}): string {
  if (meeting.title) return meeting.title;
  if (meeting.topic?.title) return meeting.topic.title;
  return MEETING_TYPE_LABEL[meeting.type];
}

export const ROLE_LABEL: Record<AssignmentRole, string> = {
  HOST: 'Host',
  TOPIC: 'Thema',
  SONG: 'Musik',
  PRAYER_BUDDY: 'Gebetsbuddy',
};

/** Überschrift des Zuteilungs-Sheets, im Ton der App. */
export const ROLE_QUESTION: Record<AssignmentRole, string> = {
  HOST: 'Wer hostet?',
  TOPIC: 'Wer macht das Thema?',
  SONG: 'Wer macht die Musik?',
  PRAYER_BUDDY: 'Wer betet miteinander?',
};

/** Für Karten mit Ort: „In Maps öffnen" statt einer Adresse zum Abtippen. */
export function mapsUrl(location: {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}): string {
  if (location.latitude !== null && location.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
  }
  const query = encodeURIComponent(location.address ?? location.name);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
