/**
 * Darstellung von Personen: Initialen und Avatar-Farbe.
 *
 * Die API speichert weder das eine noch das andere — beides wird aus der Id
 * abgeleitet. Dadurch hat dieselbe Person überall dieselbe Farbe, ohne dass
 * sie irgendwo gepflegt werden müsste.
 */
import type { PersonRef } from './api/types';

/**
 * Die Paletten des Entwurfs, in derselben warmen Familie.
 *
 * Die Farbwerte stehen in `globals.css`, nicht mehr hier: Im Dunkelmodus
 * bräuchte jede von ihnen eine zweite Fassung, und die Zuordnung Person →
 * Palette hat damit nichts zu tun. Hier bleibt die Zuordnung, dort liegt die
 * Farbe.
 */
const AVATAR_SCHEMES = [
  { bg: 'bg-avatar-1-bg', text: 'text-avatar-1-fg' },
  { bg: 'bg-avatar-2-bg', text: 'text-avatar-2-fg' },
  { bg: 'bg-avatar-3-bg', text: 'text-avatar-3-fg' },
  { bg: 'bg-avatar-4-bg', text: 'text-avatar-4-fg' },
  { bg: 'bg-avatar-5-bg', text: 'text-avatar-5-fg' },
  { bg: 'bg-avatar-6-bg', text: 'text-avatar-6-fg' },
  { bg: 'bg-avatar-7-bg', text: 'text-avatar-7-fg' },
] as const;

export type AvatarScheme = (typeof AVATAR_SCHEMES)[number];

/** Erste zwei Buchstaben des Vornamens, wie im Entwurf. */
export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return (parts[0] ?? '').slice(0, 2).toUpperCase();
  }
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** Stabile Streuung über die Palette — gleiche Id, gleiche Farbe. */
export function avatarScheme(personId: string): AvatarScheme {
  let hash = 0;
  for (let i = 0; i < personId.length; i += 1) {
    hash = (hash * 31 + personId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AVATAR_SCHEMES.length;
  return AVATAR_SCHEMES[index] ?? AVATAR_SCHEMES[0];
}

/** „Du" statt des eigenen Namens — der Ton der App ist persönlich. */
export function displayName(
  person: PersonRef | null | undefined,
  meId: string | undefined,
): string {
  if (!person) return '';
  return person.id === meId ? 'Du' : person.name;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * „Antonia und Reini" — eine Aufzählung, wie man sie sagen würde.
 *
 * Vornamen, weil die Gruppe neun Leute groß ist und niemand dort mit Nachnamen
 * angesprochen wird. Das letzte Komma wird zu einem „und": „Antonia, Reini und
 * Lena" liest sich als Satz, „Antonia, Reini, Lena" als Liste.
 */
export function namesOf(people: readonly PersonRef[]): string {
  const names = people.map((person) => firstName(person.name));
  if (names.length <= 1) return names[0] ?? '';

  return `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`;
}
