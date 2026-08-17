/**
 * `/releases` — was es Neues in der App gibt.
 *
 * Nicht Hauskreis-bezogen: Die App ist für alle dieselbe. Die Liste kommt aus
 * dem Quelltext des Backends (`src/release/releases.ts`) und ändert sich nur
 * mit einem Deploy.
 */
import { apiGet } from '../client';
import type { Release } from '../types';

export function listReleases(signal?: AbortSignal): Promise<Release[]> {
  return apiGet<Release[]>('/releases', { signal });
}
