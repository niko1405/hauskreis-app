'use client';

/**
 * Welcher Hauskreis gerade offen ist.
 *
 * Die Id steckt in fast jedem Pfad, aber nicht in der Adresszeile: in der
 * Praxis gibt es eine Gruppe, und URLs mit einer UUID darin sind für die
 * Leute, die sie sich schicken, unlesbar. Sie kommt deshalb aus dem Kontext.
 */
import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { STALE } from '../api/cache';
import { coreApi } from '../api/endpoints';
import { qk } from '../api/query-keys';
import type { Hauskreis } from '../api/types';
import { useApiReady } from '../auth/auth-bridge';

const STORAGE_KEY = 'hauskreis:selected-id';

interface HauskreisContextValue {
  hauskreisId: string | undefined;
  hauskreis: Hauskreis | undefined;
  available: Hauskreis[];
  select: (id: string) => void;
  isLoading: boolean;
  error: Error | null;
}

const HauskreisContext = createContext<HauskreisContextValue | null>(null);

export function HauskreisProvider({ children }: { children: React.ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const ready = useApiReady();

  // Dieser Provider liegt über dem AuthGate und würde sonst schon beim ersten
  // Rendern abfragen — also bevor die OIDC-Sitzung wiederhergestellt ist.
  const query = useQuery({
    queryKey: qk.hauskreise,
    queryFn: ({ signal }) => coreApi.listHauskreise(signal),
    enabled: ready,
    staleTime: STALE.reference,
  });

  const available = useMemo(() => query.data ?? [], [query.data]);

  // Erst nach dem Laden entscheiden: gemerkte Wahl, sonst der einzige
  // vorhandene Hauskreis.
  useEffect(() => {
    if (available.length === 0) return;
    setSelectedId((current) => {
      if (current && available.some((h) => h.id === current)) return current;
      const remembered = window.localStorage.getItem(STORAGE_KEY);
      if (remembered && available.some((h) => h.id === remembered)) {
        return remembered;
      }
      return available[0]?.id;
    });
  }, [available]);

  const select = useCallback((id: string) => {
    window.localStorage.setItem(STORAGE_KEY, id);
    setSelectedId(id);
  }, []);

  const value = useMemo<HauskreisContextValue>(
    () => ({
      hauskreisId: selectedId,
      hauskreis: available.find((h) => h.id === selectedId),
      available,
      select,
      // Vor dem Token ist „noch nichts geladen" kein Fehler, sondern warten.
      isLoading: !ready || query.isLoading,
      error: query.error,
    }),
    [selectedId, available, select, ready, query.isLoading, query.error],
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
