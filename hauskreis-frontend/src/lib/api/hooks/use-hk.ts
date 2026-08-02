'use client';

import { useMemo } from 'react';
import { useHauskreisId } from '../../hauskreis/hauskreis-context';
import { derivedViewKeys, qk } from '../query-keys';

/**
 * Der gemeinsame Vorspann jedes Domänen-Hooks: die Id, ob schon abgefragt
 * werden darf, und die zugehörigen Query-Keys.
 */
export function useHk() {
  const id = useHauskreisId();
  const hauskreisId = id ?? '';

  return useMemo(
    () => ({
      hauskreisId,
      /** Solange kein Hauskreis feststeht, wird nichts geladen. */
      enabled: Boolean(id),
      keys: qk.hk(hauskreisId),
      /** Home, Mehrwochen-Tabelle und Archiv hängen an fast jeder Änderung. */
      derived: derivedViewKeys(hauskreisId),
    }),
    [id, hauskreisId],
  );
}
