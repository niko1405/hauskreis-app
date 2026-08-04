'use client';

/**
 * Welcher Hauskreis gerade offen ist.
 *
 * Die Id steckt in fast jedem Pfad, aber nicht in der Adresszeile: in der
 * Praxis gibt es eine Gruppe, und URLs mit einer UUID darin sind für die
 * Leute, die sie sich schicken, unlesbar. Sie kommt deshalb aus dem Kontext.
 *
 * **Es gibt nichts auszuwählen.** Ein Mensch gehört zu genau einem Hauskreis;
 * ein Wechsel ist ein Umzug. Vorher stand hier eine Auswahl aus
 * `GET /api/hauskreise` mit `available[0]` als Vorgabe — die Route gab damals
 * *alle* Gruppen heraus, und die Wahl merkte sich der `localStorage` bis in die
 * nächste Sitzung und damit ins nächste Konto. Beides ist weg: die Id steht in
 * `me.hauskreisId`, und mehr braucht es nicht.
 */
import { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '../api/cache';
import { coreApi } from '../api/endpoints';
import { qk } from '../api/query-keys';
import { useMe } from '../api/hooks/use-me';
import type { Hauskreis } from '../api/types';

interface HauskreisContextValue {
  hauskreisId: string | undefined;
  hauskreis: Hauskreis | undefined;
  isLoading: boolean;
  error: Error | null;
}

const HauskreisContext = createContext<HauskreisContextValue | null>(null);

export function HauskreisProvider({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const hauskreisId = me.me?.hauskreisId;

  // Nur für den Namen — die Id steht schon fest. `enabled` hält die Abfrage
  // zurück, bis es überhaupt einen Hauskreis gibt.
  const query = useQuery({
    queryKey: qk.hauskreise,
    queryFn: ({ signal }) => coreApi.listHauskreise(signal),
    enabled: Boolean(hauskreisId),
    staleTime: STALE.reference,
  });

  const value = useMemo<HauskreisContextValue>(
    () => ({
      hauskreisId,
      hauskreis: (query.data ?? []).find((h) => h.id === hauskreisId),
      // `me` ist die Quelle der Id; solange es lädt, ist „noch keine Id" kein
      // Fehler, sondern warten.
      isLoading: me.isLoading,
      error: query.error,
    }),
    [hauskreisId, query.data, query.error, me.isLoading],
  );

  return (
    <HauskreisContext.Provider value={value}>
      {children}
    </HauskreisContext.Provider>
  );
}

export function useHauskreis(): HauskreisContextValue {
  const value = useContext(HauskreisContext);
  if (!value) {
    throw new Error('useHauskreis außerhalb des HauskreisProvider benutzt');
  }
  return value;
}

/**
 * Die Id für Datenabfragen. Solange sie noch nicht feststeht, ist sie
 * `undefined` — die Hooks schalten sich dann selbst ab (`enabled`).
 */
export function useHauskreisId(): string | undefined {
  return useHauskreis().hauskreisId;
}

/**
 * Für Stellen, die ohne Id nicht sinnvoll sind (etwa innerhalb einer Seite,
 * die erst nach dem Laden gerendert wird).
 */
export function useRequiredHauskreisId(): string {
  const id = useHauskreisId();
  if (!id) throw new Error('Noch kein Hauskreis gewählt');
  return id;
}
