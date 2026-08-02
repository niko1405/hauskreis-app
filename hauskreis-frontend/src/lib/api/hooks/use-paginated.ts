'use client';

/**
 * Nachladen statt Alles-auf-einmal. Die Hülle jeder paginierten Liste trägt
 * `hasMore` mit — daran wird verzweigt, statt `skip + take < total` selbst
 * auszurechnen (die klassische Stelle für Off-by-one-Fehler, §5).
 */
import {
  useInfiniteQuery,
  type QueryKey,
  type UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { PAGE_SIZE } from '../params';
import type { Page } from '../types';

export interface InfiniteListArgs<T> {
  queryKey: QueryKey;
  fetchPage: (args: {
    skip: number;
    take: number;
    signal: AbortSignal;
  }) => Promise<Page<T>>;
  take?: number;
  enabled?: boolean;
  staleTime?: number;
}

export function useInfiniteList<T>({
  queryKey,
  fetchPage,
  take = PAGE_SIZE,
  enabled = true,
  staleTime,
}: InfiniteListArgs<T>) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      fetchPage({ skip: pageParam, take, signal }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.skip + lastPage.take : undefined,
    enabled,
    staleTime,
  } satisfies UseInfiniteQueryOptions<
    Page<T>,
    Error,
    unknown,
    QueryKey,
    number
  >);

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    ...query,
    items,
    /** Gesamtzahl aller Treffer des Filters, unabhängig von `take`/`skip`. */
    total: query.data?.pages[0]?.total ?? 0,
  };
}
