import { NotFoundException, PreconditionFailedException } from '@nestjs/common';
import type { IfMatchCondition } from './etag';
import { versionWhere } from './etag';

/**
 * Runs an update guarded by an `If-Match` precondition.
 *
 * The version check lives in the UPDATE's own WHERE clause, so it is atomic —
 * checking first and writing afterwards would leave a window for a second
 * writer to slip in between.
 *
 * `updateMany` reports how many rows it touched. Zero means the row either no
 * longer exists (404) or someone else has written to it since the caller read
 * it (412), so we look once more to tell those apart.
 *
 * Every module should mutate versioned entities through this helper, so the
 * semantics stay identical across endpoints.
 */
export async function updateWithVersionCheck<T>(params: {
  condition: IfMatchCondition | undefined;
  /** Applies the update, scoped by the extra version constraint. */
  update: (versionConstraint: {
    version?: { in: number[] };
  }) => Promise<{ count: number }>;
  /** Loads the entity regardless of version, used to classify a miss. */
  exists: () => Promise<unknown | null>;
  /** Reads the updated entity for the response. */
  reload: () => Promise<T>;
  notFoundMessage: string;
}): Promise<T> {
  const { count } = await params.update(versionWhere(params.condition));

  if (count === 0) {
    const current = await params.exists();

    if (!current) {
      throw new NotFoundException(params.notFoundMessage);
    }

    throw new PreconditionFailedException(
      'The resource was modified by someone else. Fetch it again and retry with the current ETag.',
    );
  }

  return params.reload();
}
