import {
  HttpException,
  HttpStatus,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import type { IfMatchCondition } from './etag';
import { versionWhere } from './etag';

/**
 * 428 Precondition Required — NestJS has the status but no exception class.
 *
 * Sent when a write on a versioned entity arrives without `If-Match`. Making
 * the header mandatory is the point: an optional precondition only protects
 * callers who remember it, and a forgotten header would silently reintroduce
 * lost updates.
 */
export class PreconditionRequiredException extends HttpException {
  constructor() {
    super(
      'This endpoint requires an If-Match header. Read the resource first and send back its ETag.',
      HttpStatus.PRECONDITION_REQUIRED,
    );
  }
}

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
  /**
   * Set to false only for an endpoint where a conflict genuinely cannot cause
   * harm. Leaving it on is what keeps the guarantee worth having.
   */
  requireIfMatch?: boolean;
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
  if (params.condition === undefined && params.requireIfMatch !== false) {
    throw new PreconditionRequiredException();
  }

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
