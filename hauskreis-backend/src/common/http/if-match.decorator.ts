import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { parseIfMatch, type IfMatchCondition } from './etag';

/**
 * Reads the `If-Match` precondition off the request.
 *
 * Undefined when the client sent no header — writes then proceed unconditionally,
 * so existing callers keep working. Send the ETag from a previous GET to get
 * optimistic locking; a stale value fails with 412 instead of silently
 * overwriting someone else's edit.
 *
 * The value bypasses the global Zod pipe because it is a custom-decorator
 * argument; see `common/pipes/zod-validation.pipe.ts`.
 */
export const IfMatch = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IfMatchCondition | undefined => {
    const request = context.switchToHttp().getRequest<Request>();
    return parseIfMatch(request.headers['if-match']);
  },
);
