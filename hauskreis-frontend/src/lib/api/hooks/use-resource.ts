'use client';

/**
 * Die zwei Bausteine, auf denen jedes Lesen und Schreiben einer
 * Einzelressource aufsetzt.
 *
 * Der ETag lebt dabei **im Query-Cache**, direkt neben den Daten, zu denen er
 * gehört. Eine globale Map wäre die naheliegendere Lösung und die falsche:
 * sie überlebt Invalidierungen, verwechselt Ansichten und liefert am Ende
 * einen ETag zu Daten, die längst andere sind.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import type { Resource } from '../client';
import { errorMessage, StaleResourceError } from '../errors';
import {
  applyOptimistic,
  type OptimisticContext,
  type OptimisticUpdate,
} from './use-optimistic';

type ResourceFetcher<T> = (args: {
  previous: Resource<T> | undefined;
  signal: AbortSignal;
}) => Promise<Resource<T>>;

/**
 * Lädt eine Einzelressource samt ETag. Ist bereits ein Stand im Cache, geht
 * dessen ETag als `If-None-Match` mit — der Server antwortet dann `304` und
 * es wird nichts übertragen.
 */
export function useResource<T>(
  queryKey: QueryKey,
  fetcher: ResourceFetcher<T>,
  options?: Omit<
    UseQueryOptions<Resource<T>, Error, Resource<T>, QueryKey>,
    'queryKey' | 'queryFn'
  >,
) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      fetcher({
        previous: queryClient.getQueryData<Resource<T>>(queryKey),
        signal,
      }),
    ...options,
  });
}

export interface ResourceUpdateArgs<T, TInput> {
  /** Der Key, unter dem die Ressource samt ETag liegt. */
  queryKey: QueryKey;
  /** Der eigentliche Aufruf. Bekommt den ETag aus dem Cache gereicht. */
  update: (input: TInput, etag: string | undefined) => Promise<Resource<T>>;
  /** Was sich durch die Änderung sonst noch ändert (Listen, Home, Archiv). */
  invalidateKeys?: readonly QueryKey[];
  onSuccess?: (resource: Resource<T>, input: TInput) => void;
}

/**
 * Schreibt eine Einzelressource und behandelt den Konfliktfall.
 *
 * Bei `412` wird **nicht** stillschweigend erneut versucht: der Server sagt
 * damit, dass jemand anders in der Zwischenzeit gespeichert hat. Der Hook
 * lädt den fremden Stand nach und meldet `conflict` — anzuzeigen ist das
 * Sache des Aufrufers (`ConflictBanner`).
 */
export function useResourceUpdate<T, TInput>({
  queryKey,
  update,
  invalidateKeys = [],
  onSuccess,
}: ResourceUpdateArgs<T, TInput>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [conflict, setConflict] = useState(false);

  const mutation = useMutation<Resource<T>, Error, TInput>({
    mutationFn: async (input) => {
      const current = queryClient.getQueryData<Resource<T>>(queryKey);
      if (!current) {
        // Schreiben ohne vorheriges Lesen kann es nicht geben — ohne ETag
        // antwortet der Server ohnehin mit 428.
        throw new Error(
          `Kein geladener Stand für ${JSON.stringify(queryKey)} — vor dem Speichern lesen.`,
        );
      }
      return update(input, current.etag);
    },
    onMutate: () => {
      setConflict(false);
    },
    onSuccess: (resource, input) => {
      queryClient.setQueryData(queryKey, resource);
      for (const key of invalidateKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      onSuccess?.(resource, input);
    },
    onError: (error) => {
      if (error instanceof StaleResourceError) {
        setConflict(true);
        void queryClient.invalidateQueries({ queryKey });
        // Kein Toast: der `ConflictBanner` bleibt stehen und sagt dasselbe
        // ausführlicher. Zwei Meldungen über dieselbe Sache sind eine zu viel.
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  const dismissConflict = useCallback(() => setConflict(false), []);

  return { ...mutation, conflict, dismissConflict };
}

/**
 * Für Schreibvorgänge ohne Vorbedingung (Anwesenheit, Song-Leiter, Lieder
 * eines Termins, Benachrichtigungs-Einstellungen) sowie für `POST`/`DELETE`.
 *
 * Fehler melden sich hier von selbst. Vorher hing das an jeder Aufrufstelle
 * einzeln, und zwei davon hatten es schlicht vergessen — ein fehlgeschlagener
 * Tipper blieb dort stumm. `silent` ist für die Fälle da, in denen der
 * Aufrufer etwas Besseres anzuzeigen hat als einen Toast.
 */
export function useApiMutation<TData, TInput>(
  mutationFn: (input: TInput) => Promise<TData>,
  options: {
    invalidateKeys?: readonly QueryKey[];
    /** Greift der Oberfläche vor; siehe `use-optimistic.ts`. */
    optimistic?: OptimisticUpdate<TInput>;
    silent?: boolean;
  } & Omit<
    UseMutationOptions<TData, Error, TInput, OptimisticContext>,
    'mutationFn' | 'onMutate'
  > = {},
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    invalidateKeys = [],
    optimistic,
    silent = false,
    onSuccess,
    onError,
    ...rest
  } = options;

  type Options = UseMutationOptions<TData, Error, TInput, OptimisticContext>;
  type SuccessArgs = Parameters<NonNullable<Options['onSuccess']>>;
  type ErrorArgs = Parameters<NonNullable<Options['onError']>>;

  return useMutation<TData, Error, TInput, OptimisticContext>({
    mutationFn,
    onMutate: optimistic
      ? (input) => applyOptimistic(queryClient, input, optimistic)
      : undefined,
    onSuccess: (...args: SuccessArgs) => {
      for (const key of invalidateKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      onSuccess?.(...args);
    },
    onError: (...args: ErrorArgs) => {
      const [error, , context] = args;
      context?.rollback();
      if (!silent) toast.error(errorMessage(error));
      onError?.(...args);
    },
    ...rest,
  });
}
