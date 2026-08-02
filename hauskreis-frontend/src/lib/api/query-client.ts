import { QueryClient } from '@tanstack/react-query';
import { ApiError, NetworkError, TimeoutError } from './errors';
import { STALE } from './cache';

/**
 * Ein `429` bedeutet 300 Aufrufe in der letzten Minute — dann hilft nur
 * warten, nicht drängeln. Andere 4xx sind Aussagen über die Anfrage selbst
 * und werden durch Wiederholen nicht wahrer.
 *
 * Zeitüberschreitungen und abgerissene Verbindungen dagegen schon: unter WSL
 * ist genau das der Alltag, und beim zweiten Anlauf klappt es meistens.
 */
function shouldRetry(failureCount: number, error: Error): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof TimeoutError) return true;
  if (error instanceof NetworkError) return true;
  if (error instanceof ApiError) return error.status >= 500;
  return false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE.list,
        gcTime: 30 * 60 * 1000,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
