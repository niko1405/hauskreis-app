/**
 * Was ein Ort ist — und was man mit ihm darf.
 *
 * Seit Orte über ihre Anschrift erkannt werden, gibt es zwei Sorten, und der
 * Unterschied entscheidet über fast jede Bedienung: ein **Zuhause** gehört
 * Menschen, heißt nach ihnen und wird über deren Profil verwaltet; ein
 * **Treffpunkt** gehört niemandem und darf frei bearbeitet werden.
 */
import type { Location } from './api/types';

/** Das Zuhause von jemandem — Name abgeleitet, nicht getippt. */
export function isHome(location: Location): boolean {
  return location.requiresHost;
}

/** Namen der Bewohner:innen, zum Vorlesen: „Niko & Chris". */
export function residentNames(location: Location): string {
  const names = location.residents.map((person) => person.name);

  if (names.length <= 1) {
    return names[0] ?? '';
  }

  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/**
 * Ob dieser Ort für einen Termin ohne Gastgeber in Frage kommt.
 *
 * Ein Zuhause kommt über seinen Host an den Termin, nie über die Ortsauswahl —
 * sonst stünde dort „Bei Niko", während Chris als Gastgeber eingetragen ist.
 */
export function isSelectableWithoutHost(location: Location): boolean {
  return location.active && !location.requiresHost;
}
