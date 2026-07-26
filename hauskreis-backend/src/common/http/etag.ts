/**
 * ETag handling for conditional requests.
 *
 * Reads (`If-None-Match` → 304) already work: Express hashes the response body
 * and answers conditional GETs on its own. What it does not do is honour
 * `If-Match` on writes, so two clients editing the same meeting silently
 * overwrite each other.
 *
 * To close that, every mutable entity carries a `version` counter and its ETag
 * is derived from it. The same value round-trips: a client reads it from the
 * `ETag` header and sends it back as `If-Match` when it writes.
 */

/** Entity ETags are weak — they identify a revision, not a byte-exact body. */
export function formatEtag(version: number): string {
  return `W/"${version}"`;
}

/** Extracts the version from `W/"3"` or `"3"`. Undefined if it isn't ours. */
export function parseEtagVersion(tag: string): number | undefined {
  const match = /^(?:W\/)?"(\d+)"$/.exec(tag.trim());
  if (!match) {
    return undefined;
  }

  const version = Number(match[1]);
  return Number.isSafeInteger(version) ? version : undefined;
}

export type IfMatchCondition =
  /** `If-Match: *` — the resource must exist, any revision will do. */
  { kind: 'any' } | { kind: 'versions'; versions: number[] };

/**
 * Parses an `If-Match` header.
 *
 * Returns undefined when the header is absent, which callers treat as
 * "no precondition". A header that is present but contains no ETag we
 * recognise yields an empty version list, so the precondition can never
 * accidentally succeed.
 */
export function parseIfMatch(
  header: string | undefined,
): IfMatchCondition | undefined {
  if (header === undefined) {
    return undefined;
  }

  const trimmed = header.trim();
  if (trimmed === '') {
    return undefined;
  }

  if (trimmed === '*') {
    return { kind: 'any' };
  }

  const versions = trimmed
    .split(',')
    .map((tag) => parseEtagVersion(tag))
    .filter((version): version is number => version !== undefined);

  return { kind: 'versions', versions };
}

/**
 * Turns a precondition into a Prisma `where` fragment, so the version check
 * happens inside the UPDATE itself rather than as a separate read. That is what
 * makes it safe against two writers racing between check and write.
 */
export function versionWhere(condition: IfMatchCondition | undefined): {
  version?: { in: number[] };
} {
  if (condition === undefined || condition.kind === 'any') {
    return {};
  }

  return { version: { in: condition.versions } };
}
