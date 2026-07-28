import { z } from 'zod';

/**
 * Offset paging. Cursor paging would survive concurrent inserts better, but
 * these lists are short and mostly historical, and an archive wants to jump to
 * a page rather than walk to it.
 */
export const paginationSchema = z.object({
  take: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).default(0),
});

export interface PageQuery {
  take: number;
  skip: number;
}

export interface Page<T> {
  items: T[];
  /** Rows matching the filter, ignoring `take`/`skip`. */
  total: number;
  take: number;
  skip: number;
  /**
   * Derivable from the rest, but returned anyway: it is the thing callers
   * branch on, and computing it by hand is where off-by-one bugs live.
   */
  hasMore: boolean;
}

export function toPage<T>(
  items: T[],
  total: number,
  query: PageQuery,
): Page<T> {
  return {
    items,
    total,
    take: query.take,
    skip: query.skip,
    hasMore: query.skip + items.length < total,
  };
}
